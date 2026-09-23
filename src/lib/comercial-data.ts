import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { asyncBufferFromFile, parquetReadObjects } from "hyparquet";
import { compressors } from "hyparquet-compressors";

export const MAPA_SUPERVISORES: Record<string, string> = {
  "9902": "Centro Oeste",
  "9907": "SUL",
  "9914": "Norte / Nordeste",
  "9915": "REM",
  "9916": "SPC",
  "9917": "SPI",
  "9918": "MT/MS",
  "9919": "RN",
  "9920": "B2B",
};

export function cleanCode(v: any) {
  const s = String(v ?? "").trim();
  return s.replace(/\.0+$/, "");
}

export function norm(v: any) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

const NOME_PARA_COD = Object.fromEntries(
  Object.entries(MAPA_SUPERVISORES).map(([c, n]) => [norm(n), c])
);

const DATA_DIR = path.join(process.cwd(), "data");

// IMPORTANTE: URL pura, sem sintaxe Markdown [ ]( )
const GITHUB_RAW =
  "https://raw.githubusercontent.com/carlinhosg7/rota_certa/master";

// Somente os Parquets usam cache físico técnico para leitura pelo hyparquet.
// Os dois arquivos Excel são lidos DIRETAMENTE do GitHub em memória.
const BASES_GITHUB = [
  "DADOS_PREDITIVA_1.parquet",
  "DADOS_PREDITIVA_2.parquet",
  "DADOS_PREDITIVA_3.parquet",
  "DADOS_PREDITIVA_4.parquet",
  "DADOS_PREDITIVA_5.parquet",
  "DADOS_PREDITIVA_6.parquet",
];

type Carteira = {
  codigo: string;
  razao: string;
  rep: string;
  sup: string;
  cidade: string;
  uf: string;
  cityKey: string;
  limite: number;
  bloqueio: string;
};

export type Venda = {
  codigo: string;
  rep: string;
  sup: string;
  data: Date | null;
  qtd: number;
  vlr: number;
  codigoLinha: string;
  linha: string;
  referencia: string;
  numeroPedido: string;
  tipoPedido: string;
  prazoMedio: number;
};

type ClienteResumo = Carteira & {
  ultimaCompra: Date | null;
  qtdAno: number;
  qtdMaio: number;
  vlrHistorico: number;
  diasSemCompra: number;
  status: string;
  prioridade: number;
};

type Cache = {
  carteira: Carteira[];
  vendas: Venda[];
  loadedAt: number;
};

let cachePromise: Promise<Cache> | null = null;

export function cleanSupervisor(v: any) {
  const s = cleanCode(v);
  if (!s) return "";
  if (MAPA_SUPERVISORES[s]) return s;
  return NOME_PARA_COD[norm(s)] || s;
}

function number(v: any) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  const raw = String(v ?? "").trim();
  if (!raw) return 0;

  // Trata valores BR e valores numéricos simples.
  let s = raw.replace(/R\$/gi, "").replace(/\s/g, "");

  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function date(v: any): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function findHeader(rows: any[][], required: string[]) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const n = rows[i].map(norm);
    if (required.every((r) => n.includes(norm(r)))) return i;
  }
  return -1;
}

function get(row: Record<string, any>, names: string[]) {
  for (const n of names) {
    const k = Object.keys(row).find((x) => norm(x) === norm(n));
    if (k) return row[k];
  }
  return undefined;
}

function githubUrl(nome: string) {
  return `${GITHUB_RAW}/${nome
    .split("/")
    .map((parte) => encodeURIComponent(parte))
    .join("/")}`;
}

async function garantirArquivo(nome: string) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const destino = path.join(DATA_DIR, nome);

  // Reutiliza cache físico válido.
  if (fs.existsSync(destino)) {
    try {
      if (fs.statSync(destino).size > 0) return destino;
    } catch {
      // Se o arquivo estiver inválido/inacessível, tenta baixá-lo novamente.
    }
  }

  const url = githubUrl(nome);
  console.log(`[BASE] Baixando ${nome}...`);

  const r = await fetch(url, { cache: "no-store" });

  if (!r.ok) {
    throw new Error(
      `Falha ao baixar ${nome} do GitHub: HTTP ${r.status} - ${url}`
    );
  }

  const buffer = Buffer.from(await r.arrayBuffer());

  if (!buffer.length) {
    throw new Error(`O GitHub retornou ${nome} vazio.`);
  }

  fs.writeFileSync(destino, buffer);

  console.log(
    `[BASE] ${nome} salvo em cache (${buffer.length.toLocaleString("pt-BR")} bytes)`
  );

  return destino;
}

async function prepararBasesGitHub() {
  // Sequencial para não disparar simultaneamente o download de vários arquivos grandes.
  for (const nome of BASES_GITHUB) {
    await garantirArquivo(nome);
  }
}

/**
 * CARTEIRA:
 * Lida diretamente do GitHub em memória.
 * Não depende mais de D:\...\data\base clientes.xlsx.
 */
async function carregarCarteiraBase(): Promise<Carteira[]> {
  const nome = "base clientes.xlsx";
  const url = githubUrl(nome);

  console.log(`[CARTEIRA] Baixando ${nome} diretamente do GitHub...`);

  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      `Erro ao baixar ${nome} do GitHub: HTTP ${response.status} - ${url}`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (!buffer.length) {
    throw new Error(`${nome} foi baixado, mas está vazio.`);
  }

  console.log(
    `[CARTEIRA] ${nome} recebido (${buffer.length.toLocaleString("pt-BR")} bytes)`
  );

  let wb: XLSX.WorkBook;

  try {
    wb = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
    });
  } catch (e: any) {
    throw new Error(
      `Não foi possível abrir ${nome} recebido do GitHub: ${
        e?.message || String(e)
      }`
    );
  }

  let rows: any[][] = [];

  for (const sn of wb.SheetNames) {
    const a = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sn], {
      header: 1,
      defval: null,
      raw: true,
    });

    const h = findHeader(a, [
      "Codigo Cliente",
      "Cidade",
      "Uf",
      "Codigo Representante",
    ]);

    if (h >= 0) {
      rows = a.slice(h);
      break;
    }
  }

  if (!rows.length) {
    throw new Error(
      "Não localizei na base clientes.xlsx as colunas: Codigo Cliente, Cidade, Uf e Codigo Representante."
    );
  }

  const headers = rows[0].map((x) => String(x ?? ""));
  const out: Carteira[] = [];

  for (const arr of rows.slice(1)) {
    const rr = Object.fromEntries(
      headers.map((h, i) => [h, arr[i]])
    ) as Record<string, any>;

    const codigo = cleanCode(get(rr, ["Codigo Cliente"]));
    const rep = cleanCode(get(rr, ["Codigo Representante"]));
    const cidade = String(get(rr, ["Cidade"]) ?? "").trim();
    const uf = String(get(rr, ["Uf", "UF"]) ?? "")
      .trim()
      .toUpperCase();

    if (!codigo || !rep || !cidade || !uf) continue;

    out.push({
      codigo,
      razao: String(
        get(rr, ["Razao Social", "Razão Social"]) ?? ""
      ).trim(),
      rep,
      sup: cleanSupervisor(
        get(rr, ["Codigo Supervisor", "Supervisor"])
      ),
      cidade,
      uf,
      cityKey: `${norm(cidade)} - ${uf}`,
      limite: 0,
      bloqueio: "",
    });
  }

  const by = new Map<string, Carteira>();

  out.forEach((x) => {
    by.set(`${x.codigo}|${x.rep}`, x);
  });

  console.log(
    `[CARTEIRA] ${by.size.toLocaleString("pt-BR")} registros válidos carregados.`
  );

  return [...by.values()];
}

async function carregarFinanceiro() {
  const nome = "DADOS PRDITIVA LIMITE.xlsx";
  const url = githubUrl(nome);
  const m = new Map<string, { limite: number; bloqueio: string }>();

  console.log(`[FINANCEIRO] Baixando ${nome} diretamente do GitHub...`);

  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      `Erro ao baixar ${nome} do GitHub: HTTP ${response.status} - ${url}`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (!buffer.length) {
    throw new Error(`${nome} foi baixado, mas está vazio.`);
  }

  console.log(
    `[FINANCEIRO] ${nome} recebido (${buffer.length.toLocaleString("pt-BR")} bytes)`
  );

  let wb: XLSX.WorkBook;

  try {
    wb = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
    });
  } catch (e: any) {
    throw new Error(
      `Não foi possível abrir ${nome} recebido do GitHub: ${
        e?.message || String(e)
      }`
    );
  }

  const ws = wb.Sheets[wb.SheetNames[0]];

  if (!ws) {
    throw new Error(`${nome} não possui uma planilha válida.`);
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
    defval: null,
  });

  for (const r of rows) {
    const c = cleanCode(get(r, ["Codigo Cliente"]));
    if (!c) continue;

    const lim = number(
      get(r, ["Limite Disponivel", "Limite", "Limite Disponível"])
    );

    const raw = norm(
      get(r, ["Bloqueado Financeiro", "Bloqueio Financeiro"])
    );

    const bloqueio =
      raw === "SIM" || raw === "S" || raw === "BLOQUEADO"
        ? "🔴 Bloqueado"
        : raw === "NAO" ||
          raw === "NÃO" ||
          raw === "N" ||
          raw === "LIBERADO"
        ? "🟢 Liberado"
        : String(
            get(r, ["Bloqueado Financeiro", "Bloqueio Financeiro"]) ?? ""
          );

    const prev = m.get(c);

    m.set(c, {
      limite: Math.max(prev?.limite ?? 0, lim),
      bloqueio: bloqueio || prev?.bloqueio || "",
    });
  }

  console.log(
    `[FINANCEIRO] ${m.size.toLocaleString("pt-BR")} clientes financeiros carregados.`
  );

  return m;
}

async function carregarVendas(): Promise<Venda[]> {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => /^DADOS_PREDITIVA_\d+\.parquet$/i.test(f))
    .sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );

  if (!files.length) {
    throw new Error(
      "Nenhum DADOS_PREDITIVA_*.parquet encontrado em /data"
    );
  }

  const out: Venda[] = [];
  const wanted = [
    "Codigo Cliente",
    "Codigo Representante",
    "Codigo Supervisor",
    "Data Cadastro",
    "Codigo Linha",
    "Linha",
    "Referencia",
    "Numero Pedido",
    "Tipo Pedido",
    "Prazo Medio",
    "Qtd Venda",
    "Vlr Venda",
  ];

  for (const f of files) {
    const arquivo = path.join(DATA_DIR, f);
    console.log(`[VENDAS] Lendo ${f} com hyparquet...`);

    // Validação rápida para detectar arquivo incompleto/corrompido antes do parser.
    const stat = fs.statSync(arquivo);
    if (stat.size < 8) {
      throw new Error(`${f} está vazio ou incompleto.`);
    }

    const fd = fs.openSync(arquivo, "r");
    try {
      const inicio = Buffer.alloc(4);
      const fim = Buffer.alloc(4);
      fs.readSync(fd, inicio, 0, 4, 0);
      fs.readSync(fd, fim, 0, 4, stat.size - 4);

      if (inicio.toString("ascii") !== "PAR1" || fim.toString("ascii") !== "PAR1") {
        throw new Error(`${f} não possui assinatura PAR1 válida.`);
      }
    } finally {
      fs.closeSync(fd);
    }

    try {
      const file = await asyncBufferFromFile(arquivo);

      const rows = await parquetReadObjects({
        file,
        columns: wanted,
        compressors,
      });

      console.log(
        `[VENDAS] ${f}: ${rows.length.toLocaleString("pt-BR")} linhas lidas.`
      );

      for (const r of rows as Record<string, any>[]) {
        const codigo = cleanCode(r["Codigo Cliente"]);
        const rep = cleanCode(r["Codigo Representante"]);
        const sup = cleanSupervisor(r["Codigo Supervisor"]);
        const d = date(r["Data Cadastro"]);

        if (!codigo || !rep || !d) continue;

        out.push({
          codigo,
          rep,
          sup,
          data: d,
          qtd: number(r["Qtd Venda"]),
          vlr: number(r["Vlr Venda"]),
          codigoLinha: cleanCode(r["Codigo Linha"]),
          linha: String(r["Linha"] ?? "").trim(),
          referencia: cleanCode(r["Referencia"]),
          numeroPedido: cleanCode(r["Numero Pedido"]),
          tipoPedido: String(r["Tipo Pedido"] ?? "").trim(),
          prazoMedio: number(r["Prazo Medio"]),
        });
      }
    } catch (e: any) {
      throw new Error(
        `Falha ao ler ${f} com hyparquet: ${e?.message || String(e)}`
      );
    }
  }

  console.log(
    `[VENDAS] ${out.length.toLocaleString("pt-BR")} registros carregados no total.`
  );

  return out;
}

export async function getData(): Promise<Cache> {
  if (!cachePromise) {
    cachePromise = (async () => {
      await prepararBasesGitHub();

      const [carteira, vendas, fin] = await Promise.all([
        carregarCarteiraBase(),
        carregarVendas(),
        carregarFinanceiro(),
      ]);

      const latest = new Map<
        string,
        { t: number; ord: number; sup: string }
      >();

      vendas.forEach((v, i) => {
        if (!v.data || !v.sup) return;

        const cur = latest.get(v.rep);
        const t = v.data.getTime();

        if (
          !cur ||
          t > cur.t ||
          (t === cur.t && i > cur.ord)
        ) {
          latest.set(v.rep, {
            t,
            ord: i,
            sup: v.sup,
          });
        }
      });

      for (const c of carteira) {
        c.sup =
          latest.get(c.rep)?.sup ||
          cleanSupervisor(c.sup);

        const f = fin.get(c.codigo);

        if (f) {
          c.limite = f.limite;
          c.bloqueio = f.bloqueio;
        }
      }

      return {
        carteira,
        vendas,
        loadedAt: Date.now(),
      };
    })().catch((erro) => {
      // Permite nova tentativa na próxima chamada se algum download/leitura falhar.
      cachePromise = null;
      throw erro;
    });
  }

  return cachePromise;
}

export function resumirClientes(
  carteira: Carteira[],
  vendas: Venda[]
): ClienteResumo[] {
  const now = new Date();

  const hoje = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const anoIni = new Date(
    hoje.getFullYear(),
    0,
    1
  );

  const maioIni = new Date(
    hoje.getFullYear(),
    4,
    1
  );

  const corte = new Date(2022, 0, 1);

  const agg = new Map<
    string,
    {
      ultima: Date | null;
      qAno: number;
      qMaio: number;
      vlr: number;
    }
  >();

  for (const v of vendas) {
    const a = agg.get(v.codigo) || {
      ultima: null,
      qAno: 0,
      qMaio: 0,
      vlr: 0,
    };

    if (
      v.data &&
      (!a.ultima || v.data > a.ultima)
    ) {
      a.ultima = v.data;
    }

    if (
      v.data &&
      v.data >= anoIni &&
      v.data <= hoje
    ) {
      a.qAno += v.qtd;
    }

    if (
      v.data &&
      v.data >= maioIni &&
      v.data <= hoje
    ) {
      a.qMaio += v.qtd;
    }

    a.vlr += v.vlr;

    agg.set(v.codigo, a);
  }

  const uniq = new Map<string, Carteira>();

  carteira.forEach((c) => {
    uniq.set(c.codigo, c);
  });

  const out: ClienteResumo[] = [];

  for (const c of uniq.values()) {
    const a = agg.get(c.codigo) || {
      ultima: null,
      qAno: 0,
      qMaio: 0,
      vlr: 0,
    };

    if (
      !a.ultima ||
      a.ultima < corte ||
      a.ultima > hoje
    ) {
      continue;
    }

    const dias = Math.floor(
      (hoje.getTime() - a.ultima.getTime()) /
        86400000
    );

    const status =
      a.qAno <= 0
        ? "🔴 NÃO POSITIVADO NO ANO"
        : a.qMaio <= 0
        ? "🟡 SEM COMPRA DESDE MAIO"
        : "🟢 ATIVO DESDE MAIO";

    out.push({
      ...c,
      ultimaCompra: a.ultima,
      qtdAno: a.qAno,
      qtdMaio: a.qMaio,
      vlrHistorico: a.vlr,
      diasSemCompra: dias,
      status,
      prioridade: status.startsWith("🔴")
        ? 3
        : status.startsWith("🟡")
        ? 2
        : 1,
    });
  }

  return out;
}

export function minmax(vals: number[]) {
  if (!vals.length) return [];

  const lo = Math.min(...vals);
  const hi = Math.max(...vals);

  if (hi === lo) return vals.map(() => 0);

  return vals.map(
    (v) => (v - lo) / (hi - lo)
  );
}
