import { cookies } from "next/headers";
import { validarToken } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { lerArquivoComercial } from "@/lib/google-drive-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Cliente = {
  codigo: string;
  razao_social: string;
  grupo_cliente: string;
  codigo_representante: string;
  representante: string;
  supervisor: string;
  cidade: string;
  uf: string;
};

type Base = Record<string, Cliente[]>;

export async function GET(req: NextRequest) {
  const token = (await cookies()).get("kidy_session")?.value;

  if (!token) {
    return NextResponse.json(
      { erro: "Nao autenticado" }, { status: 401 }
    );
  }

  const usuario = await validarToken(token);

  if (!usuario) {
    return NextResponse.json(
      { erro: "Sessao invalida" }, { status: 401 }
    );
  }

  if (String(usuario.perfil ?? "").toUpperCase() !== "ADMIN") {
    return NextResponse.json(
      { erro: "Sem permissao" }, { status: 403 }
    );
  }

  try {
    const buffer = await lerArquivoComercial("share-clientes.json");
    const dados = JSON.parse(buffer.toString("utf8")) as Base;

    if (req.nextUrl.searchParams.get("modo") === "contagem") {
      const contagens: Record<string, number> = {};

      for (const [ibge, clientes] of Object.entries(dados)) {
        contagens[ibge] = new Set(
          clientes.map(c => String(c.codigo))
        ).size;
      }

      return NextResponse.json({ contagens });
    }

    const ibge = req.nextUrl.searchParams.get("ibge") ?? "";

    if (!/^\d{7}$/.test(ibge)) {
      return NextResponse.json(
        { erro: "Codigo IBGE invalido" }, { status: 400 }
      );
    }

    const clientes = dados[ibge] ?? [];

    return NextResponse.json({
      clientes,
      total: new Set(clientes.map(c => String(c.codigo))).size,
      visao360Template: "/cliente/{codigo}"
    });

  } catch (erro) {
    console.error("[SHARE CLIENTES] Erro:", erro);

    return NextResponse.json(
      { erro: "Base de clientes Share indisponivel" },
      { status: 503 }
    );
  }
}