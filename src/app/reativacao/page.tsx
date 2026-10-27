import "server-only";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { validarToken } from "@/lib/auth";
import { cleanCode } from "@/lib/comercial-data";
import { carregarCarteira2027 } from "@/lib/carteira-2027-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Vinculo = {
  codigo: string;
  nome: string;
};

type Cliente = {
  codigoCliente?: string | number;
  razaoSocial?: string;
  grupoCliente?: string;
  situacao?: string;
  faixa?: string;
  ultimaCompra?: string;
  representanteAtual?: Vinculo[];
  supervisores?: Vinculo[];
  bloqueadoFinanceiro?: boolean;
  limiteDisponivel?: number;
  situacaoEmpresa?: string;
};

type Prioridade = "ALTO" | "MEDIO" | "BAIXO" | "NAO_AVALIADO";

type Registro = {
  codigo: string;
  nome: string;
  grupo: string;
  representante: string;
  supervisor: string;
  faixa: string;
  dias: number | null;
  pares: number;
  faturamento: number;
  credito: number;
  bloqueado: boolean;
  score: number;
  prioridade: Prioridade;
  manual: boolean;
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const NOMES: Record<Prioridade, string> = {
  ALTO: "Alto",
  MEDIO: "Médio",
  BAIXO: "Baixo",
  NAO_AVALIADO: "Não avaliado",
};

const ORDEM: Record<Prioridade, number> = {
  ALTO: 0,
  MEDIO: 1,
  BAIXO: 2,
  NAO_AVALIADO: 3,
};

function codigo(v: unknown): string {
  return cleanCode(v);
}

function texto(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function numero(v: number): string {
  return v.toLocaleString("pt-BR");
}

function dinheiro(v: number): string {
  return v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function parametro(
  params: Record<string, string | string[] | undefined>,
  chave: string
): string {
  const v = params[chave];
  return (typeof v === "string" ? v : "").trim().slice(0, 120);
}

let cachePrioridades:
  | {
      expira: number;
      dados: Map<string, Prioridade>;
      chave: string;
    }
  | undefined;

let promessaPrioridades:
  | Promise<Map<string, Prioridade>>
  | undefined;

let chavePromessaPrioridades = "";

async function prioridadesManuais(
  codigos: string[]
): Promise<Map<string, Prioridade>> {
  const chave = [...new Set(codigos)].sort().join("|");

  if (
    cachePrioridades &&
    cachePrioridades.chave === chave &&
    Date.now() < cachePrioridades.expira
  ) {
    return cachePrioridades.dados;
  }

  if (
    promessaPrioridades &&
    chavePromessaPrioridades === chave
  ) {
    return promessaPrioridades;
  }

  chavePromessaPrioridades = chave;

  const tarefa = consultarPrioridadesManuais(codigos)
    .then(dados => {
      cachePrioridades = {
        expira: Date.now() + 60_000,
        dados,
        chave,
      };

      return dados;
    })
    .finally(() => {
      if (promessaPrioridades === tarefa) {
        promessaPrioridades = undefined;
        chavePromessaPrioridades = "";
      }
    });

  promessaPrioridades = tarefa;

  return tarefa;
}

async function consultarPrioridadesManuais(
  codigos: string[]
): Promise<Map<string, Prioridade>> {
  const inicio = Date.now();
  const resultado = new Map<string, Prioridade>();

  if (!codigos.length) return resultado;

  const base = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");

  const chave: string = process.env.SUPABASE_SECRET_KEY || "";

  if (!base || !chave) {
    throw new Error("Configuracao Supabase ausente.");
  }

  const permitidas = new Set([
    "ALTO", "MEDIO", "BAIXO", "NAO_AVALIADO"
  ]);

  const lotes: string[][] = [];

  for (let i = 0; i < codigos.length; i += 100) {
    lotes.push(codigos.slice(i, i + 100));
  }

  console.log(
    "[REATIVACAO] Consultando prioridades:",
    codigos.length,
    "clientes em",
    lotes.length,
    "lotes"
  );

  let proximo = 0;

  async function trabalhador(): Promise<void> {
    while (proximo < lotes.length) {
      const indice = proximo++;
      const lote = lotes[indice];

      const url = new URL(
        "/rest/v1/kidy_cliente_prioridade",
        base
      );

      url.searchParams.set(
        "select",
        "codigo_cliente,classificacao"
      );

      url.searchParams.set(
        "codigo_cliente",
        `in.(${lote.map(c =>
          `"${c.replace(/["\\]/g, "")}"`
        ).join(",")})`
      );

      const resposta = await fetch(url.toString(), {
        headers: {
          apikey: chave,
          Authorization: `Bearer ${chave}`
        },
        cache: "no-store",
        signal: AbortSignal.timeout(12000)
      });

      if (!resposta.ok) {
        throw new Error(
          `Supabase HTTP ${resposta.status} no lote ${indice + 1}`
        );
      }

      const linhas = await resposta.json() as Array<{
        codigo_cliente: string;
        classificacao: string;
      }>;

      for (const linha of linhas) {
        if (permitidas.has(linha.classificacao)) {
          resultado.set(
            codigo(linha.codigo_cliente),
            linha.classificacao as Prioridade
          );
        }
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(5, lotes.length) },
      () => trabalhador()
    )
  );

  console.log(
    "[REATIVACAO] Prioridades concluidas em",
    Date.now() - inicio,
    "ms"
  );

  return resultado;
}
type LinhaRanking = {
  codigo_cliente: string;
  dias: number | null;
  pares: number;
  faturamento: number;
  score: number;
  prioridade_automatica: Prioridade;
};

async function buscarRankingConsolidado(): Promise<Map<string, LinhaRanking>> {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const chave = process.env.SUPABASE_SECRET_KEY || "";
  if (!base || !chave) throw new Error("Supabase nao configurado para ranking");
  const resultado = new Map<string, LinhaRanking>();
  // Busca somente as colunas usadas pela tela; nenhuma leitura de Parquet.
  for (let inicio = 0; ; inicio += 1000) {
    const url = `${base}/rest/v1/kidy_ranking_reativacao?select=codigo_cliente,dias,pares,faturamento,score,prioridade_automatica&order=codigo_cliente.asc&limit=1000&offset=${inicio}`;
    const resp = await fetch(url, { headers: { apikey: chave, Authorization: `Bearer ${chave}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!resp.ok) throw new Error(`Ranking consolidado HTTP ${resp.status}`);
    const linhas = await resp.json() as LinhaRanking[];
    for (const linha of linhas) resultado.set(codigo(linha.codigo_cliente), linha);
    if (linhas.length < 1000) break;
  }
  return resultado;
}

export default async function RankingReativacao({
  searchParams,
}: Props) {
  const token = (await cookies()).get("kidy_session")?.value;
  if (!token) redirect("/");

  const usuario = await validarToken(token);
  if (!usuario) redirect("/");

  const perfil = String(usuario.perfil ?? "").toUpperCase();
  const nome = String(usuario.nome ?? usuario.usuario ?? "Usuário");
  const login = String(usuario.usuario ?? "");

  const repLogin = codigo(
    usuario.codigo_representante || usuario.usuario
  );

  const supLogin = codigo(usuario.codigo_supervisor);

  const params = await searchParams;

  const filtroPrioridade = parametro(params, "prioridade");
  const filtroFaixa = parametro(params, "faixa");
  const filtroRep = codigo(parametro(params, "representante"));
  const filtroSup = codigo(parametro(params, "supervisor"));
  const busca = parametro(params, "busca");

  const base = await carregarCarteira2027();
  let clientes = base.clientes as Cliente[];

  // Segurança aplicada antes de qualquer filtro solicitado.
  if (perfil === "REPRESENTANTE") {
    clientes = clientes.filter(c =>
      c.representanteAtual?.some(
        r => codigo(r.codigo) === repLogin
      )
    );
  } else if (perfil === "SUPERVISOR") {
    clientes = clientes.filter(c =>
      c.supervisores?.some(
        s => codigo(s.codigo) === supLogin
      )
    );
  } else if (
    !["ADMIN", "ADMINISTRADOR", "GERENTE"].includes(perfil)
  ) {
    clientes = [];
  }

  // A carteira oficial define quem pertence à reativação.
  clientes = clientes.filter(
    c =>
      c.situacao === "REATIVACAO" &&
      texto(c.situacaoEmpresa) !== "BAIXADA"
  );

  const repsDisponiveis = new Map<string, string>();
  const supsDisponiveis = new Map<string, string>();

  for (const c of clientes) {
    for (const r of c.representanteAtual ?? []) {
      repsDisponiveis.set(
        codigo(r.codigo),
        r.nome || codigo(r.codigo)
      );
    }

    for (const s of c.supervisores ?? []) {
      supsDisponiveis.set(
        codigo(s.codigo),
        s.nome || codigo(s.codigo)
      );
    }
  }

  if (filtroRep) {
    clientes = clientes.filter(c =>
      c.representanteAtual?.some(
        r => codigo(r.codigo) === filtroRep
      )
    );
  }

  if (filtroSup) {
    clientes = clientes.filter(c =>
      c.supervisores?.some(
        s => codigo(s.codigo) === filtroSup
      )
    );
  }

  if (filtroFaixa) {
    clientes = clientes.filter(
      c => c.faixa === filtroFaixa
    );
  }

  if (busca) {
    const termo = texto(busca);
    clientes = clientes.filter(c =>
      [
        c.codigoCliente,
        c.razaoSocial,
        c.grupoCliente,
      ].some(v => texto(v).includes(termo))
    );
  }

  const codigos = [
    ...new Set(
      clientes.map(c => codigo(c.codigoCliente)).filter(Boolean)
    ),
  ];

  const [consolidado, manuais] = await Promise.all([
    buscarRankingConsolidado(),
    prioridadesManuais(codigos),
  ]);

  let registros: Registro[] = clientes.map(c => {
    const cod = codigo(c.codigoCliente);
    const e = consolidado.get(cod);

    const credito = Number(c.limiteDisponivel) || 0;
    const bloqueado = Boolean(c.bloqueadoFinanceiro);

    const calculo = {
      dias: e?.dias ?? null,
      score: e?.score ?? 0,
      prioridade: e?.prioridade_automatica ?? ("NAO_AVALIADO" as Prioridade),
    };

    const manual = manuais.has(cod);

    return {
      codigo: cod,
      nome: c.razaoSocial || "Não informado",
      grupo: c.grupoCliente || "",
      representante: (c.representanteAtual ?? [])
        .map(r => r.nome || r.codigo)
        .join(", "),
      supervisor: (c.supervisores ?? [])
        .map(s => s.nome || s.codigo)
        .join(", "),
      faixa: c.faixa || "",
      dias: calculo.dias,
      pares: e?.pares ?? 0,
      faturamento: e?.faturamento ?? 0,
      credito,
      bloqueado,
      score: calculo.score,
      prioridade: manuais.get(cod) ?? calculo.prioridade,
      manual,
    };
  });

  if (
    ["ALTO", "MEDIO", "BAIXO", "NAO_AVALIADO"]
      .includes(filtroPrioridade)
  ) {
    registros = registros.filter(
      r => r.prioridade === filtroPrioridade
    );
  }

  registros.sort(
    (a, b) =>
      ORDEM[a.prioridade] - ORDEM[b.prioridade] ||
      b.score - a.score ||
      b.pares - a.pares
  );

  const totais = {
    alto: registros.filter(r => r.prioridade === "ALTO").length,
    medio: registros.filter(r => r.prioridade === "MEDIO").length,
    baixo: registros.filter(r => r.prioridade === "BAIXO").length,
    naoAvaliado: registros.filter(
      r => r.prioridade === "NAO_AVALIADO"
    ).length,
  };

  const total = registros.length;
  const porPagina = 50;
  const paginas = Math.max(1, Math.ceil(total / porPagina));

  const solicitada = Number(parametro(params, "pagina") || 1);
  const pagina = Number.isFinite(solicitada)
    ? Math.min(paginas, Math.max(1, Math.trunc(solicitada)))
    : 1;

  const exibidos = registros.slice(
    (pagina - 1) * porPagina,
    pagina * porPagina
  );

  function urlPagina(p: number): string {
    const q = new URLSearchParams();

    if (filtroPrioridade) q.set("prioridade", filtroPrioridade);
    if (filtroFaixa) q.set("faixa", filtroFaixa);
    if (filtroRep) q.set("representante", filtroRep);
    if (filtroSup) q.set("supervisor", filtroSup);
    if (busca) q.set("busca", busca);

    q.set("pagina", String(p));
    return `/reativacao?${q.toString()}`;
  }

  const campo: React.CSSProperties = {
    padding: 10,
    border: "1px solid #cbd5e1",
    borderRadius: 9,
    background: "#fff",
    minWidth: 145,
  };

  const cartao: React.CSSProperties = {
    background: "#fff",
    padding: 18,
    border: "1px solid #e2e8f0",
    borderRadius: 14,
  };

  return (
    <div className="app-shell">
      <Sidebar nome={nome} perfil={perfil} usuario={login} />

      <main className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">
              INTELIGÊNCIA COMERCIAL
            </span>
            <h1>Ranking de Reativação</h1>
            <p>
              Carteira 02 · Oportunidades priorizadas
              por potencial comercial
            </p>
          </div>
        </header>

        <div style={{ padding: "22px 0 50px" }}>
          <div style={{ marginBottom: 18 }}>
            <Link href="/carteira">
              ← Gestão de Carteira 2027
            </Link>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit,minmax(170px,1fr))",
            gap: 12,
            marginBottom: 20,
          }}>
            {[
              ["Clientes", total],
              ["Alto", totais.alto],
              ["Médio", totais.medio],
              ["Baixo", totais.baixo],
              ["Não avaliado", totais.naoAvaliado],
            ].map(([titulo, valor]) => (
              <div key={titulo} style={cartao}>
                <div style={{
                  color: "#64748b",
                  fontSize: 12,
                }}>
                  {titulo}
                </div>
                <div style={{
                  fontSize: 27,
                  fontWeight: 800,
                  marginTop: 5,
                }}>
                  {numero(Number(valor))}
                </div>
              </div>
            ))}
          </div>

          <form
            method="GET"
            action="/reativacao"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: 18,
              alignItems: "end",
            }}
          >
            <label style={{ display: "grid", gap: 5 }}>
              <span>Prioridade</span>
              <select
                name="prioridade"
                defaultValue={filtroPrioridade}
                style={campo}
              >
                <option value="">Todas</option>
                <option value="ALTO">Alto</option>
                <option value="MEDIO">Médio</option>
                <option value="BAIXO">Baixo</option>
                <option value="NAO_AVALIADO">
                  Não avaliado
                </option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 5 }}>
              <span>Tempo de reativação</span>
              <select
                name="faixa"
                defaultValue={filtroFaixa}
                style={campo}
              >
                <option value="">Todas as faixas</option>
                <option value="25_A_36_MESES">
                  25 a 36 meses
                </option>
                <option value="37_A_60_MESES">
                  37 a 60 meses
                </option>
                <option value="ACIMA_60_MESES">
                  Acima de 60 meses
                </option>
              </select>
            </label>

            {perfil !== "REPRESENTANTE" && (
              <label style={{ display: "grid", gap: 5 }}>
                <span>Representante</span>
                <select
                  name="representante"
                  defaultValue={filtroRep}
                  style={campo}
                >
                  <option value="">Todos</option>
                  {[...repsDisponiveis.entries()]
                    .sort((a, b) =>
                      a[1].localeCompare(b[1], "pt-BR")
                    )
                    .map(([cod, nomeRep]) => (
                      <option key={cod} value={cod}>
                        {cod} - {nomeRep}
                      </option>
                    ))}
                </select>
              </label>
            )}

            {["ADMIN", "ADMINISTRADOR", "GERENTE"]
              .includes(perfil) && (
              <label style={{ display: "grid", gap: 5 }}>
                <span>Supervisor</span>
                <select
                  name="supervisor"
                  defaultValue={filtroSup}
                  style={campo}
                >
                  <option value="">Todos</option>
                  {[...supsDisponiveis.entries()]
                    .sort((a, b) =>
                      a[1].localeCompare(b[1], "pt-BR")
                    )
                    .map(([cod, nomeSup]) => (
                      <option key={cod} value={cod}>
                        {cod} - {nomeSup}
                      </option>
                    ))}
                </select>
              </label>
            )}

            <label style={{
              display: "grid",
              gap: 5,
              flex: "1 1 200px",
            }}>
              <span>Buscar cliente</span>
              <input
                name="busca"
                defaultValue={busca}
                placeholder="Código, razão social ou grupo"
                style={campo}
              />
            </label>

            <button
              type="submit"
              style={{
                padding: "11px 20px",
                border: 0,
                borderRadius: 9,
                background: "#f57c00",
                color: "#fff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Filtrar
            </button>
          </form>

          <p style={{
            fontSize: 12,
            color: "#64748b",
            marginBottom: 12,
          }}>
            Pontuação automática provisória.
            Classificações manuais salvas no Supabase
            têm preferência. Empresas baixadas são
            excluídas do ranking.
          </p>

          <div style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 14,
            overflowX: "auto",
          }}>
            <table style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
            }}>
              <thead style={{ background: "#fff7ed" }}>
                <tr>
                  {[
                    "Pos.",
                    "Prioridade",
                    "Score",
                    "Código",
                    "Cliente",
                    "Representante",
                    "Supervisor",
                    "Dias sem entrega",
                    "Pares históricos",
                    "Faturamento histórico",
                    "Crédito disponível",
                    "Financeiro",
                    "Ação",
                  ].map(t => (
                    <th key={t} style={{
                      padding: 12,
                      textAlign: "left",
                      whiteSpace: "nowrap",
                    }}>
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {exibidos.map((r, i) => (
                  <tr
                    key={`${r.codigo}-${i}`}
                    style={{
                      borderTop: "1px solid #e2e8f0",
                    }}
                  >
                    <td style={{ padding: 11 }}>
                      {(pagina - 1) * porPagina + i + 1}
                    </td>

                    <td style={{
                      padding: 11,
                      fontWeight: 800,
                      color:
                        r.prioridade === "ALTO"
                          ? "#15803d"
                          : r.prioridade === "MEDIO"
                          ? "#b45309"
                          : r.prioridade === "BAIXO"
                          ? "#b91c1c"
                          : "#64748b",
                    }}>
                      {NOMES[r.prioridade]}
                      {r.manual ? " *" : ""}
                    </td>

                    <td style={{ padding: 11 }}>
                      {r.score}
                    </td>

                    <td style={{ padding: 11 }}>
                      {r.codigo}
                    </td>

                    <td style={{
                      padding: 11,
                      fontWeight: 600,
                      minWidth: 200,
                    }}>
                      {r.nome}
                    </td>

                    <td style={{ padding: 11 }}>
                      {r.representante || "—"}
                    </td>

                    <td style={{ padding: 11 }}>
                      {r.supervisor || "—"}
                    </td>

                    <td style={{ padding: 11 }}>
                      {r.dias === null
                        ? "Sem dados"
                        : numero(r.dias)}
                    </td>

                    <td style={{ padding: 11 }}>
                      {numero(r.pares)}
                    </td>

                    <td style={{ padding: 11 }}>
                      {dinheiro(r.faturamento)}
                    </td>

                    <td style={{ padding: 11 }}>
                      {dinheiro(r.credito)}
                    </td>

                    <td style={{
                      padding: 11,
                      color: r.bloqueado
                        ? "#b91c1c"
                        : "#15803d",
                    }}>
                      {r.bloqueado
                        ? "Bloqueado"
                        : "Sem bloqueio informado"}
                    </td>

                    <td style={{ padding: 11 }}>
                      <Link
                        href={`/cliente/${encodeURIComponent(r.codigo)}`}
                        style={{
                          color: "#ea580c",
                          fontWeight: 800,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Cliente 360º
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!exibidos.length && (
              <p style={{ padding: 24 }}>
                Nenhum cliente encontrado.
              </p>
            )}
          </div>

          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 18,
          }}>
            <span>
              Página {pagina} de {paginas}
              {" · "}
              {numero(total)} clientes
              {" · "}
              * Classificação manual
            </span>

            <div style={{ display: "flex", gap: 16 }}>
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