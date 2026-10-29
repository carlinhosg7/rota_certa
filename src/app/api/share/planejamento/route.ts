import { podeAcessarShare, ehAdminShare, pertenceRepresentanteShare } from "@/lib/share-acesso";
import { cookies } from "next/headers";
import { validarToken } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { lerArquivoComercial } from "@/lib/google-drive-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Potencial = {
  "2025": number;
  pico: number;
  ano_pico: number | null;
};

type Payload = {
  ano_base: number;
  criterio: string;
  cidades: Record<string, Record<string, Potencial>>;
};

type Cliente = {
  codigo: string;
  razao_social: string;
  grupo_cliente: string;
  codigo_representante: string;
  representante: string;
  supervisor: string;
};

async function lerJSON<T>(nome: string): Promise<T> {
  const buffer = await lerArquivoComercial(nome);
  return JSON.parse(buffer.toString("utf8")) as T;
}

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
    const dados = await lerJSON<Payload>(
      "share-potencial-clientes.json"
    );

    const cadastroRestrito = ehAdminShare(usuario) ? null :
      await lerJSON<Record<string, Cliente[]>>("share-clientes.json");

    const ibge = req.nextUrl.searchParams.get("ibge");

    if (ibge !== null) {
      if (!/^\d{7}$/.test(ibge)) {
        return NextResponse.json(
          { erro: "IBGE invalido" }, { status: 400 }
        );
      }

      const cadastro = await lerJSON<Record<string, Cliente[]>>(
        "share-clientes.json"
      );

      const clientes = (cadastro[ibge] ?? []).filter(c => pertenceRepresentanteShare(usuario, c.codigo_representante)).map(c => ({
        ...c,
        vendas2025: dados.cidades[ibge]?.[c.codigo]?.["2025"] ?? 0,
        pico: dados.cidades[ibge]?.[c.codigo]?.pico ?? 0,
        ano_pico: dados.cidades[ibge]?.[c.codigo]?.ano_pico ?? null
      }));

      return NextResponse.json({
        ano_base: dados.ano_base,
        clientes
      });
    }

    const cidades: Record<string, [number, number][]> = {};

    for (const [cidade, clientes] of Object.entries(dados.cidades)) {
      const codigosPermitidos = cadastroRestrito === null ? null : new Set(
        (cadastroRestrito[cidade] ?? [])
          .filter(c => pertenceRepresentanteShare(usuario, c.codigo_representante))
          .map(c => String(c.codigo))
      );
      if (codigosPermitidos !== null && codigosPermitidos.size === 0) continue;
      cidades[cidade] = Object.entries(clientes)
        .filter(([codigo]) => codigosPermitidos === null || codigosPermitidos.has(codigo))
        .map(([, c]) => [
        c["2025"] ?? 0,
        c.pico ?? 0
      ]);
    }

    return NextResponse.json({
      ano_base: dados.ano_base,
      cidades
    });

  } catch (erro) {
    console.error("[SHARE PLANEJAMENTO] Erro:", erro);

    return NextResponse.json(
      { erro: "Base de planejamento indisponivel" },
      { status: 503 }
    );
  }
}