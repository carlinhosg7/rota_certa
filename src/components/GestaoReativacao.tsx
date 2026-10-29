"use client";

import { useCallback, useEffect, useState } from "react";

type Gestao = {
  classificacao: string;
  tentativas_contato: number;
  retorno: string | null;
  proxima_acao: string | null;
  data_proxima_acao: string | null;
  responsavel: string | null;
  observacoes: string | null;
  status_acao: string;
  atualizado_em: string;
};

type Historico = {
  id: number;
  classificacao_anterior: string | null;
  classificacao_nova: string | null;
  tentativas_contato: number | null;
  retorno: string | null;
  proxima_acao: string | null;
  data_proxima_acao: string | null;
  status_acao: string | null;
  usuario: string | null;
  criado_em: string;
};

const classificacoes = [
  ["EM_NEGOCIACAO", "Em negociação"],
  ["REATIVADO", "Reativado"],
  ["AGUARDANDO_CREDITO", "Aguardando crédito"],
  ["SEM_INTERESSE", "Sem interesse"],
  ["NAO_LOCALIZADO", "Não localizado"],
  ["EMPRESA_ENCERRADA", "Empresa encerrada"],
  ["TENTATIVAS_ESGOTADAS", "Tentativas esgotadas"],
];

const rotulos: Record<string, string> =
  Object.fromEntries(classificacoes);

const inicial = {
  classificacao: "EM_NEGOCIACAO",
  tentativas_contato: 0,
  retorno: "",
  proxima_acao: "",
  data_proxima_acao: "",
  responsavel: "",
  observacoes: "",
  status_acao: "PENDENTE",
};

type Formulario = typeof inicial;

export default function GestaoReativacao({
  codigoCliente,
}: {
  codigoCliente: string;
}) {
  const [form, setForm] = useState<Formulario>(inicial);
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");

    try {
      const resposta = await fetch(
        `/api/gestao-reativacao?cliente=${encodeURIComponent(codigoCliente)}`,
        { cache: "no-store" }
      );

      const dados = await resposta.json();

      if (!resposta.ok || !dados.sucesso) {
        throw new Error(dados.erro || "Erro ao consultar gestão.");
      }

      const g = dados.gestao as Gestao | null;

      setForm(
        g
          ? {
              classificacao: g.classificacao,
              tentativas_contato: g.tentativas_contato,
              retorno: g.retorno ?? "",
              proxima_acao: g.proxima_acao ?? "",
              data_proxima_acao: g.data_proxima_acao ?? "",
              responsavel: g.responsavel ?? "",
              observacoes: g.observacoes ?? "",
              status_acao: g.status_acao,
            }
          : { ...inicial }
      );

      setHistorico(dados.historico ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setCarregando(false);
    }
  }, [codigoCliente]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  function alterar<K extends keyof Formulario>(
    campo: K,
    valor: Formulario[K]
  ) {
    setForm(atual => ({ ...atual, [campo]: valor }));
    setSucesso("");
  }

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvando(true);
    setErro("");
    setSucesso("");

    try {
      const resposta = await fetch("/api/gestao-reativacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo_cliente: codigoCliente,
          ...form,
        }),
      });

      const dados = await resposta.json();

      if (!resposta.ok || !dados.sucesso) {
        throw new Error(dados.erro || "Erro ao salvar.");
      }

      setSucesso("Gestão atualizada com sucesso.");
      await carregar();
      setSucesso("Gestão atualizada com sucesso.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setSalvando(false);
    }
  }

  const campo: React.CSSProperties = {
    width: "100%",
    minWidth: 0,
    padding: "10px 12px",
    border: "1px solid #d6d3d1",
    borderRadius: 8,
    background: "#fff",
    color: "#292524",
    fontSize: 14,
    boxSizing: "border-box",
  };

  const tituloCampo: React.CSSProperties = {
    display: "grid",
    gap: 6,
    fontSize: 13,
    fontWeight: 700,
    color: "#57534e",
  };

  return (
    <section
      style={{
        padding: 22,
        border: "1px solid #fed7aa",
        borderRadius: 16,
        background: "#fffaf5",
        marginBottom: 24,
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: "#9a3412" }}>
          Gestão de Reativação
        </h2>
        <p style={{ color: "#78716c", fontSize: 13 }}>
          Acompanhamento comercial, próximas ações e histórico do cliente.
        </p>
      </div>

      {carregando ? (
        <p>Carregando gestão...</p>
      ) : (
        <form onSubmit={salvar}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(210px, 1fr))",
              gap: 15,
            }}
          >
            <label style={tituloCampo}>
              Classificação comercial
              <select
                style={campo}
                value={form.classificacao}
                onChange={e => alterar("classificacao", e.target.value)}
              >
                {classificacoes.map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>{rotulo}</option>
                ))}
              </select>
            </label>

            <label style={tituloCampo}>
              Tentativas de contato
              <input
                style={campo}
                type="number"
                min={0}
                step={1}
                required
                value={form.tentativas_contato}
                onChange={e =>
                  alterar("tentativas_contato", Number(e.target.value))
                }
              />
            </label>

            <label style={tituloCampo}>
              Data da próxima ação
              <input
                style={campo}
                type="date"
                value={form.data_proxima_acao}
                onChange={e =>
                  alterar("data_proxima_acao", e.target.value)
                }
              />
            </label>

            <label style={tituloCampo}>
              Situação da ação
              <select
                style={campo}
                value={form.status_acao}
                onChange={e => alterar("status_acao", e.target.value)}
              >
                <option value="PENDENTE">Pendente</option>
                <option value="CONCLUIDA">Concluída</option>
                <option value="CANCELADA">Cancelada</option>
              </select>
            </label>

            <label style={tituloCampo}>
              Responsável
              <input
                style={campo}
                value={form.responsavel}
                onChange={e => alterar("responsavel", e.target.value)}
                placeholder="Responsável pela próxima ação"
                maxLength={250}
              />
            </label>

            <label style={tituloCampo}>
              Próxima ação
              <input
                style={campo}
                value={form.proxima_acao}
                onChange={e => alterar("proxima_acao", e.target.value)}
                placeholder="Ex.: Visitar cliente"
                maxLength={1000}
              />
            </label>
          </div>

          <div style={{ display: "grid", gap: 15, marginTop: 15 }}>
            <label style={tituloCampo}>
              Retorno do cliente
              <textarea
                style={campo}
                rows={2}
                maxLength={2000}
                value={form.retorno}
                onChange={e => alterar("retorno", e.target.value)}
              />
            </label>

            <label style={tituloCampo}>
              Observações
              <textarea
                style={campo}
                rows={3}
                maxLength={3000}
                value={form.observacoes}
                onChange={e => alterar("observacoes", e.target.value)}
              />
            </label>
          </div>

          {erro && (
            <p role="alert" style={{ color: "#b91c1c" }}>{erro}</p>
          )}

          {sucesso && (
            <p role="status" style={{ color: "#15803d" }}>{sucesso}</p>
          )}

          <button
            type="submit"
            disabled={salvando}
            style={{
              marginTop: 18,
              background: "#ea580c",
              color: "#fff",
              padding: "12px 20px",
              border: 0,
              borderRadius: 9,
              fontWeight: 800,
              cursor: salvando ? "wait" : "pointer",
            }}
          >
            {salvando ? "Salvando..." : "Salvar Gestão"}
          </button>
        </form>
      )}

      <div style={{ marginTop: 28 }}>
        <h3 style={{ color: "#9a3412" }}>Histórico de movimentações</h3>

        {historico.length === 0 ? (
          <p style={{ fontSize: 13, color: "#78716c" }}>
            Nenhuma movimentação registrada.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {historico.map(h => (
              <div
                key={h.id}
                style={{
                  padding: 14,
                  border: "1px solid #e7e5e4",
                  borderRadius: 10,
                  background: "#fff",
                  fontSize: 13,
                }}
              >
                <strong>
                  {rotulos[h.classificacao_nova ?? ""] ??
                    h.classificacao_nova}
                </strong>
                <div style={{ color: "#78716c", marginTop: 5 }}>
                  {new Date(h.criado_em).toLocaleString("pt-BR")}
                  {" · "}
                  {h.usuario ?? "Usuário não informado"}
                </div>
                <div style={{ marginTop: 6 }}>
                  Tentativas: {h.tentativas_contato ?? 0}
                  {" · "}
                  Ação: {h.status_acao ?? "-"}
                  {" · "}
                  Data: {h.data_proxima_acao ?? "-"}
                </div>
                {h.proxima_acao && (
                  <div>Próxima ação: {h.proxima_acao}</div>
                )}
                {h.retorno && (
                  <div>Retorno: {h.retorno}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}