// ESPELHO360_V2_SAFE_READER
import "server-only";
import { supabase } from "./supabase";
import { listarClientesExcluidos } from "./clientes-excluidos";

// Opt-in somente: o codigo chamador mantem Drive como fallback.
// Cada sincronizacao gera um lote novo; usar o mais recente VALIDADO.
// O prazo impede uso indefinido de um espelho desatualizado.
const MAX_IDADE_HORAS = 24;
const PAGINA = 1000;
const PARALELISMO = 5;

type LinhaEspelho = {
  codigo_cliente: string;
  codigo_representante: string;
  razao: string;
  codigo_supervisor: string;
  cidade: string;
  uf: string;
  city_key: string;
};

export type CarteiraEspelho360 = {
  codigo: string;
  rep: string;
  razao: string;
  sup: string;
  cidade: string;
  uf: string;
  cityKey: string;
  limite: number;
  bloqueio: string;
};

function codigo(v: unknown): string {
  return String(v ?? "").trim().replace(/\.0+$/, "");
}

async function consultarJWT360<T extends { error: { message: string } | null }>(
  executar: () => PromiseLike<T>, contexto: string
): Promise<T> {
  for (let tentativa = 0; ; tentativa++) {
    const resposta = await executar();
    if (!/JWT issued at future/i.test(resposta.error?.message ?? "") || tentativa >= 2) return resposta;
    console.warn("[ESPELHO360 JWT] Falha transitoria:", contexto, "tentativa", tentativa + 2, "de 3");
    await new Promise<void>(resolve => setTimeout(resolve, tentativa === 0 ? 2500 : 4000));
  }
}
async function carregarCarteiraEspelho360SemCache(): Promise<CarteiraEspelho360[]> {
  const inicio = performance.now();
  const { data: lote, error: erroLote } = await consultarJWT360(() => supabase
    .from("kidy_360_carteira_espelho_lotes")
    .select("lote_id,criado_em,status,total_registros,arquivo_sha256,observacao")
    .eq("status", "VALIDADO")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle(), "lote");

  if (erroLote || !lote) {
    throw new Error("Nao ha lote validado do espelho: " + (erroLote?.message ?? "nenhum"));
  }
  const total = Number(lote.total_registros);
  if (!Number.isSafeInteger(total) || total < 1000 || total > 100000) {
    throw new Error("Contagem suspeita do espelho: " + lote.total_registros);
  }
  if (!/^[a-f0-9]{64}$/i.test(String(lote.arquivo_sha256 ?? ""))) {
    throw new Error("Lote sem SHA256 de origem valido");
  }
  const criadoEm = Date.parse(String(lote.criado_em ?? ""));
  // Verificacao diaria integral pode renovar a confiabilidade sem criar lote novo.
  // Para lotes antigos, usa-se o instante original da importacao.
  const marca = String(lote.observacao ?? "").match(/(?:^|\s)VERIFICADO_EM=(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)(?:\s|$)/);
  const verificadoEm = marca ? Date.parse(marca[1]) : criadoEm;
  const idadeMs = Date.now() - verificadoEm;
  if (!Number.isFinite(criadoEm) || !Number.isFinite(verificadoEm) ||
      verificadoEm < criadoEm - 5 * 60_000 || idadeMs < -5 * 60_000 || idadeMs > MAX_IDADE_HORAS * 3600_000) {
    throw new Error("Espelho desatualizado ou sem data confiavel; usar Drive. Lote: " + lote.lote_id);
  }

  const { count, error: erroContagem } = await consultarJWT360(() => supabase
    .from("kidy_360_carteira_espelho_clientes")
    .select("codigo_cliente", { count: "exact", head: true })
    .eq("lote_id", lote.lote_id), "contagem");
  if (erroContagem || count !== total) {
    throw new Error("Contagem divergente: " + (erroContagem?.message ?? `${count} != ${total}`));
  }

  const linhas: LinhaEspelho[] = [];
  const paginas = Math.ceil(total / PAGINA);
  for (let base = 0; base < paginas; base += PARALELISMO) {
    const indices = Array.from({ length: Math.min(PARALELISMO, paginas - base) }, (_, i) => base + i);
    const respostas = await Promise.all(indices.map(async indice => {
      const { data, error } = await consultarJWT360(() => supabase
        .from("kidy_360_carteira_espelho_clientes")
        .select("codigo_cliente,codigo_representante,razao,codigo_supervisor,cidade,uf,city_key")
        .eq("lote_id", lote.lote_id)
        .order("codigo_cliente", { ascending: true })
        .order("codigo_representante", { ascending: true })
        .range(indice * PAGINA, Math.min((indice + 1) * PAGINA, total) - 1), `pagina ${indice}`);
      if (error) throw new Error(`Erro pagina espelho ${indice}: ${error.message}`);
      const esperado = Math.min(PAGINA, total - indice * PAGINA);
      if (!data || data.length !== esperado) throw new Error(`Pagina incompleta: ${indice} (${data?.length ?? 0}/${esperado})`);
      return data as LinhaEspelho[];
    }));
    for (const p of respostas) linhas.push(...p);
  }
  if (linhas.length !== total) throw new Error("Leitura incompleta do espelho");
  const chaves = new Set(linhas.map(c => `${codigo(c.codigo_cliente)}|${codigo(c.codigo_representante)}`));
  if (chaves.size !== total) throw new Error("Chaves duplicadas no espelho");

  // O espelho contem as exclusoes do dia da importacao.
  // Reaplica exclusoes ATUAIS em cada leitura para nao reativar cliente excluido depois.
  const excluidosAtuais = await listarClientesExcluidos();
  const carteira = linhas
    .filter(c => !excluidosAtuais.has(codigo(c.codigo_cliente)))
    .map(c => ({
      codigo: codigo(c.codigo_cliente),
      rep: codigo(c.codigo_representante),
      razao: String(c.razao ?? ""),
      sup: codigo(c.codigo_supervisor),
      cidade: String(c.cidade ?? ""),
      uf: String(c.uf ?? "").trim().toUpperCase(),
      cityKey: String(c.city_key ?? ""),
      limite: 0,
      bloqueio: "",
    }));
  if (carteira.length < 1000) throw new Error("Espelho sem clientes apos exclusoes");
  console.log("[ESPELHO360 V2] Lote:", lote.lote_id,
    "linhas:", total, "clientes apos exclusoes atuais:", carteira.length,
    "idadeHoras:", Math.round(idadeMs / 3600000 * 10) / 10,
    "tempoMs:", Math.round(performance.now() - inicio));
  return carteira;
}

// CACHE_CARTEIRA_360_V1: somente dados comerciais, nunca resposta por usuario.
// Instancias serverless diferentes possuem caches independentes.
const CACHE_CARTEIRA_360_MS = 30_000;
let cacheCarteira360: { dados: CarteiraEspelho360[]; ate: number } | null = null;
let leituraCarteira360: Promise<CarteiraEspelho360[]> | null = null;

export async function carregarCarteiraEspelho360(): Promise<CarteiraEspelho360[]> {
  if (cacheCarteira360 && Date.now() < cacheCarteira360.ate) {
    console.log("[ESPELHO360 V2] CACHE 30s clientes:", cacheCarteira360.dados.length);
    return cacheCarteira360.dados;
  }
  if (leituraCarteira360) return leituraCarteira360;
  const execucao = carregarCarteiraEspelho360SemCache().then(dados => {
    cacheCarteira360 = { dados, ate: Date.now() + CACHE_CARTEIRA_360_MS };
    return dados;
  });
  leituraCarteira360 = execucao;
  try { return await execucao; }
  finally { if (leituraCarteira360 === execucao) leituraCarteira360 = null; }
}