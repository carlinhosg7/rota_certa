import { NextResponse } from "next/server";
import { obterAdministrador } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const administrador = await obterAdministrador();

    if (!administrador) {
      return NextResponse.json(
        { erro: "Acesso restrito ao administrador." },
        { status: 403 }
      );
    }

    const [cadastro, dePara, historico] = await Promise.all([
      supabase
        .from("representantes_cadastro")
        .select("*")
        .order("codigo_rep"),

      supabase
        .from("representantes_de_para")
        .select("*")
        .order("codigo_antigo"),

      supabase
        .from("representantes_historico")
        .select("*")
        .order("registrado_em", { ascending: false })
        .limit(500),
    ]);

    if (cadastro.error || dePara.error || historico.error) {
      console.error("[ADMIN REPRESENTANTES]", {
        cadastro: cadastro.error?.message,
        dePara: dePara.error?.message,
        historico: historico.error?.message,
      });

      return NextResponse.json(
        { erro: "Falha ao consultar representantes." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        sucesso: true,
        totais: {
          representantes: cadastro.data?.length ?? 0,
          conversoes: dePara.data?.length ?? 0,
          historico: historico.data?.length ?? 0,
        },
        representantes: cadastro.data ?? [],
        dePara: dePara.data ?? [],
        historico: historico.data ?? [],
      },
      {
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch (erro) {
    console.error("[ADMIN REPRESENTANTES GET]", erro);

    return NextResponse.json(
      { erro: "Erro interno ao consultar representantes." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const administrador = await obterAdministrador();

    if (!administrador) {
      return NextResponse.json(
        { erro: "Acesso restrito ao administrador." },
        { status: 403 }
      );
    }

    let corpo: unknown;

    try {
      corpo = await request.json();
    } catch {
      return NextResponse.json(
        { erro: "JSON inválido." },
        { status: 400 }
      );
    }

    if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
      return NextResponse.json(
        { erro: "Dados inválidos." },
        { status: 400 }
      );
    }

    const dados = corpo as Record<string, unknown>;

    if (
      typeof dados.codigo_rep !== "string" ||
      typeof dados.nome_rep !== "string" ||
      typeof dados.regional !== "string" ||
      typeof dados.ativo !== "boolean" ||
      typeof dados.motivo !== "string"
    ) {
      return NextResponse.json(
        { erro: "Campos obrigatórios inválidos." },
        { status: 400 }
      );
    }

    const codigo = dados.codigo_rep.trim();
    const nome = dados.nome_rep.trim();
    const regional = dados.regional.trim().toUpperCase();
    const motivo = dados.motivo.trim();

    if (!codigo || !nome || motivo.length < 5) {
      return NextResponse.json(
        { erro: "Informe código, nome e motivo com pelo menos 5 caracteres." },
        { status: 400 }
      );
    }

    const regionais = new Set([
      "B2B",
      "CENTRO OESTE",
      "NORTE / NORDESTE",
      "REM",
      "SPC",
      "SPI",
      "SUL",
    ]);

    if (!regionais.has(regional)) {
      return NextResponse.json(
        { erro: "Regional inválida." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc(
      "admin_atualizar_representante",
      {
        p_codigo_rep: codigo,
        p_nome_rep: nome,
        p_regional: regional,
        p_ativo: dados.ativo,
        p_motivo: motivo,
        p_usuario_responsavel: administrador.usuario,
      }
    );

    if (error) {
      console.error("[ADMIN REPRESENTANTES PATCH]", error.message);

      return NextResponse.json(
        { erro: "Não foi possível salvar a alteração. Verifique os dados e tente novamente." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { sucesso: true, resultado: data },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (erro) {
    console.error("[ADMIN REPRESENTANTES PATCH]", erro);

    return NextResponse.json(
      { erro: "Erro interno ao atualizar representante." },
      { status: 500 }
    );
  }
}