const fs = require("fs");

const arquivo = "src/lib/comercial-data.ts";
let codigo = fs.readFileSync(arquivo, "utf8");

function alterar(antigo, novo, descricao) {
  const ocorrencias = codigo.split(antigo).length - 1;

  if (ocorrencias !== 1) {
    throw new Error(
      `${descricao}: esperado 1 trecho, encontrados ${ocorrencias}`
    );
  }

  codigo = codigo.replace(antigo, novo);
  console.log("OK:", descricao);
}

// A versão deve pertencer ao resultado efetivamente processado.
alterar(
  "      return { carteira, vendas, produtosAutorizados, nomesReferencias, municipios, loadedAt: Date.now() };",
  `      return {
        carteira,
        vendas,
        produtosAutorizados,
        nomesReferencias,
        municipios,
        loadedAt: Date.now(),
        versaoRepresentantes: mapaRepresentantes.versao,
      };`,
  "Registrar versão aplicada na carga"
);

// Remover a segunda consulta, que poderia registrar outra versão.
alterar(
  `      const mapaAplicado = await carregarMapaRepresentantes();
      versaoCacheRepresentantes = mapaAplicado.versao;`,
  `      versaoCacheRepresentantes = novoCache.versaoRepresentantes;`,
  "Utilizar versão efetivamente processada"
);

// Acrescentar a propriedade ao tipo Cache.
const tipoCache = /type Cache\s*=\s*\{/g;
const encontrados = [...codigo.matchAll(tipoCache)];

if (encontrados.length !== 1) {
  throw new Error(
    `Tipo Cache: esperado 1, encontrados ${encontrados.length}`
  );
}

codigo = codigo.replace(
  tipoCache,
  "type Cache = {\n  versaoRepresentantes: string;"
);

console.log("OK: Tipo Cache atualizado");

// Backup antes da gravação.
const backup = arquivo + ".backup-versao-" +
  new Date().toISOString().replace(/[:.]/g, "-") + ".bak";

fs.copyFileSync(arquivo, backup);
fs.writeFileSync(arquivo, codigo, "utf8");

console.log("BACKUP:", backup);
console.log("CONSISTÊNCIA DO CACHE CORRIGIDA.");
