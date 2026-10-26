const fs = require("node:fs");
const path = require("node:path");
const { parquetReadObjects } = require("hyparquet");
const XLSX = require("xlsx");

const root = process.cwd();

async function executar() {
  console.log("\n=== CADASTRO DE CLIENTES ===");

  const candidatos = [
    "I:\\Meu Drive\\DADOS_SALES_INT\\DADOS PRETIVIA CLIENTES.xlsx",
    path.join(root, "DADOS PRETIVIA CLIENTES.xlsx"),
    path.join(root, "base clientes.xlsx")
  ];

  const cadastro = candidatos.find(fs.existsSync);

  if (cadastro) {
    console.log("Arquivo:", cadastro);

    const wb = XLSX.readFile(cadastro, {
      bookSheets: true
    });

    console.log("Abas:", wb.SheetNames.join(" | "));
  } else {
    console.log("CADASTRO NAO LOCALIZADO");
  }

  console.log("\n=== DIAGNOSTICO DOS PARQUETS ===");

  for (let i = 1; i <= 6; i++) {
    const nome = `DADOS_PREDITIVA_${i}.parquet`;
    const caminho = path.join(root, nome);

    console.log("\nArquivo:", nome);

    if (!fs.existsSync(caminho)) {
      console.log("STATUS: AUSENTE");
      continue;
    }

    try {
      const buffer = fs.readFileSync(caminho);

      // Mesmo formato de leitura que funcionou
      // no diagnostico anterior.
      const file = {
        byteLength: buffer.length,
        slice: async (start, end) =>
          Uint8Array.from(buffer.subarray(start, end)).buffer
      };

      const rows = await parquetReadObjects({
        file,
        rowStart: 0,
        rowEnd: 100
      });

      const colunas = Object.keys(rows[0] || {});

      const repetidas = colunas.filter(
        c => /_\d+$/.test(c)
      );

      const preenchidas = repetidas.filter(
        c => rows.some(
          r =>
            r[c] !== null &&
            r[c] !== undefined &&
            r[c] !== ""
        )
      );

      console.log("STATUS: OK");
      console.log("Registros analisados:", rows.length);
      console.log("Total de colunas:", colunas.length);
      console.log("Colunas repetidas:", repetidas.length);
      console.log(
        "Repetidas preenchidas na amostra:",
        preenchidas.length
      );

      console.log(
        "Campos repetidos preenchidos:",
        preenchidas.slice(0, 20).join(" | ") || "Nenhum"
      );

      const principais = [
        "Codigo Cliente",
        "Grupo Cliente",
        "Codigo Representante",
        "Codigo Supervisor",
        "Numero Pedido",
        "Data Ultima Compra",
        "Qtd Venda",
        "Vlr Venda"
      ];

      for (const campo of principais) {
        const quantidade = rows.filter(
          r =>
            r[campo] !== null &&
            r[campo] !== undefined &&
            r[campo] !== ""
        ).length;

        console.log(
          `${campo}: ${quantidade}/${rows.length}`
        );
      }

    } catch (erro) {
      console.log("STATUS: ERRO");
      console.log(erro.stack || erro.message);
    }
  }
}

executar().catch(console.error);
