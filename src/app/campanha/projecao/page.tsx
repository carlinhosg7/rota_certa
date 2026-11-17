"use client";

import { useEffect, useMemo, useState } from "react";

const MESES = [
  ["2026-11-01", "Novembro/2026"], ["2026-12-01", "Dezembro/2026"],
  ["2027-01-01", "Janeiro/2027"], ["2027-02-01", "Fevereiro/2027"],
  ["2027-03-01", "Março/2027"], ["2027-04-01", "Abril/2027"]
];
const f = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
type Indicador = { chave: string; meta: number | null; realizado: number | null;
  atingimento: number | null; teto: number; pontosProjetados: number | null; situacao: string };
type Rep = { codigo: string; nome: string; supervisor: string; indicadores: Indicador[];
  pontosProjetados: number; indicadoresCalculaveis: number };
type Resultado = { criterio: string; observacao: string; resumo: { representantes: number;
  representantesComMeta: number; somaPontosIndividuais: number; mediaPontosPorRepresentanteComMeta: number | null };
  supervisores: { supervisor: string; representantes: number; pontosProjetados: number }[];
  representantes: Rep[]; erro?: string };

export default function ProjecaoCampanha() {
  const [competencia, setCompetencia] = useState("2026-11-01");
  const [supervisor, setSupervisor] = useState("");
  const [representante, setRepresentante] = useState("");
  const [dados, setDados] = useState<Resultado | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setCarregando(true); setErro("");
    fetch(`/api/campanha/projecao?competencia=${encodeURIComponent(competencia)}`, {
      credentials: "same-origin", cache: "no-store", signal: controller.signal
    }).then(async r => {
      const j = await r.json() as Resultado;
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
      return j;
    }).then(j => { if (!controller.signal.aborted) setDados(j); })
      .catch(e => { if (!controller.signal.aborted) { setErro(String(e)); setDados(null); } })
      .finally(() => { if (!controller.signal.aborted) setCarregando(false); });
    return () => controller.abort();
  }, [competencia]);

  const supervisores = useMemo(() => [...new Set((dados?.representantes ?? []).map(r => r.supervisor))].sort(), [dados]);
  const representantes = useMemo(() => (dados?.representantes ?? []).filter(r =>
    (!supervisor || r.supervisor === supervisor) &&
    (!representante || r.codigo === representante)), [dados, supervisor, representante]);
  const total = representantes.reduce((s, r) => s + r.pontosProjetados, 0);
  const elegiveis = representantes.filter(r => r.indicadores.some(i => i.meta !== null && i.meta > 0)).length;
  const consolidadoSupervisores = useMemo(() => {
    const grupos = new Map<string, { codigo: string; representantes: number; comMeta: number; pontos: number }>();
    for (const rep of representantes) {
      const g = grupos.get(rep.supervisor) ?? { codigo: rep.supervisor, representantes: 0, comMeta: 0, pontos: 0 };
      g.representantes += 1;
      if (rep.indicadores.some(i => i.meta !== null && i.meta > 0)) g.comMeta += 1;
      g.pontos += rep.pontosProjetados;
      grupos.set(rep.supervisor, g);
    }
    return [...grupos.values()].sort((a,b) => a.codigo.localeCompare(b.codigo));
  }, [representantes]);
  const cell = { padding: "10px", borderBottom: "1px solid #dbe5ef", textAlign: "left" as const };
  const painel = { border: "1px solid #dbe5ef", borderRadius: 14, padding: 18, background: "white" };
  const seletor = { padding: "9px", border: "1px solid #cad6e2", borderRadius: 8, maxWidth: "100%" };

  return <main style={{ padding: "20px", display: "grid", gap: 16, color: "#183550", maxWidth: 1500, margin: "auto" }}>
    <header style={painel}>
      <a href="/campanha" style={{ color: "#195f98" }}>Voltar à campanha</a>
      <h1 style={{ margin: "12px 0 4px", fontSize: 24 }}>Pontuação projetada por representante</h1>
      <p style={{ margin: 0, color: "#67788a" }}>Campanha de 09/11/2026 a 30/04/2027. Simulação comercial, não homologada.</p>
    </header>
    <section style={{ ...painel, display: "flex", flexWrap: "wrap", gap: 14, alignItems: "end" }}>
      <label>Competência <div><select style={seletor} value={competencia} onChange={e => { setCompetencia(e.target.value); setSupervisor(""); setRepresentante(""); }}>
        {MESES.map(m => <option key={m[0]} value={m[0]}>{m[1]}</option>)}
      </select></div></label>
      <label>Supervisor <div><select style={seletor} value={supervisor} onChange={e => { setSupervisor(e.target.value); setRepresentante(""); }}>
        <option value="">Todos autorizados</option>{supervisores.map(s => <option key={s} value={s}>{s}</option>)}
      </select></div></label>
      <label>Representante <div><select style={seletor} value={representante} onChange={e => setRepresentante(e.target.value)}>
        <option value="">Todos autorizados</option>{(dados?.representantes ?? []).filter(r => !supervisor || r.supervisor === supervisor).map(r =>
          <option key={r.codigo} value={r.codigo}>{r.codigo} — {r.nome}</option>)}
      </select></div></label>
    </section>
    {carregando && <p>Consultando realizados e metas...</p>}
    {erro && <p role="alert" style={{ color: "#a32222" }}>{erro}</p>}
    {!carregando && dados && <>
      <section style={{ ...painel, display: "flex", gap: 30, flexWrap: "wrap" }}>
        <div><small>Representantes visíveis</small><h2>{representantes.length}</h2></div>
        <div><small>Com meta cadastrada</small><h2>{elegiveis}</h2></div>
        <div><small>Soma das projeções individuais</small><h2>{f.format(total)} pts</h2></div>
        <div><small>Média por representante com meta</small><h2>{elegiveis ? f.format(total / elegiveis) : "—"} / 140</h2></div>
      </section>
      <section style={painel}>
        <h2 style={{ fontSize: 18 }}>Consolidado por supervisor</h2>
        <p style={{ color: "#67788a" }}>Soma das projeções individuais dos representantes autorizados e selecionados. O teto de 140 pontos é por representante, não por supervisor.</p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620, fontSize: 13 }}>
            <thead><tr>{["Supervisor", "Representantes", "Com meta", "Pontos projetados (soma)", "Média por representante com meta"].map(c => <th key={c} style={{ ...cell, background: "#193d5b", color: "white" }}>{c}</th>)}</tr></thead>
            <tbody>{consolidadoSupervisores.map(g => <tr key={g.codigo}>
              <td style={cell}>{g.codigo}</td><td style={cell}>{g.representantes}</td><td style={cell}>{g.comMeta}</td>
              <td style={{ ...cell, fontWeight: 700 }}>{f.format(g.pontos)} pts</td>
              <td style={cell}>{g.comMeta ? f.format(g.pontos / g.comMeta) : "—"} / 140</td>
            </tr>)}</tbody>
            <tfoot><tr>
              <th style={cell}>TOTAL AUTORIZADO</th>
              <th style={cell}>{representantes.length}</th>
              <th style={cell}>{elegiveis}</th>
              <th style={cell}>{f.format(total)} pts</th>
              <th style={cell}>{elegiveis ? f.format(total / elegiveis) : "—"} / 140</th>
            </tr></tfoot>
          </table>
        </div>
      </section>
      <section style={painel}>
        <h2 style={{ fontSize: 18 }}>Detalhamento comercial</h2>
        <p style={{ color: "#67788a" }}>PRODUCAO até 60 · FATURAMENTO até 60 · KIDEX até 20 pontos, cada um calculado individualmente. Sem metas ou realizados, a projeção daquele indicador fica pendente.</p>
        <div style={{ overflowX: "auto" }}><table style={{ borderCollapse: "collapse", width: "100%", minWidth: 1050, fontSize: 13 }}>
          <thead><tr>{["Supervisor", "Código", "Representante", "Produção", "Faturamento", "Kidex", "Total / 140", "Indicadores"].map(c => <th key={c} style={{ ...cell, background: "#193d5b", color: "white" }}>{c}</th>)}</tr></thead>
          <tbody>{representantes.map(rep => <tr key={rep.codigo}>
            <td style={cell}>{rep.supervisor}</td><td style={cell}>{rep.codigo}</td><td style={cell}>{rep.nome}</td>
            {rep.indicadores.map(i => <td key={i.chave} style={cell} title={`Meta ${i.meta === null ? "ausente" : dinheiro.format(i.meta)}; realizado ${i.realizado === null ? "ausente" : dinheiro.format(i.realizado)}; atingimento ${i.atingimento === null ? "indisponível" : f.format(i.atingimento) + "%"}`}>
              {i.pontosProjetados === null ? "—" : f.format(i.pontosProjetados)} <small>/ {i.teto}</small>
              <div style={{ color: "#718096", fontSize: 11 }}>{i.situacao === "PROJECAO" ? `${f.format(i.atingimento ?? 0)}%` : i.situacao}</div>
            </td>)}
            <td style={{ ...cell, fontWeight: 700 }}>{f.format(rep.pontosProjetados)}</td>
            <td style={cell}>{rep.indicadoresCalculaveis} / 3</td>
          </tr>)}</tbody>
        </table></div>
      </section>
      <p style={{ color: "#697b8f", fontSize: 12 }}>{dados.observacao} A soma da equipe não tem teto de 140 pontos; esse é o teto individual dos três indicadores comerciais. Os outros 60 pontos mensais são referentes a treinamentos e reativação e não entram neste cálculo.</p>
    </>}
  </main>;
}
