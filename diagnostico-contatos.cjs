const drive = require("./src/lib/google-drive-data.cjs");
const XLSX = require("xlsx");

async function main() {
  const arquivos = await drive.listarArquivos();
  const arquivo = arquivos.find(a => a.nome === "DADOS PRETIVIA CLIENTES.xlsx");

  if (!arquivo) throw new Error("Arquivo não encontrado.");

  const buffer = await drive.baixarArquivo(arquivo);
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];

  const matriz = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: ""
  });

  const normalizar = v => String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

  const indice = matriz.findIndex(linha =>
    linha.some(v => normalizar(v) === "CODIGO CLIENTE")
  );

  const cabecalho = matriz[indice] || [];

  console.log("ARQUIVO:", arquivo.nome);
  console.log("ATUALIZADO:", arquivo.atualizadoEm);
  console.log("TOTAL DE COLUNAS:", cabecalho.length);

  cabecalho.forEach((coluna, i) => {
    console.log(`${i + 1}: ${coluna}`);
  });

  const colunaCodigo = cabecalho.findIndex(
    v => normalizar(v) === "CODIGO CLIENTE"
  );

  const registros = matriz.slice(indice + 1).filter(linha =>
    String(linha[colunaCodigo] ?? "").trim().replace(/\.0$/, "") === "10134"
  );

  console.log("REGISTROS DO CLIENTE 10134:", registros.length);

  for (const linha of registros) {
    cabecalho.forEach((nome, i) => {
      if (/ENDERE|BAIRRO|CIDADE|^UF$|TELEFONE|WHATSAPP|EMAIL|CONTATO/i.test(nome)) {
        console.log(`${nome}: ${linha[i] ?? ""}`);
      }
    });
  }
}

main().catch(console.error);
