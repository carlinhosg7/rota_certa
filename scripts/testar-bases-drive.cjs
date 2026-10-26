const { loadEnvConfig } = require("@next/env");

loadEnvConfig(process.cwd());

const { testarBases } = require("../src/lib/google-drive-data.cjs");

testarBases()
  .then(resultados => {
    if (resultados.some(x => x.status !== "OK")) {
      process.exitCode = 1;
    }
  })
  .catch(erro => {
    console.error("ERRO GERAL:", erro.message);
    process.exitCode = 1;
  });
