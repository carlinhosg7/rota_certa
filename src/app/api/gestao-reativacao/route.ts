import { NextRequest, NextResponse } from "next/server";
import { validarToken } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { clienteAutorizado } from "@/lib/gestao-reativacao-acesso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SessaoGestao = {
  usuario: string;
  nome: string;
  perfil: string;
  codigo_representante: string | null;
  codigo_supervisor: string | null;
};

const CLASSIFICACOES = [
  "REATIVADO",
  "EM_NEGOCIACAO",
  "AGUARDANDO_CREDITO",
  "SEM_INTERESSE",
  "NAO_LOCALIZADO",
  "EMPRESA_ENCERRADA",
  "TENTATIVAS_ESGOTADAS",
];

const STATUS_ACAO = [
  "PENDENTE",
  "CONCLUIDA",
  "CANCELADA",
];

function texto(valor: unknown, limite = 1000): string {
  return String(valor ?? "").trim().slice(0, limite);
}

function dataValida(valor: unknown): string | null {
  const data = texto(valor, 10);

  if (!data) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;

  const [ano, mes, dia] = data.split("-").map(Number);
  const teste = new Date(Date.UTC(ano, mes - 1, dia));

  return (
    teste.getUTCFullYear() === ano &&
    teste.getUTCMonth() === mes - 1 &&
    teste.getUTCDate() === dia
  ) ? data : null;
}

async function autenticar(req: NextRequest): Promise<SessaoGestao | null> {
  const token = req.cookies.get("kidy_session")?.value;

  if (!token) return null;

  try {
    const payload = await validarToken(token);

    if (!payload || typeof payload !== "object") {
      return null;
    }

    const usuario = texto(payload.usuario, 250);
    const nome = texto(payload.nome, 250);
    const perfil = texto(payload.perfil, 50).toUpperCase();

    if (!usuario || !perfil) {
      return null;
    }

    if (
      ![
        "ADMIN",
        "ADMINISTRADOR",
        "GERENTE",
        "SUPERVISOR",
        "REPRESENTANTE",
      ].includes(perfil)
    ) {
      return null;
    }

    const codigoRepresentante =
      texto(payload.codigo_representante, 50) || null;

    const codigoSupervisor =
      texto(payload.codigo_supervisor, 50) || null;

    if (
      perfil === "REPRESENTANTE" &&
      !codigoRepresentante
    ) {
      return null;
    }

    if (
      perfil === "SUPERVISOR" &&
      !codigoSupervisor
    ) {
      return null;
    }

    return {
      usuario,
      nome,
      perfil,
      codigo_representante: codigoRepresentante,
      codigo_supervisor: codigoSupervisor,
    };

  } catch {
    return null;
  }
}

function erro(mensagem: string, status: number) {
  return NextResponse.json(
    { sucesso: false, erro: mensagem },
    { status }
  );
}

export async function GET(req: NextRequest) {
  try {
    const usuario = await autenticar(req);

    if (!usuario) {
      return erro("Não autenticado.", 401);
    }

    const codigo = texto(
      req.nextUrl.searchParams.get("cliente"),
      50
    );

    if (!codigo) {
      return erro("Informe o código do cliente.", 400);
    }

    const cliente = await clienteAutorizado(codigo, usuario);

    if (!cliente) {
      return erro("Cliente não encontrado ou sem permissão.", 403);
    }

    const [gestao, historico] = await Promise.all([
      supabase
        .from("kidy_gestao_reativacao")
        .select("*")
        .eq("codigo_cliente", codigo)
        .maybeSingle(),

      supabase
        .from("kidy_reativacao_historico")
        .select("*")
        .eq("codigo_cliente", codigo)
        .order("criado_em", { ascending: false })
        .order("id", { ascending: false })
        .limit(100),
    ]);

    if (gestao.error || historico.error) {
      console.error(
        "[GESTAO REATIVACAO][GET]",
        gestao.error,
        historico.error
      );

      return erro("Erro ao consultar a gestão.", 500);
    }

    return NextResponse.json({
      sucesso: true,
      gestao: gestao.data,
      historico: historico.data ?? [],
    });

  } catch (e) {
    console.error("[GESTAO REATIVACAO][GET]", e);
    return erro("Erro interno na consulta.", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const usuario = await autenticar(req);

    if (!usuario) {
      return erro("Não autenticado.", 401);
    }

    const body: Record<string, unknown> = await req.json();

    const codigo = texto(body.codigo_cliente, 50);

    if (!codigo) {
      return erro("Código do cliente obrigatório.", 400);
    }

    const cliente = await clienteAutorizado(codigo, usuario);

    if (!cliente) {
      return erro("Cliente não encontrado ou sem permissão.", 403);
    }

    const classificacao = texto(body.classificacao, 50);
    const statusAcao = texto(body.status_acao, 30);

    if (!CLASSIFICACOES.includes(classificacao)) {
      return erro("Classificação inválida.", 400);
    }

    if (!STATUS_ACAO.includes(statusAcao)) {
      return erro("Status da ação inválido.", 400);
    }

    const tentativas = Number(body.tentativas_contato ?? 0);

    if (
      !Number.isSafeInteger(tentativas) ||
      tentativas < 0
    ) {
      return erro("Quantidade de tentativas inválida.", 400);
    }

    const dataInformada = texto(body.data_proxima_acao, 30);
    const dataProximaAcao = dataValida(dataInformada);

    if (dataInformada && !dataProximaAcao) {
      return erro("Data da próxima ação inválida.", 400);
    }

    const codigoRepresentante =
      cliente.representanteAtual.find(
        r => r.codigo === usuario.codigo_representante
      )?.codigo ??
      cliente.representanteAtual[0]?.codigo ??
      null;

    const codigoSupervisor =
      cliente.supervisores.find(
        s => s.codigo === usuario.codigo_supervisor
      )?.codigo ??
      cliente.supervisores[0]?.codigo ??
      null;

    const identificacaoUsuario = usuario.usuario;

    const { data, error: erroBanco } = await supabase.rpc(
      "kidy_salvar_gestao_reativacao",
      {
        p_codigo_cliente: codigo,
        p_classificacao: classificacao,
        p_tentativas_contato: tentativas,
        p_retorno: texto(body.retorno, 2000) || null,
        p_proxima_acao: texto(body.proxima_acao, 1000) || null,
        p_data_proxima_acao: dataProximaAcao,
        p_codigo_representante: codigoRepresentante,
        p_codigo_supervisor: codigoSupervisor,
        p_responsavel:
          texto(body.responsavel, 250) ||
          usuario.nome ||
          identificacaoUsuario,
        p_observacoes: texto(body.observacoes, 3000) || null,
        p_status_acao: statusAcao,
        p_usuario: identificacaoUsuario,
      }
    );

    if (erroBanco) {
      console.error("[GESTAO REATIVACAO][POST]", erroBanco);

      return erro(
        "Erro ao salvar gestão e histórico. Verifique a função SQL.",
        500
      );
    }

    return NextResponse.json({
      sucesso: true,
      mensagem: "Gestão de reativação salva com sucesso.",
      gestao: data,
    });

  } catch (e) {
    console.error("[GESTAO REATIVACAO][POST]", e);
    return erro("Erro interno ao salvar gestão.", 500);
  }
}
