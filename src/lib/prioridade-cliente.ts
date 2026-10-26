export type Prioridade = "ALTO" | "MEDIO" | "BAIXO" | "NAO_AVALIADO";

type Venda = {
  dataEntrega?: Date | null;
  qtd: number;
};

export function calcularPrioridadeCliente(
  vendas: Venda[],
  creditoDisponivel: number | null
) {
  const hoje = new Date();

  const validas = vendas.filter(v =>
    v.dataEntrega instanceof Date &&
    !Number.isNaN(v.dataEntrega.getTime()) &&
    v.dataEntrega <= hoje &&
    Number.isFinite(Number(v.qtd)) &&
    Number(v.qtd) > 0
  );

  if (!validas.length) {
    return {
      classificacao: "NAO_AVALIADO" as Prioridade,
      pontos: null as number | null,
      motivos: ["Sem histórico válido de entregas"],
      reativacao: false
    };
  }

  const datas = validas
    .map(v => v.dataEntrega as Date)
    .sort((a, b) => b.getTime() - a.getTime());

  const dias = Math.max(
    0,
    Math.floor((hoje.getTime() - datas[0].getTime()) / 86400000)
  );

  const pares = validas.reduce((s, v) => s + Number(v.qtd), 0);

  const meses = new Set(
    datas.map(d => `${d.getFullYear()}-${d.getMonth()}`)
  );

  const volume =
    pares >= 3000 ? 40 :
    pares >= 1500 ? 30 :
    pares >= 500 ? 20 :
    pares >= 100 ? 10 : 5;

  const recencia =
    dias <= 730 ? 25 :
    dias <= 1095 ? 22 :
    dias <= 1825 ? 14 : 5;

  const frequencia =
    meses.size >= 12 ? 25 :
    meses.size >= 6 ? 18 :
    meses.size >= 3 ? 12 : 5;

  const credito =
    creditoDisponivel !== null && creditoDisponivel > 0 ? 10 : 0;

  const pontos = volume + recencia + frequencia + credito;

  const classificacao: Prioridade =
    pontos >= 70 ? "ALTO" :
    pontos >= 40 ? "MEDIO" : "BAIXO";

  return {
    classificacao,
    pontos,
    motivos: [
      `${Math.round(pares).toLocaleString("pt-BR")} pares no histórico`,
      `${dias} dias desde a última entrega`,
      `${meses.size} meses distintos com entregas`,
      creditoDisponivel === null
        ? "Crédito disponível não informado"
        : creditoDisponivel > 0
          ? "Crédito disponível positivo"
          : "Sem crédito disponível positivo"
    ],
    reativacao: dias > 730
  };
}