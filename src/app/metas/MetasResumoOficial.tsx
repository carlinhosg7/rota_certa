"use client";

import { useEffect, useState } from "react";

type Indicador = {
  chave: string;
  titulo: string;
  metaPares: number | string;
  metaValor: number | string;
  realizadoPares: number | string | null;
  realizadoValor: number | string | null;
};
type Opcao = { codigo: string; nome: string };
type Resposta = {
  competencia: string;
  indicadores: Indicador[];
  filtros: { supervisores: string[]; representantes: Opcao[] };
  erro?: string;
};
const meses = [
  ["2026-11-01", "Novembro/2026"],
  ["2026-12-01", "Dezembro/2026"],
  ["2027-01-01", "Janeiro/2027"],
  ["2027-02-01", "Fevereiro/2027"],
  ["2027-03-01", "Março/2027"],
  ["2027-04-01", "Abril/2027"],
] as const;
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const paresFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const pctFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const num = (v: number | string | null | undefined) => Number(v ?? 0);

export default function MetasResumoOficial() {
  const [competencia, setCompetencia] = useState<string>("2026-11-01");
  const [supervisor, setSupervisor] = useState("");
  const [representante, setRepresentante] = useState("");
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const ctrl = new AbortController();
    async function executar() {
      setCarregando(true);
      setErro("");
      try {
        const params = new URLSearchParams({ competencia });
        if (supervisor) params.set("supervisor", supervisor);
        if (representante) params.set("representante", representante);
        const resposta = await fetch(`/api/campanha?${params}`, {
          credentials: "same-origin", cache: "no-store", signal: ctrl.signal,
        });
        const json = await resposta.json() as Resposta;
        if (!resposta.ok) throw new Error(json.erro || "Falha ao buscar realizados oficiais");
        if (!ctrl.signal.aborted) setDados(json);
      } catch (e) {
        if (!ctrl.signal.aborted) { setDados(null); setErro(e instanceof Error ? e.message : "Erro de consulta"); }
      } finally {
        if (!ctrl.signal.aborted) setCarregando(false);
      }
    }
    void executar();
    return () => ctrl.abort();
  }, [competencia, supervisor, representante]);

  const buscar = (chave: string): Indicador | undefined => dados?.indicadores.find((i) => i.chave === chave);
  const producao = buscar("PRODUCAO");
  const kidex = buscar("KIDEX");
  const faturamento = buscar("FATURAMENTO");
  const entradaGeral: Indicador | undefined = producao && kidex ? {
    chave: "ENTRADA_GERAL", titulo: "Entrada Geral",
    metaPares: num(producao.metaPares) + num(kidex.metaPares),
    metaValor: num(producao.metaValor) + num(kidex.metaValor),
    realizadoPares: producao.realizadoPares === null && kidex.realizadoPares === null
      ? null : num(producao.realizadoPares) + num(kidex.realizadoPares),
    realizadoValor: producao.realizadoValor === null && kidex.realizadoValor === null
      ? null : num(producao.realizadoValor) + num(kidex.realizadoValor),
  } : undefined;
  const indicadores = [producao, kidex, entradaGeral, faturamento].filter((i): i is Indicador => Boolean(i));
  const selectStyle: React.CSSProperties = { width: "100%", minHeight: 38, borderRadius: 8, border: "1px solid #d5dbe4", padding: "7px 9px", background: "#fff", color: "#243044" };

  return (
    <section style={{ marginBottom: 30, padding: 20, border: "1px solid #dfe5ec", borderRadius: 16, background: "#fff" }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 6px", color: "#1c2d43", fontSize: 21 }}>Metas e realizados oficiais — KIDY</h2>
        <p style={{ margin: 0, fontSize: 13, color: "#5f6c80" }}>
          Mesma base mensal homologada na campanha. Entrada Geral = Produção + KIDEX, sem duplicidade.
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600 }}>Competência
          <select aria-label="Competência oficial" style={selectStyle} value={competencia} onChange={(e) => { setCompetencia(e.target.value); setSupervisor(""); setRepresentante(""); }}>
            {meses.map(([codigo, nome]) => <option key={codigo} value={codigo}>{nome}</option>)}
          </select>
        </label>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600 }}>Supervisor
          <select aria-label="Supervisor oficial" style={selectStyle} value={supervisor} onChange={(e) => { setSupervisor(e.target.value); setRepresentante(""); }}>
            <option value="">Todos os supervisores</option>
            {(dados?.filtros?.supervisores ?? []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600 }}>Representante
          <select aria-label="Representante oficial" style={selectStyle} value={representante} onChange={(e) => setRepresentante(e.target.value)}>
            <option value="">Todos os representantes</option>
            {(dados?.filtros?.representantes ?? []).map((r) => <option key={r.codigo} value={r.codigo}>{r.codigo} — {r.nome}</option>)}
          </select>
        </label>
      </div>
      {carregando && <p role="status">Carregando realizados oficiais...</p>}
      {erro && <p role="alert" style={{ color: "#b42318" }}>{erro}</p>}
      {!carregando && !erro && indicadores.length === 4 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {indicadores.map((i) => {
            const meta = num(i.metaValor);
            const realizado = i.realizadoValor === null ? null : num(i.realizadoValor);
            const atingimento = meta > 0 && realizado !== null ? 100 * realizado / meta : null;
            return <article key={i.chave} style={{ padding: 16, border: "1px solid #e2e8ef", borderRadius: 12, background: i.chave === "ENTRADA_GERAL" ? "#fff9ef" : "#f8fafc" }}>
              <h3 style={{ margin: "0 0 14px", fontSize: 15, color: "#263a54" }}>{i.titulo}</h3>
              <div style={{ fontSize: 12, color: "#66758b" }}>Realizado</div>
              <div style={{ fontSize: 21, fontWeight: 800, color: "#174568", overflowWrap: "anywhere" }}>{realizado === null ? "Aguardando" : moeda.format(realizado)}</div>
              <div style={{ marginTop: 12, fontSize: 12, color: "#66758b" }}>Meta</div>
              <div style={{ fontWeight: 700, color: "#263a54" }}>{moeda.format(meta)}</div>
              <div style={{ marginTop: 12, fontSize: 12, color: "#66758b" }}>Pares realizados / Meta</div>
              <div style={{ fontWeight: 650 }}>{i.realizadoPares === null ? "Aguardando" : paresFmt.format(num(i.realizadoPares))} / {paresFmt.format(num(i.metaPares))}</div>
              <div style={{ height: 7, borderRadius: 8, background: "#e5ebf2", marginTop: 14, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, atingimento ?? 0))}%`, background: "#ef8a16" }} />
              </div>
              <div style={{ textAlign: "right", marginTop: 5, color: "#455b75", fontWeight: 700, fontSize: 12 }}>{atingimento === null ? "Aguardando" : `${pctFmt.format(atingimento)}%`}</div>
            </article>;
          })}
        </div>
      )}
      {!carregando && !erro && indicadores.length !== 4 && <p role="alert">A API da campanha não retornou os três indicadores necessários.</p>}
      <p style={{ margin: "15px 0 0", color: "#788599", fontSize: 11 }}>
        Fonte: realizados mensais ativos do Supabase, por meio da API da campanha. Os relatórios detalhados anteriores estão disponíveis na seção expansível.
      </p>
    </section>
  );
}
