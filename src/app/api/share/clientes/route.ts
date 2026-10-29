import { podeAcessarShare, ehAdminShare, pertenceRepresentanteShare } from "@/lib/share-acesso";
import { cookies } from "next/headers";
import { validarToken } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { lerJSONShare } from "@/lib/share-snapshots";

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

  if (!podeAcessarShare(usuario)) {
    return NextResponse.json(
      { erro: "Sem permissao" }, { status: 403 }
    );
  }

  try {
    if (req.nextUrl.searchParams.get("modo") === "contagem") {
      const indice = await lerJSONShare<{cidades: Record<string,{total:number;representantes:Record<string,number>}>}>("share-acesso-indice.json");
      const contagens:Record<string,number> = {};
      for (const [ibge, entrada] of Object.entries(indice.cidades)) {
        const quantidade = ehAdminShare(usuario) ? entrada.total :
          Object.entries(entrada.representantes).reduce((n,[rep,q]) => n + (pertenceRepresentanteShare(usuario,rep) ? q : 0),0);
        if (quantidade > 0 || ehAdminShare(usuario)) contagens[ibge]=quantidade;
      }
      return NextResponse.json({contagens});
    }

    const dados = await lerJSONShare<Base>("share-clientes.json");
    const basePermitida: Base = ehAdminShare(usuario) ? dados : Object.fromEntries(
      Object.entries(dados).map(([ibge, clientes]) => [ibge, clientes.filter(c => pertenceRepresentanteShare(usuario, c.codigo_representante))])
        .filter(([, clientes]) => clientes.length > 0)
    );

    if (req.nextUrl.searchParams.get("modo") === "contagem") {
      const contagens: Record<string, number> = {};

      for (const [ibge, clientes] of Object.entries(basePermitida)) {
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

    const clientes = basePermitida[ibge] ?? [];

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