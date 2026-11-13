import "server-only";
import { supabase } from "./supabase";

// O espelho financeiro so sera usado se o chamador ativar o modo opt-in.
// Sem lote recente/consistente, o chamador deve usar sua leitura anterior.
const MAX_IDADE_HORAS = 48;
const PAGINA = 1000;
const PARALELISMO = 5;

type LinhaFinanceira = {
  codigo_cliente: string;
  limite_disponivel: number | string;
  bloqueio: string | null;
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
async function carregarFinanceiroSemCache():
  Promise<Map<string, { limite: number; bloqueio: string }>> {
  const inicio = performance.now();
  const { data: lote, error: erroLote } = await consultarJWT360(() => supabase
    .from("kidy_360_financeiro_espelho_lotes")
    .select("lote_id,criado_em,status,total_clientes,arquivo_sha256")
    .eq("status", "VALIDADO")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle(), "lote");

  if (erroLote || !lote) {
    throw new Error("Espelho financeiro sem lote VALIDADO: " +
      (erroLote?.message ?? "nenhum"));
  }

  const total = Number(lote.total_clientes);
  if (!Number.isSafeInteger(total) || total < 15000 || total > 30000) {
    throw new Error("Espelho financeiro: quantidade suspeita " + lote.total_clientes);
  }
  if (!/^[0-9a-f]{64}$/i.test(String(lote.arquivo_sha256 ?? ""))) {
    throw new Error("Espelho financeiro: SHA256 invalido");
  }

  const criado = Date.parse(String(lote.criado_em ?? ""));
  const idadeMs = Date.now() - criado;
  if (!Number.isFinite(criado) || idadeMs < -300000 ||
      idadeMs > MAX_IDADE_HORAS * 3600000) {
    throw new Error("Espelho financeiro sem lote recente (48 horas)");
  }

  const { count, error: erroContagem } = await consultarJWT360(() => supabase
    .from("kidy_360_financeiro_espelho_clientes")
    .select("codigo_cliente", { count: "exact", head: true })
    .eq("lote_id", lote.lote_id), "contagem");

  if (erroContagem || count !== total) {
    throw new Error("Espelho financeiro: contagem divergente " +
      (erroContagem?.message ?? `${count}/${total}`));
  }

  const resultado = new Map<string, { limite: number; bloqueio: string }>();
  const paginas = Math.ceil(total / PAGINA);
  for (let i = 0; i < paginas; i += PARALELISMO) {
    const indices = Array.from(
      { length: Math.min(PARALELISMO, paginas - i) }, (_, j) => i + j
    );
    const respostas = await Promise.all(indices.map(async indice => {
      const { data, error } = await consultarJWT360(() => supabase
        .from("kidy_360_financeiro_espelho_clientes")
        .select("codigo_cliente,limite_disponivel,bloqueio")
        .eq("lote_id", lote.lote_id)
        .order("codigo_cliente", { ascending: true })
        .range(indice * PAGINA, Math.min((indice + 1) * PAGINA, total) - 1), `pagina ${indice}`);

      if (error) throw new Error(
        `Espelho financeiro pagina ${indice}: ${error.message}`
      );
      const esperado = Math.min(PAGINA, total - indice * PAGINA);
      if (!data || data.length !== esperado) {
        throw new Error(
          `Espelho financeiro pagina incompleta ${indice}: ${data?.length ?? 0}/${esperado}`
        );
      }
      return data as LinhaFinanceira[];
    }));

    for (const pagina of respostas) {
      for (const linha of pagina) {
        const cliente = codigo(linha.codigo_cliente);
        const limite = Number(linha.limite_disponivel);
        if (!/^\d+$/.test(cliente) || !Number.isFinite(limite)) {
          throw new Error("Espelho financeiro: registro invalido");
        }
        if (resultado.has(cliente)) {
          throw new Error("Espelho financeiro: codigo duplicado " + cliente);
        }
        resultado.set(cliente, {
          limite,
          bloqueio: String(linha.bloqueio ?? ""),
        });
      }
    }
  }

  if (resultado.size !== total) {
    throw new Error(`Espelho financeiro incompleto: ${resultado.size}/${total}`);
  }
  console.log(
    "[FINANCEIRO ESPELHO360] VALIDADO",
    "lote:", lote.lote_id,
    "clientes:", resultado.size,
    "idadeHoras:", Math.round(idadeMs / 360000) / 10,
    "tempoMs:", Math.round(performance.now() - inicio)
  );
  return resultado;
}

const CACHE_FINANCEIRO_MS = 60_000;
let cacheFinanceiro: { dados: Map<string, { limite: number; bloqueio: string }>; ate: number } | null = null;
let carregamentoFinanceiro: Promise<Map<string, { limite: number; bloqueio: string }>> | null = null;

export async function carregarFinanceiroEspelho360(): Promise<Map<string, { limite: number; bloqueio: string }>> {
  if (cacheFinanceiro && Date.now() < cacheFinanceiro.ate) {
    console.log("[FINANCEIRO ESPELHO360] CACHE 60s clientes:", cacheFinanceiro.dados.size);
    return cacheFinanceiro.dados;
  }
  if (carregamentoFinanceiro) return carregamentoFinanceiro;
  const execucao = carregarFinanceiroSemCache().then(dados => {
    cacheFinanceiro = { dados, ate: Date.now() + CACHE_FINANCEIRO_MS };
    return dados;
  });
  carregamentoFinanceiro = execucao;
  try { return await execucao; }
  finally { if (carregamentoFinanceiro === execucao) carregamentoFinanceiro = null; }
}