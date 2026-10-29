"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Linha = {
  codigo: string;
  razaoSocial: string;
  supervisor: string;
  representante: string;
  classificacao: string;
  tentativas: number;
  proximaAcao: string;
  dataProximaAcao: string;
  statusAcao: string;
  responsavel: string;
};

const nomes: Record<string, string> = {
  NAO_INICIADO: "Não iniciado",
  REATIVADO: "Reativado",
  EM_NEGOCIACAO: "Em negociação",
  AGUARDANDO_CREDITO: "Aguardando crédito",
  SEM_INTERESSE: "Sem interesse",
  NAO_LOCALIZADO: "Não localizado",
  EMPRESA_ENCERRADA: "Empresa encerrada",
  TENTATIVAS_ESGOTADAS: "Tentativas esgotadas",
};

function dataLocal() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function proximoDia(data: string) {
  const [ano, mes, dia] = data.split("-").map(Number);
  const d = new Date(ano, mes - 1, dia + 1);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatarData(valor: string) {
  if (!valor) return "-";
  const data = valor.slice(0, 10);
  const partes = data.split("-");
  if (partes.length !== 3) return valor;
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

export default function PainelGestaoReativacao({
  linhas,
  perfil,
}: {
  linhas: Linha[];
  perfil: string;
}) {
  const [busca, setBusca] = useState("");
  const [classificacao, setClassificacao] = useState("");
  const [supervisor, setSupervisor] = useState("");
  const [representante, setRepresentante] = useState("");
  const [agenda, setAgenda] = useState("");
  const [pagina, setPagina] = useState(1);

  const hoje = dataLocal();
  const amanha = proximoDia(hoje);

  const supervisores = useMemo(
    () => [...new Set(linhas.flatMap(l =>
      l.supervisor.split(", ").filter(Boolean)
    ))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [linhas]
  );

  const representantes = useMemo(
    () => [...new Set(linhas.flatMap(l =>
      l.representante.split(", ").filter(Boolean)
    ))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [linhas]
  );

  const filtradas = linhas.filter(l => {
    const texto = [
      l.codigo,
      l.razaoSocial,
      l.supervisor,
      l.representante,
      l.proximaAcao,
      l.responsavel,
    ].join(" ").toLowerCase();

    if (busca && !texto.includes(busca.toLowerCase().trim())) return false;
    if (classificacao && l.classificacao !== classificacao) return false;
    if (supervisor && !l.supervisor.split(", ").includes(supervisor)) return false;
    if (representante && !l.representante.split(", ").includes(representante)) return false;

    if (agenda === "HOJE") {
      return l.statusAcao === "PENDENTE" && l.dataProximaAcao.slice(0, 10) === hoje;
    }

    if (agenda === "AMANHA") {
      return l.statusAcao === "PENDENTE" && l.dataProximaAcao.slice(0, 10) === amanha;
    }

    if (agenda === "ATRASADA") {
      return l.statusAcao === "PENDENTE" &&
        Boolean(l.dataProximaAcao) &&
        l.dataProximaAcao.slice(0, 10) < hoje;
    }

    return true;
  });

  const indicadores = [
    ["Carteira", filtradas.length],
    ["Reativados", filtradas.filter(l => l.classificacao === "REATIVADO").length],
    ["Em negociação", filtradas.filter(l => l.classificacao === "EM_NEGOCIACAO").length],
    ["Aguardando crédito", filtradas.filter(l => l.classificacao === "AGUARDANDO_CREDITO").length],
    ["Ações amanhã", filtradas.filter(l =>
      l.statusAcao === "PENDENTE" && l.dataProximaAcao.slice(0, 10) === amanha
    ).length],
    ["Ações atrasadas", filtradas.filter(l =>
      l.statusAcao === "PENDENTE" &&
      Boolean(l.dataProximaAcao) &&
      l.dataProximaAcao.slice(0, 10) < hoje
    ).length],
  ] as const;

  const porPagina = 50;
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
  const atual = Math.min(pagina, totalPaginas);
  const visiveis = filtradas.slice((atual - 1) * porPagina, atual * porPagina);

  const filtro: React.CSSProperties = {
    padding: "11px",
    border: "1px solid #d6d3d1",
    borderRadius: 8,
    background: "#fff",
    color: "#292524",
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  };

  const celula: React.CSSProperties = {
    padding: "12px",
    borderBottom: "1px solid #f5f5f4",
    textAlign: "left",
    verticalAlign: "top",
  };

  return (
    <section style={{ padding: "24px", minWidth: 0 }}>
      <h1 style={{ color: "#9a3412", margin: "0 0 6px" }}>
        Gestão de Reativação
      </h1>

      <p style={{ color: "#78716c", marginBottom: 24 }}>
        Acompanhamento da carteira comercial · Perfil: {perfil}
      </p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))",
        gap: 12,
        marginBottom: 24,
      }}>
        {indicadores.map(([titulo, valor]) => (
          <div key={titulo} style={{
            background: "#fff",
            border: "1px solid #fed7aa",
            borderRadius: 12,
            padding: 18,
          }}>
            <div style={{ fontSize: 12, color: "#78716c" }}>{titulo}</div>
            <strong style={{
              display: "block",
              fontSize: 28,
              color: "#9a3412",
              marginTop: 5,
            }}>
              {valor.toLocaleString("pt-BR")}
            </strong>
          </div>
        ))}
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 10,
        marginBottom: 18,
      }}>
        <input
          style={filtro}
          placeholder="Código ou Razão Social"
          aria-label="Pesquisar cliente"
          value={busca}
          onChange={e => { setBusca(e.target.value); setPagina(1); }}
        />

        <select style={filtro} value={classificacao}
          aria-label="Classificação"
          onChange={e => { setClassificacao(e.target.value); setPagina(1); }}>
          <option value="">Todas as classificações</option>
          {Object.entries(nomes).map(([chave, nome]) => (
            <option key={chave} value={chave}>{nome}</option>
          ))}
        </select>

        <select style={filtro} value={supervisor}
          aria-label="Supervisor"
          onChange={e => { setSupervisor(e.target.value); setPagina(1); }}>
          <option value="">Todos os supervisores</option>
          {supervisores.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        <select style={filtro} value={representante}
          aria-label="Representante"
          onChange={e => { setRepresentante(e.target.value); setPagina(1); }}>
          <option value="">Todos os representantes</option>
          {representantes.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <select style={filtro} value={agenda}
          aria-label="Agenda"
          onChange={e => { setAgenda(e.target.value); setPagina(1); }}>
          <option value="">Todas as ações</option>
          <option value="HOJE">Ações hoje</option>
          <option value="AMANHA">Ações amanhã</option>
          <option value="ATRASADA">Ações atrasadas</option>
        </select>
      </div>

      <div style={{
        background: "#fff",
        border: "1px solid #e7e5e4",
        borderRadius: 12,
        overflowX: "auto",
      }}>
        <table style={{
          borderCollapse: "collapse",
          minWidth: 1450,
          width: "100%",
          fontSize: 13,
        }}>
          <thead style={{ background: "#fff7ed", color: "#9a3412" }}>
            <tr>
              {[
                "Cliente",
                "Razão Social",
                "Supervisor",
                "Representante",
                "Classificação",
                "Tentativas",
                "Próxima ação",
                "Data",
                "Situação",
              ].map(t => <th key={t} style={celula}>{t}</th>)}
            </tr>
          </thead>

          <tbody>
            {visiveis.map(l => (
              <tr key={l.codigo}>
                <td style={celula}>
                  <Link href={`/cliente/${encodeURIComponent(l.codigo)}`}
                    style={{ color: "#c2410c", fontWeight: 700 }}>
                    {l.codigo}
                  </Link>
                </td>
                <td style={{ ...celula, minWidth: 230 }}>{l.razaoSocial || "-"}</td>
                <td style={celula}>{l.supervisor || "-"}</td>
                <td style={celula}>{l.representante || "-"}</td>
                <td style={celula}>{nomes[l.classificacao] ?? l.classificacao}</td>
                <td style={celula}>{l.tentativas}</td>
                <td style={{ ...celula, minWidth: 220, maxWidth: 320, whiteSpace: "normal" }}>{l.proximaAcao || "-"}</td>
                <td style={{ ...celula, minWidth: 105, whiteSpace: "nowrap" }}>{formatarData(l.dataProximaAcao)}</td>
                <td style={{ ...celula, minWidth: 110, whiteSpace: "nowrap" }}>{l.statusAcao || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {visiveis.length === 0 && (
          <p style={{ textAlign: "center", padding: 20 }}>
            Nenhum cliente encontrado.
          </p>
        )}
      </div>

      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        marginTop: 18,
      }}>
        <span style={{ fontSize: 13, color: "#78716c" }}>
          {filtradas.length.toLocaleString("pt-BR")} clientes ·
          Página {atual} de {totalPaginas}
        </span>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" disabled={atual <= 1}
            onClick={() => setPagina(atual - 1)}>
            Anterior
          </button>
          <button type="button" disabled={atual >= totalPaginas}
            onClick={() => setPagina(atual + 1)}>
            Próxima
          </button>
        </div>
      </div>
    </section>
  );
}