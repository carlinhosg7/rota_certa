import "server-only";
import { supabase } from "./supabase";

export type GerenteRegional = {
  codigo_supervisor: string;
  regional: string;
  gerente: string;
  ativo: boolean;
};

export async function listarGerentesRegionais(): Promise<GerenteRegional[]> {
  const { data, error } = await supabase
    .from("kidy_gerentes_regionais")
    .select("codigo_supervisor, regional, gerente, ativo")
    .eq("ativo", true)
    .order("gerente", { ascending: true })
    .order("regional", { ascending: true });

  if (error) {
    console.error("[GERENTES] Erro ao consultar Supabase:", error.message);
    return [];
  }

  return (data ?? []).map((item) => ({
    codigo_supervisor: String(item.codigo_supervisor),
    regional: String(item.regional ?? ""),
    gerente: String(item.gerente ?? ""),
    ativo: Boolean(item.ativo),
  }));
}
