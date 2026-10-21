"use client";

import { useEffect, useState } from "react";
import styles from "./metas.module.css";

type Indicador = {
  meta: number;
  realizado: number;
  diferenca: number;
  percentual: number;
  faltante: number;
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
  const formatar = moeda
    ? formatoValores.format.bind(formatoValores)
    : formatoPares.format.bind(formatoPares);

  const percentual = Number.isFinite(indicador.percentual)
    ? indicador.percentual
    : 0;

  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <h3>{titulo}</h3>
        <span className={styles.tag}>{moeda ? "VALORES" : "PARES"}</span>
      </div>

      <div className={styles.caption}>Meta oficial</div>
      <div className={styles.bigNumber}>{formatar(indicador.meta)}</div>

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
export default function MetasClient() {
  const [tipo, setTipo] = useState("FATURAMENTO");
  const [periodicidade, setPeriodicidade] = useState("MENSAL");
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
        const parametros = new URLSearchParams({
          tipo,
          periodicidade,
          pedido: "TODOS",
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
  }, [tipo, periodicidade, regional, representante]);

  return (
    <section className={styles.container}>
      <div className={styles.filters}>
        <div>
          <label htmlFor="tipo-meta">Indicador</label>
          <select
            id="tipo-meta"
            value={tipo}
            onChange={(event) => setTipo(event.target.value)}
          >
            <option value="FATURAMENTO">Faturamento</option>
            <option value="ENTRADA">Entrada de pedidos</option>
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
            <option value="SEMANAL">Semanal</option>
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
              {tipo === "FATURAMENTO"
                ? "Faturamento"
                : "Entrada de pedidos"}
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

          <div className={styles.waterGrid}>
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