import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { validarToken } from "@/lib/auth";

const EVENTOS_PERMITIDOS = new Set([
  "ACESSO_DASHBOARD",
  "SELECIONOU_SUPERVISOR",
  "SELECIONOU_REPRESENTANTE",
  "SELECIONOU_CIDADE",
  "ABRIU_CLIENTE",
  "GEROU_ROTA",
  "ACESSO_ANALISE_CLIENTE",
]);

export async function POST(req: NextRequest) {
  try {
    const token =
      req.cookies.get("kidy_session")?.value;

    if (!token) {
      return NextResponse.json(
        { erro: "Não autenticado." },
        { status: 401 }
      );
    }

    const sessao = await validarToken(token);

    if (!sessao) {
      return NextResponse.json(
        { erro: "Sessão inválida." },
        { status: 401 }
      );
    }

    const body = await req.json();

    const evento = String(
      body?.evento || ""
    ).trim().toUpperCase();

    if (!EVENTOS_PERMITIDOS.has(evento)) {
      return NextResponse.json(
        { erro: "Evento inválido." },
        { status: 400 }
      );
    }

    const ua =
      req.headers.get("user-agent") || "";

    const u = ua.toLowerCase();

    const navegador =
      u.includes("edg/")
        ? "Edge"
        : u.includes("chrome/")
        ? "Chrome"
        : u.includes("firefox/")
        ? "Firefox"
        : u.includes("safari/")
        ? "Safari"
        : "Outro";

    const sistema =
      u.includes("windows")
        ? "Windows"
        : u.includes("android")
        ? "Android"
        : u.includes("iphone") ||
          u.includes("ipad")
        ? "iOS"
        : u.includes("mac")
        ? "macOS"
        : u.includes("linux")
        ? "Linux"
        : "Outro";

    const dispositivo =
      ["mobile", "android", "iphone"].some(
        (x) => u.includes(x)
      )
        ? "Mobile"
        : "Desktop";

    const ip =
      (
        req.headers.get("x-forwarded-for") ||
        ""
      )
        .split(",")[0]
        .trim() || null;

    const sessionId =
      req.cookies.get("kidy_sid")?.value ||
      null;

    const { error } = await supabase
      .from("log_acesso")
      .insert({
        usuario:
          String(sessao.usuario || ""),

        nome:
          sessao.nome || null,

        perfil:
          sessao.perfil || null,

        codigo_representante:
          sessao.codigo_representante || null,

        ip,

        cidade: null,
        estado: null,
        pais: null,

        latitude: null,
        longitude: null,

        dispositivo,
        navegador,

        sistema_operacional:
          sistema,

        session_id:
          sessionId,

        evento,
      });

    if (error) {
      console.error(
        "Erro ao registrar evento:",
        error
      );

      return NextResponse.json(
        { erro: "Erro ao registrar evento." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      sucesso: true,
    });

  } catch (error) {
    console.error(
      "Erro API evento:",
      error
    );

    return NextResponse.json(
      { erro: "Erro interno." },
      { status: 500 }
    );
  }
}