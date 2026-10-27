import "server-only";
import { supabase } from "./supabase";
import { cleanCode } from "./comercial-data";
import type { Venda } from "./comercial-data";

const SNAPSHOT_ID = "a842f057-647d-4a99-9d7c-e7898c3b95ac";

function converterData(valor: unknown): Date | null {
  if (!valor) return null;

  const data = new Date(String(valor));

  return Number.isNaN(data.getTime()) ? null : data;
}

export async function buscarVendasCliente360(
  codigoCliente: string
): Promise<Venda[]> {
  const codigo = cleanCode(codigoCliente);
  const vendas: Venda[] = [];

  const tamanhoPagina = 1000;
  let inicio = 0;

  while (true) {
    const { data, error } = await supabase
      .from("kidy_360_vendas")
      .select("dados")
      .eq("snapshot_id", SNAPSHOT_ID)
      .eq("codigo_cliente", codigo)
      .order("lote", { ascending: true })
      .range(inicio, inicio + tamanhoPagina - 1);

    if (error) {
      throw new Error(
        `Erro ao buscar vendas do cliente ${codigo}: ${error.message}`
      );
    }

    if (!data || data.length === 0) break;

    for (const registro of data) {
      if (!Array.isArray(registro.dados)) continue;

      for (const item of registro.dados) {
        const venda = item as Record<string, unknown>;

        vendas.push({
          codigo: String(venda.codigo ?? codigo),
          rep: String(venda.rep ?? ""),
          sup: String(venda.sup ?? ""),
          data: converterData(venda.data),
          dataEntrega: converterData(venda.dataEntrega),
          qtd: Number(venda.qtd ?? 0),
          vlr: Number(venda.vlr ?? 0),
          codigoLinha: String(venda.codigoLinha ?? ""),
          linha: String(venda.linha ?? ""),
          referencia: String(venda.referencia ?? ""),
          numeroPedido: String(venda.numeroPedido ?? ""),
          tipoPedido: String(venda.tipoPedido ?? ""),
          prazoMedio: Number(venda.prazoMedio ?? 0),
          limiteAprovado:
            venda.limiteAprovado == null
              ? null
              : Number(venda.limiteAprovado),
          limiteCredito:
            venda.limiteCredito == null
              ? null
              : Number(venda.limiteCredito),
          limiteDisponivel:
            venda.limiteDisponivel == null
              ? null
              : Number(venda.limiteDisponivel),
        });
      }
    }

    if (data.length < tamanhoPagina) break;
    inicio += tamanhoPagina;
  }

  return vendas;
}


// ============================================================
// PERFIS HISTORICOS - VISAO 360
// ============================================================

export type PerfilHistorico360 = {
  codigo_cliente: string;
  valor_historico: number;
  pares_historico: number;
  pedidos: number;
  mix: number;
};

let cachePerfis360:
  | { ate: number; dados: PerfilHistorico360[] }
  | null = null;

let carregamentoPerfis360: Promise<PerfilHistorico360[]> | null = null;

export async function buscarPerfis360(): Promise<PerfilHistorico360[]> {
  if (cachePerfis360 && Date.now() < cachePerfis360.ate) {
    return cachePerfis360.dados;
  }

  if (carregamentoPerfis360) {
    return carregamentoPerfis360;
  }

  carregamentoPerfis360 = (async () => {
    const resultado: PerfilHistorico360[] = [];
    const tamanho = 1000;

    for (let inicio = 0; ; inicio += tamanho) {
      const { data, error } = await supabase
        .from("kidy_360_perfis")
        .select(
          "codigo_cliente,valor_historico,pares_historico,pedidos,mix"
        )
        .eq("snapshot_id", SNAPSHOT_ID)
        .order("codigo_cliente", { ascending: true })
        .range(inicio, inicio + tamanho - 1);

      if (error) {
        throw new Error(
          "Erro ao consultar perfis 360: " + error.message
        );
      }

      if (!data || data.length === 0) break;

      for (const p of data) {
        resultado.push({
          codigo_cliente: cleanCode(p.codigo_cliente),
          valor_historico: Number(p.valor_historico ?? 0),
          pares_historico: Number(p.pares_historico ?? 0),
          pedidos: Number(p.pedidos ?? 0),
          mix: Number(p.mix ?? 0),
        });
      }

      if (data.length < tamanho) break;
    }

    if (resultado.length !== 18112) {
      throw new Error(
        "Quantidade inesperada de perfis 360: " + resultado.length
      );
    }

    cachePerfis360 = {
      ate: Date.now() + 5 * 60 * 1000,
      dados: resultado,
    };

    return resultado;
  })();

  try {
    return await carregamentoPerfis360;
  } finally {
    carregamentoPerfis360 = null;
  }
}
