"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./campanha.module.css";

type Indicador = {
  chave: string; titulo: string; pontos: number; representantes: number;
  metaPares: number; metaValor: number;
  realizadoPares: number | null; realizadoValor: number | null;
  percentualPares: number | null; percentualValor: number | null;
  status: string; pontosConcedidos: number;
};
type OpcaoRep = { codigo: string; nome: string };
type Retorno = {
  competencia: string;
  filtros: { supervisores: string[]; representantes: OpcaoRep[] };
  indicadores: Indicador[];
  pontuacao: { concedida: number; disponivel: boolean; motivo: string };
  erro?: string;
};
type Mes = { chave: string; titulo: string; curto: string };
const MESES: Mes[] = [
  { chave: "2026-11-01", titulo: "Novembro 2026", curto: "NOV/26" },
  { chave: "2026-12-01", titulo: "Dezembro 2026", curto: "DEZ/26" },
  { chave: "2027-01-01", titulo: "Janeiro 2027", curto: "JAN/27" },
  { chave: "2027-02-01", titulo: "Fevereiro 2027", curto: "FEV/27" },
  { chave: "2027-03-01", titulo: "Março 2027", curto: "MAR/27" },
];
const TIPOS = [
  { chave: "PRODUCAO", nome: "Entrada Produção", pontos: 60, unidade: "valor" },
  { chave: "FATURAMENTO", nome: "Faturamento", pontos: 60, unidade: "valor" },
  { chave: "KIDEX", nome: "Entrada Kidex", pontos: 20, unidade: "valor" },
  { chave: "TREINAMENTOS", nome: "Treinamentos", pontos: 30, unidade: "quantidade" },
  { chave: "REATIVACAO", nome: "Reativação", pontos: 30, unidade: "quantidade" },
] as const;
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const qtd = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

function Caixa({ nome, pontos, maximo, homologado, geral = false }: {
  nome: string; pontos: number; maximo: number; homologado: boolean; geral?: boolean;
}) {
  const percentual = homologado && maximo > 0 ? Math.max(0, Math.min(100, pontos / maximo * 100)) : 0;
  return (
    <div className={`${styles.tankCard} ${geral ? styles.tankGeneral : ""}`}>
      <div className={styles.tankInformation}>
        <span className={styles.tankLabel}>{nome}</span>
        <strong className={styles.tankPoints}>{homologado ? qtd.format(pontos) : "—"}<small> / {qtd.format(maximo)} pts</small></strong>
        <span className={styles.tankStatus}>{homologado ? `${qtd.format(percentual)}% da pontuação` : "Aguardando homologação"}</span>
      </div>
      <div className={styles.tank} role="img" aria-label={`${nome}: ${homologado ? `${percentual.toFixed(1)}%` : "sem pontuação homologada"}`}>
        <div className={styles.tankTicks}><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div>
        <div className={styles.tankWater} style={{ height: `${percentual}%` }} />
      </div>
    </div>
  );
}

export default function CampanhaClient() {
  const [supervisor, setSupervisor] = useState("");
  const [representante, setRepresentante] = useState("");
  const [dados, setDados] = useState<Record<string, Retorno>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [detalhes, setDetalhes] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const carregar = async () => {
      setCarregando(true);
      setErro("");
      try {
        const respostas = await Promise.all(MESES.map(async (mes) => {
          const q = new URLSearchParams({ competencia: mes.chave, supervisor, representante });
          const res = await fetch(`/api/campanha?${q.toString()}`, {
            credentials: "same-origin", cache: "no-store", signal: controller.signal,
          });
          const json = (await res.json()) as Retorno;
          if (!res.ok) throw new Error(json.erro || `Falha ao consultar ${mes.curto} (HTTP ${res.status})`);
          return [mes.chave, json] as const;
        }));
        if (!controller.signal.aborted) setDados(Object.fromEntries(respostas));
      } catch (e) {
        if (!controller.signal.aborted) {
          setErro(e instanceof Error ? e.message : "Erro ao consultar a campanha");
          setDados({});
        }
      } finally {
        if (!controller.signal.aborted) setCarregando(false);
      }
    };
    void carregar();
    return () => controller.abort();
  }, [supervisor, representante]);

  const supervisores = useMemo(() => [...new Set(Object.values(dados).flatMap(x => x.filtros.supervisores))].sort(), [dados]);
  const reps = useMemo(() => [...new Map(Object.values(dados).flatMap(x => x.filtros.representantes).map(r => [r.codigo, r])).values()].sort((a,b)=>a.nome.localeCompare(b.nome, "pt-BR")), [dados]);
  const ind = (mes: string, chave: string) => dados[mes]?.indicadores.find(x => x.chave === chave);
  const situacaoMes = (chave: string) => {
    const resposta = dados[chave];
    // Bloqueio proposital: API ainda nao confirmou homologacao da pontuacao.
    return { homologado: Boolean(resposta?.pontuacao.disponivel), pontos: resposta?.pontuacao.concedida ?? 0 };
  };
  const geralHomologado = MESES.every(m => Boolean(dados[m.chave]?.pontuacao.disponivel));
  const geralPontos = MESES.reduce((t,m) => t + situacaoMes(m.chave).pontos, 0);
  const mesesComMetas = MESES.filter(m => dados[m.chave]?.indicadores.some(i=>i.representantes>0)).length;

  return <div className={styles.layout}>
    <section className={styles.headerPanel}>
      <div className={styles.headerCopy}>
        <span className={styles.eyebrow}>PAINEL GERENCIAL · 09/11/2026 — 31/03/2027</span>
        <h2>Visão completa da campanha</h2>
        <p>Todos os meses em uma única matriz, com metas, realizados e acompanhamento de pontos.</p>
      </div>
      <div className={styles.filters}>
        <label>Supervisor
          <select value={supervisor} onChange={e => {setSupervisor(e.target.value); setRepresentante("");}}>
            <option value="">Todos autorizados</option>
            {supervisores.map(s => <option value={s} key={s}>{s}</option>)}
          </select>
        </label>
        <label>Representante
          <select value={representante} onChange={e => setRepresentante(e.target.value)}>
            <option value="">Todos autorizados</option>
            {reps.map(r => <option value={r.codigo} key={r.codigo}>{r.codigo} — {r.nome}</option>)}
          </select>
        </label>
      </div>
    </section>

    {carregando && <div className={styles.notice} role="status">Consultando os cinco meses no Supabase...</div>}
    {erro && <div className={styles.error} role="alert">{erro}</div>}
    {!carregando && !erro && Object.keys(dados).length === MESES.length && <>
      <section className={styles.topArea} aria-label="Caixas d'agua da campanha">
        <Caixa nome="Campanha geral" pontos={geralPontos} maximo={1000} homologado={geralHomologado} geral />
        <div className={styles.topSummary}>
          <div><span>Competências com metas</span><strong>{mesesComMetas} <small>/ 5</small></strong></div>
          <div><span>Pontuação máxima</span><strong>1.000 <small>pontos</small></strong></div>
          <p>Pontos e percentuais só aparecem após validação e homologação. A ausência de realizados não representa zero vendas.</p>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}><h3>Caixas d’água por mês</h3><span>Até 200 pontos por mês</span></div>
        <div className={styles.tanksRow}>
          {MESES.map(m => <Caixa key={m.chave} nome={m.titulo} pontos={situacaoMes(m.chave).pontos} maximo={200} homologado={situacaoMes(m.chave).homologado} />)}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <div><h3>Matriz de desempenho mensal</h3><span>Meta, realizado, atingimento e pontos por indicador</span></div>
          <button className={styles.secondaryButton} type="button" onClick={() => setDetalhes(x => !x)}>{detalhes ? "Visão compacta" : "Exibir detalhes"}</button>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.matrix}>
            <thead><tr><th>Indicador</th>{MESES.map(m => <th key={m.chave}>{m.curto}</th>)}<th>Total campanha</th></tr></thead>
            <tbody>
              {TIPOS.map(tipo => {
                const registros = MESES.map(m => ind(m.chave, tipo.chave));
                const quantidade = tipo.chave === "TREINAMENTOS";
                const metaValorTotal = registros.reduce((t,i) => t+(i?.metaValor ?? 0),0);
                const metaParesTotal = registros.reduce((t,i) => t+(i?.metaPares ?? 0),0);
                const comRealizados = registros.length > 0 && registros.every(i => i && i.realizadoValor !== null && i.realizadoPares !== null);
                const realizadoTotal = comRealizados ? registros.reduce((t,i)=>t+(i?.realizadoValor ?? 0),0) : null;
                const realizadoQtdTotal = registros.every(i => i && i.realizadoPares !== null)
                  ? registros.reduce((t,i)=>t+(i?.realizadoPares ?? 0),0) : null;
                const pontosTotal = registros.reduce((t,i)=>t+(i?.pontosConcedidos ?? 0),0);
                const pontosMaximosEquipe = registros.reduce((t,i)=>t+(i?.representantes ?? 0)*30,0);
                return <tr key={tipo.chave}>
                  <th scope="row"><strong>{tipo.nome}</strong><small>{tipo.pontos} pts/mês por representante · {tipo.pontos * 5} pts possíveis por representante na campanha</small></th>
                  {MESES.map(m => {
                    const i = ind(m.chave, tipo.chave);
                    return <td key={m.chave}>
                      {!i ? <span className={styles.missing}>{tipo.chave === "TREINAMENTOS" || tipo.chave === "REATIVACAO" ? "Integração pendente" : "Sem meta cadastrada"}</span> :
                        quantidade ? <div className={styles.cell}>
                          <span className={styles.cellLine}><small>Meta</small><strong>{qtd.format(i.metaPares)} treinamentos</strong></span>
                          {detalhes && <span className={styles.cellLine}><small>Representantes</small><span>{qtd.format(i.representantes)} × 5</span></span>}
                          <span className={styles.cellLine}><small>Homologados</small><strong>{i.realizadoPares === null ? "Aguardando" : qtd.format(i.realizadoPares)}</strong></span>
                          {detalhes && <span className={styles.cellLine}><small>Atingimento</small><span>{i.percentualPares === null ? "—" : `${qtd.format(i.percentualPares)}%`}</span></span>}
                          <span className={styles.cellState}>Pontos da equipe: {qtd.format(i.pontosConcedidos)} / {qtd.format(i.representantes * 30)} · até 30 por representante</span>
                        </div> : <div className={styles.cell}>
                          <span className={styles.cellLine}><small>Meta R$</small><strong>{brl.format(i.metaValor)}</strong></span>
                          {detalhes && <span className={styles.cellLine}><small>Meta pares</small><span>{qtd.format(i.metaPares)}</span></span>}
                          <span className={styles.cellLine}><small>Realizado</small><span>{i.realizadoValor === null ? "Aguardando" : brl.format(i.realizadoValor)}</span></span>
                          {detalhes && <span className={styles.cellLine}><small>Atingimento</small><span>{i.percentualValor === null ? "—" : `${qtd.format(i.percentualValor)}% *`}</span></span>}
                          <span className={styles.cellState}>Pontos: aguardando homologação</span>
                        </div>}
                    </td>;
                  })}
                  <td className={styles.totalCell}>
                    {registros.every(i => !i) ? <span className={styles.missing}>Pendente</span> : quantidade ? <div className={styles.cell}>
                      <span className={styles.cellLine}><small>Meta</small><strong>{qtd.format(metaParesTotal)} treinamentos</strong></span>
                      <span className={styles.cellLine}><small>Homologados</small><strong>{realizadoQtdTotal === null ? "Aguardando" : qtd.format(realizadoQtdTotal)}</strong></span>
                      <span className={styles.cellState}>Pontos da equipe: {qtd.format(pontosTotal)} / {qtd.format(pontosMaximosEquipe)} · até 150 por representante nos cinco meses</span>
                    </div> : <div className={styles.cell}>
                      <span className={styles.cellLine}><small>Meta R$</small><strong>{brl.format(metaValorTotal)}</strong></span>
                      {detalhes && <span className={styles.cellLine}><small>Meta pares</small><span>{qtd.format(metaParesTotal)}</span></span>}
                      <span className={styles.cellLine}><small>Realizado</small><span>{realizadoTotal === null ? "Aguardando" : brl.format(realizadoTotal)}</span></span>
                      <span className={styles.cellState}>Até {tipo.pontos * 5} pts por representante</span>
                    </div>}
                  </td>
                </tr>;
              })}
              <tr className={styles.pointsRow}><th>Pontuação mensal</th>{MESES.map(m => <td key={m.chave}><strong>{situacaoMes(m.chave).homologado ? `${qtd.format(situacaoMes(m.chave).pontos)} / 200` : "— / 200"}</strong><small>Não homologado</small></td>)}<td><strong>{geralHomologado ? `${qtd.format(geralPontos)} / 1.000` : "— / 1.000"}</strong><small>Consolidação pendente</small></td></tr>
            </tbody>
          </table>
        </div>
        <p className={styles.tableNote}>* Atingimento operacional não equivale a pontos concedidos. Para pontuar, os realizados devem estar completos e homologados conforme o regulamento. Metas ausentes são exibidas como “Sem meta cadastrada”, nunca como zero.</p>
      </section>
    </>}
  </div>;
}
