import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validarToken } from "@/lib/auth";
import { getData, resumirClientes } from "@/lib/comercial-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ codigo: string }> }
) {
  try {
    const token = (await cookies()).get("kidy_session")?.value;
    if (!token) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });

    const u: any = await validarToken(token);
    if (!u) return NextResponse.json({ erro: "Sessão inválida" }, { status: 401 });

    const { codigo } = await context.params;
    const codigoCliente = decodeURIComponent(String(codigo || "")).trim();
    if (!codigoCliente) return NextResponse.json({ erro: "Cliente inválido" }, { status: 400 });

    const { carteira, vendas } = await getData();
    const perfil = String(u.perfil || "").toUpperCase();
    const repLogin = String(u.codigo_representante || u.usuario || "").replace(/\.0+$/, "");

    let c = carteira;
    let v = vendas;

    if (perfil === "REPRESENTANTE") {
      c = c.filter((x) => x.rep === repLogin);
      v = v.filter((x) => x.rep === repLogin);
    }

    const carteiraCliente = c.filter((x) => String(x.codigo) === codigoCliente);
    const vendasCliente = v.filter((x) => String(x.codigo) === codigoCliente);

    if (!carteiraCliente.length) {
      return NextResponse.json(
        { erro: "Cliente não encontrado ou sem permissão de acesso." },
        { status: 404 }
      );
    }

    const resumo = resumirClientes(carteiraCliente, vendasCliente);
    const cliente = resumo.find((x) => String(x.codigo) === codigoCliente);

    if (!cliente) {
      return NextResponse.json({ erro: "Não foi possível resumir os dados do cliente." }, { status: 404 });
    }

    return NextResponse.json({
      cliente: {
        codigo: cliente.codigo,
        razao: cliente.razao,
        cidade: cliente.cidade,
        uf: cliente.uf,
        status: cliente.status,
        diasSemCompra: cliente.diasSemCompra,
        ultimaCompra: cliente.ultimaCompra?.toISOString().slice(0, 10) || null,
        limite: cliente.limite,
        bloqueio: cliente.bloqueio,
        prioridade: cliente.prioridade,
      },
      contexto: {
        perfil,
        representante: carteiraCliente[0]?.rep || null,
        supervisor: carteiraCliente[0]?.sup || null,
      },
      historico: {
        registrosVendas: vendasCliente.length,
      },
    });
  } catch (e: any) {
    console.error("Erro API cliente:", e);
    return NextResponse.json({ erro: e?.message || "Erro ao carregar cliente" }, { status: 500 });
  }
}
