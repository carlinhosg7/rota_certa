import "server-only";

import { supabase } from "./supabase";
import { cleanCode } from "./comercial-data";
import type { Venda } from "./comercial-data";

const SNAPSHOT_ID = "a842f057-647d-4a99-9d7c-e7898c3b95ac";

const TAMANHO_PAGINA = 1000;
const TAMANHO_GRUPO = 8;

function converterData(valor: unknown): Date | null {
  if (!valor) return null;

  const data = new Date(String(valor));

  return Number.isNaN(data.getTime()) ? null : data;
}

function converterVenda(
  item: Record<string, unknown>,
  codigoCliente: string
): Venda {
  return {
    codigo: String(item.codigo ?? codigoCliente),
    rep: String(item.rep ?? ""),
    sup: String(item.sup ?? ""),
    data: converterData(item.data),
    dataEntrega: converterData(item.dataEntrega),
    qtd: Number(item.qtd ?? 0),
    vlr: Number(item.vlr ?? 0),
    codigoLinha: String(item.codigoLinha ?? ""),
    linha: String(item.linha ?? ""),
    referencia: String(item.referencia ?? ""),
    numeroPedido: String(item.numeroPedido ?? ""),
    tipoPedido: String(item.tipoPedido ?? ""),
    prazoMedio: Number(item.prazoMedio ?? 0),
    limiteAprovado:
      item.limiteAprovado == null
        ? null
        : Number(item.limiteAprovado),
    limiteCredito:
      item.limiteCredito == null
        ? null
        : Number(item.limiteCredito),
    limiteDisponivel:
      item.limiteDisponivel == null
        ? null
        : Number(item.limiteDisponivel),
  };
}

export async function buscarVendasClientes360(
  codigosClientes: string[]
): Promise<Map<string, Venda[]>> {
  const codigos = [
    ...new Set(
      codigosClientes
        .map((codigo) => cleanCode(codigo))
        .filter(Boolean)
    ),
  ];

  const resultado = new Map<string, Venda[]>();

  for (const codigo of codigos) {
    resultado.set(codigo, []);
  }

  if (codigos.length === 0) {
    return resultado;
  }

  for (
    let grupoInicio = 0;
    grupoInicio < codigos.length;
    grupoInicio += TAMANHO_GRUPO
  ) {
    const grupo = codigos.slice(
      grupoInicio,
      grupoInicio + TAMANHO_GRUPO
    );

    let inicio = 0;

    while (true) {
      const { data, error } = await supabase
        .from("kidy_360_vendas")
        .select("codigo_cliente,lote,dados")
        .eq("snapshot_id", SNAPSHOT_ID)
        .in("codigo_cliente", grupo)
        .order("codigo_cliente", { ascending: true })
        .order("lote", { ascending: true })
        .range(
          inicio,
          inicio + TAMANHO_PAGINA - 1
        );

      if (error) {
        throw new Error(
          "Erro ao buscar vendas 360 em lote: " +
            error.message
        );
      }

      if (!data || data.length === 0) {
        break;
      }

      for (const registro of data) {
        const codigo = cleanCode(
          registro.codigo_cliente
        );

        const vendas = resultado.get(codigo);

        if (!vendas) {
          continue;
        }

        if (!Array.isArray(registro.dados)) {
          continue;
        }

        for (const item of registro.dados) {
          if (
            !item ||
            typeof item !== "object" ||
            Array.isArray(item)
          ) {
            continue;
          }

          vendas.push(
            converterVenda(
              item as Record<string, unknown>,
              codigo
            )
          );
        }
      }

      if (data.length < TAMANHO_PAGINA) {
        break;
      }

      inicio += TAMANHO_PAGINA;
    }
  }

  return resultado;
}

export async function buscarVendasCliente360(
  codigoCliente: string
): Promise<Venda[]> {
  const codigo = cleanCode(codigoCliente);

  const resultado = await buscarVendasClientes360([
    codigo,
  ]);

  return resultado.get(codigo) ?? [];
}

// ============================================================
// PERFIS HISTORICOS
// ============================================================

export type PerfilHistorico360 = {
  codigo_cliente: string;
  valor_historico: number;
  pares_historico: number;
  pedidos: number;
  mix: number;
};

let cachePerfis360:
  | {
      ate: number;
      dados: PerfilHistorico360[];
    }
  | null = null;

let carregamentoPerfis360:
  | Promise<PerfilHistorico360[]>
  | null = null;

export async function buscarPerfis360(): Promise<
  PerfilHistorico360[]
> {
  if (
    cachePerfis360 &&
    Date.now() < cachePerfis360.ate
  ) {
    return cachePerfis360.dados;
  }

  if (carregamentoPerfis360) {
    return carregamentoPerfis360;
  }

  carregamentoPerfis360 = (async () => {
    const resultado: PerfilHistorico360[] = [];

    for (
      let inicio = 0;
      ;
      inicio += TAMANHO_PAGINA
    ) {
      const { data, error } = await supabase
        .from("kidy_360_perfis")
        .select(
          "codigo_cliente,valor_historico,pares_historico,pedidos,mix"
        )
        .eq("snapshot_id", SNAPSHOT_ID)
        .order("codigo_cliente", {
          ascending: true,
        })
        .range(
          inicio,
          inicio + TAMANHO_PAGINA - 1
        );

      if (error) {
        throw new Error(
          "Erro ao consultar perfis 360: " +
            error.message
        );
      }

      if (!data || data.length === 0) {
        break;
      }

      for (const p of data) {
        resultado.push({
          codigo_cliente: cleanCode(
            p.codigo_cliente
          ),
          valor_historico: Number(
            p.valor_historico ?? 0
          ),
          pares_historico: Number(
            p.pares_historico ?? 0
          ),
          pedidos: Number(
            p.pedidos ?? 0
          ),
          mix: Number(
            p.mix ?? 0
          ),
        });
      }

      if (data.length < TAMANHO_PAGINA) {
        break;
      }
    }

    // O snapshot atual possui 18.112 perfis.
    // Mantemos a validacao para detectar leitura parcial.
    if (resultado.length !== 18112) {
      throw new Error(
        "Quantidade inesperada de perfis 360: " +
          resultado.length
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