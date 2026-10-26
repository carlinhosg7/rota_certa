const fs = require("fs");

const arquivo = "src/lib/comercial-data.ts";
let codigo = fs.readFileSync(arquivo, "utf8");

function substituir(antigo, novo, descricao) {
  const quantidade = codigo.split(antigo).length - 1;

  if (quantidade !== 1) {
    throw new Error(
      `${descricao}: esperado 1 ocorrÃªncia, encontradas ${quantidade}`
    );
  }

  codigo = codigo.replace(antigo, novo);
}

substituir(
  'import fs from "fs";',
  `import fs from "fs";
import {
  atualizarCatalogoDrive,
  lerArquivoComercial,
  prepararParquetsDrive,
  pastaParquets
} from "./google-drive-adapter";`,
  "ImportaÃ§Ã£o"
);

// Os downloads Excel/CSV passam a usar o adaptador.
const padraoFetch = /const response = await fetch\(url, \{ cache: "no-store" \}\);[\s\S]*?const buffer = Buffer\.from\(await response\.arrayBuffer\(\)\);/g;

const ocorrencias = [...codigo.matchAll(padraoFetch)];

if (ocorrencias.length !== 5) {
  throw new Error(
    `Esperadas 5 leituras Excel/CSV; encontradas ${ocorrencias.length}.`
  );
}

codigo = codigo.replace(
  padraoFetch,
  `const buffer = await lerArquivoComercial(nome);`
);

// Parquets passam a ser lidos da pasta temporÃ¡ria.
substituir(
  '.readdirSync(DATA_DIR)',
  '.readdirSync(pastaParquets())',
  "Listagem de Parquets"
);

substituir(
  'const arquivo = path.join(DATA_DIR, f);',
  'const arquivo = path.join(pastaParquets(), f);',
  "Caminho do Parquet"
);

// PreparaÃ§Ã£o da fonte antes de carregar os dados.
substituir(
  'await prepararBasesGitHub();',
  `if (
        (process.env.KIDY_DATA_SOURCE || "github").toLowerCase() === "drive"
      ) {
        await atualizarCatalogoDrive();
        await prepararParquetsDrive();
      } else {
        await prepararBasesGitHub();
      }`,
  "PreparaÃ§Ã£o das bases"
);

fs.writeFileSync(arquivo, codigo, "utf8");

console.log("comercial-data.ts atualizado.");
