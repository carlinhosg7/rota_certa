import { cleanCode } from "./comercial-data";

export type JanelaMensal = {
  mes: string;
  entradas: number;
  faturamentos: number;
};

type VendaJanela = {
  codigo: string;
  numeroPedido: string;
  data: Date | null;
  dataEntrega?: Date | null;
  qtd: number;
};

const nomes = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez"
];

function dataValida(
  valor: Date | null | undefined
): valor is Date {
  return valor instanceof Date &&
    !Number.isNaN(valor.getTime());
}

export async function calcularJanelaCompraFaturamento(
  codigoCliente: string,
  vendas: VendaJanela[]
): Promise<{
  meses: JanelaMensal[];
  anosFaturamento: number[];
  pedidosComparados: number;
  disponivel: boolean;
}> {
  const codigo = cleanCode(codigoCliente);

  const meses: JanelaMensal[] = nomes.map(mes => ({
    mes,
    entradas: 0,
    faturamentos: 0
  }));

  const anos = new Set<number>();

  let totalEntradaPares = 0;
  let temMovimento = false;

  for (const venda of vendas) {
    if (cleanCode(venda.codigo) !== codigo) continue;

    const qtd = Number(venda.qtd);

    if (!Number.isFinite(qtd)) continue;

    // ENTRADA:
    // Soma Qtd Venda no mes de Data Cadastro.
    // Cada linha de produto participa da soma.
    if (dataValida(venda.data)) {
      const mes = venda.data.getMonth();

      meses[mes].entradas += qtd;
      totalEntradaPares += qtd;
      temMovimento = true;
    }

    // FATURAMENTO:
    // Soma Qtd Venda no mes de Data Entrega.
    // Nao elimina linhas com o mesmo Numero Pedido.
    if (dataValida(venda.dataEntrega)) {
      const mes = venda.dataEntrega.getMonth();

      meses[mes].faturamentos += qtd;
      anos.add(venda.dataEntrega.getFullYear());
      temMovimento = true;
    }
  }

  return {
    meses,
    anosFaturamento: [...anos].sort((a, b) => a - b),

    // Mantido o nome da propriedade para nao quebrar
    // o componente existente. Agora contem pares
    // de entrada, nao quantidade de pedidos.
    pedidosComparados: totalEntradaPares,

    disponivel: temMovimento
  };
}