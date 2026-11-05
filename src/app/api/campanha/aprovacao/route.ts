import 'server-only';
import { NextResponse } from 'next/server';
import { contexto, gerente, rest, cod } from '@/lib/campanha-treinamento-seguro';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const OFICIAL = 'CONQUISTE_AMOSTRA_2027';
const HOMOLOGACAO = 'TESTE_CONQUISTE_AMOSTRA_2027';
export async function GET() {
  try {
    const ctx = await contexto();
    if (!ctx) return NextResponse.json({erro:'Nao autenticado'},{status:401});
    if (!gerente(ctx.sessao)) return NextResponse.json({erro:'Acesso restrito a gestores'},{status:403});
    const perfil=String(ctx.sessao.perfil??'').trim().toUpperCase();
    const admin=perfil==='ADMIN'||perfil==='ADMINISTRADOR';
    if(ctx.reps !== null && ctx.reps.size===0) return NextResponse.json({treinamentos:[],total:0,admin});
    // Registros oficiais para gestores; homologacao visivel apenas ao ADMIN.
    const filtroCampanha=admin ? `in.(${OFICIAL},${HOMOLOGACAO})` : `eq.${OFICIAL}`;
    const filtros:Record<string,string>={
      select:'id,campanha,fonte_snapshot,codigo_cliente,nome_cliente_snapshot,codigo_representante,codigo_supervisor_snapshot,data_treinamento,descricao,participantes,status,criado_por,criado_em,enviado_em',
      campanha:filtroCampanha,
      status:'in.(RASCUNHO,ENVIADO,APROVADO,REPROVADO)',
      order:'criado_em.desc',
      limit:'300',
    };
    if(ctx.reps !== null) {
      const permitidos=[...ctx.reps].map(cod).filter(x=>/^\d+$/.test(x));
      if(!permitidos.length) return NextResponse.json({treinamentos:[],total:0,admin});
      filtros.codigo_representante=`in.(${permitidos.join(',')})`;
    }
    type Registro = {campanha:string;fonte_snapshot:string|null;status:string;[k:string]:unknown};
    const dados=await rest('kidy_campanha_treinamentos',filtros) as Registro[];
    // Protecao adicional: nao misturar registros de teste aos oficiais.
    const registros=dados.filter(r=>r.campanha===OFICIAL || (admin && r.campanha===HOMOLOGACAO && r.fonte_snapshot==='HOMOLOGACAO_INTERNA'));
    return NextResponse.json({treinamentos:registros,total:registros.length,admin});
  } catch(e) {
    console.error('[APROVACAO GESTOR GET]',e);
    return NextResponse.json({erro:'Nao foi possivel carregar a fila de treinamentos'},{status:500});
  }
}
