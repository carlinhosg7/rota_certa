"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Retorno = { disponivel?: boolean; reativados?: number | null; motivo?: string };
export default function CartaoClientesReativados({supervisor,representante,supervisoresGrupo}:{supervisor:string;representante:string;supervisoresGrupo:string}) {
  const [dados,setDados] = useState<Retorno|null>(null);
  useEffect(()=>{
    const ctrl = new AbortController();
    const qs = new URLSearchParams({supervisor,representante,supervisoresGrupo});
    fetch(`/api/reativacao/indicador?${qs}`, {credentials:"same-origin",cache:"no-store",signal:ctrl.signal})
      .then(r=>{if(!r.ok) throw Error("Falha na consulta"); return r.json();})
      .then(d=>{if(!ctrl.signal.aborted)setDados(d as Retorno);})
      .catch(()=>{if(!ctrl.signal.aborted)setDados({disponivel:false,motivo:"Indisponível"});});
    return ()=>ctrl.abort();
  },[supervisor,representante,supervisoresGrupo]);
  const query = new URLSearchParams();
  if(supervisor)query.set("supervisor",supervisor);
  if(representante)query.set("representante",representante);
  if(supervisoresGrupo)query.set("supervisoresGrupo",supervisoresGrupo);
  return <Link href={`/carteira/reativados${query.size?`?${query}`:""}`} style={{display:"block",height:"100%",textDecoration:"none",color:"inherit"}}>
    <article style={{width:"100%",minHeight:180,boxSizing:"border-box",background:"#fff",border:"1px solid #e2e8f0",borderRadius:16,padding:18}}>
      <div style={{fontSize:13,color:"#64748b"}}>Clientes reativados</div>
      <div style={{fontSize:32,color:"#15803d",fontWeight:800,marginTop:8}}>{dados?.disponivel ? (dados.reativados??0).toLocaleString("pt-BR") : "—"}</div>
      <div style={{fontSize:12,color:"#64748b",marginTop:6}}>Desde a base de 27/10/2026 · detecção provisória</div>
      <div style={{fontSize:12,color:"#2563eb",marginTop:12,fontWeight:600}}>Ver clientes reativados →</div>
    </article>
  </Link>;
}
