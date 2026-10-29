'use client';
import { useEffect, useMemo, useState } from 'react';
import type { CidadeShare } from '../../lib/share';

type Resumo = { ano_base:number; cidades:Record<string,[number,number][]> };
type Cliente = {codigo:string;razao_social:string;grupo_cliente:string;representante:string;vendas2025:number;pico:number;ano_pico:number|null};
type PlanCidade = {cidade:CidadeShare;clientes:number;ativos:number;atual:number;gap5:number;gapSim:number;capacidade:number;atuais5:number;novos5:number;atuaisSim:number;novosSim:number;inconsistencia:number};
type Alocacao = Cliente & {potencial:number;acrescimo:number;meta:number};
const fmt=(v:number)=>Math.round(v).toLocaleString('pt-BR');
const pct=(v:number)=>v.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
const calculaCapacidade=(base:number,pico:number,crescimento:number)=>Math.max(0,Math.max(pico,base*(1+crescimento/100))-base);
const css={border:'1px solid #cbd5e1',borderRadius:8,padding:'8px 10px',background:'white',color:'#0f172a'} as const;
export default function PlanejadorShare({cidades,simulado}:{cidades:CidadeShare[];simulado:number}){
  const [resumo,setResumo]=useState<Resumo|null>(null);
  const [erro,setErro]=useState('');
  const [crescimento,setCrescimento]=useState(30);
  const [paresNovo,setParesNovo]=useState(600);
  const [selecionada,setSelecionada]=useState<PlanCidade|null>(null);
  const [clientes,setClientes]=useState<Cliente[]|null>(null);
  const [carregando,setCarregando]=useState(false);
  const [busca,setBusca]=useState('');
  useEffect(()=>{let cancelado=false;fetch('/api/share/planejamento').then(async r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}).then((r:Resumo)=>{if(!cancelado)setResumo(r)}).catch(e=>{if(!cancelado)setErro(String(e))});return()=>{cancelado=true}},[]);
  const planos=useMemo(()=>{
    if(!resumo)return [] as PlanCidade[];
    return cidades.map(c=>{
      const registros=resumo.cidades[String(c.codigo_ibge)]??[];
      const atual=Number(c.vendas_ano?.['2025']??0);
      const vendasClientes=registros.reduce((s,[v])=>s+v,0);
      const capacidade=registros.reduce((s,[v,pico])=>s+calculaCapacidade(v,pico,crescimento),0);
      const gap5=Math.max(0,c.potencial_pares*.05-atual);
      const gapSim=Math.max(0,c.potencial_pares*simulado/100-atual);
      const atuais5=Math.min(gap5,capacidade);
      const atuaisSim=Math.min(gapSim,capacidade);
      const novos5=Math.ceil(Math.max(0,gap5-atuais5)/paresNovo);
      const novosSim=Math.ceil(Math.max(0,gapSim-atuaisSim)/paresNovo);
      return {cidade:c,clientes:registros.length,ativos:registros.filter(([v])=>v>0).length,atual,gap5,gapSim,capacidade,atuais5,novos5,atuaisSim,novosSim,inconsistencia:atual-vendasClientes};
    });
  },[resumo,cidades,crescimento,paresNovo,simulado]);
  const total=useMemo(()=>planos.reduce((a,p)=>({
    clientes:a.clientes+p.clientes,ativos:a.ativos+p.ativos,gap5:a.gap5+p.gap5,gapSim:a.gapSim+p.gapSim,
    atuais5:a.atuais5+p.atuais5,novos5:a.novos5+p.novos5,atuaisSim:a.atuaisSim+p.atuaisSim,novosSim:a.novosSim+p.novosSim,
    conciliacao:a.conciliacao+Math.abs(p.inconsistencia)
  }),{clientes:0,ativos:0,gap5:0,gapSim:0,atuais5:0,novos5:0,atuaisSim:0,novosSim:0,conciliacao:0}),[planos]);
  async function abrir(p:PlanCidade){
    setSelecionada(p);setClientes(null);setBusca('');setCarregando(true);
    try{const r=await fetch('/api/share/planejamento?ibge='+encodeURIComponent(String(p.cidade.codigo_ibge)));if(!r.ok)throw new Error(`HTTP ${r.status}`);const dados=await r.json() as {clientes:Cliente[]};setClientes(dados.clientes)}catch(e){setErro(String(e));setClientes([])}finally{setCarregando(false)}
  }
  const alocacoes=useMemo(()=>{
    if(!selecionada||!clientes)return [] as Alocacao[];
    const gap=selecionada.gapSim;
    const pesos=clientes.map(c=>calculaCapacidade(c.vendas2025,c.pico,crescimento));
    const soma=pesos.reduce((a,b)=>a+b,0);
    const fator=soma>0?Math.min(1,gap/soma):0;
    return clientes.map((c,i)=>{
      const potencial=pesos[i];const acrescimo=potencial*fator;
      return {...c,potencial,acrescimo,meta:c.vendas2025+acrescimo};
    }).sort((a,b)=>b.acrescimo-a.acrescimo);
  },[clientes,selecionada,crescimento]);
  const linhas=alocacoes.filter(c=>`${c.codigo} ${c.razao_social}`.toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR')));
  const tabela={width:'100%',borderCollapse:'collapse',fontSize:12,textAlign:'left'} as const;
  const th={padding:9,borderBottom:'1px solid #cbd5e1',whiteSpace:'nowrap',background:'#f1f5f9'} as const;
  const td={padding:9,borderBottom:'1px solid #e2e8f0',whiteSpace:'nowrap'} as const;
  return <section style={{marginTop:18,padding:18,border:'1px solid #e2e8f0',borderRadius:12,background:'white'}}>
    <h2 style={{marginTop:0,fontSize:20}}>Plano de crescimento e prospecção para atingir o Share</h2>
    <p style={{color:'#64748b',fontSize:13}}>Referência: vendas por Data Entrega em 2025 (ano completo). Potencial estimado pelo melhor ano observado de cada cliente ou pela margem de crescimento configurada. Simulação comercial, não previsão estatística validada.</p>
    <div style={{display:'flex',gap:16,flexWrap:'wrap',marginBottom:16}}>
      <label style={{fontSize:13}}>Crescimento adicional permitido para clientes existentes (%)<br/><input type="number" min="0" max="500" step="5" value={crescimento} style={{...css,width:130,marginTop:5}} onChange={e=>setCrescimento(Math.max(0,Math.min(500,Number(e.target.value)||0)))}/></label>
      <label style={{fontSize:13}}>Pares anuais esperados por novo cliente<br/><input type="number" min="1" max="100000" step="50" value={paresNovo} style={{...css,width:130,marginTop:5}} onChange={e=>setParesNovo(Math.max(1,Math.min(100000,Number(e.target.value)||1)))}/></label>
    </div>
    {erro&&<p style={{color:'#b91c1c'}} role="alert">Falha ao carregar planejamento: {erro}</p>}
    {!resumo&&!erro&&<p>Calculando potencial individual de clientes…</p>}
    {resumo&&<>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(165px,1fr))',gap:10}}>
        {[
          ['Clientes cadastrados',fmt(total.clientes)],['Compradores em 2025',fmt(total.ativos)],
          ['Pares adicionais para 5%',fmt(total.gap5)],['Crescimento com atuais (5%)',fmt(total.atuais5)],
          ['Novos clientes para 5%',fmt(total.novos5)],
          [`Pares adicionais para ${pct(simulado)}`,fmt(total.gapSim)],
          [`Crescimento com atuais (${pct(simulado)})`,fmt(total.atuaisSim)],
          [`Novos clientes (${pct(simulado)})`,fmt(total.novosSim)]
        ].map(([titulo,valor])=><div key={titulo} style={{padding:12,borderRadius:9,border:'1px solid #e2e8f0'}}><div style={{fontSize:11,color:'#64748b'}}>{titulo}</div><b style={{fontSize:20}}>{valor}</b></div>)}
      </div>
      <p style={{fontSize:12,color:'#64748b',marginTop:10}}>As metas são calculadas cidade a cidade. Novos clientes = teto de pares não atendidos pela expansão dos atuais ÷ produtividade anual informada, arredondado para cima em cada cidade. A conta usa todos os clientes cadastrados, inclusive os sem compras em 2025, que podem ser reativados. Diferença absoluta entre vendas municipais e soma individual de 2025: {fmt(total.conciliacao)} pares (conciliação a verificar).</p>
      <h3 style={{fontSize:16}}>Plano por município — clique para ver a meta de cada cliente</h3>
      <div style={{overflow:'auto',maxHeight:360}}><table style={tabela}><thead><tr>{['Cidade','Clientes','2025 compradores','Adicional 5%','Novos 5%',`Adicional ${pct(simulado)}`,`Novos ${pct(simulado)}`].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>{[...planos].sort((a,b)=>b.gapSim-a.gapSim).slice(0,1000).map(p=><tr key={p.cidade.codigo_ibge}><td style={td}><button type="button" style={{border:0,background:'transparent',color:'#1d4ed8',textDecoration:'underline',cursor:'pointer',padding:0}} onClick={()=>void abrir(p)}>{p.cidade.cidade}/{p.cidade.uf}</button></td>{[fmt(p.clientes),fmt(p.ativos),fmt(p.gap5),fmt(p.novos5),fmt(p.gapSim),fmt(p.novosSim)].map((x,i)=><td key={i} style={td}>{x}</td>)}</tr>)}</tbody></table></div>
    </>}
    {selecionada&&<div role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setSelecionada(null)}} style={{position:'fixed',inset:0,zIndex:1200,background:'#0f172a99',display:'flex',alignItems:'center',justifyContent:'center',padding:15}}><div role="dialog" aria-modal="true" aria-label="Metas de clientes" style={{background:'white',borderRadius:12,width:'min(1150px,100%)',maxHeight:'90vh',display:'flex',flexDirection:'column',padding:18}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'start',gap:10}}><div><h2 style={{margin:0,fontSize:20}}>Plano de clientes — {selecionada.cidade.cidade}/{selecionada.cidade.uf}</h2><p style={{fontSize:13,color:'#64748b'}}>Aumentar {fmt(selecionada.gapSim)} pares para atingir {pct(simulado)}; expansão planejada com clientes atuais: {fmt(selecionada.atuaisSim)} pares; novos clientes necessários: {fmt(selecionada.novosSim)}.</p></div><button style={css} onClick={()=>setSelecionada(null)}>Fechar ×</button></div>
      <input placeholder="Buscar código ou razão social" aria-label="Buscar cliente" style={{...css,marginBottom:10}} value={busca} onChange={e=>setBusca(e.target.value)}/>
      <div style={{overflow:'auto'}}>{carregando?<p>Carregando clientes…</p>:<table style={tabela}><thead><tr>{['Código','Cliente','Pares 2025','Maior ano observado','Potencial adicional','Crescimento proposto','Meta anual','Visão 360'].map(x=><th key={x} style={th}>{x}</th>)}</tr></thead><tbody>{linhas.map(c=><tr key={c.codigo}><td style={td}>{c.codigo}</td><td style={td}>{c.razao_social}</td><td style={td}>{fmt(c.vendas2025)}</td><td style={td}>{fmt(c.pico)}{c.ano_pico?` (${c.ano_pico})`:''}</td><td style={td}>{fmt(c.potencial)}</td><td style={td}>{fmt(c.acrescimo)}</td><td style={td}>{fmt(c.meta)}</td><td style={td}><a href={`/cliente/${encodeURIComponent(c.codigo)}`} style={{color:'#1d4ed8'}}>Abrir 360º</a></td></tr>)}</tbody></table>}</div>
    </div></div>}
  </section>;
}
