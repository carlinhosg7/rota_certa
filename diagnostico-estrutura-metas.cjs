const nextEnv = require("@next/env");
nextEnv.loadEnvConfig(process.cwd());

const XLSX = require("xlsx");
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
    console.log("\n==================================");
    console.log("ARQUIVO:", nome);
    console.log("==================================");

    try {
      const arquivo = arquivos.find(a => a.nome === nome);

      if (!arquivo) {
        console.log("NAO ENCONTRADO");
        continue;
      }

      const buffer = await drive.baixarArquivo(arquivo);

      const workbook = XLSX.read(buffer, {
        type: "buffer"
      });

      console.log("DOWNLOAD COMPLETO:", buffer.length, "bytes");

      for (const aba of workbook.SheetNames) {
        const planilha = workbook.Sheets[aba];

        const linhas = XLSX.utils.sheet_to_json(planilha, {
          header: 1,
          defval: null,
          blankrows: false
        });

        console.log("\nABA:", aba);
        console.log("LINHAS:", linhas.length);

        console.log("PRIMEIRAS 3 LINHAS:");

        for (const linha of linhas.slice(0, 3)) {
          console.log(JSON.stringify(linha));
        }
      }

    } catch (erro) {
      console.log("ERRO:", erro.message);
    }
  }
}

executar().catch(erro => {
  console.error("ERRO GERAL:", erro.message);
  process.exitCode = 1;
});
