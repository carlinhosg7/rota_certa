import 'server-only';
import { cookies } from 'next/headers';
import { validarToken } from '@/lib/auth';
import { representantesPermitidos } from '@/lib/escopo-acesso';

export type Registro = {
  id:string; codigo_representante:string; criado_por:string; status:string;
  codigo_cliente:string; nome_cliente_snapshot:string; data_treinamento:string;
  campanha?:string; fonte_snapshot?:string|null;
};
type Sessao = NonNullable<Awaited<ReturnType<typeof validarToken>>>;
export const normal = (v:unknown) => String(v ?? '').trim();
export const cod = (v:unknown) => normal(v).replace(/\.0+$/, '');
export const idValido = (v:string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const mensagem = (erro:string,status:number) => Response.json({erro},{status});
export function dono(s:Sessao) {
  return normal(s.email) || normal(s.nome) || `REP:${cod(s.codigo_representante)}`;
}
export function gerente(s:Sessao) {
  return ['ADMIN','ADMINISTRADOR','DIRETOR','GERENTE','SUPERVISOR'].includes(normal(s.perfil).toUpperCase());
}
export async function contexto() {
  const token = (await cookies()).get('kidy_session')?.value;
  const sessao = token ? await validarToken(token) : null;
  if (!sessao) return null;
  const reps = await representantesPermitidos(sessao);
  return {sessao, reps:reps===null?null:new Set(reps.map(cod)), usuario:dono(sessao)};
}
export function autorizado(ctx:NonNullable<Awaited<ReturnType<typeof contexto>>>, r:Registro) {
  return ctx.reps===null || ctx.reps.has(cod(r.codigo_representante));
}
export function credenciais() {
  const base=(process.env.NEXT_PUBLIC_SUPABASE_URL||process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const chave=process.env.SUPABASE_SECRET_KEY||'';
  if(!base||!chave) throw Error('Credenciais Supabase ausentes');
  return {base, headers:{apikey:chave,Authorization:`Bearer ${chave}`}};
}
export async function rest(tabela:string,params:Record<string,string>) {
  const {base,headers}=credenciais();
  const url=new URL(`${base}/rest/v1/${tabela}`);
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  const r=await fetch(url,{headers,cache:'no-store'});
  if(!r.ok)throw Error(`Consulta ${tabela}: ${r.status} ${(await r.text()).slice(0,160)}`);
  return r.json();
}
export async function registro(id:string):Promise<Registro|null> {
  const l=await rest('kidy_campanha_treinamentos',{
    select:'id,codigo_representante,criado_por,status,codigo_cliente,nome_cliente_snapshot,data_treinamento,campanha,fonte_snapshot',
    id:`eq.${id}`,campanha:'in.(CONQUISTE_AMOSTRA_2027,TESTE_CONQUISTE_AMOSTRA_2027)',limit:'1'
  }) as Registro[];
  const r=l[0];
  if (!r) return null;
  if (r.campanha === 'CONQUISTE_AMOSTRA_2027') return r;
  const token=(await cookies()).get('kidy_session')?.value;
  const sessao=token?await validarToken(token):null;
  const admin=['ADMIN','ADMINISTRADOR'].includes(normal(sessao?.perfil).toUpperCase());
  if (!admin || r.campanha !== 'TESTE_CONQUISTE_AMOSTRA_2027' || r.fonte_snapshot !== 'HOMOLOGACAO_INTERNA') return null;
  return r;
}
export function autor(ctx:NonNullable<Awaited<ReturnType<typeof contexto>>>,r:Registro) {
  return ['ADMIN','ADMINISTRADOR'].includes(normal(ctx.sessao.perfil).toUpperCase()) || ctx.usuario.toLowerCase()===normal(r.criado_por).toLowerCase();
}
