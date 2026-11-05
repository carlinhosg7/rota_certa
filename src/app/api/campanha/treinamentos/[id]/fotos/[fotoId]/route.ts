import 'server-only';
import {
  contexto, autorizado, autor, idValido, mensagem, registro, credenciais, rest,
} from '@/lib/campanha-treinamento-seguro';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type P = { params: Promise<{ id: string; fotoId: string }> };

export async function GET(_req: Request, {params}: P) {
  try {
    const ctx = await contexto();
    if (!ctx) return mensagem('Nao autenticado',401);
    const {id,fotoId} = await params;
    if (!idValido(id) || !idValido(fotoId)) return mensagem('ID invalido',400);
    const r = await registro(id);
    if (!r) return mensagem('Nao encontrado',404);
    if (!autorizado(ctx,r)) return mensagem('Acesso negado',403);
    const rows = await rest('kidy_campanha_treinamentos_fotos', {
      select: 'bucket,objeto_path,tipo_mime', id: `eq.${fotoId}`, treinamento_id: `eq.${id}`, limit: '1',
    }) as Array<{bucket:string;objeto_path:string;tipo_mime:string}>;
    const foto=rows[0];
    if (!foto || foto.bucket !== 'kidy-campanha-treinamentos') return mensagem('Foto nao encontrada',404);
    const {base, headers}=credenciais();
    const path=foto.objeto_path.split('/').map(encodeURIComponent).join('/');
    const response=await fetch(`${base}/storage/v1/object/${foto.bucket}/${path}`, {headers,cache:'no-store'});
    if (!response.ok) return mensagem('Foto indisponivel',404);
    return new Response(await response.arrayBuffer(), {
      headers: {
        'Content-Type':foto.tipo_mime,
        'Cache-Control':'private, no-store',
        'X-Content-Type-Options':'nosniff',
        'Content-Disposition':'inline',
      },
    });
  } catch (e) {
    console.error('[FOTO GET]',e);
    return mensagem('Falha ao consultar foto',500);
  }
}

export async function DELETE(_req: Request, {params}: P) {
  try {
    const ctx=await contexto();
    if (!ctx) return mensagem('Nao autenticado',401);
    const {id,fotoId}=await params;
    if (!idValido(id) || !idValido(fotoId)) return mensagem('ID invalido',400);
    const r=await registro(id);
    if (!r) return mensagem('Nao encontrado',404);
    if (!autorizado(ctx,r) || !autor(ctx,r)) return mensagem('Somente autor autorizado pode excluir',403);
    if (r.status !== 'RASCUNHO') return mensagem('Somente rascunhos permitem excluir fotos',409);
    const {base, headers}=credenciais();
    const response=await fetch(`${base}/rest/v1/rpc/kidy_excluir_foto_treinamento`,{
      method:'POST',cache:'no-store',
      headers:{...headers,'Content-Type':'application/json'},
      body:JSON.stringify({p_treinamento_id:id,p_foto_id:fotoId,p_usuario:ctx.usuario}),
    });
    if (!response.ok) {
      console.error('[FOTO DELETE RPC]',response.status,(await response.text()).slice(0,240));
      return mensagem('Nao foi possivel excluir foto. Confira SQL e status.',409);
    }
    const rows=await response.json() as Array<{bucket:string;objeto_path:string}>;
    const foto=rows[0];
    if (!foto || foto.bucket !== 'kidy-campanha-treinamentos') return mensagem('Foto nao encontrada',404);
    const path=foto.objeto_path.split('/').map(encodeURIComponent).join('/');
    const storage=await fetch(`${base}/storage/v1/object/${foto.bucket}/${path}`,{method:'DELETE',headers,cache:'no-store'});
    if (!storage.ok) {
      console.error('[FOTO DELETE STORAGE] Metadados excluidos; objeto requer limpeza',foto.objeto_path,storage.status);
      return Response.json({sucesso:true,aviso:'Foto removida do treinamento. Limpeza do arquivo privado pendente.'});
    }
    return Response.json({sucesso:true});
  } catch (e) {
    console.error('[FOTO DELETE]',e);
    return mensagem('Nao foi possivel excluir foto',500);
  }
}
