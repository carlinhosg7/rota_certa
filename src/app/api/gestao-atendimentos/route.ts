import { NextRequest, NextResponse } from "next/server";
import { validarToken } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const codigo = (v: unknown) => String(v ?? "").trim().replace(/\.0+$/, "");
const normalizar = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("kidy_session")?.value;
    const sessao = token ? await validarToken(token) : null;
    if (!sessao) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });

    const perfil = normalizar(sessao.perfil);
    const administrador = perfil === "ADMIN" || perfil === "ADMINISTRADOR" || perfil === "DIRETOR";
    if (!administrador && !["GERENTE", "SUPERVISOR", "REPRESENTANTE", "REP"].includes(perfil)) {
      return NextResponse.json({ erro: "Perfil sem acesso" }, { status: 403 });
    }

    // O escopo de acesso é derivado exclusivamente da sessão e do cadastro oficial,
    // jamais do filtro de representante enviado pelo navegador.
    let representantesPermitidos: string[] | null = null;
    if (perfil === "REPRESENTANTE" || perfil === "REP") {
      const rep = codigo(sessao.codigo_representante);
      if (!rep) return NextResponse.json({ erro: "Representante sem vínculo" }, { status: 403 });
      representantesPermitidos = [rep];
    } else if (perfil === "SUPERVISOR" || perfil === "GERENTE") {
      const { data: reps, error: erroReps } = await supabase
        .from("representantes_cadastro")
        .select("codigo_rep,codigo_supervisor,regional,ativo");
      if (erroReps) throw erroReps;
      let supervisores = new Set<string>();
      if (perfil === "SUPERVISOR") {
        const sup = codigo(sessao.codigo_supervisor);
        if (!sup) return NextResponse.json({ erro: "Supervisor sem vínculo" }, { status: 403 });
        supervisores.add(sup);
      } else {
        const nomeGerente = normalizar(sessao.gerente || sessao.nome);
        if (!nomeGerente) return NextResponse.json({ erro: "Gerente sem vínculo" }, { status: 403 });
        const { data: regionais, error: erroGerentes } = await supabase
          .from("kidy_gerentes_regionais")
          .select("codigo_supervisor,gerente,ativo").eq("ativo", true);
        if (erroGerentes) throw erroGerentes;
        supervisores = new Set((regionais ?? [])
          .filter(r => normalizar(r.gerente) === nomeGerente)
          .map(r => codigo(r.codigo_supervisor)));
        if (!supervisores.size) return NextResponse.json({ erro: "Gerente sem regionais vinculadas" }, { status: 403 });
      }
      representantesPermitidos = (reps ?? [])
        .filter(r => r.ativo !== false && supervisores.has(codigo(r.codigo_supervisor)))
        .map(r => codigo(r.codigo_rep)).filter(Boolean);
      if (!representantesPermitidos.length) return NextResponse.json({ atendimentos: [], total: 0, pagina: 1, paginas: 0 });
    }

    const url = new URL(req.url);
    const pagina = Math.max(1, Math.min(10000, Number(url.searchParams.get("pagina")) || 1));
    const porPagina = 100;
    const dataInicio = url.searchParams.get("inicio") || "";
    const dataFim = url.searchParams.get("fim") || "";
    const representante = codigo(url.searchParams.get("representante"));
    const resultado = url.searchParams.get("resultado") || "";
    const cliente = codigo(url.searchParams.get("cliente"));

    if ((dataInicio && !/^\d{4}-\d{2}-\d{2}$/.test(dataInicio)) || (dataFim && !/^\d{4}-\d{2}-\d{2}$/.test(dataFim))) {
      return NextResponse.json({ erro: "Data inválida" }, { status: 400 });
    }
    if (representantesPermitidos && representante && !representantesPermitidos.includes(representante)) {
      return NextResponse.json({ erro: "Representante fora da sua equipe" }, { status: 403 });
    }

    let q = supabase.from("atendimentos_comerciais")
      .select("id,data_atendimento,codigo_cliente,nome_cliente,codigo_representante,resultado,pedido_realizado,numero_pedido,quantidade_pares,valor_pedido,linhas_apresentadas,campanha_utilizada,motivo_nao_compra,proxima_acao,data_proxima_acao,observacoes", { count: "exact" })
      .order("data_atendimento", { ascending: false })
      .range((pagina-1)*porPagina, pagina*porPagina-1);

    if (representantesPermitidos) q = q.in("codigo_representante", representantesPermitidos);
    if (representante) q = q.eq("codigo_representante", representante);
    if (cliente) q = q.eq("codigo_cliente", cliente);
    if (resultado) q = q.eq("resultado", resultado);
    if (dataInicio) q = q.gte("data_atendimento", `${dataInicio}T00:00:00`);
    if (dataFim) q = q.lte("data_atendimento", `${dataFim}T23:59:59.999`);
    const { data, count, error } = await q;
    if (error) throw error;
    return NextResponse.json({ atendimentos: data ?? [], total: count ?? 0, pagina, paginas: Math.ceil((count ?? 0)/porPagina) }, {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (e) {
    console.error("[GESTAO ATENDIMENTOS]", e);
    return NextResponse.json({ erro: "Não foi possível consultar os atendimentos" }, { status: 500 });
  }
}
