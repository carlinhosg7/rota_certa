import { listarGerentesRegionais } from "@/lib/carteira-gerentes";
import { carregarCarteira2027 } from "../../lib/carteira-2027-data";
import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { validarToken } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Vinculo = {
  codigo: string;
  nome: string;
};

type Cliente = {
  codigoCliente: string;
  grupoCliente: string;
  carteira: string;
  situacao: string;
  faixa: string;
  representantes: Vinculo[];
  supervisores: Vinculo[];
  bloqueadoFinanceiro: boolean;
  limiteDisponivel: number;
  classificacaoProvisoria: boolean;
  situacaoEmpresa: string;
  cnpj: string;
};

type Resumo = {
  referencia: string;
  corte24Meses: string;
  totalClientes: number;
  gruposDistintos: number;
  statusValidacao: string;
};

type Props = {
  searchParams: Promise<{
    gerente?: string;
    supervisor?: string;
    representante?: string;
    receita?: string;
  }>;
};

function codigo(valor: unknown) {
  return String(valor ?? "").trim().replace(/\.0+$/, "");
}

function inteiro(valor: number) {
  return valor.toLocaleString("pt-BR");
}

function percentual(parte: number, total: number) {
  return total
    ? `${(parte / total * 100).toFixed(1).replace(".", ",")}%`
    : "0,0%";
}

function cartao(
  titulo: string,
  valor: string,
  detalhe: string,
  cor = "#172b4d",
  filtro = "todos",
  supervisor = "",
  representante = "",
  gerente = ""
) {
  const params = new URLSearchParams({ filtro });
  if (gerente) params.set("gerente", gerente);
  if (supervisor) params.set("supervisor", supervisor);
  if (representante) params.set("representante", representante);

  return (
    <Link
      href={`/carteira/clientes?${params.toString()}`}
      style={{ textDecoration: "none", display: "block", color: "inherit" }}
    >
      <article style={{
        background: "#fff",
        border: "1px solid #e2e8f0",
        borderRadius: 16,
        padding: 22,
        minWidth: 0,
        height: "100%",
        cursor: "pointer",
        boxShadow: "0 2px 6px rgba(0,0,0,.03)"
      }}>
        <div style={{ color: "#64748b", fontSize: 13, fontWeight: 600 }}>
          {titulo}
        </div>
        <div style={{
          color: cor,
          fontSize: 31,
          fontWeight: 800,
          marginTop: 10
        }}>
          {valor}
        </div>
        <div style={{ color: "#64748b", fontSize: 12, marginTop: 6 }}>
          {detalhe}
        </div>
        <div style={{
          marginTop: 14,
          fontSize: 12,
          fontWeight: 700,
          color: "#1d4ed8"
        }}>
          Ver clientes →
        </div>
      </article>
    </Link>
  );
}
export default async function CarteiraPage({
  searchParams
}: Props) {
  const token = (await cookies()).get("kidy_session")?.value;

  if (!token) redirect("/");

  const sessao = await validarToken(token);

  if (!sessao) redirect("/");

  const perfil = String(sessao.perfil ?? "").toUpperCase();
  const nome = String(
    sessao.nome ?? sessao.usuario ?? "Usuário"
  );

  const usuario = String(sessao.usuario ?? "");

  const repLogin = codigo(
    sessao.codigo_representante || sessao.usuario
  );

  const supLogin = codigo(sessao.codigo_supervisor);

  const parametros = await searchParams;
  const gerenteFiltro = String(parametros.gerente ?? "").trim().toUpperCase();
  const gerentesRegionais = await listarGerentesRegionais();
  const gerentesDisponiveis = [...new Set(gerentesRegionais.map(g => g.gerente))].sort((a,b) => a.localeCompare(b, "pt-BR"));
  const regionaisGerente = new Set(gerentesRegionais.filter(g => g.gerente === gerenteFiltro).map(g => codigo(g.codigo_supervisor)));

  let clientes: Cliente[] = [];
  let resumo: Resumo | null = null;
  let erroBase = "";

  try {
    const dados = await carregarCarteira2027();
    clientes = dados.clientes as Cliente[];
    resumo = dados.resumo as Resumo;
  } catch (e) {
    console.error("[CARTEIRA 2027]", e);
    erroBase = "Falha ao carregar a Carteira 2027 do Google Drive.";
  }

  // Controle de acesso aplicado ANTES dos filtros da interface.
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
    erroBase = "Perfil sem permissão configurada para esta carteira.";
  }

  if (gerenteFiltro) {
    clientes = clientes.filter(c => c.supervisores?.some(s => regionaisGerente.has(codigo(s.codigo))));
  }

  const supervisores = new Map<string, string>();
  const representantes = new Map<string, string>();

  for (const c of clientes) {
    for (const s of c.supervisores || []) {
      if (s.codigo) supervisores.set(codigo(s.codigo), s.nome);
    }

    for (const r of c.representantes || []) {
      if (r.codigo) representantes.set(codigo(r.codigo), r.nome);
    }
  }

  const supervisorFiltro = codigo(parametros.supervisor);
  const representanteFiltro = codigo(parametros.representante);
  const receitaFiltro = String(parametros.receita ?? "").toUpperCase();

  if (supervisorFiltro) {
    clientes = clientes.filter(c =>
      c.supervisores?.some(s =>
        codigo(s.codigo) === supervisorFiltro
      )
    );
  }

  if (representanteFiltro) {
    clientes = clientes.filter(c =>
      c.representantes?.some(r =>
        codigo(r.codigo) === representanteFiltro
      )
    );
  }

  // PAINEL_RECEITA_2027: contagem por cliente e Grupo Cliente distinto.
  const clientesEscopo = clientes;
  const situacoesReceita = ["ATIVA", "BAIXADA", "INAPTA", "SUSPENSA", "NAO LOCALIZADO", "PENDENTE FORMATO", "NAO VERIFICADA"];
  const receitaValida = situacoesReceita.includes(receitaFiltro) ? receitaFiltro : "";
  const indicadoresReceita = situacoesReceita.map(situacao => {
    const encontrados = clientesEscopo.filter(c =>
      String(c.situacaoEmpresa || "NAO VERIFICADA").replaceAll("_", " ").toUpperCase() === situacao
    );
    const grupos = new Set(encontrados.map(c => String(c.grupoCliente || "").trim().toUpperCase()).filter(Boolean));
    return { situacao, clientes: encontrados.length, grupos: grupos.size };
  });
  const riscoReceita = clientesEscopo.filter(c =>
    ["BAIXADA", "INAPTA"].includes(String(c.situacaoEmpresa || "").toUpperCase()) && Number(c.limiteDisponivel) > 0
  ).length;
  if (receitaValida) {
    clientes = clientes.filter(c => String(c.situacaoEmpresa || "NAO VERIFICADA").replaceAll("_", " ").toUpperCase() === receitaValida);
  }

  const total = clientes.length;

  const ativos = clientes.filter(
    c => c.situacao === "ATIVA"
  ).length;

  const reativacao = clientes.filter(
    c => c.situacao === "REATIVACAO"
  ).length;

  const pendentes = clientes.filter(
    c => c.situacao === "PENDENTE_QUALIFICACAO"
  ).length;

  const bloqueados = clientes.filter(
    c => c.bloqueadoFinanceiro
  ).length;

  const limite = clientes.filter(
    c => Number(c.limiteDisponivel) > 0
  ).length;

  const grupos = new Set(
    clientes
      .map(c => String(c.grupoCliente ?? "").trim().toUpperCase())
      .filter(Boolean)
  ).size;

  const faixas = [
    {
      nome: "25 a 36 meses",
      descricao: "Reativação prioritária",
      valor: clientes.filter(c =>
        c.faixa === "25_A_36_MESES"
      ).length
    },
    {
      nome: "37 a 60 meses",
      descricao: "Recuperação estruturada",
      valor: clientes.filter(c =>
        c.faixa === "37_A_60_MESES"
      ).length
    },
    {
      nome: "Acima de 60 meses",
      descricao: "Requalificação",
      valor: clientes.filter(c =>
        c.faixa === "ACIMA_60_MESES"
      ).length
    }
  ];

  const maiorFaixa = Math.max(
    1,
    ...faixas.map(f => f.valor)
  );

  const query = new URLSearchParams();

  if (gerenteFiltro) query.set("gerente", gerenteFiltro);
  if (supervisorFiltro) query.set("supervisor", supervisorFiltro);
  if (representanteFiltro) query.set("representante", representanteFiltro);
  if (receitaValida) query.set("receita", receitaValida);

  const urlAtual = `/carteira${query.size ? `?${query}` : ""}`;

  return (
    <div className="app-shell">
      <Sidebar
        nome={nome}
        perfil={perfil}
        usuario={usuario}
      />

      <main className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">
              INTELIGÊNCIA COMERCIAL 2027
            </span>
            <h1>Gestão de Carteira</h1>
            <p>
              Carteira Ativa, Reativação e oportunidades comerciais
            </p>
          </div>

          <div className="profile-pill">
            <span>{nome}</span>
            <b>{perfil}</b>
          </div>
        </header>

        <div style={{padding: "24px 0 50px"}}>
<div style={{
  display: "flex",
  justifyContent: "flex-end",
  marginBottom: 16
}}>
  <Link
    href="/carteira/grupos"
    style={{
      background: "#92400e",
      color: "#fff",
      padding: "12px 18px",
      borderRadius: 10,
      textDecoration: "none",
      fontWeight: 700
    }}
  >
    Visão por Grupo Cliente →
  </Link>
</div>
          <div style={{
            background: "#fff7ed",
            border: "1px solid #fed7aa",
            color: "#9a3412",
            borderRadius: 12,
            padding: 16,
            marginBottom: 22,
            fontSize: 13
          }}>
            <strong>Classificação provisória.</strong>{" "}
            A data da última compra foi obtida do cadastro Excel.
            A confirmação de compra faturada ainda está pendente.
            Referência: {resumo?.referencia ?? "não disponível"}.
          </div>

          {erroBase ? (
            <div style={{
              padding: 24,
              border: "1px solid #fecaca",
              background: "#fff",
              borderRadius: 12
            }}>
              {erroBase}
            </div>
          ) : (
            <>
              <form
                action="/carteira"
                method="GET"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  alignItems: "end",
                  background: "#fff",
                  padding: 18,
                  borderRadius: 14,
                  border: "1px solid #e2e8f0",
                  marginBottom: 22
                }}
              >
                 <label style={{display: "grid", gap: 6}}>
                   <span style={{fontSize: 12}}>Gerente</span>
                   <select name="gerente" defaultValue={gerenteFiltro} style={{padding: 10, minWidth: 190}}>
                     <option value="">Todos</option>
                     {gerentesDisponiveis.map(g => <option key={g} value={g}>{g}</option>)}
                   </select>
                 </label>
                <label style={{display: "grid", gap: 6}}>
                  <span style={{fontSize: 12}}>Supervisor</span>
                  <select
                    name="supervisor"
                    defaultValue={supervisorFiltro}
                    style={{padding: 10, minWidth: 200}}
                  >
                    <option value="">Todos</option>
                    {[...supervisores.entries()]
                      .sort((a, b) => a[1].localeCompare(b[1]))
                      .map(([id, nome]) => (
                        <option key={id} value={id}>
                          {nome || id} ({id})
                        </option>
                      ))}
                  </select>
                </label>

                <label style={{display: "grid", gap: 6}}>
                  <span style={{fontSize: 12}}>Representante</span>
                  <select
                    name="representante"
                    defaultValue={representanteFiltro}
                    style={{padding: 10, minWidth: 220}}
                  >
                    <option value="">Todos</option>
                    {[...representantes.entries()]
                      .sort((a, b) => a[1].localeCompare(b[1]))
                      .map(([id, nome]) => (
                        <option key={id} value={id}>
                          {nome || id} ({id})
                        </option>
                      ))}
                  </select>
                </label>

                <label style={{display: "grid", gap: 6}}>
                  <span style={{fontSize: 12}}>Situação Receita Federal</span>
                  <select name="receita" defaultValue={receitaValida} style={{padding: 10, minWidth: 190}}>
                    <option value="">Todas</option>
                    {situacoesReceita.map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                </label>

                <button type="submit" style={{
                  padding: "11px 18px",
                  border: 0,
                  borderRadius: 9,
                  background: "#1e40af",
                  color: "#fff",
                  cursor: "pointer"
                }}>
                  Aplicar filtros
                </button>

                <Link href="/carteira" style={{
                  padding: "10px 14px",
                  color: "#475569"
                }}>
                  Limpar
                </Link>
              </form>

              {/* PAINEL_RECEITA_2027 */}
              <section style={{background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, marginBottom: 22}}>
                <h2 style={{fontSize: 18, marginBottom: 8}}>Situação cadastral — Receita Federal</h2>
                <p style={{fontSize: 12, color: "#64748b", marginBottom: 15}}>
                  Contagem de clientes por Código Cliente e grupos distintos por Grupo Cliente. Independente da classificação comercial.
                </p>
                <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10}}>
                  {indicadoresReceita.map(item => {
                    const q = new URLSearchParams({receita: item.situacao});
                    if (gerenteFiltro) q.set("gerente", gerenteFiltro);
                     if (supervisorFiltro) q.set("supervisor", supervisorFiltro);
                    if (representanteFiltro) q.set("representante", representanteFiltro);
                    return <Link key={item.situacao} href={`/carteira/clientes?${q}`} style={{textDecoration: "none", color: "inherit", padding: 14, border: "1px solid #e2e8f0", borderRadius: 12}}>
                      <div style={{fontSize: 12, fontWeight: 700}}>{item.situacao}</div>
                      <div style={{fontSize: 24, fontWeight: 800}}>{inteiro(item.clientes)}</div>
                      <div style={{fontSize: 12, color: "#64748b"}}>{inteiro(item.grupos)} grupos</div>
                    </Link>;
                  })}
                </div>
                <p style={{marginTop: 15, fontSize: 13, color: "#b91c1c", fontWeight: 700}}>
                  Atenção: {inteiro(riscoReceita)} clientes com CNPJ baixado ou inapto e limite disponível.
                </p>
              </section>

              <div style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(190px, 1fr))",
                gap: 16
              }}>
                {cartao(
                  "Clientes na carteira",
                  inteiro(total),
                  `${inteiro(grupos)} grupos distintos`, "#172b4d", "todos", supervisorFiltro, representanteFiltro, gerenteFiltro
                )}

                {cartao(
                  "Carteira 01 — Ativa",
                  inteiro(ativos),
                  percentual(ativos, total),
                  "#15803d", "ativa", supervisorFiltro, representanteFiltro, gerenteFiltro)}

                {cartao(
                  "Carteira 02 — Reativação",
                  inteiro(reativacao),
                  percentual(reativacao, total),
                  "#b45309", "reativacao", supervisorFiltro, representanteFiltro, gerenteFiltro)}

                {cartao(
                  "Pendentes de qualificação",
                  inteiro(pendentes),
                  "Sem última compra válida",
                  "#7c3aed", "pendentes", supervisorFiltro, representanteFiltro, gerenteFiltro)}

                {cartao(
                  "Bloqueio financeiro",
                  inteiro(bloqueados),
                  "Clientes que exigem atenção",
                  "#b91c1c", "bloqueados", supervisorFiltro, representanteFiltro, gerenteFiltro)}

                {cartao(
                  "Com limite disponível",
                  inteiro(limite),
                  "Não significa ausência de pedido",
                  "#0369a1", "limite", supervisorFiltro, representanteFiltro, gerenteFiltro)}
              </div>

              <section style={{
                marginTop: 24,
                padding: 24,
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 16
              }}>
                <h2 style={{fontSize: 19, marginBottom: 6}}>
                  Distribuição da carteira
                </h2>

                <p style={{
                  color: "#64748b",
                  fontSize: 13,
                  marginBottom: 18
                }}>
                  Clientes únicos por Código Cliente
                </p>

                <div style={{
                  display: "flex",
                  height: 26,
                  borderRadius: 9,
                  overflow: "hidden",
                  background: "#e2e8f0"
                }}>
                  <div style={{
                    width: `${total ? ativos / total * 100 : 0}%`,
                    background: "#16a34a"
                  }} />

                  <div style={{
                    width: `${total ? reativacao / total * 100 : 0}%`,
                    background: "#f59e0b"
                  }} />

                  <div style={{
                    width: `${total ? pendentes / total * 100 : 0}%`,
                    background: "#8b5cf6"
                  }} />
                </div>

                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 22,
                  marginTop: 15,
                  fontSize: 13
                }}>
                  <span>🟢 Ativa: {percentual(ativos, total)}</span>
                  <span>🟠 Reativação: {percentual(reativacao, total)}</span>
                  <span>🟣 Pendente: {inteiro(pendentes)}</span>
                </div>
              </section>

              <section style={{
                marginTop: 24,
                padding: 24,
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: 16
              }}>
                <h2 style={{fontSize: 19, marginBottom: 6}}>
                  Prioridades de reativação
                </h2>

                <p style={{
                  color: "#64748b",
                  fontSize: 13,
                  marginBottom: 22
                }}>
                  Faixas definidas no Fluxo de Gestão de Carteira Kidy 2027
                </p>

                {faixas.map(f => (
                  <div key={f.nome} style={{marginBottom: 23}}>
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      marginBottom: 8,
                      fontSize: 14
                    }}>
                      <div>
                        <Link
  href={`/carteira/clientes?${new URLSearchParams({
    filtro: f.nome === "25 a 36 meses"
      ? "25a36"
      : f.nome === "37 a 60 meses"
      ? "37a60"
      : "acima60",
    ...(gerenteFiltro ? { gerente: gerenteFiltro } : {}),
     ...(supervisorFiltro ? { supervisor: supervisorFiltro } : {}),
    ...(representanteFiltro ? { representante: representanteFiltro } : {})
  }).toString()}`}
  style={{
    color: "#92400e",
    fontWeight: 800,
    textDecoration: "underline"
  }}
>
  {f.nome} → Ver clientes
</Link>
                        <div style={{
                          color: "#64748b",
                          fontSize: 12
                        }}>
                          {f.descricao}
                        </div>
                      </div>
                      <strong>{inteiro(f.valor)}</strong>
                    </div>

                    <div style={{
                      height: 12,
                      borderRadius: 6,
                      background: "#f1f5f9",
                      overflow: "hidden"
                    }}>
                      <div style={{
                        width: `${f.valor / maiorFaixa * 100}%`,
                        height: "100%",
                        background: "#f59e0b",
                        borderRadius: 6
                      }} />
                    </div>
                  </div>
                ))}
              </section>

              <p style={{
                marginTop: 20,
                color: "#64748b",
                fontSize: 12
              }}>
                Base local: {inteiro(resumo?.totalClientes ?? 0)} clientes.
                Os indicadores respeitam os vínculos de acesso e os filtros
                aplicados. Nenhum cadastro individual é enviado ao navegador.
              </p>

              <div style={{display: "none"}}>{urlAtual}</div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
