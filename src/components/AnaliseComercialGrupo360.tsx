import "server-only";
import { buscarVendasClientes360 } from "@/lib/visao360-supabase";
import { calcularJanelaCompraFaturamento } from "@/lib/janela-compra-faturamento";
import { carregarCarteiraOficial360, cleanCode, cleanReferencia } from "@/lib/comercial-data";

type Venda360 = {
  codigo: string; numeroPedido: string; data: Date | null;
  dataEntrega?: Date | null; qtd: number; vlr: number;
  codigoLinha: string; linha: string; referencia: string;
};
type ClienteComparacao = {
  codigoCliente?: string | number; situacao?: string; carteira?: string;
  situacaoEmpresa?: string; representanteAtual?: { codigo: string }[];
  supervisores?: { codigo: string }[];
};
type Props = {
  vendas: Venda360[];
  clientesGrupo: ClienteComparacao[];
  clientesCarteira: ClienteComparacao[];
  mostrar: "historico" | "analise" | "potencial";
};
const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const n = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v || 0);
const dinheiro = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
const norm = (x: unknown) => String(x ?? "").trim().replace(/^0+(?=\d)/, "");
const dataOK = (d?: Date | null): d is Date => d instanceof Date && !Number.isNaN(d.getTime());
const painel: React.CSSProperties = { background: "#fffdf9", border: "1px solid #f0c88f", borderRadius: 18, padding: 22, marginBottom: 18 };
const cartao: React.CSSProperties = { background: "#fff6e9", borderRadius: 12, padding: 14, minWidth: 0 };
const th: React.CSSProperties = { padding: 10, textAlign: "right", background: "#fff1db" };
const td: React.CSSProperties = { padding: 10, textAlign: "right", borderBottom: "1px solid #f0e0cd" };
const titulo = (num: string, nome: string) => <h2 style={{ display: "flex", gap: 12, alignItems: "center", margin: "0 0 20px", fontSize: 18 }}><span style={{ background: "#ffa32c", borderRadius: "50%", padding: 9, fontSize: 12 }}>{num}</span>{nome}</h2>;

export default async function AnaliseComercialGrupo360({ vendas, clientesGrupo, clientesCarteira, mostrar }: Props) {
  // Soma das entradas por data do pedido e faturamento por data de entrega;
  // o mesmo critério do Cliente 360 individual, sem misturar pares com valores.
  const janela = await calcularJanelaCompraFaturamento("__GRUPO__", []);
  const serie = janela.meses.map(x => ({ ...x }));
  for (const v of vendas) {
    const qtd = Number(v.qtd);
    if (!Number.isFinite(qtd)) continue;
    if (dataOK(v.data)) serie[v.data.getMonth()].entradas += qtd;
    if (dataOK(v.dataEntrega)) serie[v.dataEntrega.getMonth()].faturamentos += qtd;
  }
  const maximo = Math.max(1, ...serie.flatMap(m => [m.entradas, m.faturamentos]));
  const paresHistoricos = vendas.reduce((s, v) => s + (Number(v.qtd) || 0), 0);
  const valorHistorico = vendas.reduce((s, v) => s + (Number(v.vlr) || 0), 0);
  const ano = new Date().getFullYear();
  const vendasAno = vendas.filter(v => dataOK(v.data) && v.data.getFullYear() === ano);
  const paresAno = vendasAno.reduce((s, v) => s + (Number(v.qtd) || 0), 0);
  const valorAno = vendasAno.reduce((s, v) => s + (Number(v.vlr) || 0), 0);

  if (mostrar === "historico") return <section style={painel}>
    {titulo("03", "Histórico comercial")}
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 18 }}>
      <h3 style={{ margin: "0 0 8px" }}>Janela de Compra × Faturamento</h3>
      <p style={{ fontSize: 12, color: "#64748b" }}>Pares por mês, consolidados para todas as empresas do grupo: entrada pela data do pedido e faturamento pela data de entrega. Todos os anos disponíveis.</p>
      <div style={{ display: "flex", gap: 18, fontSize: 12, margin: "15px 0" }}><span style={{ color: "#2563eb" }}>■ Entrada de pares</span><span style={{ color: "#16a34a" }}>■ Faturamento</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(12,minmax(42px,1fr))", gap: 8, overflowX: "auto", paddingBottom: 12 }}>
        {serie.map(m => <div key={m.mes} style={{ textAlign: "center", minWidth: 42 }}><div style={{ height: 130, display: "flex", justifyContent: "center", alignItems: "flex-end", gap: 4 }}><div title={`Entradas: ${n(m.entradas)} pares`} style={{ width: 16, height: `${m.entradas > 0 ? Math.max(2, m.entradas / maximo * 100) : 0}%`, background: "#2563eb", borderRadius: "4px 4px 0 0" }}/><div title={`Faturamento: ${n(m.faturamentos)} pares`} style={{ width: 16, height: `${m.faturamentos > 0 ? Math.max(2, m.faturamentos / maximo * 100) : 0}%`, background: "#16a34a", borderRadius: "4px 4px 0 0" }}/></div><span style={{ fontSize: 11 }}>{m.mes}</span></div>)}
      </div>
      <p style={{ fontSize: 11, color: "#64748b" }}>{n(serie.reduce((s,m)=>s+m.entradas,0))} pares de entrada. O faturamento é apresentado somente quando há data de entrega registrada.</p>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginTop: 12 }}>
      {[{ t: "PARES NO ANO", v: n(paresAno) }, { t: "VALOR NO ANO", v: dinheiro(valorAno) }, { t: "PARES HISTÓRICO", v: n(paresHistoricos) }, { t: "VALOR HISTÓRICO", v: dinheiro(valorHistorico) }].map(c => <div key={c.t} style={cartao}><div style={{ fontSize: 11, fontWeight: 700, color: "#a45d12" }}>{c.t}</div><strong style={{ fontSize: 20 }}>{c.v}</strong></div>)}
    </div>
  </section>;

  if (mostrar === "analise") {
    const maiorEntrada = [...serie].filter(m => m.entradas > 0).sort((a,b)=>b.entradas-a.entradas)[0];
    const maiorFaturamento = [...serie].filter(m => m.faturamentos > 0).sort((a,b)=>b.faturamentos-a.faturamentos)[0];
    return <section style={painel}>
      <h2 style={{ fontSize: 18, margin: "0 0 18px" }}>Análise Escrita — Entrada × Faturamento</h2>
      <p style={{ fontSize: 12 }}>A tabela apresenta pares de entrada e faturamento por mês, considerando os anos disponíveis para o grupo.</p>
      <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}><thead><tr><th style={{...th,textAlign:"left"}}>Mês</th><th style={th}>Entrada</th><th style={th}>Faturamento</th></tr></thead><tbody>
        {serie.map(m => <tr key={m.mes}><td style={{...td,textAlign:"left"}}>{m.mes}</td><td style={td}>{n(m.entradas)}</td><td style={td}>{n(m.faturamentos)}</td></tr>)}
        <tr style={{ fontWeight: 800, background: "#fff7ed" }}><td style={{...td,textAlign:"left"}}>TOTAL</td><td style={td}>{n(serie.reduce((s,m)=>s+m.entradas,0))}</td><td style={td}>{n(serie.reduce((s,m)=>s+m.faturamentos,0))}</td></tr>
      </tbody></table></div>
      <p style={{ fontSize: 12, marginTop: 14 }}><strong>Maior volume de entrada:</strong> {maiorEntrada ? `${maiorEntrada.mes} (${n(maiorEntrada.entradas)} pares)` : "Sem registros"}. <strong>Maior volume de faturamento:</strong> {maiorFaturamento ? `${maiorFaturamento.mes} (${n(maiorFaturamento.faturamentos)} pares)` : "Sem registros"}.</p>
      <p style={{ fontSize: 11, color: "#64748b" }}>Somatório mensal de pares, não de valores financeiros. Uma entrada pode ser faturada em outro mês.</p>
    </section>;
  }

  // Amostra regional: apenas clientes ATIVOS que não pertencem ao grupo.
  // Usa primeiro o representante predominante; caso a amostra seja pequena, a regional.
  const grupoCodigos = new Set(clientesGrupo.map(c => cleanCode(String(c.codigoCliente ?? ""))));
  const contagem = (campo: "representanteAtual" | "supervisores") => {
    const mapa = new Map<string, number>();
    for (const c of clientesGrupo) for (const r of c[campo] || []) mapa.set(String(r.codigo), (mapa.get(String(r.codigo)) || 0) + 1);
    return [...mapa].sort((a,b)=>b[1]-a[1])[0]?.[0];
  };
  const rep = contagem("representanteAtual");
  const sup = contagem("supervisores");
  const elegivel = (c: ClienteComparacao) =>
    !grupoCodigos.has(cleanCode(String(c.codigoCliente ?? ""))) &&
    String(c.situacaoEmpresa ?? "").toUpperCase() !== "BAIXADA" &&
    (c.situacao === "ATIVA" || c.carteira === "01_ATIVA");
  const ativos = clientesCarteira.filter(elegivel);
  const porRep = rep ? ativos.filter(c => c.representanteAtual?.some(r => String(r.codigo) === rep)) : [];
  const porRegional = sup ? ativos.filter(c => c.supervisores?.some(r => String(r.codigo) === sup)) : [];
  const candidatos = (porRep.length >= 10 ? porRep : porRegional).slice(0, 40);
  const grupoAmostra = porRep.length >= 10 ? "representante" : "regional";
  const codigos = candidatos.map(c => cleanCode(String(c.codigoCliente ?? ""))).filter(Boolean);
  const vendasComparacao = codigos.length ? await buscarVendasClientes360(codigos) : new Map<string, Venda360[]>();

  // Só apresentar referências constantes da base oficial autorizada.
  const { produtosAutorizados } = await carregarCarteiraOficial360();
  const linhasAutorizadas = new Set(produtosAutorizados.map(p=>norm(p.codigoLinha)));
  const refsPorLinha = new Map<string, Set<string>>();
  for (const p of produtosAutorizados) {
    const linha = norm(p.codigoLinha); const ref = cleanReferencia(p.referencia);
    if (!linha || !ref) continue;
    if (!refsPorLinha.has(linha)) refsPorLinha.set(linha,new Set());
    refsPorLinha.get(linha)?.add(ref);
  }
  const linhasDoGrupo = new Set(vendas.map(v=>norm(v.codigoLinha)).filter(Boolean));
  const amostra = new Map<string, { nome: string; clientes: Set<string>; pares: number[]; valores: number[]; refs: Set<string> }>();
  for (const [codigo, lista] of vendasComparacao) {
    const porLinha = new Map<string, {nome:string;pares:number;valor:number;refs:Set<string>}>();
    for(const v of lista) {
      const chave = norm(v.codigoLinha);
      if (!chave || !linhasAutorizadas.has(chave) || (linhasDoGrupo.has(chave) && chave !== "7")) continue;
      const item = porLinha.get(chave) || {nome: String(v.linha || `Linha ${chave}`),pares:0,valor:0,refs:new Set<string>()};
      item.pares += Number(v.qtd)||0; item.valor += Number(v.vlr)||0;
      const ref = cleanReferencia(v.referencia);
      if(ref && refsPorLinha.get(chave)?.has(ref)) item.refs.add(ref);
      porLinha.set(chave,item);
    }
    for (const [chave,item] of porLinha) {
      const x = amostra.get(chave) || {nome:item.nome,clientes:new Set<string>(),pares:[],valores:[],refs:new Set<string>()};
      x.clientes.add(codigo); x.pares.push(item.pares); x.valores.push(item.valor);
      for (const ref of item.refs) x.refs.add(ref);
      amostra.set(chave,x);
    }
  }
  const mediana = (vals:number[]) => {const xs=[...vals].sort((a,b)=>a-b);const m=Math.floor(xs.length/2);return xs.length ? xs.length%2 ? xs[m] : (xs[m-1]+xs[m])/2 : 0;};
  const lista = [...amostra].map(([codigo,x]) => ({
    codigo, ...x,
    percentual: codigos.length ? x.clientes.size / codigos.length * 100 : 0,
    medianaPares:mediana(x.pares), medianaValor:mediana(x.valores)
  })).filter(x => x.clientes.size>=2 || x.codigo==="7")
    .sort((a,b)=>Number(b.codigo==="7")-Number(a.codigo==="7") || b.percentual-a.percentual).slice(0,8);
  // PLAY deve aparecer mesmo se não houver histórico na amostra. Nunca inventar percentuais.
  if (linhasAutorizadas.has("7") && !lista.some(x=>x.codigo==="7")) {
    lista.unshift({codigo:"7",nome:"KIDY PLAY",clientes:new Set<string>(),pares:[],valores:[],refs:new Set<string>(),percentual:0,medianaPares:0,medianaValor:0});
    if(lista.length>8)lista.pop();
  }
  return <section style={painel}>
    {titulo("04", "Produtos com potencial")}
    <p style={{ background: "#fff6e9", padding: 12, borderRadius: 8, fontSize: 12 }}>Comparação com {codigos.length} clientes ativos da carteira do {grupoAmostra}, fora do grupo analisado. Percentuais são penetração da linha na amostra, não probabilidade de compra.</p>
    {lista.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(235px,1fr))", gap: 12 }}>
      {lista.map(p => {
        const nivel = p.clientes.size === 0 ? "SEM AMOSTRA" : p.percentual >= 70 ? "ALTO" : p.percentual >= 45 ? "MÉDIO" : "BAIXO";
        return <article key={p.codigo} style={{ background:"#fff", border:"1px solid #f0c88f", borderRadius:12, padding:15 }}>
          <div style={{ display:"flex", justifyContent:"space-between", gap:10 }}><div><strong style={{ fontSize:12 }}>{p.nome}</strong>{p.codigo==="7" && <div style={{ fontSize:11, color:"#b45309", fontWeight:800 }}>★ PLAY — PRIORIDADE KIDY</div>}<div style={{ fontSize:11 }}>Cód. {p.codigo}</div></div><span style={{ fontSize:10, fontWeight:800, color:p.percentual>=70?"#15803d":"#b45309" }}>{nivel}</span></div>
          <div style={{ color:"#e87900", fontSize:27, fontWeight:800, marginTop:13 }}>{p.clientes.size ? `${p.percentual.toFixed(0)}%` : "—"}</div>
          <div style={{ fontSize:11, color:"#986c3f" }}>{p.clientes.size ? "dos clientes da amostra compram esta linha" : "Sem histórico suficiente para calcular"}</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginTop:16, fontSize:11 }}><div>Clientes<strong style={{display:"block"}}>{p.clientes.size}</strong></div><div>Mediana pares<strong style={{display:"block"}}>{n(p.medianaPares)}</strong></div><div>Mediana valor<strong style={{display:"block"}}>{dinheiro(p.medianaValor)}</strong></div></div>
          <div style={{ borderTop:"1px solid #f0c88f", marginTop:16, paddingTop:10, fontSize:11 }}><span style={{ color:"#986c3f" }}>Referências autorizadas com venda na amostra:</span><strong style={{ display:"block", overflowWrap:"anywhere" }}>{[...p.refs].slice(0,5).join(" • ") || "Nenhuma referência autorizada identificada"}</strong></div>
        </article>;
      })}
    </div> : <p>Não foram encontradas linhas com evidência suficiente na amostra regional.</p>}
  </section>;
}
