const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { loadEnvConfig } = require("@next/env");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.resolve(__dirname, "..");
loadEnvConfig(ROOT);

const ARQUIVO = String.raw`I:\Meu Drive\DADOS_SALES_INT\META REATIVICAO.xlsx`;
const ABA = "Mes Atual_MAIO_23";
const CAMPANHA = "CONQUISTE_AMOSTRA_2027";
const IMPORTAR = process.argv.includes("--importar");

const MESES = [
  ["Novembro", "2026-11-01"],
  ["Dezembro", "2026-12-01"],
  ["Janeiro", "2027-01-01"],
  ["Fevereiro", "2027-02-01"],
  ["Março", "2027-03-01"],
  ["abril", "2027-04-01"]
];

function codigo(v) {
  return String(v ?? "").trim().replace(/\.0+$/, "");
}

function arredondar(v, rep, mes) {
  if (v === null || v === undefined ||
      String(v).trim() === "") {
    return null;
  }

  const n = typeof v === "number"
    ? v
    : Number(String(v).trim().replace(",", "."));

  if (!Number.isFinite(n) || n < 0) {
    throw Error(`Meta invalida: ${rep} / ${mes} = ${v}`);
  }

  // Arredondamento matematico normal para valores nao negativos.
  return Math.round(n + Number.EPSILON);
}

function dataArquivo() {
  return new Date().toISOString()
    .replace(/[:.]/g, "-");
}

async function main() {
  if (!fs.existsSync(ARQUIVO)) {
    throw Error("Excel nao encontrado: " + ARQUIVO);
  }

  const wb = XLSX.readFile(ARQUIVO, {
    cellDates: true
  });

  const ws = wb.Sheets[ABA];

  if (!ws) {
    throw Error("Aba nao encontrada: " + ABA);
  }

  const linhas = XLSX.utils.sheet_to_json(ws, {
    defval: null,
    raw: true
  });

  if (!linhas.length) {
    throw Error("Planilha vazia.");
  }

  const campos = [
    "CODIGO_REP",
    "REP",
    ...MESES.map(x => x[0])
  ];

  for (const campo of campos) {
    if (!Object.prototype.hasOwnProperty.call(linhas[0], campo)) {
      throw Error("Coluna ausente: " + campo);
    }
  }

  const registros = [];
  const pendencias = [];
  const representantes = new Set();
  const resumo = new Map();

  for (const [mes, competencia] of MESES) {
    resumo.set(competencia, {
      competencia,
      representantes: 0,
      meta_clientes: 0
    });
  }

  for (const linha of linhas) {
    const rep = codigo(linha.CODIGO_REP);

    if (!rep) continue;

    if (!/^\d+$/.test(rep)) {
      throw Error("Codigo de representante invalido: " + rep);
    }

    if (representantes.has(rep)) {
      throw Error("Representante duplicado no Excel: " + rep);
    }

    representantes.add(rep);

    const nome = String(linha.REP ?? "").trim();

    if (!nome) {
      throw Error("Representante sem nome: " + rep);
    }

    for (const [coluna, competencia] of MESES) {
      const meta = arredondar(linha[coluna], rep, competencia);

      if (meta === null) {
        pendencias.push({
          representante: rep,
          nome,
          competencia,
          motivo: "META_VAZIA_NO_EXCEL"
        });
        continue;
      }

      registros.push({
        campanha: CAMPANHA,
        competencia,
        codigo_representante: rep,
        representante_nome: nome,
        meta_clientes: meta
      });

      const item = resumo.get(competencia);

      item.representantes++;
      item.meta_clientes += meta;
    }
  }

  // O arquivo analisado anteriormente possui 50 representantes.
  if (representantes.size !== 50) {
    throw Error(
      "Esperados 50 representantes, encontrados " +
      representantes.size +
      ". Importacao interrompida."
    );
  }

  if (registros.length + pendencias.length !== 300) {
    throw Error(
      "Quantidade inconsistente: registros=" +
      registros.length +
      ", pendencias=" + pendencias.length
    );
  }

  console.log("\n=== METAS VAZIAS NO EXCEL ===");
  console.table(pendencias);

  const wallace = registros.find(
    r =>
      r.codigo_representante === "194" &&
      r.competencia === "2026-11-01"
  );

  if (!wallace || wallace.meta_clientes !== 2) {
    throw Error(
      "Validacao Wallace falhou: novembro deve ser 2 clientes."
    );
  }

  console.log("\n=== METAS OFICIAIS DO EXCEL ===");
  console.table([...resumo.values()]);

  console.log("\nREPRESENTANTES:", representantes.size);
  console.log("REGISTROS:", registros.length);
  console.log("WALLACE NOVEMBRO:", wallace.meta_clientes);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw Error("Credenciais Supabase ausentes no ambiente.");
  }

  const db = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  // Backup completo dos registros atuais da campanha.
  const anteriores = [];

  for (let offset = 0; offset < 10000; offset += 500) {
    const { data, error } = await db
      .from("kidy_campanha_metas_reativacao")
      .select("*")
      .eq("campanha", CAMPANHA)
      .order("competencia")
      .order("codigo_representante")
      .range(offset, offset + 499);

    if (error) throw error;

    anteriores.push(...(data ?? []));

    if ((data ?? []).length < 500) break;

    if (offset >= 9500) {
      throw Error("Limite de leitura atingido.");
    }
  }

  const pasta = path.join(
    ROOT,
    "_diagnosticos",
    "importacao_metas_reativacao"
  );

  fs.mkdirSync(pasta, { recursive: true });

  const identificador = dataArquivo();

  const backup = path.join(
    pasta,
    `backup_supabase_${identificador}.json`
  );

  const previa = path.join(
    pasta,
    `previa_excel_${identificador}.json`
  );

  fs.writeFileSync(
    backup,
    JSON.stringify(anteriores, null, 2),
    "utf8"
  );

  fs.writeFileSync(
    previa,
    JSON.stringify({
      arquivo: ARQUIVO,
      aba: ABA,
      criterio: "ARREDONDAMENTO_NORMAL",
      pendencias,
      resumo: [...resumo.values()],
      registros
    }, null, 2),
    "utf8"
  );

  const indiceAnterior = new Map(
    anteriores.map(r => [
      `${r.competencia}|${codigo(r.codigo_representante)}`,
      r
    ])
  );

  const alterados = registros.filter(r => {
    const anterior = indiceAnterior.get(
      `${r.competencia}|${r.codigo_representante}`
    );

    return !anterior ||
      Number(anterior.meta_clientes) !== r.meta_clientes ||
      String(anterior.representante_nome ?? "").trim() !==
        r.representante_nome;
  });

  console.log("\n=== COMPARACAO COM SUPABASE ===");
  console.log("Registros atuais:", anteriores.length);
  console.log("Registros oficiais no Excel:", registros.length);
  console.log("Registros novos ou alterados:", alterados.length);
  console.log("Backup:", backup);
  console.log("Previa:", previa);

  if (!IMPORTAR) {
    console.log("\nMODO PREVIA - NENHUMA META ALTERADA");
    console.log(
      "Para importar: node scripts\\importar-metas-reativacao.cjs --importar"
    );
    return;
  }

  console.log("\n=== INICIANDO IMPORTACAO ===");

  // Upsert apenas dos registros novos ou alterados.
  // Nunca apagar competencias anteriores automaticamente.
  for (let i = 0; i < alterados.length; i += 50) {
    const lote = alterados.slice(i, i + 50);

    const { error } = await db
      .from("kidy_campanha_metas_reativacao")
      .upsert(lote, {
        onConflict:
          "campanha,competencia,codigo_representante"
      });

    if (error) {
      throw Error(
        "Falha na gravacao do lote " +
        (Math.floor(i / 50) + 1) +
        ": " + error.message +
        ". Consulte o backup: " + backup
      );
    }

    console.log(
      "Gravados:",
      Math.min(i + lote.length, alterados.length),
      "/",
      alterados.length
    );
  }

  // Conferencia apos a importacao.
  const verificados = [];

  for (let offset = 0; offset < 10000; offset += 500) {
    const { data, error } = await db
      .from("kidy_campanha_metas_reativacao")
      .select("competencia,codigo_representante,meta_clientes")
      .eq("campanha", CAMPANHA)
      .order("competencia")
      .order("codigo_representante")
      .range(offset, offset + 499);

    if (error) throw error;

    verificados.push(...(data ?? []));

    if ((data ?? []).length < 500) break;
    if (offset >= 9500) throw Error("Limite de conferencia atingido.");
  }

  const indiceFinal = new Map(
    verificados.map(r => [
      `${r.competencia}|${codigo(r.codigo_representante)}`,
      Number(r.meta_clientes)
    ])
  );

  let divergencias = 0;

  for (const r of registros) {
    const chave = `${r.competencia}|${r.codigo_representante}`;

    if (indiceFinal.get(chave) !== r.meta_clientes) {
      divergencias++;
      console.error("DIVERGENCIA:", chave);
    }
  }

  if (divergencias) {
    throw Error(
      "Foram encontradas " + divergencias +
      " divergencias. Confira o backup."
    );
  }

  console.log("\nIMPORTACAO VALIDADA");
  console.log("Metas oficiais conferidas:", registros.length);
  console.log("Registros totais atuais:", verificados.length);
  console.log("Divergencias:", divergencias);
  console.log("Backup:", backup);
  console.log("SEM COMMIT - SEM PUSH - SEM DEPLOY");
}

main().catch(e => {
  console.error("\nERRO:", e.message);
  process.exitCode = 1;
});