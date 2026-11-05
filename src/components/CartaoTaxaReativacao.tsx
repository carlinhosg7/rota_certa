"use client";
import { useEffect, useState } from "react";

type Dados = { disponivel:boolean; elegiveis:number|null; reativados:number|null; percentual:number|null; motivo?:string; aviso?:string; referencia?:string };
export default function CartaoTaxaReativacao({supervisor,representante,supervisoresGrupo}:{supervisor:string;representante:string;supervisoresGrupo:string}) {
  const [dados,setDados] = useState<Dados|null>(null);
  useEffect(()=>{
    const ctrl=new AbortController();
    const q = new URLSearchParams({supervisor,representante,supervisoresGrupo});
    fetch(`/api/reativacao/indicador?${q}`,{credentials:"same-origin",cache:"no-store",signal:ctrl.signal})
      .then(r=>{if(!r.ok)throw new Error("Falha ao carregar indicador");return r.json()}).then(d=>{if(!ctrl.signal.aborted)setDados(d as Dados)}).catch(()=>{if(!ctrl.signal.aborted)setDados({disponivel:false,elegiveis:null,reativados:null,percentual:null,motivo:"Indicador indisponível"})});
    return ()=>ctrl.abort();
  },[supervisor,representante,supervisoresGrupo]);
  const n=(v:number)=>v.toLocaleString("pt-BR");
  return <article style={{marginTop:16,background:"#fff",border:"1px solid #e2e8f0",borderRadius:16,padding:20,maxWidth:390}}>
    <div style={{color:"#64748b",fontSize:13,fontWeight:700}}>Taxa de reativação — Gestão da Carteira</div>
    <div style={{fontSize:32,fontWeight:800,color:"#15803d",marginTop:8}}>{dados?.disponivel && dados.percentual !== null ? `${dados.percentual.toFixed(2).replace(".",",")}%` : "—"}</div>
    <div style={{fontSize:12,color:"#64748b",marginTop:6}}>{dados?.disponivel ? `${n(dados.reativados ?? 0)} reativados de ${n(dados.elegiveis ?? 0)} clientes elegíveis na base de 27/10/2026` : dados?.motivo ?? "Carregando histórico..."}</div>
    <p style={{fontSize:11,color:"#64748b",marginTop:12}}>Acompanhamento por mudança da Carteira 02 para a Carteira 01; sem pontuação homologada.</p>
  {dados?.aviso && <p style={{fontSize:11,color:"#80552e",marginTop:8}}>{dados.aviso}</p>}
  </article>;
}
