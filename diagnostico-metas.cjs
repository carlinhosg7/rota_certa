const nextEnv = require("@next/env");
nextEnv.loadEnvConfig(process.cwd());

const drive = require("./src/lib/google-drive-data.cjs");

(async () => {
  const arquivos = await drive.listarArquivos();

  console.log("\nARQUIVOS ENCONTRADOS NO GOOGLE DRIVE:\n");

  for (const arquivo of arquivos) {
    console.log(arquivo.nome);
  }

  console.log("\nTOTAL:", arquivos.length);
})().catch(erro => {
  console.error("ERRO:", erro.message);
  process.exitCode = 1;
});
