import * as XLSX from "xlsx";
import { atualizarCatalogoDrive, lerArquivoComercial } from "./google-drive-adapter";

export type LinhaKidex = { rep: string; nome: string; supervisor: string; cadastro: Date; entrega: Date; pares: number; valores: number };
export type MetaKidex = { rep: string; nome: string; ano: number; mes: number; pares: number; valores: number };
const normal = (v: unknown) => String(v ?? "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const cod = (v: unknown) => String(v ?? "").trim().replace(/\.0+$/, "");
const num = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0;
function data(v: unknown): Date | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()));
  if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); return d ? new Date(Date.UTC(d.y, d.m - 1, d.d)) : null; }
  const t = String(v ?? "");
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(Date.UTC(+br[3], +br[2]-1, +br[1]));
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? new Date(Date.UTC(+iso[1], +iso[2]-1, +iso[3])) : null;
}
function tabela(w: XLSX.WorkBook, aba: string, obrigatorios: string[]) {
  const sheet = w.Sheets[aba];
  if (!sheet) throw new Error(`Aba ${aba} não encontrada em ${w.SheetNames.join(', ')}`);
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, blankrows: false });
  const cab = linhas.findIndex(l => obrigatorios.every(c => l.some(v => normal(v) === normal(c))));
  if (cab < 0) throw new Error(`Cabeçalho inválido em ${aba}: ${obrigatorios.join(', ')}`);
  const colunas = linhas[cab].map(normal);
  const i = (campo: string) => { const n = colunas.indexOf(normal(campo)); if (n < 0) throw new Error(`Coluna ${campo} ausente em ${aba}`); return n; };
  return { linhas: linhas.slice(cab + 1), meta: linhas.slice(0, cab).flat().map(String).join(' | '), i };
}
function periodoMeta(texto: string) {
  const m = texto.match(/Data Cadastro\s*:\s*(\d{2}\/\d{2}\/\d{4})\s*(?:à|a|ate|até)\s*(\d{2}\/\d{2}\/\d{4})/i);
  if (!m) throw new Error('Período Data Cadastro não identificado em KIDEX METAS');
  const inicio = data(m[1])!, fim = data(m[2])!;
  if (inicio.getUTCMonth() !== fim.getUTCMonth() || inicio.getUTCFullYear() !== fim.getUTCFullYear()) throw new Error('Fonte KIDEX contém múltiplos meses');
  return { inicio, fim, texto: `Data Cadastro: ${m[1]} à ${m[2]}` };
}
function linhasKidex(w: XLSX.WorkBook, aba: string) {
  const t = tabela(w, aba, ['Codigo Representante Carteira','Data Cadastro','Data Entrega','Qtd Venda','Vlr Venda']);
  const linhas: LinhaKidex[] = [];
  for (const l of t.linhas) {
    const rep = cod(l[t.i('Codigo Representante Carteira')]);
    const cadastro = data(l[t.i('Data Cadastro')]);
    const entrega = data(l[t.i('Data Entrega')]);
    if (!/^\d+$/.test(rep) || !cadastro || !entrega) continue;
    linhas.push({rep,nome:String(l[t.i('Representante Carteira')] ?? ''),supervisor:String(l[t.i('Supervisor')] ?? ''),cadastro,entrega,pares:num(l[t.i('Qtd Venda')]),valores:num(l[t.i('Vlr Venda')])});
  }
  return { linhas, periodo: periodoMeta(t.meta), metadados: t.meta };
}
export async function carregarKidex() {
  await atualizarCatalogoDrive();
  const [wb, wm] = await Promise.all([
    lerArquivoComercial('MATINAL COMERIAL.xlsx').then(b => XLSX.read(b,{type:'buffer',cellDates:true})),
    lerArquivoComercial('META ENTRADA C KIDEX.xlsx').then(b => XLSX.read(b,{type:'buffer',cellDates:true})),
  ]);
  const atual = linhasKidex(wb,'KIDEX METAS');
  const anterior = linhasKidex(wb,'KIDEX METAS AA');
  const t = tabela(wm,'Mes Atual_MAIO_23',['CODIGO_REP','ANO','MÊS','ID_TIPO_PEDIDO','META_QUANTIDADE','META_VALOR']);
  const metas: MetaKidex[] = [];
  const tiposEncontrados = new Set<number>();
  for (const l of t.linhas) {
    const rep = cod(l[t.i('CODIGO_REP')]);
    if (!/^\d+$/.test(rep)) continue;
    tiposEncontrados.add(num(l[t.i('ID_TIPO_PEDIDO')]));

    const dup = t.i('DUPLOS');
    if (l[dup] != null && normal(l[dup]) !== 'NAO') continue;
    const ano = num(l[t.i('ANO')]), mes = num(l[t.i('MÊS')]);
    if (ano < 2020 || mes < 1 || mes > 12) continue;
    metas.push({rep,nome:String(l[t.i('REP')] ?? ''),ano,mes,pares:num(l[t.i('META_QUANTIDADE')]),valores:num(l[t.i('META_VALOR')])});
  }
  if (metas.length === 0) throw new Error("META ENTRADA C KIDEX.xlsx não contém metas válidas para o período.");
  return {atual, anterior, metas};
}
