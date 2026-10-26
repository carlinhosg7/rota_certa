const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const drive = require("./src/lib/google-drive-data.cjs");
const XLSX = require("xlsx");

async function executar() {
  const arquivos = await drive.listarArquivos();
  const arquivo = arquivos.find(
    a => a.nome === "MATINAL COMERIAL.xlsx"
  );

  if (!arquivo) throw new Error("Arquivo nao encontrado.");

  const buffer = await drive.baixarArquivo(arquivo);
  const wb = XLSX.read(buffer, { type: "buffer" });

  for (const nome of ["ENTRADA MES", "ENTRADA SEMANA"]) {
    const ws = wb.Sheets[nome];

    if (!ws) {
      console.log("ABA AUSENTE:", nome);
      continue;
    }

    const linhas = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
      blankrows: false
    });

    console.log("\n==========", nome, "==========");

    for (let i = 0; i < Math.min(9, linhas.length); i++) {
      const linha = linhas[i];

      if (i < 2) {
        console.log("LINHA", i + 1, ":", String(linha[0]).slice(0, 300));
      } else {
        console.log("LINHA", i + 1, ":", JSON.stringify(linha));
      }
    }
  }
}

executar().catch(e => {
  console.error("ERRO:", e.message);
  process.exitCode = 1;
});
