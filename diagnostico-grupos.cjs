const fs = require("fs");

const dados = JSON.parse(
  fs.readFileSync(
    "dados-processados/carteira-2027/clientes.json",
    "utf8"
  )
);

const clientes = Array.isArray(dados) ? dados : dados.clientes;

const grupos = new Set(
  clientes
    .map(c => String(c.grupoCliente ?? "").trim())
    .filter(Boolean)
);

const codigos = new Set(
  clientes
    .map(c => String(c.codigoCliente ?? "").trim())
    .filter(Boolean)
);

const cnpjs = new Set(
  clientes
    .map(c => String(c.cnpj ?? "").replace(/\D/g, ""))
    .filter(Boolean)
);

console.log("\n=== CONTAGEM REAL DA BASE ===");
console.log("DISTINCTCOUNT Grupo Cliente:", grupos.size);
console.log("DISTINCTCOUNT Codigo Cliente:", codigos.size);
console.log("DISTINCTCOUNT CNPJ:", cnpjs.size);
console.log("Total de registros:", clientes.length);
