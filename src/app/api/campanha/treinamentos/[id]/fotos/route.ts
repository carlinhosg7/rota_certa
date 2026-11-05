import 'server-only';
import { NextRequest } from 'next/server';
import { randomUUID, createHash } from 'node:crypto';
import { contexto, autorizado, autor, idValido, mensagem, registro, credenciais, rest } from '@/lib/campanha-treinamento-seguro';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const BUCKET='kidy-campanha-treinamentos';
export async function GET(_req:NextRequest,{params}:{params:Promise<{id:string}>}) {
 try {
  const ctx=await contexto(); if(!ctx)return mensagem('Nao autenticado',401);
  const {id}=await params; if(!idValido(id))return mensagem('ID invalido',400);
  const r=await registro(id); if(!r)return mensagem('Nao encontrado',404);
  if(!autorizado(ctx,r))return mensagem('Acesso negado',403);
  const fotos=await rest('kidy_campanha_treinamentos_fotos',{select:'id,tipo_mime,tamanho_bytes,criado_em',treinamento_id:`eq.${id}`,order:'criado_em.asc'}) as unknown[];
  return Response.json({fotos});
 }catch(e){console.error('Fotos listar',e);return mensagem('Nao foi possivel listar fotos',500);}
}
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}) {
 let caminho=''; let enviado=false;
 try {
  const ctx=await contexto(); if(!ctx)return mensagem('Nao autenticado',401);
  const {id}=await params; if(!idValido(id))return mensagem('ID invalido',400);
  const r=await registro(id); if(!r)return mensagem('Nao encontrado',404);
  if(!autorizado(ctx,r)||!autor(ctx,r))return mensagem('Somente autor autorizado pode anexar',403);
  if(r.status!=='RASCUNHO')return mensagem('Somente rascunhos aceitam fotos',409);
  const existentes=await rest('kidy_campanha_treinamentos_fotos',{select:'id',treinamento_id:`eq.${id}`,limit:'5'}) as unknown[];
  if(existentes.length>=5)return mensagem('Limite de 5 fotos por treinamento',409);
  const contentLength=Number(req.headers.get('content-length')||0);
  if(contentLength>6*1024*1024)return mensagem('Envio ultrapassa limite',413);
  const form=await req.formData();const arquivo=form.get('foto');
  if(!(arquivo instanceof File))return mensagem('Selecione uma imagem',400);
  if(arquivo.size<1||arquivo.size>5*1024*1024)return mensagem('Imagem deve ter ate 5 MB',413);
  const bytes=Buffer.from(await arquivo.arrayBuffer());
  const jpg=bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
  const mime=jpg?'image/jpeg':png?'image/png':webp?'image/webp':null;
  if(!mime||arquivo.type!==mime)return mensagem('Envie JPEG, PNG ou WEBP valido',415);
  const ext=jpg?'jpg':png?'png':'webp';
  caminho=`${id}/${randomUUID()}.${ext}`;
  const {base,headers}=credenciais();
  const bucketUrl=`${base}/storage/v1/object/${BUCKET}/${caminho}`;
  const up=await fetch(bucketUrl,{method:'POST',headers:{...headers,'Content-Type':mime,'x-upsert':'false'},body:bytes,cache:'no-store'});
  if(!up.ok){console.error('Upload Storage',up.status,(await up.text()).slice(0,160));return mensagem('Nao foi possivel salvar imagem no Storage',502);}
  enviado=true;
  const hash=createHash('sha256').update(bytes).digest('hex');
  const meta=await fetch(`${base}/rest/v1/kidy_campanha_treinamentos_fotos`,{
   method:'POST',cache:'no-store',headers:{...headers,'Content-Type':'application/json',Prefer:'return=representation'},
   body:JSON.stringify({treinamento_id:id,bucket:BUCKET,objeto_path:caminho,tipo_mime:mime,tamanho_bytes:bytes.length,hash_sha256:hash,enviado_por:ctx.usuario})
  });
  if(!meta.ok)throw Error(`Metadados ${meta.status} ${(await meta.text()).slice(0,150)}`);
  const rows=await meta.json() as Array<{id:string}>;
  // Evento de auditoria: se falhar, foto permanece registrada e nao pontua.
  const ev=await fetch(`${base}/rest/v1/kidy_campanha_treinamentos_eventos`,{
   method:'POST',headers:{...headers,'Content-Type':'application/json'},cache:'no-store',
   body:JSON.stringify({treinamento_id:id,acao:'FOTO_ADICIONADA',status_anterior:'RASCUNHO',status_novo:'RASCUNHO',usuario:ctx.usuario,dados:{foto_id:rows[0]?.id}})
  });
  if(!ev.ok)console.error('Auditoria foto',ev.status);
  return Response.json({sucesso:true,id:rows[0]?.id},{status:201});
 }catch(e){
  if(enviado&&caminho){try{const {base,headers}=credenciais(); await fetch(`${base}/storage/v1/object/${BUCKET}/${caminho}`,{method:'DELETE',headers});}catch{}}
  console.error('Foto upload',e);return mensagem('Falha no upload; confira as configuracoes do bucket',500);
 }
}
