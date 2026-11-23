"use client";

import { useEffect, useState } from "react";
import styles from "./metas.module.css";

type Indicador = {
  meta: number;
  realizado: number;
  diferenca: number;
  percentual: number;
  faltante: number;
  realizadoAA?: number | null;
};

type OpcaoRegional = {
  codigo: string;
  nome: string;
};

type OpcaoRepresentante = {
  codigo: string;
  nome: string;
  regional: string;
};

type Resposta = {
  filtros: {
    regional: string;
    representante: string;
    regionais: OpcaoRegional[];
    representantes: OpcaoRepresentante[];
  };
  tipo: string;
  periodicidade: string;
  periodo: {
    inicio: string;
    fim: string;
    original: string;
  };
  indicadores: {
    pares: Indicador;
    valores: Indicador;
  };
  comparabilidade: {
    validada: boolean;
    escopo: string;
    supervisores: string[];
    possuiExclusoes: boolean;
  };
  conciliacao: {
    representantesComMeta: number;
    representantesNoRealizado: number;
    representantesConciliados: number;
    representantesSemRealizado: string[];
    representantesSemMeta: Array<{
      codigo: string;
      nome: string;
      pares: number;
      valor: number;
    }>;
  };
  avisos: string[];
  erro?: string;
};

const formatoPares = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const formatoValores = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatoPercentual = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function Cartao({
  titulo,
  indicador,
  moeda,
}: {
  titulo: string;
  indicador: Indicador;
  moeda: boolean;
}) {
  const formatar = (valor: number) =>
    moeda ? formatoValores.format(valor) : formatoPares.format(valor);

  const percentual = Number.isFinite(indicador.percentual)
    ? indicador.percentual
    : 0;

  const possuiAA =
    typeof indicador.realizadoAA === "number" &&
    Number.isFinite(indicador.realizadoAA);

  const aa = possuiAA ? indicador.realizadoAA! : 0;
  const diferencaAA = indicador.realizado - aa;

  const evolucaoAA =
    possuiAA && aa !== 0
      ? (diferencaAA / aa) * 100
      : null;

  const corEvolucao =
    diferencaAA > 0
      ? "#16a34a"
      : diferencaAA < 0
        ? "#dc2626"
        : "inherit";

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <h3>{titulo}</h3>
        <span className={styles.tag}>
          {moeda ? "VALORES" : "PARES"}
        </span>
      </div>

      <div className={styles.caption}>Meta oficial</div>
      <div className={styles.bigNumber}>
        {formatar(indicador.meta)}
      </div>

      <div className={styles.metrics}>
        <div>
          <span>Realizado</span>
          <strong>{formatar(indicador.realizado)}</strong>
        </div>
        <div>
          <span>Faltante</span>
          <strong>{formatar(indicador.faltante)}</strong>
        </div>
      </div>

      <div className={styles.progressTrack}>
        <div
          className={styles.progressFill}
          style={{
            width: `${Math.max(0, Math.min(100, percentual))}%`,
          }}
        />
      </div>

      <div className={styles.percentual}>
        {formatoPercentual.format(percentual)}% de atingimento
      </div>

      <div
        style={{
          marginTop: 18,
          paddingTop: 14,
          borderTop: "1px solid rgba(128,128,128,.25)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            marginBottom: 12,
            opacity: 0.75,
          }}
        >
          COMPARATIVO ANO ANTERIOR
        </div>

        {possuiAA ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 14,
            }}
          >
            <div>
              <div className={styles.caption}>Realizado AA</div>
              <strong>{formatar(aa)}</strong>
            </div>

            <div>
              <div className={styles.caption}>Diferença</div>
              <strong style={{ color: corEvolucao }}>
                {diferencaAA > 0 ? "+" : ""}
                {formatar(diferencaAA)}
              </strong>
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <div className={styles.caption}>Evolução anual</div>
              <strong style={{ color: corEvolucao, fontSize: 20 }}>
                {evolucaoAA === null
                  ? "Sem base comparável"
                  : `${evolucaoAA > 0 ? "+" : ""}${formatoPercentual.format(evolucaoAA)}%`}
              </strong>
            </div>
          </div>
        ) : (
          <div className={styles.caption}>
            AA não disponível para este período
          </div>
        )}
      </div>
    </article>
  );
}
function CaixaAgua({
  titulo,
  indicador,
  moeda,
  comparabilidadeValidada,
}: {
  titulo: string;
  indicador: Indicador;
  moeda: boolean;
  comparabilidadeValidada: boolean;
}) {
  const percentual = Number.isFinite(indicador.percentual)
    ? Math.max(0, indicador.percentual)
    : 0;

  const nivel = Math.min(100, percentual);

  const formatar = (valor: number) =>
    moeda
      ? formatoValores.format(valor)
      : formatoPares.format(valor);

  return (
    <article className={styles.waterCard}>
      <div className={styles.waterInfo}>
        <span className={styles.waterLabel}>{titulo}</span>
        <strong className={styles.waterPercent}>
          {formatoPercentual.format(percentual)}%
        </strong>
        <span className={styles.waterSubtitle}>da meta atingida</span>

        <div className={styles.waterNumbers}>
          <div>
            <span>Meta</span>
            <strong>{formatar(indicador.meta)}</strong>
          </div>
          <div>
            <span>Realizado</span>
            <strong>{formatar(indicador.realizado)}</strong>
          </div>
          <div>
            <span>Faltante</span>
            <strong>{formatar(indicador.faltante)}</strong>
          </div>
        </div>

        {!comparabilidadeValidada && (
          <span className={styles.waterCaution}>
            Comparabilidade ainda não validada
          </span>
        )}
      </div>

      <div
        className={styles.waterTank}
        role="img"
        aria-label={`${titulo}: ${formatoPercentual.format(percentual)} por cento de atingimento`}
      >
        <div className={styles.waterTankInner}>
          <div
            className={styles.waterLiquid}
            style={{ height: `${nivel}%` }}
          >
            <div className={styles.waterWave} />
            <div className={styles.waterWaveSecondary} />
          </div>
          <div className={styles.waterTankMarks}>
            <span>100%</span>
            <span>75%</span>
            <span>50%</span>
            <span>25%</span>
            <span>0%</span>
          </div>
        </div>
      </div>
    </article>
  );
}

// KIDY_METAS_MENSAL_LAYOUT_V2: realiza mensalmente a leitura da mesma API da Campanha.
type KIDYIndicadorCampanha = {chave:string;metaPares:number|string;metaValor:number|string;realizadoPares:number|string|null;realizadoValor:number|string|null};
type KIDYRespostaCampanha = {filtros:{supervisores:string[];representantes:Array<{codigo:string;nome:string}>};indicadores:KIDYIndicadorCampanha[]};
function adaptarCampanhaMetas(fonte:KIDYRespostaCampanha,tipo:string,regional:string,representante:string,competencia:string):Resposta {
  const chaves = tipo === 'ENTRADA_GERAL' ? ['PRODUCAO','KIDEX'] : [tipo];
  const itens=chaves.map(chave=>{
    const i=fonte.indicadores.find(x=>x.chave===chave);
    if(!i)throw Error('Indicador ausente da Campanha: '+chave);
    return i;
  });
  const soma=(campo:'metaPares'|'metaValor'|'realizadoPares'|'realizadoValor')=>itens.reduce((n,i)=>n+Number(i[campo]??0),0);
  const fazer=(meta:number,realizado:number):Indicador=>({meta,realizado,diferenca:realizado-meta,faltante:Math.max(0,meta-realizado),percentual:meta>0?100*realizado/meta:0,realizadoAA:null});
  const [ano,mes] = competencia.split('-').map(Number);
  const fim=new Date(Date.UTC(ano,mes,0)).toISOString().slice(0,10);
  return {
    tipo,periodicidade:'MENSAL',
    filtros:{regional,representante,regionais:(fonte.filtros?.supervisores||[]).map(codigo=>({codigo,nome:codigo})),representantes:(fonte.filtros?.representantes||[]).map(r=>({...r,regional}))},
    periodo:{inicio:competencia,fim,original:'Realizados oficiais — mês completo: '+competencia.slice(5,7)+'/'+competencia.slice(0,4)},
    indicadores:{pares:fazer(soma('metaPares'),soma('realizadoPares')),valores:fazer(soma('metaValor'),soma('realizadoValor'))},
    comparabilidade:{validada:false,escopo:'CAMPANHA_MENSAL',supervisores:[],possuiExclusoes:false},
    conciliacao:{representantesComMeta:0,representantesNoRealizado:0,representantesConciliados:0,representantesSemRealizado:[],representantesSemMeta:[]},
    avisos:['Mes completo conforme as cargas mensais oficiais da Campanha.','Comparativo AA indisponivel nesta fonte.'],
  };
}

export default function MetasClient() {
  const [tipo, setTipo] = useState("FATURAMENTO");
  const [periodicidade, setPeriodicidade] = useState("MENSAL");
  const [visaoKidex, setVisaoKidex] = useState("CADASTRO");
  const [dados, setDados] = useState<Resposta | null>(null);
  const [regional, setRegional] = useState("");
  const [representante, setRepresentante] = useState("");
  const [regionais, setRegionais] = useState<OpcaoRegional[]>([]);
  const [representantes, setRepresentantes] = useState<OpcaoRepresentante[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function carregar() {
      setCarregando(true);
      setErro("");
      setDados(null);

      try {
        if (periodicidade === "MENSAL") {
          const competencia = "2026-11-01";
          const parametrosCampanha = new URLSearchParams({competencia,supervisor:regional,representante});
          const response = await fetch('/api/campanha?'+parametrosCampanha.toString(),{credentials:'same-origin',cache:'no-store',signal:controller.signal});
          const json = await response.json();
          if(!response.ok)throw Error(json.erro||'Falha ao consultar realizados mensais');
          const resultado=adaptarCampanhaMetas(json as KIDYRespostaCampanha,tipo,regional,representante,competencia);
          if(!controller.signal.aborted){setDados(resultado);setRegionais(resultado.filtros.regionais);setRepresentantes(resultado.filtros.representantes);}
          return;
        }
        if(tipo==='PRODUCAO'||tipo==='ENTRADA_GERAL')throw Error('Este indicador esta disponivel na visao mensal.');
        const parametros = new URLSearchParams({
          tipo,
          periodicidade,
          pedido: "TODOS",
          ...(tipo === "KIDEX" ? { visao: visaoKidex } : {}),
          regional,
          representante,
        });

        const resposta = await fetch(
          `/api/metas?${parametros.toString()}`,
          {
            credentials: "same-origin",
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const json = await resposta.json();

        if (!resposta.ok) {
          throw new Error(json.erro || "Falha ao carregar metas");
        }

        if (!controller.signal.aborted) {
          setDados(json);
          setRegionais(json.filtros?.regionais || []);
          setRepresentantes(json.filtros?.representantes || []);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setErro(
            error instanceof Error
              ? error.message
              : "Erro ao carregar indicadores"
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setCarregando(false);
        }
      }
    }

    carregar();

    return () => controller.abort();
  }, [tipo, periodicidade, regional, representante, visaoKidex]);

  return (
    <section className={styles.container}>
      <div className={styles.filters}>
        <div>
          <label htmlFor="tipo-meta">Indicador</label>
          <select
            id="tipo-meta"
            value={tipo}
            onChange={(event) => {setTipo(event.target.value);if(event.target.value==='PRODUCAO'||event.target.value==='ENTRADA_GERAL')setPeriodicidade('MENSAL');}}
          >
            <option value="FATURAMENTO">Faturamento</option>
            <option value="PRODUCAO">Entrada Produção</option>
            <option value="KIDEX">Entrada KIDEX</option>
            <option value="ENTRADA_GERAL">Entrada Geral</option>
          </select>
        </div>

        <div>
          <label htmlFor="periodicidade-meta">Período</label>
          <select
            id="periodicidade-meta"
            value={periodicidade}
            onChange={(event) => setPeriodicidade(event.target.value)}
          >
            <option value="MENSAL">Mensal</option>
            <option value="SEMANAL" disabled={tipo==='PRODUCAO'||tipo==='ENTRADA_GERAL'}>Semanal</option>
          </select>
        </div>
        <div>
          <label htmlFor="regional-meta">Gestão Regional</label>
          <select
            id="regional-meta"
            value={regional}
            onChange={(event) => {
              setRegional(event.target.value);
              setRepresentante("");
              setRepresentantes([]);
            }}
          >
            <option value="">Todas as regionais</option>
            {regionais.map((item) => (
              <option key={item.codigo} value={item.codigo}>
                {item.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="representante-meta">Representante</label>
          <select
            id="representante-meta"
            value={representante}
            onChange={(event) => setRepresentante(event.target.value)}
          >
            <option value="">Todos os representantes</option>
            {representantes.map((item) => (
              <option key={item.codigo} value={item.codigo}>
                {item.codigo} - {item.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {tipo === "KIDEX" && periodicidade === "SEMANAL" && (
        <div className={styles.kidexSwitch}>
          <label htmlFor="visao-kidex">Visão KIDEX (somente pedido tipo 4)</label>
          <select id="visao-kidex" value={visaoKidex} onChange={(event) => setVisaoKidex(event.target.value)}>
            <option value="CADASTRO">Entrada KIDEX — Data de Cadastro</option>
            <option value="ENTREGA">Venda para Faturamento Dentro do Mês — Data de Entrega</option>
          </select>
        </div>
      )}

      {carregando && (
        <div className={styles.message}>Carregando indicadores...</div>
      )}

      {erro && (
        <div className={styles.error}>{erro}</div>
      )}

      {dados && !carregando && (
        <>
          <div className={styles.periodo}>
            <strong>
              {tipo === "KIDEX"
                ? visaoKidex === "CADASTRO" ? "Entrada KIDEX" : "Venda para Faturamento Dentro do Mês"
                : tipo === "FATURAMENTO" ? "Faturamento" : tipo === "PRODUCAO" ? "Entrada Produção" : tipo === "ENTRADA_GERAL" ? "Entrada Geral" : "Entrada de pedidos"}
              {" — "}
              {periodicidade === "MENSAL" ? "Mensal" : "Semanal"}
            </strong>
            <span>{dados.periodo.original}</span>
          </div>

          <div className={styles.cards}>
            <Cartao
              titulo="Meta em valores"
              indicador={dados.indicadores.valores}
              moeda
            />

            <Cartao
              titulo="Meta em pares"
              indicador={dados.indicadores.pares}
              moeda={false}
            />
          </div>

          <div className={`${styles.waterGrid} ${tipo === "FATURAMENTO" ? styles.waterGreen : tipo === "KIDEX" ? styles.waterGray : ""}`}>
            <CaixaAgua
              titulo="Atingimento em valores"
              indicador={dados.indicadores.valores}
              moeda
              comparabilidadeValidada={dados.comparabilidade.validada}
            />
            <CaixaAgua
              titulo="Atingimento em pares"
              indicador={dados.indicadores.pares}
              moeda={false}
              comparabilidadeValidada={dados.comparabilidade.validada}
            />
          </div>
          <details className={styles.details}>
            <summary>Detalhes da auditoria e fontes</summary>

            <p>
              Escopo: {dados.comparabilidade.escopo}
            </p>

            <p>
              Supervisores:{" "}
              {dados.comparabilidade.supervisores.join(", ") ||
                "Conforme fonte original"}
            </p>

            <p>
              Representantes sem realizado:{" "}
              {dados.conciliacao.representantesSemRealizado.join(", ") ||
                "Nenhum"}
            </p>

            <p>
              Representantes sem meta:{" "}
              {dados.conciliacao.representantesSemMeta
                .map((r) => `${r.codigo} - ${r.nome}`)
                .join("; ") || "Nenhum"}
            </p>

            <ul>
              {dados.avisos.map((aviso, index) => (
                <li key={index}>{aviso}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}