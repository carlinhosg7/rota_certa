"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./campanhas.module.css";

type Campanha = {
  id: string;
  titulo: string;
  categoria: "Clientes" | "Representantes" | "Relacionamento" | "Apresentação";
  pagina: number;
  destaque: string;
  detalhes: string[];
};

const CAMPANHAS: Campanha[] = [
  {id:"capa",titulo:"Campanhas Kidy • Setembro 2026",categoria:"Apresentação",pagina:1,destaque:"Material comercial oficial apresentado em setembro de 2026.",detalhes:["A vigência de cada ação deve ser confirmada com a área comercial."]},
  {id:"rebecca-exposicao",titulo:"Rebecca Bonbon + Kidy • Exposição",categoria:"Clientes",pagina:2,destaque:"36 pares para receber a testeira de exposição Rebecca Bonbon.",detalhes:["Solicitar o benefício na observação do pedido.","Conferir o mix da linha no pedido."]},
  {id:"rebecca-representante",titulo:"Rebecca Bonbon • Incentivo Comercial",categoria:"Representantes",pagina:3,destaque:"Campanha de incentivo ao representante da linha Rebecca Bonbon.",detalhes:["Período apresentado na peça: 07/08 a 04/09.","Premiação total anunciada superior a R$ 7.000,00.","Elegibilidade depende de apuração comercial oficial."]},
  {id:"kidex",titulo:"Kidex • Dinheiro no Bolso",categoria:"Representantes",pagina:4,destaque:"Premiação mensal por desempenho sobre a meta Kidex.",detalhes:["Meses apresentados: setembro, outubro, novembro e dezembro.","1º lugar: R$ 1.000,00; do 2º ao 5º: R$ 600,00 por representante.","Não exibir ranking sem metas e realizado homologados."]},
  {id:"combo-ativacao",titulo:"Brincaflex • Combo Ativação",categoria:"Clientes",pagina:5,destaque:"24 pares de sandálias + 24 pares de tênis Brincaflex.",detalhes:["Benefício: rifa com os vendedores, com prêmio de um fone de ouvido.","A execução e entrega dependem de validação comercial."]},
  {id:"combo-reposicao",titulo:"Brincaflex • Combo Reposição",categoria:"Clientes",pagina:6,destaque:"24 pares de sandálias + 12 pares de tênis Brincaflex.",detalhes:["Benefício: 10 sacolas Bag Kidy.","Validar a composição elegível do pedido."]},
  {id:"natal-vitrines",titulo:"Natal Kidy com Luzes • Vitrines",categoria:"Relacionamento",pagina:7,destaque:"Ação de vitrines de Natal por regional.",detalhes:["Clientes selecionados por regional.","Reconhecimento das melhores vitrines participantes.","Avaliação e participação não são automatizadas pelo PDF."]},
  {id:"natal-bags",titulo:"Natal Kidy com Luzes • 48 pares = 10 bags",categoria:"Clientes",pagina:8,destaque:"A cada 48 pares da linha Luzes, 10 bags personalizadas Kidy.",detalhes:["A mecânica é acumulativa segundo o material.","Validar a linha Luzes e a quantidade do pedido."]},
  {id:"natal-camiseta",titulo:"Natal Kidy com Luzes • Camiseta LED",categoria:"Relacionamento",pagina:9,destaque:"Camisetas LED para representantes estratégicos e clientes selecionados.",detalhes:["A peça não apresenta meta numérica universal.","Entrega depende de seleção comercial."]},
  {id:"reconquista",titulo:"Natal Kidy com Luzes • Reconquista 2.0",categoria:"Clientes",pagina:10,destaque:"Reconquistar clientes que não compraram a coleção Primavera/Verão.",detalhes:["Último pedido até 30/04/2026.","Pedido deve conter ao menos uma linha de Luzes.","Exige validação do histórico de compras."]},
  {id:"rifa",titulo:"Rifa Balconista Campeão",categoria:"Clientes",pagina:11,destaque:"Rifa de 100 números para compras acima de R$ 10.000,00.",detalhes:["Solicitar participação expressamente na observação do pedido.","Enviar foto da cartela integralmente preenchida e identificação dos ganhadores.","Dois prêmios de R$ 50,00; depósito em até 7 dias úteis após validação."]},
  {id:"abertura",titulo:"Kit Abertura de Loja",categoria:"Relacionamento",pagina:12,destaque:"Materiais de inauguração e vale-compras de R$ 150,00.",detalhes:["Itens apresentados: 2 pirulitos, 2 piruliteiras, 2 bexigas e 1 Kit K.","Inclui 1 par de calçado com desconto em duplicata."]},
  {id:"impulso",titulo:"Campanha Impulso 2",categoria:"Clientes",pagina:13,destaque:"Compras da referência X360: 60 pares = 4 camisetas; 84 pares = 6 camisetas.",detalhes:["Pedido com mínimo de 12 pares de Impulso, conforme a peça.","Informar quantidades e tamanhos das camisetas na observação do pedido.","Preço indicado na peça: R$ 15,00 por camiseta, em condição simulada."]},
  {id:"encerramento",titulo:"Kidy • Cuidando de Cada Passo",categoria:"Apresentação",pagina:14,destaque:"Encerramento do material oficial de campanhas.",detalhes:[]}
];

const CATEGORIAS = ["Todas", "Clientes", "Representantes", "Relacionamento"] as const;

export default function CampanhasClient() {
  const [pesquisa, setPesquisa] = useState("");
  const [categoria, setCategoria] = useState<string>("Todas");
  const [selecionada, setSelecionada] = useState<Campanha | null>(null);
  const [documentoDisponivel, setDocumentoDisponivel] = useState(false);

  useEffect(() => {
    fetch("/campanhas/CAMPANHAS.pdf", {method:"HEAD"}).then(r => setDocumentoDisponivel(r.ok)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selecionada) return;
    const sair = (e: KeyboardEvent) => { if (e.key === "Escape") setSelecionada(null); };
    window.addEventListener("keydown", sair);
    return () => window.removeEventListener("keydown", sair);
  }, [selecionada]);

  const filtradas = useMemo(() => CAMPANHAS.filter(c => {
    const busca = `${c.titulo} ${c.destaque} ${c.detalhes.join(" ")}`.toLocaleLowerCase("pt-BR");
    return (categoria === "Todas" || categoria === c.categoria) && busca.includes(pesquisa.toLocaleLowerCase("pt-BR"));
  }), [pesquisa,categoria]);

  return (
    <section className={styles.area}>
      <div className={styles.apresentacao}>
        <div className={styles.apresentacaoTexto}>
          <span className={styles.selo}>KIDY • MATERIAL COMERCIAL</span>
          <h2>Campanhas que ganham vida.</h2>
          <p>Explore as peças originais, as condições e os benefícios de cada ação — com a identidade visual do material Kidy.</p>
          <div className={styles.metadados}><span>SETEMBRO 2026</span><span>14 páginas do PDF</span><span>Artes originais</span></div>
          {documentoDisponivel && <a className={styles.pdfLink} href="/campanhas/CAMPANHAS.pdf" target="_blank" rel="noreferrer">Abrir PDF completo ↗</a>}
          <p className={styles.ressalva}>Material de setembro de 2026. Vigência e elegibilidade devem ser confirmadas; os cartões não representam apuração automática de vendas.</p>
        </div>
        <button type="button" className={styles.capa} onClick={() => setSelecionada(CAMPANHAS[0])} aria-label="Ampliar capa do material de campanhas">
          <img src="/campanhas/artes/campanha-01.webp" alt="Capa original Campanhas Ativas Setembro 2026" />
          <span>VER CAPA EM TELA CHEIA ↗</span>
        </button>
      </div>

      <div className={styles.filtros}>
        <div><span className={styles.rotulo}>ENCONTRE UMA CAMPANHA</span><h3>Galeria de campanhas</h3></div>
        <div className={styles.controles}>
          <input aria-label="Buscar campanha" placeholder="Buscar linha, prêmio ou campanha..." value={pesquisa} onChange={e => setPesquisa(e.target.value)} />
          <select aria-label="Filtrar público" value={categoria} onChange={e => setCategoria(e.target.value)}>{CATEGORIAS.map(c=><option key={c}>{c}</option>)}</select>
        </div>
      </div>

      <div className={styles.grade}>
        {filtradas.filter(c => c.pagina !== 1 && c.pagina !== 14).map(c => (
          <article className={styles.item} key={c.id}>
            <button className={styles.arte} type="button" onClick={() => setSelecionada(c)} aria-label={`Ampliar arte: ${c.titulo}`}>
              <img src={`/campanhas/artes/campanha-${String(c.pagina).padStart(2,"0")}.webp`} loading="lazy" alt={`Arte original do PDF: ${c.titulo}`} />
              <span className={styles.ampliar}>⤢ Ampliar campanha</span>
            </button>
            <div className={styles.info}>
              <div className={styles.topInfo}><span className={styles.categoria}>{c.categoria}</span><span className={styles.pagina}>PÁGINA {String(c.pagina).padStart(2,"0")}</span></div>
              <h4>{c.titulo}</h4>
              <p>{c.destaque}</p>
              <button className={styles.detalhes} type="button" onClick={() => setSelecionada(c)}>Ver arte e condições <span>↗</span></button>
            </div>
          </article>
        ))}
      </div>
      {filtradas.filter(c=>c.pagina!==1&&c.pagina!==14).length===0 && <div className={styles.vazio}>Nenhuma campanha encontrada para este filtro.</div>}

      {selecionada && <div className={styles.fundoModal} role="presentation" onMouseDown={() => setSelecionada(null)}>
        <div className={styles.modal} role="dialog" aria-modal="true" aria-label={`Campanha ${selecionada.titulo}`} onMouseDown={e=>e.stopPropagation()}>
          <div className={styles.modalTopo}><div><span className={styles.selo}>CAMPANHA • PÁGINA {selecionada.pagina}</span><h3>{selecionada.titulo}</h3></div><button type="button" onClick={()=>setSelecionada(null)} aria-label="Fechar campanha">✕</button></div>
          <div className={styles.imagemMaior}><img src={`/campanhas/artes/campanha-${String(selecionada.pagina).padStart(2,"0")}.webp`} alt={`Arte original ${selecionada.titulo}`} /></div>
          {selecionada.detalhes.length>0 && <div className={styles.regras}><strong>CONDIÇÕES E OBSERVAÇÕES</strong><ul>{selecionada.detalhes.map((detalhe,i)=><li key={i}>{detalhe}</li>)}</ul></div>}
        </div>
      </div>}
    </section>
  );
}
