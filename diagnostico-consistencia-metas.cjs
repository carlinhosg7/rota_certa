const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());
const XLSX = require("xlsx");
const drive = require("./src/lib/google-drive-data.cjs");

const fontes = [
  ["META FATURAMENTO.xlsx", "Mes Atual_MAIO_23"],
  ["META ENTRADA.xlsx", "Mes Atual_MAIO_23"],
  ["INDICADORES COMERCIAIS POR  FATURAMENTO.xlsx", "MES"],
  ["INDICADORES COMERCIAIS POR  FATURAMENTO.xlsx", "SEMANA"],
  ["MATINAL COMERIAL.xlsx", "ENTRADA MES"],
  ["MATINAL COMERIAL.xlsx", "ENTRADA SEMANA"]
];

async function executar() {
  const arquivos = await drive.listarArquivos();

  for (const [nome, aba] of fontes) {
    console.log("\n====================================");
    console.log("ARQUIVO:", nome);
    console.log("ABA:", aba);

    try {
      const arquivo = arquivos.find(x => x.nome === nome);

      if (!arquivo) {
        console.log("ARQUIVO NAO ENCONTRADO");
        continue;
      }

      const buffer = await drive.baixarArquivo(arquivo);

      const wb = XLSX.read(buffer, { type: "buffer" });
      const ws = wb.Sheets[aba];

      if (!ws) {
        console.log("ABA NAO ENCONTRADA");
        continue;
      }

      const linhas = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: null
      });

      console.log("TOTAL LINHAS:", linhas.length);

      console.log("\nULTIMAS 5 LINHAS:");

      linhas.slice(-5).forEach((linha, i) => {
        console.log(
          linhas.length - Math.min(5, linhas.length) + i + 1,
          JSON.stringify(linha)
        );
      });

      if (nome.startsWith("META ")) {
        const dados = linhas.slice(1);
        const meses = {};
        const tipos = {};
        const duplicados = {};

        for (const r of dados) {
          const periodo = `${r[5]}-${String(r[6]).padStart(2, "0")}`;

          meses[periodo] = (meses[periodo] || 0) + 1;

          const tipo = `${r[7]} / ${r[9]}`;
          tipos[tipo] = (tipos[tipo] || 0) + 1;

          const flag = String(r[12] ?? "");
          duplicados[flag] = (duplicados[flag] || 0) + 1;
        }

        console.log("\nPERIODOS:", JSON.stringify(meses));
        console.log("TIPOS:", JSON.stringify(tipos));
        console.log("DUPLOS:", JSON.stringify(duplicados));
      }

    } catch (erro) {
      console.log("ERRO:", erro.message);
    }
  }
}

executar().catch(console.error);
