const { loadEnvConfig } = require("@next/env");
const fs = require("fs");
const path = require("path");

loadEnvConfig(process.cwd());

const URL = process.env.KIDY_DRIVE_API_URL;
const TOKEN = process.env.KIDY_DRIVE_API_TOKEN;
const NOME = "DADOS_PREDITIVA_1.parquet";

async function chamar(acao, parametros = {}) {
  const resposta = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      acao,
      token: TOKEN,
      ...parametros
    }),
    redirect: "follow",
    cache: "no-store"
  });

  if (!resposta.ok) {
    throw new Error(`HTTP ${resposta.status}`);
  }

  const dados = await resposta.json();

  if (!dados.sucesso) {
    throw new Error(dados.erro || "Erro na API");
  }

  return dados;
}

async function executar() {
  console.log("Conectando ao Google Drive...");

  const lista = await chamar("listar");

  const arquivo = lista.arquivos.find(
    x => x.nome === NOME && x.caminho === NOME
  );

  if (!arquivo) {
    throw new Error("Arquivo não encontrado na raiz.");
  }

  console.log("Arquivo:", arquivo.nome);
  console.log("Tamanho esperado:", arquivo.tamanho, "bytes");

  const partes = [];
  let totalPartes = null;

  for (let parte = 0; totalPartes === null || parte < totalPartes; parte++) {
    const resposta = await chamar("arquivo", {
      id: arquivo.id,
      parte
    });

    if (!Number.isInteger(Number(resposta.totalPartes))) {
      throw new Error("totalPartes inválido na resposta da API.");
    }

    totalPartes = Number(resposta.totalPartes);

    const base64 = resposta.base64 ?? resposta.conteudo;

    if (typeof base64 !== "string") {
      throw new Error(
        "Campo Base64 não encontrado. Campos recebidos: " +
        Object.keys(resposta).join(", ")
      );
    }

    partes.push(Buffer.from(base64, "base64"));

    console.log(`Parte ${parte + 1}/${totalPartes} recebida`);
  }

  const buffer = Buffer.concat(partes);

  console.log("Tamanho recebido:", buffer.length, "bytes");

  if (buffer.length !== Number(arquivo.tamanho)) {
    throw new Error("Tamanho do arquivo não confere.");
  }

  if (
    buffer.subarray(0, 4).toString() !== "PAR1" ||
    buffer.subarray(-4).toString() !== "PAR1"
  ) {
    throw new Error("Assinatura Parquet inválida.");
  }

  const destino = path.join(
    process.cwd(),
    "teste_google_drive.parquet"
  );

  fs.writeFileSync(destino, buffer);

  console.log("");
  console.log("DOWNLOAD VALIDADO COM SUCESSO!");
  console.log("Arquivo salvo:", destino);
}

executar().catch(erro => {
  console.error("ERRO:", erro.message);
  process.exitCode = 1;
});
