const fs = require("fs");

const arquivo = "src/lib/comercial-data.ts";
let codigo = fs.readFileSync(arquivo, "utf8");

function substituir(antigo, novo, descricao) {
  const ocorrencias = codigo.split(antigo).length - 1;

  if (ocorrencias !== 1) {
    throw new Error(
      `${descricao}: esperada 1 ocorrência, encontradas ${ocorrencias}`
    );
  }

  codigo = codigo.replace(antigo, novo);
  console.log("OK:", descricao);
}

// 1. Importar o cadastro oficial.
substituir(
  'import fs from "fs";',
  `import fs from "fs";
import {
  carregarMapaRepresentantes,
  normalizarRepresentante,
} from "./representantes-oficiais";`,
  "Importação do módulo oficial"
);

// 2. Carregar o cadastro junto das demais bases.
substituir(
  'const [carteira, vendas, fin, produtosAutorizados, nomesReferencias, municipios] = await Promise.all([',
  `const [carteira, vendas, fin, produtosAutorizados, nomesReferencias, municipios, mapaRepresentantes] = await Promise.all([`,
  "Variáveis da carga"
);

substituir(
  '  medirBase("MUNICIPIOS", carregarMunicipios),',
  `  medirBase("MUNICIPIOS", carregarMunicipios),
  medirBase("REPRESENTANTES", carregarMapaRepresentantes),`,
  "Consulta ao Supabase"
);

// 3. Normalizar vendas históricas e carteira.
substituir(
  '      const latest = new Map<',
  `      // Normalização oficial dos representantes.
      // Não altera os arquivos originais.
      for (const v of vendas) {
        const oficial = normalizarRepresentante(v.rep, mapaRepresentantes);
        v.rep = oficial.codigo;

        if (oficial.supervisor) {
          v.sup = oficial.supervisor;
        }
      }

      for (const c of carteira) {
        const oficial = normalizarRepresentante(c.rep, mapaRepresentantes);
        c.rep = oficial.codigo;

        if (oficial.supervisor) {
          c.sup = oficial.supervisor;
        }
      }

      // Remover duplicidades da carteira após a conversão.
      const carteiraNormalizada = new Map<string, (typeof carteira)[number]>();

      for (const c of carteira) {
        carteiraNormalizada.set(\`\${c.codigo}|\${c.rep}\`, c);
      }

      carteira.length = 0;
      carteira.push(...carteiraNormalizada.values());

      console.log("[REPRESENTANTES] Cadastro oficial:", mapaRepresentantes.cadastro.size);
      console.log("[REPRESENTANTES] De/Para:", mapaRepresentantes.dePara.size);
      console.log("[REPRESENTANTES] Carteira normalizada:", carteira.length);
      console.log("[REPRESENTANTES] Vendas normalizadas:", vendas.length);

      const latest = new Map<`,
  "Normalização de carteira e vendas"
);

// 4. Impedir que a venda antiga sobrescreva a regional oficial.
substituir(
  `        c.sup =
          latest.get(c.rep)?.sup ||
          cleanSupervisor(c.sup);`,
  `        const regionalOficial = normalizarRepresentante(
          c.rep,
          mapaRepresentantes
        ).supervisor;

        c.sup =
          regionalOficial ||
          latest.get(c.rep)?.sup ||
          cleanSupervisor(c.sup);`,
  "Prioridade da regional oficial"
);

fs.writeFileSync(arquivo, codigo, "utf8");

console.log("\nALTERAÇÃO APLICADA.");
