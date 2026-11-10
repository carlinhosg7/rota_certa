import { listarGerentesRegionais } from "@/lib/carteira-gerentes";
import { carregarCarteira2027 } from "../../../lib/carteira-2027-data";
import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validarToken } from "@/lib/auth";
import { acessoGlobal, regionaisPermitidas, representantesPermitidos } from "@/lib/escopo-acesso";
import Sidebar from "@/components/Sidebar";
import { carregarMapaRepresentantes, normalizarRepresentante } from "@/lib/representantes-oficiais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Vinculo = { codigo: string; nome: string };

type Cliente = {
  codigoCliente?: string | number;
  razaoSocial?: string;
  grupoCliente?: string;
  cnpj?: string;
  carteira?: string;
  situacao?: string;
  faixa?: string;
  ultimaCompra?: string;
  representantes?: Vinculo[];
  representanteAtual?: Vinculo[];
  demaisRepresentantes?: Vinculo[];
  supervisores?: Vinculo[];
  bloqueadoFinanceiro?: boolean;
  limiteDisponivel?: number;
  flags?: string[];
  situacaoEmpresa?: string;
};

type Props = {
  searchParams: Promise<{
    gerente?: string;
    filtro?: string;
    supervisor?: string;
    representante?: string;
    pagina?: string;
    busca?: string;
    receita?: string;
  }>;
};

function cod(v: unknown) {
  return String(v ?? "").trim().replace(/\.0+$/, "");
}

function normalizar(v: unknown) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function n(v: number) {
  return v.toLocaleString("pt-BR");
}

const titulos: Record<string, string> = {
  todos: "Todos os clientes",
  ativa: "Carteira 01 — Ativa",
  reativacao: "Carteira 02 — Reativação",
  bloqueados: "Clientes com bloqueio financeiro",
  limite: "Clientes com limite disponível",
  ativa_bloqueados: "Carteira 01 — Bloqueio financeiro",
  ativa_limite: "Carteira 01 — Com limite disponível",
  reativacao_bloqueados: "Carteira 02 — Bloqueio financeiro",
  reativacao_limite: "Carteira 02 — Com limite disponível",
  "25a36": "Reativação — 25 a 36 meses",
  "37a60": "Reativação — 37 a 60 meses",
  "acima60": "Reativação — Acima de 60 meses"
};

export default async function ListaCarteira({ searchParams }: Props) {
  const token = (await cookies()).get("kidy_session")?.value;
  if (!token) redirect("/");

  const u = await validarToken(token);
  if (!u) redirect("/");

  const perfil = String(u.perfil ?? "").toUpperCase();
  const mostrarReceita = perfil !== "REPRESENTANTE" && perfil !== "REP";
  const usuario = String(u.usuario ?? "");
  const nome = String(u.nome ?? usuario);
  const repLogin = cod(u.codigo_representante || u.usuario);
  const supLogin = cod(u.codigo_supervisor);

  const params = await searchParams;
  const gerenteFiltro = String(params.gerente ?? "").trim().toUpperCase();
  const gerentesRegionais = await listarGerentesRegionais();
  const gerentesDisponiveis = [...new Set(gerentesRegionais.map(g => g.gerente))].sort((a,b) => a.localeCompare(b, "pt-BR"));
  const regionaisGerente = new Set(gerentesRegionais.filter(g => g.gerente === gerenteFiltro).map(g => cod(g.codigo_supervisor)));
  const filtro = titulos[params.filtro ?? ""]
    ? params.filtro!
    : "todos";

  const supervisor = cod(params.supervisor);
  const representante = cod(params.representante);
  const busca = String(params.busca ?? "").trim().slice(0, 100);
  const situacoesReceita = ["ATIVA", "BAIXADA", "INAPTA", "SUSPENSA", "NAO LOCALIZADO", "PENDENTE FORMATO", "NAO VERIFICADA"];
  const receita = situacoesReceita.includes(String(params.receita ?? "").toUpperCase()) ? String(params.receita).toUpperCase() : "";



  let clientes: Cliente[] = [];

  try {
    clientes = (await carregarCarteira2027()).clientes;
  } catch {
    return (
      <div style={{ padding: 30 }}>
        Base não encontrada no servidor.
        <Link href="/carteira"> Voltar</Link>
      </div>
    );
  }

  // Hierarquia oficial e controle de acesso centralizado.
  const [mapaOficial, repsAutorizados, regionaisAutorizadas] =
    await Promise.all([
      carregarMapaRepresentantes(),
      representantesPermitidos(u),
      regionaisPermitidas(u),
    ]);

  const acessoNacional = acessoGlobal(u);

  const repsPermitidos = repsAutorizados === null
    ? null
    : new Set(repsAutorizados.map(cod));

  const normalizarVinculos = (
    vinculos: Vinculo[] | undefined
  ): Vinculo[] => {
    const resultado = new Map<string, Vinculo>();

    for (const vinculo of vinculos ?? []) {
      const originalRep = cod(vinculo.codigo);
      if (!originalRep) continue;

      const normalizado = normalizarRepresentante(
        originalRep,
        mapaOficial
      );

      const oficial = mapaOficial.cadastro.get(normalizado.codigo);

      if (!oficial?.ativo) continue;

      resultado.set(normalizado.codigo, {
        codigo: normalizado.codigo,
        nome: oficial.nome_rep || vinculo.nome || normalizado.codigo,
      });
    }

    return [...resultado.values()];
  };

  clientes = clientes.map(cliente => {
    const atuais = normalizarVinculos(cliente.representanteAtual);
    const demais = normalizarVinculos(cliente.demaisRepresentantes);
    const todos = normalizarVinculos(cliente.representantes);

    const visiveis = repsPermitidos === null
      ? atuais
      : atuais.filter(r => repsPermitidos.has(cod(r.codigo)));

    const supervisores = new Map<string, Vinculo>();

    for (const rep of visiveis) {
      const normalizado = normalizarRepresentante(
        cod(rep.codigo),
        mapaOficial
      );

      const supervisor = cod(normalizado.supervisor);

      if (supervisor) {
        supervisores.set(supervisor, {
          codigo: supervisor,
          nome: supervisor,
        });
      }
    }

    return {
      ...cliente,
      representanteAtual: visiveis,
      representantes: repsPermitidos === null
        ? todos
        : todos.filter(r => repsPermitidos.has(cod(r.codigo))),
      demaisRepresentantes: repsPermitidos === null
        ? demais
        : demais.filter(r => repsPermitidos.has(cod(r.codigo))),
      supervisores: [...supervisores.values()],
    };
  });

  // Escopo de acesso aplicado antes dos filtros da URL.
  if (!acessoNacional) {
    if (repsPermitidos === null || repsPermitidos.size === 0) {
      clientes = [];
    } else {
      clientes = clientes.filter(c =>
        c.representanteAtual?.some(r =>
          repsPermitidos.has(cod(r.codigo))
        )
      );
    }
  }

  if (gerenteFiltro) {
    clientes = clientes.filter(c =>
      c.supervisores?.some(s =>
        regionaisGerente.has(cod(s.codigo))
      )
    );
  }

  if (
    supervisor &&
    regionaisAutorizadas !== null &&
    !regionaisAutorizadas.has(supervisor)
  ) {
    clientes = [];
  } else if (supervisor) {
    clientes = clientes.filter(c =>
      c.supervisores?.some(s => cod(s.codigo) === supervisor)
    );
  }

  const repFiltro = representante
    ? normalizarRepresentante(representante, mapaOficial).codigo
    : "";

  if (
    repFiltro &&
    repsPermitidos !== null &&
    !repsPermitidos.has(repFiltro)
  ) {
    clientes = [];
  } else if (repFiltro) {
    clientes = clientes.filter(c =>
      c.representanteAtual?.some(r =>
        cod(r.codigo) === repFiltro
      )
    );
  }

  // Receita fiscal: gestores podem consultar baixadas somente na visão fiscal.
  // Todas as carteiras comerciais e seus indicadores financeiros excluem BAIXADA.
  if (!(mostrarReceita && receita === "BAIXADA" && filtro === "todos")) {
    clientes = clientes.filter(c => String(c.situacaoEmpresa || "").trim().toUpperCase() !== "BAIXADA");
  }
  const carteirasFinanceiras: Record<string, { situacao: string; tipo: "bloqueados" | "limite" }> = {
    ativa_bloqueados: { situacao: "ATIVA", tipo: "bloqueados" },
    ativa_limite: { situacao: "ATIVA", tipo: "limite" },
    reativacao_bloqueados: { situacao: "REATIVACAO", tipo: "bloqueados" },
    reativacao_limite: { situacao: "REATIVACAO", tipo: "limite" },
  };
  const financeiro = carteirasFinanceiras[filtro];
  if (financeiro) {
    clientes = clientes.filter(c => c.situacao === financeiro.situacao);
    clientes = clientes.filter(c => financeiro.tipo === "bloqueados"
      ? Boolean(c.bloqueadoFinanceiro) : Number(c.limiteDisponivel) > 0);
  } else if (filtro === "ativa") {
    clientes = clientes.filter(c => c.situacao === "ATIVA");
  } else if (filtro === "reativacao") {
    clientes = clientes.filter(c => c.situacao === "REATIVACAO");
  } else if (filtro === "bloqueados") {
    clientes = clientes.filter(c => c.bloqueadoFinanceiro);
  } else if (filtro === "limite") {
    clientes = clientes.filter(c => Number(c.limiteDisponivel) > 0);
  }

  if (filtro === "25a36") {
    clientes = clientes.filter(c =>
      c.faixa === "25_A_36_MESES"
    );
  } else if (filtro === "37a60") {
    clientes = clientes.filter(c =>
      c.faixa === "37_A_60_MESES"
    );
  } else if (filtro === "acima60") {
    clientes = clientes.filter(c =>
      c.faixa === "ACIMA_60_MESES"
    );
  }
  // PAINEL_RECEITA_2027
  if (receita && mostrarReceita) {
    clientes = clientes.filter(c => String(c.situacaoEmpresa || "NAO VERIFICADA").replaceAll("_", " ").toUpperCase() === receita);
  }

  if (busca) {
    const termo = normalizar(busca);
    clientes = clientes.filter(c =>
      [
        c.codigoCliente,
        c.razaoSocial,
        c.grupoCliente,
        c.cnpj
      ].some(v => normalizar(v).includes(termo))
    );
  }

  clientes.sort((a, b) =>
    String(a.razaoSocial ?? "").localeCompare(
      String(b.razaoSocial ?? ""),
      "pt-BR"
    )
  );

  const total = clientes.length;
  const tamanho = 50;
  const paginas = Math.max(1, Math.ceil(total / tamanho));

  const paginaSolicitada = Number(params.pagina ?? 1);
  const pagina = Number.isFinite(paginaSolicitada)
    ? Math.max(1, Math.min(paginas, Math.trunc(paginaSolicitada)))
    : 1;

  const exibidos = clientes.slice(
    (pagina - 1) * tamanho,
    pagina * tamanho
  );

  function urlPagina(numero: number) {
    const q = new URLSearchParams();
    q.set("filtro", filtro);
    if (gerenteFiltro) q.set("gerente", gerenteFiltro);
    if (supervisor) q.set("supervisor", supervisor);
    if (representante) q.set("representante", representante);
    if (busca) q.set("busca", busca);
    if (receita) q.set("receita", receita);
    q.set("pagina", String(numero));
    return `/carteira/clientes?${q}`;
  }

  return (
    <div className="app-shell">
      <Sidebar nome={nome} perfil={perfil} usuario={usuario} />

      <main className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">GESTÃO DE CARTEIRA 2027</span>
            <h1>{titulos[filtro]}</h1>
            <p>
              {n(total)} clientes encontrados ·
              Classificação provisória até validar faturamento
            </p>
          </div>
        </header>

        <div style={{ padding: "22px 0 50px" }}>
          <Link
            href="/carteira"
            style={{ color: "#1d4ed8", fontWeight: 700 }}
          >
            ← Voltar aos indicadores
          </Link>

          <form
            method="GET"
            action="/carteira/clientes"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              marginTop: 22,
              marginBottom: 18
            }}
          >
            <input type="hidden" name="filtro" value={filtro} />
             <label style={{display: "grid", gap: 5, fontSize: 12}}>
               Gerente
               <select name="gerente" defaultValue={gerenteFiltro} style={{padding: 12, border: "1px solid #cbd5e1", borderRadius: 9}}>
                 <option value="">Todos</option>
                 {gerentesDisponiveis.map(g => <option key={g} value={g}>{g}</option>)}
               </select>
             </label>
            <input
              type="hidden"
              name="supervisor"
              value={supervisor}
            />
            <input
              type="hidden"
              name="representante"
              value={representante}
            />
            {mostrarReceita && (
              <label style={{display: "grid", gap: 5, fontSize: 12}}>
                Situação Receita
                <select name="receita" defaultValue={receita} style={{padding: 12, border: "1px solid #cbd5e1", borderRadius: 9}}>
                  <option value="">Todas</option>
                  {situacoesReceita.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </label>
            )}

            <input
              name="busca"
              defaultValue={busca}
              placeholder="Código, razão social, grupo ou CNPJ"
              style={{
                flex: "1 1 300px",
                padding: 12,
                border: "1px solid #cbd5e1",
                borderRadius: 9
              }}
            />

            <button
              type="submit"
              style={{
                padding: "12px 20px",
                background: "#1d4ed8",
                color: "#fff",
                border: 0,
                borderRadius: 9,
                cursor: "pointer"
              }}
            >
              Buscar cliente
            </button>
          </form>

          <div style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            overflowX: "auto"
          }}>
            <table style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13
            }}>
              <thead style={{ background: "#f1f5f9" }}>
                <tr>
                  {[
                    "Código",
                    "Cliente",
                    "Grupo",
                    "Representante Atual",
                    "Demais Representantes",
                    "Última compra",
                    "Situação",
                    ...(mostrarReceita ? ["Receita Federal"] : []),
                    "Ação"
                  ].map(t => (
                    <th
                      key={t}
                      style={{
                        padding: 13,
                        textAlign: "left",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {exibidos.map((c, i) => {
                  const codigo = cod(c.codigoCliente);

                  return (
                    <tr
                      key={`${codigo}-${i}`}
                      style={{ borderTop: "1px solid #e2e8f0" }}
                    >
                      <td style={{ padding: 12 }}>{codigo}</td>
                      <td style={{ padding: 12, fontWeight: 600 }}>
                        {c.razaoSocial || "Não informado"}
                      </td>
                      <td style={{ padding: 12 }}>
                        {c.grupoCliente || "—"}
                      </td>
                      <td style={{ padding: 12 }}>
                        {(c.representanteAtual || [])
                          .map(r => r.nome || r.codigo)
                          .join(", ") || "—"}
                      </td>
                      <td style={{ padding: 12 }}>
                        {(c.demaisRepresentantes || [])
                          .map(r => r.nome || r.codigo)
                          .join(", ") || "—"}
                      </td>
                      <td style={{ padding: 12 }}>
                        {c.ultimaCompra
                          ? c.ultimaCompra.split("-").reverse().join("/")
                          : "—"}
                      </td>
                      <td style={{ padding: 12 }}>
                        {c.situacao || c.carteira || "—"}
                      </td>
                      {mostrarReceita && (
                        <td style={{ padding: 12, fontWeight: 700 }}>
                          {c.situacaoEmpresa || "NAO VERIFICADA"}
                        </td>
                      )}
                      <td style={{ padding: 12 }}>
                        {codigo ? (
                          <Link
                            href={`/cliente/${encodeURIComponent(codigo)}`}
                            style={{
                              color: "#1d4ed8",
                              fontWeight: 700,
                              whiteSpace: "nowrap"
                            }}
                          >
                            Visão 360º →
                          </Link>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {exibidos.length === 0 && (
              <p style={{ padding: 24 }}>
                Nenhum cliente encontrado para os filtros selecionados.
              </p>
            )}
          </div>

          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 14,
            marginTop: 20
          }}>
            <span>
              Página {pagina} de {paginas} · {n(total)} clientes
            </span>

            <div style={{ display: "flex", gap: 12 }}>
              {pagina > 1 && (
                <Link href={urlPagina(pagina - 1)}>
                  ← Anterior
                </Link>
              )}

              {pagina < paginas && (
                <Link href={urlPagina(pagina + 1)}>
                  Próxima →
                </Link>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}