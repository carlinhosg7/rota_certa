"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Recebe a MESMA lista já filtrada usada no indicador Carteira 02 do Painel.
 * Não consulta a Receita novamente e não aplica limite artificial de 6.888.
 * Um cliente é atribuído a um supervisor e a um representante (primeiros vínculos
 * válidos), para manter o somatório das linhas igual ao número de clientes únicos.
 */
type Pessoa = { codigo?: string | number | null; nome?: string | null };
type Entrada = {
  codigo_cliente?: string | number;
  codigoCliente?: string | number;
  razaoSocial?: string;
  cidade?: string;
  uf?: string;
  cnpj?: string;
  dados?: {
    codigoCliente?: string | number;
    razaoSocial?: string;
    cidade?: string;
    uf?: string;
    cnpj?: string;
    supervisores?: Pessoa[];
    representanteAtual?: Pessoa[];
  };
  supervisores?: Pessoa[];
  representanteAtual?: Pessoa[];
};

type Linha = {
  codigoCliente: string;
  razaoSocial: string;
  cnpj: string;
  cidade: string;
  uf: string;
  codigoSupervisor: string;
  supervisor: string;
  codigoRepresentante: string;
  representante: string;
};

const codigo = (v: unknown) => String(v ?? "").trim();
const nome = (v: unknown, fallback: string) => String(v ?? "").trim() || fallback;
const primeiro = (v: Pessoa[] | undefined) =>
  Array.isArray(v)
    ? v.find((p) => codigo(p?.codigo) && codigo(p.codigo).toUpperCase() !== "TOTAL GERAL")
    : undefined;

type RegionalOficial = {
  codigo: string;
  nome: string;
  representantes: { codigo: string; nome: string }[];
};

export default function Carteira02Gestao({ clientes, hierarquia }: {
  clientes: Entrada[];
  hierarquia: RegionalOficial[];
}) {
  const [supervisorFiltro, setSupervisorFiltro] = useState("");
  const [representanteFiltro, setRepresentanteFiltro] = useState("");
  const [busca, setBusca] = useState("");
  const [hierarquiaOficial,setHierarquiaOficial] = useState<{
    supervisores:Array<{codigo:string;nome:string}>;
    representantes:Array<{codigo:string;nome:string;supervisor:string}>;
  } | null>(null);
  useEffect(() => {
    let cancelado=false;
    fetch("/api/hierarquia-comercial",{cache:"no-store"})
      .then(async r => {if(!r.ok)throw new Error("hierarquia");return r.json();})
      .then(d => {if(!cancelado)setHierarquiaOficial(d);})
      .catch(e => console.error("[CARTEIRA02] Filtro oficial indisponivel",e));
    return () => {cancelado=true;};
  },[]);

  const linhas = useMemo<Linha[]>(() => {
    const unicos = new Map<string, Linha>();
    for (const entrada of clientes ?? []) {
      const d = entrada.dados ?? entrada;
      const codigoCliente = codigo(entrada.codigo_cliente ?? d.codigoCliente);
      if (!codigoCliente || unicos.has(codigoCliente)) continue;
      const s = primeiro(d.supervisores);
      const r = primeiro(d.representanteAtual);
      unicos.set(codigoCliente, {
        codigoCliente,
        razaoSocial: nome(d.razaoSocial, "NÃO INFORMADA"),
        cnpj: codigo(d.cnpj),
        cidade: nome(d.cidade, ""),
        uf: codigo(d.uf),
        codigoSupervisor: codigo(s?.codigo) || "SEM SUPERVISOR",
        supervisor: nome(s?.nome, "SEM SUPERVISOR"),
        codigoRepresentante: codigo(r?.codigo) || "SEM REPRESENTANTE",
        representante: nome(r?.nome, "SEM REPRESENTANTE"),
      });
    }
    return [...unicos.values()];
  }, [clientes]);

  const supervisores = useMemo(
    () => hierarquia.map(s => [s.codigo, `${s.codigo} — ${s.nome}`] as [string, string]),
    [hierarquia]
  );
  const representantes = useMemo(() => {
    const regionais = supervisorFiltro
      ? hierarquia.filter(s => s.codigo === supervisorFiltro)
      : hierarquia;
    return [...new Map(regionais.flatMap(s => s.representantes)
      .map(r => [r.codigo, `${r.codigo} — ${r.nome}`] as [string, string])).entries()]
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { numeric: true }));
  }, [hierarquia, supervisorFiltro]);

  const filtradas = useMemo(() => {
    const texto = busca.trim().toLocaleLowerCase("pt-BR");
    return linhas.filter((l) =>
      (!supervisorFiltro || l.codigoSupervisor === supervisorFiltro) &&
      (!representanteFiltro || l.codigoRepresentante === representanteFiltro) &&
      (!texto || [l.codigoCliente, l.razaoSocial, l.cnpj, l.cidade, l.uf, l.codigoSupervisor, l.supervisor, l.codigoRepresentante, l.representante].join(" ").toLocaleLowerCase("pt-BR").includes(texto))
    ).sort((a, b) => a.codigoSupervisor.localeCompare(b.codigoSupervisor) || a.codigoRepresentante.localeCompare(b.codigoRepresentante) || a.codigoCliente.localeCompare(b.codigoCliente));
  }, [linhas, supervisorFiltro, representanteFiltro, busca]);

  const resumo = useMemo(() => {
    const grupos = new Map<string, { supervisor: string; representante: string; quantidade: number }>();
    for (const l of filtradas) {
      const chave = `${l.codigoSupervisor}\u0001${l.codigoRepresentante}`;
      const item = grupos.get(chave) ?? { supervisor: `${l.codigoSupervisor} — ${l.supervisor}`, representante: `${l.codigoRepresentante} — ${l.representante}`, quantidade: 0 };
      item.quantidade += 1;
      grupos.set(chave, item);
    }
    return [...grupos.values()].sort((a,b) => a.supervisor.localeCompare(b.supervisor) || b.quantidade - a.quantidade);
  }, [filtradas]);

  async function exportar() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const wsResumo = XLSX.utils.json_to_sheet(resumo.map((r) => ({
      Supervisor: r.supervisor,
      Representante: r.representante,
      "Clientes únicos": r.quantidade,
      "% da carteira 02": linhas.length ? r.quantidade / linhas.length : 0,
    })));
    wsResumo["!cols"] = [{ wch: 31 }, { wch: 48 }, { wch: 18 }, { wch: 22 }];
    for (let i = 2; i <= resumo.length + 1; i++) {
      const celula = wsResumo[`D${i}`];
      if (celula) celula.z = "0.00%";
    }
    XLSX.utils.book_append_sheet(wb, wsResumo, "Resumo por rep");
    const wsClientes = XLSX.utils.json_to_sheet(filtradas.map((l) => ({
      "Código cliente": l.codigoCliente,
      "Razão social": l.razaoSocial,
      CNPJ: l.cnpj,
      UF: l.uf,
      Cidade: l.cidade,
      "Código supervisor": l.codigoSupervisor,
      Supervisor: l.supervisor,
      "Código representante": l.codigoRepresentante,
      Representante: l.representante,
    })));
    wsClientes["!cols"] = [{ wch: 17 }, { wch: 48 }, { wch: 20 }, { wch: 7 }, { wch: 25 }, { wch: 20 }, { wch: 26 }, { wch: 23 }, { wch: 48 }];
    XLSX.utils.book_append_sheet(wb, wsClientes, "Clientes Carteira 02");
    XLSX.writeFile(wb, "KIDY_CARTEIRA_02_POR_REP_SUPERVISOR.xlsx");
  }

  const painel: React.CSSProperties = { background: "#fff", border: "1px solid #dbe5ef", borderRadius: 18, boxShadow: "0 5px 24px rgba(15,23,42,.055)", padding: 24 };
  const input: React.CSSProperties = { width: "100%", minWidth: 0, padding: "11px 13px", border: "1px solid #cbd5e1", borderRadius: 9, background: "#fff", color: "#1e293b", fontSize: 13 };
  const th: React.CSSProperties = { padding: "13px 12px", background: "#f1f5f9", color: "#334155", fontSize: 12, fontWeight: 800, textAlign: "left", position: "sticky", top: 0, zIndex: 1, whiteSpace: "nowrap" };
  const td: React.CSSProperties = { padding: "11px 12px", borderBottom: "1px solid #edf2f7", color: "#334155", fontSize: 13, verticalAlign: "top" };
  const card = (label: string, value: string, cor: string) => (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "17px 20px", flex: "1 1 195px", minWidth: 0 }}>
      <div style={{ color: "#64748b", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, lineHeight: 1.15, fontWeight: 850, color: cor }}>{value}</div>
    </div>
  );

  return (
    <section style={{ display: "grid", gap: 18, fontFamily: "inherit", color: "#172b4d" }}>
      <div style={{ ...painel, display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ color: "#b45309", fontSize: 11, fontWeight: 800, letterSpacing: 1.2, marginBottom: 8 }}>KIDY SALES INTELLIGENCE</div>
          <h1 style={{ margin: 0, fontSize: 23, fontWeight: 850 }}>Carteira 02 — Reativação por equipe</h1>
          <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 13 }}>Clientes únicos por código · Mesma base da Gestão de Carteira</p>
        </div>
        <button type="button" onClick={exportar} style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 10, padding: "13px 18px", cursor: "pointer", fontSize: 13, fontWeight: 800, boxShadow: "0 3px 9px rgba(21,128,61,.17)" }}>↧ Exportar Excel (.xlsx)</button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        {card("Total na base", linhas.length.toLocaleString("pt-BR"), "#b45309")}
        {card("Clientes filtrados", filtradas.length.toLocaleString("pt-BR"), "#172b4d")}
        {card("Participação", `${(linhas.length ? 100 * filtradas.length / linhas.length : 0).toFixed(2).replace(".", ",")}%`, "#0369a1")}
      </div>

      <div style={painel}>
        <h2 style={{ margin: "0 0 17px", fontSize: 17 }}>Filtros da equipe</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(215px, 1fr))", gap: 14 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700 }}>Supervisor
            <select style={input} value={supervisorFiltro} onChange={(e) => { setSupervisorFiltro(e.target.value); setRepresentanteFiltro(""); }}>
              <option value="">Todos os supervisores</option>
              {supervisores.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700 }}>Representante
            <select style={input} value={representanteFiltro} onChange={(e) => setRepresentanteFiltro(e.target.value)}>
              <option value="">Todos os representantes</option>
              {representantes.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 700 }}>Buscar cliente
            <input style={input} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Código, nome, CNPJ ou cidade" />
          </label>
        </div>
        {(supervisorFiltro || representanteFiltro || busca) && <button type="button" onClick={() => { setSupervisorFiltro(""); setRepresentanteFiltro(""); setBusca(""); }} style={{ marginTop: 14, border: "1px solid #cbd5e1", background: "#fff", color: "#475569", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontWeight: 700 }}>Limpar filtros</button>}
      </div>

      <div style={painel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Resumo por supervisor e representante</h2>
          <span style={{ color: "#64748b", fontSize: 12 }}>{resumo.length.toLocaleString("pt-BR")} equipes</span>
        </div>
        <div style={{ overflow: "auto", maxHeight: 410, border: "1px solid #e2e8f0", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Supervisor</th><th style={th}>Representante</th><th style={{ ...th, textAlign: "right" }}>Clientes</th><th style={{ ...th, textAlign: "right" }}>% da Carteira 02</th></tr></thead>
            <tbody>{resumo.map((r, i) => <tr key={i} style={{ background: i % 2 ? "#fafcff" : "#fff" }}><td style={td}>{r.supervisor}</td><td style={td}>{r.representante}</td><td style={{ ...td, textAlign: "right", fontWeight: 800 }}>{r.quantidade.toLocaleString("pt-BR")}</td><td style={{ ...td, textAlign: "right" }}>{(linhas.length ? r.quantidade * 100 / linhas.length : 0).toFixed(2).replace(".", ",")}%</td></tr>)}</tbody>
          </table>
        </div>
      </div>

      <div style={painel}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>Relação de clientes</h2>
          <span style={{ color: "#64748b", fontSize: 12 }}>{filtradas.length.toLocaleString("pt-BR")} clientes</span>
        </div>
        <div style={{ overflow: "auto", maxHeight: 520, border: "1px solid #e2e8f0", borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Código", "Razão social", "CNPJ", "Cidade", "UF", "Supervisor", "Representante"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{filtradas.map((l, i) => <tr key={l.codigoCliente} style={{ background: i % 2 ? "#fafcff" : "#fff" }}><td style={{ ...td, fontWeight: 800 }}>{l.codigoCliente}</td><td style={td}>{l.razaoSocial}</td><td style={td}>{l.cnpj}</td><td style={td}>{l.cidade}</td><td style={td}>{l.uf}</td><td style={{ ...td, whiteSpace: "nowrap" }}>{l.codigoSupervisor} — {l.supervisor}</td><td style={{ ...td, whiteSpace: "nowrap" }}>{l.codigoRepresentante} — {l.representante}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
