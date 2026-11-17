import "server-only";
import { supabase } from "./supabase";

function normalizarCodigo(valor: unknown): string {
  return String(valor ?? "")
    .trim()
    .replace(/\.0+$/, "");
}

// Exclusao logica: preserva cadastro, snapshots e historico de vendas.
export async function listarClientesExcluidos(): Promise<Set<string>> {
  const excluidos = new Set<string>();

  const tabelas = [
    "kidy_clientes_excluidos",
    "kidy_carteira_exclusoes",
  ];

  for (const tabela of tabelas) {
    for (let inicio = 0; ; inicio += 1000) {
      const { data, error } = await supabase
        .from(tabela)
        .select("codigo_cliente")
        .eq("ativo", true)
        .order("codigo_cliente")
        .range(inicio, inicio + 999);

      if (error) {
        throw new Error(
          `Falha consultando ${tabela}: ${error.message}`
        );
      }

      for (const registro of data ?? []) {
        const codigo = normalizarCodigo(
          registro.codigo_cliente
        );

        if (codigo) {
          excluidos.add(codigo);
        }
      }

      if ((data ?? []).length < 1000) {
        break;
      }
    }
  }

  return excluidos;
}