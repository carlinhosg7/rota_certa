import { NextRequest, NextResponse } from "next/server";
import { validarToken } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { carregarCarteira2027 } from "@/lib/carteira-2027-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Registro = {
  codigo_cliente: string | number | null;
  codigo_representante?: string | number | null;
  codigo_supervisor?: string | number | null;
  responsavel?: string | null;
  proxima_acao?: string | null;
  data_proxima_acao?: string | null;
  status_acao?: string | null;
};

function texto(valor: unknown) {
  return String(valor ?? "").trim();
}

function dataBrasil(data: Date) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get("kidy_session")?.value;

    if (!token) {
      return NextResponse.json(
        { sucesso: false, erro: "Não autenticado." },
        { status: 401 }
      );
    }

    const usuario = await validarToken(token);

    if (!usuario) {
      return NextResponse.json(
        { sucesso: false, erro: "Sessão inválida." },
        { status: 401 }
      );
    }

    const perfil = texto(usuario.perfil).toUpperCase();
    const codigoRep = texto(usuario.codigo_representante);
    const codigoSup = texto(usuario.codigo_supervisor);

    if (
      !["ADMIN", "ADMINISTRADOR", "GERENTE", "SUPERVISOR", "REPRESENTANTE"].includes(perfil)
    ) {
      return NextResponse.json(
        { sucesso: false, erro: "Perfil sem permissão." },
        { status: 403 }
      );
    }

    if (
      (perfil === "REPRESENTANTE" && !codigoRep) ||
      (perfil === "SUPERVISOR" && !codigoSup)
    ) {
      return NextResponse.json(
        { sucesso: false, erro: "Vínculo comercial não configurado." },
        { status: 403 }
      );
    }

    const carteira = await carregarCarteira2027();

    const clientesPermitidos = new Map<
      string,
      { razaoSocial: string; representante: string; supervisor: string }
    >();

    for (const cliente of carteira.clientes) {
      const permitido =
        ["ADMIN", "ADMINISTRADOR", "GERENTE"].includes(perfil) ||
        (
          perfil === "REPRESENTANTE" &&
          cliente.representanteAtual.some(
            r => texto(r.codigo) === codigoRep
          )
        ) ||
        (
          perfil === "SUPERVISOR" &&
          cliente.supervisores.some(
            s => texto(s.codigo) === codigoSup
          )
        );

      if (!permitido) continue;

      clientesPermitidos.set(texto(cliente.codigoCliente), {
        razaoSocial: texto(cliente.razaoSocial),
        representante: cliente.representanteAtual
          .map(r => texto(r.codigo))
          .join(", "),
        supervisor: cliente.supervisores
          .map(s => texto(s.codigo))
          .join(", ")
      });
    }

    const registros: Registro[] = [];
    const tamanhoPagina = 1000;

    for (let inicio = 0; ; inicio += tamanhoPagina) {
      const { data, error } = await supabase
        .from("kidy_gestao_reativacao")
        .select(
          "codigo_cliente,codigo_representante,codigo_supervisor,responsavel,proxima_acao,data_proxima_acao,status_acao"
        )
        .eq("status_acao", "PENDENTE")
        .not("data_proxima_acao", "is", null)
        .order("codigo_cliente", { ascending: true })
        .range(inicio, inicio + tamanhoPagina - 1);

      if (error) {
        console.error("[ALERTAS REATIVACAO]", error);
        return NextResponse.json(
          { sucesso: false, erro: "Erro ao consultar alertas." },
          { status: 500 }
        );
      }

      const lote = (data ?? []) as Registro[];
      registros.push(...lote);

      if (lote.length < tamanhoPagina) break;
    }

    const hoje = new Date();
    const hojeTexto = dataBrasil(hoje);
    const amanha = new Date(
      hoje.getFullYear(),
      hoje.getMonth(),
      hoje.getDate() + 1
    );
    const amanhaTexto = dataBrasil(amanha);

    const alertas = registros.flatMap(registro => {
      const codigo = texto(registro.codigo_cliente);
      const cliente = clientesPermitidos.get(codigo);

      if (!cliente) return [];

      const data = texto(registro.data_proxima_acao).slice(0, 10);

      if (!data || data > amanhaTexto) return [];

      const tipo =
        data < hojeTexto
          ? "ATRASADA"
          : data === hojeTexto
          ? "HOJE"
          : "AMANHA";

      return [{
        codigoCliente: codigo,
        razaoSocial: cliente.razaoSocial,
        responsavel: texto(registro.responsavel),
        representante: cliente.representante,
        supervisor: cliente.supervisor,
        proximaAcao: texto(registro.proxima_acao),
        data,
        tipo
      }];
    });

const prioridade: Record<string, number> = {
  ATRASADA: 0,
  HOJE: 1,
  AMANHA: 2
};

    alertas.sort((a, b) =>
      prioridade[a.tipo] - prioridade[b.tipo] ||
      a.data.localeCompare(b.data) ||
      a.codigoCliente.localeCompare(b.codigoCliente)
    );

    return NextResponse.json(
      {
        sucesso: true,
        resumo: {
          atrasadas: alertas.filter(a => a.tipo === "ATRASADA").length,
          hoje: alertas.filter(a => a.tipo === "HOJE").length,
          amanha: alertas.filter(a => a.tipo === "AMANHA").length,
          total: alertas.length
        },
        alertas
      },
      {
        headers: {
          "Cache-Control": "private, no-store"
        }
      }
    );
  } catch (erro) {
    console.error("[ALERTAS REATIVACAO]", erro);
    return NextResponse.json(
      { sucesso: false, erro: "Erro interno nos alertas." },
      { status: 500 }
    );
  }
}