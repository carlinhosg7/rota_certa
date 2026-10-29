export type CidadeShare = {
  codigo_ibge: string; uf: string; cidade: string; populacao: number;
  percentual_infantil: number; criancas_estimadas: number; potencial_pares: number;
  meta_pares_5pct: number; representante_codigo: string; representante: string;
  supervisor: string; gerente: string; vendas_ano: Record<string, number> | null;
  share_medio_historico: number | null; share_ultimo_ano: number | null;
};
export const ultimoAnoCompleto = new Date().getFullYear() - 1;
export function gerentePorSupervisor(s: string): string {
  const x = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (x.includes('NORTE') || x.includes('NORDESTE')) return 'Thiago';
  if (x.includes('REM') || x.includes('CEO') || x.includes('CENTRO OESTE')) return 'Natália';
  if (x.includes('SPI') || x.includes('SPC') || x.includes('SUL') || x.includes('SP INTERIOR') || x.includes('SP CAPITAL')) return 'Rafael';
  if (x.includes('B2B')) return 'Maurício';
  return 'Não atribuído';
}
export function shareReal(pares: number, potencial: number): number | null {
  return potencial > 0 ? (pares / potencial) * 100 : null;
}
export function calcularShareMedio(
  anos: Record<string, number>,
  potencial: number,
  ultimoAno: number
): number | null {

  if (potencial <= 0) return null;

  // 2016: inicio parcial.
  // 2022: historico incompleto.
  // 2026: ano corrente, nao entra na media.
  const anosValidos = [
    2017, 2018, 2019, 2020, 2021,
    2023, 2024, 2025
  ].filter(ano => ano <= ultimoAno);

  if (!anosValidos.length) return null;

  const somaShares = anosValidos.reduce((total, ano) => {
    const pares = Number(anos[String(ano)] ?? 0);
    return total + (pares / potencial) * 100;
  }, 0);

  return somaShares / anosValidos.length;
}