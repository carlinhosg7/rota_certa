const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const NOMES_OFICIAIS = [
  "DADOS PREDITIVA CLIENTES.xlsx",
  "DADOS_PREDITIVA_1.parquet",
  "DADOS_PREDITIVA_2.parquet",
  "DADOS_PREDITIVA_3.parquet",
  "DADOS_PREDITIVA_4.parquet",
  "DADOS_PREDITIVA_5.parquet",
  "DADOS_PREDITIVA_6.parquet",
  "DADOS_PREDITIVA_FAT_1.parquet",
  "DADOS_PREDITIVA_FAT_2.parquet",
  "DADOS_PREDITIVA_FAT_3.parquet",
  "DADOS_PREDITIVA_FAT_4.parquet",
  "DADOS_PREDITIVA_FAT_5.parquet",
  "DADOS_PREDITIVA_FAT_6.parquet",
  "base clientes.xlsx",
  "REP MONTAR ANALISES_ATUALIZADO 2026.xlsx",
  "DADOS PRDITIVA LIMITE.xlsx",
  "DADOS PREDITIVA PRODUTOS EM LINHA.xlsx",
  "NOME_REFERENCIAS.xlsx",
  "municipios_com_lat_lon.csv",
  "META ENTRADA.xlsx",
  "META ENTRADA C KIDEX.xlsx",
  "META FATURAMENTO.xlsx",
  "MATINAL COMERIAL.xlsx",
  "INDICADORES COMERCIAIS POR  FATURAMENTO.xlsx"];

function configuracao() {
  const url = process.env.KIDY_DRIVE_API_URL;
  const token = process.env.KIDY_DRIVE_API_TOKEN;

  if (!url || !token) {
    throw new Error("Variáveis KIDY_DRIVE_API_URL e KIDY_DRIVE_API_TOKEN não configuradas.");
  }

  return { url, token };
}

async function chamarAPI(acao, parametros = {}) {
  const { url, token } = configuracao();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const resposta = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        acao,
        token,
        ...parametros
      }),
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal
    });

    if (!resposta.ok) {
      throw new Error(`Google Drive HTTP ${resposta.status}`);
    }

    const dados = await resposta.json();

    if (!dados.sucesso) {
      throw new Error(dados.erro || "Falha na API Google Drive");
    }

    return dados;
  } finally {
    clearTimeout(timeout);
  }
}

async function listarArquivos() {
  const resultado = await chamarAPI("listar");

  if (!Array.isArray(resultado.arquivos)) {
    throw new Error("Lista de arquivos inválida.");
  }

  return resultado.arquivos.filter(
    arquivo =>
      arquivo.caminho === arquivo.nome &&
      NOMES_OFICIAIS.includes(arquivo.nome)
  );
}

async function baixarArquivo(arquivo) {
  const totalEsperado = Number(arquivo.tamanho);

  if (
    !arquivo.id ||
    !Number.isSafeInteger(totalEsperado) ||
    totalEsperado <= 0
  ) {
    throw new Error(`Metadados inválidos: ${arquivo.nome}`);
  }

  const partes = [];
  let totalPartes = null;
  let tamanhoRecebido = 0;

  for (
    let parte = 0;
    totalPartes === null || parte < totalPartes;
    parte++
  ) {
    const resposta = await chamarAPI("arquivo", {
      id: arquivo.id,
      parte
    });

    const quantidade = Number(resposta.totalPartes);

    if (
      !Number.isSafeInteger(quantidade) ||
      quantidade < 1 ||
      (totalPartes !== null && quantidade !== totalPartes)
    ) {
      throw new Error(`Quantidade de partes inválida: ${arquivo.nome}`);
    }

    totalPartes = quantidade;

    const base64 = resposta.base64 ?? resposta.conteudo;

    if (
      typeof base64 !== "string" ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(base64) ||
      base64.length % 4 !== 0
    ) {
      throw new Error(`Base64 inválido: ${arquivo.nome}`);
    }

    const buffer = Buffer.from(base64, "base64");

    if (!buffer.length) {
      throw new Error(`Parte vazia: ${arquivo.nome}`);
    }

    partes.push(buffer);
    tamanhoRecebido += buffer.length;

    if (tamanhoRecebido > totalEsperado) {
      throw new Error(`Arquivo excedeu tamanho esperado: ${arquivo.nome}`);
    }
  }

  const buffer = Buffer.concat(partes);

  if (buffer.length !== totalEsperado) {
    throw new Error(
      `Tamanho incorreto: ${arquivo.nome}. ` +
      `Esperado ${totalEsperado}, recebido ${buffer.length}`
    );
  }

  if (arquivo.nome.toLowerCase().endsWith(".parquet")) {
    if (
      buffer.subarray(0, 4).toString("ascii") !== "PAR1" ||
      buffer.subarray(-4).toString("ascii") !== "PAR1"
    ) {
      throw new Error(`Parquet inválido: ${arquivo.nome}`);
    }
  }

  return buffer;
}

function calcularHash(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function testarBases() {
  const arquivos = await listarArquivos();

  console.log("");
  console.log("KIDY SALES INTELLIGENCE - GOOGLE DRIVE");
  console.log("Arquivos oficiais encontrados:", arquivos.length);
  console.log("");

  const resultados = [];

  for (const nome of NOMES_OFICIAIS) {
    const arquivo = arquivos.find(x => x.nome === nome);

    if (!arquivo) {
      resultados.push({
        arquivo: nome,
        status: "AUSENTE",
        bytes: 0,
        sha256: ""
      });
      continue;
    }

    try {
      console.log("Baixando:", nome);

      const buffer = await baixarArquivo(arquivo);

      resultados.push({
        arquivo: nome,
        status: "OK",
        bytes: buffer.length,
        sha256: calcularHash(buffer)
      });

      console.log("VALIDADO:", nome);
    } catch (erro) {
      resultados.push({
        arquivo: nome,
        status: "ERRO",
        bytes: 0,
        sha256: ""
      });

      console.error("FALHA:", nome, erro.message);
    }
  }

  console.log("");
  console.table(
    resultados.map(({ arquivo, status, bytes }) => ({
      arquivo,
      status,
      bytes
    }))
  );

  const aprovados = resultados.filter(x => x.status === "OK").length;

  console.log(`RESULTADO: ${aprovados}/${NOMES_OFICIAIS.length} arquivos validados`);

  return resultados;
}

module.exports = {
  NOMES_OFICIAIS,
  chamarAPI,
  listarArquivos,
  baixarArquivo,
  calcularHash,
  testarBases
};
