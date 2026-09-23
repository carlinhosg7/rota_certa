"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import s from "./DashboardClient.module.css";

type Sup={codigo:string;nome:string;label:string}; type Cliente={codigo:string;razao:string;cidade:string;uf:string;status:string;diasSemCompra:number;ultimaCompra:string;limite:number;bloqueio:string};
type Data={supervisores:Sup[];representantes:string[];cidades:string[];kpis:{clientes:number;vermelhos:number;amarelos:number;verdes:number};clientes:Cliente[];erro?:string};
export default function DashboardClient(){
 const router=useRouter();
 const [sup,setSup]=useState(""); const [rep,setRep]=useState(""); const [cidade,setCidade]=useState(""); const [data,setData]=useState<Data|null>(null); const [loading,setLoading]=useState(false); const [erro,setErro]=useState("");

 async function registrarEvento(evento:string){
  try{
   const r=await fetch("/api/evento",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({evento})
   });
   if(!r.ok){
    const j=await r.json().catch(()=>({}));
    console.error("Erro ao registrar evento:",j);
   }
  }catch(e){
   console.error("Erro ao registrar evento:",e);
  }
 }
 async function load(ns=sup,nr=rep,nc=cidade){ setLoading(true);setErro(""); try{ const q=new URLSearchParams(); if(ns)q.set("supervisor",ns); if(nr)q.set("representante",nr); if(nc)q.set("cidade",nc); const r=await fetch(`/api/comercial?${q}`,{cache:"no-store"}); const j=await r.json(); if(!r.ok)throw new Error(j.erro||"Erro"); setData(j);}catch(e:any){setErro(e.message||"Erro ao carregar");}finally{setLoading(false);} }
 useEffect(()=>{
  load("","","");
  registrarEvento("ACESSO_DASHBOARD");
 },[]);
 const k=data?.kpis||{clientes:0,vermelhos:0,amarelos:0,verdes:0};
 function onSup(v:string){
  setSup(v);setRep("");setCidade("");load(v,"","");
  if(v) registrarEvento("SELECIONOU_SUPERVISOR");
 }
 function onRep(v:string){
  setRep(v);setCidade("");load(sup,v,"");
  if(v) registrarEvento("SELECIONOU_REPRESENTANTE");
 }
 function onCidade(v:string){
  setCidade(v);load(sup,rep,v);
  if(v) registrarEvento("SELECIONOU_CIDADE");
 }
 async function abrirCliente(codigo:string){
  await registrarEvento("ABRIU_CLIENTE");
  router.push(`/cliente/${encodeURIComponent(codigo)}`);
 }
 return <>
  <section id="planejamento" className="panel"><div className="panel-title"><div><span>01</span><h3>Planejamento comercial</h3></div><small>Bases reais conectadas</small></div>
   <div className="filters">
    <label>Supervisor<select value={sup} onChange={e=>onSup(e.target.value)}><option value="">Selecione a regional</option>{data?.supervisores.map(x=><option key={x.codigo} value={x.codigo}>{x.label}</option>)}</select></label>
    <label>Representante<select value={rep} onChange={e=>onRep(e.target.value)} disabled={!sup}><option value="">{sup?"Selecione o representante":"Selecione o supervisor"}</option>{data?.representantes.map(x=><option key={x}>{x}</option>)}</select></label>
    <label>Cidade base<select value={cidade} onChange={e=>onCidade(e.target.value)} disabled={!rep}><option value="">{rep?"Todas as cidades":"Selecione o representante"}</option>{data?.cidades.map(x=><option key={x}>{x}</option>)}</select></label>
    <label>Raio máximo<input type="text" value="120 km" readOnly /></label>
   </div>
  </section>
  {erro&&<div className={s.error}>{erro}</div>}{loading&&<div className={s.loading}>Carregando bases comerciais...</div>}
  <section className="cards">
   <article><span className="card-icon orange">◎</span><div><small>CLIENTES</small><strong>{rep?k.clientes:"—"}</strong><p>{cidade||"Carteira selecionada"}</p></div></article>
   <article><span className="card-icon red">●</span><div><small>NÃO POSITIVADOS</small><strong>{rep?k.vermelhos:"—"}</strong><p>Sem compra no ano</p></div></article>
   <article><span className="card-icon yellow">●</span><div><small>ATENÇÃO</small><strong>{rep?k.amarelos:"—"}</strong><p>Sem compra desde maio</p></div></article>
   <article><span className="card-icon green">●</span><div><small>ATIVOS</small><strong>{rep?k.verdes:"—"}</strong><p>Ativos desde maio</p></div></article>
  </section>
  <section id="clientes" className="panel"><div className="panel-title"><div><span>02</span><h3>Clientes prioritários</h3></div><small>{rep?<><b className={s.count}>{data?.clientes.length||0}</b> registros exibidos</>:"Selecione um representante"}</small></div>
   {!rep?<div className={s.empty}>Selecione Supervisor → Representante para carregar a carteira real.</div>:<div className={s.tableWrap}><table className={s.table}><thead><tr><th>Cliente</th><th>Razão Social</th><th>Cidade</th><th>Status</th><th>Dias sem compra</th><th>Última compra</th><th>Limite</th><th>Financeiro</th></tr></thead><tbody>{data?.clientes.map(c=><tr key={c.codigo} onClick={()=>abrirCliente(c.codigo)} style={{cursor:"pointer"}} title="Abrir visão 360º do cliente"><td><button type="button" onClick={(e)=>{e.stopPropagation();abrirCliente(c.codigo)}} style={{background:"none",border:0,padding:0,font:"inherit",fontWeight:800,cursor:"pointer",color:"inherit",textDecoration:"underline"}}>{c.codigo}</button></td><td>{c.razao}</td><td>{c.cidade} - {c.uf}</td><td className={s.status}>{c.status}</td><td>{c.diasSemCompra}</td><td>{c.ultimaCompra?new Date(c.ultimaCompra+"T00:00:00").toLocaleDateString("pt-BR"):"—"}</td><td>{c.limite.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td><td>{c.bloqueio||"—"}</td></tr>)}</tbody></table></div>}
  </section>
 </>
}
