'use client';
import PlanejadorShare from './PlanejadorShare';

import { useEffect, useMemo, useState } from 'react';
import type { CidadeShare } from '../../lib/share';

type Dados = { cidades: CidadeShare[]; ultimoAnoCompleto: number; vendasDisponiveis: boolean; observacao: string };
type ClienteCidade = { codigo:string; razao_social:string; grupo_cliente:string; codigo_representante:string; representante:string; supervisor:string; cidade:string; uf:string };
type DetalhesClientes = { clientes:ClienteCidade[]; total:number; visao360Template:string|null };

const fmt = (n:number) => n.toLocaleString('pt-BR',{maximumFractionDigits:0});
const pct = (n:number|null) => n===null ? '—' : `${n.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}%`;
export default function ShareClient() {
  const [dados,setDados] = useState<Dados|null>(null);
  const [erro,setErro]=useState('');
  const [contagens,setContagens]=useState<Record<string,number>>({});
  const [erroClientes,setErroClientes]=useState('');
  const [cidadeAberta,setCidadeAberta]=useState<CidadeShare|null>(null);
  const [clientesCidade,setClientesCidade]=useState<DetalhesClientes|null>(null);
  const [carregandoCidade,setCarregandoCidade]=useState(false);
  const [buscaCliente,setBuscaCliente]=useState('');
  const [gerente,setGerente]=useState(''); const [supervisor,setSupervisor]=useState('');
  const [rep,setRep]=useState(''); const [uf,setUf]=useState(''); const [cidade,setCidade]=useState('');
  const [simulado,setSimulado]=useState(5); const [ordenar,setOrdenar]=useState<'cidade'|'potencial_pares'|'meta_pares_5pct'>('potencial_pares');
  useEffect(()=>{fetch('/api/share').then(async r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}).then(setDados).catch(e=>setErro(String(e)))},[]);
  useEffect(()=>{fetch('/api/share/clientes?modo=contagem').then(async r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}).then((v:{contagens:Record<string,number>})=>setContagens(v.contagens??{})).catch(e=>setErroClientes('Contagem de clientes indisponível: '+String(e)))},[]);
  const base=dados?.cidades??[];
  async function abrirCidade(c:CidadeShare){
    setCidadeAberta(c); setClientesCidade(null); setBuscaCliente(''); setCarregandoCidade(true);
    try{
      const r=await fetch('/api/share/clientes?ibge='+encodeURIComponent(String(c.codigo_ibge)));
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      setClientesCidade(await r.json() as DetalhesClientes);
    }catch(e){setClientesCidade({clientes:[],total:-1,visao360Template:null});setErroClientes('Falha ao carregar clientes da cidade: '+String(e));}
    finally{setCarregandoCidade(false)}
  }
  const clientesFiltrados=(clientesCidade?.clientes??[]).filter(c=>`${c.codigo} ${c.razao_social} ${c.grupo_cliente}`.toLocaleLowerCase('pt-BR').includes(buscaCliente.toLocaleLowerCase('pt-BR')));
  const url360=(codigo:string,template:string)=>template.replaceAll('{codigo}',encodeURIComponent(codigo));
  const unique=(values:string[])=>[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const supervisores = useMemo(()=>unique(base.filter(c=>!gerente||c.gerente===gerente).map(c=>c.supervisor)),[base,gerente]);
  const baseRepresentantes=useMemo(()=>base.filter(c=>(!gerente||c.gerente===gerente)&&(!supervisor||c.supervisor===supervisor)),[base,gerente,supervisor]);
  const representantes=useMemo(()=>{
    const mapa=new Map<string,string>();
    for(const c of baseRepresentantes){
      const codigo=String(c.representante_codigo??'').trim();
      if(!codigo)continue;
      const nome=String(c.representante??'').trim();
      if(!mapa.has(codigo)||(!mapa.get(codigo)&&nome))mapa.set(codigo,nome);
    }
    return [...mapa.entries()].sort(([a],[b])=>a.localeCompare(b,'pt-BR',{numeric:true}));
  },[baseRepresentantes]);
  const baseUF=useMemo(()=>baseRepresentantes.filter(c=>!rep||String(c.representante_codigo)===rep),[baseRepresentantes,rep]);
  const ufs=useMemo(()=>unique(baseUF.map(c=>c.uf)),[baseUF]);
  const baseCidades=useMemo(()=>baseUF.filter(c=>!uf||c.uf===uf),[baseUF,uf]);
  const cidades=useMemo(()=>unique(baseCidades.map(c=>c.cidade)),[baseCidades]);
  const filtro=useMemo(()=>baseCidades.filter(c=>!cidade||c.cidade===cidade),[baseCidades,cidade]);
  const linhas=useMemo(()=>[...filtro].sort((a,b)=>ordenar==='cidade'?a.cidade.localeCompare(b.cidade,'pt-BR'):b[ordenar]-a[ordenar]),[filtro,ordenar]);
  const anoAtual = new Date().getFullYear();
  const anosMedia=[2017,2018,2019,2020,2021,2023,2024,2025].filter(a=>a<anoAtual);
  const total=useMemo(()=>{
    const potencial=filtro.reduce((s,c)=>s+c.potencial_pares,0);
    const anoUltimo=String(dados?.ultimoAnoCompleto??anoAtual-1);
    const paresAno=(ano:string)=>filtro.reduce((s,c)=>s+Number(c.vendas_ano?.[ano]??0),0);
    const paresUltimo=paresAno(anoUltimo);
    const paresAtual=paresAno(String(anoAtual));
    const shareUltimo=potencial>0&&dados?.vendasDisponiveis?paresUltimo/potencial*100:null;
    const shareAtual=potencial>0&&dados?.vendasDisponiveis?paresAtual/potencial*100:null;
    const media=potencial>0&&dados?.vendasDisponiveis&&anosMedia.length
      ?anosMedia.reduce((s,ano)=>s+paresAno(String(ano))/potencial*100,0)/anosMedia.length:null;
    const anosPresentes=new Set<string>();
    for(const c of filtro)for(const ano of Object.keys(c.vendas_ano??{}))anosPresentes.add(ano);
    const evolucao=[...anosPresentes].filter(a=>Number(a)<=anoAtual).sort((a,b)=>Number(a)-Number(b))
      .map(ano=>{const pares=paresAno(ano);return {ano,pares,share:potencial>0?pares/potencial*100:null};});
    return {potencial,meta:potencial*.05,projecao:potencial*simulado/100,paresUltimo,paresAtual,shareUltimo,shareAtual,media,evolucao};
  },[filtro,dados?.ultimoAnoCompleto,dados?.vendasDisponiveis,simulado,anoAtual,anosMedia.join(',')]);
  function baixarCSV(){
    const anoUltimo=String(dados?.ultimoAnoCompleto??anoAtual-1);
    const anoCorrente=String(anoAtual);
    const header=['UF','Cidade','Codigo IBGE','Gerente','Supervisor','Codigo Representante','Representante','Clientes cadastrados','Populacao','% 0-14','Potencial','Meta 5%',`Pares ${anoUltimo}`,`Share ${anoUltimo}`,`Pares ${anoCorrente}`,`Share ${anoCorrente} parcial`,'Share medio historico','Share simulado','Projecao'];
    const rows=linhas.map(c=>{
      const pUltimo=Number(c.vendas_ano?.[anoUltimo]??0);
      const pAtual=Number(c.vendas_ano?.[anoCorrente]??0);
      const share=(p:number)=>c.potencial_pares>0?p/c.potencial_pares*100:'';
      return [c.uf,c.cidade,c.codigo_ibge,c.gerente,c.supervisor,c.representante_codigo,c.representante,contagens[String(c.codigo_ibge)]??0,c.populacao,c.percentual_infantil*100,c.potencial_pares,c.meta_pares_5pct,pUltimo,share(pUltimo),pAtual,share(pAtual),c.share_medio_historico??'',simulado,c.potencial_pares*simulado/100];
    });
    const csv=[header,...rows].map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='share-kidy-cidades.csv';a.click();URL.revokeObjectURL(url);
  }
  const inputStyle={padding:'9px 12px',border:'1px solid #cbd5e1',borderRadius:8,width:'100%',background:'#fff',color:'#111827'} as const;
  const cardStyle={padding:18,border:'1px solid #e2e8f0',borderRadius:12,background:'#fff'} as const;
  return <main style={{padding:24,maxWidth:1600,margin:'0 auto',fontFamily:'Arial,sans-serif',color:'#0f172a'}}>
    <h1 style={{fontSize:28,fontWeight:700}}>Share | Inteligência de Mercado</h1>
    <p style={{color:'#64748b'}}>Mercado infantil 0–14 anos • Consumo estimado: 2 pares/ano • Meta Kidy: 5%</p>
    {erro&&<p role="alert" style={{color:'#b91c1c'}}>Erro ao carregar: {erro}</p>}
    {!dados&& !erro&&<p>Carregando municípios…</p>}
    {dados&&<>
      {erroClientes&&<p role="status" style={{color:'#b45309',fontSize:12}}>{erroClientes}</p>}
      {!dados.vendasDisponiveis&&<p role="status" style={{padding:12,background:'#fff7ed',borderRadius:8}}>Vendas dos Parquets ainda não integradas. Shares reais ficam indisponíveis até carregar <code>data/share-vendas-anuais.json</code>.</p>}
      <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12,margin:'18px 0'}}>
         <label>Gerente<select style={inputStyle} value={gerente} onChange={e=>{setGerente(e.target.value);setSupervisor('');setRep('');setUf('');setCidade('')}}><option value="">Todos</option>{unique(base.map(c=>c.gerente)).map(v=><option key={v} value={v}>{v}</option>)}</select></label>
         <label>Supervisor<select style={inputStyle} value={supervisor} onChange={e=>{setSupervisor(e.target.value);setRep('');setUf('');setCidade('')}}><option value="">Todos</option>{supervisores.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
         <label>Representante<select style={inputStyle} value={rep} onChange={e=>{setRep(e.target.value);setUf('');setCidade('')}}><option value="">Todos</option>{representantes.map(([codigo,nome])=><option key={codigo} value={codigo}>{codigo}{nome?` - ${nome}`:''}</option>)}</select></label>
         <label>UF<select style={inputStyle} value={uf} onChange={e=>{setUf(e.target.value);setCidade('')}}><option value="">Todas</option>{ufs.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
         <label>Cidade<select style={inputStyle} value={cidade} onChange={e=>setCidade(e.target.value)}><option value="">Todas</option>{cidades.map(v=><option key={v} value={v}>{v}</option>)}</select></label>
       </section>
      <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(185px,1fr))',gap:12,marginBottom:18}}>
        {[['Cidades filtradas',fmt(filtro.length)],['Mercado potencial',fmt(total.potencial)+' pares'],['Meta Kidy 5%',fmt(total.meta)+' pares'],['Share médio histórico',pct(total.media)],['Share '+dados.ultimoAnoCompleto,pct(total.shareUltimo)],['Share '+anoAtual+' (parcial)',pct(total.shareAtual)]].map(([titulo,valor])=><div key={titulo} style={cardStyle}><small style={{color:'#64748b'}}>{titulo}</small><div style={{fontSize:24,fontWeight:700,marginTop:8}}>{valor}</div></div>)}
      </section>
      <section style={cardStyle}><h2 style={{fontSize:20,fontWeight:700,marginTop:0}}>Simulador de Share</h2>
        <div style={{display:'flex',gap:20,alignItems:'center',flexWrap:'wrap'}}><label>Participação desejada (%) <input style={{...inputStyle,width:110,marginLeft:10}} type="number" step="0.1" min="0" max="100" value={simulado} onChange={e=>setSimulado(Math.min(100,Math.max(0,Number(e.target.value)||0)))}/></label>
        <input aria-label="Ajustar share" style={{flex:1,minWidth:180}} type="range" min="0" max="20" step="0.1" value={Math.min(simulado,20)} onChange={e=>setSimulado(Number(e.target.value))}/>
        <b>Previsão: {fmt(total.projecao)} pares</b><span>Diferença vs. meta 5%: {fmt(total.projecao-total.meta)} pares</span></div>
      </section>
      <PlanejadorShare cidades={filtro} simulado={simulado}/>
      <section style={{...cardStyle,marginTop:16}}><h2 style={{fontSize:20,fontWeight:700}}>Evolução do Share por ano</h2>
        {!total.evolucao.length?<p>Histórico indisponível até a integração dos Parquets.</p>:<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}><thead><tr><th>Ano</th><th>Pares vendidos</th><th>Share realizado</th><th>Meta</th></tr></thead><tbody>{total.evolucao.map(r=><tr key={r.ano}><td>{r.ano}{Number(r.ano)===anoAtual?' (parcial)':r.ano==='2022'?' (incompleto)':''}</td><td>{fmt(r.pares)}</td><td>{pct(r.share)}</td><td>5,00%</td></tr>)}</tbody></table></div>}
      </section>
      <section style={{...cardStyle,marginTop:16}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap'}}><h2 style={{fontSize:20,fontWeight:700}}>Detalhamento por cidade ({fmt(linhas.length)})</h2><div><select aria-label="Ordenar cidades" style={{...inputStyle,width:200,marginRight:8}} value={ordenar} onChange={e=>setOrdenar(e.target.value as typeof ordenar)}><option value="potencial_pares">Maior potencial</option><option value="meta_pares_5pct">Maior meta</option><option value="cidade">Cidade A–Z</option></select><button onClick={baixarCSV} style={{padding:'10px 16px',borderRadius:8,background:'#1d4ed8',color:'#fff',border:0,cursor:'pointer'}}>Exportar CSV</button></div></div>
        <div style={{maxHeight:550,overflow:'auto'}}><table style={{borderCollapse:'collapse',minWidth:1860,width:'100%',fontSize:13,textAlign:'left'}}><thead style={{position:'sticky',top:0,background:'#e2e8f0'}}><tr>{['UF','Cidade','Clientes','Gerente','Supervisor','Rep','População','% 0–14','Potencial','Meta 5%','Vendas '+anoAtual,'Share '+anoAtual+' parcial','Vendas '+dados.ultimoAnoCompleto,'Share '+dados.ultimoAnoCompleto,'Share médio','Projeção'].map(h=><th key={h} style={{padding:10,whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead><tbody>{linhas.map(c=>{
          const valores=[c.uf,fmt(contagens[String(c.codigo_ibge)]??0),c.gerente,c.supervisor,c.representante_codigo,fmt(c.populacao),pct(c.percentual_infantil*100),fmt(c.potencial_pares),fmt(c.meta_pares_5pct),fmt(Number(c.vendas_ano?.[String(anoAtual)]??0)),pct(c.potencial_pares>0?Number(c.vendas_ano?.[String(anoAtual)]??0)/c.potencial_pares*100:null),c.vendas_ano&&Object.hasOwn(c.vendas_ano,String(dados.ultimoAnoCompleto))?fmt(c.vendas_ano[String(dados.ultimoAnoCompleto)]):'—',pct(c.share_ultimo_ano),pct(c.share_medio_historico),fmt(c.potencial_pares*simulado/100)];
          return <tr key={c.codigo_ibge} style={{borderBottom:'1px solid #e2e8f0'}}><td style={{padding:'8px 10px'}}>{valores[0]}</td><td style={{padding:'8px 10px',whiteSpace:'nowrap'}}><button type="button" title={`Ver clientes cadastrados em ${c.cidade} (${c.uf})`} onClick={()=>void abrirCidade(c)} style={{border:0,background:'transparent',padding:0,color:'#1d4ed8',cursor:'pointer',textDecoration:'underline',fontWeight:600}}>{c.cidade}</button></td>{valores.slice(1).map((v,i)=><td key={i} style={{padding:'8px 10px',whiteSpace:'nowrap'}}>{v}</td>)}</tr>;
        })}</tbody></table></div>

      </section>
      {cidadeAberta&&<div role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setCidadeAberta(null)}} style={{position:'fixed',inset:0,background:'rgba(15,23,42,.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:18}}>
        <section role="dialog" aria-modal="true" aria-label={`Clientes de ${cidadeAberta.cidade}`} style={{background:'#fff',width:'min(950px,100%)',maxHeight:'88vh',borderRadius:14,display:'flex',flexDirection:'column',boxShadow:'0 16px 50px #0003'}}>
          <header style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:18,borderBottom:'1px solid #e2e8f0',gap:12}}><div><h2 style={{margin:0,fontSize:21}}>Clientes — {cidadeAberta.cidade}/{cidadeAberta.uf}</h2><small style={{color:'#64748b'}}>{carregandoCidade?'Carregando…':clientesCidade?.total===-1?'Erro ao consultar':`${fmt(clientesCidade?.total??0)} clientes distintos cadastrados`}</small></div><button type="button" onClick={()=>setCidadeAberta(null)} style={{border:'1px solid #cbd5e1',borderRadius:8,background:'white',padding:'9px 14px',cursor:'pointer'}}>Fechar ×</button></header>
          <div style={{padding:'14px 18px'}}><input aria-label="Buscar cliente" placeholder="Buscar por código, razão social ou grupo" style={inputStyle} value={buscaCliente} onChange={e=>setBuscaCliente(e.target.value)}/></div>
          <div style={{overflow:'auto',padding:'0 18px 18px'}}>{!carregandoCidade&&clientesCidade?.total===0?<p>Nenhum cliente cadastrado nesta cidade.</p>:null}
            {clientesFiltrados.length>0&&<table style={{width:'100%',borderCollapse:'collapse',fontSize:13,textAlign:'left'}}><thead><tr style={{background:'#f1f5f9'}}>{['Código','Razão social','Grupo','Representante','Visão 360'].map(v=><th key={v} style={{padding:10}}>{v}</th>)}</tr></thead><tbody>{clientesFiltrados.map(c=><tr key={c.codigo} style={{borderBottom:'1px solid #e2e8f0'}}><td style={{padding:10}}>{c.codigo}</td><td style={{padding:10}}>{c.razao_social}</td><td style={{padding:10}}>{c.grupo_cliente||'—'}</td><td style={{padding:10}}>{c.representante||c.codigo_representante||'—'}</td><td style={{padding:10}}>{clientesCidade?.visao360Template?<a href={url360(c.codigo,clientesCidade.visao360Template)} style={{color:'#1d4ed8',fontWeight:600}}>Abrir 360</a>:<span title="Rota de Visão 360 indisponível" style={{color:'#94a3b8'}}>Rota a configurar</span>}</td></tr>)}</tbody></table>}
          </div>
        </section>
      </div>}
      <p style={{color:'#64748b',fontSize:12}}>Fonte da distribuição etária: Censo IBGE 2022. População municipal: planilha comercial fornecida. Pares por Data Entrega dos Parquets (não necessariamente faturamento fiscal). 2026 é parcial até o corte da importação; 2022 está incompleto e não entra na média histórica. Comparações usam o potencial municipal atual como denominador fixo, não a população histórica.</p>
    </>}
  </main>;
}
