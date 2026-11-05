import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validarToken } from '@/lib/auth';
import { credenciais } from '@/lib/campanha-treinamento-seguro';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function admin(){
 const token=(await cookies()).get('kidy_session')?.value;
 const s=token?await validarToken(token):null;
 if(!s)return null;
 const perfil=String(s.perfil??'').trim().toUpperCase();
 if(!['ADMIN','ADMINISTRADOR'].includes(perfil))return null;
 return String(s.usuario??s.email??s.nome??'ADMIN').trim();
}
export async function GET(){
 try {
  const usuario=await admin();if(!usuario)return NextResponse.json({erro:'Acesso exclusivo ADMIN'}, {status:403});
  const {base,headers}=credenciais();
  const url=new URL(`${base}/rest/v1/kidy_campanha_treinamentos`);
  url.searchParams.set('select','id,campanha,codigo_cliente,nome_cliente_snapshot,codigo_representante,data_treinamento,status,fonte_snapshot,kidy_campanha_treinamentos_marketing(status,cliente_confirmou),kidy_campanha_treinamentos_homologacao(homologado_por,homologado_em)');
  url.searchParams.set('campanha','eq.CONQUISTE_AMOSTRA_2027');
  url.searchParams.set('status','eq.APROVADO');
  url.searchParams.set('data_treinamento','gte.2026-11-09');
  url.searchParams.set('order','data_treinamento.desc');
  url.searchParams.set('limit','1000');
  const resposta=await fetch(url,{headers,cache:'no-store'});
  if(!resposta.ok)throw Error(`Consulta ${resposta.status}: ${(await resposta.text()).slice(0,200)}`);
  const data=await resposta.json() as unknown[];
  if(data.length===1000)return NextResponse.json({erro:'Limite de registros. Implementar paginacao.'},{status:409});
  return NextResponse.json({treinamentos:data});
 } catch(e){console.error('Homologacao GET',e);return NextResponse.json({erro:'Falha ao listar homologacoes; confirme o SQL instalado'},{status:500});}
}
export async function POST(req:NextRequest){
 try {
  const usuario=await admin();if(!usuario)return NextResponse.json({erro:'Acesso exclusivo ADMIN'},{status:403});
  const body=await req.json().catch(()=>null) as {id?:string}|null;
  const id=body?.id??'';if(!uuid.test(id))return NextResponse.json({erro:'ID invalido'},{status:400});
  // Trigger no Supabase verifica campanha, status, marketing, foto e periodo.
  const {base,headers}=credenciais();
  const r=await fetch(`${base}/rest/v1/kidy_campanha_treinamentos_homologacao`,{
    method:'POST',headers:{...headers,'Content-Type':'application/json'},cache:'no-store',
    body:JSON.stringify({treinamento_id:id,homologado_por:usuario})
  });
  if(!r.ok){const erro=(await r.text()).slice(0,350);console.error('Homologacao POST',r.status,erro);return NextResponse.json({erro},{status:409});}
  return NextResponse.json({sucesso:true});
 }catch(e){console.error('Homologacao POST',e);return NextResponse.json({erro:'Falha ao homologar'},{status:500});}
}
