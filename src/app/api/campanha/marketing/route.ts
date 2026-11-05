import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validarToken } from '@/lib/auth';
import { acessoGlobal } from '@/lib/escopo-acesso';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Sessao = { usuario?: unknown; perfil?: unknown };
const codigo = (v: unknown) => String(v ?? '').trim().toLowerCase();
const chaveServidor = () => {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const chave = process.env.SUPABASE_SECRET_KEY || '';
  if (!base || !chave) throw new Error('Configuracao Supabase ausente');
  return { base, cab: { apikey: chave, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' } };
};
async function autorizado() {
  const token = (await cookies()).get('kidy_session')?.value;
  if (!token) return null;
  const sessao = await validarToken(token) as Sessao | null;
  if (!sessao?.usuario) return null;
  const usuario = codigo(sessao.usuario);
  // ADMIN, ADMINISTRADOR e DIRETOR possuem acesso global.
  if (acessoGlobal(sessao)) return usuario;

  const { base, cab } = chaveServidor();
  const url = new URL(`${base}/rest/v1/kidy_campanha_marketing_usuarios`);
  url.searchParams.set('select', 'usuario');
  url.searchParams.set('usuario', `eq.${usuario}`);
  url.searchParams.set('ativo', 'eq.true');
  url.searchParams.set('limit','1');
  const res = await fetch(url, { headers: cab, cache: 'no-store' });
  if (!res.ok) throw new Error('Falha na consulta de permissoes');
  const linhas = await res.json() as Array<{ usuario: string }>;
  return linhas.length ? usuario : null;
}
function falha(e: unknown) {
  console.error('[CAMPANHA MARKETING]', e);
  return NextResponse.json({ erro: 'Falha ao consultar ou registrar feedback' }, { status: 500 });
}
export async function GET() {
  try {
    const usuario = await autorizado();
    if (!usuario) return NextResponse.json({ erro: 'Acesso restrito ao Marketing' }, { status: 403 });
    const { base, cab } = chaveServidor();
    const url = new URL(`${base}/rest/v1/kidy_campanha_treinamentos`);
    url.searchParams.set('select', 'id,codigo_cliente,nome_cliente_snapshot,codigo_representante,data_treinamento,descricao,status,avaliado_em,kidy_campanha_treinamentos_marketing(status,canal,contato_em,cliente_confirmou,nota,recomendaria,comentarios,observacoes_internas,motivo_reprovacao,avaliado_por,avaliado_em)');
    url.searchParams.set('status','eq.APROVADO');
    url.searchParams.set('order','avaliado_em.desc');
    url.searchParams.set('limit','200');
    const res = await fetch(url, { headers: cab, cache: 'no-store' });
    if (!res.ok) throw new Error(`Consulta treinamentos HTTP ${res.status}`);
    const registros = await res.json();
    return NextResponse.json({ treinamentos: registros });
  } catch(e) { return falha(e); }
}
export async function POST(req: NextRequest) {
  try {
    const usuario = await autorizado();
    if (!usuario) return NextResponse.json({ erro: 'Acesso restrito ao Marketing' }, { status: 403 });
    const body = await req.json() as Record<string, unknown>;
    const id = String(body.id || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ erro: 'Identificador invalido' }, { status: 400 });
    }
    const status = String(body.status || '').toUpperCase();
    const canal = String(body.canal || '').toUpperCase();
    const data = String(body.contatoEm || '');
    if (!['VALIDADO','REPROVADO','INCONCLUSIVO'].includes(status) || !['TELEFONE','WHATSAPP','EMAIL','OUTRO'].includes(canal) || !data || !Number.isFinite(Date.parse(data))) {
      return NextResponse.json({ erro: 'Resultado, canal ou data invalidos' }, { status: 400 });
    }
    const texto = (v: unknown) => String(v ?? '').slice(0,3000);
    const confirmado = body.confirmou === true ? true : body.confirmou === false ? false : null;
    const recomendaria = body.recomendaria === true ? true : body.recomendaria === false ? false : null;
    if (status === 'VALIDADO' && (confirmado !== true || !['EXCELENTE','BOM','REGULAR','RUIM'].includes(String(body.nota)) || recomendaria === null)) {
      return NextResponse.json({ erro: 'Para validar, confirme a realizacao, nota e recomendacao' }, { status: 400 });
    }
    if (status === 'REPROVADO' && (confirmado !== false || texto(body.motivo).trim().length < 10)) {
      return NextResponse.json({ erro: 'Reprovacao exige negativa do cliente e justificativa de 10 caracteres' }, { status: 400 });
    }
    if (status === 'INCONCLUSIVO' && confirmado !== null) {
      return NextResponse.json({ erro: 'Resultado inconclusivo nao pode confirmar ou negar realizacao' }, { status: 400 });
    }
    const { base, cab } = chaveServidor();
    const res = await fetch(`${base}/rest/v1/rpc/kidy_avaliar_feedback_marketing`, {
      method: 'POST', headers: cab, cache: 'no-store',
      body: JSON.stringify({
        p_id: id, p_usuario: usuario, p_status: status, p_canal: canal,
        p_contato_em: new Date(data).toISOString(), p_confirmou: confirmado,
        p_nota: status === 'VALIDADO' ? String(body.nota) : null,
        p_recomendaria: status === 'VALIDADO' ? recomendaria : null,
        p_comentarios: texto(body.comentarios), p_observacoes: texto(body.observacoes),
        p_motivo: texto(body.motivo)
      })
    });
    if (!res.ok) {
      const detalhe = await res.text();
      console.error('[CAMPANHA MARKETING RPC]', res.status, detalhe.slice(0,800));
      return NextResponse.json({ erro: 'Nao foi possivel concluir: verifique permissoes, status e informacoes do contato' }, { status: 400 });
    }
    return NextResponse.json({ sucesso: true, status });
  } catch(e) { return falha(e); }
}
