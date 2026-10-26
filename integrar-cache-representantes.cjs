const fs = require("fs");

const arquivo = "src/lib/comercial-data.ts";
const original = fs.readFileSync(arquivo, "utf8");
let codigo = original;

function alterar(antigo, novo, descricao) {
  const total = codigo.split(antigo).length - 1;

  if (total !== 1) {
    throw new Error(
      `${descricao}: esperado 1 trecho, encontrados ${total}`
    );
  }

  codigo = codigo.replace(antigo, novo);
  console.log("OK:", descricao);
}

alterar(
  "let versaoCacheComercial: string | null = null;",
  `let versaoCacheComercial: string | null = null;
let versaoCacheRepresentantes: string | null = null;`,
  "Versão dos representantes"
);

alterar(
  `      if (usandoDrive && cacheAtual) {
        const inicioVerificacao = performance.now();`,
  `      if (cacheAtual) {
        const mapaAtual = await carregarMapaRepresentantes();
        const representantesMudaram =
          versaoCacheRepresentantes === null ||
          mapaAtual.versao !== versaoCacheRepresentantes;

        const inicioVerificacao = performance.now();`,
  "Verificação do Supabase"
);

alterar(
  `        await atualizarCatalogoDrive(true);

        const versaoAtual = versoesCatalogoDrive();`,
  `        if (usandoDrive) {
          await atualizarCatalogoDrive(true);
        }

        const versaoAtual = usandoDrive
          ? versoesCatalogoDrive()
          : null;`,
  "Verificação condicional do Drive"
);

alterar(
  `          versaoCacheComercial !== null &&
          versaoAtual === versaoCacheComercial`,
  `          !representantesMudaram &&
          (!usandoDrive ||
            (versaoCacheComercial !== null &&
              versaoAtual === versaoCacheComercial))`,
  "Comparação das versões"
);

alterar(
  `            "[CACHE] Nenhum arquivo alterado. Reutilizando dados processados."`,
  `            "[CACHE] Drive e representantes sem alterações. Reutilizando dados processados."`,
  "Mensagem do cache"
);

alterar(
  `      const novoCache = await carregarDadosAtualizados();

      if (usandoDrive) {`,
  `      const novoCache = await carregarDadosAtualizados();

      // Registrar a versão aplicada ao novo processamento.
      // Se houver mudança posterior, a próxima verificação recarregará os dados.
      const mapaAplicado = await carregarMapaRepresentantes();
      versaoCacheRepresentantes = mapaAplicado.versao;

      if (usandoDrive) {`,
  "Atualização da versão do Supabase"
);

const backup = arquivo + ".backup-cache-" +
  new Date().toISOString().replace(/[:.]/g, "-") + ".bak";

fs.copyFileSync(arquivo, backup);
fs.writeFileSync(arquivo, codigo, "utf8");

console.log("BACKUP:", backup);
console.log("CACHE INTEGRADO COM SUCESSO.");
