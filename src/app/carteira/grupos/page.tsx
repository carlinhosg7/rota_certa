import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validarToken } from "@/lib/auth";
import { getData, cleanCode } from "@/lib/comercial-data";
import Sidebar from "@/components/Sidebar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Vinculo = {
  codigo: string;
  nome: string;
};

type Cliente = {
  codigoCliente?: string | number;
  razaoSocial?: string;
  cnpj?: string;
  grupoCliente?: string;
  carteira?: string;
  situacao?: string;
  faixa?: string;
  ultimaCompra?: string;
  representantes?: Vinculo[];
  supervisores?: Vinculo[];
  bloqueadoFinanceiro?: boolean;
  limiteDisponivel?: number;
};

type Grupo = {
  chave: string;
  nome: string;
  clientes: Cliente[];
};

type Props = {
  searchParams: Promise<{
    busca?: string;
    grupo?: string;
    pagina?: string;
    supervisor?: string;
    representante?: string;
    filtro?: string;
    filtroCliente?: string;
  }>;
};

const cores = {
  laranja: "#f28c00",
  escuro: "#3d2300",
  texto: "#68421f",
  fundo: "#fffaf3",
  borda: "#f0c88f",
  verde: "#15803d",
  vermelho: "#b91c1c",
};

const painel: React.CSSProperties = {
  background: "#fffdf9",
  border: `1px solid ${cores.borda}`,
  borderRadius: 18,
  padding: 22,
  marginBottom: 18,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "13px 12px",
  color: "#89551f",
  fontSize: 11,
  borderBottom: `1px solid ${cores.borda}`,
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid #f3e5d2",
  fontSize: 12,
  verticalAlign: "top",
};

function texto(v: unknown): string {
  return String(v ?? "").trim();
}

function codigo(v: unknown): string {
  return texto(v).replace(/\.0+$/, "");
}

function normalizar(v: unknown): string {
  return texto(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function numero(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(v || 0);
}

function moeda(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v || 0);
}

function percentual(parte: number, total: number): string {
  return total > 0
    ? `${(parte / total * 100).toFixed(1).replace(".", ",")}%`
    : "0,0%";
}

function dataBR(v: unknown): string {
  const s = texto(v);
  if (!s) return "Sem histórico";

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
  }

  return s;
}

function formatarCNPJ(v: unknown): string {
  const digitos = String(v ?? "").replace(/\D/g, "");

  if (digitos.length !== 14) {
    return digitos || "Não informado";
  }

  return digitos.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5"
  );
}
function status(c: Cliente): string {
  if (c.situacao === "PENDENTE_QUALIFICACAO") return "Pendente";
  if (c.carteira === "01_ATIVA" || c.situacao === "ATIVA") return "Ativa";
  if (c.carteira === "02_REATIVACAO" || c.situacao === "REATIVACAO") {
    return "Reativação";
  }
  return "A validar";
}

function Cartao({
  titulo,
  valor,
  detalhe,
}: {
  titulo: string;
  valor: string;
  detalhe?: string;
}) {
  return (
    <div style={{
      background: "#fffdf9",
      border: `1px solid ${cores.borda}`,
      borderRadius: 16,
      padding: 19,
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        color: "#9c6630",
        textTransform: "uppercase",
        marginBottom: 10,
      }}>
        {titulo}
      </div>
      <div style={{
        fontSize: 25,
        fontWeight: 900,
        color: cores.escuro,
        overflowWrap: "anywhere",
      }}>
        {valor}
      </div>
      {detalhe && (
        <div style={{ fontSize: 11, color: "#986c3f", marginTop: 7 }}>
          {detalhe}
        </div>
      )}
    </div>
  );
}

function TituloSecao({
  numeroSecao,
  titulo,
}: {
  numeroSecao: string;
  titulo: string;
}) {
  return (
    <h2 style={{
      display: "flex",
      alignItems: "center",
      gap: 11,
      color: cores.escuro,
      fontSize: 19,
      margin: "0 0 20px",
    }}>
      <span style={{
        background: "#ffad35",
        borderRadius: "50%",
        width: 32,
        height: 32,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 900,
      }}>
        {numeroSecao}
      </span>
      {titulo}
    </h2>
  );
}

export default async function VisaoGrupos({ searchParams }: Props) {
  const token = (await cookies()).get("kidy_session")?.value;
  if (!token) redirect("/");

  const usuarioAutenticado = await validarToken(token);
  if (!usuarioAutenticado) redirect("/");

  const perfil = texto(usuarioAutenticado.perfil).toUpperCase();
  const usuario = texto(usuarioAutenticado.usuario);
  const nome = texto(usuarioAutenticado.nome) || usuario;
  const repLogin = codigo(
    usuarioAutenticado.codigo_representante || usuarioAutenticado.usuario
  );
  const supLogin = codigo(usuarioAutenticado.codigo_supervisor);

  const params = await searchParams;
  const busca = texto(params.busca).slice(0, 100);
  const grupoSelecionado = texto(params.grupo);

  const arquivo = path.join(
    process.cwd(),
    "dados-processados",
    "carteira-2027",
    "clientes.json"
  );

  let clientes: Cliente[] = [];
  let erro = "";

  try {
    clientes = JSON.parse(await fs.readFile(arquivo, "utf8"));
  } catch {
    erro = "Base de carteira indisponível no servidor.";
  }

  // Permissões aplicadas ANTES de agrupar.
  if (perfil === "REPRESENTANTE") {
    clientes = clientes.filter(c =>
      c.representantes?.some(r => codigo(r.codigo) === repLogin)
    );
  } else if (perfil === "SUPERVISOR") {
    clientes = clientes.filter(c =>
      c.supervisores?.some(s => codigo(s.codigo) === supLogin)
    );
  } else if (!["ADMIN", "ADMINISTRADOR", "GERENTE"].includes(perfil)) {
    clientes = [];
    erro = "Perfil sem permissão para consultar grupos.";
  }

  const mapa = new Map<string, Grupo>();

  for (const cliente of clientes) {
    const nomeGrupo = texto(cliente.grupoCliente);
    if (!nomeGrupo) continue;

    const chave = nomeGrupo;
    let grupo = mapa.get(chave);

    if (!grupo) {
      grupo = { chave, nome: nomeGrupo, clientes: [] };
      mapa.set(chave, grupo);
    }

    grupo.clientes.push(cliente);
  }

  const grupos = [...mapa.values()].sort(
    (a, b) =>
      b.clientes.length - a.clientes.length ||
      a.nome.localeCompare(b.nome, "pt-BR")
  );

  // Painel gerencial por Grupo Cliente distinto.
  // Data de referencia: hoje no horario de Brasilia.
  const dataReferencia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const [anoRef, mesRef, diaRef] = dataReferencia.split("-").map(Number);
  const referenciaUTC = new Date(Date.UTC(anoRef, mesRef - 1, diaRef));

  const corteUTC = new Date(referenciaUTC);
  corteUTC.setUTCFullYear(corteUTC.getUTCFullYear() - 2);

  function mesesDesdeCompra(valor: unknown): number | null {
    const data = texto(valor).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return null;

    const [ano, mes, dia] = data.split("-").map(Number);
    const compra = new Date(Date.UTC(ano, mes - 1, dia));

    if (
      compra.getUTCFullYear() !== ano ||
      compra.getUTCMonth() !== mes - 1 ||
      compra.getUTCDate() !== dia
    ) return null;

    let meses = (anoRef - ano) * 12 + mesRef - mes;
    if (diaRef < dia) meses--;
    return Math.max(0, meses);
  }

  type SituacaoGrupo = "ATIVA" | "REATIVACAO" | "PENDENTE";

  function situacaoGrupo(g: Grupo): SituacaoGrupo {
    let temData = false;

    for (const c of g.clientes) {
      const data = texto(c.ultimaCompra).slice(0, 10);
      const meses = mesesDesdeCompra(data);

      if (meses === null) continue;

      temData = true;

      // Regra de 24 meses: compara a data, nao apenas o mes.
      if (data >= corteUTC.toISOString().slice(0, 10)) {
        return "ATIVA";
      }
    }

    return temData ? "REATIVACAO" : "PENDENTE";
  }

  function faixaGrupo(g: Grupo): string {
    const datas = g.clientes
      .map(c => texto(c.ultimaCompra).slice(0, 10))
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort();

    const ultima = datas.at(-1);
    const meses = mesesDesdeCompra(ultima);

    if (meses === null) return "PENDENTE";
    if (meses <= 24) return "ATIVA";
    if (meses <= 36) return "25_36";
    if (meses <= 60) return "37_60";
    return "ACIMA_60";
  }

  const supervisorFiltro = codigo(params.supervisor);
  const representanteFiltro = codigo(params.representante);

  // Opcoes respeitam a carteira permitida ao usuario autenticado.
  const opcoesSupervisores = new Map<string, string>();
  const opcoesRepresentantes = new Map<string, string>();

  for (const c of clientes) {
    for (const s of c.supervisores || []) {
      const id = codigo(s.codigo);
      if (id) opcoesSupervisores.set(id, texto(s.nome) || id);
    }
    for (const r of c.representantes || []) {
      const id = codigo(r.codigo);
      if (id) opcoesRepresentantes.set(id, texto(r.nome) || id);
    }
  }

  const gruposPainel = grupos
    .map(g => ({
      ...g,
      clientes: g.clientes.filter(c =>
        (!supervisorFiltro || c.supervisores?.some(
          s => codigo(s.codigo) === supervisorFiltro
        )) &&
        (!representanteFiltro || c.representantes?.some(
          r => codigo(r.codigo) === representanteFiltro
        ))
      ),
    }))
    .filter(g => g.clientes.length > 0);

  const totalGruposPainel = gruposPainel.length;

  const gruposAtivos = gruposPainel.filter(
    g => situacaoGrupo(g) === "ATIVA"
  ).length;

  const gruposReativacao = gruposPainel.filter(
    g => situacaoGrupo(g) === "REATIVACAO"
  ).length;

  const gruposPendentes = gruposPainel.filter(
    g => situacaoGrupo(g) === "PENDENTE"
  ).length;

  const gruposBloqueados = gruposPainel.filter(
    g => g.clientes.some(c => c.bloqueadoFinanceiro)
  ).length;

  const gruposComLimite = gruposPainel.filter(
    g => g.clientes.some(c => Number(c.limiteDisponivel) > 0)
  ).length;

  const grupos25a36 = gruposPainel.filter(
    g => situacaoGrupo(g) === "REATIVACAO" && faixaGrupo(g) === "25_36"
  ).length;

  const grupos37a60 = gruposPainel.filter(
    g => situacaoGrupo(g) === "REATIVACAO" && faixaGrupo(g) === "37_60"
  ).length;

  const gruposAcima60 = gruposPainel.filter(
    g => situacaoGrupo(g) === "REATIVACAO" && faixaGrupo(g) === "ACIMA_60"
  ).length;

  const pctGrupo = (valor: number) =>
    totalGruposPainel
      ? (valor / totalGruposPainel * 100).toFixed(1).replace(".", ",") + "%"
      : "0,0%";
  const filtrosPermitidos = new Set([
    "todos", "ativa", "reativacao", "pendente",
    "bloqueio", "limite", "25_36", "37_60", "acima_60"
  ]);

  const filtroSolicitado = texto(params.filtro);
  const filtroGrupo = filtrosPermitidos.has(filtroSolicitado)
    ? filtroSolicitado
    : "todos";

  function correspondeFiltro(g: Grupo): boolean {
    switch (filtroGrupo) {
      case "ativa":
        return situacaoGrupo(g) === "ATIVA";
      case "reativacao":
        return situacaoGrupo(g) === "REATIVACAO";
      case "pendente":
        return situacaoGrupo(g) === "PENDENTE";
      case "bloqueio":
        return g.clientes.some(c => c.bloqueadoFinanceiro);
      case "limite":
        return g.clientes.some(c => Number(c.limiteDisponivel) > 0);
      case "25_36":
        return situacaoGrupo(g) === "REATIVACAO" && faixaGrupo(g) === "25_36";
      case "37_60":
        return situacaoGrupo(g) === "REATIVACAO" && faixaGrupo(g) === "37_60";
      case "acima_60":
        return situacaoGrupo(g) === "REATIVACAO" && faixaGrupo(g) === "ACIMA_60";
      default:
        return true;
    }
  }

  function linkFiltro(filtro: string): string {
    const q = new URLSearchParams();

    if (supervisorFiltro) q.set("supervisor", supervisorFiltro);
    if (representanteFiltro) q.set("representante", representanteFiltro);
    if (busca) q.set("busca", busca);

    if (filtro !== "todos") q.set("filtro", filtro);

    return `/carteira/grupos?${q.toString()}#lista-grupos`;
  }

  const titulosFiltro: Record<string, string> = {
    todos: "Todos os grupos",
    ativa: "Grupos ativos",
    reativacao: "Grupos em reativação",
    pendente: "Grupos pendentes de qualificação",
    bloqueio: "Grupos com bloqueio financeiro",
    limite: "Grupos com limite disponível",
    "25_36": "Reativação de 25 a 36 meses",
    "37_60": "Reativação de 37 a 60 meses",
    acima_60: "Reativação acima de 60 meses",
  };
  const gruposFiltrados = busca
    ? gruposPainel.filter(g => correspondeFiltro(g) && normalizar(g.nome).includes(normalizar(busca)))
    : gruposPainel.filter(correspondeFiltro);

  const grupoAtual = grupoSelecionado
    ? mapa.get(grupoSelecionado)
    : undefined;

  const totalAgrupados = grupos.reduce(
    (s, g) => s + g.clientes.length, 0
  );

  const paginaSolicitada = Number(params.pagina || 1);
  const paginas = Math.max(1, Math.ceil(gruposFiltrados.length / 40));
  const pagina = Number.isFinite(paginaSolicitada)
    ? Math.max(1, Math.min(paginas, Math.trunc(paginaSolicitada)))
    : 1;

  const exibidos = gruposFiltrados.slice(
    (pagina - 1) * 40,
    pagina * 40
  );

  function urlPagina(p: number) {
    const q = new URLSearchParams();
    if (busca) q.set("busca", busca);
    if (supervisorFiltro) q.set("supervisor", supervisorFiltro);
    if (representanteFiltro) q.set("representante", representanteFiltro);
    if (filtroGrupo !== "todos") q.set("filtro", filtroGrupo);
    q.set("pagina", String(p));
    return `/carteira/grupos?${q}`;
  }

  // Histórico comercial só é carregado ao abrir um grupo.
  // A listagem inicial permanece leve.
  let vendasGrupo: {
    codigo: string;
    data: Date | null;
    qtd: number;
    vlr: number;
    codigoLinha: string;
    linha: string;
    referencia: string;
    numeroPedido: string;
  }[] = [];

  if (grupoAtual && !erro) {
    const codigos = new Set(
      grupoAtual.clientes.map(c => cleanCode(codigo(c.codigoCliente)))
    );

    const dados = await getData();

    vendasGrupo = dados.vendas
      .filter(v => codigos.has(cleanCode(v.codigo)))
      .map(v => ({
        codigo: cleanCode(v.codigo),
        data: v.data,
        qtd: Number(v.qtd) || 0,
        vlr: Number(v.vlr) || 0,
        codigoLinha: texto(v.codigoLinha),
        linha: texto(v.linha),
        referencia: texto(v.referencia),
        numeroPedido: texto(v.numeroPedido),
      }));
  }

  const empresas = grupoAtual?.clientes || [];
  const ativas = empresas.filter(c => status(c) === "Ativa").length;
  const reativacao = empresas.filter(c => status(c) === "Reativação").length;
  const pendentes = empresas.filter(c => status(c) === "Pendente").length;
  const bloqueadas = empresas.filter(c => c.bloqueadoFinanceiro).length;
  const comLimite = empresas.filter(c => Number(c.limiteDisponivel) > 0).length;

  const limiteTotal = empresas.reduce(
    (s, c) => s + (Number(c.limiteDisponivel) || 0), 0
  );

  const hoje = new Date();
  const inicioAno = new Date(hoje.getFullYear(), 0, 1);

  const vendasAno = vendasGrupo.filter(
    v => v.data && v.data >= inicioAno && v.data <= hoje
  );

  const valorAno = vendasAno.reduce((s, v) => s + v.vlr, 0);
  const paresAno = vendasAno.reduce((s, v) => s + v.qtd, 0);
  const valorHistorico = vendasGrupo.reduce((s, v) => s + v.vlr, 0);
  const paresHistorico = vendasGrupo.reduce((s, v) => s + v.qtd, 0);

  const pedidos = new Set(
    vendasGrupo
      .filter(v => v.numeroPedido)
      .map(v => `${v.codigo}|${v.numeroPedido}`)
  ).size;

  const compradoresAno = new Set(
    vendasAno.map(v => v.codigo)
  ).size;

  const ultimaCompraGrupo = vendasGrupo.reduce<Date | null>(
    (ultima, v) =>
      v.data && (!ultima || v.data > ultima) ? v.data : ultima,
    null
  );

  type Linha = {
    nome: string;
    codigo: string;
    pares: number;
    valor: number;
    clientes: Set<string>;
    pedidos: Set<string>;
    ultima: Date | null;
  };

  const mapaLinhas = new Map<string, Linha>();

  for (const venda of vendasGrupo) {
    const chave = venda.codigoLinha || venda.linha || "SEM LINHA";
    const linha = mapaLinhas.get(chave) || {
      nome: venda.linha || `Linha ${chave}`,
      codigo: venda.codigoLinha,
      pares: 0,
      valor: 0,
      clientes: new Set<string>(),
      pedidos: new Set<string>(),
      ultima: null,
    };

    linha.pares += venda.qtd;
    linha.valor += venda.vlr;
    linha.clientes.add(venda.codigo);

    if (venda.numeroPedido) {
      linha.pedidos.add(`${venda.codigo}|${venda.numeroPedido}`);
    }

    if (venda.data && (!linha.ultima || venda.data > linha.ultima)) {
      linha.ultima = venda.data;
    }

    mapaLinhas.set(chave, linha);
  }

  const linhas = [...mapaLinhas.values()].sort(
    (a, b) => b.valor - a.valor
  );

  const referencias = new Map<string, {
    referencia: string;
    linha: string;
    pares: number;
    valor: number;
    ultima: Date | null;
  }>();

  for (const venda of vendasGrupo) {
    if (!venda.referencia) continue;

    const chave = `${venda.referencia}|${venda.codigoLinha}`;
    const ref = referencias.get(chave) || {
      referencia: venda.referencia,
      linha: venda.linha || venda.codigoLinha,
      pares: 0,
      valor: 0,
      ultima: null,
    };

    ref.pares += venda.qtd;
    ref.valor += venda.vlr;

    if (venda.data && (!ref.ultima || venda.data > ref.ultima)) {
      ref.ultima = venda.data;
    }

    referencias.set(chave, ref);
  }

  const topReferencias = [...referencias.values()]
    .sort((a, b) => b.pares - a.pares)
    .slice(0, 12);

  const faixa25 = empresas.filter(c => c.faixa === "25_A_36_MESES").length;
  const faixa37 = empresas.filter(c => c.faixa === "37_A_60_MESES").length;
  const faixa60 = empresas.filter(c => c.faixa === "ACIMA_60_MESES").length;

  const filtrosClientePermitidos = new Set([
    "todos", "ativa", "reativacao", "pendente", "bloqueio", "limite"
  ]);

  const filtroClienteSolicitado = texto(params.filtroCliente);

  const filtroCliente = filtrosClientePermitidos.has(filtroClienteSolicitado)
    ? filtroClienteSolicitado
    : "todos";

  function correspondeFiltroCliente(c: Cliente): boolean {
    switch (filtroCliente) {
      case "ativa":
        return status(c) === "Ativa";
      case "reativacao":
        return status(c) === "Reativação";
      case "pendente":
        return status(c) === "Pendente";
      case "bloqueio":
        return Boolean(c.bloqueadoFinanceiro);
      case "limite":
        return Number(c.limiteDisponivel) > 0;
      default:
        return true;
    }
  }

  function linkFiltroCliente(filtro: string): string {
    const q = new URLSearchParams();

    if (grupoSelecionado) q.set("grupo", grupoSelecionado);
    if (supervisorFiltro) q.set("supervisor", supervisorFiltro);
    if (representanteFiltro) q.set("representante", representanteFiltro);

    if (filtro !== "todos") q.set("filtroCliente", filtro);

    return `/carteira/grupos?${q.toString()}#clientes-do-grupo`;
  }

  const titulosFiltroCliente: Record<string, string> = {
    todos: "Todos os clientes do grupo",
    ativa: "Clientes da Carteira Ativa",
    reativacao: "Clientes em Reativação",
    pendente: "Clientes Pendentes",
    bloqueio: "Clientes com Bloqueio Financeiro",
    limite: "Clientes com Limite Disponível",
  };
  const empresasOrdenadas = empresas.filter(correspondeFiltroCliente).sort(
    (a, b) =>
      status(a).localeCompare(status(b), "pt-BR") ||
      texto(a.razaoSocial).localeCompare(texto(b.razaoSocial), "pt-BR")
  );

  const linkGrupo = (g: Grupo) =>
    `/carteira/grupos?grupo=${encodeURIComponent(g.chave)}`;

  return (
    <div className="app-shell">
      <Sidebar nome={nome} perfil={perfil} usuario={usuario} />

      <main className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">CARTEIRA KIDY 2027</span>
            <h1>Inteligência por Grupo Cliente</h1>
            <p>Visão consolidada de empresas e oportunidades comerciais</p>
          </div>
        </header>

        <div style={{
          padding: "24px 0 50px",
          color: cores.escuro,
        }}>
          <Link
            href="/carteira"
            style={{ color: "#c86400", fontWeight: 800 }}
          >
            ← Voltar à Gestão de Carteira
          </Link>

          <p style={{
            background: "#fff3df",
            border: "1px solid #f0c88f",
            padding: 13,
            borderRadius: 11,
            fontSize: 12,
            margin: "20px 0",
          }}>
            Carteira classificada provisoriamente até confirmação
            de compra faturada. Empresas são identificadas por
            Código Cliente. Indicadores de vendas refletem o
            histórico comercial disponível na Visão 360º.
          </p>

          {erro ? (
            <section style={painel}>{erro}</section>
          ) : !grupoAtual ? (
            <>
              <>
  <section style={painel}>
    <div style={{ fontSize: 12, color: "#92400e", marginBottom: 16 }}>
      Classificação provisória até confirmação de compra faturada.
      Referência: {dataReferencia.split("-").reverse().join("/")}.
      Corte de 24 meses: {corteUTC.toISOString().slice(0, 10).split("-").reverse().join("/")}.
    </div>

    <form method="GET" action="/carteira/grupos"
      style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>

      <label style={{ flex: "1 1 220px", fontSize: 12 }}>
        Supervisor
        <select name="supervisor" defaultValue={supervisorFiltro}
          style={{ display: "block", width: "100%", padding: 11, marginTop: 6 }}>
          <option value="">Todos</option>
          {[...opcoesSupervisores.entries()].sort((a,b) =>
            a[1].localeCompare(b[1], "pt-BR")
          ).map(([id, nome]) => (
            <option key={id} value={id}>{nome}</option>
          ))}
        </select>
      </label>

      <label style={{ flex: "1 1 220px", fontSize: 12 }}>
        Representante
        <select name="representante" defaultValue={representanteFiltro}
          style={{ display: "block", width: "100%", padding: 11, marginTop: 6 }}>
          <option value="">Todos</option>
          {[...opcoesRepresentantes.entries()].sort((a,b) =>
            a[1].localeCompare(b[1], "pt-BR")
          ).map(([id, nome]) => (
            <option key={id} value={id}>{nome}</option>
          ))}
        </select>
      </label>

      <button type="submit" style={{
        padding: "12px 18px", background: "#f28c00",
        color: "#fff", border: 0, borderRadius: 8, fontWeight: 800
      }}>Aplicar filtros</button>

      <Link href="/carteira/grupos" style={{ padding: 12 }}>
        Limpar
      </Link>
    </form>
  </section>

  <div style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))",
    gap: 12,
    marginBottom: 18
  }}>
    <Link href={linkFiltro("todos")} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
<Cartao titulo="Grupos na carteira"
      valor={numero(totalGruposPainel)} detalhe="Grupo Cliente distinto" />
</Link>
    <Link href={linkFiltro("ativa")} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
<Cartao titulo="Carteira 01 — Ativa"
      valor={numero(gruposAtivos)} detalhe={pctGrupo(gruposAtivos)} />
</Link>
    <Link href={linkFiltro("reativacao")} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
<Cartao titulo="Carteira 02 — Reativação"
      valor={numero(gruposReativacao)} detalhe={pctGrupo(gruposReativacao)} />
</Link>
    <Link href={linkFiltro("pendente")} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
<Cartao titulo="Pendentes de qualificação"
      valor={numero(gruposPendentes)} detalhe="Sem última compra válida" />
</Link>
    <Link href={linkFiltro("bloqueio")} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
<Cartao titulo="Bloqueio financeiro"
      valor={numero(gruposBloqueados)} detalhe="Grupos com bloqueio" />
</Link>
    <Link href={linkFiltro("limite")} style={{ textDecoration: "none", color: "inherit", display: "block" }}>
<Cartao titulo="Com limite disponível"
      valor={numero(gruposComLimite)} detalhe="Grupos com limite positivo" />
</Link>
  </div>

  <section style={painel}>
    <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>
      Distribuição da carteira por Grupo Cliente
    </h2>
    <p style={{ fontSize: 12, color: "#64748b" }}>
      Cada Grupo Cliente é contado uma única vez.
    </p>

    <div style={{
      display: "flex", height: 18, borderRadius: 9,
      overflow: "hidden", background: "#e5e7eb", marginTop: 16
    }}>
      <div style={{
        width: pctGrupo(gruposAtivos).replace(",", "."),
        background: "#16a34a"
      }} />
      <div style={{
        width: pctGrupo(gruposReativacao).replace(",", "."),
        background: "#f59e0b"
      }} />
      <div style={{
        width: pctGrupo(gruposPendentes).replace(",", "."),
        background: "#8b5cf6"
      }} />
    </div>

    <p style={{ fontSize: 12, marginTop: 12 }}>
      Ativa: {numero(gruposAtivos)} ({pctGrupo(gruposAtivos)})
      {" · "}Reativação: {numero(gruposReativacao)} ({pctGrupo(gruposReativacao)})
      {" · "}Pendente: {numero(gruposPendentes)}
    </p>
  </section>

  <section style={painel}>
    <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>
      Prioridades de reativação
    </h2>

    {[
      { titulo: "25 a 36 meses", filtro: "25_36", total: grupos25a36, cor: "#f59e0b" },
      { titulo: "37 a 60 meses", filtro: "37_60", total: grupos37a60, cor: "#ea580c" },
      { titulo: "Acima de 60 meses", filtro: "acima_60", total: gruposAcima60, cor: "#b91c1c" }
    ].map(f => (
      <Link key={f.titulo} href={linkFiltro(f.filtro)} style={{ display: "block", marginBottom: 18, textDecoration: "none", color: "inherit" }}>
        <div style={{
          display: "flex", justifyContent: "space-between",
          fontSize: 13, fontWeight: 700, marginBottom: 7
        }}>
          <span>{f.titulo}</span>
          <span>{numero(f.total)} grupos</span>
        </div>
        <div style={{
          height: 9, borderRadius: 9, background: "#f1f5f9",
          overflow: "hidden"
        }}>
          <div style={{
            width: gruposReativacao
              ? `${f.total / gruposReativacao * 100}%`
              : "0%",
            height: "100%", background: f.cor
          }} />
        </div>
      </Link>
    ))}
  </section>
</>

              <section style={painel}>
                <TituloSecao
                  numeroSecao="01"
                  titulo="Pesquisar grupos"
                />

                <form
                  method="GET"
                  action="/carteira/grupos"
                  style={{ display: "flex", gap: 12 }}
                >
                  <input type="hidden" name="supervisor" value={supervisorFiltro} />
                  <input type="hidden" name="representante" value={representanteFiltro} />
                  <input type="hidden" name="filtro" value={filtroGrupo} />
                  <input
                    name="busca"
                    defaultValue={busca}
                    placeholder="Digite o nome do Grupo Cliente"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: 13,
                      borderRadius: 9,
                      border: `1px solid ${cores.borda}`,
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      background: cores.laranja,
                      color: "#fff",
                      border: 0,
                      borderRadius: 9,
                      padding: "12px 22px",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    Pesquisar
                  </button>
                </form>
              </section>

              <section id="lista-grupos" style={painel}>
                <TituloSecao
                  numeroSecao="02"
                  titulo={titulosFiltro[filtroGrupo]}
                />

                <div style={{ overflowX: "auto" }}>
                  <table style={{
                    width: "100%",
                    borderCollapse: "collapse",
                  }}>
                    <thead>
                      <tr>
                        {[
                          "Grupo Cliente",
                          "Empresas",
                          "Ativas",
                          "Reativação",
                          "Bloqueadas",
                          "Com limite",
                          "Análise",
                        ].map(t => <th key={t} style={th}>{t}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {exibidos.map(g => (
                        <tr key={g.chave}>
                          <td style={{ ...td, fontWeight: 800 }}>{g.nome}</td>
                          <td style={td}>{numero(g.clientes.length)}</td>
                          <td style={td}>
                            {numero(g.clientes.filter(c => status(c) === "Ativa").length)}
                          </td>
                          <td style={td}>
                            {numero(g.clientes.filter(c => status(c) === "Reativação").length)}
                          </td>
                          <td style={td}>
                            {numero(g.clientes.filter(c => c.bloqueadoFinanceiro).length)}
                          </td>
                          <td style={td}>
                            {numero(g.clientes.filter(c => Number(c.limiteDisponivel) > 0).length)}
                          </td>
                          <td style={td}>
                            <Link
                              href={linkGrupo(g)}
                              style={{ color: "#c86400", fontWeight: 800 }}
                            >
                              Abrir 360º →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 12,
                  marginTop: 22,
                  fontSize: 12,
                }}>
                  <span>
                    {numero(gruposFiltrados.length)} grupos ·
                    Página {pagina} de {paginas}
                  </span>
                  <div style={{ display: "flex", gap: 20 }}>
                    {pagina > 1 && (
                      <Link href={urlPagina(pagina - 1)}>← Anterior</Link>
                    )}
                    {pagina < paginas && (
                      <Link href={urlPagina(pagina + 1)}>Próxima →</Link>
                    )}
                  </div>
                </div>
              </section>
            </>
          ) : (
            <>
              <Link
                href="/carteira/grupos"
                style={{
                  display: "inline-block",
                  margin: "0 0 16px",
                  color: "#c86400",
                  fontWeight: 800,
                }}
              >
                ← Todos os grupos
              </Link>

              <section style={{
                background: "linear-gradient(135deg,#f57c00,#ffa32c)",
                borderRadius: 20,
                padding: "28px 32px",
                color: "#fff",
                marginBottom: 20,
              }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: 2,
                  marginBottom: 9,
                }}>
                  VISÃO 360º DO GRUPO CLIENTE
                </div>
                <h2 style={{
                  fontSize: 29,
                  margin: "0 0 10px",
                  color: "#fff",
                }}>
                  {grupoAtual.nome}
                </h2>
                <div>
                  {numero(empresas.length)} empresas vinculadas ·
                  {` ${numero(compradoresAno)} compradores no ano`}
                </div>
              </section>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
                gap: 13,
                marginBottom: 20,
              }}>
                <Link
  href={linkFiltroCliente("todos")}
  style={{
    display: "block",
    textDecoration: "none",
    color: "inherit",
    cursor: "pointer"
  }}
>
<Cartao titulo="Empresas" valor={numero(empresas.length)} />
</Link>
                <Link
  href={linkFiltroCliente("ativa")}
  style={{
    display: "block",
    textDecoration: "none",
    color: "inherit",
    cursor: "pointer"
  }}
>
<Cartao
                  titulo="Carteira ativa"
                  valor={numero(ativas)}
                  detalhe={percentual(ativas, empresas.length)}
                />
</Link>
                <Link
  href={linkFiltroCliente("reativacao")}
  style={{
    display: "block",
    textDecoration: "none",
    color: "inherit",
    cursor: "pointer"
  }}
>
<Cartao
                  titulo="Reativação"
                  valor={numero(reativacao)}
                  detalhe={percentual(reativacao, empresas.length)}
                />
</Link>
                <Link
  href={linkFiltroCliente("pendente")}
  style={{
    display: "block",
    textDecoration: "none",
    color: "inherit",
    cursor: "pointer"
  }}
>
<Cartao
                  titulo="Pendentes"
                  valor={numero(pendentes)}
                />
</Link>
                <Link
  href={linkFiltroCliente("bloqueio")}
  style={{
    display: "block",
    textDecoration: "none",
    color: "inherit",
    cursor: "pointer"
  }}
>
<Cartao
                  titulo="Bloqueadas"
                  valor={numero(bloqueadas)}
                  detalhe={percentual(bloqueadas, empresas.length)}
                />
</Link>
                <Link
  href={linkFiltroCliente("limite")}
  style={{
    display: "block",
    textDecoration: "none",
    color: "inherit",
    cursor: "pointer"
  }}
>
<Cartao
                  titulo="Com limite"
                  valor={numero(comLimite)}
                  detalhe={`Limite somado: ${moeda(limiteTotal)}`}
                />
</Link>
              </div>

              <section style={painel}>
                <TituloSecao
                  numeroSecao="01"
                  titulo="Histórico comercial consolidado"
                />

                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
                  gap: 12,
                }}>
                  <Cartao titulo="Pares no ano" valor={numero(paresAno)} />
                  <Cartao titulo="Valor no ano" valor={moeda(valorAno)} />
                  <Cartao titulo="Pares históricos" valor={numero(paresHistorico)} />
                  <Cartao titulo="Valor histórico" valor={moeda(valorHistorico)} />
                  <Cartao titulo="Pedidos históricos" valor={numero(pedidos)} />
                  <Cartao
                    titulo="Última compra no histórico"
                    valor={ultimaCompraGrupo
                      ? ultimaCompraGrupo.toLocaleDateString("pt-BR")
                      : "Sem histórico"}
                  />
                </div>
              </section>

              <section id="lista-grupos" style={painel}>
                <TituloSecao
                  numeroSecao="02"
                  titulo="Prioridades de reativação"
                />

                {[
                  ["25 a 36 meses", faixa25],
                  ["37 a 60 meses", faixa37],
                  ["Acima de 60 meses", faixa60],
                ].map(([faixa, quantidade]) => (
                  <div key={String(faixa)} style={{ marginBottom: 17 }}>
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 7,
                      fontSize: 13,
                      fontWeight: 800,
                    }}>
                      <span>{faixa}</span>
                      <span>{numero(Number(quantidade))}</span>
                    </div>
                    <div style={{
                      height: 10,
                      background: "#f2e7d8",
                      borderRadius: 10,
                      overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%",
                        background: cores.laranja,
                        width: `${reativacao
                          ? Number(quantidade) / reativacao * 100
                          : 0}%`,
                      }} />
                    </div>
                  </div>
                ))}
              </section>

              <section style={painel}>
                <TituloSecao
                  numeroSecao="03"
                  titulo="Mix de produtos do grupo"
                />

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {[
                          "Linha",
                          "Empresas compradoras",
                          "Pares",
                          "Valor",
                          "Pedidos",
                          "Última compra",
                        ].map(t => <th key={t} style={th}>{t}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {linhas.slice(0, 15).map(l => (
                        <tr key={l.codigo || l.nome}>
                          <td style={{ ...td, fontWeight: 800 }}>{l.nome}</td>
                          <td style={td}>{numero(l.clientes.size)}</td>
                          <td style={td}>{numero(l.pares)}</td>
                          <td style={td}>{moeda(l.valor)}</td>
                          <td style={td}>{numero(l.pedidos.size)}</td>
                          <td style={td}>
                            {l.ultima
                              ? l.ultima.toLocaleDateString("pt-BR")
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!linhas.length && <p>Sem histórico de mix disponível.</p>}
                </div>
              </section>

              <section style={painel}>
                <TituloSecao
                  numeroSecao="04"
                  titulo="Oportunidades comerciais"
                />

                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
                  gap: 13,
                }}>
                  <Cartao
                    titulo="Empresas a reativar"
                    valor={numero(reativacao)}
                    detalhe="Priorizar contato e qualificação"
                  />
                  <Cartao
                    titulo="Empresas com limite disponível"
                    valor={numero(comLimite)}
                    detalhe="Validar demanda e condição comercial"
                  />
                  <Cartao
                    titulo="Empresas sem compra no ano"
                    valor={numero(Math.max(0, empresas.length - compradoresAno))}
                    detalhe="Conforme histórico comercial carregado"
                  />
                  <Cartao
                    titulo="Empresas com bloqueio"
                    valor={numero(bloqueadas)}
                    detalhe="Verificar situação financeira antes da negociação"
                  />
                </div>

                <p style={{
                  fontSize: 12,
                  color: cores.texto,
                  marginTop: 15,
                }}>
                  Estas são oportunidades operacionais identificadas
                  por regras comerciais, não previsões estatísticas.
                </p>
              </section>

              <section style={painel}>
                <TituloSecao
                  numeroSecao="05"
                  titulo="Referências mais compradas"
                />

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {[
                          "Referência",
                          "Linha",
                          "Pares históricos",
                          "Valor histórico",
                          "Última compra",
                        ].map(t => <th key={t} style={th}>{t}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {topReferencias.map(r => (
                        <tr key={`${r.referencia}|${r.linha}`}>
                          <td style={{ ...td, fontWeight: 800 }}>
                            {r.referencia}
                          </td>
                          <td style={td}>{r.linha}</td>
                          <td style={td}>{numero(r.pares)}</td>
                          <td style={td}>{moeda(r.valor)}</td>
                          <td style={td}>
                            {r.ultima
                              ? r.ultima.toLocaleDateString("pt-BR")
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!topReferencias.length && (
                    <p>Sem referências disponíveis.</p>
                  )}
                </div>
              </section>

              <section style={painel}>
                <TituloSecao
                  numeroSecao="06"
                  titulo="Empresas vinculadas ao grupo"
                />

                <p style={{ fontSize: 12, color: cores.texto }}>
                  Abra a Visão 360º individual para consultar
                  produtos potenciais, campanhas, plano de visita
                  e registrar o resultado do atendimento.
                </p>

                <div style={{ overflowX: "auto", marginTop: 17 }}>
                  <div id="clientes-do-grupo" style={{
  marginBottom: 14,
  padding: 12,
  background: "#fff3df",
  borderRadius: 10,
  border: "1px solid #f0c88f"
}}>
  <strong>{titulosFiltroCliente[filtroCliente]}</strong>
  <span style={{ marginLeft: 12, fontSize: 12 }}>
    {numero(empresasOrdenadas.length)} clientes
  </span>
  {filtroCliente !== "todos" && (
    <Link
      href={linkFiltroCliente("todos")}
      style={{ marginLeft: 16, color: "#c86400", fontWeight: 800 }}
    >
      Limpar filtro
    </Link>
  )}
</div>
<table style={{
                    width: "100%",
                    borderCollapse: "collapse",
                  }}>
                    <thead>
                      <tr>
                        {[
                          "Código",
                          "Empresa",
                          "Situação",
                          "Última compra",
                          "Limite disponível",
                          "Financeiro",
                          "Representante",
                          "Ação",
                        ].map(t => <th key={t} style={th}>{t}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {empresasOrdenadas.map((c, i) => (
                        <tr key={`${codigo(c.codigoCliente)}-${i}`}>
                          <td style={td}>{codigo(c.codigoCliente)}</td>
                          <td style={{ ...td, fontWeight: 800 }}>
                            <div style={{ fontWeight: 800 }}>
  Cliente {codigo(c.codigoCliente)}
</div>
<div style={{
  fontSize: 11,
  color: "#986c3f",
  marginTop: 4
}}>
  CNPJ: {formatarCNPJ(c.cnpj)}
</div>
                          </td>
                          <td style={td}>{status(c)}</td>
                          <td style={td}>{dataBR(c.ultimaCompra)}</td>
                          <td style={td}>
                            {moeda(Number(c.limiteDisponivel) || 0)}
                          </td>
                          <td style={{
                            ...td,
                            color: c.bloqueadoFinanceiro
                              ? cores.vermelho
                              : cores.verde,
                          }}>
                            {c.bloqueadoFinanceiro
                              ? "Bloqueado"
                              : "Sem bloqueio informado"}
                          </td>
                          <td style={td}>
                            {(c.representantes || [])
                              .map(r => r.nome || r.codigo)
                              .join(", ") || "—"}
                          </td>
                          <td style={td}>
                            <Link
                              href={`/cliente/${encodeURIComponent(codigo(c.codigoCliente))}`}
                              style={{
                                color: "#c86400",
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                              }}
                            >
                              Abrir 360º →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
