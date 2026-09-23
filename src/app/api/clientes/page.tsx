"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Cliente = {
  codigo: string; razao: string; cidade: string; uf: string; status: string;
  diasSemCompra: number; ultimaCompra: string | null; limite: number;
  bloqueio: string; prioridade?: number;
};

type Dados = {
  cliente: Cliente;
  contexto: { perfil: string; representante: string | null; supervisor: string | null };
  historico: { registrosVendas: number };
};

export default function ClientePage() {
  const params = useParams<{ codigo: string }>();
  const router = useRouter();
  const codigo = decodeURIComponent(String(params?.codigo || ""));
  const [dados, setDados] = useState<Dados | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      try {
        setLoading(true); setErro("");
        const r = await fetch(`/api/cliente/${encodeURIComponent(codigo)}`, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.erro || "Erro ao carregar cliente");
        if (ativo) setDados(j);
      } catch (e: any) {
        if (ativo) setErro(e?.message || "Erro ao carregar cliente");
      } finally {
        if (ativo) setLoading(false);
      }
    }
    if (codigo) carregar();
    return () => { ativo = false; };
  }, [codigo]);

  const c = dados?.cliente;

  return (
    <main style={{minHeight:"100vh",background:"#fff8ef",padding:"28px"}}>
      <div style={{maxWidth:"1280px",margin:"0 auto"}}>
        <button type="button" onClick={() => router.push("/dashboard")}
          style={{border:"1px solid #efc98f",background:"#fff",borderRadius:"999px",padding:"10px 16px",cursor:"pointer",fontWeight:800,color:"#704618",marginBottom:"22px"}}>
          ← Voltar ao dashboard
        </button>

        {loading && <p>Carregando visão do cliente...</p>}
        {erro && <div style={{background:"#fff",border:"1px solid #efc98f",borderRadius:"16px",padding:"20px"}}><strong>Não foi possível carregar o cliente.</strong><p>{erro}</p></div>}

        {c && <>
          <section style={{background:"#fff",border:"1px solid #efc98f",borderRadius:"22px",padding:"26px",marginBottom:"18px"}}>
            <span style={{fontSize:"11px",fontWeight:900,letterSpacing:"2px",color:"#e87900"}}>VISÃO 360º DO CLIENTE</span>
            <h1 style={{margin:"8px 0 4px",fontSize:"30px",color:"#3d2408"}}>{c.razao}</h1>
            <p style={{margin:0,color:"#8b6339"}}>Cliente {c.codigo} • {c.cidade} - {c.uf}</p>
          </section>

          <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:"14px",marginBottom:"18px"}}>
            {[
              ["STATUS", c.status || "—"],
              ["DIAS SEM COMPRA", String(c.diasSemCompra ?? "—")],
              ["ÚLTIMA COMPRA", c.ultimaCompra ? new Date(c.ultimaCompra+"T00:00:00").toLocaleDateString("pt-BR") : "—"],
              ["LIMITE", Number(c.limite || 0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})],
              ["FINANCEIRO", c.bloqueio || "—"],
              ["REGISTROS DE VENDA", String(dados?.historico.registrosVendas ?? 0)],
            ].map(([titulo,valor]) => (
              <article key={titulo} style={{background:"#fff",border:"1px solid #efc98f",borderRadius:"18px",padding:"20px"}}>
                <small style={{fontWeight:900,color:"#a06a2b"}}>{titulo}</small>
                <strong style={{display:"block",fontSize:"20px",marginTop:"8px",color:"#3d2408"}}>{valor}</strong>
              </article>
            ))}
          </section>

          <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:"18px"}}>
            <article style={{background:"#fff",border:"1px solid #efc98f",borderRadius:"22px",padding:"24px"}}>
              <span style={{fontSize:"11px",fontWeight:900,letterSpacing:"1.5px",color:"#e87900"}}>CONTEXTO COMERCIAL</span>
              <h2 style={{color:"#3d2408"}}>Carteira</h2>
              <p><b>Supervisor:</b> {dados?.contexto.supervisor || "—"}</p>
              <p><b>Representante:</b> {dados?.contexto.representante || "—"}</p>
              <p><b>Prioridade:</b> {c.prioridade ?? "—"}</p>
            </article>

            <article style={{background:"#fff",border:"1px solid #efc98f",borderRadius:"22px",padding:"24px"}}>
              <span style={{fontSize:"11px",fontWeight:900,letterSpacing:"1.5px",color:"#e87900"}}>INTELIGÊNCIA COMERCIAL</span>
              <h2 style={{color:"#3d2408"}}>Próxima evolução</h2>
              <p style={{color:"#8b6339",lineHeight:1.6}}>Área preparada para histórico por período, linhas compradas, frequência, recência e recomendações da camada preditiva/ML.</p>
            </article>
          </section>
        </>}
      </div>
    </main>
  );
}
