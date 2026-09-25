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

export function cleanReferencia(v: any) {
  const s = cleanCode(v);
  if (!s) return "";
  return /^\d+$/.test(s) && s.length <= 7 ? s.padStart(7, "0") : s;
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

export type ReposicaoReferencia = {
  referencia: string;
  nome: string;
  ultimaCompra: Date;
  diasSemCompra: number;
  campanha: string | null;
};

type ClienteResumo = Carteira & {
  ultimaCompra: Date | null;
  qtdAno: number;
  qtdMaio: number;
  vlrHistorico: number;
  diasSemCompra: number;
  status: string;
  prioridade: number;
  reposicoes: ReposicaoReferencia[];
  qtdReposicoes: number;
  qtdReposicoesCampanha: number;
  temReposicao: boolean;
  temCampanhaReposicao: boolean;
};

export type ProdutoAutorizado = {
  codigoLinha: string;
  linha: string;
  referencia: string;
  produto: string;
  qtdVenda: number;
};

export type NomeReferencia = {
  codigoLinha: string;
  linha: string;
  referencia: string;
  nome: string;
};


export type MunicipioGeo = {
  municipio: string;
  uf: string;
  codigoIbge: string;
  lat: number;
  lon: number;
  cityKey: string;
};

export type CidadeRota = {
  cidade: string;
  uf: string;
  cityKey: string;

  lat: number;
  lon: number;

  // Distância da cidade-base: preserva compatibilidade com a API/tela atual.
  distanciaKm: number;

  // Sequência otimizada entre as cidades selecionadas.
  sequencia: number;
  distanciaAnteriorKm: number;
  distanciaAcumuladaKm: number;

  clientes: number;
  vermelhos: number;
  amarelos: number;
  verdes: number;
  clientesReposicao: number;
  referenciasReposicao: number;
  clientesCampanha: number;
  referenciasCampanha: number;
  diasSemCompraMedio: number;
  limiteTotal: number;
  score: number;

  // Métricas da rota completa. Repetidas em cada item para manter
  // compatibilidade com o retorno atual CidadeRota[].
  distanciaIdaKm: number;
  distanciaRetornoKm: number;
  distanciaTotalKm: number;
  totalClientes: number;
  totalVermelhos: number;
  totalAmarelos: number;
  totalVerdes: number;
  limiteTotalRota: number;
};

type Cache = {
  carteira: Carteira[];
  vendas: Venda[];
  produtosAutorizados: ProdutoAutorizado[];
  nomesReferencias: NomeReferencia[];
  municipios: MunicipioGeo[];
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


/**
 * PRODUTOS AUTORIZADOS:
 * A planilha fica no GitHub e funciona como whitelist comercial.
 * Uma referência só pode aparecer na sugestão se estiver nesta base.
 */
async function carregarProdutosAutorizados(): Promise<ProdutoAutorizado[]> {
  const nome = "DADOS PREDITIVA PRODUTOS EM LINHA.xlsx";
  const url = githubUrl(nome);

  console.log(`[PRODUTOS] Baixando ${nome} diretamente do GitHub...`);

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

  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });

  let rows: any[][] = [];

  for (const sn of wb.SheetNames) {
    const a = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sn], {
      header: 1,
      defval: null,
      raw: true,
    });

    const h = findHeader(a, ["Codigo Linha", "Linha", "Referencia", "Produto"]);

    if (h >= 0) {
      rows = a.slice(h);
      break;
    }
  }

  if (!rows.length) {
    throw new Error(
      `Não localizei o cabeçalho de produtos autorizados em ${nome}.`
    );
  }

  const headers = rows[0].map((x) => String(x ?? ""));
  const porChave = new Map<string, ProdutoAutorizado>();

  for (const arr of rows.slice(1)) {
    const r = Object.fromEntries(
      headers.map((h, i) => [h, arr[i]])
    ) as Record<string, any>;

    const codigoLinha = cleanCode(get(r, ["Codigo Linha"]));
    const linha = String(get(r, ["Linha"]) ?? "").trim();
    const referencia = cleanReferencia(get(r, ["Referencia"]));
    const produto = String(get(r, ["Produto"]) ?? "").trim();
    const qtdVenda = number(get(r, ["Qtd Venda"]));

    if (!referencia) continue;

    // A referência pode aparecer em várias cores. Mantemos cada SKU/descrição
    // para exibição, mas a autorização é controlada pela referência.
    const chave = `${referencia}|${norm(produto)}`;

    if (!porChave.has(chave)) {
      porChave.set(chave, {
        codigoLinha,
        linha,
        referencia,
        produto,
        qtdVenda,
      });
    }
  }

  const out = [...porChave.values()];

  console.log(
    `[PRODUTOS] ${out.length.toLocaleString("pt-BR")} produtos autorizados carregados.`
  );

  return out;
}


/**
 * NOME DAS REFERÊNCIAS:
 * Dicionário comercial por REFERÊNCIA exata.
 * A referência é a chave; Codigo Linha e Linha são apenas atributos.
 */
async function carregarNomesReferencias(): Promise<NomeReferencia[]> {
  const nomeArquivo = "NOME_REFERENCIAS.xlsx";
  const url = githubUrl(nomeArquivo);

  console.log(`[NOME REFERENCIAS] Baixando ${nomeArquivo} diretamente do GitHub...`);

  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(
      `Erro ao baixar ${nomeArquivo} do GitHub: HTTP ${response.status} - ${url}`
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error(`${nomeArquivo} foi baixado, mas está vazio.`);

  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  let rows: any[][] = [];

  for (const sn of wb.SheetNames) {
    const a = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sn], {
      header: 1,
      defval: null,
      raw: true,
    });

    const h = findHeader(a, ["Referencia", "Nome"]);
    if (h >= 0) {
      rows = a.slice(h);
      break;
    }
  }

  if (!rows.length) {
    throw new Error(
      `Não localizei as colunas Referencia e Nome em ${nomeArquivo}.`
    );
  }

  const headers = rows[0].map((x) => String(x ?? ""));
  const porReferencia = new Map<string, NomeReferencia>();

  for (const arr of rows.slice(1)) {
    const r = Object.fromEntries(
      headers.map((h, i) => [h, arr[i]])
    ) as Record<string, any>;

    const referencia = cleanReferencia(get(r, ["Referencia"]));
    if (!referencia) continue;

    porReferencia.set(referencia, {
      codigoLinha: cleanCode(get(r, ["Codigo Linha"])),
      linha: String(get(r, ["Linha"]) ?? "").trim(),
      referencia,
      nome: String(get(r, ["Nome"]) ?? "").trim(),
    });
  }

  const out = [...porReferencia.values()];
  console.log(
    `[NOME REFERENCIAS] ${out.length.toLocaleString("pt-BR")} referências classificadas.`
  );
  return out;
}


/**
 * MUNICÍPIOS:
 * Base geográfica oficial do projeto, lida diretamente do GitHub.
 * Esperado: municipio, uf, codigo_ibge, lat, lon
 */
async function carregarMunicipios(): Promise<MunicipioGeo[]> {
  const nome = "municipios_com_lat_lon.csv";
  const url = githubUrl(nome);

  console.log(`[GEO] Baixando ${nome} diretamente do GitHub...`);

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

  // Detecta separador e preserva acentos UTF-8.
  const conteudo = buffer.toString("utf8").replace(/^\uFEFF/, "");
  const primeiraLinha = conteudo.split(/\r?\n/, 1)[0] || "";
  const separador = primeiraLinha.includes(";") ? ";" : ",";

  const wb = XLSX.read(conteudo, {
    type: "string",
    raw: true,
    FS: separador,
  });

  const ws = wb.Sheets[wb.SheetNames[0]];

  if (!ws) {
    throw new Error(`${nome} não possui dados válidos.`);
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
    defval: null,
    raw: true,
  });

  const porCidade = new Map<string, MunicipioGeo>();

  for (const r of rows) {
    const municipio = String(
      get(r, ["municipio", "município", "cidade"]) ?? ""
    ).trim();

    const uf = String(get(r, ["uf"]) ?? "").trim().toUpperCase();
    const codigoIbge = cleanCode(
      get(r, ["codigo_ibge", "codigo ibge", "código ibge"])
    );

    const lat = Number(
      String(get(r, ["lat", "latitude"]) ?? "").replace(",", ".")
    );
    const lon = Number(
      String(get(r, ["lon", "longitude"]) ?? "").replace(",", ".")
    );

    if (
      !municipio ||
      !uf ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      continue;
    }

    const cityKey = `${norm(municipio)} - ${uf}`;

    porCidade.set(cityKey, {
      municipio,
      uf,
      codigoIbge,
      lat,
      lon,
      cityKey,
    });
  }

  const out = [...porCidade.values()];

  console.log(
    `[GEO] ${out.length.toLocaleString("pt-BR")} municípios com coordenadas carregados.`
  );

  return out;
}

function distanciaHaversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371.0088;
  const rad = (v: number) => (v * Math.PI) / 180;

  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) *
      Math.cos(rad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Sugere cidades a partir de uma cidade-base.
 * A distância é geográfica (linha reta/Haversine) e o score combina
 * proximidade + clientes críticos + tamanho da oportunidade.
 */
export function sugerirRota(
  cidadeBase: string,
  representante: string,
  carteira: Carteira[],
  vendas: Venda[],
  municipios: MunicipioGeo[],
  nomesReferencias: NomeReferencia[] = [],
  limiteCidades = 8,
  raioMaxKm = 250
): CidadeRota[] {
  const rep = cleanCode(representante);
  const baseKey = norm(cidadeBase).includes(" - ")
    ? norm(cidadeBase)
    : "";

  if (!rep || !baseKey) return [];

  const geoMap = new Map(municipios.map((m) => [m.cityKey, m]));
  const base = geoMap.get(baseKey);

  if (!base) {
    console.warn(`[ROTA] Cidade-base sem coordenada: ${cidadeBase}`);
    return [];
  }

  const carteiraRep = carteira.filter((c) => c.rep === rep);
  if (!carteiraRep.length) return [];

  // A Venda Mais+ usa exatamente o mesmo universo de clientes da tabela.
  // Assim, a quantidade exibida no cartão da cidade sempre corresponde
  // aos clientes que poderão ser exibidos ao clicar nessa cidade.
  const resumo = resumirClientes(carteiraRep, vendas, nomesReferencias);

  const porCidade = new Map<
    string,
    {
      cidade: string;
      uf: string;
      clientes: Set<string>;
      vermelhos: number;
      amarelos: number;
      verdes: number;
      clientesReposicao: number;
      referenciasReposicao: number;
      clientesCampanha: number;
      referenciasCampanha: number;
      dias: number[];
      limiteTotal: number;
    }
  >();

  // Agrupa diretamente o resultado de resumirClientes().
  // Não usa mais a carteira bruta para contar clientes da rota.
  for (const r of resumo) {
    const geo = geoMap.get(r.cityKey);
    if (!geo) continue;

    const atual = porCidade.get(r.cityKey) || {
      cidade: r.cidade,
      uf: r.uf,
      clientes: new Set<string>(),
      vermelhos: 0,
      amarelos: 0,
      verdes: 0,
      clientesReposicao: 0,
      referenciasReposicao: 0,
      clientesCampanha: 0,
      referenciasCampanha: 0,
      dias: [],
      limiteTotal: 0,
    };

    if (!atual.clientes.has(r.codigo)) {
      atual.clientes.add(r.codigo);
      atual.limiteTotal += r.limite || 0;

      if (r.status.startsWith("🔴")) atual.vermelhos += 1;
      else if (r.status.startsWith("🟡")) atual.amarelos += 1;
      else if (r.status.startsWith("🟢")) atual.verdes += 1;

      if (r.temReposicao) atual.clientesReposicao += 1;
      atual.referenciasReposicao += r.qtdReposicoes;
      if (r.temCampanhaReposicao) atual.clientesCampanha += 1;
      atual.referenciasCampanha += r.qtdReposicoesCampanha;

      if (Number.isFinite(r.diasSemCompra)) {
        atual.dias.push(r.diasSemCompra);
      }
    }

    porCidade.set(r.cityKey, atual);
  }

  const candidatasBase = [...porCidade.entries()]
    .map(([cityKey, c]) => {
      const geo = geoMap.get(cityKey)!;
      const distanciaKm = distanciaHaversineKm(
        base.lat,
        base.lon,
        geo.lat,
        geo.lon
      );

      const diasSemCompraMedio = c.dias.length
        ? c.dias.reduce((a, b) => a + b, 0) / c.dias.length
        : 0;

      return {
        cidade: c.cidade,
        uf: c.uf,
        cityKey,

        lat: geo.lat,
        lon: geo.lon,

        distanciaKm,
        clientes: c.clientes.size,
        vermelhos: c.vermelhos,
        amarelos: c.amarelos,
        verdes: c.verdes,
        clientesReposicao: c.clientesReposicao,
        referenciasReposicao: c.referenciasReposicao,
        clientesCampanha: c.clientesCampanha,
        referenciasCampanha: c.referenciasCampanha,
        diasSemCompraMedio,
        limiteTotal: c.limiteTotal,
        score: 0,
      };
    })
    .filter((c) => c.distanciaKm <= raioMaxKm);

  if (!candidatasBase.length) return [];

  const maxClientes = Math.max(...candidatasBase.map((c) => c.clientes), 1);
  const maxCriticos = Math.max(
    ...candidatasBase.map((c) => c.vermelhos * 2 + c.amarelos),
    1
  );
  const maxDias = Math.max(
    ...candidatasBase.map((c) => c.diasSemCompraMedio),
    1
  );
  const maxLimite = Math.max(
    ...candidatasBase.map((c) => c.limiteTotal),
    1
  );
  const maxReposicoes = Math.max(
    ...candidatasBase.map((c) => c.referenciasReposicao + c.referenciasCampanha),
    1
  );

  // Mantém os critérios comerciais existentes e acrescenta oportunidade de reposição.
  for (const c of candidatasBase) {
    const proximidade = Math.max(0, 1 - c.distanciaKm / raioMaxKm);
    const criticos = (c.vermelhos * 2 + c.amarelos) / maxCriticos;
    const densidade = c.clientes / maxClientes;
    const inatividade = c.diasSemCompraMedio / maxDias;
    const financeiro = c.limiteTotal / maxLimite;
    const reposicao =
      (c.referenciasReposicao + c.referenciasCampanha) / maxReposicoes;

    c.score =
      proximidade * 0.30 +
      criticos * 0.25 +
      densidade * 0.15 +
      inatividade * 0.10 +
      financeiro * 0.10 +
      reposicao * 0.10;
  }

  const limite = Math.max(1, limiteCidades);

  // A cidade-base entra sempre que existir na carteira do representante.
  // Ela não consome deslocamento e vira o ponto 1 da rota.
  const cidadeBaseComercial = candidatasBase.find(
    (c) => c.cityKey === baseKey
  );

  const pendentes = candidatasBase.filter(
    (c) => c.cityKey !== baseKey
  );

  const selecionadas: typeof candidatasBase = [];

  let latAtual = base.lat;
  let lonAtual = base.lon;
  let distanciaIdaKm = 0;

  // Número de cidades adicionais à base.
  const vagas = Math.max(
    0,
    limite - (cidadeBaseComercial ? 1 : 0)
  );

  /*
   * Seleção incremental da rota:
   *
   * - benefício: score comercial já validado;
   * - custo: quilômetros acrescentados ao circuito considerando o retorno
   *   à cidade-base;
   * - penalização adicional para saltos longos entre uma visita e outra.
   *
   * incrementoCircuito =
   *   atual -> candidata + candidata -> base - atual -> base
   *
   * Assim uma cidade distante só entra se o ganho comercial compensar
   * efetivamente o desvio que ela cria no percurso completo.
   */
  while (pendentes.length && selecionadas.length < vagas) {
    let melhorIndice = -1;
    let melhorValor = Number.NEGATIVE_INFINITY;
    let melhorTrecho = 0;

    const retornoAtual = distanciaHaversineKm(
      latAtual,
      lonAtual,
      base.lat,
      base.lon
    );

    for (let i = 0; i < pendentes.length; i++) {
      const candidata = pendentes[i];
      const geo = geoMap.get(candidata.cityKey);
      if (!geo) continue;

      const trecho = distanciaHaversineKm(
        latAtual,
        lonAtual,
        geo.lat,
        geo.lon
      );

      const retornoDepois = distanciaHaversineKm(
        geo.lat,
        geo.lon,
        base.lat,
        base.lon
      );

      const incrementoCircuito = Math.max(
        0,
        trecho + retornoDepois - retornoAtual
      );

      // Normaliza o custo pelo raio escolhido pelo usuário.
      const custoNormalizado =
        incrementoCircuito / Math.max(raioMaxKm, 1);

      // Penalização progressiva para um trecho isolado muito longo.
      // Até 35% do raio: sem punição extra.
      const limiteTrechoConfortavel = raioMaxKm * 0.35;
      const excessoTrecho = Math.max(
        0,
        trecho - limiteTrechoConfortavel
      );
      const penalizacaoSalto =
        excessoTrecho / Math.max(raioMaxKm, 1);

      // Quanto maior, melhor: oportunidade comercial menos custo logístico.
      const valorRota =
        candidata.score -
        custoNormalizado * 0.55 -
        penalizacaoSalto * 0.65;

      if (
        valorRota > melhorValor ||
        (valorRota === melhorValor &&
          trecho < melhorTrecho)
      ) {
        melhorValor = valorRota;
        melhorIndice = i;
        melhorTrecho = trecho;
      }
    }

    if (melhorIndice < 0) break;

    const [proxima] = pendentes.splice(melhorIndice, 1);
    const geoProxima = geoMap.get(proxima.cityKey);
    if (!geoProxima) continue;

    selecionadas.push(proxima);
    distanciaIdaKm += melhorTrecho;

    latAtual = geoProxima.lat;
    lonAtual = geoProxima.lon;
  }

  const ordenadas: CidadeRota[] = [];
  let acumulada = 0;

  if (cidadeBaseComercial) {
    ordenadas.push({
      ...cidadeBaseComercial,
      sequencia: 1,
      distanciaAnteriorKm: 0,
      distanciaAcumuladaKm: 0,
      distanciaIdaKm: 0,
      distanciaRetornoKm: 0,
      distanciaTotalKm: 0,
      totalClientes: 0,
      totalVermelhos: 0,
      totalAmarelos: 0,
      totalVerdes: 0,
      limiteTotalRota: 0,
    });
  }

  let latPercurso = base.lat;
  let lonPercurso = base.lon;

  for (const cidade of selecionadas) {
    const geo = geoMap.get(cidade.cityKey);
    if (!geo) continue;

    const trecho = distanciaHaversineKm(
      latPercurso,
      lonPercurso,
      geo.lat,
      geo.lon
    );

    acumulada += trecho;

    ordenadas.push({
      ...cidade,
      sequencia: ordenadas.length + 1,
      distanciaAnteriorKm: trecho,
      distanciaAcumuladaKm: acumulada,
      distanciaIdaKm: 0,
      distanciaRetornoKm: 0,
      distanciaTotalKm: 0,
      totalClientes: 0,
      totalVermelhos: 0,
      totalAmarelos: 0,
      totalVerdes: 0,
      limiteTotalRota: 0,
    });

    latPercurso = geo.lat;
    lonPercurso = geo.lon;
  }

  if (!ordenadas.length) return [];

  // Retorno da última cidade para a cidade-base.
  const distanciaRetornoKm =
    ordenadas.length > 1
      ? distanciaHaversineKm(
          latPercurso,
          lonPercurso,
          base.lat,
          base.lon
        )
      : 0;

  distanciaIdaKm = acumulada;
  const distanciaTotalKm =
    distanciaIdaKm + distanciaRetornoKm;

  const totalClientes = ordenadas.reduce(
    (s, c) => s + c.clientes,
    0
  );
  const totalVermelhos = ordenadas.reduce(
    (s, c) => s + c.vermelhos,
    0
  );
  const totalAmarelos = ordenadas.reduce(
    (s, c) => s + c.amarelos,
    0
  );
  const totalVerdes = ordenadas.reduce(
    (s, c) => s + c.verdes,
    0
  );
  const limiteTotalRota = ordenadas.reduce(
    (s, c) => s + c.limiteTotal,
    0
  );

  // Mantemos CidadeRota[] para não quebrar a API existente.
  // As métricas gerais são repetidas em cada item e poderão ser
  // expostas pela API/tela no próximo passo.
  for (const c of ordenadas) {
    c.distanciaIdaKm = distanciaIdaKm;
    c.distanciaRetornoKm = distanciaRetornoKm;
    c.distanciaTotalKm = distanciaTotalKm;
    c.totalClientes = totalClientes;
    c.totalVermelhos = totalVermelhos;
    c.totalAmarelos = totalAmarelos;
    c.totalVerdes = totalVerdes;
    c.limiteTotalRota = limiteTotalRota;
  }

  return ordenadas;
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
          referencia: cleanReferencia(r["Referencia"]),
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

      const [carteira, vendas, fin, produtosAutorizados, nomesReferencias, municipios] = await Promise.all([
        carregarCarteiraBase(),
        carregarVendas(),
        carregarFinanceiro(),
        carregarProdutosAutorizados(),
        carregarNomesReferencias(),
        carregarMunicipios(),
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

      return { carteira, vendas, produtosAutorizados, nomesReferencias, municipios, loadedAt: Date.now() };
    })().catch((erro) => {
      // Permite nova tentativa na próxima chamada se algum download/leitura falhar.
      cachePromise = null;
      throw erro;
    });
  }

  return cachePromise;
}

export function campanhaPorNomeReferencia(nome: string): string | null {
  const n = norm(nome);
  if (!n) return null;

  // Campanhas ligadas diretamente ao produto/referência.
  // A decisão nasce do NOME obtido por REFERÊNCIA exata em NOME_REFERENCIAS.xlsx.
  if (n.includes("IMPULSO") || n.includes("K360")) return "Impulso 2";
  if (n.includes("LUZ")) return "Natal Kidy com Luzes";
  if (n.includes("REBECCA")) return "Rebecca Bonbon";
  if (n.includes("KIDEX")) return "Kidex - Dinheiro no Bolso";

  return null;
}

export function resumirClientes(
  carteira: Carteira[],
  vendas: Venda[],
  nomesReferencias: NomeReferencia[] = []
): ClienteResumo[] {
  const now = new Date();
  const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const anoIni = new Date(hoje.getFullYear(), 0, 1);
  const maioIni = new Date(hoje.getFullYear(), 4, 1);
  const corte = new Date(2022, 0, 1);

  const nomePorReferencia = new Map(
    nomesReferencias.map((x) => [cleanReferencia(x.referencia), x])
  );

  const agg = new Map<
    string,
    { ultima: Date | null; qAno: number; qMaio: number; vlr: number }
  >();

  // Última compra na granularidade CLIENTE + REFERÊNCIA.
  const ultimaPorClienteReferencia = new Map<string, Date>();

  for (const v of vendas) {
    const a = agg.get(v.codigo) || { ultima: null, qAno: 0, qMaio: 0, vlr: 0 };

    if (v.data && (!a.ultima || v.data > a.ultima)) a.ultima = v.data;
    if (v.data && v.data >= anoIni && v.data <= hoje) a.qAno += v.qtd;
    if (v.data && v.data >= maioIni && v.data <= hoje) a.qMaio += v.qtd;
    a.vlr += v.vlr;
    agg.set(v.codigo, a);

    const referencia = cleanReferencia(v.referencia);
    if (v.data && referencia) {
      const chave = `${v.codigo}|${referencia}`;
      const anterior = ultimaPorClienteReferencia.get(chave);
      if (!anterior || v.data > anterior) {
        ultimaPorClienteReferencia.set(chave, v.data);
      }
    }
  }

  const reposicoesPorCliente = new Map<string, ReposicaoReferencia[]>();

  for (const [chave, ultimaCompra] of ultimaPorClienteReferencia) {
    const separador = chave.indexOf("|");
    const codigo = chave.slice(0, separador);
    const referencia = chave.slice(separador + 1);
    const diasSemCompra = Math.floor(
      (hoje.getTime() - ultimaCompra.getTime()) / 86400000
    );

    // Reposição comercial: somente referências cuja última compra esteja
    // entre 91 e 180 dias atrás. Até 90 dias ainda não é reposição;
    // acima de 180 dias sai da janela de reposição.
    if (diasSemCompra <= 90 || diasSemCompra > 180 || ultimaCompra > hoje) continue;

    const cadastro = nomePorReferencia.get(referencia);
    const nome = cadastro?.nome?.trim() || cadastro?.linha?.trim() || "";
    const campanha = campanhaPorNomeReferencia(nome);

    const lista = reposicoesPorCliente.get(codigo) || [];
    lista.push({ referencia, nome, ultimaCompra, diasSemCompra, campanha });
    reposicoesPorCliente.set(codigo, lista);
  }

  for (const lista of reposicoesPorCliente.values()) {
    lista.sort((a, b) => b.diasSemCompra - a.diasSemCompra);
  }

  const uniq = new Map<string, Carteira>();
  carteira.forEach((c) => uniq.set(c.codigo, c));

  const out: ClienteResumo[] = [];

  for (const c of uniq.values()) {
    const a = agg.get(c.codigo) || { ultima: null, qAno: 0, qMaio: 0, vlr: 0 };
    if (!a.ultima || a.ultima < corte || a.ultima > hoje) continue;

    const dias = Math.floor((hoje.getTime() - a.ultima.getTime()) / 86400000);
    const status =
      a.qAno <= 0
        ? "🔴 NÃO POSITIVADO NO ANO"
        : a.qMaio <= 0
        ? "🟡 SEM COMPRA DESDE MAIO"
        : "🟢 ATIVO DESDE MAIO";

    const reposicoes = reposicoesPorCliente.get(c.codigo) || [];
    const qtdReposicoesCampanha = reposicoes.filter((x) => !!x.campanha).length;

    out.push({
      ...c,
      ultimaCompra: a.ultima,
      qtdAno: a.qAno,
      qtdMaio: a.qMaio,
      vlrHistorico: a.vlr,
      diasSemCompra: dias,
      status,
      prioridade:
        (status.startsWith("🔴") ? 30 : status.startsWith("🟡") ? 20 : 10) +
        (reposicoes.length ? 2 : 0) +
        (qtdReposicoesCampanha ? 1 : 0),
      reposicoes,
      qtdReposicoes: reposicoes.length,
      qtdReposicoesCampanha,
      temReposicao: reposicoes.length > 0,
      temCampanhaReposicao: qtdReposicoesCampanha > 0,
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
