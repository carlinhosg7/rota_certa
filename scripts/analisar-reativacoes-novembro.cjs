const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { loadEnvConfig } = require("@next/env");
const { createClient } = require("@supabase/supabase-js");

loadEnvConfig(process.cwd());

const pasta = "I:\\Meu Drive\\DADOS\\DADOS 4";

const arquivos = [
  "2026 10-23 A 09-11.xlsx",
  "2026 - 10-11.xlsx",
  "2026 - 13-11.xlsx",
  "2026 - 18-11.xlsx"
];

const inicio = "2026-11-09";
const fim = "2026-11-23";

const cod = v => String(v ?? "")
  .trim()
  .replace(/\.0+$/, "");

function dataISO(v) {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }

  const s = String(v ?? "").trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }

  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  return null;
}

function csvValor(v) {
  const s = String(v ?? "");
  return '"' + s.replace(/"/g, '""') + '"';
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("Credenciais Supabase nao configuradas.");
  }

  const db = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  console.log("=== CARREGANDO CARTEIRA 02 ===");

  const carteira = new Set();

  for (let pos = 0; pos < 20000; pos += 1000) {
    const { data, error } = await db
      .from("kidy_reativacao_clientes")
      .select("codigo_cliente")
      .eq("competencia", "2026-10-01")
      .order("codigo_cliente")
      .range(pos, pos + 999);

    if (error) throw error;

    for (const r of data ?? []) {
      carteira.add(cod(r.codigo_cliente));
    }

    if ((data ?? []).length < 1000) break;

    if (pos === 19000) {
      throw new Error("Limite de paginacao atingido.");
    }
  }

  console.log("Clientes da Carteira 02:", carteira.size);

  const pedidos = new Map();
  const clientesComPedido = new Set();
  let linhasPeriodo = 0;

  for (const nome of arquivos) {
    const arquivo = path.join(pasta, nome);

    if (!fs.existsSync(arquivo)) {
      throw new Error("Arquivo ausente: " + arquivo);
    }

    const wb = XLSX.readFile(arquivo, { cellDates: true });
    const ws = wb.Sheets["DADOS PREDITIVA"];

    if (!ws) throw new Error("Aba ausente em " + nome);

    const linhas = XLSX.utils.sheet_to_json(ws, {
      defval: null,
      raw: true
    });

    let totalArquivo = 0;

    for (const r of linhas) {
      const cliente = cod(r["Codigo Cliente"]);
      const pedido = cod(r["Numero Pedido"]);
      const data = dataISO(r["Data Cadastro"]);

      if (!cliente || !pedido || !data) continue;
      if (data < inicio || data > fim) continue;

      totalArquivo++;
      linhasPeriodo++;
      clientesComPedido.add(cliente);

      if (!carteira.has(cliente)) continue;

      const chave = cliente + "|" + pedido;

      const registro = {
        cliente,
        razao_social: String(r["Razao Social"] ?? ""),
        pedido,
        data,
        representante: cod(r["Codigo Representante"]),
        supervisor: cod(r["Codigo Supervisor"]),
        arquivo: nome
      };

      // Um pedido pode ocupar diversas linhas de produtos.
      // Manter apenas um registro por cliente/pedido.
      if (!pedidos.has(chave)) {
        pedidos.set(chave, registro);
      } else {
        const anterior = pedidos.get(chave);
        if (registro.data < anterior.data) {
          pedidos.set(chave, registro);
        }
      }
    }

    console.log(nome, "-> linhas no periodo:", totalArquivo);
  }

  const encontrados = [...pedidos.values()].sort(
    (a, b) =>
      a.data.localeCompare(b.data) ||
      a.cliente.localeCompare(b.cliente, "pt-BR", {
        numeric: true
      })
  );

  const clientes = new Map();

  for (const r of encontrados) {
    const atual = clientes.get(r.cliente);

    if (!atual) {
      clientes.set(r.cliente, {
        ...r,
        pedidos_distintos: 1
      });
    } else {
      atual.pedidos_distintos++;
    }
  }

  const lista = [...clientes.values()].sort(
    (a, b) =>
      a.data.localeCompare(b.data) ||
      a.cliente.localeCompare(b.cliente, "pt-BR", {
        numeric: true
      })
  );

  const porSupervisor = new Map();

  for (const r of lista) {
    porSupervisor.set(
      r.supervisor,
      (porSupervisor.get(r.supervisor) ?? 0) + 1
    );
  }

  const pastaSaida = path.join(
    process.cwd(),
    "_diagnosticos"
  );

  fs.mkdirSync(pastaSaida, { recursive: true });

  const saida = path.join(
    pastaSaida,
    "REATIVACOES_POTENCIAIS_09A23_NOV2026.csv"
  );

  const colunas = [
    "cliente",
    "razao_social",
    "data",
    "pedido",
    "pedidos_distintos",
    "representante",
    "supervisor",
    "arquivo"
  ];

  const csv = [
    colunas.join(";"),
    ...lista.map(r =>
      colunas.map(c => csvValor(r[c])).join(";")
    )
  ].join("\r\n");

  fs.writeFileSync(saida, "\uFEFF" + csv, "utf8");

  console.log("\n=== RESULTADO DA APURACAO ===");
  console.log("Periodo pesquisado:", inicio, "ate", fim);
  console.log("Clientes elegiveis na base original:", carteira.size);
  console.log("Linhas de vendas no periodo:", linhasPeriodo);
  console.log("Clientes com pedidos nos arquivos:", clientesComPedido.size);
  console.log("Pedidos distintos da Carteira 02:", pedidos.size);
  console.log("CLIENTES COM POSSIVEL REATIVACAO:", lista.length);

  console.log("\nPOR SUPERVISOR:");
  console.table(
    [...porSupervisor.entries()]
      .map(([supervisor, clientes]) => ({
        supervisor, clientes
      }))
      .sort((a, b) => b.clientes - a.clientes)
  );

  console.log("\nCLIENTES IDENTIFICADOS:");
  console.table(lista.slice(0, 30));

  console.log("\nCSV:", saida);
  console.log("NENHUM DADO ALTERADO NO SUPABASE");
  console.log(
    "RESULTADO PRELIMINAR: sujeito a elegibilidade " +
    "e validacao dos pedidos."
  );
}

main().catch(e => {
  console.error("ERRO:", e.message);
  process.exitCode = 1;
});