import "server-only";
import { supabase } from "./supabase";

// Exclusao logica. O cadastro e as vendas historicas permanecem no banco.
export async function listarClientesExcluidos(): Promise<Set<string>> {
  const resultado = new Set<string>();
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabase
      .from("kidy_clientes_excluidos")
      .select("codigo_cliente")
      .eq("ativo", true)
      .order("codigo_cliente")
      .range(inicio, inicio + 999);
    if (error) throw new Error("Falha consultando exclusoes de clientes: " + error.message);
    for (const r of data ?? []) resultado.add(String(r.codigo_cliente).trim().replace(/\.0+$/, ""));
    if ((data ?? []).length < 1000) break;
  }
  return resultado;
}
