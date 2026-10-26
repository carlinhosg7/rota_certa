import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validarToken } from "@/lib/auth";
import { getData, cleanCode } from "@/lib/comercial-data";
import { salvarPrioridade, validarPrioridade } from "@/lib/prioridade-cliente-db";

import { carregarCarteira2027 } from "@/lib/carteira-2027-data";

export const runtime = "nodejs";
export async function PUT(req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  try {
    const token = (await cookies()).get("kidy_session")?.value;
    const usuario = token ? await validarToken(token) : null;
    if (!usuario) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
    const codigo = cleanCode((await params).codigo);
    if (!codigo) return NextResponse.json({ erro: "Código inválido" }, { status: 400 });
    const { carteira } = await getData();
    const cliente = carteira.find(c => cleanCode(c.codigo) === codigo);
    if (!cliente) return NextResponse.json({ erro: "Cliente não encontrado" }, { status: 404 });
    // Nunca confiar no codigo/representante enviado pelo navegador.
    const u = usuario as unknown as Record<string, unknown>;
    const papel = String(u.perfil || u.role || "").toUpperCase();
    const identidade = [u.codigo, u.codrep, u.codigoRepresentante, u.rep, u.usuario].filter(x => x != null).map(x => cleanCode(String(x)));
    const supervisor = [u.supervisor_codigo, u.supervisor, u.sup].filter(x=>x != null).map(x=>cleanCode(String(x)));
    const admin = ["ADMIN", "ADMINISTRADOR"].includes(papel);
    const autorizado = admin || identidade.includes(cleanCode(cliente.rep || "")) || (papel === "SUPERVISOR" && supervisor.includes(cleanCode(cliente.sup || "")));
    if (!autorizado) return NextResponse.json({ erro: "Sem permissão para alterar este cliente. Verifique o mapeamento do usuário." }, { status: 403 });
    const base = await carregarCarteira2027();
    const lista = Array.isArray(base) ? base : (base as unknown as { clientes?: { codigoCliente: string; situacaoEmpresa: string }[] }).clientes || [];
    const item = lista.find(c => cleanCode(c.codigoCliente) === codigo);
    if (item?.situacaoEmpresa?.toUpperCase() === "BAIXADA") return NextResponse.json({ erro: "Empresa encerrada: classificação comercial bloqueada" }, { status: 409 });
    const payload = await req.json() as { prioridade?: unknown };

    if (!validarPrioridade(payload.prioridade)) {
      return NextResponse.json(
        { erro: "Prioridade inválida" },
        { status: 400 }
      );
    }

    const ator = String(
      u.email || u.codigo || u.usuario || "usuario-autenticado"
    );

    await salvarPrioridade(codigo, payload.prioridade, ator);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[CLASSIFICACOES]", e);
    return NextResponse.json({ erro: "Falha ao salvar. Consulte o log do servidor." }, { status: 500 });
  }
}
