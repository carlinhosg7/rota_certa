"use client";

import { useEffect, useMemo, useState } from "react";
import EditarRepresentante from "./EditarRepresentante";

type Representante = {
  codigo_rep: string;
  nome_rep: string | null;
  regional: string;
  codigo_supervisor: string | null;
  ativo: boolean;
};

type Conversao = {
  id: number;
  codigo_antigo: string;
  codigo_atual: string;
};

type Historico = {
  id: number;
  codigo_anterior: string | null;
  nome_anterior: string | null;
  codigo_novo: string | null;
  nome_novo: string | null;
  regional_anterior: string | null;
  regional_nova: string | null;
  data_efetiva: string | null;
  registrado_em: string | null;
  usuario_responsavel: string | null;
  motivo: string | null;
};

type Dados = {
  sucesso: boolean;
  representantes: Representante[];
  dePara: Conversao[];
  historico: Historico[];
};

export default function RepresentantesClient({
  administrador,
}: {
  administrador: string;
}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [editando, setEditando] = useState<Representante | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [pesquisa, setPesquisa] = useState("");
  const [regional, setRegional] = useState("");
  const [aba, setAba] = useState<"cadastro" | "historico">("cadastro");

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      try {
        const resposta = await fetch("/api/admin/representantes", {
          cache: "no-store",
        });

        if (!resposta.ok) {
          throw new Error("Não foi possível consultar os representantes.");
        }

        const resultado: Dados = await resposta.json();

        if (ativo) setDados(resultado);
      } catch (e) {
        if (ativo) {
          setErro(e instanceof Error ? e.message : "Erro desconhecido.");
        }
      } finally {
        if (ativo) setCarregando(false);
      }
    }

    carregar();

    return () => {
      ativo = false;
    };
  }, []);

  async function atualizarAposSalvar() {
    const resposta = await fetch("/api/admin/representantes", {
      cache: "no-store",
    });
    if (!resposta.ok) {
      throw new Error("Alteração salva, mas não foi possível atualizar a consulta.");
    }
    const resultado: Dados = await resposta.json();
    setDados(resultado);
    setEditando(null);
  }
  const regionais = useMemo(
    () =>
      [...new Set((dados?.representantes ?? []).map((r) => r.regional))]
        .filter(Boolean)
        .sort(),
    [dados]
  );

  const conversoes = useMemo(() => {
    const mapa = new Map<string, string[]>();

    for (const item of dados?.dePara ?? []) {
      const lista = mapa.get(item.codigo_atual) ?? [];
      lista.push(item.codigo_antigo);
      mapa.set(item.codigo_atual, lista);
    }

    return mapa;
  }, [dados]);

  const filtrados = useMemo(() => {
    const termo = pesquisa.trim().toLocaleLowerCase("pt-BR");

    return (dados?.representantes ?? []).filter((r) => {
      const antigos = conversoes.get(r.codigo_rep) ?? [];

      const texto = [
        r.codigo_rep,
        r.nome_rep ?? "",
        r.regional,
        ...antigos,
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR");

      return (!termo || texto.includes(termo)) &&
        (!regional || r.regional === regional);
    });
  }, [dados, pesquisa, regional, conversoes]);

  const historicoFiltrado = useMemo(() => {
    const termo = pesquisa.trim().toLocaleLowerCase("pt-BR");

    return (dados?.historico ?? []).filter((h) =>
      [
        h.codigo_anterior,
        h.nome_anterior,
        h.codigo_novo,
        h.nome_novo,
        h.motivo,
        h.usuario_responsavel,
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(termo)
    );
  }, [dados, pesquisa]);

  const estilo: Record<string, React.CSSProperties> = {
    pagina: {
      minHeight: "100vh",
      background: "#f5f6f8",
      padding: "32px",
      color: "#253044",
      fontFamily: "Arial, sans-serif",
    },
    painel: {
      maxWidth: 1450,
      margin: "0 auto",
    },
    cartao: {
      background: "#fff",
      border: "1px solid #e5e7eb",
      borderRadius: 14,
      padding: 20,
      marginBottom: 20,
    },
    campo: {
      padding: "11px 14px",
      border: "1px solid #d5d9e0",
      borderRadius: 9,
      background: "#fff",
      color: "#253044",
      minWidth: 220,
    },
    tabela: {
      width: "100%",
      borderCollapse: "collapse",
      fontSize: 13,
    },
    cabecalho: {
      padding: "13px 12px",
      background: "#fff3e8",
      color: "#a64b00",
      textAlign: "left",
      borderBottom: "2px solid #f28c28",
    },
    celula: {
      padding: "12px",
      borderBottom: "1px solid #edf0f3",
      verticalAlign: "top",
    },
  };

  return (
    <main style={estilo.pagina}>
      <div style={estilo.painel}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 24,
        }}>
          <div>
            <div style={{ color: "#f28c28", fontWeight: 700, fontSize: 12 }}>
              KIDY SALES INTELLIGENCE
            </div>
            <h1 style={{ margin: "8px 0" }}>
              Administração de Representantes
            </h1>
            <p style={{ color: "#64748b", margin: 0 }}>
              Cadastro oficial, códigos históricos e regionais.
            </p>
          </div>

          <div style={{ textAlign: "right" }}>
            <strong>{administrador}</strong>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              ADMINISTRADOR
            </div>
            <a href="/dashboard" style={{ color: "#ea7600" }}>
              Voltar ao Dashboard
            </a>
          </div>
        </div>

        {editando && (
          <EditarRepresentante
            representante={editando}
            aoCancelar={() => setEditando(null)}
            aoSalvar={atualizarAposSalvar}
          />
        )}
        {carregando && <div style={estilo.cartao}>Carregando dados...</div>}

        {erro && (
          <div style={{ ...estilo.cartao, color: "#b91c1c" }}>
            {erro}
          </div>
        )}

        {dados && (
          <>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 16,
              marginBottom: 20,
            }}>
              {[
                ["Representantes", dados.representantes.length],
                ["Ativos", dados.representantes.filter(r => r.ativo).length],
                ["Regionais", regionais.length],
                ["Códigos De/Para", dados.dePara.length],
              ].map(([titulo, valor]) => (
                <div key={String(titulo)} style={estilo.cartao}>
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {titulo}
                  </div>
                  <div style={{
                    fontSize: 30,
                    fontWeight: 800,
                    color: "#ea7600",
                    marginTop: 8,
                  }}>
                    {valor}
                  </div>
                </div>
              ))}
            </div>

            <div style={estilo.cartao}>
              <div style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: 18,
              }}>
                <button
                  onClick={() => setAba("cadastro")}
                  style={{
                    ...estilo.campo,
                    minWidth: 0,
                    cursor: "pointer",
                    background: aba === "cadastro" ? "#f28c28" : "#fff",
                    color: aba === "cadastro" ? "#fff" : "#253044",
                  }}
                >
                  Cadastro de Representantes
                </button>

                <button
                  onClick={() => setAba("historico")}
                  style={{
                    ...estilo.campo,
                    minWidth: 0,
                    cursor: "pointer",
                    background: aba === "historico" ? "#f28c28" : "#fff",
                    color: aba === "historico" ? "#fff" : "#253044",
                  }}
                >
                  Histórico de Alterações
                </button>

                <input
                  placeholder="Pesquisar código, nome ou regional"
                  value={pesquisa}
                  onChange={e => setPesquisa(e.target.value)}
                  style={{ ...estilo.campo, flex: 1 }}
                />

                {aba === "cadastro" && (
                  <select
                    value={regional}
                    onChange={e => setRegional(e.target.value)}
                    style={estilo.campo}
                  >
                    <option value="">Todas as regionais</option>
                    {regionais.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                )}
              </div>

              <div style={{ overflowX: "auto" }}>
                {aba === "cadastro" ? (
                  <table style={estilo.tabela}>
                    <thead>
                      <tr>
                        {[
                          "Código",
                          "Representante",
                          "Regional",
                          "Supervisor",
                          "Códigos antigos",
                          "Situação",
                          "Ações",
                        ].map(col => (
                          <th key={col} style={estilo.cabecalho}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtrados.map(r => (
                        <tr key={r.codigo_rep}>
                          <td style={estilo.celula}><strong>{r.codigo_rep}</strong></td>
                          <td style={estilo.celula}>{r.nome_rep || "-"}</td>
                          <td style={estilo.celula}>{r.regional}</td>
                          <td style={estilo.celula}>{r.codigo_supervisor || "-"}</td>
                          <td style={estilo.celula}>
                            {(conversoes.get(r.codigo_rep) ?? []).join(", ") || "-"}
                          </td>
                          <td style={estilo.celula}>
                            {r.ativo ? "Ativo" : "Inativo"}
                          </td>
                          <td style={estilo.celula}>
                            <button
                              type="button"
                              onClick={() => setEditando(r)}
                              style={{
                                padding: "7px 14px",
                                background: "#f28c28",
                                border: 0,
                                borderRadius: 7,
                                color: "#fff",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Editar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table style={estilo.tabela}>
                    <thead>
                      <tr>
                        {[
                          "Data",
                          "Código anterior",
                          "Código atual",
                          "Regional anterior",
                          "Regional atual",
                          "Responsável",
                          "Motivo",
                        ].map(col => (
                          <th key={col} style={estilo.cabecalho}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {historicoFiltrado.map(h => (
                        <tr key={h.id}>
                          <td style={estilo.celula}>
                            {h.registrado_em
                              ? new Date(h.registrado_em).toLocaleString("pt-BR")
                              : "-"}
                          </td>
                          <td style={estilo.celula}>{h.codigo_anterior || "-"}</td>
                          <td style={estilo.celula}>{h.codigo_novo || "-"}</td>
                          <td style={estilo.celula}>{h.regional_anterior || "-"}</td>
                          <td style={estilo.celula}>{h.regional_nova || "-"}</td>
                          <td style={estilo.celula}>{h.usuario_responsavel || "-"}</td>
                          <td style={estilo.celula}>{h.motivo || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <p style={{ color: "#64748b", fontSize: 12, marginTop: 16 }}>
                Consulta somente leitura. Alterações serão habilitadas após validação.
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
