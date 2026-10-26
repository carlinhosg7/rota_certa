const nextEnv = require("@next/env");
nextEnv.loadEnvConfig(process.cwd());

const drive = require("./src/lib/google-drive-data.cjs");

async function executar() {
  const resultado = await drive.chamarAPI("listar");
  const arquivos = resultado.arquivos || [];

  console.log("\n=== ARQUIVOS DE FATURAMENTO ===\n");

  const encontrados = arquivos.filter(arquivo =>
    /FATURAMENTO|INDICADORES/i.test(arquivo.nome || "")
  );

  for (const arquivo of encontrados) {
    console.log("NOME:", JSON.stringify(arquivo.nome));
    console.log("CAMINHO:", JSON.stringify(arquivo.caminho));
    console.log("TAMANHO:", arquivo.tamanho);
    console.log("------------------------------");
  }

  console.log("TOTAL BRUTO:", arquivos.length);
  console.log("ARQUIVOS DE FATURAMENTO:", encontrados.length);
}

executar().catch(erro => {
  console.error("ERRO:", erro.message);
  process.exitCode = 1;
});
