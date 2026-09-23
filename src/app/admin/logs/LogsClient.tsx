"use client";

import { useMemo, useState } from "react";

export type LogAcesso = {
  id: number;
  usuario: string | null;
  nome: string | null;
  perfil: string | null;
  codigo_representante: string | null;
  data_hora: string | null;
  ip: string | null;
  cidade: string | null;
  estado: string | null;
  pais: string | null;
  latitude: number | null;
  longitude: number | null;
  dispositivo: string | null;
  navegador: string | null;
  sistema_operacional: string | null;
  session_id: string | null;
  evento: string | null;
};

const POR_PAGINA = 15;

function formatarData(data: string | null) {
  if (!data) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(data));
}

function obterDataSP(data: string | null) {
  if (!data) return "";

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(data));
}

export default function LogsClient({
  logs,
}: {
  logs: LogAcesso[];
}) {
  const [pesquisa, setPesquisa] = useState("");
  const [perfil, setPerfil] = useState("");
  const [evento, setEvento] = useState("");
  const [data, setData] = useState("");
  const [pagina, setPagina] = useState(1);

  const perfis = useMemo(
    () =>
      [...new Set(logs.map((x) => x.perfil).filter(Boolean))]
        .sort() as string[],
    [logs]
  );

  const eventos = useMemo(
    () =>
      [...new Set(logs.map((x) => x.evento).filter(Boolean))]
        .sort() as string[],
    [logs]
  );

  const filtrados = useMemo(() => {
    const termo = pesquisa.trim().toLowerCase();

    return logs.filter((log) => {
      const pesquisaOK =
        !termo ||
        log.usuario?.toLowerCase().includes(termo) ||
        log.nome?.toLowerCase().includes(termo) ||
        log.codigo_representante?.toLowerCase().includes(termo) ||
        log.cidade?.toLowerCase().includes(termo) ||
        log.estado?.toLowerCase().includes(termo);

      const perfilOK =
        !perfil || log.perfil === perfil;

      const eventoOK =
        !evento || log.evento === evento;

      const dataOK =
        !data || obterDataSP(log.data_hora) === data;

      return pesquisaOK && perfilOK && eventoOK && dataOK;
    });
  }, [logs, pesquisa, perfil, evento, data]);

  const totalPaginas = Math.max(
    1,
    Math.ceil(filtrados.length / POR_PAGINA)
  );

  const paginaAtual = Math.min(pagina, totalPaginas);

  const inicio = (paginaAtual - 1) * POR_PAGINA;

  const registrosPagina = filtrados.slice(
    inicio,
    inicio + POR_PAGINA
  );

  function resetPagina() {
    setPagina(1);
  }

  function limparFiltros() {
    setPesquisa("");
    setPerfil("");
    setEvento("");
    setData("");
    setPagina(1);
  }

  const possuiFiltro =
    pesquisa || perfil || evento || data;

  return (
    <>
      <div className="logs-filters">

        <div className="logs-filter">
          <input
            type="search"
            value={pesquisa}
            placeholder="Pesquisar usuário, nome ou representante..."
            onChange={(e) => {
              setPesquisa(e.target.value);
              resetPagina();
            }}
          />
        </div>

        <div className="logs-filter">
          <select
            value={perfil}
            onChange={(e) => {
              setPerfil(e.target.value);
              resetPagina();
            }}
          >
            <option value="">Todos os perfis</option>

            {perfis.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="logs-filter">
          <select
            value={evento}
            onChange={(e) => {
              setEvento(e.target.value);
              resetPagina();
            }}
          >
            <option value="">Todos os eventos</option>

            {eventos.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="logs-filter">
          <input
            type="date"
            value={data}
            onChange={(e) => {
              setData(e.target.value);
              resetPagina();
            }}
          />
        </div>

      </div>

      {possuiFiltro && (
        <div className="logs-filter-result">

          <span>
            {filtrados.length} registro(s) encontrado(s)
          </span>

          <button
            type="button"
            onClick={limparFiltros}
          >
            Limpar filtros
          </button>

        </div>
      )}

      <div className="logs-table-scroll">

        <table className="logs-table">

          <thead>
            <tr>
              <th>DATA / HORA</th>
              <th>USUÁRIO</th>
              <th>NOME</th>
              <th>PERFIL</th>
              <th>REP.</th>
              <th>EVENTO</th>
              <th>LOCALIZAÇÃO</th>
              <th>DISPOSITIVO</th>
              <th>NAVEGADOR</th>
              <th>SISTEMA</th>
            </tr>
          </thead>

          <tbody>

            {registrosPagina.map((log) => {
              const localizacao =
                log.cidade || log.estado
                  ? `${log.cidade ?? ""}${
                      log.cidade && log.estado ? " / " : ""
                    }${log.estado ?? ""}`
                  : "-";

              const login =
                log.evento?.toUpperCase() === "LOGIN";

              return (
                <tr key={log.id}>

                  <td className="date-cell">
                    {formatarData(log.data_hora)}
                  </td>

                  <td className="user-cell">
                    {log.usuario ?? "-"}
                  </td>

                  <td className="name-cell">
                    {log.nome ?? "-"}
                  </td>

                  <td>
                    <span className="logs-badge profile">
                      {log.perfil ?? "-"}
                    </span>
                  </td>

                  <td>
                    {log.codigo_representante ?? "-"}
                  </td>

                  <td>
                    <span
                      className={
                        login
                          ? "logs-badge login"
                          : "logs-badge event"
                      }
                    >
                      {log.evento ?? "-"}
                    </span>
                  </td>

                  <td>{localizacao}</td>

                  <td>
                    {log.dispositivo ?? "-"}
                  </td>

                  <td>
                    {log.navegador ?? "-"}
                  </td>

                  <td>
                    {log.sistema_operacional ?? "-"}
                  </td>

                </tr>
              );
            })}

            {registrosPagina.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="logs-empty"
                >
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}

          </tbody>

        </table>

      </div>

      <footer className="logs-footer">

        <span>
          {filtrados.length === 0
            ? "Nenhum registro"
            : `Exibindo ${inicio + 1} - ${Math.min(
                inicio + POR_PAGINA,
                filtrados.length
              )} de ${filtrados.length}`}
        </span>

        <div className="logs-pagination">

          <button
            type="button"
            disabled={paginaAtual === 1}
            onClick={() =>
              setPagina((p) => Math.max(1, p - 1))
            }
          >
            ‹
          </button>

          <span>
            Página {paginaAtual} de {totalPaginas}
          </span>

          <button
            type="button"
            disabled={paginaAtual === totalPaginas}
            onClick={() =>
              setPagina((p) =>
                Math.min(totalPaginas, p + 1)
              )
            }
          >
            ›
          </button>

        </div>

      </footer>
    </>
  );
}