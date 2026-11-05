"use client";

import { useEffect, useRef, useState } from "react";

type Foto = {
  id: number;
  nome: string;
  url: string;
};

export default function TesteTreinamento() {
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const fotosRef = useRef<Foto[]>([]);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [status, setStatus] = useState("RASCUNHO");
  const [mensagem, setMensagem] = useState("");
  const [descricao, setDescricao] = useState("");

  useEffect(() => {
    fotosRef.current = fotos;
  }, [fotos]);

  useEffect(() => {
    return () => {
      fotosRef.current.forEach(f => URL.revokeObjectURL(f.url));
    };
  }, []);

  function adicionar(arquivos: FileList | null) {
    if (!arquivos?.length) return;

    const novas: Foto[] = [];
    const disponiveis = 5 - fotos.length;

    if (disponiveis <= 0) {
      setMensagem("Limite de 5 fotos atingido.");
      return;
    }

    for (const arquivo of Array.from(arquivos).slice(0, disponiveis)) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(arquivo.type)) {
        setMensagem("Formato n?o permitido: " + arquivo.name);
        continue;
      }

      if (arquivo.size > 5 * 1024 * 1024) {
        setMensagem("Foto acima de 5 MB: " + arquivo.name);
        continue;
      }

      novas.push({
        id: Date.now() + Math.random(),
        nome: arquivo.name,
        url: URL.createObjectURL(arquivo),
      });
    }

    setFotos(anteriores => [...anteriores, ...novas]);
    if (novas.length) setMensagem(`${novas.length} foto(s) adicionada(s).`);
  }

  function remover(id: number) {
    setFotos(anteriores => {
      const foto = anteriores.find(f => f.id === id);
      if (foto) URL.revokeObjectURL(foto.url);
      return anteriores.filter(f => f.id !== id);
    });
  }

  function enviar() {
    if (!fotos.length) {
      setMensagem("Anexe pelo menos uma fotografia.");
      return;
    }
    if (descricao.trim().length < 10) {
      setMensagem("Informe uma descri??o com pelo menos 10 caracteres.");
      return;
    }
    setStatus("AGUARDANDO GESTOR");
    setMensagem("Simula??o: treinamento enviado ao gestor.");
  }

  const botao: React.CSSProperties = {
    background: "#F58220",
    color: "white",
    border: 0,
    borderRadius: 9,
    padding: "12px 18px",
    fontWeight: 700,
    cursor: "pointer",
  };

  const caixa: React.CSSProperties = {
    background: "white",
    padding: 22,
    borderRadius: 12,
    border: "1px solid #fed7aa",
    marginBottom: 16,
  };

  return (
    <main style={{
      background: "#FFF8EF",
      minHeight: "100vh",
      padding: 24,
      color: "#27374D",
      fontFamily: "Arial, sans-serif",
    }}>
      <div style={{ maxWidth: 950, margin: "auto" }}>
        <a href="/campanha/treinamentos">Voltar ao treinamento</a>

        <h1>Treinamento Sa?de e Conforto</h1>
        <p style={{ color: "#A35000", fontWeight: 700 }}>
          MODO DE TESTE LOCAL ? NENHUM DADO SER? GRAVADO
        </p>

        <section style={caixa}>
          <h2>1. Informa??es do treinamento</h2>
          <p>Cliente fict?cio: TESTE DE FUNCIONALIDADES</p>
          <textarea
            value={descricao}
            onChange={e => setDescricao(e.target.value)}
            placeholder="Descreva o treinamento realizado..."
            rows={4}
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: 12,
            }}
          />
        </section>

        <section style={caixa}>
          <h2>2. Fotografias do treinamento</h2>
          <p>{fotos.length}/5 fotografias ? m?ximo de 5 MB cada</p>

          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: "none" }}
            onChange={e => {
              adicionar(e.target.files);
              e.target.value = "";
            }}
          />

          <input
            ref={galeria}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            style={{ display: "none" }}
            onChange={e => {
              adicionar(e.target.files);
              e.target.value = "";
            }}
          />

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              type="button"
              style={botao}
              disabled={status !== "RASCUNHO"}
              onClick={() => camera.current?.click()}
            >
              Tirar foto
            </button>

            <button
              type="button"
              style={botao}
              disabled={status !== "RASCUNHO"}
              onClick={() => galeria.current?.click()}
            >
              Anexar foto
            </button>
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 14,
            marginTop: 18,
          }}>
            {fotos.map(foto => (
              <div key={foto.id} style={{
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: 8,
              }}>
                <img
                  src={foto.url}
                  alt={foto.nome}
                  style={{
                    width: "100%",
                    height: 145,
                    objectFit: "cover",
                    borderRadius: 8,
                  }}
                />
                <p style={{ fontSize: 12, overflowWrap: "anywhere" }}>
                  {foto.nome}
                </p>
                {status === "RASCUNHO" && (
                  <button type="button" onClick={() => remover(foto.id)}>
                    Excluir foto
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <section style={caixa}>
          <h2>3. Aprova??o e Marketing</h2>
          <p><strong>Status:</strong> {status}</p>

          {status === "RASCUNHO" && (
            <button style={botao} onClick={enviar}>
              Enviar para aprova??o
            </button>
          )}

          {status === "AGUARDANDO GESTOR" && (
            <button style={botao} onClick={() => {
              setStatus("AGUARDANDO MARKETING");
              setMensagem("Simula??o: gestor aprovou.");
            }}>
              Simular aprova??o do gestor
            </button>
          )}

          {status === "AGUARDANDO MARKETING" && (
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button style={botao} onClick={() => {
                setStatus("VALIDADO PELO MARKETING");
                setMensagem("Simula??o: cliente confirmou o treinamento.");
              }}>
                Cliente confirmou
              </button>
              <button style={botao} onClick={() => {
                setStatus("REPROVADO PELO MARKETING");
                setMensagem("Simula??o: cliente n?o confirmou.");
              }}>
                Cliente n?o confirmou
              </button>
            </div>
          )}

          <p role="status">{mensagem}</p>

          <button type="button" onClick={() => {
            fotos.forEach(f => URL.revokeObjectURL(f.url));
            setFotos([]);
            setStatus("RASCUNHO");
            setDescricao("");
            setMensagem("");
          }}>
            Reiniciar simula??o
          </button>
        </section>
      </div>
    </main>
  );
}
