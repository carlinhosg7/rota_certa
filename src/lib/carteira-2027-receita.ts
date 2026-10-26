import "server-only";

type RegistroReceita = {
  cnpj: string;
  situacao_receita: string;
};

type Versao = { id: string };

type CacheReceita = {
  versaoId: string;
  dados: Map<string, string>;
  proximaVerificacao: number;
};

const VERIFICAR_VERSAO_MS = 60 * 1000;
const REVERIFICAR_APOS_ERRO_MS = 30 * 1000;
const TAMANHO_LOTE = 1000;
const MAX_LOTES = 100;

let cache: CacheReceita | undefined;
let carregamento: Promise<Map<string, string>> | undefined;

function normalizarCnpj(valor: string): string {
  const s = String(valor || "").replace(/\D/g, "");
  if (!s || s.length > 14) return "";
  const cnpj = s.padStart(14, "0");
  if (/^(\d)\1{13}$/.test(cnpj)) return "";

  const digito = (base: string, pesos: number[]) => {
    const soma = pesos.reduce((total, peso, i) => total + Number(base[i]) * peso, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const d1 = digito(cnpj.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  const d2 = digito(cnpj.slice(0, 13), [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return Number(cnpj[12]) === d1 && Number(cnpj[13]) === d2 ? cnpj : "";
}

async function buscarDados(): Promise<Map<string, string>> {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const chave = process.env.SUPABASE_SECRET_KEY;
  if (!url || !chave) {
    console.warn("[RECEITA] Supabase nao configurado; mantendo dados anteriores, se existirem");
    if (cache) {
      cache.proximaVerificacao = Date.now() + REVERIFICAR_APOS_ERRO_MS;
      return cache.dados;
    }
    return new Map();
  }

  const headers = { apikey: chave, Authorization: `Bearer ${chave}`, Accept: "application/json" };

  try {
    const versaoRes = await fetch(
      `${url}/rest/v1/kidy_receita_versoes?select=id&situacao=eq.ATIVA&limit=1`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(20000) }
    );
    if (!versaoRes.ok) throw new Error(`Consulta de versao HTTP ${versaoRes.status}`);
    const versoes = (await versaoRes.json()) as Versao[];
    if (!versoes.length) throw new Error("Nenhuma versao ATIVA encontrada");
    const id = versoes[0].id;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error("ID de versao invalido");

    if (cache?.versaoId === id && cache.dados.size > 0) {
      cache.proximaVerificacao = Date.now() + VERIFICAR_VERSAO_MS;
      return cache.dados;
    }

    const novoMapa = new Map<string, string>();
    let terminou = false;
    for (let lote = 0; lote < MAX_LOTES; lote++) {
      const inicio = lote * TAMANHO_LOTE;
      const resposta = await fetch(
        `${url}/rest/v1/kidy_receita_cnpj?select=cnpj,situacao_receita&versao_id=eq.${encodeURIComponent(id)}&order=cnpj.asc`,
        {
          headers: { ...headers, Range: `${inicio}-${inicio + TAMANHO_LOTE - 1}`, "Range-Unit": "items" },
          cache: "no-store",
          signal: AbortSignal.timeout(30000),
        }
      );
      if (!resposta.ok) throw new Error(`Consulta de CNPJs HTTP ${resposta.status}`);
      const dados = (await resposta.json()) as RegistroReceita[];
      if (!Array.isArray(dados)) throw new Error("Resposta de CNPJs invalida");
      for (const item of dados) {
        if (typeof item.cnpj !== "string" || typeof item.situacao_receita !== "string") {
          throw new Error("Registro cadastral invalido");
        }
        novoMapa.set(item.cnpj.trim(), item.situacao_receita);
      }
      if (dados.length < TAMANHO_LOTE) {
        terminou = true;
        break;
      }
    }
    if (!terminou || novoMapa.size === 0) throw new Error("Carga cadastral incompleta ou vazia");

    // Troca atomica do cache apenas apos todos os lotes serem carregados.
    cache = { versaoId: id, dados: novoMapa, proximaVerificacao: Date.now() + VERIFICAR_VERSAO_MS };
    console.log(`[RECEITA] Versao ${id} carregada: ${novoMapa.size} CNPJs`);
    return novoMapa;
  } catch (erro) {
    console.error("[RECEITA] Falha de consulta; mantendo ultima versao em memoria", erro);
    if (cache) {
      cache.proximaVerificacao = Date.now() + REVERIFICAR_APOS_ERRO_MS;
      return cache.dados;
    }
    return new Map();
  }
}

export async function carregarSituacoesReceita(): Promise<Map<string, string>> {
  if (cache && Date.now() < cache.proximaVerificacao) return cache.dados;
  if (!carregamento) {
    carregamento = buscarDados().finally(() => { carregamento = undefined; });
  }
  return carregamento;
}

export function consultarSituacaoReceita(mapa: Map<string, string>, cnpj: string): string {
  const normalizado = normalizarCnpj(cnpj);
  if (!normalizado) return "PENDENTE FORMATO";
  return mapa.get(normalizado) || "NAO VERIFICADA";
}
