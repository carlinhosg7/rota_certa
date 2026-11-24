import "server-only";
import type { JWTPayload } from "jose";
import { supabase } from "@/lib/supabase";
import { carregarMapaRepresentantes, normalizarRepresentante } from "@/lib/representantes-oficiais";

const cod = (v: unknown) => String(v ?? "").trim().replace(/\.0+$/, "");
export type EscopoPrepostoCarteira = { usuario: string; titular: string };

/** Determina o preposto pela sessao assinada, nunca por query string. */
export async function obterEscopoPrepostoCarteira(sessao: JWTPayload): Promise<EscopoPrepostoCarteira | null> {
  const usuario = cod(sessao.usuario);
  const perfil = String(sessao.perfil ?? "").trim().toUpperCase();
  if (!usuario || !["REPRESENTANTE", "REP"].includes(perfil)) return null;
  const { data, error } = await supabase.from("kidy_prepostos")
    .select("usuario,codigo_representante_principal")
    .eq("usuario", usuario).limit(1).maybeSingle();
  if (error) throw new Error("Falha ao verificar preposto: " + error.message);
  if (!data) return null;
  const mapa = await carregarMapaRepresentantes();
  const titular = normalizarRepresentante(cod(data.codigo_representante_principal), mapa).codigo;
  if (!mapa.cadastro.get(titular)?.ativo) throw new Error("Titular inativo. Acesso do preposto bloqueado.");
  return { usuario, titular };
}

/** Pagina a relacao de clientes para nao truncar listas maiores que mil registros. */
export async function carregarClientesDoPreposto(usuario: string): Promise<Set<string>> {
  const resultado = new Set<string>();
  for (let inicio = 0; inicio < 100000; inicio += 1000) {
    const { data, error } = await supabase.from("kidy_prepostos_clientes")
      .select("codigo_cliente")
      .eq("usuario_preposto", cod(usuario))
      .order("codigo_cliente")
      .range(inicio, inicio + 999);
    if (error) throw new Error("Falha ao consultar carteira do preposto: " + error.message);
    for (const linha of data ?? []) resultado.add(cod(linha.codigo_cliente));
    if ((data?.length ?? 0) < 1000) return resultado;
  }
  throw new Error("Limite de consulta excedido. Acesso interrompido.");
}
