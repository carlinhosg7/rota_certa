const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const XLSX = require("xlsx");
const { createClient } = require("@supabase/supabase-js");
const { listarArquivos, baixarArquivo } =
  require("./src/lib/google-drive-data.cjs");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const codigo = v =>
  String(v ?? "").trim().replace(/\.0+$/, "");

async function executar() {
  const nome = "REP MONTAR ANALISES_ATUALIZADO 2026.xlsx";
  const arquivo = (await listarArquivos()).find(a => a.nome === nome);

  if (!arquivo) throw new Error("Arquivo não encontrado.");

  const wb = XLSX.read(await baixarArquivo(arquivo), {
    type: "buffer"
  });

  const linhas = XLSX.utils.sheet_to_json(
    wb.Sheets[wb.SheetNames[0]],
    { header: 1, defval: "", raw: true }
  ).slice(2);

  const cadastro = new Map();
  const dePara = new Map();
  const conflitos = [];

  for (const r of linhas) {
    const atual = codigo(r[0]);
    if (!atual) continue;

    if (cadastro.has(atual)) {
      conflitos.push(`Código atual duplicado: ${atual}`);
    }

    cadastro.set(atual, {
      codigo_rep: atual,
      nome_rep: String(r[2] || "").trim(),
      regional: String(r[5] || "").trim().toUpperCase(),
      ativo: true
    });
  }

  for (const r of linhas) {
    const atual = codigo(r[0]);
    if (!atual) continue;

    const antigos = String(r[1] ?? "")
      .split(/[,.]/)
      .map(codigo)
      .filter(Boolean);

    for (const antigo of antigos) {
      if (antigo === atual) continue;

      // Representantes atuais nunca podem ser substituídos.
      if (cadastro.has(antigo)) {
        if (antigo !== "19" || atual !== "297") {
          conflitos.push(`Código ativo ${antigo} -> ${atual}`);
        }
        continue;
      }

      if (dePara.has(antigo) && dePara.get(antigo) !== atual) {
        conflitos.push(`Múltiplos destinos para ${antigo}`);
        continue;
      }

      dePara.set(antigo, atual);
    }
  }

  if (
    cadastro.size !== 50 ||
    dePara.size !== 38 ||
    conflitos.length
  ) {
    console.log("CADASTRO:", cadastro.size);
    console.log("DE/PARA:", dePara.size);
    console.log("CONFLITOS:", conflitos);
    throw new Error("Validação falhou. Importação cancelada.");
  }

  console.log("Validação aprovada.");

  const { count, error: erroCadastro } = await supabase
    .from("representantes_cadastro")
    .select("*", { count: "exact", head: true });

  if (erroCadastro) throw erroCadastro;

  if (count !== 0) {
    throw new Error("Cadastro já possui dados. Importação cancelada.");
  }

  const { count: qtdDePara, error: erroDePara } = await supabase
    .from("representantes_de_para")
    .select("*", { count: "exact", head: true });

  if (erroDePara) throw erroDePara;

  const { count: qtdHistorico, error: erroHistorico } = await supabase
    .from("representantes_historico")
    .select("*", { count: "exact", head: true });

  if (erroHistorico) throw erroHistorico;

  if (qtdDePara !== 0 || qtdHistorico !== 0) {
    throw new Error("Existem registros anteriores. Importação cancelada.");
  }

  const registrosCadastro = [...cadastro.values()];

  const registrosDePara = [...dePara].map(([antigo, atual]) => ({
    codigo_antigo: antigo,
    codigo_atual: atual,
    origem: "IMPORTACAO_EXCEL"
  }));

  const registrosHistorico = [...dePara].map(([antigo, atual]) => ({
    codigo_anterior: antigo,
    codigo_novo: atual,
    nome_novo: cadastro.get(atual)?.nome_rep || null,
    regional_nova: cadastro.get(atual)?.regional || null,
    data_efetiva: null,
    usuario_responsavel: "IMPORTACAO_INICIAL",
    origem: "IMPORTACAO_EXCEL",
    motivo: "Importação inicial do cadastro de representantes",
    observacao: "Data efetiva e regional anterior não informadas na origem."
  }));

  const gravar = async (tabela, dados) => {
    const { error } = await supabase.from(tabela).insert(dados);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    console.log(`${tabela}: ${dados.length} registros gravados`);
  };

  await gravar("representantes_cadastro", registrosCadastro);
  await gravar("representantes_de_para", registrosDePara);
  await gravar("representantes_historico", registrosHistorico);

  console.log("\nIMPORTAÇÃO CONCLUÍDA.");
  console.log("Representante 19 protegido.");
}

executar().catch(e => {
  console.error("\nERRO:", e.message);
  process.exitCode = 1;
});
