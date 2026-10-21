import * as XLSX from "xlsx";
import {
  atualizarCatalogoDrive,
  lerArquivoComercial,
} from "./google-drive-adapter";

export type TipoMeta = "FATURAMENTO" | "ENTRADA";
export type PeriodicidadeMeta = "MENSAL" | "SEMANAL";

export type RegistroMeta = {
  codigoRepresentante: string;
  representante: string;
  supervisor: string;
  regional: string;
  ano: number;
  mes: number;
  tipoPedido: number;
  quantidade: number;
  valor: number;
};

export type RegistroRealizado = {
  codigoRepresentante: string;
  representante: string;
  supervisor: string;
  quantidade: number;
  valor: number;
};

export type FonteRealizado = {
  tipo: TipoMeta;
  periodicidade: PeriodicidadeMeta;
  arquivo: string;
  aba: string;
  periodoOriginal: string;
  filtrosOriginais: string;
  registros: RegistroRealizado[];
};

const ARQUIVOS = {
  FATURAMENTO_META: "META FATURAMENTO.xlsx",
  ENTRADA_META: "META ENTRADA.xlsx",
  FATURAMENTO_REALIZADO:
    "INDICADORES COMERCIAIS POR  FATURAMENTO.xlsx",
  ENTRADA_REALIZADO: "MATINAL COMERIAL.xlsx",
} as const;

function texto(valor: unknown): string {
  return String(valor ?? "").trim();
}

function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function codigo(valor: unknown): string {
  return texto(valor).replace(/\.0+$/, "");
}

function linhaTotal(linha: unknown[]): boolean {
  return linha.some((valor) =>
    /^total geral$/i.test(texto(valor))
  );
}

function linhaRepresentante(linha: unknown[]): boolean {
  return /^\d+$/.test(codigo(linha[0])) && !linhaTotal(linha);
}

function linhasAba(
  workbook: XLSX.WorkBook,
  aba: string
): unknown[][] {
  const planilha = workbook.Sheets[aba];

  if (!planilha) {
    throw new Error(
      `Aba "${aba}" não encontrada. Disponíveis: ${workbook.SheetNames.join(", ")}`
    );
  }

  return XLSX.utils.sheet_to_json<unknown[]>(planilha, {
    header: 1,
    defval: null,
    blankrows: false,
  });
}

async function abrirExcel(nome: string): Promise<XLSX.WorkBook> {
  const buffer = await lerArquivoComercial(nome);

  return XLSX.read(buffer, {
    type: "buffer",
    cellDates: false,
  });
}

function encontrarCabecalho(
  linhas: unknown[][],
  campos: string[]
): number {
  const indice = linhas.findIndex((linha) =>
    campos.every((campo) =>
      linha.some(
        (celula) =>
          texto(celula).toUpperCase() === campo.toUpperCase()
      )
    )
  );

  if (indice < 0) {
    throw new Error(
      `Cabeçalho não encontrado: ${campos.join(", ")}`
    );
  }

  return indice;
}

export async function carregarMetas(
  tipo: TipoMeta
): Promise<RegistroMeta[]> {
  await atualizarCatalogoDrive();

  const nome =
    tipo === "FATURAMENTO"
      ? ARQUIVOS.FATURAMENTO_META
      : ARQUIVOS.ENTRADA_META;

  const workbook = await abrirExcel(nome);
  const linhas = linhasAba(workbook, "Mes Atual_MAIO_23");

  const cabecalho = encontrarCabecalho(linhas, [
    "CODIGO_REP",
    "META_QUANTIDADE",
    "META_VALOR",
  ]);

  const colunas = linhas[cabecalho].map((v) =>
    texto(v).toUpperCase()
  );

  const indice = (campo: string): number => {
    const i = colunas.indexOf(campo);

    if (i < 0) {
      throw new Error(`Coluna ${campo} ausente em ${nome}`);
    }

    return i;
  };

  const iRep = indice("CODIGO_REP");
  const iNome = indice("REP");
  const iAno = indice("ANO");
  const iMes = indice("MÊS");
  const iTipo = indice("ID_TIPO_PEDIDO");
  const iQtd = indice("META_QUANTIDADE");
  const iValor = indice("META_VALOR");
  const iTipoMeta = indice("TIPO_META");
  const iDuplos = indice("DUPLOS");
  const iSupervisor = indice("CODIGO_SUPERVISOR");
  const iRegional = indice("REGIONAL");

  const tipoEsperado =
    tipo === "FATURAMENTO"
      ? "ENTREGA_PEDIDO"
      : "EMISSAO_PEDIDO";

  const registros: RegistroMeta[] = [];

  for (const linha of linhas.slice(cabecalho + 1)) {
    const rep = codigo(linha[iRep]);
    const ano = numero(linha[iAno]);
    const mes = numero(linha[iMes]);
    const tipoPedido = numero(linha[iTipo]);

    if (!/^\d+$/.test(rep)) continue;
    if (ano < 2020 || mes < 1 || mes > 12) continue;
    if (![1, 4].includes(tipoPedido)) continue;
    if (texto(linha[iTipoMeta]) !== tipoEsperado) continue;

    // Registros sinalizados como duplicados não entram no cálculo.
    if (
      texto(linha[iDuplos]).toUpperCase() !== "NÃO"
    ) {
      continue;
    }

    registros.push({
      codigoRepresentante: rep,
      representante: texto(linha[iNome]),
      supervisor: codigo(linha[iSupervisor]),
      regional: texto(linha[iRegional]),
      ano,
      mes,
      tipoPedido,
      quantidade: numero(linha[iQtd]),
      valor: numero(linha[iValor]),
    });
  }

  return registros;
}

export async function carregarRealizado(
  tipo: TipoMeta,
  periodicidade: PeriodicidadeMeta
): Promise<FonteRealizado> {
  await atualizarCatalogoDrive();

  const faturamento = tipo === "FATURAMENTO";

  const arquivo = faturamento
    ? ARQUIVOS.FATURAMENTO_REALIZADO
    : ARQUIVOS.ENTRADA_REALIZADO;

  const aba = faturamento
    ? periodicidade === "MENSAL"
      ? "MES"
      : "SEMANA"
    : periodicidade === "MENSAL"
      ? "ENTRADA MES"
      : "ENTRADA SEMANA";

  const workbook = await abrirExcel(arquivo);
  const linhas = linhasAba(workbook, aba);

  const cabecalho = encontrarCabecalho(linhas, [
    "Codigo Representante",
    "Vlr Venda",
    "Qtd Venda",
  ]);

  const cab = linhas[cabecalho].map((v) =>
    texto(v).toUpperCase()
  );

  const coluna = (nome: string): number => {
    const i = cab.indexOf(nome.toUpperCase());

    if (i < 0) {
      throw new Error(`Coluna ${nome} ausente em ${arquivo}/${aba}`);
    }

    return i;
  };

  const iCodigo = coluna("Codigo Representante");
  const iNome = coluna("Representante");
  const iValor = coluna("Vlr Venda");
  const iQtd = coluna("Qtd Venda");

  const iSupervisor = cab.indexOf(
    faturamento && periodicidade === "MENSAL"
      ? "CODIGO SUPERVISOR"
      : "SUPERVISOR"
  );

  const registros: RegistroRealizado[] = [];

  for (const linha of linhas.slice(cabecalho + 1)) {
    if (!linhaRepresentante(linha)) continue;

    registros.push({
      codigoRepresentante: codigo(linha[iCodigo]),
      representante: texto(linha[iNome]),
      supervisor:
        iSupervisor >= 0 ? texto(linha[iSupervisor]) : "",
      quantidade: numero(linha[iQtd]),
      valor: numero(linha[iValor]),
    });
  }

  const metadados = linhas
    .slice(0, cabecalho)
    .flat()
    .map(texto)
    .filter(Boolean)
    .join(" | ");

  const periodoOriginal =
    metadados.match(
      /(?:Data Entrega|Data Cadastro)\s*:\s*[^;|]+/i
    )?.[0] ?? "Período não identificado";

  return {
    tipo,
    periodicidade,
    arquivo,
    aba,
    periodoOriginal,
    filtrosOriginais: metadados,
    registros,
  };
}
