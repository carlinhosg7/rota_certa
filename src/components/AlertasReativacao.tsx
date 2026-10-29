"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type TipoAlerta = "ATRASADA" | "HOJE" | "AMANHA";

type Alerta = {
  codigoCliente: string;
  razaoSocial: string;
  responsavel: string;
  representante: string;
  supervisor: string;
  proximaAcao: string;
  data: string;
  tipo: TipoAlerta;
};

type Resumo = {
  atrasadas: number;
  hoje: number;
  amanha: number;
  total: number;
};

type Resposta = {
  sucesso: boolean;
  erro?: string;
  resumo?: Resumo;
  alertas?: Alerta[];
};

const resumoVazio: Resumo = {
  atrasadas: 0,
  hoje: 0,
  amanha: 0,
  total: 0
};

function formatarData(data: string) {
  const partes = data.slice(0, 10).split("-");
  if (partes.length !== 3) return data;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function tituloTipo(tipo: TipoAlerta) {
  if (tipo === "ATRASADA") return "Atrasada";
  if (tipo === "HOJE") return "Hoje";
  return "Amanhã";
}

function corTipo(tipo: TipoAlerta) {
  if (tipo === "ATRASADA") return "#b91c1c";
  if (tipo === "HOJE") return "#c2410c";
  return "#1d4ed8";
}

export default function AlertasReativacao() {
  const [aberto, setAberto] = useState(false);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [resumo, setResumo] = useState<Resumo>(resumoVazio);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<
    "TODOS" | TipoAlerta
  >("TODOS");

  const atualizar = useCallback(async () => {
    try {
      const resposta = await fetch("/api/alertas-reativacao", {
        credentials: "same-origin",
        cache: "no-store"
      });

      if (!resposta.ok) {
        throw new Error(`Falha HTTP ${resposta.status}`);
      }

      const dados = (await resposta.json()) as Resposta;

      if (!dados.sucesso) {
        throw new Error(dados.erro || "Erro na consulta");
      }

      setAlertas(dados.alertas ?? []);
      setResumo(dados.resumo ?? resumoVazio);
      setErro("");

      return dados.resumo?.total ?? 0;
    } catch (e) {
      setErro(
        e instanceof Error ? e.message : "Erro ao atualizar alertas"
      );
      return 0;
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    let ativo = true;

    async function iniciar() {
      const total = await atualizar();

      if (!ativo) return;

      // Mostra automaticamente o painel na entrada do dashboard.
      if (total > 0) {
        setAberto(true);
      }
    }

    void iniciar();

    const intervalo = window.setInterval(() => {
      void atualizar();
    }, 60000);

    function aoFocar() {
      void atualizar();
    }

    window.addEventListener("focus", aoFocar);

    return () => {
      ativo = false;
      window.clearInterval(intervalo);
      window.removeEventListener("focus", aoFocar);
    };
  }, [atualizar]);

  const filtrados =
    filtro === "TODOS"
      ? alertas
      : alertas.filter(a => a.tipo === filtro);

  return (
    <div style={{ position: "relative", zIndex: 30 }}>
      <button
        type="button"
        onClick={() => {
          if (!aberto) void atualizar();
          setAberto(v => !v);
        }}
        aria-label="Abrir notificações de reativação"
        aria-expanded={aberto}
        style={{
          position: "relative",
          border: "1px solid #fed7aa",
          borderRadius: 12,
          background: "#fff7ed",
          padding: "10px 14px",
          cursor: "pointer",
          fontWeight: 700,
          color: "#7c2d12",
          whiteSpace: "nowrap"
        }}
      >
        {"\uD83D\uDD14"} Alertas
        {resumo.total > 0 && (
          <span
            style={{
              display: "inline-block",
              marginLeft: 8,
              background: "#dc2626",
              color: "#fff",
              padding: "3px 7px",
              borderRadius: 20,
              fontSize: 12
            }}
          >
            {resumo.total}
          </span>
        )}
      </button>

      {aberto && (
        <div
          role="dialog"
          aria-label="Notificações de reativação"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: "6vh 16px 24px",
            zIndex: 1000,
            overflowY: "auto"
          }}
          onClick={() => setAberto(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 860,
              maxHeight: "85vh",
              overflowY: "auto",
              background: "#fff",
              borderRadius: 18,
              padding: 24,
              boxShadow: "0 20px 60px rgba(0,0,0,.2)"
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap"
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 23 }}>
                  Central de Reativação
                </h2>
                <p style={{ color: "#64748b", margin: "6px 0 0" }}>
                  Acompanhamento das ações comerciais pendentes
                </p>
              </div>

              <button
                type="button"
                onClick={() => setAberto(false)}
                style={{
                  border: "1px solid #e2e8f0",
                  background: "#fff",
                  borderRadius: 9,
                  padding: "9px 13px",
                  cursor: "pointer"
                }}
              >
                Fechar ×
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 10,
                marginTop: 20
              }}
            >
              {[
                ["Atrasadas", resumo.atrasadas, "#b91c1c"],
                ["Hoje", resumo.hoje, "#c2410c"],
                ["Amanhã", resumo.amanha, "#1d4ed8"]
              ].map(([titulo, valor, cor]) => (
                <div
                  key={String(titulo)}
                  style={{
                    padding: 14,
                    background: "#f8fafc",
                    borderRadius: 12,
                    borderTop: `3px solid ${cor}`
                  }}
                >
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {titulo}
                  </div>
                  <strong style={{ fontSize: 26, color: String(cor) }}>
                    {valor}
                  </strong>
                </div>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                margin: "20px 0",
                flexWrap: "wrap"
              }}
            >
              {(
                [
                  ["TODOS", "Todos"],
                  ["ATRASADA", "Atrasadas"],
                  ["HOJE", "Hoje"],
                  ["AMANHA", "Amanhã"]
                ] as const
              ).map(([valor, titulo]) => (
                <button
                  key={valor}
                  type="button"
                  onClick={() => setFiltro(valor)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 9,
                    border: "1px solid #fed7aa",
                    background: filtro === valor ? "#f97316" : "#fff",
                    color: filtro === valor ? "#fff" : "#9a3412",
                    cursor: "pointer",
                    fontWeight: 700
                  }}
                >
                  {titulo}
                </button>
              ))}

              <button
                type="button"
                onClick={() => void atualizar()}
                style={{
                  marginLeft: "auto",
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  padding: "8px 12px",
                  borderRadius: 9,
                  cursor: "pointer"
                }}
              >
                Atualizar
              </button>
            </div>

            {erro && (
              <p style={{ color: "#b91c1c" }}>
                Não foi possível atualizar: {erro}
              </p>
            )}

            {carregando && <p>Carregando notificações...</p>}

            {!carregando && filtrados.length === 0 && (
              <p style={{ padding: 20, color: "#64748b" }}>
                Nenhuma ação pendente neste filtro.
              </p>
            )}

            <div style={{ display: "grid", gap: 10 }}>
              {filtrados.map(a => (
                <div
                  key={`${a.codigoCliente}-${a.data}`}
                  style={{
                    border: "1px solid #e2e8f0",
                    borderLeft: `5px solid ${corTipo(a.tipo)}`,
                    borderRadius: 12,
                    padding: 15,
                    background: "#fff"
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap"
                    }}
                  >
                    <strong>
                      {a.codigoCliente} — {a.razaoSocial}
                    </strong>
                    <span
                      style={{
                        color: corTipo(a.tipo),
                        fontWeight: 800,
                        fontSize: 13
                      }}
                    >
                      {tituloTipo(a.tipo)} · {formatarData(a.data)}
                    </span>
                  </div>

                  <p style={{ margin: "10px 0 6px" }}>
                    <strong>Próxima ação:</strong>{" "}
                    {a.proximaAcao || "Não informada"}
                  </p>

                  <p
                    style={{
                      color: "#475569",
                      fontSize: 13,
                      margin: "4px 0"
                    }}
                  >
                    <strong>Responsável:</strong>{" "}
                    {a.responsavel || "Não informado"}
                  </p>

                  <p
                    style={{
                      color: "#64748b",
                      fontSize: 12,
                      margin: "4px 0 12px"
                    }}
                  >
                    Representante: {a.representante || "-"}
                    {" | "}
                    Supervisor: {a.supervisor || "-"}
                  </p>

                  <Link
                    href={`/cliente/${encodeURIComponent(a.codigoCliente)}`}
                    style={{
                      display: "inline-block",
                      background: "#f97316",
                      color: "#fff",
                      textDecoration: "none",
                      padding: "8px 12px",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 700
                    }}
                  >
                    Abrir Cliente 360º
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}