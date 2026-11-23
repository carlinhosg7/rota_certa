const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { loadEnvConfig } = require("@next/env");
const { createClient } = require("@supabase/supabase-js");

loadEnvConfig(process.cwd());

const IMPORTAR = process.argv.includes("--importar");

const ARQUIVO =
  "I:\\Meu Drive\\Dados Matinal\\DADOS_2\\" +
  "INDICADORES COMERCIAIS POR  FATURAMENTO.xlsx";

const CAMPANHA = "CONQUISTE_AMOSTRA_2027";
const TABELA = "kidy_campanha_faturamento_mensal";

function falhar(mensagem) {
  throw new Error(mensagem);
}

function codigo(valor) {
  return String(valor ?? "")
    .trim()
    .replace(/\.0+$/, "");
}

function numero(valor) {
  if (valor === null || valor === undefined || valor === "") {
    return null;
  }

  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function dataBRparaISO(valor) {
  const m = String(valor).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!m) falhar("Data invalida: " + valor);

  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T12:00:00Z`);

  if (Number.isNaN(d.getTime()) ||
      d.toISOString().slice(0, 10) !== iso) {
    falhar("Data inexistente: " + valor);
  }

  return iso;
}

async function main() {
  if (!fs.existsSync(ARQUIVO)) {
    falhar("Excel nao encontrado: " + ARQUIVO);
  }

  const wb = XLSX.readFile(ARQUIVO);
  const ws = wb.Sheets["MES"];

  if (!ws) falhar("Aba MES nao encontrada.");

  const linhas = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    blankrows: false
  });

  const metadata = String(linhas[1]?.[0] ?? "");

  const periodo = metadata.match(
    /Data Entrega:\s*(\d{2}\/\d{2}\/\d{4})\s*(?:à|a)\s*(\d{2}\/\d{2}\/\d{4})/i
  );

  if (!periodo) {
    falhar("Nao foi possivel identificar o periodo do Excel.");
  }

  const inicio = dataBRparaISO(periodo[1]);
  const fim = dataBRparaISO(periodo[2]);
  const competencia = inicio.slice(0, 7) + "-01";

  if (inicio.slice(0, 7) !== fim.slice(0, 7)) {
    falhar("Relatorio cobre mais de uma competencia.");
  }

  if (inicio !== competencia) {
    falhar("A aba MES nao inicia no primeiro dia do mes.");
  }

  const proximoMes = new Date(
    `${competencia}T12:00:00Z`
  );

  proximoMes.setUTCMonth(proximoMes.getUTCMonth() + 1);
  proximoMes.setUTCDate(0);

  const ultimoDia = proximoMes.toISOString().slice(0, 10);

  if (fim !== ultimoDia) {
    falhar("A aba MES nao cobre ate o ultimo dia do mes.");
  }

  if (competencia < "2026-11-01" ||
      competencia > "2027-04-01") {
    falhar("Competencia fora da vigencia da campanha.");
  }

  const processamento = metadata.match(
    /Processado em:\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})/i
  );

  if (!processamento) {
    falhar("Data de processamento do relatorio ausente.");
  }

  const processadoEm =
    dataBRparaISO(processamento[1]) +
    "T" + processamento[2] + ":00-03:00";

  const cabecalho = linhas.findIndex(
    r => r[0] === "Codigo Representante" &&
         r.includes("Vlr Venda")
  );

  if (cabecalho < 0) {
    falhar("Cabecalho financeiro nao encontrado.");
  }

  const headers = linhas[cabecalho].map(
    v => String(v ?? "").trim()
  );

  function coluna(nome) {
    const i = headers.indexOf(nome);
    if (i < 0) falhar("Coluna nao encontrada: " + nome);
    return i;
  }

  const colRep = coluna("Codigo Representante");
  const colSup = coluna("Codigo Supervisor");
  const colValor = coluna("Vlr Venda");
  const colPares = coluna("Qtd Venda");

  const registros = [];
  const vistos = new Set();

  for (const linha of linhas.slice(cabecalho + 1)) {
    const rep = codigo(linha[colRep]);

    if (!/^\d+$/.test(rep)) continue;

    if (vistos.has(rep)) {
      falhar("Representante duplicado: " + rep);
    }

    vistos.add(rep);

    const valor = numero(linha[colValor]);
    const pares = numero(linha[colPares]);

    if (valor === null || pares === null ||
        valor < 0 || pares < 0) {
      falhar("Realizado invalido no representante " + rep);
    }

    registros.push({
      campanha: CAMPANHA,
      competencia,
      codigo_representante: rep,
      codigo_supervisor: codigo(linha[colSup]) || null,
      realizado_valor: Number(valor.toFixed(4)),
      realizado_pares: Number(pares.toFixed(4)),
      periodo_inicio: inicio,
      periodo_fim: fim,
      arquivo_origem: path.basename(ARQUIVO),
      processado_em_origem: processadoEm
    });
  }

  if (registros.length === 0) {
    falhar("Nenhum representante valido encontrado.");
  }

  const totalValor = registros.reduce(
    (s, r) => s + r.realizado_valor, 0
  );

  const totalPares = registros.reduce(
    (s, r) => s + r.realizado_pares, 0
  );

  console.log("\n=== FATURAMENTO DA CAMPANHA ===");
  console.log("Competencia:", competencia);
  console.log("Periodo:", inicio, "ate", fim);
  console.log("Processado em:", processadoEm);
  console.log("Representantes:", registros.length);
  console.log(
    "Valor:",
    totalValor.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    })
  );
  console.log(
    "Pares:",
    totalPares.toLocaleString("pt-BR")
  );

  if (!IMPORTAR) {
    console.log("\nMODO CONFERENCIA");
    console.log("Nenhum registro foi gravado.");
    console.log("\nPrimeiros registros:");
    console.table(registros.slice(0, 5));
    return;
  }

  const url = (
    process.env.SUPABASE_URL || ""
  ).trim();

  const key = (
    process.env.SUPABASE_SECRET_KEY || ""
  ).trim();

  if (!url || !key) {
    falhar(
      "SUPABASE_URL ou SUPABASE_SECRET_KEY ausentes no ambiente."
    );
  }

  const supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { data: anteriores, error: erroConsulta } =
    await supabase
      .from(TABELA)
      .select(
        "codigo_representante,realizado_valor," +
        "realizado_pares,codigo_supervisor,processado_em_origem"
      )
      .eq("campanha", CAMPANHA)
      .eq("competencia", competencia)
      .range(0, 999);

  if (erroConsulta) falhar(erroConsulta.message);

  if ((anteriores ?? []).length === 1000) {
    falhar("Limite de leitura atingido.");
  }

  const mapaAnterior = new Map(
    (anteriores ?? []).map(
      r => [codigo(r.codigo_representante), r]
    )
  );

  const mapaNovo = new Map(
    registros.map(r => [r.codigo_representante, r])
  );

  const ausentes = [...mapaAnterior.keys()].filter(
    rep => !mapaNovo.has(rep)
  );

  if (ausentes.length > 0) {
    falhar(
      "Arquivo nao contem representantes existentes no mes: " +
      ausentes.join(", ") +
      ". Importacao bloqueada para evitar dados antigos."
    );
  }

  const novos = [];
  let semAlteracao = 0;

  for (const r of registros) {
    const anterior = mapaAnterior.get(r.codigo_representante);

    if (!anterior) {
      novos.push(r);
      continue;
    }

    const anteriorData = anterior.processado_em_origem;

    if (
      anteriorData &&
      new Date(processadoEm).getTime() <
      new Date(anteriorData).getTime()
    ) {
      falhar(
        "Excel mais antigo que o banco para o representante " +
        r.codigo_representante
      );
    }

    const mudou =
      Math.abs(Number(anterior.realizado_valor) -
        r.realizado_valor) > 0.00005 ||
      Math.abs(Number(anterior.realizado_pares) -
        r.realizado_pares) > 0.00005 ||
      codigo(anterior.codigo_supervisor) !==
        codigo(r.codigo_supervisor);

    if (!mudou) {
      semAlteracao++;
      continue;
    }

    if (
      anteriorData &&
      new Date(processadoEm).getTime() ===
      new Date(anteriorData).getTime()
    ) {
      falhar(
        "Valores diferentes com mesmo horario de origem: " +
        r.codigo_representante
      );
    }

    novos.push(r);
  }

  if (novos.length === 0) {
    console.log("\nBanco ja esta atualizado.");
    return;
  }

  const { error: erroGravacao } = await supabase
    .from(TABELA)
    .upsert(novos, {
      onConflict:
        "campanha,competencia,codigo_representante"
    });

  if (erroGravacao) {
    falhar("Falha na gravacao: " + erroGravacao.message);
  }

  console.log("\nSINCRONIZACAO CONCLUIDA");
  console.log("Linhas inseridas ou atualizadas:", novos.length);
  console.log("Linhas sem alteracao:", semAlteracao);
  console.log("Competencia preservada:", competencia);
  console.log("Auditoria ativa para atualizacoes.");
  console.log("A VIEW DA CAMPANHA NAO FOI ALTERADA.");
}

main().catch(erro => {
  console.error("\nERRO:", erro.message);
  process.exitCode = 1;
});