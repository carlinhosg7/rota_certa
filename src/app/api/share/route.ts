import { cookies } from "next/headers";
import { validarToken } from "@/lib/auth";
import { NextResponse } from "next/server";
import { lerArquivoComercial } from "@/lib/google-drive-adapter";
import {
  calcularShareMedio,
  gerentePorSupervisor,
  ultimoAnoCompleto,
  shareReal
} from "@/lib/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Historico = Record<string, Record<string, number>>;

type Municipio = {
  codigo_ibge: string;
  supervisor: string;
  potencial_pares: number;
  [campo: string]: unknown;
};

async function lerJSON<T>(nome: string): Promise<T> {
  const buffer = await lerArquivoComercial(nome);
  return JSON.parse(buffer.toString("utf8")) as T;
}

export async function GET() {
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
    const [municipios, vendas] = await Promise.all([
      lerJSON<Municipio[]>("share-municipios.json"),
      lerJSON<Historico>("share-vendas-anuais.json")
    ]);

    if (!Array.isArray(municipios) || municipios.length === 0) {
      throw new Error("Base municipal vazia ou invalida");
    }

    const cidades = municipios.map(c => {
      const historico = vendas[String(c.codigo_ibge)] ?? {};

      return {
        ...c,
        gerente: gerentePorSupervisor(c.supervisor),
        vendas_ano: historico,
        share_medio_historico: calcularShareMedio(
          historico,
          c.potencial_pares,
          ultimoAnoCompleto
        ),
        share_ultimo_ano: shareReal(
          Number(historico[String(ultimoAnoCompleto)] ?? 0),
          c.potencial_pares
        )
      };
    });

    return NextResponse.json({
      cidades,
      ultimoAnoCompleto,
      vendasDisponiveis: true,
      observacao: "Historico de entregas carregado do Google Drive."
    });

  } catch (erro) {
    console.error("[SHARE] Falha ao carregar bases:", erro);

    return NextResponse.json(
      { erro: "Dados do Share indisponiveis no Google Drive" },
      { status: 503 }
    );
  }
}