const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const XLSX = require("xlsx");
const drive = require("./src/lib/google-drive-data.cjs");

(async () => {
  const arquivos = await drive.listarArquivos();

  const fontes = [
    ["META FATURAMENTO.xlsx", "Mes Atual_MAIO_23"],
    ["META ENTRADA.xlsx", "Mes Atual_MAIO_23"],
    ["INDICADORES COMERCIAIS POR  FATURAMENTO.xlsx", "MES"],
    ["INDICADORES COMERCIAIS POR  FATURAMENTO.xlsx", "SEMANA"],
    ["MATINAL COMERIAL.xlsx", "ENTRADA MES"],
    ["MATINAL COMERIAL.xlsx", "ENTRADA SEMANA"]
  ];

  for (const [nome, aba] of fontes) {
    console.log("\n====================================");
    console.log("ARQUIVO:", nome);
    console.log("ABA:", aba);

    const arquivo = arquivos.find(x => x.nome === nome);
    if (!arquivo) {
      console.log("Arquivo não encontrado");
      continue;
    }

    const buffer = await drive.baixarArquivo(arquivo);
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[aba];

    if (!ws) {
      console.log("Aba não encontrada");
      continue;
    }

    const linhas = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null
    });

    linhas.slice(0, 8).forEach((linha, i) => {
      console.log("LINHA", i + 1, JSON.stringify(linha));
    });
  }
})().catch(console.error);
