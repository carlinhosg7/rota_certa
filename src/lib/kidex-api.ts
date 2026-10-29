import { NextRequest, NextResponse } from 'next/server';
import { carregarKidex, type LinhaKidex } from '@/lib/kidex-data';
import { carregarMapaRepresentantes, normalizarRepresentante } from '@/lib/representantes-oficiais';
import { calcularIndicador, calcularMetaSemanaEntreMeses } from '@/lib/metas-calculos';

const cod = (v: unknown) => String(v ?? '').trim().replace(/\.0+$/, '');
const iso = (d: Date) => d.toISOString().slice(0,10);
const inicioMes = (ano:number, mes:number) => new Date(Date.UTC(ano,mes-1,1));
const fimMes = (ano:number, mes:number) => new Date(Date.UTC(ano,mes,0));
const soma = (linhas: {pares:number;valores:number}[]) => linhas.reduce((a,l)=>({pares:a.pares+l.pares,valores:a.valores+l.valores}),{pares:0,valores:0});
const entre = (d:Date, a:Date, b:Date) => d >= a && d <= b;

export async function responderKidex(req: NextRequest, usuario: any) {
  const q = req.nextUrl.searchParams;
  const periodicidade = q.get('periodicidade') || 'MENSAL';
  const visao = q.get('visao') || 'CADASTRO';
  if (!['MENSAL','SEMANAL'].includes(periodicidade) || !['CADASTRO','ENTREGA'].includes(visao)) return NextResponse.json({erro:'Filtro KIDEX inválido'},{status:400});
  const {atual,anterior,metas:metasOriginais} = await carregarKidex();
  const ano = atual.periodo.inicio.getUTCFullYear(), mes = atual.periodo.inicio.getUTCMonth()+1;
  let inicio = inicioMes(ano,mes), fim = fimMes(ano,mes);
  if (periodicidade === 'SEMANAL') {
    // Semana corrente: domingo a sábado, limitada ao mês de referência da fonte.
    const partes = new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const parte = (tipo:string) => Number(partes.find(p=>p.type===tipo)?.value ?? 0);
    const hoje = new Date(Date.UTC(parte('year'),parte('month')-1,parte('day')));
    const referencia = hoje.getUTCFullYear() === ano && hoje.getUTCMonth()+1 === mes ? hoje : atual.periodo.fim;
    const domingo = new Date(referencia); domingo.setUTCDate(domingo.getUTCDate()-domingo.getUTCDay());
    const sabado = new Date(domingo); sabado.setUTCDate(sabado.getUTCDate()+6);
    inicio = domingo < inicio ? inicio : domingo;
    fim = sabado > fim ? fim : sabado;
  }
  const mapa = await carregarMapaRepresentantes();
  const perfil = String(usuario.perfil ?? '').toUpperCase();
  const login = cod(usuario.codigo_representante || usuario.usuario);
  const repLogin = /^\d+$/.test(login) ? normalizarRepresentante(login,mapa).codigo : '';
  if (perfil === 'REPRESENTANTE' && !mapa.cadastro.has(repLogin)) return NextResponse.json({erro:'Representante não vinculado ao usuário'},{status:403});
  const repFiltro = cod(q.get('representante')) ? normalizarRepresentante(cod(q.get('representante')),mapa).codigo : '';
  const regionalFiltro = cod(q.get('regional'));
  const metas = metasOriginais.map(m=>{
    const oficial = normalizarRepresentante(m.rep,mapa).codigo;
    const cadastro = mapa.cadastro.get(oficial);
    return {...m,rep:oficial,nome:cadastro?.nome_rep || m.nome,supervisor:cod(normalizarRepresentante(m.rep,mapa).supervisor)};
  });
  const disponiveis = metas.filter(m=>perfil !== 'REPRESENTANTE' || m.rep === repLogin);
  const regionais = new Map<string,string>();
  const reps = new Map<string,{codigo:string;nome:string;regional:string}>();
  for (const m of disponiveis) {
    if (!m.supervisor) continue;
    regionais.set(m.supervisor,m.supervisor);
    reps.set(`${m.supervisor}:${m.rep}`,{codigo:m.rep,nome:m.nome,regional:m.supervisor});
  }
  if (regionalFiltro && !regionais.has(regionalFiltro)) return NextResponse.json({erro:'Gestão regional não disponível'},{status:403});
  const representantes = [...reps.values()].filter(r=>!regionalFiltro || r.regional===regionalFiltro).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  if (repFiltro && !representantes.some(r=>r.codigo===repFiltro)) return NextResponse.json({erro:'Representante não pertence à regional selecionada'},{status:403});
  const acesso = (rep:string,supervisor:string) => (perfil !== 'REPRESENTANTE' || rep === repLogin) && (!repFiltro || rep === repFiltro) && (!regionalFiltro || supervisor === regionalFiltro);
  const metasPeriodo = metas.filter(m=>acesso(m.rep,m.supervisor) && (periodicidade==='MENSAL' ? m.ano===ano && m.mes===mes : inicioMes(m.ano,m.mes)<=fim && fimMes(m.ano,m.mes)>=inicio));
  const meta = periodicidade==='MENSAL' ? soma(metasPeriodo) : {
    pares:calcularMetaSemanaEntreMeses(metasPeriodo.map(m=>({ano:m.ano,mes:m.mes,meta:m.pares})),inicio,fim),
    valores:calcularMetaSemanaEntreMeses(metasPeriodo.map(m=>({ano:m.ano,mes:m.mes,meta:m.valores})),inicio,fim),
  };
  const universo = new Set(metasPeriodo.map(m=>m.rep));
  const normalizar = (linhas:LinhaKidex[]) => linhas.map(l=>{
    const oficial = normalizarRepresentante(l.rep,mapa);
    return {...l,rep:oficial.codigo,supervisor:cod(oficial.supervisor)};
  });
  const coluna = visao==='CADASTRO' ? 'cadastro' : 'entrega';
  const realizados = normalizar(atual.linhas).filter(l=>entre(l[coluna],inicio,fim) && acesso(l.rep,l.supervisor));
  const conciliados = realizados.filter(l=>universo.has(l.rep));
  const realizado = soma(conciliados);
  // AA somente se a fonte realmente for do mesmo mês do ano anterior.
  const periodoAA = anterior.periodo;
  const aaValido = periodicidade==='MENSAL' && periodoAA.inicio.getUTCFullYear()===ano-1 && periodoAA.inicio.getUTCMonth()+1===mes && periodoAA.fim.getUTCFullYear()===ano-1;
  const inicioAA = inicioMes(ano-1,mes), fimAA = fimMes(ano-1,mes);
  const realizadosAA = aaValido ? normalizar(anterior.linhas).filter(l=>entre(l[coluna],inicioAA,fimAA) && acesso(l.rep,l.supervisor) && universo.has(l.rep)) : [];
  const aa = aaValido ? soma(realizadosAA) : null;
  const comRealizado = new Set(conciliados.map(l=>l.rep));
  const semMeta = realizados.filter(l=>!universo.has(l.rep));
  const semMetaAgrupados = new Map<string,{codigo:string;nome:string;pares:number;valor:number}>();
  for (const l of semMeta) { const atual = semMetaAgrupados.get(l.rep) || {codigo:l.rep,nome:l.nome,pares:0,valor:0}; atual.pares+=l.pares;atual.valor+=l.valores;semMetaAgrupados.set(l.rep,atual); }
  const avisos = [
    'KIDEX exclusivo: pedido tipo 4 (Pronta Entrega).',
    visao==='CADASTRO'?'Entrada KIDEX por Data Cadastro.':'Venda para Faturamento Dentro do Mês por Data Entrega; não é faturamento fiscal.',
    'Fonte de pedidos KIDEX já segmentada como Pronta Entrega.',
    periodicidade==='SEMANAL'?'Meta semanal proporcional aos dias úteis de segunda a sexta, sem feriados.':'Meta mensal do arquivo META ENTRADA C KIDEX.xlsx.',
    'Metas e realizados conciliados pelo representante oficial do Supabase.',
    'Registros sem meta ficam separados para auditoria.',
    aaValido?'AA validado por período do ano anterior.':'Comparativo AA oculto: a aba KIDEX METAS AA não comprova o período equivalente do ano anterior.',
    'A fonte possui filtros de operações, situações e exclusões de supervisores; comparabilidade requer auditoria.',
  ];
  return NextResponse.json({
    tipo:'KIDEX',visao,periodicidade,pedido:'4',
    filtros:{regional:regionalFiltro,representante:repFiltro,regionais:[...regionais].map(([codigo,nome])=>({codigo,nome})),representantes},
    periodo:{inicio:iso(inicio),fim:iso(fim),original:`${visao==='CADASTRO'?'Data Cadastro':'Data Entrega'}: ${inicio.toLocaleDateString('pt-BR',{timeZone:'UTC'})} à ${fim.toLocaleDateString('pt-BR',{timeZone:'UTC'})}`},
    indicadores:{pares:{...calcularIndicador(meta.pares,realizado.pares),realizadoAA:aa?.pares??null},valores:{...calcularIndicador(meta.valores,realizado.valores),realizadoAA:aa?.valores??null}},
    comparabilidade:{validada:false,escopo:'FONTE_KIDEX',supervisores:[],possuiExclusoes:/Exceto/i.test(atual.metadados)},
    conciliacao:{representantesComMeta:universo.size,representantesNoRealizado:new Set(realizados.map(l=>l.rep)).size,representantesConciliados:comRealizado.size,representantesSemRealizado:[...universo].filter(r=>!comRealizado.has(r)),representantesSemMeta:[...semMetaAgrupados.values()]},
    fonte:{arquivo:'MATINAL COMERIAL.xlsx',aba:'KIDEX METAS',filtrosOriginais:atual.metadados,registrosRealizado:realizados.length,registrosMeta:metasPeriodo.length},avisos,
  });
}
