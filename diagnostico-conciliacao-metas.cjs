const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const XLSX = require("xlsx");
const drive = require("./src/lib/google-drive-data.cjs");

(async () => {
  const arquivos = await drive.listarArquivos();

  async function ler(nome, aba) {
    const arquivo = arquivos.find(x => x.nome === nome);
    if (!arquivo) throw new Error("Arquivo não encontrado: " + nome);

    const buffer = await drive.baixarArquivo(arquivo);
    const wb = XLSX.read(buffer, { type: "buffer" });

    return XLSX.utils.sheet_to_json(wb.Sheets[aba], {
      header: 1,
      defval: null
    });
  }

  const metas = await ler(
    "META FATURAMENTO.xlsx",
    "Mes Atual_MAIO_23"
  );

  const realizados = await ler(
    "INDICADORES COMERCIAIS POR  FATURAMENTO.xlsx",
    "MES"
  );

  const cod = x => String(x ?? "").trim().replace(/\.0+$/, "");
  const num = x => Number(x) || 0;

  const metasOutubro = metas.slice(1).filter(r =>
    num(r[5]) === 2026 &&
    num(r[6]) === 10 &&
    cod(r[2])
  );

  const realizadosValidos = realizados.filter(r =>
    /^\d+$/.test(cod(r[0]))
  );

  const repsRealizado = new Set(
    realizadosValidos.map(r => cod(r[0]))
  );

  const metaCorrespondente = metasOutubro.filter(r =>
    repsRealizado.has(cod(r[2]))
  );

  const metaSemRealizado = metasOutubro.filter(r =>
    !repsRealizado.has(cod(r[2]))
  );

  const somar = (linhas, coluna) =>
    linhas.reduce((s, r) => s + num(r[coluna]), 0);

  console.log("\n=== CONCILIACAO OUTUBRO 2026 ===");

  console.log("Representantes na meta:", metasOutubro.length);
  console.log("Representantes no realizado:", realizadosValidos.length);
  console.log("Metas correspondentes:", metaCorrespondente.length);
  console.log("Metas fora do realizado:", metaSemRealizado.length);

  console.log("\n=== META CORRESPONDENTE ===");
  console.log("Pares:", somar(metaCorrespondente, 8));
  console.log("Valores:", somar(metaCorrespondente, 10));

  console.log("\n=== REALIZADO ===");
  console.log("Pares:", somar(realizadosValidos, 10));
  console.log("Valores:", somar(realizadosValidos, 4));

  console.log("\n=== REALIZADOS SEM META CORRESPONDENTE ===");

  const repsMeta = new Set(
    metasOutubro.map(r => cod(r[2]))
  );

  realizadosValidos
    .filter(r => !repsMeta.has(cod(r[0])))
    .forEach(r => {
      console.log(
        "REP:", cod(r[0]),
        "| NOME:", r[1],
        "| PARES:", num(r[10]),
        "| VALOR:", num(r[4])
      );
    });
  console.log("\n=== REPRESENTANTES SEM CORRESPONDENCIA ===");
  metaSemRealizado.forEach(r =>
    console.log(cod(r[2]), "-", r[3])
  );

})().catch(console.error);

