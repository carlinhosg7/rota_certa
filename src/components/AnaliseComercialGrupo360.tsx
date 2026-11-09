import "server-only";
import ProdutosPotencialAbas from "@/components/ProdutosPotencialAbas";
import { buscarVendasClientes360 } from "@/lib/visao360-supabase";
import { calcularJanelaCompraFaturamento } from "@/lib/janela-compra-faturamento";
import { carregarCarteiraOficial360, cleanCode, cleanReferencia } from "@/lib/comercial-data";

type Venda360 = {
  codigo: string; numeroPedido: string; data: Date | null;
  dataEntrega?: Date | null; qtd: number; vlr: number;
  codigoLinha: string; linha: string; referencia: string;
};
type ClienteComparacao = {
  uf?: string;
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


  // MOTOR POR GRUPO V8
  // A comparacao exclui todas as empresas do grupo.
  // Utiliza apenas a carteira recebida da pagina,
  // que ja foi restringida por permissao comercial.

  const codigosGrupoV8 = new Set(
    clientesGrupo
      .map(c => cleanCode(String(c.codigoCliente ?? "")))
      .filter(Boolean)
  );

  const contarVinculosV8 = (
    campo: "representanteAtual" | "supervisores"
  ) => {
    const contagens = new Map<string, number>();

    for (const c of clientesGrupo) {
      for (const pessoa of c[campo] ?? []) {
        const id = norm(pessoa.codigo);
        if (!id) continue;
        contagens.set(
          id,
          (contagens.get(id) ?? 0) + 1
        );
      }
    }

    return [...contagens.entries()]
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  };

  const repV8 = contarVinculosV8("representanteAtual");
  const supV8 = contarVinculosV8("supervisores");

  const contagemUFV8 = new Map<string, number>();

  for (const c of clientesGrupo) {
    const uf = String(c.uf ?? "").trim().toUpperCase();
    if (!uf) continue;

    contagemUFV8.set(
      uf,
      (contagemUFV8.get(uf) ?? 0) + 1
    );
  }

  const ufV8 = [...contagemUFV8.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  const ativosV8 = clientesCarteira.filter(c => {
    const codigo = cleanCode(String(c.codigoCliente ?? ""));

    return (
      Boolean(codigo) &&
      !codigosGrupoV8.has(codigo) &&
      String(c.situacaoEmpresa ?? "").toUpperCase() !== "BAIXADA" &&
      (
        c.carteira === "01_ATIVA" ||
        c.situacao === "ATIVA"
      )
    );
  });

  const limiteV8 = 80;

  const universosV8 = [
    {
      id: "carteira",
      titulo: "Minha carteira",
      descricao:
        "Clientes ativos do representante " + (repV8 || "sem vinculo"),
      clientes: ativosV8.filter(c =>
        Boolean(repV8) &&
        (c.representanteAtual ?? []).some(r =>
          norm(r.codigo) === repV8
        )
      ).slice(0, limiteV8),
    },
    {
      id: "estado",
      titulo: "Meu estado",
      descricao:
        "Clientes ativos da UF " + (ufV8 || "nao informada"),
      clientes: ativosV8.filter(c =>
        Boolean(ufV8) &&
        String(c.uf ?? "").trim().toUpperCase() === ufV8
      ).slice(0, limiteV8),
    },
    {
      id: "regional",
      titulo: "Minha regional",
      descricao:
        "Clientes ativos da regional " + (supV8 || "sem vinculo"),
      clientes: ativosV8.filter(c =>
        Boolean(supV8) &&
        (c.supervisores ?? []).some(s =>
          norm(s.codigo) === supV8
        )
      ).slice(0, limiteV8),
    },
  ];

  const codigosAmostraV8 = [...new Set(
    universosV8.flatMap(u =>
      u.clientes.map(c =>
        cleanCode(String(c.codigoCliente ?? ""))
      )
    )
  )].filter(Boolean);

  // Uma consulta agrupada, sem buscar as mesmas
  // empresas novamente em cada aba.
  const vendasAmostraV8 =
    await buscarVendasClientes360(codigosAmostraV8);

  const { produtosAutorizados } =
    await carregarCarteiraOficial360();

  const linhasAutorizadasV8 = new Set(
    produtosAutorizados
      .map(p => norm(p.codigoLinha))
      .filter(Boolean)
  );

  const nomeLinhaV8 = new Map<string, string>();
  const referenciasAutorizadasV8 =
    new Map<string, Set<string>>();

  for (const p of produtosAutorizados) {
    const linha = norm(p.codigoLinha);
    const referencia = cleanReferencia(p.referencia);

    if (!linha) continue;

    if (!nomeLinhaV8.has(linha)) {
      nomeLinhaV8.set(
        linha,
        p.linha || ("Linha " + linha)
      );
    }

    if (referencia) {
      const refs = referenciasAutorizadasV8.get(linha)
        ?? new Set<string>();

      refs.add(referencia);
      referenciasAutorizadasV8.set(linha, refs);
    }
  }

  // Considera todo o historico do grupo.
  // Uma linha comprada por qualquer empresa do
  // grupo nao e uma oportunidade de introducao.
  const linhasCompradasGrupoV8 = new Set(
    vendas
      .filter(v => Number(v.qtd) > 0)
      .map(v => norm(v.codigoLinha))
      .filter(Boolean)
  );

  const medianaV8 = (valores: number[]) => {
    if (!valores.length) return 0;

    const lista = [...valores].sort((a, b) => a - b);
    const meio = Math.floor(lista.length / 2);

    return lista.length % 2
      ? lista[meio]
      : (lista[meio - 1] + lista[meio]) / 2;
  };

  const abasPotencialGrupoV8 = universosV8.map(universo => {
    type Agregado = {
      codigo: string;
      nome: string;
      compradores: Map<
        string,
        { pares: number; valor: number }
      >;
      referencias: Map<string, Set<string>>;
    };

    const linhas = new Map<string, Agregado>();

    for (const clienteAmostra of universo.clientes) {
      const id = cleanCode(
        String(clienteAmostra.codigoCliente ?? "")
      );

      const vendasClienteAmostra =
        vendasAmostraV8.get(id) ?? [];

      for (const v of vendasClienteAmostra) {
        if (Number(v.qtd) <= 0) continue;

        const linha = norm(v.codigoLinha);

        if (!linha || !linhasAutorizadasV8.has(linha)) {
          continue;
        }

        // PLAY e a unica excecao.
        if (
          linha !== "7" &&
          linhasCompradasGrupoV8.has(linha)
        ) continue;

        const item = linhas.get(linha) ?? {
          codigo: v.codigoLinha || linha,
          nome: nomeLinhaV8.get(linha) ||
            v.linha || ("Linha " + linha),
          compradores: new Map<
            string,
            { pares: number; valor: number }
          >(),
          referencias: new Map<string, Set<string>>(),
        };

        const acumulado = item.compradores.get(id) ?? {
          pares: 0,
          valor: 0,
        };

        acumulado.pares += Number(v.qtd) || 0;
        acumulado.valor += Number(v.vlr) || 0;

        item.compradores.set(id, acumulado);

        const ref = cleanReferencia(v.referencia);

        if (
          ref &&
          referenciasAutorizadasV8.get(linha)?.has(ref)
        ) {
          const compradoresRef = item.referencias.get(ref)
            ?? new Set<string>();

          compradoresRef.add(id);
          item.referencias.set(ref, compradoresRef);
        }

        linhas.set(linha, item);
      }
    }

    const produtos = [...linhas.entries()]
      .map(([linha, item]) => ({
        codigoLinha: item.codigo,
        linha: item.nome,
        play: linha === "7",
        jaCompra: linhasCompradasGrupoV8.has(linha),
        clientes: item.compradores.size,
        percentual: universo.clientes.length
          ? item.compradores.size /
            universo.clientes.length * 100
          : 0,
        medianaPares: medianaV8(
          [...item.compradores.values()].map(x => x.pares)
        ),
        medianaValor: medianaV8(
          [...item.compradores.values()].map(x => x.valor)
        ),
        referencias: [...item.referencias.entries()]
          .sort((a, b) => b[1].size - a[1].size)
          .slice(0, 5)
          .map(([ref]) => ref),
      }))
      .filter(p => p.clientes > 0)
      .sort((a, b) =>
        b.percentual - a.percentual ||
        b.clientes - a.clientes
      );

    const playEncontrada = produtos.find(p => p.play);

    const play = playEncontrada ?? {
      codigoLinha: "007",
      linha: nomeLinhaV8.get("7") ||
        "TENIS KIDY PLAY RESPITEC",
      play: true,
      jaCompra: linhasCompradasGrupoV8.has("7"),
      clientes: 0,
      percentual: 0,
      medianaPares: 0,
      medianaValor: 0,
      referencias: [] as string[],
    };

    return {
      id: universo.id,
      titulo: universo.titulo,
      descricao: universo.descricao,
      amostra: universo.clientes.length,
      produtos: [
        play,
        ...produtos.filter(p => !p.play)
      ].slice(0, 8),
    };
  });

  return (
    <ProdutosPotencialAbas
      abas={abasPotencialGrupoV8}
      numeroSecao="04"
    />
  );
}
