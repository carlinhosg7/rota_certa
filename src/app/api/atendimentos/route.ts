import { NextRequest, NextResponse } from "next/server";

import { validarToken } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function texto(valor: unknown, max = 500) {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  return s ? s.slice(0, max) : null;
}

function numero(valor: unknown) {
  if (valor === null || valor === undefined || valor === "") return null;

  if (typeof valor === "number") {
    return Number.isFinite(valor) ? valor : null;
  }

  const bruto = String(valor).trim();

  // Aceita 1234.56, 1.234,56 e R$ 1.234,56
  const limpo = bruto
    .replace(/R\$/gi, "")
    .replace(/\s/g, "");

  const normalizado =
    limpo.includes(",")
      ? limpo.replace(/\./g, "").replace(",", ".")
      : limpo;

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

function inteiroNaoNegativo(valor: unknown) {
  const n = numero(valor);
  if (n === null) return null;
  return Math.max(0, Math.round(n));
}

function listaTexto(valor: unknown) {
  if (!Array.isArray(valor)) return [];

  return [
    ...new Set(
      valor
        .map((x) => String(x ?? "").trim())
        .filter(Boolean)
        .map((x) => x.slice(0, 150))
    ),
  ].slice(0, 50);
}

function dataValida(valor: unknown) {
  const s = texto(valor, 10);
  if (!s) return null;

  // Campo DATE do Postgres: YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;

  const d = new Date(`${s}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : s;
}

async function autenticar(req: NextRequest) {
  const token = req.cookies.get("kidy_session")?.value;

  if (!token) return null;

  try {
    return await validarToken(token);
  } catch {
    return null;
  }
}

// ============================================================
// GET /api/atendimentos?cliente=5402
// GET /api/atendimentos?representante=294
// ============================================================

export async function GET(req: NextRequest) {
  const usuarioLogado = await autenticar(req);

  if (!usuarioLogado) {
    return NextResponse.json(
      { sucesso: false, erro: "Não autorizado." },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);

    const cliente = texto(searchParams.get("cliente"), 50);
    const representante = texto(searchParams.get("representante"), 50);

    let query = supabase
      .from("atendimentos_comerciais")
      .select("*")
      .order("data_atendimento", { ascending: false })
      .limit(100);

    if (cliente) {
      query = query.eq("codigo_cliente", cliente);
    }

    if (representante) {
      query = query.eq("codigo_representante", representante);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[ATENDIMENTOS][GET]", error);

      return NextResponse.json(
        {
          sucesso: false,
          erro: "Erro ao consultar atendimentos.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      sucesso: true,
      atendimentos: data ?? [],
    });
  } catch (error) {
    console.error("[ATENDIMENTOS][GET]", error);

    return NextResponse.json(
      {
        sucesso: false,
        erro: "Erro interno ao consultar atendimentos.",
      },
      { status: 500 }
    );
  }
}

// ============================================================
// POST /api/atendimentos
// ============================================================

export async function POST(req: NextRequest) {
  const usuarioLogado = await autenticar(req);

  if (!usuarioLogado) {
    return NextResponse.json(
      { sucesso: false, erro: "Não autorizado." },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();

    const codigoCliente = texto(body.codigo_cliente, 50);
    const nomeCliente = texto(body.nome_cliente, 250);
    const codigoRepresentante = texto(body.codigo_representante, 50);
    const resultado = texto(body.resultado, 100);

    if (!codigoCliente) {
      return NextResponse.json(
        { sucesso: false, erro: "Código do cliente é obrigatório." },
        { status: 400 }
      );
    }

    if (!codigoRepresentante) {
      return NextResponse.json(
        { sucesso: false, erro: "Código do representante é obrigatório." },
        { status: 400 }
      );
    }

    if (!resultado) {
      return NextResponse.json(
        { sucesso: false, erro: "Resultado do atendimento é obrigatório." },
        { status: 400 }
      );
    }

    const pedidoRealizado = body.pedido_realizado === true;

    const registro = {
      codigo_cliente: codigoCliente,
      nome_cliente: nomeCliente,
      codigo_representante: codigoRepresentante,

      // O formulário enviará apenas a identificação exibida na sessão.
      // A API nunca recebe nem expõe SUPABASE_SECRET_KEY.
      usuario: texto(body.usuario, 250),

      resultado,

      pedido_realizado: pedidoRealizado,

      numero_pedido: pedidoRealizado
        ? texto(body.numero_pedido, 100)
        : null,

      quantidade_pares: pedidoRealizado
        ? inteiroNaoNegativo(body.quantidade_pares)
        : null,

      valor_pedido: pedidoRealizado
        ? numero(body.valor_pedido)
        : null,

      linhas_apresentadas: listaTexto(body.linhas_apresentadas),

      campanha_utilizada: texto(body.campanha_utilizada, 250),

      motivo_nao_compra: pedidoRealizado
        ? null
        : texto(body.motivo_nao_compra, 500),

      observacoes: texto(body.observacoes, 3000),

      proxima_acao: texto(body.proxima_acao, 1000),

      data_proxima_acao: dataValida(body.data_proxima_acao),
    };

    const { data, error } = await supabase
      .from("atendimentos_comerciais")
      .insert(registro)
      .select("*")
      .single();

    if (error) {
      console.error("[ATENDIMENTOS][POST]", error);

      return NextResponse.json(
        {
          sucesso: false,
          erro: "Erro ao salvar atendimento.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        sucesso: true,
        mensagem: "Atendimento registrado com sucesso.",
        atendimento: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[ATENDIMENTOS][POST]", error);

    return NextResponse.json(
      {
        sucesso: false,
        erro: "Erro interno ao registrar atendimento.",
      },
      { status: 500 }
    );
  }
}
