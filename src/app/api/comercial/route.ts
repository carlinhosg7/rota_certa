import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validarToken } from "@/lib/auth";
import { getData, MAPA_SUPERVISORES, resumirClientes } from "@/lib/comercial-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req:NextRequest){
  try{
    const token=(await cookies()).get("kidy_session")?.value; if(!token) return NextResponse.json({erro:"Não autenticado"},{status:401});
    const u:any=await validarToken(token); if(!u) return NextResponse.json({erro:"Sessão inválida"},{status:401});
    const {carteira,vendas}=await getData(); const perfil=String(u.perfil||"").toUpperCase(); const repLogin=String(u.codigo_representante||u.usuario||"").replace(/\.0+$/,'');
    let c=carteira, v=vendas;
    if(perfil==="REPRESENTANTE"){ c=c.filter(x=>x.rep===repLogin); v=v.filter(x=>x.rep===repLogin); }
    const sup=req.nextUrl.searchParams.get("supervisor")||""; const rep=req.nextUrl.searchParams.get("representante")||""; const cidade=req.nextUrl.searchParams.get("cidade")||"";
    const supervisors=[...new Set(c.map(x=>x.sup).filter(Boolean))].filter(x=>!["9905","ADRIANO PIRES","NN","SP","TOTAL GERAL"].includes(String(x))).sort().map(codigo=>({codigo,nome:MAPA_SUPERVISORES[codigo]||codigo,label:MAPA_SUPERVISORES[codigo]?`${codigo} - ${MAPA_SUPERVISORES[codigo]}`:codigo}));
    const cSup=sup?c.filter(x=>x.sup===sup):[]; const reps=[...new Set(cSup.map(x=>x.rep))].sort((a,b)=>a.localeCompare(b,"pt-BR",{numeric:true}));
    const cRep=rep?cSup.filter(x=>x.rep===rep):[]; const vRep=rep?v.filter(x=>x.rep===rep):[]; const resumo=rep?resumirClientes(cRep,vRep):[];
    const cidades=[...new Set(resumo.map(x=>x.cityKey))].sort();
    const selecionados=cidade?resumo.filter(x=>x.cityKey===cidade):resumo;
    const kpis={clientes:selecionados.length,vermelhos:selecionados.filter(x=>x.status.startsWith("🔴")).length,amarelos:selecionados.filter(x=>x.status.startsWith("🟡")).length,verdes:selecionados.filter(x=>x.status.startsWith("🟢")).length};
    const clientes=selecionados.sort((a,b)=>b.prioridade-a.prioridade||b.diasSemCompra-a.diasSemCompra).slice(0,1000).map(x=>({codigo:x.codigo,razao:x.razao,cidade:x.cidade,uf:x.uf,status:x.status,diasSemCompra:x.diasSemCompra,ultimaCompra:x.ultimaCompra?.toISOString().slice(0,10),limite:x.limite,bloqueio:x.bloqueio}));
    return NextResponse.json({supervisores:supervisors,representantes:reps,cidades,kpis,clientes,perfil});
  }catch(e:any){ console.error(e); return NextResponse.json({erro:e?.message||"Erro ao carregar base comercial"},{status:500}); }
}
