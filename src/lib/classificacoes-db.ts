import "server-only";
import { validarClassificacoes, type CodigoClassificacao } from "./classificacoes";

const endpoint = () => {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SECRET_KEY || "";
  if (!url || !key) throw new Error("Supabase nao configurado para classificacoes");
  return { url, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" } };
};
export async function obterClassificacoes(codigo: string): Promise<CodigoClassificacao[] | null> {
  const { url, headers } = endpoint();
  const q = encodeURIComponent(codigo);
  const r = await fetch(`${url}/rest/v1/kidy_cliente_classificacoes?codigo_cliente=eq.${q}&select=classificacoes&limit=1`, { headers, cache: "no-store" });
  if (!r.ok) throw new Error(`Falha ao consultar classificacoes: HTTP ${r.status}`);
  const linhas = await r.json() as { classificacoes: unknown }[];
  if (!linhas.length) return null;
  const validadas = validarClassificacoes(linhas[0].classificacoes);
  if (!validadas) throw new Error("Classificacoes invalidas no banco");
  return validadas;
}
export async function salvarClassificacoes(codigo: string, novas: CodigoClassificacao[], ator: string) {
  const { url, headers } = endpoint();
  const anteriores = await obterClassificacoes(codigo) || [];
  const gravar = await fetch(`${url}/rest/v1/kidy_cliente_classificacoes?on_conflict=codigo_cliente`, {
    method: "POST", headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ codigo_cliente: codigo, classificacoes: novas, atualizado_por: ator, atualizado_em: new Date().toISOString() }), cache: "no-store",
  });
  if (!gravar.ok) throw new Error(`Falha ao gravar classificacoes: HTTP ${gravar.status}`);
  const log = await fetch(`${url}/rest/v1/kidy_cliente_classificacoes_log`, {
    method: "POST", headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ codigo_cliente: codigo, classificacoes_anteriores: anteriores, classificacoes_novas: novas, alterado_por: ator }), cache: "no-store",
  });
  if (!log.ok) throw new Error(`Classificacoes salvas, mas auditoria falhou: HTTP ${log.status}`);
}
