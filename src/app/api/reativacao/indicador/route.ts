import { NextRequest, NextResponse } from "next/server";
import { validarToken } from "@/lib/auth";
import { representantesPermitidos, regionaisPermitidas } from "@/lib/escopo-acesso";
import { supabase } from "@/lib/supabase";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const codigo=(v:unknown)=>String(v??"").trim().replace(/\.0+$/,'');
type Item={codigo_cliente:string;representantes:unknown;supervisores:unknown;reativado:boolean;data_reativacao:string|null};
function codigos(v:unknown):string[]{return Array.isArray(v)?v.map(x=>codigo((x as {codigo?:unknown})?.codigo)).filter(Boolean):[];}
export async function GET(req:NextRequest){
 const token=req.cookies.get("kidy_session")?.value;
 if(!token)return NextResponse.json({erro:"Não autenticado"},{status:401});
 const usuario=await validarToken(token);
 if(!usuario)return NextResponse.json({erro:"Sessão inválida"},{status:401});
 try{
  const permitidos=await representantesPermitidos(usuario);
  const regionais=await regionaisPermitidas(usuario);
  const p=req.nextUrl.searchParams;
  const rep=codigo(p.get("representante")),sup=codigo(p.get("supervisor"));
  const grupo=(p.get("supervisoresGrupo")??"").split(",").map(codigo).filter(Boolean);
  if((rep&&permitidos!==null&&!permitidos.includes(rep))||(sup&&regionais!==null&&!regionais.has(sup))||
     (grupo.length&&regionais!==null&&grupo.some(x=>!regionais.has(x))))
   return NextResponse.json({erro:"Filtro não autorizado"},{status:403});
  // Fotografia de 27/10/2026, não uma competência homologada do mês atual.
  const linhas:Item[]=[];
  for(let inicio=0;inicio<20000;inicio+=1000){
   const {data,error}=await supabase.from("kidy_reativacao_clientes")
     .select("codigo_cliente,representantes,supervisores,reativado,data_reativacao")
     .eq("competencia","2026-10-01").order("codigo_cliente",{ascending:true}).range(inicio,inicio+999);
   if(error)throw error;
   linhas.push(...((data??[]) as Item[]));
   if((data??[]).length<1000)break;
   if(inicio>=19000)throw Error("Limite de histórico atingido");
  }
  const elegiveis=linhas.filter(x=>{
   const r=codigos(x.representantes),s=codigos(x.supervisores);
   return (permitidos===null||r.some(a=>permitidos.includes(a))) &&
     (regionais===null||s.some(a=>regionais.has(a))) &&
     (!rep||r.includes(rep))&&(!sup||s.includes(sup))&&(!grupo.length||s.some(a=>grupo.includes(a)));
  });
  const reativados=elegiveis.filter(x=>x.reativado).length;
  return NextResponse.json({disponivel:true,competencia:"2026-10-01",referencia:"2026-10-27",
   elegiveis:elegiveis.length,reativados,percentual:elegiveis.length?reativados*100/elegiveis.length:null,
   aviso:"Acompanhamento provisório desde 27/10/2026; reativação detectada por mudança de carteira, sem homologação."});
 }catch(e){console.error("[REATIVACAO INDICADOR]",e);return NextResponse.json({erro:"Indicador indisponível"},{status:500});}
}
