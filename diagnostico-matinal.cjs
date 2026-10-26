const nextEnv = require("@next/env");
nextEnv.loadEnvConfig(process.cwd());

const drive = require("./src/lib/google-drive-data.cjs");
const XLSX = require("xlsx");

async function executar() {
  const arquivos = await drive.listarArquivos();

  const arquivo = arquivos.find(
    a => a.nome === "MATINAL COMERIAL.xlsx"
  );

  if (!arquivo) {
    throw new Error("Arquivo nao encontrado no catalogo.");
  }

  console.log("Arquivo:", arquivo.nome);
  console.log("Tamanho esperado:", arquivo.tamanho);

  const buffer = await drive.baixarArquivo(arquivo);

  console.log("Download concluido:", buffer.length, "bytes");

  const workbook = XLSX.read(buffer, {
    type: "buffer"
  });

  for (const aba of workbook.SheetNames) {
    const planilha = workbook.Sheets[aba];

    const linhas = XLSX.utils.sheet_to_json(planilha, {
      header: 1,
      defval: null,
      blankrows: false
    });

    console.log("\nABA:", aba);
    console.log("LINHAS:", linhas.length);

    const cabecalho = linhas.find(
      linha => Array.isArray(linha) &&
      linha.some(c => /representante|entrada|pedido/i.test(String(c ?? "")))
    );

    console.log("CABECALHO PROVAVEL:", JSON.stringify(cabecalho ?? []));
  }
}

executar().catch(erro => {
  console.error("ERRO:", erro.message);
  process.exitCode = 1;
});
