"use client";

import { useState } from "react";

export type RepresentanteEdicao = {
  codigo_rep: string;
  nome_rep: string | null;
  regional: string;
  ativo: boolean;
};

const SUPERVISORES: Record<string, string> = {
  "B2B": "9920",
  "CENTRO OESTE": "9902",
  "NORTE / NORDESTE": "9914",
  "REM": "9915",
  "SPC": "9916",
  "SPI": "9917",
  "SUL": "9907",
};

export default function EditarRepresentante({
  representante,
  aoCancelar,
  aoSalvar,
}: {
  representante: RepresentanteEdicao;
  aoCancelar: () => void;
  aoSalvar: () => Promise<void>;
}) {
  const [nome, setNome] = useState(representante.nome_rep ?? "");
  const [regional, setRegional] = useState(representante.regional);
  const [ativo, setAtivo] = useState(representante.ativo);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    if (!nome.trim() || motivo.trim().length < 5) {
      setErro("Informe o nome e um motivo com pelo menos 5 caracteres.");
      return;
    }

    setSalvando(true);
    setErro("");

    try {
      const resposta = await fetch("/api/admin/representantes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo_rep: representante.codigo_rep,
          nome_rep: nome.trim(),
          regional,
          ativo,
          motivo: motivo.trim(),
        }),
      });

      const resultado = await resposta.json();

      if (!resposta.ok || !resultado.sucesso) {
        throw new Error(resultado.erro || "Não foi possível salvar.");
      }

      await aoSalvar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const campo: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    background: "#fff",
    color: "#253044",
    boxSizing: "border-box",
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15,23,42,.65)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: 16,
      zIndex: 1000,
    }}>
      <div style={{
        width: "100%",
        maxWidth: 520,
        maxHeight: "90vh",
        overflowY: "auto",
        background: "#fff",
        borderRadius: 16,
        padding: 28,
        boxShadow: "0 20px 60px rgba(0,0,0,.2)",
      }}>
        <h2 style={{ marginTop: 0, color: "#253044" }}>
          Editar representante
        </h2>

        <p style={{ color: "#64748b" }}>
          Código: <strong>{representante.codigo_rep}</strong>
        </p>

        <div style={{ display: "grid", gap: 16 }}>
          <label>
            <strong>Nome</strong>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              disabled={salvando}
              style={{ ...campo, marginTop: 6 }}
            />
          </label>

          <label>
            <strong>Regional</strong>
            <select
              value={regional}
              onChange={e => setRegional(e.target.value)}
              disabled={salvando}
              style={{ ...campo, marginTop: 6 }}
            >
              {Object.keys(SUPERVISORES).map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>

          <label>
            <strong>Supervisor automático</strong>
            <input
              value={SUPERVISORES[regional] ?? ""}
              readOnly
              style={{
                ...campo,
                marginTop: 6,
                background: "#f1f5f9",
              }}
            />
          </label>

          <label>
            <strong>Situação</strong>
            <select
              value={ativo ? "ativo" : "inativo"}
              onChange={e => setAtivo(e.target.value === "ativo")}
              disabled={salvando}
              style={{ ...campo, marginTop: 6 }}
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </label>

          <label>
            <strong>Motivo da alteração</strong>
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              disabled={salvando}
              placeholder="Informe o motivo da alteração"
              rows={3}
              style={{ ...campo, marginTop: 6, resize: "vertical" }}
            />
          </label>

          {erro && (
            <p role="alert" style={{ color: "#b91c1c", margin: 0 }}>
              {erro}
            </p>
          )}

          <div style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 12,
          }}>
            <button
              type="button"
              onClick={aoCancelar}
              disabled={salvando}
              style={{
                padding: "11px 18px",
                border: "1px solid #cbd5e1",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              style={{
                padding: "11px 18px",
                border: 0,
                borderRadius: 8,
                background: "#f28c28",
                color: "#fff",
                fontWeight: 700,
                cursor: salvando ? "wait" : "pointer",
              }}
            >
              {salvando ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}