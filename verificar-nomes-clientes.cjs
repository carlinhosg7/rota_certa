const fs = require("fs");
const XLSX = require("xlsx");

const arquivoJSON =
  "dados-processados/carteira-2027/clientes.json";

const arquivoExcel =
  "I:\\Meu Drive\\DADOS_SALES_INT\\DADOS PRETIVIA CLIENTES.xlsx";

const codigos = [
  "11187", "11188", "11189",
  "11367", "11372", "11375",
  "11377", "11382", "11388"
];

const dados = JSON.parse(
  fs.readFileSync(arquivoJSON, "utf8")
);

const wb = XLSX.readFile(arquivoExcel, {
  cellDates: true
});

const ws = wb.Sheets["DADOS PRETIVIA CLIENTES"];

const linhas = XLSX.utils.sheet_to_json(ws, {
  range: 2,
  defval: ""
});

const codigo = v =>
  String(v ?? "").trim().replace(/\.0+$/, "");

console.log("\n=== COMPARACAO DOS NOMES ===");

for (const id of codigos) {
  const cliente = dados.find(
    c => codigo(c.codigoCliente) === id
  );

  const origem = linhas.filter(
    l => codigo(l["Codigo Cliente"]) === id
  );

  console.log("\nCLIENTE:", id);

  console.log("JSON:", {
    razaoSocial: cliente?.razaoSocial,
    grupoCliente: cliente?.grupoCliente,
    dataUltimaCompra: cliente?.dataUltimaCompra,
    ultimaCompra: cliente?.ultimaCompra
  });

  console.log(
    "EXCEL:",
    origem.slice(0, 3).map(l => ({
      razaoSocial: l["Razao Social Empresa"],
      grupoCliente: l["Grupo Cliente"],
      dataUltimaCompra: l["Data Ultima Compra"]
    }))
  );
}

console.log("\n=== FINALIZADO ===");
