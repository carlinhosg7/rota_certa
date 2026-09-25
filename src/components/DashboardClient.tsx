"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import s from "./DashboardClient.module.css";
import VendaMaisMap from "@/components/VendaMaisMap";

type Sup = { codigo: string; nome: string; label: string };

type Cliente = {
  codigo: string;
  razao: string;
  cidade: string;
  uf: string;
  status: string;
  diasSemCompra: number;
  ultimaCompra: string;
  limite: number;
  bloqueio: string;
  temReposicao: boolean;
  qtdReposicoes: number;
  temCampanhaReposicao: boolean;
  qtdReposicoesCampanha: number;
  reposicoes: Array<{
    referencia: string;
    nome: string;
    ultimaCompra: string;
    diasSemCompra: number;
    campanha: string | null;
  }>;
};

type Rota = {
  ordem: number;
  cidade: string;
  uf: string;
  cityKey: string;
  lat: number;
  lon: number;
  distanciaKm: number;
  distanciaAnteriorKm: number;
  distanciaAcumuladaKm: number;
  clientes: number;
  vermelhos: number;
  amarelos: number;
  verdes: number;
  clientesReposicao: number;
  referenciasReposicao: number;
  clientesCampanha: number;
  referenciasCampanha: number;
  diasSemCompraMedio: number;
  limiteTotal: number;
  score: number;
};

type Data = {
  supervisores: Sup[];
  representantes: string[];
  cidades: string[];
  kpis: {
    clientes: number;
    vermelhos: number;
    amarelos: number;
    verdes: number;
  };
  clientes: Cliente[];
  rota?: Rota[];
  raio?: number;
  cidadeBase?: string;
  cidadeClientes?: string | null;
  perfil?: string;
  erro?: string;
};

export default function DashboardClient() {
  const router = useRouter();

  const [sup, setSup] = useState("");
  const [rep, setRep] = useState("");
  const [cidade, setCidade] = useState("");
  const [cidadeClientes, setCidadeClientes] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  async function registrarEvento(evento: string) {
    try {
      const r = await fetch("/api/evento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evento }),
      });

      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        console.error("Erro ao registrar evento:", j);
      }
    } catch (e) {
      console.error("Erro ao registrar evento:", e);
    }
  }

  async function load(
    ns = sup,
    nr = rep,
    nc = cidade,
    nCidadeClientes = ""
  ) {
    setLoading(true);
    setErro("");

    try {
      const q = new URLSearchParams();

      if (ns) q.set("supervisor", ns);
      if (nr) q.set("representante", nr);
      if (nc) q.set("cidade", nc);
      if (nCidadeClientes) q.set("clientesCidade", nCidadeClientes);

      const r = await fetch(`/api/comercial?${q.toString()}`, {
        cache: "no-store",
      });

      const j = await r.json();

      if (!r.ok) {
        throw new Error(j.erro || "Erro");
      }

      setData(j);
    } catch (e: any) {
      setErro(e.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load("", "", "", "");
    registrarEvento("ACESSO_DASHBOARD");
  }, []);

  const k = data?.kpis || {
    clientes: 0,
    vermelhos: 0,
    amarelos: 0,
    verdes: 0,
  };

  function onSup(v: string) {
    setSup(v);
    setRep("");
    setCidade("");
    setCidadeClientes("");
    load(v, "", "", "");

    if (v) registrarEvento("SELECIONOU_SUPERVISOR");
  }

  function onRep(v: string) {
    setRep(v);
    setCidade("");
    setCidadeClientes("");
    load(sup, v, "", "");

    if (v) registrarEvento("SELECIONOU_REPRESENTANTE");
  }

  function onCidade(v: string) {
    setCidade(v);
    setCidadeClientes("");
    load(sup, rep, v, "");

    if (v) registrarEvento("SELECIONOU_CIDADE");
  }

  const rota = data?.rota || [];

  const clientesExibidos = useMemo(
    () => data?.clientes || [],
    [data?.clientes]
  );

  async function selecionarCidadeRota(cityKey: string) {
    setCidadeClientes(cityKey);

    // A cidade-base permanece intacta.
    // Buscamos somente os clientes da etapa clicada.
    await load(sup, rep, cidade, cityKey);

    setTimeout(() => {
      document
        .getElementById("clientes")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  async function abrirCliente(codigo: string) {
    await registrarEvento("ABRIU_CLIENTE");
    router.push(`/cliente/${encodeURIComponent(codigo)}`);
  }

  return (
    <>
      <section id="planejamento" className="panel">
        <div className="panel-title">
          <div>
            <span>01</span>
            <h3>Planejamento comercial</h3>
          </div>
          <small>Bases reais conectadas</small>
        </div>

        <div className="filters">
          <label>
            Supervisor
            <select value={sup} onChange={(e) => onSup(e.target.value)}>
              <option value="">Selecione a regional</option>
              {data?.supervisores.map((x) => (
                <option key={x.codigo} value={x.codigo}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            Representante
            <select
              value={rep}
              onChange={(e) => onRep(e.target.value)}
              disabled={!sup}
            >
              <option value="">
                {sup ? "Selecione o representante" : "Selecione o supervisor"}
              </option>
              {data?.representantes.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>

          <label>
            Cidade base
            <select
              value={cidade}
              onChange={(e) => onCidade(e.target.value)}
              disabled={!rep}
            >
              <option value="">
                {rep ? "Todas as cidades" : "Selecione o representante"}
              </option>
              {data?.cidades.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>

          <label>
            Raio máximo
            <input type="text" value="120 km" readOnly />
          </label>
        </div>
      </section>

      {erro && <div className={s.error}>{erro}</div>}

      {loading && (
        <div className={s.loading}>Carregando bases comerciais...</div>
      )}

      <section className="cards">
        <article>
          <span className="card-icon orange">◎</span>
          <div>
            <small>CLIENTES</small>
            <strong>{rep ? k.clientes : "—"}</strong>
            <p>{cidade || "Carteira selecionada"}</p>
          </div>
        </article>

        <article>
          <span className="card-icon red">●</span>
          <div>
            <small>NÃO POSITIVADOS</small>
            <strong>{rep ? k.vermelhos : "—"}</strong>
            <p>Sem compra no ano</p>
          </div>
        </article>

        <article>
          <span className="card-icon yellow">●</span>
          <div>
            <small>ATENÇÃO</small>
            <strong>{rep ? k.amarelos : "—"}</strong>
            <p>Sem compra desde maio</p>
          </div>
        </article>

        <article>
          <span className="card-icon green">●</span>
          <div>
            <small>ATIVOS</small>
            <strong>{rep ? k.verdes : "—"}</strong>
            <p>Ativos desde maio</p>
          </div>
        </article>
      </section>

      {rep && cidade && rota.length > 0 && (
        <section id="venda-mais" className="panel">
          <div className="panel-title">
            <div>
              <span>02</span>
              <h3>Venda Mais+</h3>
            </div>
            <small>Rota comercial sugerida</small>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div
              style={{
                padding: 14,
                border: "1px solid #f0c48a",
                borderRadius: 14,
              }}
            >
              <small>CIDADES</small>
              <strong style={{ display: "block", fontSize: 24 }}>
                {rota.length}
              </strong>
            </div>

            <div
              style={{
                padding: 14,
                border: "1px solid #f0c48a",
                borderRadius: 14,
              }}
            >
              <small>CLIENTES NA ROTA</small>
              <strong style={{ display: "block", fontSize: 24 }}>
                {rota.reduce((a, r) => a + r.clientes, 0)}
              </strong>
            </div>

            <div
              style={{
                padding: 14,
                border: "1px solid #f0c48a",
                borderRadius: 14,
              }}
            >
              <small>PRIORITÁRIOS</small>
              <strong style={{ display: "block", fontSize: 24 }}>
                {rota.reduce((a, r) => a + r.vermelhos, 0)}
              </strong>
            </div>

            <div
              style={{
                padding: 14,
                border: "1px solid #f0c48a",
                borderRadius: 14,
              }}
            >
              <small>PERCURSO ESTIMADO</small>
              <strong style={{ display: "block", fontSize: 24 }}>
                {rota[
                  rota.length - 1
                ]?.distanciaAcumuladaKm.toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                })}{" "}
                km
              </strong>
            </div>
          </div>

          <div style={{ marginTop: 20, marginBottom: 24 }}>
            <VendaMaisMap
              rota={rota}
              onCidadeClick={selecionarCidadeRota}
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              overflowX: "auto",
              paddingBottom: 8,
              alignItems: "stretch",
            }}
          >
            {rota.map((r, i) => (
              <div
                key={r.cityKey}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flex: "0 0 auto",
                }}
              >
                {i > 0 && (
                  <div
                    style={{
                      minWidth: 72,
                      textAlign: "center",
                      fontSize: 12,
                      color: "#9a5b12",
                    }}
                  >
                    →{" "}
                    {r.distanciaAnteriorKm.toLocaleString("pt-BR", {
                      maximumFractionDigits: 1,
                    })}{" "}
                    km
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => selecionarCidadeRota(r.cityKey)}
                  style={{
                    minWidth: 190,
                    textAlign: "left",
                    padding: 14,
                    border: "1px solid #f0b35d",
                    borderRadius: 14,
                    background:
                      cidadeClientes === r.cityKey ? "#fff0d6" : "#fffaf3",
                    cursor: "pointer",
                    color: "inherit",
                  }}
                >
                  <small style={{ fontWeight: 800, color: "#c56a00" }}>
                    {String(r.ordem).padStart(2, "0")} • SCORE{" "}
                    {r.score.toFixed(3)}
                  </small>

                  <strong style={{ display: "block", margin: "5px 0" }}>
                    {r.cidade} / {r.uf}
                  </strong>

                  <span style={{ fontSize: 12 }}>
                    {r.clientes} clientes • 🔴 {r.vermelhos} • 🟡{" "}
                    {r.amarelos} • 🟢 {r.verdes}
                    <br />
                    🔄 {r.clientesReposicao} reposição • 🎯 {r.clientesCampanha} campanha
                  </span>
                </button>
              </div>
            ))}
          </div>

          <p style={{ marginTop: 12, fontSize: 12, color: "#8b5a2b" }}>
            Distâncias geográficas estimadas. Clique em uma cidade para ver os
            clientes daquela etapa.
          </p>
        </section>
      )}

      <section id="clientes" className="panel">
        <div className="panel-title">
          <div>
            <span>{rep && cidade && rota.length > 0 ? "03" : "02"}</span>
            <h3>
              {cidadeClientes
                ? `Clientes — ${cidadeClientes}`
                : "Clientes prioritários"}
            </h3>
          </div>

          <small>
            {rep ? (
              <>
                <b className={s.count}>{clientesExibidos.length}</b> registros
                exibidos
              </>
            ) : (
              "Selecione um representante"
            )}
          </small>
        </div>

        {!rep ? (
          <div className={s.empty}>
            Selecione Supervisor → Representante para carregar a carteira real.
          </div>
        ) : clientesExibidos.length === 0 ? (
          <div className={s.empty}>
            Nenhum cliente encontrado para a cidade selecionada.
          </div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Razão Social</th>
                  <th>Cidade</th>
                  <th>Status</th>
                  <th>Oportunidade</th>
                  <th>Dias sem compra</th>
                  <th>Última compra</th>
                  <th>Limite</th>
                  <th>Financeiro</th>
                </tr>
              </thead>

              <tbody>
                {clientesExibidos.map((c) => (
                  <tr
                    key={c.codigo}
                    onClick={() => abrirCliente(c.codigo)}
                    style={{ cursor: "pointer" }}
                    title="Abrir visão 360º do cliente"
                  >
                    <td>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          abrirCliente(c.codigo);
                        }}
                        style={{
                          background: "none",
                          border: 0,
                          padding: 0,
                          font: "inherit",
                          fontWeight: 800,
                          cursor: "pointer",
                          color: "inherit",
                          textDecoration: "underline",
                        }}
                      >
                        {c.codigo}
                      </button>
                    </td>

                    <td>{c.razao}</td>
                    <td>
                      {c.cidade} - {c.uf}
                    </td>
                    <td className={s.status}>{c.status}</td>
                    <td>
                      {c.temReposicao ? (
                        <span title={c.reposicoes.map((r) => `${r.referencia} - ${r.nome || "Produto"}: ${r.diasSemCompra} dias${r.campanha ? ` - ${r.campanha}` : ""}`).join("\n")}>
                          🔄 {c.qtdReposicoes} refs.
                          {c.temCampanhaReposicao ? ` • 🎯 ${c.qtdReposicoesCampanha}` : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{c.diasSemCompra}</td>
                    <td>
                      {c.ultimaCompra
                        ? new Date(
                            c.ultimaCompra + "T00:00:00"
                          ).toLocaleDateString("pt-BR")
                        : "—"}
                    </td>
                    <td>
                      {c.limite.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </td>
                    <td>{c.bloqueio || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
