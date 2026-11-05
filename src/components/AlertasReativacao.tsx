"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import GestaoReativacao from "./GestaoReativacao";

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

  // CENTRAL_SUBTELA_REATIVACAO: mesmo formulario do Cliente 360.
  const [clienteGestao, setClienteGestao] = useState<string | null>(null);
type ClienteCarteiraItem = {
    codigoCliente: string;
    razaoSocial: string;
    representante: string;
    supervisor: string;
    ultimaCompra: string | null;
    diasSemCompra: number | null;
    situacao: string;
  };
  const [carteiraItens, setCarteiraItens] = useState<ClienteCarteiraItem[]>([]);
  const [carteiraTotal, setCarteiraTotal] = useState(0);
  const [carteiraPagina, setCarteiraPagina] = useState(1);
  const [carteiraBusca, setCarteiraBusca] = useState("");
  const [carteiraCarregando, setCarteiraCarregando] = useState(false);
  const [carteiraErro, setCarteiraErro] = useState("");
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

  const carregarCarteira = useCallback(async (pagina: number, busca: string) => {
    setCarteiraCarregando(true);
    setCarteiraErro("");
    try {
      const parametros = new URLSearchParams({
        pagina: String(pagina), busca
      });
      const resposta = await fetch(`/api/alertas-reativacao/carteira?${parametros}`, {
        credentials: "same-origin", cache: "no-store"
      });
      const dados = await resposta.json();
      if (!resposta.ok || !dados.sucesso) {
        throw new Error(dados.erro || "Falha ao consultar carteira de reativação.");
      }
      setCarteiraItens(dados.clientes ?? []);
      setCarteiraTotal(dados.total ?? 0);
      setCarteiraPagina(dados.pagina ?? pagina);
    } catch (e) {
      setCarteiraErro(e instanceof Error ? e.message : "Erro ao buscar carteira.");
    } finally {
      setCarteiraCarregando(false);
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

  useEffect(() => {
    if (!aberto || filtro !== "TODOS") return;
    void carregarCarteira(1, carteiraBusca);
  }, [aberto, filtro, carregarCarteira]);

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
                  Carteira completa de reativação e acompanhamento das ações comerciais
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
                  ["TODOS", "Toda carteira"],
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
                onClick={() => { void atualizar(); if (filtro === "TODOS") void carregarCarteira(carteiraPagina, carteiraBusca); }}
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

            {filtro === "TODOS" && (
              <div style={{display:"grid", gap:12}}>
                <form onSubmit={e => {e.preventDefault(); void carregarCarteira(1, carteiraBusca);}}
                      style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <input
                    aria-label="Buscar cliente da carteira de reativação"
                    value={carteiraBusca}
                    onChange={e => setCarteiraBusca(e.target.value)}
                    placeholder="Código ou razão social do cliente"
                    style={{flex:"1 1 220px",minWidth:0,padding:10,borderRadius:8,border:"1px solid #cbd5e1"}}
                  />
                  <button type="submit" style={{padding:"10px 15px",borderRadius:8,background:"#f97316",color:"white",border:0,cursor:"pointer"}}>Buscar</button>
                </form>
                <p style={{fontSize:13,color:"#475569",margin:0}}>
                  <strong>{carteiraTotal.toLocaleString("pt-BR")}</strong> clientes na carteira de reativação permitida para seu perfil
                </p>
                {carteiraErro && <p role="alert" style={{color:"#b91c1c"}}>{carteiraErro}</p>}
                {carteiraCarregando && <p>Carregando carteira de reativação...</p>}
                {!carteiraCarregando && carteiraItens.length === 0 && <p>Nenhum cliente encontrado nesta pesquisa.</p>}
                {!carteiraCarregando && carteiraItens.map(c => (
                  <div key={c.codigoCliente} style={{border:"1px solid #fed7aa",padding:14,borderRadius:12,background:"#fffaf5"}}>
                    <div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
                      <strong>{c.codigoCliente} — {c.razaoSocial || "Razão social não informada"}</strong>
                      <strong style={{color:"#9a3412"}}>{c.diasSemCompra === null ? "Sem histórico de compra" : `${c.diasSemCompra.toLocaleString("pt-BR")} dias sem compra`}</strong>
                    </div>
                    <p style={{fontSize:12,color:"#64748b"}}>
                      Última compra: {c.ultimaCompra ? formatarData(c.ultimaCompra) : "Não informada"} · Representante: {c.representante || "-"} · Supervisor: {c.supervisor || "-"}
                    </p>
                    <Link href={`/cliente/${encodeURIComponent(c.codigoCliente)}`}
                          style={{display:"inline-block",padding:"8px 12px",borderRadius:8,color:"white",background:"#f97316",textDecoration:"none",fontWeight:700,fontSize:13}}>
                      Abrir Cliente 360º
                    </Link>
                  <button
                    type="button"
                    onClick={() => setClienteGestao(c.codigoCliente)}
                    style={{display:"inline-flex",alignItems:"center",marginLeft:8,padding:"8px 12px",
                            borderRadius:8,border:0,background:"#166534",color:"#fff",
                            fontWeight:700,fontSize:13,cursor:"pointer"}}
                  >
                    Gerenciar Reativação
                  </button>
                  </div>
                ))}
                {carteiraTotal > 100 && (
                  <div style={{display:"flex",alignItems:"center",gap:12,justifyContent:"center",padding:8}}>
                    <button type="button" disabled={carteiraPagina <= 1 || carteiraCarregando}
                      onClick={() => void carregarCarteira(carteiraPagina - 1, carteiraBusca)}>Anterior</button>
                    <span>Página {carteiraPagina} de {Math.ceil(carteiraTotal / 100)}</span>
                    <button type="button" disabled={carteiraPagina * 100 >= carteiraTotal || carteiraCarregando}
                      onClick={() => void carregarCarteira(carteiraPagina + 1, carteiraBusca)}>Próxima</button>
                  </div>
                )}
              </div>
            )}

            {filtro !== "TODOS" && (
              <>
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
                  <button
                    type="button"
                    onClick={() => setClienteGestao(a.codigoCliente)}
                    style={{display:"inline-flex",alignItems:"center",marginLeft:8,padding:"8px 12px",
                            borderRadius:8,border:0,background:"#166534",color:"#fff",
                            fontWeight:700,fontSize:13,cursor:"pointer"}}
                  >
                    Gerenciar Reativação
                  </button>
                </div>
              ))}
            </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* CENTRAL_SUBTELA_REATIVACAO: janela de edicao sobre a Central. */}
      {clienteGestao && (
        <div
          role="presentation"
          onClick={() => { setClienteGestao(null); void atualizar(); }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2100,
            background: "rgba(15,23,42,0.65)",
            padding: "3vh 12px",
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-start",
            overflowY: "auto",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Gestão de Reativação do cliente ${clienteGestao}`}
            onClick={e => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 1080,
              maxHeight: "94vh",
              overflowY: "auto",
              borderRadius: 16,
              background: "#fff",
              padding: 20,
              boxShadow: "0 24px 72px rgba(0,0,0,0.25)",
            }}
          >
            <div style={{
              display: "flex",
              gap: 12,
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
              flexWrap: "wrap",
            }}>
              <strong style={{fontSize: 16}}>
                Cliente {clienteGestao} — Gestão de Reativação
              </strong>
              <button
                type="button"
                onClick={() => { setClienteGestao(null); void atualizar(); }}
                style={{
                  background: "#f97316",
                  color: "#fff",
                  border: 0,
                  borderRadius: 9,
                  padding: "10px 16px",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Fechar e voltar à Central
              </button>
            </div>
            <GestaoReativacao codigoCliente={clienteGestao} razaoSocial="" cnpj="" />
          </div>
        </div>
      )}

    </div>
  );
}