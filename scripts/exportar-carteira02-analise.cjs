const fs = require("fs");
const { loadEnvConfig } = require("@next/env");
const { createClient } = require("@supabase/supabase-js");

loadEnvConfig(process.cwd());

const destino = process.argv[2];

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  throw new Error("Credenciais Supabase ausentes.");
}

const db = createClient(url, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function main() {
  const clientes = new Set();

  for (let inicio = 0; inicio < 20000; inicio += 1000) {
    const { data, error } = await db
      .from("kidy_reativacao_clientes")
      .select("codigo_cliente")
      .eq("competencia", "2026-10-01")
      .order("codigo_cliente")
      .range(inicio, inicio + 999);

    if (error) throw error;

    for (const item of data ?? []) {
      const codigo = String(item.codigo_cliente ?? "")
        .trim()
        .replace(/\.0+$/, "");

      if (codigo) clientes.add(codigo);
    }

    if ((data ?? []).length < 1000) break;

    if (inicio === 19000) {
      throw new Error("Limite de paginacao atingido.");
    }
  }

  if (clientes.size !== 8987) {
    throw new Error(
      "Quantidade inesperada de clientes na Carteira 02: " +
      clientes.size
    );
  }

  fs.writeFileSync(
    destino,
    JSON.stringify([...clientes]),
    "utf8"
  );

  console.log("CARTEIRA 02 CARREGADA:", clientes.size);
}

main().catch(e => {
  console.error("ERRO:", e.message);
  process.exitCode = 1;
});