import "server-only";

import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { validarToken } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Parametros = Record<string, string | string[] | undefined>;

type Props = {
  searchParams: Promise<Parametros>;
};

type Registro = Record<string, unknown>;

const LIMITE = 100;

function texto(valor: unknown): string {
  return String(valor ?? "").trim();
}

function campo(registro: Registro, nome: string): string {
  const valor = registro[nome];

  if (valor === null || valor === undefined || valor === "") {
    return "-";
  }

  return String(valor);
}

function dataBR(valor: unknown): string {
  if (!valor) return "-";

  const data = new Date(String(valor));

  if (Number.isNaN(data.getTime())) {
    return String(valor);
  }

  return data.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

function rotulo(valor: unknown): string {
  return texto(valor).replace(/_/g, " ") || "-";
}

const caixa: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #f0c88f",
  borderRadius: 14,
  padding: 18,
};

const entrada: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #e2c9a8",
  borderRadius: 8,
  background: "#fff",
  color: "#422006",
};

const cabecalho: React.CSSProperties = {
  padding: 12,
  textAlign: "left",
  background: "#fff3e2",
  fontSize: 12,
  whiteSpace: "nowrap",
};

const celula: React.CSSProperties = {
  padding: 12,
  borderBottom: "1px solid #f3e5d2",
  fontSize: 12,
  verticalAlign: "top",
};

export default async function AcompanhamentoGestao({
  searchParams,
}: Props) {

  const armazenamento = await cookies();
  const token = armazenamento.get("kidy_session")?.value;

  if (!token) redirect("/");

  const sessao = await validarToken(token);

  if (!sessao) redirect("/");

  const perfil = texto(sessao.perfil).toUpperCase();

  if (!["ADMIN", "ADMINISTRADOR"].includes(perfil)) {
    redirect("/dashboard");
  }

  const parametros = await searchParams;

  const parametro = (nome: string) => {
    const valor = parametros[nome];
    return texto(Array.isArray(valor) ? valor[0] : valor);
  };

  const usuarioFiltro = parametro("usuario").slice(0, 100);
  const clienteFiltro = parametro("cliente").slice(0, 50);

  const resultadoFiltro = parametro("resultado").slice(0, 60);

  const resultadosGestao = [
    ["AGUARDANDO_CREDITO", "Aguardando crédito"],
    ["CREDITO_NEGADO", "Crédito negado"],
    ["LOJA_FECHADA", "Loja fechada"],
    ["PAROU_TRABALHAR_CALCADOS", "Parou de trabalhar com calçados"],
    ["SEM_INTERESSE", "Sem interesse"],
    ["EMPRESA_ENCERRADA", "Empresa encerrada"],
  ];

  const resultadoValido = resultadosGestao.some(
    ([codigo]) => codigo === resultadoFiltro
  ) ? resultadoFiltro : "";
  const inicio = parametro("inicio");
  const fim = parametro("fim");

  const valido = (data: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(data);

  const pagina = Math.max(
    1,
    Math.min(1000000, Number(parametro("pagina")) || 1)
  );

  let consulta = supabase
    .from("kidy_reativacao_historico")
    .select("*", { count: "exact" });

  if (usuarioFiltro) {
    consulta = consulta.ilike(
      "usuario",
      `%${usuarioFiltro}%`
    );
  }

  if (clienteFiltro) {
    consulta = consulta.eq(
      "codigo_cliente",
      clienteFiltro
    );
  }

  if (resultadoValido) {
    consulta = consulta.eq(
      "classificacao_nova",
      resultadoValido
    );
  }

  if (valido(inicio)) {
    consulta = consulta.gte(
      "criado_em",
      `${inicio}T00:00:00-03:00`
    );
  }

  if (valido(fim)) {
    consulta = consulta.lte(
      "criado_em",
      `${fim}T23:59:59.999-03:00`
    );
  }

  const primeiro = (pagina - 1) * LIMITE;

  const { data, count, error } = await consulta
    .order("criado_em", { ascending: false })
    .order("id", { ascending: false })
    .range(primeiro, primeiro + LIMITE - 1);

  const registros = (data ?? []) as Registro[];
  const total = count ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE));

  const urlPagina = (numero: number) => {
    const q = new URLSearchParams();

    if (usuarioFiltro) q.set("usuario", usuarioFiltro);
    if (clienteFiltro) q.set("cliente", clienteFiltro);
    if (resultadoValido) q.set("resultado", resultadoValido);
    if (inicio) q.set("inicio", inicio);
    if (fim) q.set("fim", fim);

    q.set("pagina", String(numero));

    return `/admin/gestao-reativacao?${q.toString()}`;
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "28px clamp(16px,3vw,48px)",
        background: "#fff8ef",
        color: "#422006",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <div>
          <div
            style={{
              color: "#ea580c",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 2,
            }}
          >
            KIDY SALES INTELLIGENCE
          </div>

          <h1 style={{ margin: "8px 0" }}>
            Acompanhamento da Gestão de Reativação
          </h1>

          <p style={{ margin: 0, fontSize: 13 }}>
            Histórico do que foi salvo pelos representantes
            na gestão dos clientes.
          </p>
        </div>

        <Link href="/dashboard">
          Voltar ao sistema
        </Link>
      </header>

      <section style={{ ...caixa, marginBottom: 18 }}>
        <form
          method="GET"
          action="/admin/gestao-reativacao"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "end",
            gap: 12,
          }}
        >
          <label style={{ flex: "1 1 160px", fontSize: 12 }}>
            Usuário / representante
            <input
              name="usuario"
              defaultValue={usuarioFiltro}
              placeholder="Login do representante"
              style={entrada}
            />
          </label>

          <label style={{ flex: "1 1 140px", fontSize: 12 }}>
            Código do cliente
            <input
              name="cliente"
              defaultValue={clienteFiltro}
              placeholder="Ex.: 9964"
              style={entrada}
            />
          </label>

          <label style={{ flex: "1 1 200px", fontSize: 12 }}>
            Resultado da Gestão
            <select
              name="resultado"
              defaultValue={resultadoValido}
              style={entrada}
            >
              <option value="">Todos os resultados</option>
              {resultadosGestao.map(([codigo, nome]) => (
                <option key={codigo} value={codigo}>
                  {nome}
                </option>
              ))}
            </select>
          </label>

          <label style={{ flex: "1 1 140px", fontSize: 12 }}>
            Data inicial
            <input
              type="date"
              name="inicio"
              defaultValue={inicio}
              style={entrada}
            />
          </label>

          <label style={{ flex: "1 1 140px", fontSize: 12 }}>
            Data final
            <input
              type="date"
              name="fim"
              defaultValue={fim}
              style={entrada}
            />
          </label>

          <button
            type="submit"
            style={{
              background: "#ea580c",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              padding: "12px 18px",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Aplicar filtros
          </button>

          <Link href="/admin/gestao-reativacao">
            Limpar
          </Link>
        </form>
      </section>

      {error ? (
        <section style={caixa}>
          <strong>Erro ao carregar movimentações.</strong>
          <p>{error.message}</p>
        </section>
      ) : (
        <>
          <section
            style={{
              ...caixa,
              marginBottom: 18,
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: 12 }}>
                MOVIMENTAÇÕES REGISTRADAS
              </div>
              <strong style={{ fontSize: 30 }}>
                {total.toLocaleString("pt-BR")}
              </strong>
            </div>

            <div style={{ alignSelf: "center" }}>
              Exibindo página {pagina} de {totalPaginas}
            </div>
          </section>

          <section style={caixa}>
            <h2 style={{ marginTop: 0 }}>
              Histórico de movimentações
            </h2>

            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr>
                    {[
                      "Data / hora",
                      "Usuário que salvou",
                      "Cliente",
                      "Resultado da Gestão",
                      "Classificação anterior",
                      "Nova classificação",
                      "Tentativas",
                      "Retorno do cliente",
                      "Próxima ação",
                      "Data da ação",
                      "Situação",
                      "Responsável",
                      "Observações",
                    ].map(titulo => (
                      <th key={titulo} style={cabecalho}>
                        {titulo}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {registros.map((registro, i) => (
                    <tr key={texto(registro.id) || String(i)}>
                      <td style={celula}>
                        {dataBR(registro.criado_em)}
                      </td>

                      <td style={celula}>
                        <strong>{campo(registro, "usuario")}</strong>
                      </td>

                      <td style={celula}>
                        <Link
                          href={`/cliente/${encodeURIComponent(
                            campo(registro, "codigo_cliente")
                          )}`}
                        >
                          {campo(registro, "codigo_cliente")}
                        </Link>
                      </td>

                      <td style={{
                        ...celula,
                        minWidth: 220,
                      }}>
                        <strong style={{ color: "#9a3412" }}>
                          {rotulo(registro.classificacao_nova)}
                        </strong>

                        {texto(registro.retorno) && (
                          <div style={{ marginTop: 6 }}>
                            <strong>Retorno: </strong>
                            {texto(registro.retorno)}
                          </div>
                        )}
                      </td>

                      <td style={celula}>
                        {rotulo(registro.classificacao_anterior)}
                      </td>

                      <td style={celula}>
                        <strong>
                          {rotulo(registro.classificacao_nova)}
                        </strong>
                      </td>

                      <td style={celula}>
                        {campo(registro, "tentativas_contato")}
                      </td>

                      <td style={{ ...celula, minWidth: 180 }}>
                        {campo(registro, "retorno")}
                      </td>

                      <td style={{ ...celula, minWidth: 180 }}>
                        {campo(registro, "proxima_acao")}
                      </td>

                      <td style={celula}>
                        {campo(registro, "data_proxima_acao")}
                      </td>

                      <td style={celula}>
                        {rotulo(registro.status_acao)}
                      </td>

                      <td style={celula}>
                        {campo(registro, "responsavel")}
                      </td>

                      <td style={{ ...celula, minWidth: 180 }}>
                        {campo(registro, "observacoes")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {registros.length === 0 && (
              <p>Nenhuma movimentação encontrada.</p>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 20,
              }}
            >
              {pagina > 1 ? (
                <Link href={urlPagina(pagina - 1)}>
                  Página anterior
                </Link>
              ) : <span />}

              {pagina < totalPaginas && (
                <Link href={urlPagina(pagina + 1)}>
                  Próxima página
                </Link>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}