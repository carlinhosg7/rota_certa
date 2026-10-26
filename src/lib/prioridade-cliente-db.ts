import "server-only";
import type { Prioridade } from "./prioridade-cliente";

const valores = new Set(["ALTO", "MEDIO", "BAIXO", "NAO_AVALIADO"]);

export function validarPrioridade(v: unknown): v is Prioridade {
  return typeof v === "string" && valores.has(v);
}

function config() {
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");

  const key = process.env.SUPABASE_SECRET_KEY || "";

  if (!url || !key) throw new Error("Supabase nao configurado");

  return {
    url,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    }
  };
}

export async function obterPrioridade(
  codigo: string
): Promise<Prioridade | null> {
  const { url, headers } = config();

  const r = await fetch(
    `${url}/rest/v1/kidy_cliente_prioridade?codigo_cliente=eq.${encodeURIComponent(codigo)}&select=classificacao&limit=1`,
    { headers, cache: "no-store" }
  );

  if (!r.ok) throw new Error(`Consulta prioridade: HTTP ${r.status}`);

  const linhas = await r.json() as { classificacao: unknown }[];

  if (!linhas.length) return null;

  if (!validarPrioridade(linhas[0].classificacao)) {
    throw new Error("Classificacao invalida no banco");
  }

  return linhas[0].classificacao;
}

export async function salvarPrioridade(
  codigo: string,
  prioridade: Prioridade,
  ator: string
) {
  const { url, headers } = config();
  const anterior = await obterPrioridade(codigo);

  const r = await fetch(
    `${url}/rest/v1/kidy_cliente_prioridade?on_conflict=codigo_cliente`,
    {
      method: "POST",
      headers: {
        ...headers,
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({
        codigo_cliente: codigo,
        classificacao: prioridade,
        atualizado_por: ator,
        atualizado_em: new Date().toISOString()
      }),
      cache: "no-store"
    }
  );

  if (!r.ok) throw new Error(`Gravacao prioridade: HTTP ${r.status}`);

  if (anterior !== prioridade) {
    const log = await fetch(
      `${url}/rest/v1/kidy_cliente_prioridade_log`,
      {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({
          codigo_cliente: codigo,
          classificacao_anterior: anterior,
          classificacao_nova: prioridade,
          alterado_por: ator
        }),
        cache: "no-store"
      }
    );

    if (!log.ok) {
      throw new Error(`Prioridade salva, auditoria falhou: HTTP ${log.status}`);
    }
  }
}