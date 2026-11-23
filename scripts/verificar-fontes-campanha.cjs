const XLSX = require("xlsx");

const fontes = [
  {
    arquivo: process.argv[2],
    abas: ["ENTRADA MES PROD", "KIDEX"]
  },
  {
    arquivo: process.argv[3],
    abas: ["MES"]
  }
];

for (const fonte of fontes) {
  console.log("\n======================================");
  console.log("ARQUIVO:", fonte.arquivo);

  const wb = XLSX.readFile(fonte.arquivo, {
    cellDates: true
  });

  console.log("ABAS DISPONIVEIS:");
  console.log(wb.SheetNames.join(" | "));

  for (const nome of fonte.abas) {
    console.log("\n=== ABA:", nome, "===");

    const ws = wb.Sheets[nome];

    if (!ws) {
      console.log("ABA NAO ENCONTRADA");
      continue;
    }

    console.log("INTERVALO:", ws["!ref"]);

    const linhas = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
      blankrows: false
    });

    for (let i = 0; i < Math.min(linhas.length, 12); i++) {
      console.log(
        "LINHA", i + 1,
        JSON.stringify(linhas[i].slice(0, 25))
      );
    }
  }
}
