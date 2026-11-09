"use client";

import { useState } from "react";

type Produto = {
  codigoLinha: string;
  linha: string;
  play: boolean;
  jaCompra: boolean;
  clientes: number;
  percentual: number;
  medianaPares: number;
  medianaValor: number;
  referencias: string[];
};

type Aba = {
  id: string;
  titulo: string;
  descricao: string;
  amostra: number;
  produtos: Produto[];
};

const numero = (n: number) =>
  n.toLocaleString("pt-BR", {
    maximumFractionDigits: 0,
  });

const moeda = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const titulos: Record<string, string> = {
  carteira: "Minha carteira",
  estado: "Meu estado",
  regional: "Minha regional",
};

function nivel(percentual: number) {
  if (percentual >= 60) return "ALTO";
  if (percentual >= 35) return "MEDIO";
  return "BAIXO";
}

function CartaoProduto({
  produto,
  amostra,
}: {
  produto: Produto;
  amostra: number;
}) {
  const nivelProduto = nivel(produto.percentual);

  return (
    <article
      className={
        "pm7-card " +
        (produto.play ? "pm7-play" : "")
      }
    >
      <div className="pm7-card-header">
        <div className="pm7-card-title">
          <h4>{produto.linha}</h4>

          {produto.play && (
            <strong className="pm7-play-label">
              {"★ PLAY — PRIORIDADE KIDY"}
            </strong>
          )}

          <span className="pm7-code">
            {"C\u00f3d. "}{produto.codigoLinha}
          </span>
        </div>

        <span
          className={
            "pm7-badge " +
            (nivelProduto === "ALTO"
              ? "pm7-alto"
              : nivelProduto === "MEDIO"
              ? "pm7-medio"
              : "pm7-baixo")
          }
        >
          {nivelProduto === "MEDIO"
            ? "M\u00c9DIO"
            : nivelProduto}
        </span>
      </div>

      <div className="pm7-percent">
        {produto.clientes
          ? `${produto.percentual.toFixed(0)}%`
          : "?"}
      </div>

      <p className="pm7-explanation">
        {produto.play && produto.jaCompra
          ? "PLAY j\u00e1 comprada: avaliar reposi\u00e7\u00e3o e amplia\u00e7\u00e3o do mix."
          : produto.play
          ? "PLAY priorit\u00e1ria na abordagem comercial."
          : `${produto.clientes} de ${amostra} clientes da amostra compram esta linha.`}
      </p>

      <div className="pm7-metrics">
        <div>
          <span>Clientes</span>
          <strong>{numero(produto.clientes)}</strong>
        </div>

        <div>
          <span>Mediana pares</span>
          <strong>{numero(produto.medianaPares)}</strong>
        </div>

        <div>
          <span>Mediana valor</span>
          <strong>{moeda(produto.medianaValor)}</strong>
        </div>
      </div>

      <div className="pm7-references">
        <span>
          {"Refer\u00eancias autorizadas com venda no hist\u00f3rico:"}
        </span>
        <strong>
          {produto.referencias.length
            ? produto.referencias.join(" • ")
            : "Nenhuma refer\u00eancia encontrada na amostra."}
        </strong>
      </div>
    </article>
  );
}

export default function ProdutosPotencialAbas({
  abas,
  numeroSecao = "03",
}: {
  abas: Aba[];
  numeroSecao?: string;
}) {
  const [selecionada, setSelecionada] =
    useState("carteira");

  const aba =
    abas.find(a => a.id === selecionada) ??
    abas[0];

  if (!aba) return null;

  const produtos = [
    ...aba.produtos.filter(p => p.play),
    ...aba.produtos.filter(p => !p.play),
  ];

  return (
    <section className="pm7-section">
      <div className="pm7-heading">
        <div className="pm7-heading-left">
          <span className="pm7-number">{numeroSecao}</span>
          <h2>Produtos com potencial</h2>
        </div>

        <span className="pm7-count">
          {produtos.filter(p => !p.play).length}
          {" oportunidades"}
        </span>
      </div>

      <div
        className="pm7-tabs"
        role="tablist"
        aria-label="Universo de comparacao"
      >
        {abas.map((a, i) => (
          <button
            type="button"
            role="tab"
            aria-selected={selecionada === a.id}
            key={a.id}
            className={
              "pm7-tab " +
              (selecionada === a.id
                ? "pm7-tab-selected"
                : "")
            }
            onClick={() => setSelecionada(a.id)}
          >
            {String(i + 1).padStart(2, "0")}
            {" — "}
            {titulos[a.id] || a.titulo}
          </button>
        ))}
      </div>

      <div className="pm7-context">
        <div>
          <strong>{aba.titulo}</strong>
          <span>{aba.descricao}</span>
        </div>

        <div className="pm7-sample">
          <strong>{numero(aba.amostra)}</strong>
          <span>clientes na amostra</span>
        </div>
      </div>

      {aba.amostra === 0 && (
        <p className="pm7-warning">
          {"Nenhum cliente de compara\u00e7\u00e3o localizado neste universo. A PLAY permanece como prioridade, mas sem evid\u00eancia de vendas na amostra."}
        </p>
      )}

      <div className="pm7-grid">
        {produtos.map(p => (
          <CartaoProduto
            key={`${aba.id}-${p.codigoLinha}`}
            produto={p}
            amostra={aba.amostra}
          />
        ))}
      </div>

      <p className="pm7-footer">
        {"Percentuais calculados sobre os clientes da amostra. As medianas consideram compradores identificados. Oportunidades baseadas em vendas hist\u00f3ricas, n\u00e3o em probabilidade estat\u00edstica de compra."}
      </p>

      <style>{`
        .pm7-section {
          background: #fffdf9;
          border: 1px solid #f0c88f;
          border-radius: 17px;
          padding: 20px;
          margin-bottom: 20px;
          color: #33220e;
          box-sizing: border-box;
        }

        .pm7-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }

        .pm7-heading-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .pm7-number {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #ff9a18;
          font-weight: 900;
          font-size: 11px;
        }

        .pm7-heading h2 {
          font-size: 18px;
          margin: 0;
          font-weight: 900;
        }

        .pm7-count {
          color: #995f28;
          font-size: 11px;
          font-weight: 800;
        }

        .pm7-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 12px;
        }

        .pm7-tab {
          background: #fff9f1;
          border: 1px solid #efc18b;
          border-radius: 9px;
          color: #5a350f;
          font-size: 12px;
          font-weight: 800;
          padding: 10px 15px;
          cursor: pointer;
        }

        .pm7-tab-selected {
          background: #f28b00;
          color: #fff;
          border-color: #f28b00;
        }

        .pm7-context {
          background: #fff5e8;
          border-radius: 9px;
          padding: 11px 13px;
          margin-bottom: 15px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .pm7-context > div:first-child {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .pm7-context strong {
          font-size: 12px;
        }

        .pm7-context span {
          font-size: 11px;
          color: #81562c;
        }

        .pm7-sample {
          display: flex;
          flex-direction: column;
          text-align: right;
          flex-shrink: 0;
          gap: 3px;
        }

        .pm7-sample strong {
          font-size: 19px;
          color: #cf6a00;
        }

        .pm7-grid {
          display: grid;
          grid-template-columns:
            repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .pm7-card {
          border: 1px solid #efbb7d;
          border-radius: 13px;
          background: #fffdfb;
          padding: 14px;
          box-sizing: border-box;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }

        .pm7-play {
          border-color: #ef9d36;
          background: #fffaf2;
        }

        .pm7-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
          min-height: 64px;
        }

        .pm7-card-title {
          min-width: 0;
        }

        .pm7-card h4 {
          font-size: 12px;
          line-height: 1.3;
          font-weight: 900;
          margin: 0 0 5px;
          text-transform: uppercase;
          overflow-wrap: anywhere;
        }

        .pm7-play-label {
          font-size: 10px;
          color: #bd6900;
          display: block;
          margin: 4px 0;
        }

        .pm7-code {
          color: #9a6e45;
          font-size: 10px;
          display: block;
        }

        .pm7-badge {
          font-size: 9px;
          padding: 5px 7px;
          border-radius: 15px;
          font-weight: 900;
          flex-shrink: 0;
        }

        .pm7-alto {
          background: #def5e8;
          color: #087b54;
        }

        .pm7-medio {
          background: #fff0bf;
          color: #9b6a00;
        }

        .pm7-baixo {
          background: #ffe8e1;
          color: #aa432b;
        }

        .pm7-percent {
          color: #ed7900;
          font-size: 28px;
          font-weight: 900;
          margin-top: 7px;
        }

        .pm7-explanation {
          font-size: 10px;
          line-height: 1.4;
          color: #8a5b2f;
          margin: 2px 0 13px;
          min-height: 28px;
        }

        .pm7-metrics {
          display: grid;
          grid-template-columns:
            repeat(3, minmax(0, 1fr));
          gap: 6px;
          margin-bottom: 14px;
        }

        .pm7-metrics > div {
          min-width: 0;
        }

        .pm7-metrics span {
          display: block;
          color: #79522d;
          font-size: 10px;
          margin-bottom: 4px;
          line-height: 1.3;
        }

        .pm7-metrics strong {
          display: block;
          color: #37210a;
          font-size: 11px;
          overflow-wrap: anywhere;
          line-height: 1.35;
        }

        .pm7-references {
          border-top: 1px solid #efd4b2;
          padding-top: 10px;
          margin-top: auto;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .pm7-references span {
          font-size: 10px;
          color: #98663b;
          line-height: 1.4;
        }

        .pm7-references strong {
          font-size: 10px;
          color: #704019;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }

        .pm7-warning {
          background: #fff3e4;
          border: 1px solid #efd0a4;
          padding: 12px;
          border-radius: 9px;
          font-size: 11px;
          margin: 0 0 15px;
        }

        .pm7-footer {
          color: #8b6747;
          font-size: 10px;
          line-height: 1.5;
          margin: 15px 0 0;
        }

        @media (max-width: 1150px) {
          .pm7-grid {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 650px) {
          .pm7-section {
            padding: 13px;
          }

          .pm7-grid {
            grid-template-columns: 1fr;
          }

          .pm7-heading {
            align-items: flex-start;
            flex-direction: column;
          }

          .pm7-context {
            align-items: flex-start;
            flex-direction: column;
          }

          .pm7-sample {
            text-align: left;
          }

          .pm7-tab {
            flex: 1 1 100%;
          }
        }
      `}</style>
    </section>
  );
}
