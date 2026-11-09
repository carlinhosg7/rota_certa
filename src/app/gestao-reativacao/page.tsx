import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validarToken } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { carregarCarteira2027 } from "@/lib/carteira-2027-data";
import { carregarMapaRepresentantes, normalizarRepresentante } from "@/lib/representantes-oficiais";
import Sidebar from "@/components/Sidebar";
import PainelGestaoReativacao from "@/components/PainelGestaoReativacao";
import CartaoTaxaReativacao from "@/components/CartaoTaxaReativacao";

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

  const [carteira, mapaOficial] = await Promise.all([
    carregarCarteira2027(),
    carregarMapaRepresentantes(),
  ]);

  const codigo = (v: unknown) => String(v ?? "").trim().replace(/\.0+$/, "");
  const vinculos = (cliente: (typeof carteira.clientes)[number]) => {
    const representantes = [...new Set(
      (cliente.representanteAtual ?? [])
        .map(r => normalizarRepresentante(codigo(r.codigo), mapaOficial).codigo)
        .filter(c => mapaOficial.cadastro.get(c)?.ativo)
    )];
    const supervisores = [...new Set(representantes
      .map(c => codigo(mapaOficial.cadastro.get(c)?.codigo_supervisor))
      .filter(Boolean))];
    return { representantes, supervisores };
  };

  const cadastroAutorizado = [...mapaOficial.cadastro.values()]
    .filter(r => r.ativo)
    .filter(r => perfil !== "REPRESENTANTE" || codigo(r.codigo_rep) === codigo(rep))
    .filter(r => perfil !== "SUPERVISOR" || codigo(r.codigo_supervisor) === codigo(sup));

  const supervisoresOficiais = [...new Map(cadastroAutorizado.map(r => [
    codigo(r.codigo_supervisor),
    { codigo: codigo(r.codigo_supervisor), nome: r.regional || codigo(r.codigo_supervisor) },
  ]).filter(([codigo]) => Boolean(codigo)) as Array<[string, { codigo: string; nome: string }]>).values()]
    .sort((a, b) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));

  const representantesOficiais = cadastroAutorizado.map(r => ({
    codigo: codigo(r.codigo_rep),
    nome: r.nome_rep || codigo(r.codigo_rep),
    supervisor: codigo(r.codigo_supervisor),
  })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const clientes = carteira.clientes.filter(cliente => {
    if (cliente.situacao !== "REATIVACAO") return false;
    if (cliente.situacaoEmpresa === "BAIXADA") return false;

    if (["ADMIN", "ADMINISTRADOR", "GERENTE"].includes(perfil)) {
      return true;
    }

    if (perfil === "REPRESENTANTE") {
      return Boolean(rep) && vinculos(cliente).representantes.includes(codigo(rep));
    }

    if (perfil === "SUPERVISOR") {
      return Boolean(sup) && vinculos(cliente).supervisores.includes(codigo(sup));
    }

    return false;
  });

  const registros = await carregarGestao();
  const mapa = new Map(registros.map(r => [texto(r.codigo_cliente), r]));

  const linhas = clientes.map(cliente => {
    const registro = mapa.get(texto(cliente.codigoCliente));
    const oficiais = vinculos(cliente);

    return {
      codigo: texto(cliente.codigoCliente),
      razaoSocial: cliente.razaoSocial ?? "",
      supervisorCodigos: oficiais.supervisores,
      representanteCodigos: oficiais.representantes,
      supervisor: oficiais.supervisores.map(c => {
        const r = supervisoresOficiais.find(x => x.codigo === c);
        return r ? `${c} - ${r.nome}` : c;
      }).join(", "),
      representante: oficiais.representantes.map(c => {
        const r = mapaOficial.cadastro.get(c);
        return r ? `${c} - ${r.nome_rep || c}` : c;
      }).join(", "),
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
        <CartaoTaxaReativacao supervisor={perfil === "SUPERVISOR" ? sup : ""} representante={perfil === "REPRESENTANTE" ? rep : ""} supervisoresGrupo="" />
        <PainelGestaoReativacao linhas={linhas} perfil={perfil} supervisoresOficiais={supervisoresOficiais} representantesOficiais={representantesOficiais} />
      </main>
    </div>
  );
}