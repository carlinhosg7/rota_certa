const fs = require("fs");

const destino = "src/lib/comercial-data.ts";
const backup = "src/lib/comercial-data.backup-20261020-144610.ts.bak";

if (!fs.existsSync(backup)) {
  throw new Error("Backup original não encontrado.");
}

let codigo = fs.readFileSync(backup, "utf8");

function substituir(antigo, novo, descricao) {
  const total = codigo.split(antigo).length - 1;

  if (total !== 1) {
    throw new Error(
      `${descricao}: esperada 1 ocorrência, encontradas ${total}`
    );
  }

  codigo = codigo.replace(antigo, novo);
  console.log("OK:", descricao);
}

substituir(
  'import fs from "fs";',
  `import fs from "fs";
import {
  carregarMapaRepresentantes,
  normalizarRepresentante,
} from "./representantes-oficiais";`,
  "Importação do módulo oficial"
);

substituir(
  "const [carteira, vendas, fin, produtosAutorizados, nomesReferencias, municipios] = await Promise.all([",
  "const [carteira, vendas, fin, produtosAutorizados, nomesReferencias, municipios, mapaRepresentantes] = await Promise.all([",
  "Variáveis da carga"
);

substituir(
  '  medirBase("MUNICIPIOS", carregarMunicipios),',
  `  medirBase("MUNICIPIOS", carregarMunicipios),
  medirBase("REPRESENTANTES", carregarMapaRepresentantes),`,
  "Consulta ao Supabase"
);

substituir(
  "      const latest = new Map<",
  `      // Aplicar o De/Para oficial em todas as vendas históricas.
      for (const v of vendas) {
        const oficial = normalizarRepresentante(v.rep, mapaRepresentantes);
        v.rep = oficial.codigo;

        if (oficial.supervisor) {
          v.sup = oficial.supervisor;
        }
      }

      // Aplicar o De/Para na carteira atual.
      for (const c of carteira) {
        const oficial = normalizarRepresentante(c.rep, mapaRepresentantes);
        c.rep = oficial.codigo;

        if (oficial.supervisor) {
          c.sup = oficial.supervisor;
        }
      }

      // Eliminar duplicidades após a normalização.
      const carteiraNormalizada = new Map<string, (typeof carteira)[number]>();

      for (const c of carteira) {
        carteiraNormalizada.set(\`\${c.codigo}|\${c.rep}\`, c);
      }

      carteira.length = 0;
      carteira.push(...carteiraNormalizada.values());

      console.log("[REPRESENTANTES] Cadastro:", mapaRepresentantes.cadastro.size);
      console.log("[REPRESENTANTES] De/Para:", mapaRepresentantes.dePara.size);
      console.log("[REPRESENTANTES] Carteira:", carteira.length);
      console.log("[REPRESENTANTES] Vendas:", vendas.length);

      const latest = new Map<`,
  "Normalização da carteira e das vendas"
);

// Substituição independente de espaços e quebras de linha.
const padraoRegional =
  /c\.sup\s*=\s*latest\.get\(c\.rep\)\?\.sup\s*\|\|\s*cleanSupervisor\(c\.sup\);/g;

const encontrados = [...codigo.matchAll(padraoRegional)];

if (encontrados.length !== 1) {
  throw new Error(
    `Prioridade regional: esperada 1 ocorrência, encontradas ${encontrados.length}`
  );
}

codigo = codigo.replace(
  padraoRegional,
  `const regionalOficial = normalizarRepresentante(
          c.rep,
          mapaRepresentantes
        ).supervisor;

        c.sup =
          regionalOficial ||
          latest.get(c.rep)?.sup ||
          cleanSupervisor(c.sup);`
);

console.log("OK: Prioridade da regional oficial");

// Gravar somente após todas as validações.
fs.writeFileSync(destino, codigo, "utf8");

console.log("\nINTEGRAÇÃO APLICADA COM SUCESSO.");
