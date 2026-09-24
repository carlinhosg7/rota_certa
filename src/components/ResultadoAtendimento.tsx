"use client";

import { FormEvent, useEffect, useState } from "react";

type Props = {
  codigoCliente: string;
  nomeCliente: string;
  codigoRepresentante: string;
  usuario?: string;
  linhasDisponiveis?: string[];
  campanhasDisponiveis?: string[];
};

type Atendimento = {
  id: number;
  data_atendimento: string;
  resultado: string;
  pedido_realizado: boolean;
  numero_pedido: string | null;
  quantidade_pares: number | null;
  valor_pedido: number | null;
  linhas_apresentadas: string[] | null;
  campanha_utilizada: string | null;
  motivo_nao_compra: string | null;
  observacoes: string | null;
  proxima_acao: string | null;
  data_proxima_acao: string | null;
};

const RESULTADOS = [
  "PEDIDO REALIZADO",
  "NEGOCIAÇÃO EM ANDAMENTO",
  "SEM PEDIDO",
  "CLIENTE NÃO VISITADO",
  "REAGENDAR",
];

const MOTIVOS = [
  "PREÇO",
  "ESTOQUE ALTO",
  "SEM LIMITE / BLOQUEIO FINANCEIRO",
  "SEM INTERESSE NO MIX",
  "AGUARDANDO NOVA COLEÇÃO",
  "CONCORRÊNCIA",
  "CLIENTE FECHADO / NÃO LOCALIZADO",
  "OUTRO",
];

function moeda(v: number | null) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v || 0);
}

function dataHora(v: string) {
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? v
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(d);
}

export default function ResultadoAtendimento({
  codigoCliente,
  nomeCliente,
  codigoRepresentante,
  usuario = "",
  linhasDisponiveis = [],
  campanhasDisponiveis = [],
}: Props) {
  const [resultado, setResultado] = useState("");
  const [pedidoRealizado, setPedidoRealizado] = useState(false);
  const [numeroPedido, setNumeroPedido] = useState("");
  const [pares, setPares] = useState("");
  const [valor, setValor] = useState("");
  const [linhas, setLinhas] = useState<string[]>([]);
  const [campanha, setCampanha] = useState("");
  const [motivo, setMotivo] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [proximaAcao, setProximaAcao] = useState("");
  const [dataProximaAcao, setDataProximaAcao] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const [historico, setHistorico] = useState<Atendimento[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(true);

  async function carregarHistorico() {
    try {
      setCarregandoHistorico(true);

      const r = await fetch(
        `/api/atendimentos?cliente=${encodeURIComponent(codigoCliente)}`,
        { cache: "no-store" }
      );

      const j = await r.json();

      if (!r.ok || !j.sucesso) {
        throw new Error(j.erro || "Erro ao carregar histórico.");
      }

      setHistorico(j.atendimentos || []);
    } catch (e) {
      console.error("[ATENDIMENTOS][HISTORICO]", e);
    } finally {
      setCarregandoHistorico(false);
    }
  }

  useEffect(() => {
    carregarHistorico();
  }, [codigoCliente]);

  function alternarLinha(linha: string) {
    setLinhas((atual) =>
      atual.includes(linha)
        ? atual.filter((x) => x !== linha)
        : [...atual, linha]
    );
  }

  function limpar() {
    setResultado("");
    setPedidoRealizado(false);
    setNumeroPedido("");
    setPares("");
    setValor("");
    setLinhas([]);
    setCampanha("");
    setMotivo("");
    setObservacoes("");
    setProximaAcao("");
    setDataProximaAcao("");
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();

    setMensagem("");
    setErro("");

    if (!resultado) {
      setErro("Selecione o resultado do atendimento.");
      return;
    }

    try {
      setSalvando(true);

      const r = await fetch("/api/atendimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo_cliente: codigoCliente,
          nome_cliente: nomeCliente,
          codigo_representante: codigoRepresentante,
          usuario,
          resultado,
          pedido_realizado: pedidoRealizado,
          numero_pedido: numeroPedido,
          quantidade_pares: pares,
          valor_pedido: valor,
          linhas_apresentadas: linhas,
          campanha_utilizada: campanha,
          motivo_nao_compra: motivo,
          observacoes,
          proxima_acao: proximaAcao,
          data_proxima_acao: dataProximaAcao,
        }),
      });

      const j = await r.json();

      if (!r.ok || !j.sucesso) {
        throw new Error(j.erro || "Erro ao salvar atendimento.");
      }

      setMensagem("Atendimento registrado com sucesso.");
      limpar();
      await carregarHistorico();
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.message
          : "Não foi possível registrar o atendimento."
      );
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section style={s.bloco}>
      <div style={s.titulo}>
        <span style={s.numero}>09</span>
        Resultado do Atendimento
      </div>

      <div style={s.subtitulo}>
        Registre o que aconteceu na visita para acompanhar conversão, campanhas
        e próximas oportunidades deste cliente.
      </div>

      <form onSubmit={salvar}>
        <div style={s.grid}>
          <label style={s.campo}>
            <span>Resultado *</span>
            <select
              value={resultado}
              onChange={(e) => {
                const v = e.target.value;
                setResultado(v);
                setPedidoRealizado(v === "PEDIDO REALIZADO");
              }}
              style={s.input}
            >
              <option value="">Selecione</option>
              {RESULTADOS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>

          <label style={s.campo}>
            <span>Pedido realizado?</span>
            <select
              value={pedidoRealizado ? "SIM" : "NAO"}
              onChange={(e) => setPedidoRealizado(e.target.value === "SIM")}
              style={s.input}
            >
              <option value="NAO">Não</option>
              <option value="SIM">Sim</option>
            </select>
          </label>

          {pedidoRealizado && (
            <>
              <label style={s.campo}>
                <span>Nº do pedido</span>
                <input
                  value={numeroPedido}
                  onChange={(e) => setNumeroPedido(e.target.value)}
                  style={s.input}
                />
              </label>

              <label style={s.campo}>
                <span>Quantidade de pares</span>
                <input
                  type="number"
                  min="0"
                  value={pares}
                  onChange={(e) => setPares(e.target.value)}
                  style={s.input}
                />
              </label>

              <label style={s.campo}>
                <span>Valor do pedido</span>
                <input
                  inputMode="decimal"
                  placeholder="Ex.: 6480,00"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  style={s.input}
                />
              </label>
            </>
          )}

          <label style={s.campo}>
            <span>Campanha utilizada</span>
            <select
              value={campanha}
              onChange={(e) => setCampanha(e.target.value)}
              style={s.input}
            >
              <option value="">Nenhuma / selecione</option>
              {campanhasDisponiveis.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>

          {!pedidoRealizado && (
            <label style={s.campo}>
              <span>Motivo de não compra</span>
              <select
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                style={s.input}
              >
                <option value="">Selecione</option>
                {MOTIVOS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          )}

          <label style={s.campo}>
            <span>Próxima ação</span>
            <input
              value={proximaAcao}
              onChange={(e) => setProximaAcao(e.target.value)}
              placeholder="Ex.: retornar para reposição"
              style={s.input}
            />
          </label>

          <label style={s.campo}>
            <span>Data da próxima ação</span>
            <input
              type="date"
              value={dataProximaAcao}
              onChange={(e) => setDataProximaAcao(e.target.value)}
              style={s.input}
            />
          </label>
        </div>

        {linhasDisponiveis.length > 0 && (
          <div style={s.area}>
            <div style={s.label}>Linhas apresentadas</div>
            <div style={s.chips}>
              {linhasDisponiveis.map((linha) => {
                const ativo = linhas.includes(linha);

                return (
                  <button
                    key={linha}
                    type="button"
                    onClick={() => alternarLinha(linha)}
                    style={{
                      ...s.chip,
                      ...(ativo ? s.chipAtivo : {}),
                    }}
                  >
                    {ativo ? "✓ " : ""}
                    {linha}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <label style={{ ...s.campo, marginTop: 16 }}>
          <span>Observações</span>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={4}
            placeholder="Informações importantes do atendimento..."
            style={{ ...s.input, resize: "vertical" }}
          />
        </label>

        {erro && <div style={s.erro}>{erro}</div>}
        {mensagem && <div style={s.sucesso}>{mensagem}</div>}

        <button type="submit" disabled={salvando} style={s.salvar}>
          {salvando ? "Salvando..." : "Salvar atendimento"}
        </button>
      </form>

      <div style={s.historico}>
        <div style={s.historicoTitulo}>HISTÓRICO DE ATENDIMENTOS</div>

        {carregandoHistorico ? (
          <div style={s.vazio}>Carregando histórico...</div>
        ) : historico.length === 0 ? (
          <div style={s.vazio}>Nenhum atendimento registrado para este cliente.</div>
        ) : (
          historico.map((a) => (
            <div key={a.id} style={s.itemHistorico}>
              <div style={s.itemTopo}>
                <div>
                  <strong>{a.resultado}</strong>
                  <small>{dataHora(a.data_atendimento)}</small>
                </div>

                {a.pedido_realizado && (
                  <span style={s.badgePedido}>PEDIDO</span>
                )}
              </div>

              {a.pedido_realizado && (
                <div style={s.resumoPedido}>
                  {a.numero_pedido && <>Pedido {a.numero_pedido} • </>}
                  {a.quantidade_pares != null && (
                    <>{a.quantidade_pares} pares • </>
                  )}
                  {a.valor_pedido != null && moeda(a.valor_pedido)}
                </div>
              )}

              {a.campanha_utilizada && (
                <div style={s.detalhe}>
                  <b>Campanha:</b> {a.campanha_utilizada}
                </div>
              )}

              {a.linhas_apresentadas?.length ? (
                <div style={s.detalhe}>
                  <b>Linhas:</b> {a.linhas_apresentadas.join(" • ")}
                </div>
              ) : null}

              {a.motivo_nao_compra && (
                <div style={s.detalhe}>
                  <b>Motivo:</b> {a.motivo_nao_compra}
                </div>
              )}

              {a.observacoes && (
                <div style={s.detalhe}>{a.observacoes}</div>
              )}

              {a.proxima_acao && (
                <div style={s.proxima}>
                  <b>Próxima ação:</b> {a.proxima_acao}
                  {a.data_proxima_acao &&
                    ` • ${new Intl.DateTimeFormat("pt-BR").format(
                      new Date(`${a.data_proxima_acao}T12:00:00`)
                    )}`}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}

const s: Record<string, React.CSSProperties> = {
  bloco: {
    background: "#fff",
    border: "1px solid #f0c88f",
    borderRadius: 18,
    padding: 24,
    marginTop: 18,
    color: "#3d2300",
  },
  titulo: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 18,
    fontWeight: 900,
  },
  numero: {
    width: 30,
    height: 30,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    background: "#ff9d1c",
    fontSize: 11,
    fontWeight: 900,
  },
  subtitulo: {
    margin: "10px 0 20px",
    color: "#95683c",
    fontSize: 12,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
    gap: 12,
  },
  campo: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    color: "#6b410f",
    fontSize: 10,
    fontWeight: 900,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #e9b86f",
    borderRadius: 10,
    padding: "11px 12px",
    background: "#fffaf3",
    color: "#3d2300",
    outline: "none",
    fontSize: 12,
  },
  area: {
    marginTop: 16,
  },
  label: {
    marginBottom: 8,
    color: "#6b410f",
    fontSize: 10,
    fontWeight: 900,
  },
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 7,
  },
  chip: {
    border: "1px solid #e9b86f",
    borderRadius: 999,
    padding: "7px 10px",
    background: "#fffaf3",
    color: "#8b5419",
    cursor: "pointer",
    fontSize: 10,
    fontWeight: 800,
  },
  chipAtivo: {
    background: "#ff9d1c",
    color: "#3d2300",
    borderColor: "#ff9d1c",
  },
  salvar: {
    marginTop: 16,
    border: 0,
    borderRadius: 10,
    padding: "12px 18px",
    background: "#f57c00",
    color: "#fff",
    fontWeight: 900,
    cursor: "pointer",
  },
  erro: {
    marginTop: 14,
    padding: 10,
    borderRadius: 9,
    background: "#fff0f0",
    color: "#b42318",
    fontSize: 11,
  },
  sucesso: {
    marginTop: 14,
    padding: 10,
    borderRadius: 9,
    background: "#edf9f0",
    color: "#18743a",
    fontSize: 11,
  },
  historico: {
    marginTop: 26,
    paddingTop: 20,
    borderTop: "1px solid #f0d8b5",
  },
  historicoTitulo: {
    marginBottom: 12,
    color: "#9b5c1d",
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: 1.2,
  },
  vazio: {
    padding: 16,
    borderRadius: 12,
    background: "#fffaf3",
    color: "#9b6c3f",
    fontSize: 11,
  },
  itemHistorico: {
    padding: 14,
    marginBottom: 10,
    borderRadius: 12,
    background: "#fffaf3",
    border: "1px solid #f1d7b1",
  },
  itemTopo: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  badgePedido: {
    borderRadius: 999,
    padding: "5px 8px",
    background: "#eaf8ed",
    color: "#1d7a3d",
    fontSize: 9,
    fontWeight: 900,
  },
  resumoPedido: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: 800,
  },
  detalhe: {
    marginTop: 7,
    color: "#76512c",
    fontSize: 11,
    lineHeight: 1.45,
  },
  proxima: {
    marginTop: 9,
    paddingTop: 8,
    borderTop: "1px solid #eed9ba",
    color: "#a55a0a",
    fontSize: 11,
  },
};

