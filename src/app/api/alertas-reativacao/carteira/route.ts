import { NextRequest, NextResponse } from "next/server";
import { validarToken } from "@/lib/auth";
import { carregarCarteira2027 } from "@/lib/carteira-2027-data";
import { acessoGlobal, representantesPermitidos, regionaisPermitidas } from "@/lib/escopo-acesso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function texto(v: unknown) { return String(v ?? "").trim(); }
function limpaCodigo(v: unknown) { return texto(v).replace(/\.0$/, ""); }
function hojeBrasil() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year:"numeric", month:"2-digit", day:"2-digit"
  }).formatToParts(new Date());
  const campo = (x:string) => partes.find(p=>p.type===x)?.value ?? "";
  return `${campo("year")}-${campo("month")}-${campo("day")}`;
}
function diasSemCompra(data: string | undefined, hoje: string): number | null {
  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;
  const a = Date.parse(`${data}T00:00:00Z`);
  const b = Date.parse(`${hoje}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((b - a) / 86400000));
}
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("kidy_session")?.value;
    const usuario = token ? await validarToken(token) : null;
    if (!usuario) return NextResponse.json({sucesso:false,erro:"Não autenticado."},{status:401});
    const perfil = texto(usuario.perfil).toUpperCase();
    if (!["ADMIN","ADMINISTRADOR","GERENTE","SUPERVISOR","REPRESENTANTE","REP"].includes(perfil)) {
      return NextResponse.json({sucesso:false,erro:"Sem permissão."},{status:403});
    }
    const pagina = Math.max(1, Math.min(100000, Number(req.nextUrl.searchParams.get("pagina")) || 1));
    const busca = texto(req.nextUrl.searchParams.get("busca")).toLocaleLowerCase("pt-BR").slice(0,100);
    const tamanho = 100;
    const [carteira, reps, regionais] = await Promise.all([
      carregarCarteira2027(),
      perfil === "REPRESENTANTE" || perfil === "REP" ? representantesPermitidos(usuario) : Promise.resolve(null),
      perfil === "SUPERVISOR" || perfil === "GERENTE" ? regionaisPermitidas(usuario) : Promise.resolve(null)
    ]);
    const global = acessoGlobal(usuario);
    const hoje = hojeBrasil();
    const elegiveis = carteira.clientes.filter(c => {
      if (c.carteira !== "02_REATIVACAO") return false;
      if (!global) {
        if (perfil === "REPRESENTANTE" || perfil === "REP") {
          if (!c.representanteAtual.some(r => reps?.includes(limpaCodigo(r.codigo)))) return false;
        } else if (perfil === "SUPERVISOR" || perfil === "GERENTE") {
          if (!c.supervisores.some(s => regionais?.has(limpaCodigo(s.codigo)))) return false;
        } else return false;
      }
      return !busca || limpaCodigo(c.codigoCliente).toLowerCase().includes(busca) || c.razaoSocial.toLocaleLowerCase("pt-BR").includes(busca);
    });
    elegiveis.sort((a,b) => {
      const da = diasSemCompra(a.ultimaCompra,hoje) ?? -1;
      const db = diasSemCompra(b.ultimaCompra,hoje) ?? -1;
      return db-da || a.codigoCliente.localeCompare(b.codigoCliente,"pt-BR",{numeric:true});
    });
    const inicio = (pagina-1)*tamanho;
    return NextResponse.json({
      sucesso:true, pagina, total:elegiveis.length,
      clientes:elegiveis.slice(inicio,inicio+tamanho).map(c=>({
        codigoCliente:c.codigoCliente, razaoSocial:c.razaoSocial,
        representante:c.representanteAtual.map(r=>r.codigo).join(", "),
        supervisor:c.supervisores.map(s=>s.codigo).join(", "),
        ultimaCompra:c.ultimaCompra ?? null,
        diasSemCompra:diasSemCompra(c.ultimaCompra,hoje),
        situacao:c.situacao
      }))
    },{headers:{"Cache-Control":"private, no-store"}});
  } catch (e) {
    console.error("[CENTRAL CARTEIRA REATIVACAO]",e);
    return NextResponse.json({sucesso:false,erro:"Falha ao consultar carteira."},{status:500});
  }
}
