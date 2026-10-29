import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validarToken } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { carregarCarteira2027 } from "@/lib/carteira-2027-data";
import Sidebar from "@/components/Sidebar";
import PainelGestaoReativacao from "@/components/PainelGestaoReativacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Registro = {
  codigo_cliente: string;
  classificacao: string | null;
  tentativas_contato: number | null;
  proxima_acao: string | null;
  data_proxima_acao: string | null;
  status_acao: string | null;
  responsavel: string | null;
};

const texto = (valor: unknown) => String(valor ?? "").trim();

async function carregarGestao(): Promise<Registro[]> {
  const todos: Registro[] = [];

  for (let inicio = 0; inicio < 100000; inicio += 1000) {
    const { data, error } = await supabase
      .from("kidy_gestao_reativacao")
      .select("codigo_cliente,classificacao,tentativas_contato,proxima_acao,data_proxima_acao,status_acao,responsavel")
      .order("codigo_cliente", { ascending: true })
      .range(inicio, inicio + 999);

    if (error) throw new Error(error.message);

    const lote = (data ?? []) as Registro[];
    todos.push(...lote);

    if (lote.length < 1000) return todos;
  }

  throw new Error("Limite de registros excedido.");
}

export default async function PaginaGestaoReativacao() {
  const token = (await cookies()).get("kidy_session")?.value;
  if (!token) redirect("/");

  let sessao: Awaited<ReturnType<typeof validarToken>>;

  try {
    sessao = await validarToken(token);
  } catch {
    redirect("/");
  }

  if (!sessao) redirect("/");

  const perfil = texto(sessao.perfil).toUpperCase();
  const rep = texto(sessao.codigo_representante);
  const sup = texto(sessao.codigo_supervisor);

  if (!["ADMIN", "ADMINISTRADOR", "GERENTE", "SUPERVISOR", "REPRESENTANTE"].includes(perfil)) {
    redirect("/dashboard");
  }

  const carteira = await carregarCarteira2027();

  const clientes = carteira.clientes.filter(cliente => {
    if (cliente.situacao !== "REATIVACAO") return false;
    if (cliente.situacaoEmpresa === "BAIXADA") return false;

    if (["ADMIN", "ADMINISTRADOR", "GERENTE"].includes(perfil)) {
      return true;
    }

    if (perfil === "REPRESENTANTE") {
      return Boolean(rep) && cliente.representanteAtual.some(
        r => texto(r.codigo) === rep
      );
    }

    if (perfil === "SUPERVISOR") {
      return Boolean(sup) && cliente.supervisores.some(
        s => texto(s.codigo) === sup
      );
    }

    return false;
  });

  const registros = await carregarGestao();
  const mapa = new Map(registros.map(r => [texto(r.codigo_cliente), r]));

  const linhas = clientes.map(cliente => {
    const registro = mapa.get(texto(cliente.codigoCliente));

    return {
      codigo: texto(cliente.codigoCliente),
      razaoSocial: cliente.razaoSocial ?? "",
      supervisor: cliente.supervisores.map(
        s => texto(s.nome || s.codigo)
      ).join(", "),
      representante: cliente.representanteAtual.map(
        r => texto(r.nome || r.codigo)
      ).join(", "),
      classificacao: registro?.classificacao ?? "NAO_INICIADO",
      tentativas: registro?.tentativas_contato ?? 0,
      proximaAcao: registro?.proxima_acao ?? "",
      dataProximaAcao: registro?.data_proxima_acao ?? "",
      statusAcao: registro?.status_acao ?? "",
      responsavel: registro?.responsavel ?? "",
    };
  });

  return (
    <div className="app-shell">
      <Sidebar
        nome={texto(sessao.nome)}
        perfil={perfil}
        usuario={texto(sessao.usuario)}
      />
      <main className="content">
        <PainelGestaoReativacao linhas={linhas} perfil={perfil} />
      </main>
    </div>
  );
}