import * as XLSX from "xlsx";
import {
  atualizarCatalogoDrive,
  lerArquivoComercial,
} from "./google-drive-adapter";

type Registro = Record<string, unknown>;

type Pessoa = {
  codigo: string;
  nome: string;
};

export type ClienteCarteira = {
  codigoCliente: string;
  razaoSocial: string;
  cnpj: string;
  grupoCliente: string;
  codigoGrupoCliente: string;
  ultimaCompra?: string;
  carteira: string;
  situacao: string;
  faixa: string;
  mesesSemCompra: number | null;
  representantes: Pessoa[];
  supervisores: Pessoa[];
  bloqueadoFinanceiro: boolean;
  limiteDisponivel: number;
  clienteAtivoCadastro: boolean | null;
  situacaoEmpresa: string;
  compraFaturadaConfirmada: boolean;
  classificacaoProvisoria: boolean;
  flags: string[];
  acompanhamento: Record<string, unknown>;
};

const ARQUIVO = "DADOS PRETIVIA CLIENTES.xlsx";

function texto(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function codigo(v: unknown): string {
  return texto(v).replace(/\.0$/, "");
}

function numero(v: unknown): number {
  if (typeof v === "number") return v;
  const s = texto(v).replace(/[R$\s]/g, "");
  if (!s) return 0;
  const n = Number(
    s.includes(",")
      ? s.replace(/\./g, "").replace(",", ".")
      : s
  );
  return Number.isFinite(n) ? n : 0;
}

function data(v: unknown): string | null {
  if (v == null || v === "") return null;

  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }

  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return [
      d.y,
      String(d.m).padStart(2, "0"),
      String(d.d).padStart(2, "0"),
    ].join("-");
  }

  const s = texto(v);
  let m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }

  return null;
}

function hojeSP(): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const p = (tipo: string) =>
    partes.find(x => x.type === tipo)?.value || "";

  return `${p("year")}-${p("month")}-${p("day")}`;
}

function corte24(referencia: string): string {
  const [ano, mes, dia] = referencia.split("-").map(Number);
  const d = new Date(Date.UTC(ano, mes - 1 - 24, 1));
  const ultimo = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
  ).getUTCDate();

  d.setUTCDate(Math.min(dia, ultimo));
  return d.toISOString().slice(0, 10);
}

function mesesEntre(inicio: string, fim: string): number {
  const [ai, mi, di] = inicio.split("-").map(Number);
  const [af, mf, df] = fim.split("-").map(Number);
  let meses = (af - ai) * 12 + mf - mi;
  if (df < di) meses--;
  return Math.max(0, meses);
}

function classificar(
  ultima: string | null,
  referencia: string,
  corte: string
) {
  if (!ultima || ultima > referencia) {
    return {
      carteira: "02_REATIVACAO",
      situacao: "PENDENTE_QUALIFICACAO",
      faixa: "SEM_HISTORICO_VALIDADO",
      mesesSemCompra: null,
    };
  }

  const meses = mesesEntre(ultima, referencia);

  if (ultima >= corte) {
    return {
      carteira: "01_ATIVA",
      situacao: "ATIVA",
      faixa: "ATE_24_MESES",
      mesesSemCompra: meses,
    };
  }

  return {
    carteira: "02_REATIVACAO",
    situacao: "REATIVACAO",
    faixa:
      meses <= 36
        ? "25_A_36_MESES"
        : meses <= 60
          ? "37_A_60_MESES"
          : "ACIMA_60_MESES",
    mesesSemCompra: meses,
  };
}

function sim(v: unknown): boolean {
  return ["SIM", "S", "TRUE", "1"].includes(texto(v).toUpperCase());
}

function bloqueado(v: unknown): boolean {
  return ["SIM", "S", "TRUE", "1", "BLOQUEADO"].includes(
    texto(v).toUpperCase()
  );
}

type Acumulado = Omit<
  ClienteCarteira,
  "ultimaCompra" | "representantes" | "supervisores" | "carteira" |
  "situacao" | "faixa" | "mesesSemCompra" |
  "flags" | "acompanhamento" |
  "situacaoEmpresa" | "compraFaturadaConfirmada" |
  "classificacaoProvisoria"
> & {
  ultimaCompra: string | null;
  representantes: Map<string, string>;
  supervisores: Map<string, string>;
  cadastroDivergente: boolean;
};

let cache:
  | {
      data: string;
      expira: number;
      clientes: ClienteCarteira[];
      resumo: Record<string, unknown>;
    }
  | undefined;

let carregamento:
  | Promise<{
      clientes: ClienteCarteira[];
      resumo: Record<string, unknown>;
    }>
  | undefined;

async function processar() {
  await atualizarCatalogoDrive();

  const buffer = await lerArquivoComercial(ARQUIVO);
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];

  if (!ws) throw new Error("Planilha da carteira sem aba.");

  const matriz = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
  });

  const indice = matriz.findIndex(linha =>
    linha.some(v => texto(v).toLowerCase() === "codigo cliente") &&
    linha.some(v => texto(v).toLowerCase() === "grupo cliente")
  );

  if (indice < 0) {
    throw new Error("Cabecalho da carteira nao localizado.");
  }

  const cabecalho = matriz[indice].map(texto);
  const registros: Registro[] = matriz.slice(indice + 1)
    .filter(linha => linha.some(v => texto(v) !== ""))
    .map(linha => Object.fromEntries(
      cabecalho.map((campo, i) => [campo, linha[i] ?? ""])
    ));

  const mapa = new Map<string, Acumulado>();

  for (const r of registros) {
    const id = codigo(r["Codigo Cliente"]);
    if (!id) continue;

    const ultima = data(r["Data Ultima Compra"]);
    const grupo = texto(r["Grupo Cliente"]);
    const rep = codigo(r["Codigo Representante"]);
    const sup = codigo(r["Codigo Supervisor"]);

    if (!mapa.has(id)) {
      mapa.set(id, {
        codigoCliente: id,
        razaoSocial: texto(r["Razao Social Empresa"]),
        cnpj: texto(r["Cnpj"]),
        grupoCliente: grupo,
        codigoGrupoCliente: codigo(r["Codigo Grupo Cliente"]),
        ultimaCompra: null,
        representantes: new Map(),
        supervisores: new Map(),
        bloqueadoFinanceiro: false,
        limiteDisponivel: 0,
        clienteAtivoCadastro: null,
        cadastroDivergente: false,
      });
    }

    const c = mapa.get(id)!;

    if (ultima && (!c.ultimaCompra || ultima > c.ultimaCompra)) {
      c.ultimaCompra = ultima;
    }

    if (rep) c.representantes.set(rep, texto(r["Representante"]));
    if (sup) c.supervisores.set(sup, texto(r["Supervisor"]));

    if (
      grupo && c.grupoCliente &&
      grupo.toUpperCase() !== c.grupoCliente.toUpperCase()
    ) {
      c.cadastroDivergente = true;
    }

    c.bloqueadoFinanceiro ||= bloqueado(r["Bloqueado Financeiro"]);
    c.limiteDisponivel = Math.max(
      c.limiteDisponivel,
      numero(r["Limite Disponivel"])
    );

    if (texto(r["Cliente Ativo"])) {
      c.clienteAtivoCadastro = sim(r["Cliente Ativo"]);
    }
  }

  const referencia = hojeSP();
  const corte = corte24(referencia);

  const clientes: ClienteCarteira[] = [];

  for (const c of mapa.values()) {
    const status = classificar(c.ultimaCompra, referencia, corte);
    const flags: string[] = [];

    if (c.bloqueadoFinanceiro) flags.push("BLOQUEIO_FINANCEIRO");
    if (c.limiteDisponivel > 0) flags.push("LIMITE_DISPONIVEL");
    if (c.cadastroDivergente) flags.push("CADASTRO_A_VALIDAR");
    if (!c.representantes.size) flags.push("SEM_REPRESENTANTE");
    if (c.representantes.size > 1) flags.push("MULTIPLOS_REPRESENTANTES");

    clientes.push({
      codigoCliente: c.codigoCliente,
      razaoSocial: c.razaoSocial,
      cnpj: c.cnpj,
      grupoCliente: c.grupoCliente,
      codigoGrupoCliente: c.codigoGrupoCliente,
      ultimaCompra: c.ultimaCompra ?? undefined,
      ...status,
      representantes: [...c.representantes].map(
        ([codigo, nome]) => ({ codigo, nome })
      ),
      supervisores: [...c.supervisores].map(
        ([codigo, nome]) => ({ codigo, nome })
      ),
      bloqueadoFinanceiro: c.bloqueadoFinanceiro,
      limiteDisponivel: c.limiteDisponivel,
      clienteAtivoCadastro: c.clienteAtivoCadastro,
      situacaoEmpresa: "NAO_VERIFICADA",
      compraFaturadaConfirmada: false,
      classificacaoProvisoria: true,
      flags,
      acompanhamento: {
        status: "NAO_INICIADO",
        potencial: "NAO_AVALIADO",
        ultimaColecao: null,
        ultimoContato: null,
        motivoNaoCompra: null,
        proximaAcao: null,
        prazo: null,
        responsavel: null,
        resultado: null,
      },
    });
  }

  const resumo = {
    referencia,
    corte24Meses: corte,
    fonte: "GOOGLE_DRIVE",
    totalClientes: clientes.length,
    gruposDistintos: new Set(
      clientes.map(c => c.grupoCliente.trim().toUpperCase())
        .filter(Boolean)
    ).size,
    ativa: clientes.filter(c => c.situacao === "ATIVA").length,
    reativacao: clientes.filter(c => c.situacao === "REATIVACAO").length,
    pendenteQualificacao: clientes.filter(
      c => c.situacao === "PENDENTE_QUALIFICACAO"
    ).length,
    faixas: {
      meses25a36: clientes.filter(
        c => c.faixa === "25_A_36_MESES"
      ).length,
      meses37a60: clientes.filter(
        c => c.faixa === "37_A_60_MESES"
      ).length,
      acima60: clientes.filter(
        c => c.faixa === "ACIMA_60_MESES"
      ).length,
    },
    bloqueados: clientes.filter(c => c.bloqueadoFinanceiro).length,
    comLimiteDisponivel: clientes.filter(
      c => c.limiteDisponivel > 0
    ).length,
    multiplosRepresentantes: clientes.filter(
      c => c.representantes.length > 1
    ).length,
    cadastroDivergente: clientes.filter(
      c => c.flags.includes("CADASTRO_A_VALIDAR")
    ).length,
    statusValidacao: "PROVISORIO_SEM_CONFIRMACAO_FATURAMENTO",
  };

  return { clientes, resumo };
}

export async function carregarCarteira2027() {
  const agora = Date.now();
  const dia = hojeSP();

  if (cache && cache.data === dia && cache.expira > agora) {
    return {
      clientes: cache.clientes,
      resumo: cache.resumo,
    };
  }

  if (!carregamento) {
    carregamento = processar().then(resultado => {
      cache = {
        data: dia,
        expira: Date.now() + 15 * 60 * 1000,
        ...resultado,
      };
      return resultado;
    }).finally(() => {
      carregamento = undefined;
    });
  }

  return carregamento;
}