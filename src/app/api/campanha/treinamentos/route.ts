import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validarToken } from '@/lib/auth';
import { representantesPermitidos } from '@/lib/escopo-acesso';
import { carregarMapaRepresentantes, normalizarRepresentante } from '@/lib/representantes-oficiais';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Vinculo = { codigo?: string | number; nome?: string };
type Cliente = {
  codigoCliente?: string | number; razaoSocial?: string; cidade?: string; uf?: string;
  situacao?: string; ultimaCompra?: string | null; limiteDisponivel?: number | null;
  representanteAtual?: Vinculo[]; representantes?: Vinculo[]; supervisores?: Vinculo[];
};
type Linha = { codigo_cliente: string | number; dados: Cliente };
const cod = (v: unknown) => String(v ?? '').trim().replace(/\.0+$/, '');
const texto = (v: unknown) => String(v ?? '').trim();
const falha = (erro: string, status: number) => NextResponse.json({ erro }, { status });
function credenciais() {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const chave = process.env.SUPABASE_SECRET_KEY || '';
  if (!base || !chave) throw new Error('Credenciais Supabase indisponiveis');
  return { base, headers: { apikey: chave, Authorization: `Bearer ${chave}` } };
}
async function consultar(base: string, headers: Record<string,string>, tabela: string, params: Record<string,string>) {
  const url = new URL(`${base}/rest/v1/${tabela}`);
  for (const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
  const r = await fetch(url, { headers, cache: 'no-store' });
  if (!r.ok) throw new Error(`${tabela}: HTTP ${r.status}: ${(await r.text()).slice(0,200)}`);
  return r.json();
}
async function sessao() {
  const token = (await cookies()).get('kidy_session')?.value;
  return token ? await validarToken(token) : null;
}
function vinculos(c: Cliente): Vinculo[] {
  const pessoas = [...(Array.isArray(c.representanteAtual) ? c.representanteAtual : []),
    ...(Array.isArray(c.representantes) ? c.representantes : [])];
  return pessoas.filter((p,i,a) => /^\d+$/.test(cod(p.codigo)) && a.findIndex(x=>cod(x.codigo)===cod(p.codigo)) === i);
}
function dataValida(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === s;
}

export async function POST(req: NextRequest) {
  try {
    const usuario = await sessao();
    if (!usuario) return falha('Nao autenticado', 401);
    const permitidosLista = await representantesPermitidos(usuario);
    if (permitidosLista !== null && permitidosLista.length === 0) return falha('Sem representantes autorizados',403);
    const permitidos = permitidosLista === null ? null : new Set(permitidosLista.map(cod));
    let body: Record<string,unknown>;
    try { body = await req.json() as Record<string,unknown>; } catch { return falha('JSON invalido',400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return falha('Dados invalidos',400);
    const clienteCodigo = cod(body.codigoCliente);
    const repCodigo = cod(body.codigoRepresentante);
    const data = texto(body.dataTreinamento);
    const descricao = texto(body.descricao);
    const participantes = Number(body.participantes);
    if (!/^\d{1,15}$/.test(clienteCodigo) || !/^\d{1,10}$/.test(repCodigo)) return falha('Informe cliente e representante validos',400);
    if (permitidos && !permitidos.has(repCodigo)) return falha('Representante nao autorizado',403);
    if (!dataValida(data) || data < '2026-11-09' || data > '2027-03-31') return falha('Data fora da campanha',400);
    // Impedir registro de treinamento futuro. O rascunho pode ser criado depois da realizacao.
    const hojeBrasil = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if (data > hojeBrasil) return falha('Nao e permitido registrar treinamento futuro',400);
    if (descricao.length < 10 || descricao.length > 3000) return falha('Descricao deve ter de 10 a 3000 caracteres',400);
    if (!Number.isInteger(participantes) || participantes < 1 || participantes > 10000) return falha('Participantes deve ser inteiro entre 1 e 10000',400);
    const { base, headers } = credenciais();
    const config = await consultar(base,headers,'kidy_carteira_config',{select:'snapshot_ativo',chave:'eq.ATIVO',limit:'1'}) as Array<{snapshot_ativo?:string}>;
    const snapshot = config[0]?.snapshot_ativo;
    if (!snapshot) return falha('Carteira ativa nao encontrada',503);
    const linhas = await consultar(base,headers,'kidy_carteira_clientes',{
      select:'codigo_cliente,dados',snapshot_id:`eq.${snapshot}`,codigo_cliente:`eq.${clienteCodigo}`,limit:'2'
    }) as Linha[];
    if (linhas.length !== 1 || !linhas[0].dados) return falha('Cliente nao encontrado na carteira ativa',404);
    const cliente = linhas[0].dados;
    // O cliente pode manter o codigo antigo no snapshot.
    // A consulta oficial prioriza codigos atuais, inclusive o 19.
    const mapaOficial = await carregarMapaRepresentantes();
    const vinculo = vinculos(cliente).find(p =>
      normalizarRepresentante(cod(p.codigo), mapaOficial).codigo === repCodigo
    );
    if (!vinculo) return falha('Cliente nao vinculado ao representante informado',403);
    const representantes = await consultar(base,headers,'representantes_cadastro',{
      select:'codigo_rep,codigo_supervisor',codigo_rep:`eq.${repCodigo}`,ativo:'eq.true',limit:'2'
    }) as Array<{codigo_rep:string|number;codigo_supervisor:string|number|null}>;
    if (representantes.length !== 1) return falha('Representante ativo nao encontrado no cadastro oficial',409);
    const supervisor = cod(representantes[0].codigo_supervisor);
    // O supervisor oficial atual prevalece sobre o codigo antigo do snapshot.
    // A autorizacao continua validada acima pelo representante ativo.
    if (!supervisor) return falha('Representante sem supervisor oficial',409);
    const dataUltima = texto(cliente.ultimaCompra);
    const ultima = dataValida(dataUltima) ? dataUltima : null;
    const limite = typeof cliente.limiteDisponivel === 'number' && Number.isFinite(cliente.limiteDisponivel)
      ? cliente.limiteDisponivel : null;
    const identificador = texto((usuario as { email?:string; nome?:string; codigo_representante?:string }).email)
      || texto((usuario as { nome?:string }).nome)
      || `REP:${cod((usuario as {codigo_representante?:string}).codigo_representante)}`;
    // Somente campos conhecidos; compras da colecao e limites aprovado/credito nao sao presumidos.
    const dados = { codigoCliente: clienteCodigo, cidade: cliente.cidade ?? null,
      uf: cliente.uf ?? null, situacao: cliente.situacao ?? null,
      ultimaCompra: ultima, limiteDisponivel: limite,
      codigoRepresentante: repCodigo, codigoSupervisor: supervisor || null,
      snapshotId: snapshot };
    const r = await fetch(`${base}/rest/v1/rpc/kidy_criar_treinamento_rascunho`, {
      method:'POST', cache:'no-store',
      headers:{...headers,'Content-Type':'application/json'},
      body:JSON.stringify({
        p_codigo_cliente: clienteCodigo,p_nome_cliente: texto(cliente.razaoSocial),
        p_codigo_representante:repCodigo,p_representante_nome:texto(vinculo.nome),
        p_codigo_supervisor:supervisor || null,p_data:data,p_descricao:descricao,
        p_participantes:participantes,p_situacao:texto(cliente.situacao) || null,
        p_ultima_compra:ultima,p_limite_disponivel:limite,p_dados:dados,p_criado_por:identificador,
      })
    });
    if (!r.ok) throw new Error(`RPC HTTP ${r.status}: ${(await r.text()).slice(0,300)}`);
    const id = await r.json() as string;
    return NextResponse.json({ sucesso:true,id,status:'RASCUNHO',pontuacao:0 },{status:201});
  } catch(e) {
    console.error('[CAMPANHA TREINAMENTOS POST]',e);
    return falha('Nao foi possivel cadastrar o treinamento',500);
  }
}

export async function GET(req: NextRequest) {
  try {
    const usuario = await sessao();
    if (!usuario) return falha('Nao autenticado',401);
    const autorizados = await representantesPermitidos(usuario);
    if (autorizados !== null && autorizados.length === 0) return NextResponse.json({treinamentos:[],total:0});
    const admin = ['ADMIN','ADMINISTRADOR'].includes(texto(usuario.perfil).toUpperCase());
    const homologacao = req.nextUrl.searchParams.get('homologacao') === '1';
    if (homologacao && !admin) return falha('Homologacao exclusiva do ADMIN',403);
    const rep = cod(req.nextUrl.searchParams.get('representante'));
    if (rep && !/^\d+$/.test(rep)) return falha('Representante invalido',400);
    const permitidos = autorizados === null ? null : new Set(autorizados.map(cod));
    if (rep && permitidos && !permitidos.has(rep)) return falha('Representante nao autorizado',403);
    // Restricao server-side antes da consulta: nao permitir leitura global para perfil restrito.
    const {base,headers} = credenciais();
    if (!rep && permitidos && permitidos.size > 100) return falha('Informe representante para consultar',400);
    const filtros:Record<string,string> = {
      select:'id,codigo_cliente,nome_cliente_snapshot,codigo_representante,codigo_supervisor_snapshot,data_treinamento,descricao,participantes,status,criado_em',
      campanha:homologacao?'eq.TESTE_CONQUISTE_AMOSTRA_2027':'eq.CONQUISTE_AMOSTRA_2027',order:'criado_em.desc',limit:'100'
    };
    if (homologacao) filtros.fonte_snapshot = 'eq.HOMOLOGACAO_INTERNA';
    if (rep) filtros.codigo_representante = `eq.${rep}`;
    else if (permitidos) filtros.codigo_representante = `in.(${[...permitidos].join(',')})`;
    const lista = await consultar(base,headers,'kidy_campanha_treinamentos',filtros) as unknown[];
    return NextResponse.json({treinamentos:lista,total:lista.length,podeHomologar:admin,homologacao});
  } catch(e) {
    console.error('[CAMPANHA TREINAMENTOS GET]',e);
    return falha('Nao foi possivel listar treinamentos',500);
  }
}
