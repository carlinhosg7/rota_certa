"use client";

import { useEffect, useState } from "react";

type Supervisor = { codigo: string; nome: string };
type Representante = { codigo: string; nome: string; supervisor_codigo: string };

export default function FiltrosRegionalRepresentante({
  supervisorAtual, representanteAtual, supervisores, representantes,
}: {
  supervisorAtual: string;
  representanteAtual: string;
  supervisores: Supervisor[];
  representantes: Representante[];
}) {
  const [supervisor, setSupervisor] = useState(supervisorAtual);
  const [representante, setRepresentante] = useState(representanteAtual);
  useEffect(() => { setSupervisor(supervisorAtual); setRepresentante(representanteAtual); }, [supervisorAtual, representanteAtual]);
  const visiveis = representantes.filter(r => !supervisor || r.supervisor_codigo === supervisor);
  const representanteSelecionado = visiveis.some(r => r.codigo === representante) ? representante : "";
  return (
    <>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12 }}>Supervisor</span>
        <select name="supervisor" value={supervisor} onChange={e => {
          setSupervisor(e.target.value);
          setRepresentante("");
        }} style={{ padding: 10, minWidth: 200 }}>
          <option value="">Todos</option>
          {supervisores.map(s => <option key={s.codigo} value={s.codigo}>{s.nome} ({s.codigo})</option>)}
        </select>
      </label>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12 }}>Representante</span>
        <select name="representante" value={representanteSelecionado}
          onChange={e => setRepresentante(e.target.value)}
          style={{ padding: 10, minWidth: 220, maxWidth: 360 }}>
          <option value="">Todos</option>
          {visiveis.map(r => <option key={r.codigo} value={r.codigo}>{r.nome} ({r.codigo})</option>)}
        </select>
      </label>
    </>
  );
}
