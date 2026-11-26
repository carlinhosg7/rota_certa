import "server-only";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validarToken } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Parametros = {
  inicio?: string; fim?: string; usuario?: string; tela?: string; evento?: string; pagina?: string;
};
type Log = {
  id: number; data_hora: string; usuario: string | null; nome: string | null;
  perfil: string | null; codigo_representante: string | null;
  evento: string | null; rota: string | null; recurso: string | null;
  dispositivo: string | null; navegador: string | null;
};
type Grupo = { rota?: string; usuario?: string; total: number };
type Resumo = {
  acessos: number; usuarios: number; representantes: number; telas: number;
  por_tela: Grupo[]; por_usuario: Grupo[];
};

const PAGINA = 50;
function dataBR(valor: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium",
  }).format(new Date(valor));
}
function nomeTela(rota: string | null): string {
  if (!rota) return "Evento sem tela";
  if (rota === "/metas") return "Metas";
  if (rota === "/carteira") return "Gestão de Carteira 2027";
  if (rota.startsWith("/carteira/grupos")) return "Grupo Cliente 360º";
  if (rota.startsWith("/carteira/clientes")) return "Clientes da Carteira";
  if (rota.startsWith("/carteira")) return "Carteira 2027";
  if (rota.startsWith("/cliente/")) return "Cliente 360º";
  if (rota.startsWith("/campanhas-clientes")) return "Campanhas de Clientes";
  if (rota.startsWith("/campanhas-representantes")) return "Campanhas Representantes";
  if (rota.startsWith("/campanha")) return "Campanhas / Treinamentos";
  if (rota.startsWith("/venda-mais")) return "Mapa de Oportunidades";
  if (rota.startsWith("/share")) return "Share";
  if (rota.startsWith("/gestao-atendimentos")) return "Gestão de Atendimentos";
  if (rota.startsWith("/dashboard")) return "Dashboard";
  if (rota.startsWith("/admin")) return "Administração";
  return rota;
}
function dataValida(valor: string | undefined, fallback: string) {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) &&
    !Number.isNaN(Date.parse(valor)) ? valor : fallback;
}
function hojeBR() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function parametrosURL(p: Parametros) {
  const q = new URLSearchParams();
  for (const [chave, valor] of Object.entries(p)) if (valor) q.set(chave, String(valor));
  return q.toString();
}
const campo: React.CSSProperties = { padding: "10px", border: "1px solid #edc58e", borderRadius: 8, minWidth: 130 };
const coluna: React.CSSProperties = { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid #f1dcc1", fontSize: 12 };

export default async function AuditoriaPage({ searchParams }: {
  searchParams: Promise<Parametros>;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("kidy_session")?.value;
  if (!token) redirect("/");
  const sessao = await validarToken(token);
  if (!sessao) redirect("/");
  if (!["ADMIN", "ADMINISTRADOR"].includes(String(sessao.perfil || "").toUpperCase())) redirect("/dashboard");

  const p = await searchParams;
  const hoje = hojeBR();
  const inicioPadrao = new Date(Date.now() - 29 * 86400000).toLocaleDateString("en-CA", {timeZone:"America/Sao_Paulo"});
  const inicio = dataValida(p.inicio, inicioPadrao);
  const fim = dataValida(p.fim, hoje);
  const usuario = String(p.usuario || "").trim().slice(0, 100);
  const tela = String(p.tela || "").trim().slice(0, 240);
  const evento = String(p.evento || "ACESSO_TELA").trim().toUpperCase();
  const pagina = Math.max(1, Math.min(1000000, Number(p.pagina) || 1));
  const desde = `${inicio}T00:00:00-03:00`;
  const ateExclusivo = new Date(new Date(`${fim}T00:00:00-03:00`).getTime() + 86400000).toISOString();

  let consulta = supabase.from("log_acesso")
    .select("id,data_hora,usuario,nome,perfil,codigo_representante,evento,rota,recurso,dispositivo,navegador", {count:"exact"})
    .gte("data_hora", desde).lt("data_hora", ateExclusivo);
  if (evento !== "TODOS") consulta = consulta.eq("evento", evento);
  if (usuario) consulta = consulta.eq("usuario", usuario);
  if (tela) consulta = consulta.eq("rota", tela);
  const { data, error, count } = await consulta
    .order("data_hora", { ascending: false })
    .range((pagina - 1) * PAGINA, pagina * PAGINA - 1);

  const { data: resumoData, error: resumoErro } = await supabase.rpc("kidy_auditoria_resumo", {
    p_inicio: desde, p_fim: ateExclusivo,
    p_usuario: usuario || null, p_rota: tela || null,
  });
  const resumo = (resumoData || {}) as Resumo;
  const logs = (data || []) as Log[];
  const total = count || 0;
  const totalPaginas = Math.max(1, Math.ceil(total / PAGINA));
  const filtro = { inicio, fim, usuario, tela, evento };
  const exportar = `/api/admin/auditoria/exportar?${parametrosURL(filtro)}`;

  return (
    <main style={{background:"#fff8ef",minHeight:"100vh",padding:"26px 3%",color:"#502905",fontFamily:"Arial, sans-serif"}}>
      <div style={{maxWidth:1500,margin:"auto"}}>
        <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
          <div><small style={{color:"#bd5b00",fontWeight:800,letterSpacing:2}}>KIDY SALES INTELLIGENCE</small>
            <h1 style={{margin:"6px 0"}}>Auditoria completa de acessos</h1>
            <p>Quem acessou cada tela, quando e qual cliente ou grupo consultou.</p></div>
          <div style={{display:"flex",gap:16}}><Link href="/admin/logs">Logs antigos</Link><Link href="/dashboard">Voltar ao sistema</Link></div>
        </header>
        <form method="GET" style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"end",background:"white",padding:16,border:"1px solid #efc58e",borderRadius:12,margin:"18px 0"}}>
          <label style={{display:"grid",gap:6}}>De <input style={campo} name="inicio" type="date" defaultValue={inicio}/></label>
          <label style={{display:"grid",gap:6}}>Até <input style={campo} name="fim" type="date" defaultValue={fim}/></label>
          <label style={{display:"grid",gap:6}}>Usuário (login) <input style={campo} name="usuario" placeholder="Ex.: demo.rep3" defaultValue={usuario}/></label>
          <label style={{display:"grid",gap:6}}>Tela / rota <select style={campo} name="tela" defaultValue={tela}>
            <option value="">Todas as telas</option>
            {["/dashboard","/metas","/campanha","/campanhas-representantes","/campanhas-clientes","/carteira","/carteira/clientes","/carteira/grupos","/venda-mais","/share","/gestao-atendimentos","/admin/logs"].map(r=><option key={r} value={r}>{nomeTela(r)} — {r}</option>)}
            {tela && !["/dashboard","/metas","/campanha","/campanhas-representantes","/campanhas-clientes","/carteira","/carteira/clientes","/carteira/grupos","/venda-mais","/share","/gestao-atendimentos","/admin/logs"].includes(tela) && <option value={tela}>{tela}</option>}
          </select></label>
          <label style={{display:"grid",gap:6}}>Evento <select style={campo} name="evento" defaultValue={evento}>
            <option value="ACESSO_TELA">Acesso a telas</option><option value="TODOS">Todos os eventos</option>
            <option value="LOGIN">Login</option><option value="LOGOUT">Logout</option>
            <option value="ABRIU_CLIENTE">Abertura de cliente</option>
          </select></label>
          <button style={{...campo,background:"#e87905",color:"white",fontWeight:800,cursor:"pointer"}}>Aplicar filtros</button>
          <a href={exportar} style={{...campo,background:"#fff1da",textDecoration:"none",color:"#8a4300",fontWeight:800}}>Exportar CSV / Excel</a>
        </form>
        {(error || resumoErro) && <p style={{color:"#b91c1c"}}>Erro ao consultar auditoria: {error?.message || resumoErro?.message}. Confirme se o SQL da funÃ§Ã£o kidy_auditoria_resumo foi executado.</p>}
        <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:12,marginBottom:20}}>
          {[ ["Acessos às telas",resumo.acessos ?? "—"], ["Usuários ativos",resumo.usuarios ?? "—"], ["Representantes",resumo.representantes ?? "—"], ["Telas diferentes",resumo.telas ?? "—"] ].map(([nome,valor])=><div key={String(nome)} style={{background:"white",border:"1px solid #f0c88f",borderRadius:12,padding:18}}><small>{nome}</small><div style={{fontSize:28,fontWeight:800,marginTop:8}}>{Number(valor).toLocaleString("pt-BR")}</div></div>)}
        </section>
        <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:12,marginBottom:20}}>
          <div style={{background:"white",border:"1px solid #f0c88f",borderRadius:12,padding:18}}>
            <h3>Mais acessadas</h3>{(resumo.por_tela || []).map((r,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",gap:10,margin:"9px 0"}}><span>{nomeTela(r.rota || "")}</span><strong>{Number(r.total).toLocaleString("pt-BR")}</strong></div>)}
          </div>
          <div style={{background:"white",border:"1px solid #f0c88f",borderRadius:12,padding:18}}>
            <h3>Usuários com mais acessos</h3>{(resumo.por_usuario || []).map((r,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",gap:10,margin:"9px 0"}}><span>{r.usuario || "—"}</span><strong>{Number(r.total).toLocaleString("pt-BR")}</strong></div>)}
          </div>
        </section>
        <section style={{background:"white",border:"1px solid #f0c88f",borderRadius:12,padding:18}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h2>Histórico detalhado</h2><span>{total.toLocaleString("pt-BR")} registro(s)</span></div>
          <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr>
            {["Data / hora","Usuário","Nome","Perfil","Rep.","Tela","Cliente / Grupo","Evento","Dispositivo","Navegador"].map(h=><th key={h} style={coluna}>{h}</th>)}
          </tr></thead><tbody>{logs.map(l=><tr key={l.id}>
            <td style={coluna}>{dataBR(l.data_hora)}</td><td style={coluna}>{l.usuario || "—"}</td><td style={coluna}>{l.nome || "—"}</td><td style={coluna}>{l.perfil || "—"}</td><td style={coluna}>{l.codigo_representante || "—"}</td><td style={coluna}><b>{nomeTela(l.rota)}</b><div style={{fontSize:10,color:"#916b42"}}>{l.rota || ""}</div></td><td style={coluna}>{l.recurso || (l.rota?.startsWith("/cliente/") ? l.rota.split("/")[2] : "—")}</td><td style={coluna}>{l.evento || "—"}</td><td style={coluna}>{l.dispositivo || "—"}</td><td style={coluna}>{l.navegador || "—"}</td>
          </tr>)}{logs.length===0 && <tr><td colSpan={10} style={{padding:20,textAlign:"center"}}>Nenhum registro no perÃ­odo selecionado.</td></tr>}</tbody></table></div>
          <footer style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:15}}><span>Página {pagina} de {totalPaginas}</span>
            <div style={{display:"flex",gap:12}}>{pagina>1 && <Link href={`/admin/auditoria?${parametrosURL({...filtro,pagina:String(pagina-1)})}`}>â† Anterior</Link>}{pagina<totalPaginas && <Link href={`/admin/auditoria?${parametrosURL({...filtro,pagina:String(pagina+1)})}`}>PrÃ³xima →</Link>}</div>
          </footer>
        </section>
        <p style={{fontSize:12,color:"#826241"}}>A auditoria registra navegaÃ§Ãµes observadas pelo navegador. Histórico anterior Ã  instalaÃ§Ã£o pode nÃ£o conter a rota ou o recurso consultado.</p>
      </div>
    </main>
  );
}