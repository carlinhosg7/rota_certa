"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Atendimento = {
  id: number;
  data_atendimento: string;
  codigo_cliente: string;
  nome_cliente: string | null;
  codigo_representante: string;
  resultado: string;
  pedido_realizado: boolean;
  numero_pedido: string | null;
  quantidade_pares: number | null;
  valor_pedido: number | null;
  linhas_apresentadas: string[] | null;
  campanha_utilizada: string | null;
  motivo_nao_compra: string | null;
  proxima_acao: string | null;
  data_proxima_acao: string | null;
  observacoes: string | null;
};
type Resposta = { atendimentos: Atendimento[]; total: number; pagina: number; paginas: number; erro?: string };

const money = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const number = (v: number) => new Intl.NumberFormat("pt-BR").format(v);
const dateBR = (s: string | null) => s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString("pt-BR") : "—";
const dataHoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const dataInicioMes = () => `${dataHoje().slice(0,7)}-01`;
const card: React.CSSProperties = { background: "#fff", border: "1px solid #fed7aa", borderRadius: 14, padding: 18 };
const campo: React.CSSProperties = { border: "1px solid #f4ba7a", background: "#fffaf4", padding: "10px 12px", borderRadius: 9, color: "#4b2c11", minWidth: 0 };

export default function GestaoAtendimentosClient() {
  const [inicio, setInicio] = useState(dataInicioMes);
  const [fim, setFim] = useState(dataHoje);
  const [representante, setRepresentante] = useState("");
  const [cliente, setCliente] = useState("");
  const [resultado, setResultado] = useState("");
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<Resposta>({ atendimentos: [], total: 0, pagina: 1, paginas: 0 });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [detalhe, setDetalhe] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const p = new URLSearchParams({ pagina: String(pagina) });
      if (inicio) p.set("inicio", inicio);
      if (fim) p.set("fim", fim);
      if (representante.trim()) p.set("representante", representante.trim());
      if (cliente.trim()) p.set("cliente", cliente.trim());
      if (resultado) p.set("resultado", resultado);
      const resposta = await fetch(`/api/gestao-atendimentos?${p}`, { cache: "no-store" });
      const json = await resposta.json() as Resposta;
      if (!resposta.ok) throw new Error(json.erro || "Falha na consulta");
      setDados(json);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar atendimentos");
      setDados({ atendimentos: [], total: 0, pagina: 1, paginas: 0 });
    } finally {
      setCarregando(false);
    }
  }, [inicio, fim, representante, cliente, resultado, pagina]);

  useEffect(() => { void carregar(); }, [carregar]);
  const registros = dados.atendimentos;
  const kpi = useMemo(() => {
    const pedidos = registros.filter(x => x.pedido_realizado);
    const comAcao = registros.filter(x => x.data_proxima_acao);
    const hoje = dataHoje();
    return {
      pedidos: pedidos.length,
      taxa: registros.length ? (pedidos.length/registros.length)*100 : 0,
      pares: pedidos.reduce((s,x)=>s+(x.quantidade_pares || 0),0),
      valor: pedidos.reduce((s,x)=>s+(x.valor_pedido || 0),0),
      atrasadas: comAcao.filter(x => x.data_proxima_acao! < hoje).length,
      hoje: comAcao.filter(x => x.data_proxima_acao === hoje).length,
      futuras: comAcao.filter(x => x.data_proxima_acao! > hoje).length,
    };
  }, [registros]);

  const csv = () => {
    const cols: (keyof Atendimento)[] = ["data_atendimento","codigo_representante","codigo_cliente","nome_cliente","resultado","pedido_realizado","numero_pedido","quantidade_pares","valor_pedido","campanha_utilizada","motivo_nao_compra","proxima_acao","data_proxima_acao"];
    const linhas = [cols.join(";"), ...registros.map(r => cols.map(c => `"${String(r[c] ?? "").replace(/"/g,'""')}"`).join(";"))];
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\uFEFF", linhas.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    link.download = `kidy-atendimentos-pagina-${pagina}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return <div style={{ padding: "20px 0 50px", color: "#492509" }}>
    <div style={{ ...card, marginBottom: 16 }}>
      <div style={{ display:"flex", flexWrap:"wrap", gap: 12, alignItems:"end" }}>
        <label style={{display:"grid",gap:5, fontSize:12}}>De<input type="date" value={inicio} onChange={e=>{setInicio(e.target.value);setPagina(1);}} style={campo}/></label>
        <label style={{display:"grid",gap:5, fontSize:12}}>Até<input type="date" value={fim} onChange={e=>{setFim(e.target.value);setPagina(1);}} style={campo}/></label>
        <label style={{display:"grid",gap:5, fontSize:12}}>Representante<input placeholder="Código" value={representante} onChange={e=>{setRepresentante(e.target.value);setPagina(1);}} style={{...campo,width:110}}/></label>
        <label style={{display:"grid",gap:5, fontSize:12}}>Cliente<input placeholder="Código" value={cliente} onChange={e=>{setCliente(e.target.value);setPagina(1);}} style={{...campo,width:125}}/></label>
        <label style={{display:"grid",gap:5,fontSize:12}}>Resultado<select value={resultado} onChange={e=>{setResultado(e.target.value);setPagina(1);}} style={campo}>
          <option value="">Todos</option>{["PEDIDO REALIZADO","NEGOCIAÇÃO EM ANDAMENTO","SEM PEDIDO","CLIENTE NÃO VISITADO","REAGENDAR"].map(x=><option key={x}>{x}</option>)}
        </select></label>
        <button type="button" onClick={()=>void carregar()} style={{...campo, background:"#f97316",color:"#fff",cursor:"pointer"}}>Atualizar</button>
        <button type="button" onClick={csv} disabled={!registros.length} style={{...campo,cursor:"pointer"}}>Exportar página CSV</button>
      </div>
    </div>
    {erro && <div role="alert" style={{...card, color:"#b42318", marginBottom:16}}>{erro}</div>}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12,marginBottom:14}}>
      {[
        ["Atendimentos",number(registros.length)], ["Com pedido",number(kpi.pedidos)], ["Conversão",`${kpi.taxa.toFixed(1)}%`],
        ["Pares",number(kpi.pares)], ["Valor de pedidos",money(kpi.valor)], ["Retornos atrasados",number(kpi.atrasadas)],
        ["Retornos hoje",number(kpi.hoje)], ["Retornos futuros",number(kpi.futuras)]
      ].map(([nome,valor])=><div key={nome} style={card}><div style={{fontSize:12,color:"#975e23"}}>{nome}</div><div style={{fontWeight:900,fontSize:25,marginTop:8}}>{valor}</div></div>)}
    </div>
    <p style={{fontSize:12,color:"#80552e",margin:"8px 0 16px"}}>Indicadores calculados nos {registros.length} registros desta página (até 100). Total de registros no filtro: {number(dados.total)}. Valores informados no atendimento, não faturamento confirmado.</p>
    <div style={{...card,overflowX:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}><strong>Histórico e próximos passos</strong><span>{carregando ? "Carregando..." : `${number(dados.total)} registros • Página ${pagina} de ${Math.max(1,dados.paginas)}`}</span></div>
      <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:850}}>
        <thead><tr>{["Data","Representante","Cliente","Resultado","Pedido","Campanha","Próxima ação","Detalhes"].map(h=><th key={h} style={{textAlign:"left",padding:"12px 8px",borderBottom:"1px solid #fed7aa",color:"#914d10"}}>{h}</th>)}</tr></thead>
        <tbody>{registros.map(r=><tr key={r.id} style={{borderBottom:"1px solid #f5e2d0",verticalAlign:"top"}}>
          <td style={{padding:8}}>{dateBR(r.data_atendimento)}</td><td style={{padding:8}}>{r.codigo_representante}</td>
          <td style={{padding:8}}><Link href={`/cliente/${encodeURIComponent(r.codigo_cliente)}`} style={{color:"#a94e00",fontWeight:700}}>{r.codigo_cliente}</Link><div>{r.nome_cliente}</div></td>
          <td style={{padding:8}}>{r.resultado}</td><td style={{padding:8}}>{r.pedido_realizado ? "Sim" : "Não"}</td>
          <td style={{padding:8}}>{r.campanha_utilizada || "—"}</td>
          <td style={{padding:8}}>{r.proxima_acao || "—"}<div style={{fontWeight:700,color:r.data_proxima_acao && r.data_proxima_acao < dataHoje()?"#b42318":"#9a5700"}}>{dateBR(r.data_proxima_acao)}</div></td>
          <td style={{padding:8}}><button type="button" onClick={()=>setDetalhe(detalhe===r.id?null:r.id)} style={{...campo,padding:"5px 8px",cursor:"pointer"}}>{detalhe===r.id?"Fechar":"Ver"}</button></td>
        </tr>)}
        {!carregando && !registros.length && <tr><td colSpan={8} style={{padding:20,textAlign:"center"}}>Nenhum atendimento encontrado para os filtros.</td></tr>}
        </tbody>
      </table>
      {detalhe !== null && registros.filter(x=>x.id===detalhe).map(r=><div key={`detalhe-${r.id}`} style={{background:"#fff7ed",borderRadius:12,padding:16,marginTop:12,display:"grid",gap:8,fontSize:13}}>
        <strong>Detalhe do atendimento — {r.codigo_cliente}</strong>
        <div>Pedido: {r.numero_pedido || "—"} • {number(r.quantidade_pares||0)} pares • {money(r.valor_pedido||0)}</div>
        <div>Motivo sem pedido: {r.motivo_nao_compra || "—"}</div>
        <div>Linhas apresentadas: {(r.linhas_apresentadas||[]).join(" • ") || "—"}</div>
        <div>Observações: {r.observacoes || "—"}</div>
      </div>)}
      <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",gap:12,marginTop:18}}>
        <button type="button" disabled={pagina<=1 || carregando} onClick={()=>setPagina(p=>Math.max(1,p-1))} style={campo}>Anterior</button>
        <span>{pagina} / {Math.max(1,dados.paginas)}</span>
        <button type="button" disabled={pagina>=dados.paginas || carregando} onClick={()=>setPagina(p=>p+1)} style={campo}>Próxima</button>
      </div>
    </div>
  </div>;
}
