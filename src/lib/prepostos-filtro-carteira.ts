import "server-only";
import type { JWTPayload } from "jose";
import { supabase } from "@/lib/supabase";
import { normalizarRepresentante } from "@/lib/representantes-oficiais";
import type { MapaRepresentantes } from "@/lib/representantes-oficiais";

const cod = (v: unknown) => String(v ?? "").trim().replace(/\.0+$/, "");

export type PrepostoCarteira = {
  usuario: string;
  nome: string;
  codigo_representante_principal: string;
  supervisor_codigo: string;
};

// Apenas administrador ou representante titular podem selecionar prepostos.
export async function listarPrepostosParaFiltro(
  sessao: JWTPayload,
  mapa: MapaRepresentantes
): Promise<PrepostoCarteira[]> {
  const perfil = String(sessao.perfil ?? "").trim().toUpperCase();
  const admin = perfil === "ADMIN" || perfil === "ADMINISTRADOR";
  const representante = perfil === "REPRESENTANTE" || perfil === "REP";
  if (!admin && !representante) return [];

  const titularLogado = representante
    ? normalizarRepresentante(cod(sessao.codigo_representante), mapa).codigo
    : "";
  if (representante && !mapa.cadastro.get(titularLogado)?.ativo) return [];

  const { data, error } = await supabase
    .from("kidy_prepostos")
    .select("usuario,nome,codigo_representante_principal")
    .order("usuario");
  if (error) throw new Error("Prepostos: " + error.message);

  return (data ?? []).flatMap(p => {
    const titular = normalizarRepresentante(
      cod(p.codigo_representante_principal), mapa
    ).codigo;
    const oficial = mapa.cadastro.get(titular);
    if (!oficial?.ativo || (representante && titular !== titularLogado)) return [];
    return [{
      usuario: cod(p.usuario),
      nome: String(p.nome ?? p.usuario),
      codigo_representante_principal: titular,
      supervisor_codigo: cod(oficial.codigo_supervisor),
    }];
  });
}

// Os vinculos sao obtidos por codigo de cliente, nunca por carteira do titular.
export async function carregarCodigosClientesPreposto(usuario: string): Promise<Set<string>> {
  const codigos = new Set<string>();
  const pagina = 1000;
  for (let inicio = 0; ; inicio += pagina) {
    const {data,error} = await supabase
      .from("kidy_prepostos_clientes")
      .select("codigo_cliente")
      .eq("usuario_preposto", cod(usuario))
      .order("codigo_cliente")
      .range(inicio, inicio + pagina - 1);
    if (error) throw new Error("Clientes do preposto: " + error.message);
    for (const r of data ?? []) codigos.add(cod(r.codigo_cliente));
    if ((data?.length ?? 0) < pagina) break;
  }
  return codigos;
}
