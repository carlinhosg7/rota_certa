export type IndicadorMeta = {
  meta: number;
  realizado: number;
  diferenca: number;
  percentual: number;
  faltante: number;
};

export type PeriodoMeta = {
  inicio: string;
  fim: string;
};

function numeroSeguro(valor: unknown): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

export function calcularIndicador(
  meta: number,
  realizado: number
): IndicadorMeta {
  const m = numeroSeguro(meta);
  const r = numeroSeguro(realizado);

  return {
    meta: m,
    realizado: r,
    diferenca: r - m,
    percentual: m > 0 ? (r / m) * 100 : 0,
    faltante: Math.max(0, m - r),
  };
}

function dataUTC(ano: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function adicionarDias(data: Date, dias: number): Date {
  const resultado = new Date(data.getTime());
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado;
}

function formatarData(data: Date): string {
  return data.toISOString().slice(0, 10);
}

export function inicioSemana(data: Date): Date {
  const dia = data.getUTCDay();
  return adicionarDias(data, -dia);
}

export function fimSemana(data: Date): Date {
  return adicionarDias(inicioSemana(data), 6);
}

export function periodoSemana(data: Date): PeriodoMeta {
  return {
    inicio: formatarData(inicioSemana(data)),
    fim: formatarData(fimSemana(data)),
  };
}

export function periodoMes(
  ano: number,
  mes: number
): PeriodoMeta {
  return {
    inicio: formatarData(dataUTC(ano, mes, 1)),
    fim: formatarData(dataUTC(ano, mes + 1, 0)),
  };
}

export function contarDiasUteis(
  inicio: Date,
  fim: Date
): number {
  let total = 0;

  for (
    let data = new Date(inicio.getTime());
    data.getTime() <= fim.getTime();
    data = adicionarDias(data, 1)
  ) {
    const dia = data.getUTCDay();

    if (dia >= 1 && dia <= 5) {
      total++;
    }
  }

  return total;
}

export function calcularMetaSemanal(
  metaMensal: number,
  ano: number,
  mes: number,
  inicio: Date,
  fim: Date
): number {
  const inicioMes = dataUTC(ano, mes, 1);
  const fimMes = dataUTC(ano, mes + 1, 0);

  const inicioConsiderado =
    inicio.getTime() > inicioMes.getTime()
      ? inicio
      : inicioMes;

  const fimConsiderado =
    fim.getTime() < fimMes.getTime()
      ? fim
      : fimMes;

  if (inicioConsiderado.getTime() > fimConsiderado.getTime()) {
    return 0;
  }

  const diasUteisMes = contarDiasUteis(inicioMes, fimMes);
  const diasUteisSemana = contarDiasUteis(
    inicioConsiderado,
    fimConsiderado
  );

  if (diasUteisMes === 0) {
    return 0;
  }

  return (
    numeroSeguro(metaMensal) *
    diasUteisSemana /
    diasUteisMes
  );
}

export function calcularMetaSemanaEntreMeses(
  metasMensais: Array<{
    ano: number;
    mes: number;
    meta: number;
  }>,
  inicio: Date,
  fim: Date
): number {
  return metasMensais.reduce(
    (total, item) =>
      total +
      calcularMetaSemanal(
        item.meta,
        item.ano,
        item.mes,
        inicio,
        fim
      ),
    0
  );
}
