import "server-only";
import type { JWTPayload } from "jose";
import { supabase } from "@/lib/supabase";
import { acessoGlobal, regionaisPermitidas, representantesPermitidos } from "@/lib/escopo-acesso";

const cod = (v: unknown) => String(v ?? "").trim().replace(/\.0+$/, "");
export type RepComercial = { codigo: string; nome: string; supervisor: string; regional: string };
export type SupComercial = { codigo: string; nome: string };

export async function obterHierarquiaComercial(u: JWTPayload) {
  const perfil = String(u.perfil ?? "").toUpperCase();
  const nacional = acessoGlobal(u);
  const [scSup, scRep, {data,error}] = await Promise.all([
    (perfil === "REPRESENTANTE" || perfil === "REP") ? Promise.resolve(null) : regionaisPermitidas(u),
    representantesPermitidos(u),
    supabase.from("representantes_cadastro")
      .select("codigo_rep,nome_rep,regional,codigo_supervisor,ativo")
      .eq("ativo",true).order("codigo_rep")
  ]);
  if(error) throw new Error("Hierarquia comercial: "+error.message);
  const representantes: RepComercial[] = (data??[])
    .filter(r => (nacional || scSup === null || scSup.has(cod(r.codigo_supervisor))) &&
                 (scRep === null || scRep.includes(cod(r.codigo_rep))))
    .map(r => ({codigo:cod(r.codigo_rep),nome:String(r.nome_rep??r.codigo_rep),
                supervisor:cod(r.codigo_supervisor),regional:String(r.regional??"")}));
  const supervisores:SupComercial[] = [...new Map(representantes
    .filter(r=>r.supervisor)
    .map(r=>[r.supervisor,{codigo:r.supervisor,nome:r.regional || r.supervisor}] as const)).values()]
    .sort((a,b)=>a.codigo.localeCompare(b.codigo,"pt-BR",{numeric:true}));
  return { supervisores, representantes };
}
