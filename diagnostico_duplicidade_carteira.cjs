const fs = require("node:fs");
const path = require("node:path");
const { parquetReadObjects } = require("hyparquet");

const CAMPOS = [
  "Codigo Cliente",
  "Codigo Representante",
  "Numero Pedido",
  "Codigo Linha",
  "Referencia",
  "Tipo Pedido",
  "Qtd Venda",
  "Vlr Venda"
];

function valor(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function chave(r) {
  return JSON.stringify(CAMPOS.map(c => valor(r[c])));
}

async function executar() {
  const arquivos = [];

  for (let i = 1; i <= 6; i++) {
    const nome = `DADOS_PREDITIVA_${i}.parquet`;
    const caminho = path.join(process.cwd(), nome);

    if (!fs.existsSync(caminho)) {
      throw new Error(`Arquivo ausente: ${nome}`);
    }

    arquivos.push({ nome, caminho });
  }

  const chavesGlobais = new Map();
  const resultados = [];

  console.log("\n=== DUPLICIDADES ENTRE PARQUETS ===");

  for (const arquivo of arquivos) {
    const buffer = fs.readFileSync(arquivo.caminho);

    const file = {
      byteLength: buffer.length,
      slice: async (start, end) =>
        Uint8Array.from(buffer.subarray(start, end)).buffer
    };

    const chavesArquivo = new Set();

    let linhas = 0;
    let repetidasNoArquivo = 0;
    let existentesEmArquivosAnteriores = 0;

    const lote = 5000;

    for (let inicio = 0; ; inicio += lote) {
      const rows = await parquetReadObjects({
        file,
        rowStart: inicio,
        rowEnd: inicio + lote
      });

      if (!rows.length) break;

      for (const r of rows) {
        linhas++;

        const k = chave(r);

        if (chavesArquivo.has(k)) {
          repetidasNoArquivo++;
        } else {
          chavesArquivo.add(k);

          if (chavesGlobais.has(k)) {
            existentesEmArquivosAnteriores++;
          } else {
            chavesGlobais.set(k, arquivo.nome);
          }
        }
      }

      if (rows.length < lote) break;
    }

    const resultado = {
      arquivo: arquivo.nome,
      linhas,
      chavesDistintas: chavesArquivo.size,
      repetidasNoArquivo,
      existentesEmArquivosAnteriores
    };

    resultados.push(resultado);

    console.log("\n" + arquivo.nome);
    console.log("Linhas:", linhas);
    console.log("Chaves distintas:", chavesArquivo.size);
    console.log("Repetidas dentro do arquivo:", repetidasNoArquivo);
    console.log(
      "Chaves existentes em arquivos anteriores:",
      existentesEmArquivosAnteriores
    );
  }

  console.log("\n=== RESULTADO GLOBAL ===");

  const totalLinhas = resultados.reduce(
    (s, r) => s + r.linhas, 0
  );

  console.log("Total de linhas:", totalLinhas);
  console.log("Chaves distintas globais:", chavesGlobais.size);
  console.log(
    "Linhas excedentes por chave:",
    totalLinhas - chavesGlobais.size
  );

  console.log(
    "\nATENCAO: chaves iguais nao comprovam duplicidade real."
  );

  const dir = path.join(process.cwd(), "diagnosticos");
  fs.mkdirSync(dir, { recursive: true });

  const destino = path.join(
    dir,
    "duplicidade_carteira_2027.json"
  );

  fs.writeFileSync(
    destino,
    JSON.stringify({
      camposComparacao: CAMPOS,
      resultados,
      totalLinhas,
      chavesDistintasGlobais: chavesGlobais.size,
      linhasExcedentesPorChave:
        totalLinhas - chavesGlobais.size
    }, null, 2),
    "utf8"
  );

  console.log("\nRelatorio:", destino);
}

executar().catch(e => {
  console.error(e.stack || e.message);
  process.exitCode = 1;
});
