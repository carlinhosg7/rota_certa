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
  const buffer=await lerArquivoComercial(nome);
  return JSON.parse(buffer.toString('utf8')) as T;
}
