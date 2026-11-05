import 'server-only';
import { NextRequest } from 'next/server';
import { contexto, autorizado, gerente, autor, idValido, mensagem, registro, credenciais } from '@/lib/campanha-treinamento-seguro';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
 try {
  const ctx=await contexto(); if(!ctx)return mensagem('Nao autenticado',401);
  const {id}=await params; if(!idValido(id))return mensagem('ID invalido',400);
  const r=await registro(id); if(!r)return mensagem('Treinamento nao encontrado',404);
  if(!autorizado(ctx,r))return mensagem('Acesso negado',403);
  const body=await req.json().catch(()=>null) as {acao?:string;motivo?:string}|null;
  const acao=String(body?.acao??'').toUpperCase();
  if(!['ENVIAR','APROVAR','REPROVAR'].includes(acao))return mensagem('Acao invalida',400);
  const perfilAdmin=String(ctx.sessao.perfil??'').trim().toUpperCase();
  const adminTotal=perfilAdmin==='ADMIN'||perfilAdmin==='ADMINISTRADOR';
  if(acao==='ENVIAR' && !adminTotal && !autor(ctx,r))return mensagem('Somente o autor pode enviar',403);
  const perfil = String(ctx.sessao.perfil ?? '').trim().toUpperCase();
  const admin = perfil === 'ADMIN' || perfil === 'ADMINISTRADOR';

  if (acao !== 'ENVIAR' && !admin && (!gerente(ctx.sessao) || autor(ctx,r))) {
    return mensagem('Aprovacao exige outro gestor autorizado',403);
  }
  if(acao==='REPROVAR' && String(body?.motivo??'').trim().length<10)return mensagem('Justifique a reprovacao (minimo 10 caracteres)',400);
  const {base,headers}=credenciais();
  const res=await fetch(`${base}/rest/v1/rpc/kidy_movimentar_treinamento`,{
   method:'POST',headers:{...headers,'Content-Type':'application/json'},cache:'no-store',
   body:JSON.stringify({p_id:id,p_acao:acao,p_usuario:ctx.usuario,p_motivo:String(body?.motivo??'').slice(0,3000)})
  });
  if(!res.ok){console.error('RPC treinamento',res.status,(await res.text()).slice(0,350));return mensagem('Transicao nao autorizada; confira status, foto e justificativa',409);}
  const status=await res.json();
  return Response.json({sucesso:true,status,pontuacao:0});
 }catch(e){console.error('Treinamento acao',e);return mensagem('Falha ao movimentar treinamento',500);}
}
