import { supabase } from '@/lib/supabase';
import { lerArquivoComercial } from '@/lib/google-drive-adapter';

export async function lerJSONShare<T>(nome: string): Promise<T> {
  if (process.env.KIDY_SHARE_SOURCE === 'supabase') {
    const {data,error} = await supabase
      .from('kidy_share_snapshots')
      .select('conteudo')
      .eq('nome',nome)
      .single();
    if (error || !data) throw new Error(`Snapshot Share indisponivel: ${nome}: ${error?.message ?? 'sem registro'}`);
    return data.conteudo as T;
  }
  try {
    const buffer = await lerArquivoComercial(nome);
    return JSON.parse(buffer.toString("utf8")) as T;
  } catch (erro) {
    console.error(`[SHARE] Falha na fonte configurada: ${nome}`, erro);

    if (process.env.NODE_ENV !== "development") {
      throw erro;
    }

    const path = await import("node:path");
    const fs = await import("node:fs/promises");

    if (path.basename(nome) !== nome) {
      throw new Error(`Nome de snapshot invalido: ${nome}`);
    }

    const arquivo = path.join(process.cwd(), "data", nome);

    console.warn(`[SHARE] Usando snapshot local de desenvolvimento: ${nome}`);

    const conteudo = await fs.readFile(arquivo, "utf8");
    return JSON.parse(conteudo.replace(/^\\uFEFF/, "")) as T;
  }
}
