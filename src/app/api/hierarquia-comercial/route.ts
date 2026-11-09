import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validarToken } from "@/lib/auth";
import { obterHierarquiaComercial } from "@/lib/hierarquia-comercial-filtros";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
  const token=(await cookies()).get("kidy_session")?.value;
  if(!token)return NextResponse.json({erro:"Nao autenticado"},{status:401});
  const usuario=await validarToken(token);
  if(!usuario)return NextResponse.json({erro:"Sessao invalida"},{status:401});
  try {return NextResponse.json(await obterHierarquiaComercial(usuario),{headers:{"Cache-Control":"no-store"}});}
  catch(e){console.error("[HIERARQUIA]",e);return NextResponse.json({erro:"Falha na hierarquia comercial"},{status:500});}
}
