const nextEnv = require("@next/env");
nextEnv.loadEnvConfig(process.cwd());

const drive = require("./src/lib/google-drive-data.cjs");

const nomes = [
  "META FATURAMENTO.xlsx",
  "META ENTRADA.xlsx",
  "INDICADORES COMERCIAIS POR  FATURAMENTO.xlsx",
  "MATINAL COMERIAL.xlsx"
];

async function executar() {
  const arquivos = await drive.listarArquivos();

  for (const nome of nomes) {
    console.log("\n--------------------------------");
    console.log("ARQUIVO:", nome);

    const arquivo = arquivos.find(a => a.nome === nome);

    if (!arquivo) {
      console.log("STATUS: NAO ENCONTRADO");
      continue;
    }

    console.log("TAMANHO:", arquivo.tamanho);
    console.log("ID PRESENTE:", Boolean(arquivo.id));

    try {
      const resposta = await drive.chamarAPI("arquivo", {
        id: arquivo.id,
        parte: 0
      });

      console.log("STATUS: DOWNLOAD ACESSIVEL");
      console.log("TOTAL DE PARTES:", resposta.totalPartes);
    } catch (erro) {
      console.log("STATUS: ERRO NO DOWNLOAD");
      console.log("ERRO:", erro.message);
    }
  }
}

executar().catch(erro => {
  console.error("ERRO:", erro.message);
  process.exitCode = 1;
});
