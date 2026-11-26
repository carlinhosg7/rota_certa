import { NextRequest, NextResponse } from "next/server";
import { validarToken } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function celula(v: unknown): string {
  let s = String(v ?? "");
  // Evita execuÃ§Ã£o de fÃ³rmulas ao abrir o CSV no Excel.
  if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get("kidy_session")?.value;
  const sessao = token ? await validarToken(token) : null;
  if (!sessao) return NextResponse.json({ erro: "Nao autenticado" }, { status: 401 });
  if (!["ADMIN", "ADMINISTRADOR"].includes(String(sessao.perfil || "").toUpperCase())) {
    return NextResponse.json({ erro: "Sem permissao" }, { status: 403 });
  }
  const q = req.nextUrl.searchParams;
  const inicio = q.get("inicio") || "2026-09-01";
  const fim = q.get("fim") || new Date().toISOString().slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
    return NextResponse.json({ erro: "Datas invalidas" }, { status: 400 });
  }
  const desde = `${inicio}T00:00:00-03:00`;
  const ate = new Date(new Date(`${fim}T00:00:00-03:00`).getTime() + 86400000).toISOString();
  const usuario = (q.get("usuario") || "").slice(0,100);
  const tela = (q.get("tela") || "").slice(0,240);
  const evento = (q.get("evento") || "ACESSO_TELA").toUpperCase();
  const cabecalho = ["DATA_HORA_UTC","USUARIO","NOME","PERFIL","REPRESENTANTE","EVENTO","TELA_ROTA","CLIENTE_OU_GRUPO","DISPOSITIVO","NAVEGADOR"];
  const encoder = new TextEncoder();
  let inicioPagina = 0;
  let terminou = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode("\uFEFF" + cabecalho.map(celula).join(";") + "\r\n"));
    },
    async pull(controller) {
      if (terminou) { controller.close(); return; }
      let consulta = supabase.from("log_acesso")
        .select("data_hora,usuario,nome,perfil,codigo_representante,evento,rota,recurso,dispositivo,navegador")
        .gte("data_hora", desde).lt("data_hora", ate);
      if (evento !== "TODOS") consulta = consulta.eq("evento", evento);
      if (usuario) consulta = consulta.eq("usuario", usuario);
      if (tela) consulta = consulta.eq("rota", tela);
      const {data,error} = await consulta.order("data_hora",{ascending:false}).range(inicioPagina,inicioPagina+999);
      if (error) { controller.error(new Error(error.message)); return; }
      const linhas = data || [];
      if (!linhas.length) { terminou = true; controller.close(); return; }
      const conteudo = linhas.map(x=>[
        x.data_hora,x.usuario,x.nome,x.perfil,x.codigo_representante,x.evento,
        x.rota,x.recurso || (x.rota?.startsWith("/cliente/") ? x.rota.split("/")[2] : ""),
        x.dispositivo,x.navegador,
      ].map(celula).join(";")).join("\r\n")+"\r\n";
      controller.enqueue(encoder.encode(conteudo));
      inicioPagina += linhas.length;
      if (linhas.length < 1000) terminou = true;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="KIDY_AUDITORIA_ACESSOS.csv"',
      "Cache-Control": "no-store",
    },
  });
}