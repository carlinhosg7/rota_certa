"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./campanhas.module.css";

type Campanha = {
  id: string;
  titulo: string;
  categoria: "Clientes" | "Representantes" | "Apresentação";
  pagina: number;
  destaque: string;
  detalhes: string[];
};

// Fonte: CAMPANHAS ATIVAS – SP E SUL, NOVEMBRO 2026.
// As datas são as das artes originais; esta galeria não declara vigência atual.
const CAMPANHAS: Campanha[] = [
  { id: "capa", titulo: "Campanhas Ativas — SP e Sul • Novembro 2026", categoria: "Apresentação", pagina: 1, destaque: "Capa do material comercial Kidy — novembro de 2026.", detalhes: ["Região do material: São Paulo e Sul."] },
  { id: "carnaval", titulo: "Cápsula de Carnaval", categoria: "Clientes", pagina: 2, destaque: "1 máscara para ação na loja a cada par vendido das referências participantes.", detalhes: ["Pedido mínimo: 12 pares.", "Informar na observação do pedido a quantidade de máscaras.", "Aplicável às referências exibidas na peça original."] },
  { id: "arrancada", titulo: "Arrancada Kidy", categoria: "Clientes", pagina: 3, destaque: "Campanha de giro rápido: pedidos geram rifas conforme faixa de valor.", detalhes: ["R$ 5.000,00 a R$ 14.999,99: 1 rifa.", "R$ 15.000,00 a R$ 29.999,99: 2 rifas.", "R$ 30.000,00 a R$ 49.999,99: 3 rifas.", "Acima de R$ 50.000,00: 5 rifas.", "Cada rifa: 50 números e valor indicado de R$ 50,00.", "Encerramento informado: 11/12/2026."] },
  { id: "play30", titulo: "Play 30 Anos", categoria: "Clientes", pagina: 4, destaque: "Brindes em camisetas para compras da linha Play.", detalhes: ["24 pares de Play: 5 camisetas.", "36 pares de Play: 7 camisetas.", "Acima de 60 pares de Play: 10 camisetas."] },
  { id: "reconquista", titulo: "Reconquista", categoria: "Clientes", pagina: 5, destaque: "Condição especial para reativar clientes sem compra desde 30/04/2026.", detalhes: ["Benefício indicado no material: 5% de desconto OU 30 dias adicionais no prazo.", "Verificar elegibilidade e aplicação com a área comercial."] },
  { id: "black-capa", titulo: "Black Kidy — Lançamento", categoria: "Clientes", pagina: 6, destaque: "Peça de divulgação da ação Black Kidy com quantidades limitadas.", detalhes: ["Condições e datas detalhadas na página 7 do material."] },
  { id: "black-regras", titulo: "Black Kidy — Condições", categoria: "Clientes", pagina: 7, destaque: "Descontos de 15% e 20% para produtos Kidex selecionados.", detalhes: ["Inclusão dos pedidos: 30/10 a 14/11/2026.", "Faturamento: novembro e dezembro de 2026.", "Pagamento: 90 dias; tabela de preço líquida.", "Emissão das notas por São Paulo; comissão de 2%.", "Indicar BLACK KIDY na observação do pedido.", "Produtos elegíveis conforme relação comercial encaminhada pelo gerente."] },
  { id: "kidymais", titulo: "Kidy+ — Desconto de 8%", categoria: "Clientes", pagina: 8, destaque: "Desconto de 8% com condições comerciais específicas.", detalhes: ["Pedidos com entrada até 20/11/2026.", "Faturamento para outubro, novembro e dezembro de 2026 por São Paulo.", "Não permite E2.", "Não acumula com campanhas de prazo ou reconquista.", "Pedidos com desconto de parceria devem passar por análise.", "Condições de pagamento informadas no iPad."] },
  { id: "veloz", titulo: "K360 Novo Veloz — Incentivo", categoria: "Representantes", pagina: 9, destaque: "Incentivo comercial sobre as vendas do Novo Veloz.", detalhes: ["Período indicado: 23/10 a 21/11/2026.", "Comissão anunciada na campanha: 6% com markup 2,2, ante 5% na condição atual.", "Confirmação informada na arte: até 30/10.", "Consultar a peça oficial para a condição completa."] },
  { id: "amostra-anuncio", titulo: "Conquiste sua Amostra — Apresentação", categoria: "Representantes", pagina: 10, destaque: "Campanha de pontos por metas individuais — não é ranking.", detalhes: ["Período: 09/11/2026 a 30/04/2027, seis meses.", "Meta total anunciada: 1.200 pontos.", "Possibilidade anunciada de economia de até R$ 6.000 em amostras, conforme regras da campanha."] },
  { id: "amostra-regras", titulo: "Conquiste sua Amostra — Regras", categoria: "Representantes", pagina: 11, destaque: "Cinco metas mensais, totalizando até 200 pontos por mês.", detalhes: ["Entrada: 60 pontos (30%).", "Faturamento: 60 pontos (30%).", "Treinamentos: 30 pontos (15%).", "Reativação: 30 pontos (15%).", "Kidex: 20 pontos (10%).", "Premiação final conforme faixas de pontos indicadas na arte.", "A pontuação do app só é oficial após apuração e homologação."] },
  { id: "kidex-bolso", titulo: "Kidex — Dinheiro no Bolso", categoria: "Representantes", pagina: 12, destaque: "Premiação mensal para os cinco representantes com maior desempenho acima da meta Kidex.", detalhes: ["Período: setembro, outubro, novembro e dezembro de 2026.", "Apuração mensal.", "1º lugar: R$ 1.000,00.", "2º ao 5º lugares: R$ 600,00 mensais cada.", "Resultados e elegibilidade dependem de apuração oficial."] },
  { id: "encerramento", titulo: "Kidy — Cuidando de Cada Passo", categoria: "Apresentação", pagina: 13, destaque: "Encerramento do material comercial de novembro de 2026.", detalhes: [] },
];

const CATEGORIAS = ["Todas", "Clientes", "Representantes"] as const;

const CAMPANHAS_TRANSFERIDAS = new Set([
  "amostra-anuncio",
  "amostra-regras",
  "kidex-bolso"
]);
const arte = (pagina: number) => `/campanhas/artes/campanha-${String(pagina).padStart(2, "0")}.webp`;

export default function CampanhasClient({
  modo = "clientes"
}: {
  modo?: "clientes" | "representantes";
}) {
  const [pesquisa, setPesquisa] = useState("");
  const [categoria, setCategoria] = useState<string>("Todas");
  const [selecionada, setSelecionada] = useState<Campanha | null>(null);
  const [documentoDisponivel, setDocumentoDisponivel] = useState(false);

  useEffect(() => {
    fetch("/campanhas/CAMPANHAS.pdf", { method: "HEAD" })
      .then(r => setDocumentoDisponivel(r.ok))
      .catch(() => setDocumentoDisponivel(false));
  }, []);

  useEffect(() => {
    if (!selecionada) return;
    const fechar = (e: KeyboardEvent) => { if (e.key === "Escape") setSelecionada(null); };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [selecionada]);

  const filtradas = useMemo(() => CAMPANHAS.filter(c => {
    const transferida = CAMPANHAS_TRANSFERIDAS.has(c.id);

    if (modo === "representantes" && !transferida) return false;
    if (modo === "clientes" && transferida) return false;
    const busca = `${c.titulo} ${c.destaque} ${c.detalhes.join(" ")}`.toLocaleLowerCase("pt-BR");
    return (modo === "representantes" || categoria === "Todas" || categoria === c.categoria) &&
      busca.includes(pesquisa.toLocaleLowerCase("pt-BR"));
  }), [pesquisa, categoria, modo]);

  const cards = filtradas.filter(c => c.pagina > 1 && c.pagina < 13);

  return (
    <section className={styles.area}>
      <div className={styles.apresentacao}>
        <div className={styles.apresentacaoTexto}>
          <span className={styles.selo}>KIDY • SP E SUL</span>
          <h2>{modo === "representantes" ? "Campanhas dos Representantes" : "Campanhas de novembro de 2026."}</h2>
          <p>Consulte as artes oficiais, as condições comerciais e os benefícios de cada campanha.</p>
          <div className={styles.metadados}>
            <span>NOVEMBRO 2026</span><span>{modo === "representantes" ? "3 ARTES DOS REPRESENTANTES" : "8 PEÇAS NA GALERIA"}</span><span>13 PÁGINAS</span>
          </div>
          {documentoDisponivel && <a className={styles.pdfLink} href="/campanhas/CAMPANHAS.pdf" target="_blank" rel="noreferrer">Abrir PDF original ↗</a>}
          <p className={styles.ressalva}>As datas e condições são as do material fornecido. Campanhas com prazo encerrado permanecem aqui para consulta histórica; confirme a vigência antes de ofertar benefícios.</p>
        </div>
        <button type="button" className={styles.capa} onClick={() => setSelecionada(CAMPANHAS[0])} aria-label="Ampliar capa do material de novembro de 2026">
          <img src={arte(1)} alt="Capa Campanhas Ativas SP e Sul — Novembro 2026" />
          <span>VER CAPA EM TELA CHEIA ↗</span>
        </button>
      </div>

      <div className={styles.filtros}>
        <div><span className={styles.rotulo}>MATERIAL OFICIAL • NOVEMBRO 2026</span><h3>Galeria de campanhas</h3></div>
        <div className={styles.controles}>
          <input aria-label="Buscar campanha" placeholder="Buscar campanha, linha ou benefício..." value={pesquisa} onChange={e => setPesquisa(e.target.value)} />
          {modo === "clientes" && (
            <select
              aria-label="Filtrar público"
              value={categoria}
              onChange={e => setCategoria(e.target.value)}
            >
              {CATEGORIAS.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className={styles.grade}>
        {cards.map(c => (
          <article id={c.id} className={styles.item} key={c.id}>
            <button className={styles.arte} type="button" onClick={() => setSelecionada(c)} aria-label={`Ampliar arte: ${c.titulo}`}>
              <img src={arte(c.pagina)} loading="lazy" alt={`Arte oficial: ${c.titulo}`} />
              <span className={styles.ampliar}>⤢ Ampliar campanha</span>
            </button>
            <div className={styles.info}>
              <div className={styles.topInfo}><span className={styles.categoria}>{c.categoria}</span><span className={styles.pagina}>PÁGINA {String(c.pagina).padStart(2, "0")}</span></div>
              <h4>{c.titulo}</h4>
              <p>{c.destaque}</p>
              <button className={styles.detalhes} type="button" onClick={() => setSelecionada(c)}>Ver arte e condições <span>↗</span></button>
            </div>
          </article>
        ))}
      </div>
      {cards.length === 0 && <div className={styles.vazio}>Nenhuma campanha encontrada para este filtro.</div>}

      {selecionada && (
        <div className={styles.fundoModal} role="presentation" onMouseDown={() => setSelecionada(null)}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label={`Campanha ${selecionada.titulo}`} onMouseDown={e => e.stopPropagation()}>
            <div className={styles.modalTopo}>
              <div><span className={styles.selo}>CAMPANHA • PÁGINA {selecionada.pagina}</span><h3>{selecionada.titulo}</h3></div>
              <button type="button" onClick={() => setSelecionada(null)} aria-label="Fechar campanha">✕</button>
            </div>
            <div className={styles.imagemMaior}><img src={arte(selecionada.pagina)} alt={`Arte oficial ${selecionada.titulo}`} /></div>
            {selecionada.detalhes.length > 0 && (
              <div className={styles.regras}><strong>CONDIÇÕES DO MATERIAL</strong>
                <ul>{selecionada.detalhes.map((d, i) => <li key={i}>{d}</li>)}</ul>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
