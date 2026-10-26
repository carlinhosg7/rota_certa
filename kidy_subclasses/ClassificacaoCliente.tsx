"use client";
import { useState } from "react";
import { OPCOES_CLASSIFICACAO, type CodigoClassificacao } from "@/lib/classificacoes";

type Props = { codigo: string; iniciais: CodigoClassificacao[]; sugeridas: CodigoClassificacao[]; encerrada: boolean };
export default function ClassificacaoCliente({ codigo, iniciais, sugeridas, encerrada }: Props) {
  const [selecionadas, setSelecionadas] = useState<CodigoClassificacao[]>(iniciais);
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  async function salvar() {
    setSalvando(true); setMensagem("");
    try {
      const resposta = await fetch(`/api/clientes/${encodeURIComponent(codigo)}/classificacoes`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classificacoes: selecionadas }),
      });
      const corpo = await resposta.json() as { erro?: string };
      if (!resposta.ok) throw new Error(corpo.erro || `HTTP ${resposta.status}`);
      setMensagem("Classificações salvas com sucesso.");
    } catch (e) { setMensagem(e instanceof Error ? e.message : "Erro ao salvar"); }
    finally { setSalvando(false); }
  }
  return <section style={{background:"#fffdf9",border:"1px solid #f0c88f",borderRadius:18,padding:24,marginBottom:20}}>
    <h2 style={{marginTop:0,fontSize:19}}>Classificação da Carteira</h2>
    {encerrada ? <p style={{padding:12,background:"#ffe5e5",borderRadius:10,fontWeight:800,color:"#9a2222"}}>EMPRESA ENCERRADA — Receita Federal BAIXADA. Fora da fila comercial. Histórico preservado.</p> : <>
      <p style={{fontSize:13}}>Marque quantas opções forem necessárias. A seleção salva permanece até ser alterada.</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12}}>
        {OPCOES_CLASSIFICACAO.map(o => <label key={o.id} style={{display:"flex",alignItems:"center",gap:9,padding:12,border:"1px solid #f3d2a5",borderRadius:10,cursor:"pointer"}}>
          <input type="checkbox" checked={selecionadas.includes(o.id)} onChange={e=>setSelecionadas(s=>e.target.checked?[...s,o.id]:s.filter(x=>x!==o.id))} /> {o.nome}
        </label>)}
      </div>
      <div style={{marginTop:14,fontSize:12,color:"#815326"}}>Sugestões identificadas nos dados: {sugeridas.length ? sugeridas.map(id=>OPCOES_CLASSIFICACAO.find(o=>o.id===id)?.nome).join(" · ") : "Nenhuma sugestão automática validada"}</div>
      <button type="button" disabled={salvando} onClick={salvar} style={{marginTop:16,padding:"12px 22px",border:0,borderRadius:10,background:"#f57c00",color:"white",fontWeight:800,cursor:"pointer"}}>{salvando?"Salvando...":"Salvar classificações"}</button>
      {mensagem && <p role="status" style={{fontSize:13}}>{mensagem}</p>}
    </>}
  </section>;
}
