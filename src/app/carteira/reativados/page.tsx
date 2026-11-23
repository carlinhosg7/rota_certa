import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import { validarToken } from "@/lib/auth";
import { representantesPermitidos, regionaisPermitidas } from "@/lib/escopo-acesso";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Historico = {
  codigo_cliente: string;
  ultima_compra_origem: string | null;
  ultima_compra_anterior: string | null;
  data_cadastro_original: string | null;
  data_reativacao: string | null;
  codigo_representante_responsavel: string | null;
  representantes: unknown;
  supervisores: unknown;
};
const codigo = (x:unknown)=>String(x??"").trim().replace(/\.0+$/, "");
const vinculos = (v:unknown):string[] => Array.isArray(v) ? v.map(x=>codigo((x as {codigo?:unknown})?.codigo)).filter(Boolean) : [];
function converterData(v:string|null):Date|null {
  if(!v) return null;
  const s=v.trim();
  const br=s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  const iso=br?`${br[3]}-${br[2]}-${br[1]}`:s.slice(0,10).replace(/\//g,"-");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return null;
  const d=new Date(iso+"T12:00:00Z");
  return !isNaN(d.getTime())&&d.toISOString().slice(0,10)===iso?d:null;
}
function exibirData(v:string|null):string {
  const d=converterData(v);
  return d?new Intl.DateTimeFormat("pt-BR",{timeZone:"UTC"}).format(d):"Não disponível";
}
function diasSemComprar(ultima:string|null,reativacao:string|null):string {
  const a=converterData(ultima),b=converterData(reativacao);
  if(!a||!b||b.getTime()<a.getTime())return "Não disponível";
  return Math.floor((b.getTime()-a.getTime())/86400000).toLocaleString("pt-BR");
}
export default async function Reativados({searchParams}:{searchParams:Promise<{supervisor?:string;representante?:string;supervisoresGrupo?:string}>}) {
  const token=(await cookies()).get("kidy_session")?.value;
  if(!token)redirect("/");
  const usuario=await validarToken(token);
  if(!usuario)redirect("/");
  const permitidos=await representantesPermitidos(usuario);
  const regionais=await regionaisPermitidas(usuario);
  const filtros=await searchParams;
  const rep=codigo(filtros.representante),sup=codigo(filtros.supervisor);
  const grupo=(filtros.supervisoresGrupo??"").split(",").map(codigo).filter(Boolean);
  if((rep&&permitidos!==null&&!permitidos.includes(rep)) ||
     (sup&&regionais!==null&&!regionais.has(sup)) ||
     (grupo.length&&regionais!==null&&grupo.some(x=>!regionais.has(x)))) redirect("/carteira");
  const registros:Historico[]=[];
  for(let inicio=0;inicio<20000;inicio+=1000){
    const {data,error}=await supabase.from("kidy_reativacao_clientes")
      .select("codigo_cliente,ultima_compra_origem,ultima_compra_anterior,data_cadastro_original,data_reativacao,codigo_representante_responsavel,representantes,supervisores")
      .eq("competencia","2026-10-01").eq("reativado",true)
      .order("codigo_cliente",{ascending:true}).range(inicio,inicio+999);
    if(error)throw Error("Falha ao consultar histórico de reativação");
    registros.push(...((data??[]) as Historico[]));
    if((data??[]).length<1000)break;
  }
  const listagem=registros.filter(x=>{
    const r=vinculos(x.representantes),s=vinculos(x.supervisores);
    return (permitidos===null||r.some(z=>permitidos.includes(z)))&&
      (regionais===null||s.some(z=>regionais.has(z)))&&
      (!rep||r.includes(rep))&&(!sup||s.includes(sup))&&(!grupo.length||s.some(z=>grupo.includes(z)));
  });

  // Compras detectadas na campanha de novembro/2026.
  type EventoDetectado = {
    codigo_cliente: string;
    codigo_representante: string;
    codigo_supervisor: string;
    data_compra: string;
    numero_pedido: string;
    confirmado: boolean;
  };

  const eventosDetectados: EventoDetectado[] = [];

  for (let offset = 0; offset < 20000; offset += 1000) {
    const {data, error} = await supabase
      .from("kidy_reativacao_eventos")
      .select("codigo_cliente,codigo_representante,codigo_supervisor,data_compra,numero_pedido,confirmado")
      .eq("competencia", "2026-11-01")
      .order("codigo_cliente")
      .order("codigo_representante")
      .range(offset, offset + 999);

    if (error) throw Error("Falha ao consultar eventos da campanha");

    eventosDetectados.push(...((data ?? []) as EventoDetectado[]));

    if ((data ?? []).length < 1000) break;
    if (offset >= 19000) throw Error("Limite de eventos atingido");
  }

  const detectadosVisiveis = eventosDetectados.filter(e => {
    const r = codigo(e.codigo_representante);
    const s = codigo(e.codigo_supervisor);

    return (permitidos === null || permitidos.includes(r)) &&
      (regionais === null || regionais.has(s)) &&
      (!rep || rep === r) &&
      (!sup || sup === s) &&
      (!grupo.length || grupo.includes(s));
  });

  return <div className="app-shell">
    <Sidebar nome={String(usuario.nome??"")} perfil={String(usuario.perfil??"")} usuario={String(usuario.usuario??"")} />
    <main className="content">
      <div style={{padding:24}}>
        <Link href="/carteira" style={{color:"#2563eb"}}>← Voltar à Gestão de Carteira</Link>
        <h1 style={{fontSize:24,margin:"16px 0 8px"}}>Clientes reativados</h1>

        <section style={{
          background:"#fff",
          border:"1px solid #e2e8f0",
          borderRadius:12,
          padding:18,
          marginTop:16,
          marginBottom:20
        }}>
          <h2 style={{fontSize:18,marginBottom:8}}>
            Pedidos detectados — Novembro/2026
          </h2>
          <p style={{fontSize:13,color:"#64748b"}}>
            {detectadosVisiveis.length} clientes com pedidos.
            Registros preliminares; não representam homologação.
          </p>
          <div style={{overflowX:"auto"}}>
            <table style={{
              width:"100%",
              borderCollapse:"collapse",
              fontSize:13
            }}>
              <thead>
                <tr>
                  {[
                    "Cliente",
                    "Pedido",
                    "Data da compra",
                    "Representante",
                    "Supervisor",
                    "Situação"
                  ].map(coluna =>
                    <th key={coluna} style={{
                      textAlign:"left",
                      padding:10,
                      borderBottom:"1px solid #e2e8f0"
                    }}>{coluna}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {detectadosVisiveis.map(e =>
                  <tr key={`${e.codigo_cliente}-${e.codigo_representante}`}>
                    <td style={{padding:10}}>{e.codigo_cliente}</td>
                    <td style={{padding:10}}>{e.numero_pedido}</td>
                    <td style={{padding:10}}>{exibirData(e.data_compra)}</td>
                    <td style={{padding:10}}>{e.codigo_representante}</td>
                    <td style={{padding:10}}>{e.codigo_supervisor}</td>
                    <td style={{padding:10}}>
                      {e.confirmado
                        ? "Confirmação registrada; verificar competência"
                        : "Aguardando homologação"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <p style={{color:"#64748b",fontSize:13}}>Base histórica de 27/10/2026 · {listagem.length.toLocaleString("pt-BR")} clientes detectados · dados provisórios</p>
        <div style={{overflowX:"auto",background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,marginTop:16}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:850}}>
            <thead><tr style={{background:"#f8fafc",textAlign:"left"}}>
              {['Código cliente','Cadastro anterior (Parquet)','Novo cadastro / detecção','Última compra conhecida','Dias sem comprar','Representantes'].map(x=><th key={x} style={{padding:12,borderBottom:"1px solid #e2e8f0"}}>{x}</th>)}
            </tr></thead>
            <tbody>{listagem.map(x=><tr key={x.codigo_cliente}>
              <td style={{padding:12,borderBottom:"1px solid #e2e8f0"}}>{x.codigo_cliente}</td>
              <td style={{padding:12,borderBottom:"1px solid #e2e8f0"}}>{exibirData(x.data_cadastro_original)}</td>
              <td style={{padding:12,borderBottom:"1px solid #e2e8f0"}}>{exibirData(x.data_reativacao)}</td>
              <td style={{padding:12,borderBottom:"1px solid #e2e8f0"}}>{exibirData(x.ultima_compra_anterior ?? x.ultima_compra_origem)}</td>
              <td style={{padding:12,borderBottom:"1px solid #e2e8f0"}}>{diasSemComprar(x.ultima_compra_anterior ?? x.ultima_compra_origem,x.data_reativacao)}</td>
              <td style={{padding:12,borderBottom:"1px solid #e2e8f0"}}>{vinculos(x.representantes).join(", ")||"Não identificado"}</td>
            </tr>)}</tbody>
          </table>
          {listagem.length===0&&<p style={{padding:20,color:"#64748b"}}>Nenhum cliente reativado detectado para o filtro atual.</p>}
        </div>
        <p style={{fontSize:12,color:"#80552e",marginTop:12}}>A data da reativação é a primeira detecção na Carteira 01, não necessariamente a data da compra. Dias sem comprar = intervalo entre a última compra conhecida e a detecção. O cadastro original e a ultima compra anterior sao consultados no historico. Datas ausentes permanecem indisponiveis.</p>
      </div>
    </main>
  </div>;
}
