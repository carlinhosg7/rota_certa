import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { validarToken } from "@/lib/auth";
import {
  getData,
  cleanCode,
  MAPA_SUPERVISORES,
} from "@/lib/comercial-data";

type Props = {
  params: Promise<{
    codigo: string;
  }>;
};

function moeda(valor: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor || 0);
}

function numero(valor: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(valor || 0);
}

function dataBR(data: Date | null) {
  if (!data) return "Sem compra";

  return new Intl.DateTimeFormat("pt-BR").format(data);
}

export default async function ClientePage({ params }: Props) {
  const { codigo } = await params;

  // ============================================================
  // AUTENTICAÇÃO
  // ============================================================

  const cookieStore = await cookies();
  const token = cookieStore.get("kidy_session")?.value;

  if (!token) {
    redirect("/");
  }

  const usuario = await validarToken(token);

  if (!usuario) {
    redirect("/");
  }

  // ============================================================
  // DADOS
  // ============================================================

  const { carteira, vendas } = await getData();

  const codigoLimpo = cleanCode(codigo);

  const cliente = carteira.find(
    (c) => cleanCode(c.codigo) === codigoLimpo
  );

  if (!cliente) {
    return (
      <main style={styles.erroPage}>
        <div style={styles.erroCard}>
          <div style={styles.eyebrow}>CLIENTE NÃO ENCONTRADO</div>

          <h1 style={styles.erroTitulo}>
            Cliente {codigoLimpo}
          </h1>

          <p>
            Não localizei esse cliente na carteira comercial.
          </p>

          <Link href="/dashboard" style={styles.voltar}>
            ← Voltar para Rota Campeã
          </Link>
        </div>
      </main>
    );
  }

  // ============================================================
  // HISTÓRICO DO CLIENTE
  // ============================================================

  const vendasCliente = vendas
    .filter((v) => cleanCode(v.codigo) === codigoLimpo)
    .filter((v) => v.data)
    .sort(
      (a, b) =>
        (b.data?.getTime() || 0) -
        (a.data?.getTime() || 0)
    );

  const hoje = new Date();

  const inicioAno = new Date(
    hoje.getFullYear(),
    0,
    1
  );

  const ultimaCompra =
    vendasCliente.length > 0
      ? vendasCliente[0].data
      : null;

  const diasSemCompra = ultimaCompra
    ? Math.max(
        0,
        Math.floor(
          (hoje.getTime() - ultimaCompra.getTime()) /
            86400000
        )
      )
    : null;

  const vendasAno = vendasCliente.filter(
    (v) =>
      v.data &&
      v.data >= inicioAno &&
      v.data <= hoje
  );

  const paresAno = vendasAno.reduce(
    (total, v) => total + (v.qtd || 0),
    0
  );

  const valorAno = vendasAno.reduce(
    (total, v) => total + (v.vlr || 0),
    0
  );

  const paresHistorico = vendasCliente.reduce(
    (total, v) => total + (v.qtd || 0),
    0
  );

  const valorHistorico = vendasCliente.reduce(
    (total, v) => total + (v.vlr || 0),
    0
  );

  const regional =
    MAPA_SUPERVISORES[cliente.sup] ||
    cliente.sup ||
    "Não informada";

  // ============================================================
  // MIX DE PRODUTOS / OPORTUNIDADES
  // ============================================================

  const mixMap = new Map<string, {
    chave: string; codigoLinha: string; linha: string; pares: number;
    valor: number; pedidos: Set<string>; ultimaCompra: Date | null;
  }>();

  for (const v of vendasCliente) {
    const codigoLinha = v.codigoLinha || "";
    const linha = v.linha || (codigoLinha ? `Linha ${codigoLinha}` : "Linha não informada");
    const chave = codigoLinha || linha;
    const atual = mixMap.get(chave) || {
      chave, codigoLinha, linha, pares: 0, valor: 0,
      pedidos: new Set<string>(), ultimaCompra: null,
    };
    atual.pares += v.qtd || 0;
    atual.valor += v.vlr || 0;
    if (v.numeroPedido) atual.pedidos.add(v.numeroPedido);
    if (v.data && (!atual.ultimaCompra || v.data > atual.ultimaCompra)) atual.ultimaCompra = v.data;
    mixMap.set(chave, atual);
  }

  const mixLinhas = [...mixMap.values()].map((m) => ({
    ...m,
    diasSemCompra: m.ultimaCompra
      ? Math.max(0, Math.floor((hoje.getTime() - m.ultimaCompra.getTime()) / 86400000))
      : null,
  })).sort((a, b) => b.valor - a.valor);

  const maxValorLinha = Math.max(1, ...mixLinhas.map((m) => m.valor));
  const maxParesLinha = Math.max(1, ...mixLinhas.map((m) => m.pares));
  const maxPedidosLinha = Math.max(1, ...mixLinhas.map((m) => m.pedidos.size));
  const maxDiasLinha = Math.max(1, ...mixLinhas.map((m) => Math.min(m.diasSemCompra ?? 0, 365)));

  const oportunidades = mixLinhas.map((m) => {
    const recencia = Math.min(m.diasSemCompra ?? 0, 365) / maxDiasLinha;
    const frequencia = m.pedidos.size / maxPedidosLinha;
    const volume = m.pares / maxParesLinha;
    const valor = m.valor / maxValorLinha;
    const score = Math.round((recencia * .35 + frequencia * .25 + volume * .20 + valor * .20) * 100);
    const potencial = score >= 70 ? "ALTO" : score < 40 ? "BAIXO" : "MÉDIO";
    const motivos: string[] = [];
    if ((m.diasSemCompra ?? 0) >= 90) motivos.push(`${numero(m.diasSemCompra ?? 0)} dias sem recompra`);
    if (m.pedidos.size >= 3) motivos.push(`${numero(m.pedidos.size)} pedidos no histórico`);
    if (m.pares >= maxParesLinha * .6) motivos.push("alto volume histórico");
    if (m.valor >= maxValorLinha * .6) motivos.push("linha relevante em faturamento");
    if (!motivos.length) motivos.push("histórico de compra identificado");
    return { ...m, score, potencial, motivo: motivos.slice(0, 2).join(" • ") };
  }).sort((a, b) => b.score - a.score).slice(0, 8);

  const refMap = new Map<string, {
    referencia: string; codigoLinha: string; linha: string; pares: number;
    valor: number; ultimaCompra: Date | null;
  }>();

  for (const v of vendasCliente) {
    if (!v.referencia) continue;
    const chave = `${v.referencia}|${v.codigoLinha || v.linha || ""}`;
    const atual = refMap.get(chave) || {
      referencia: v.referencia, codigoLinha: v.codigoLinha || "",
      linha: v.linha || (v.codigoLinha ? `Linha ${v.codigoLinha}` : "—"),
      pares: 0, valor: 0, ultimaCompra: null,
    };
    atual.pares += v.qtd || 0;
    atual.valor += v.vlr || 0;
    if (v.data && (!atual.ultimaCompra || v.data > atual.ultimaCompra)) atual.ultimaCompra = v.data;
    refMap.set(chave, atual);
  }

  const referencias = [...refMap.values()]
    .sort((a, b) => b.pares - a.pares || b.valor - a.valor)
    .slice(0, 12);


  // ============================================================
  // CLIENTES SEMELHANTES / PRODUTOS COM POTENCIAL
  // ============================================================

  const linhasCliente = new Set(
    vendasCliente
      .map((v) => v.codigoLinha || v.linha)
      .filter(Boolean)
  );

  const perfilCliente = {
    rep: cliente.rep,
    sup: cliente.sup,
    valorHistorico,
    paresHistorico,
    pedidos: new Set(vendasCliente.map((v) => v.numeroPedido).filter(Boolean)).size,
    mix: linhasCliente.size,
  };

  const carteiraPorCodigo = new Map(carteira.map((c) => [cleanCode(c.codigo), c]));
  const vendasPorCliente = new Map<string, typeof vendas>();

  for (const v of vendas) {
    const cod = cleanCode(v.codigo);
    if (!cod || cod === codigoLimpo) continue;
    const arr = vendasPorCliente.get(cod) || [];
    arr.push(v);
    vendasPorCliente.set(cod, arr);
  }

  function proximidadeLog(a: number, b: number) {
    if (a <= 0 && b <= 0) return 1;
    if (a <= 0 || b <= 0) return 0;
    const dif = Math.abs(Math.log1p(a) - Math.log1p(b));
    return Math.max(0, 1 - dif / 4);
  }

  const candidatosSemelhantes = [...vendasPorCliente.entries()]
    .map(([cod, vs]) => {
      const cad = carteiraPorCodigo.get(cod);
      if (!cad || !vs.length) return null;

      const valor = vs.reduce((s, v) => s + (v.vlr || 0), 0);
      const pares = vs.reduce((s, v) => s + (v.qtd || 0), 0);
      const pedidos = new Set(vs.map((v) => v.numeroPedido).filter(Boolean)).size;
      const mix = new Set(vs.map((v) => v.codigoLinha || v.linha).filter(Boolean)).size;

      const mesmaRegional = cad.sup && cliente.sup && cad.sup === cliente.sup ? 1 : 0;
      const mesmoRep = cad.rep && cliente.rep && cad.rep === cliente.rep ? 1 : 0;

      const scoreSimilaridade =
        proximidadeLog(valor, perfilCliente.valorHistorico) * 0.30 +
        proximidadeLog(pares, perfilCliente.paresHistorico) * 0.25 +
        proximidadeLog(pedidos, perfilCliente.pedidos) * 0.20 +
        proximidadeLog(mix, perfilCliente.mix) * 0.15 +
        mesmaRegional * 0.08 +
        mesmoRep * 0.02;

      return { codigo: cod, vendas: vs, scoreSimilaridade };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.scoreSimilaridade - a.scoreSimilaridade)
    .slice(0, 40);

  const similares = candidatosSemelhantes.filter((x) => x.scoreSimilaridade >= 0.45);
  const grupoSimilar = similares.length >= 10 ? similares : candidatosSemelhantes.slice(0, 20);

  type PotencialLinha = {
    chave: string;
    codigoLinha: string;
    linha: string;
    clientes: Set<string>;
    pares: number[];
    valores: number[];
    referencias: Map<string, { referencia: string; pares: number; clientes: Set<string> }>;
  };

  const potencialMap = new Map<string, PotencialLinha>();

  for (const s of grupoSimilar) {
    const porLinhaCliente = new Map<string, { codigoLinha: string; linha: string; pares: number; valor: number }>();

    for (const v of s.vendas) {
      const codigoLinha = v.codigoLinha || "";
      const linha = v.linha || (codigoLinha ? `Linha ${codigoLinha}` : "");
      const chave = codigoLinha || linha;
      if (!chave || linhasCliente.has(chave)) continue;

      const atual = porLinhaCliente.get(chave) || { codigoLinha, linha, pares: 0, valor: 0 };
      atual.pares += v.qtd || 0;
      atual.valor += v.vlr || 0;
      porLinhaCliente.set(chave, atual);

      if (v.referencia) {
        const p = potencialMap.get(chave) || {
          chave, codigoLinha, linha, clientes: new Set<string>(),
          pares: [], valores: [], referencias: new Map(),
        };
        const rr = p.referencias.get(v.referencia) || {
          referencia: v.referencia, pares: 0, clientes: new Set<string>(),
        };
        rr.pares += v.qtd || 0;
        rr.clientes.add(s.codigo);
        p.referencias.set(v.referencia, rr);
        potencialMap.set(chave, p);
      }
    }

    for (const [chave, l] of porLinhaCliente) {
      const p = potencialMap.get(chave) || {
        chave,
        codigoLinha: l.codigoLinha,
        linha: l.linha,
        clientes: new Set<string>(),
        pares: [],
        valores: [],
        referencias: new Map(),
      };
      p.clientes.add(s.codigo);
      p.pares.push(l.pares);
      p.valores.push(l.valor);
      potencialMap.set(chave, p);
    }
  }

  function mediana(vals: number[]) {
    if (!vals.length) return 0;
    const a = [...vals].sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  const produtosPotenciais = [...potencialMap.values()]
    .map((p) => {
      const penetracao = grupoSimilar.length
        ? (p.clientes.size / grupoSimilar.length) * 100
        : 0;
      const paresMedianos = mediana(p.pares);
      const valorMediano = mediana(p.valores);
      const refs = [...p.referencias.values()]
        .sort((a, b) => b.clientes.size - a.clientes.size || b.pares - a.pares)
        .slice(0, 3);

      const score = Math.round(
        Math.min(100, penetracao * 0.70 + Math.min(30, p.clientes.size * 1.5))
      );

      return {
        ...p,
        penetracao,
        paresMedianos,
        valorMediano,
        refs,
        score,
        potencial: score >= 70 ? "ALTO" : score >= 45 ? "MÉDIO" : "BAIXO",
      };
    })
    .filter((p) => p.clientes.size >= 2)
    .sort((a, b) => b.score - a.score || b.penetracao - a.penetracao)
    .slice(0, 8);

  const principalPotencial = produtosPotenciais[0] || null;


  // ============================================================
  // PLANO DA VISITA
  // ============================================================

  const linhasPrioritarias = produtosPotenciais.slice(0, 3);

  const referenciasPrioritarias = linhasPrioritarias
    .flatMap((p) =>
      p.refs.map((r) => ({
        linha: p.linha,
        referencia: r.referencia,
        clientes: r.clientes.size,
        pares: r.pares,
      }))
    )
    .sort((a, b) => b.clientes - a.clientes || b.pares - a.pares)
    .slice(0, 5);

  const quantidadeSugerida = principalPotencial
    ? Math.max(1, Math.round(principalPotencial.paresMedianos))
    : 0;

  const alertaFinanceiro =
    cliente.bloqueio && cliente.bloqueio.toUpperCase().includes("BLOQUE")
      ? "Cliente com bloqueio financeiro. Validar liberação antes de negociar condição/pedido."
      : cliente.limite > 0
      ? `Limite disponível informado: ${moeda(cliente.limite)}.`
      : "Limite disponível não identificado. Confirmar condição financeira antes do fechamento.";

  const argumentoPrincipal = principalPotencial
    ? `${principalPotencial.linha} aparece em ${principalPotencial.penetracao.toFixed(0)}% dos clientes semelhantes e ainda não faz parte do histórico deste cliente. Use a linha como abertura para ampliar o mix.`
    : "Use as linhas com maior score do histórico e as referências mais recorrentes como abertura da visita.";

  const objetivoVisita = principalPotencial
    ? `Introduzir ${principalPotencial.linha} e ampliar o mix do cliente.`
    : "Reativar o mix de maior relevância histórica e identificar oportunidade de recompra.";

  // ============================================================
  // STATUS COMERCIAL
  // ============================================================

  let status = "ATIVO";
  let statusIcone = "●";
  let statusCor = "#11875d";
  let statusFundo = "#e7f7f0";

  if (!ultimaCompra) {
    status = "SEM HISTÓRICO";
    statusIcone = "●";
    statusCor = "#6f6f6f";
    statusFundo = "#eeeeee";
  } else if (
    ultimaCompra.getFullYear() < hoje.getFullYear()
  ) {
    status = "NÃO POSITIVADO NO ANO";
    statusIcone = "●";
    statusCor = "#e51f3f";
    statusFundo = "#ffe8ec";
  } else if (
    ultimaCompra <
    new Date(hoje.getFullYear(), 4, 1)
  ) {
    status = "SEM COMPRA DESDE MAIO";
    statusIcone = "●";
    statusCor = "#b88600";
    statusFundo = "#fff4ce";
  }

  // ============================================================
  // TELA
  // ============================================================

  return (
    <main style={styles.page}>
      <div style={styles.container}>

        {/* VOLTAR */}

        <Link
          href="/dashboard"
          style={styles.voltar}
        >
          ← Voltar para Rota Campeã
        </Link>

        {/* CABEÇALHO */}

        <section style={styles.hero}>
          <div>
            <div style={styles.eyebrow}>
              INTELIGÊNCIA COMERCIAL
            </div>

            <h1 style={styles.titulo}>
              {cliente.codigo} — {cliente.razao}
            </h1>

            <div style={styles.localizacao}>
              {cliente.cidade} / {cliente.uf}
            </div>
          </div>

          <div
            style={{
              ...styles.status,
              color: statusCor,
              background: statusFundo,
            }}
          >
            <span>{statusIcone}</span>
            {status}
          </div>
        </section>

        {/* IDENTIFICAÇÃO */}

        <section style={styles.bloco}>
          <div style={styles.blocoTitulo}>
            <span style={styles.numeroSecao}>
              01
            </span>

            Identificação comercial
          </div>

          <div style={styles.infoGrid}>

            <Info
              titulo="Código"
              valor={cliente.codigo}
            />

            <Info
              titulo="Representante"
              valor={cliente.rep || "—"}
            />

            <Info
              titulo="Regional"
              valor={regional}
            />

            <Info
              titulo="Cidade / UF"
              valor={`${cliente.cidade} / ${cliente.uf}`}
            />

          </div>
        </section>

        {/* CARDS */}

        <section style={styles.cards}>

          <Card
            titulo="ÚLTIMA COMPRA"
            valor={dataBR(ultimaCompra)}
            detalhe={
              diasSemCompra !== null
                ? `${numero(
                    diasSemCompra
                  )} dias sem compra`
                : "Sem histórico"
            }
          />

          <Card
            titulo="LIMITE DISPONÍVEL"
            valor={moeda(cliente.limite)}
            detalhe="Limite financeiro"
          />

          <Card
            titulo="SITUAÇÃO FINANCEIRA"
            valor={
              cliente.bloqueio ||
              "Não informado"
            }
            detalhe="Status financeiro atual"
          />

          <Card
            titulo="COMPRAS NO ANO"
            valor={numero(paresAno)}
            detalhe={`${moeda(
              valorAno
            )} em vendas`}
          />

        </section>

        {/* HISTÓRICO */}

        <section style={styles.bloco}>

          <div style={styles.blocoTitulo}>
            <span style={styles.numeroSecao}>
              02
            </span>

            Histórico comercial
          </div>

          <div style={styles.historicoGrid}>

            <Indicador
              titulo="Pares no ano"
              valor={numero(paresAno)}
            />

            <Indicador
              titulo="Valor no ano"
              valor={moeda(valorAno)}
            />

            <Indicador
              titulo="Pares histórico"
              valor={numero(paresHistorico)}
            />

            <Indicador
              titulo="Valor histórico"
              valor={moeda(valorHistorico)}
            />

          </div>

        </section>

        {/* MIX DE PRODUTOS */}
        <section style={styles.bloco}>
          <div style={styles.blocoTitulo}><span style={styles.numeroSecao}>03</span>Mix de produtos</div>
          {mixLinhas.length ? (
            <div style={styles.tableWrap}><table style={styles.tabela}>
              <thead><tr>
                <th style={styles.th}>Linha</th><th style={styles.thRight}>Pares</th>
                <th style={styles.thRight}>Valor</th><th style={styles.thRight}>Pedidos</th>
                <th style={styles.thRight}>Última compra</th><th style={styles.thRight}>Dias sem compra</th>
              </tr></thead>
              <tbody>{mixLinhas.slice(0,12).map((m) => (
                <tr key={m.chave}>
                  <td style={styles.td}><div style={styles.linhaNome}>{m.linha}</div>{m.codigoLinha && <div style={styles.linhaCodigo}>Cód. {m.codigoLinha}</div>}</td>
                  <td style={styles.tdRight}>{numero(m.pares)}</td><td style={styles.tdRight}>{moeda(m.valor)}</td>
                  <td style={styles.tdRight}>{numero(m.pedidos.size)}</td><td style={styles.tdRight}>{dataBR(m.ultimaCompra)}</td>
                  <td style={styles.tdRight}>{m.diasSemCompra === null ? "—" : numero(m.diasSemCompra)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <div style={styles.vazio}>Sem mix de produtos disponível para este cliente.</div>}
        </section>

        {/* OPORTUNIDADES */}
        <section style={styles.bloco}>
          <div style={styles.blocoTitulo}><span style={styles.numeroSecao}>04</span>Oportunidades comerciais</div>
          <div style={styles.oportunidadesGrid}>
            {oportunidades.map((o) => (
              <div key={o.chave} style={styles.oportunidadeCard}>
                <div style={styles.oportunidadeTopo}>
                  <div><div style={styles.oportunidadeLinha}>{o.linha}</div>{o.codigoLinha && <div style={styles.linhaCodigo}>Cód. {o.codigoLinha}</div>}</div>
                  <div style={{...styles.badge, ...(o.potencial === "ALTO" ? styles.badgeAlto : o.potencial === "BAIXO" ? styles.badgeBaixo : styles.badgeMedio)}}>{o.potencial}</div>
                </div>
                <div style={styles.scoreLinha}><strong>{o.score}</strong><span>/100 score comercial</span></div>
                <div style={styles.barra}><div style={{...styles.barraPreenchida, width: `${o.score}%`}} /></div>
                <div style={styles.oportunidadeMotivo}>{o.motivo}</div>
              </div>
            ))}
          </div>
          <div style={styles.metodologia}>Score baseado no histórico do próprio cliente: recência 35%, frequência 25%, volume 20% e valor 20%. É um indicador comercial explicável, não uma probabilidade estatística de compra.</div>
        </section>

        {/* REFERÊNCIAS */}
        <section style={styles.bloco}>
          <div style={styles.blocoTitulo}><span style={styles.numeroSecao}>05</span>Referências para trabalhar</div>
          {referencias.length ? (
            <div style={styles.tableWrap}><table style={styles.tabela}>
              <thead><tr><th style={styles.th}>Referência</th><th style={styles.th}>Linha</th><th style={styles.thRight}>Pares históricos</th><th style={styles.thRight}>Valor histórico</th><th style={styles.thRight}>Última compra</th></tr></thead>
              <tbody>{referencias.map((r) => (
                <tr key={`${r.referencia}-${r.codigoLinha}`}>
                  <td style={styles.td}><strong>{r.referencia}</strong></td><td style={styles.td}>{r.linha}</td>
                  <td style={styles.tdRight}>{numero(r.pares)}</td><td style={styles.tdRight}>{moeda(r.valor)}</td><td style={styles.tdRight}>{dataBR(r.ultimaCompra)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : <div style={styles.vazio}>Sem referências disponíveis para este cliente.</div>}
        </section>

        {/* PRODUTOS COM POTENCIAL */}
        <section style={styles.bloco}>
          <div style={styles.blocoTitulo}>
            <span style={styles.numeroSecao}>06</span>
            Produtos com potencial
          </div>

          <div style={styles.similarResumo}>
            Comparação com <strong>{grupoSimilar.length}</strong> clientes de perfil semelhante,
            considerando porte histórico, volume, frequência, amplitude de mix e proximidade comercial.
          </div>

          {produtosPotenciais.length ? (
            <div style={styles.potenciaisGrid}>
              {produtosPotenciais.map((p) => (
                <div key={p.chave} style={styles.potencialCard}>
                  <div style={styles.oportunidadeTopo}>
                    <div>
                      <div style={styles.oportunidadeLinha}>{p.linha}</div>
                      {p.codigoLinha && <div style={styles.linhaCodigo}>Cód. {p.codigoLinha}</div>}
                    </div>
                    <div style={{
                      ...styles.badge,
                      ...(p.potencial === "ALTO"
                        ? styles.badgeAlto
                        : p.potencial === "BAIXO"
                        ? styles.badgeBaixo
                        : styles.badgeMedio)
                    }}>
                      {p.potencial}
                    </div>
                  </div>

                  <div style={styles.penetracaoNumero}>{p.penetracao.toFixed(0)}%</div>
                  <div style={styles.penetracaoLegenda}>
                    dos clientes semelhantes compram esta linha
                  </div>

                  <div style={styles.potencialMetricas}>
                    <div>
                      <span>Clientes</span>
                      <strong>{p.clientes.size}</strong>
                    </div>
                    <div>
                      <span>Mediana pares</span>
                      <strong>{numero(p.paresMedianos)}</strong>
                    </div>
                    <div>
                      <span>Mediana valor</span>
                      <strong>{moeda(p.valorMediano)}</strong>
                    </div>
                  </div>

                  {p.refs.length > 0 && (
                    <div style={styles.refsPotenciais}>
                      <span>Referências mais presentes:</span>
                      <strong>{p.refs.map((r) => r.referencia).join(" • ")}</strong>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={styles.vazio}>
              Não encontrei linhas novas com evidência suficiente entre os clientes semelhantes.
            </div>
          )}

          <div style={styles.metodologia}>
            Esta recomendação é baseada em similaridade histórica e penetração de mix.
            Não representa uma probabilidade estatística de compra.
          </div>
        </section>

        {/* PLANO DA VISITA */}
        <section style={styles.bloco}>
          <div style={styles.blocoTitulo}>
            <span style={styles.numeroSecao}>07</span>
            Plano da visita
          </div>

          <div style={styles.planoHero}>
            <div>
              <div style={styles.planoLabel}>OBJETIVO PRINCIPAL</div>
              <div style={styles.planoObjetivo}>{objetivoVisita}</div>
            </div>
            {quantidadeSugerida > 0 && (
              <div style={styles.quantidadeBox}>
                <span>Referência inicial</span>
                <strong>{numero(quantidadeSugerida)} pares</strong>
                <small>mediana observada no grupo semelhante</small>
              </div>
            )}
          </div>

          <div style={styles.planoGrid}>
            <div style={styles.planoCard}>
              <div style={styles.planoCardTitulo}>1. O que oferecer</div>
              {linhasPrioritarias.length ? (
                linhasPrioritarias.map((p, i) => (
                  <div key={p.chave} style={styles.planoItem}>
                    <span style={styles.planoOrdem}>{i + 1}</span>
                    <div>
                      <strong>{p.linha}</strong>
                      <small>
                        {p.penetracao.toFixed(0)}% de penetração entre semelhantes
                      </small>
                    </div>
                  </div>
                ))
              ) : (
                <div style={styles.planoTexto}>Trabalhar as linhas de maior score histórico.</div>
              )}
            </div>

            <div style={styles.planoCard}>
              <div style={styles.planoCardTitulo}>2. Referências prioritárias</div>
              {referenciasPrioritarias.length ? (
                referenciasPrioritarias.map((r) => (
                  <div key={`${r.linha}-${r.referencia}`} style={styles.refVisita}>
                    <strong>{r.referencia}</strong>
                    <span>{r.linha}</span>
                  </div>
                ))
              ) : (
                <div style={styles.planoTexto}>
                  Usar as referências de maior histórico exibidas na seção 05.
                </div>
              )}
            </div>

            <div style={styles.planoCard}>
              <div style={styles.planoCardTitulo}>3. Argumento comercial</div>
              <div style={styles.planoTexto}>{argumentoPrincipal}</div>
            </div>

            <div style={styles.planoCard}>
              <div style={styles.planoCardTitulo}>4. Atenção antes do pedido</div>
              <div style={styles.alertaFinanceiro}>{alertaFinanceiro}</div>
              <div style={styles.planoSecundario}>
                Última compra: <strong>{dataBR(ultimaCompra)}</strong>
                {diasSemCompra !== null && <> • {numero(diasSemCompra)} dias sem compra</>}
              </div>
            </div>
          </div>

          <div style={styles.roteiroBox}>
            <div style={styles.planoCardTitulo}>ROTEIRO SUGERIDO PARA A CONVERSA</div>
            <div style={styles.roteiroSteps}>
              <span><b>01</b> Revisar o histórico recente</span>
              <span><b>02</b> Apresentar a principal oportunidade de mix</span>
              <span><b>03</b> Mostrar referências prioritárias</span>
              <span><b>04</b> Ajustar quantidade à realidade da loja</span>
              <span><b>05</b> Validar limite e condição antes do fechamento</span>
            </div>
          </div>
        </section>

        <section style={styles.preditiva}>
          <div>
            <div style={styles.eyebrowBranco}>INTELIGÊNCIA COMERCIAL</div>
            <h2 style={styles.preditivaTitulo}>Próxima ação sugerida</h2>
            <p style={styles.preditivaTexto}>
              {principalPotencial
                ? `Trabalhar ${principalPotencial.linha}. O cliente ainda não possui histórico nessa linha, enquanto ${principalPotencial.penetracao.toFixed(0)}% dos ${grupoSimilar.length} clientes semelhantes compram. Como referência de abordagem, o grupo apresenta mediana de ${numero(principalPotencial.paresMedianos)} pares${principalPotencial.refs.length ? `, com destaque para ${principalPotencial.refs.map((r) => r.referencia).join(", ")}` : ""}.`
                : "Priorize as linhas de maior score comercial e as referências com histórico mais consistente para este cliente."}
            </p>
          </div>
          <div style={styles.preditivaIcone}>✦</div>
        </section>

      </div>
    </main>
  );
}

// ============================================================
// COMPONENTES
// ============================================================

function Card({
  titulo,
  valor,
  detalhe,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
}) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTitulo}>
        {titulo}
      </div>

      <div style={styles.cardValor}>
        {valor}
      </div>

      <div style={styles.cardDetalhe}>
        {detalhe}
      </div>
    </div>
  );
}

function Info({
  titulo,
  valor,
}: {
  titulo: string;
  valor: string;
}) {
  return (
    <div>
      <div style={styles.infoTitulo}>
        {titulo}
      </div>

      <div style={styles.infoValor}>
        {valor}
      </div>
    </div>
  );
}

function Indicador({
  titulo,
  valor,
}: {
  titulo: string;
  valor: string;
}) {
  return (
    <div style={styles.indicador}>
      <div style={styles.infoTitulo}>
        {titulo}
      </div>

      <div style={styles.indicadorValor}>
        {valor}
      </div>
    </div>
  );
}

// ============================================================
// ESTILOS
// ============================================================

const styles: Record<string, React.CSSProperties> = {

  page: {
    minHeight: "100vh",
    background: "#fffaf3",
    color: "#3d2300",
    padding: "30px",
  },

  container: {
    maxWidth: "1450px",
    margin: "0 auto",
  },

  voltar: {
    display: "inline-block",
    color: "#c86400",
    fontWeight: 800,
    textDecoration: "none",
    marginBottom: "22px",
  },

  hero: {
    background:
      "linear-gradient(135deg,#f57c00,#ff9c1a)",
    color: "white",
    borderRadius: "22px",
    padding: "32px 36px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "25px",
    marginBottom: "22px",
  },

  eyebrow: {
    color: "#f47700",
    fontWeight: 900,
    fontSize: "12px",
    letterSpacing: "2px",
    marginBottom: "10px",
  },

  eyebrowBranco: {
    fontWeight: 900,
    fontSize: "11px",
    letterSpacing: "2px",
    marginBottom: "8px",
    opacity: 0.85,
  },

  titulo: {
    fontSize: "30px",
    margin: 0,
    lineHeight: 1.2,
  },

  localizacao: {
    marginTop: "10px",
    opacity: 0.9,
  },

  status: {
    borderRadius: "999px",
    padding: "10px 15px",
    fontWeight: 900,
    fontSize: "11px",
    whiteSpace: "nowrap",
    display: "flex",
    gap: "7px",
    alignItems: "center",
  },

  bloco: {
    background: "#fffdf9",
    border: "1px solid #f0c88f",
    borderRadius: "18px",
    padding: "24px",
    marginBottom: "20px",
  },

  blocoTitulo: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontSize: "18px",
    fontWeight: 900,
    marginBottom: "22px",
  },

  numeroSecao: {
    background: "#ff9d1c",
    width: "30px",
    height: "30px",
    borderRadius: "50%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "11px",
  },

  infoGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit,minmax(180px,1fr))",
    gap: "25px",
  },

  infoTitulo: {
    fontSize: "10px",
    fontWeight: 900,
    color: "#9c6630",
    letterSpacing: "1px",
    textTransform: "uppercase",
    marginBottom: "7px",
  },

  infoValor: {
    fontWeight: 800,
    fontSize: "15px",
  },

  cards: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit,minmax(220px,1fr))",
    gap: "14px",
    marginBottom: "20px",
  },

  card: {
    background: "#fffdf9",
    border: "1px solid #f0c88f",
    borderRadius: "18px",
    padding: "22px",
    minHeight: "120px",
  },

  cardTitulo: {
    fontSize: "10px",
    fontWeight: 900,
    color: "#9c6630",
    letterSpacing: "1px",
    marginBottom: "13px",
  },

  cardValor: {
    fontSize: "22px",
    fontWeight: 900,
    color: "#3d2300",
    marginBottom: "8px",
  },

  cardDetalhe: {
    color: "#ad7744",
    fontSize: "12px",
  },

  historicoGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit,minmax(190px,1fr))",
    gap: "12px",
  },

  indicador: {
    background: "#fff7eb",
    borderRadius: "13px",
    padding: "18px",
  },

  indicadorValor: {
    fontSize: "20px",
    fontWeight: 900,
  },

  tableWrap: { width: "100%", overflowX: "auto" },
  tabela: { width: "100%", borderCollapse: "collapse", minWidth: "760px" },
  th: { textAlign: "left", padding: "12px 14px", fontSize: "10px", color: "#9c6630", letterSpacing: "1px", textTransform: "uppercase", borderBottom: "1px solid #f0c88f" },
  thRight: { textAlign: "right", padding: "12px 14px", fontSize: "10px", color: "#9c6630", letterSpacing: "1px", textTransform: "uppercase", borderBottom: "1px solid #f0c88f" },
  td: { padding: "14px", borderBottom: "1px solid #f7e5cf", fontSize: "13px" },
  tdRight: { padding: "14px", borderBottom: "1px solid #f7e5cf", textAlign: "right", fontSize: "13px", whiteSpace: "nowrap" },
  linhaNome: { fontWeight: 900, color: "#4d2c0b" },
  linhaCodigo: { marginTop: "4px", color: "#ad7744", fontSize: "10px", fontWeight: 700 },
  oportunidadesGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "14px" },
  oportunidadeCard: { background: "#fff7eb", border: "1px solid #f3d2a5", borderRadius: "16px", padding: "18px" },
  oportunidadeTopo: { display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start" },
  oportunidadeLinha: { fontWeight: 900, fontSize: "15px", color: "#3d2300" },
  badge: { borderRadius: "999px", padding: "6px 9px", fontSize: "9px", fontWeight: 900, whiteSpace: "nowrap" },
  badgeAlto: { color: "#0d7652", background: "#dff5eb" },
  badgeMedio: { color: "#9a6800", background: "#fff0c2" },
  badgeBaixo: { color: "#9a4b35", background: "#fbe6df" },
  scoreLinha: { display: "flex", alignItems: "baseline", gap: "5px", marginTop: "18px", color: "#a15c18", fontSize: "11px" },
  barra: { height: "7px", background: "#f1dfc8", borderRadius: "999px", overflow: "hidden", marginTop: "8px" },
  barraPreenchida: { height: "100%", background: "linear-gradient(90deg,#e67800,#ff9d1c)", borderRadius: "999px" },
  oportunidadeMotivo: { marginTop: "12px", color: "#7e5329", fontSize: "11px", lineHeight: 1.45 },
  metodologia: { marginTop: "16px", padding: "12px 14px", borderRadius: "12px", background: "#fffaf3", color: "#94602e", fontSize: "11px", lineHeight: 1.5 },
  vazio: { padding: "20px", borderRadius: "12px", background: "#fff7eb", color: "#94602e", fontSize: "13px" },

  similarResumo: {
    marginBottom: "18px",
    padding: "13px 15px",
    background: "#fff7eb",
    borderRadius: "12px",
    color: "#815326",
    fontSize: "12px",
    lineHeight: 1.5,
  },

  potenciaisGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
    gap: "14px",
  },

  potencialCard: {
    background: "#fffdf9",
    border: "1px solid #f0c88f",
    borderRadius: "17px",
    padding: "19px",
  },

  penetracaoNumero: {
    marginTop: "18px",
    fontSize: "31px",
    lineHeight: 1,
    fontWeight: 900,
    color: "#e67800",
  },

  penetracaoLegenda: {
    marginTop: "5px",
    color: "#8e6034",
    fontSize: "11px",
  },

  potencialMetricas: {
    display: "grid",
    gridTemplateColumns: "repeat(3,1fr)",
    gap: "8px",
    marginTop: "17px",
  },

  refsPotenciais: {
    marginTop: "15px",
    paddingTop: "13px",
    borderTop: "1px solid #f3dfc5",
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    color: "#805328",
    fontSize: "11px",
  },

  planoHero: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "stretch",
    gap: "16px",
    padding: "20px",
    borderRadius: "16px",
    background: "linear-gradient(135deg,#fff4e3,#fffaf3)",
    border: "1px solid #f2d3aa",
    marginBottom: "14px",
  },

  planoLabel: {
    color: "#a86626",
    fontSize: "9px",
    fontWeight: 900,
    letterSpacing: "1.4px",
    marginBottom: "7px",
  },

  planoObjetivo: {
    color: "#3d2300",
    fontSize: "20px",
    lineHeight: 1.3,
    fontWeight: 900,
  },

  quantidadeBox: {
    minWidth: "190px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    padding: "14px 18px",
    borderRadius: "13px",
    background: "#fff",
    border: "1px solid #f0c88f",
  },

  planoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
    gap: "12px",
  },

  planoCard: {
    padding: "18px",
    borderRadius: "15px",
    background: "#fff7eb",
    border: "1px solid #f3d2a5",
  },

  planoCardTitulo: {
    color: "#9b5c1d",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "1px",
    textTransform: "uppercase",
    marginBottom: "12px",
  },

  planoItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 0",
    borderBottom: "1px solid #f2dfc6",
  },

  planoOrdem: {
    width: "25px",
    height: "25px",
    flex: "0 0 25px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    background: "#ff9d1c",
    color: "#4c2a00",
    fontSize: "10px",
    fontWeight: 900,
  },

  planoTexto: {
    color: "#68421f",
    fontSize: "12px",
    lineHeight: 1.55,
  },

  refVisita: {
    display: "flex",
    justifyContent: "space-between",
    gap: "10px",
    padding: "8px 0",
    borderBottom: "1px solid #f2dfc6",
    color: "#68421f",
    fontSize: "11px",
  },

  alertaFinanceiro: {
    color: "#68421f",
    fontSize: "12px",
    lineHeight: 1.5,
    fontWeight: 700,
  },

  planoSecundario: {
    marginTop: "12px",
    paddingTop: "10px",
    borderTop: "1px solid #f2dfc6",
    color: "#9b6c3f",
    fontSize: "10px",
  },

  roteiroBox: {
    marginTop: "14px",
    padding: "18px",
    borderRadius: "15px",
    background: "#fffdf9",
    border: "1px solid #f0c88f",
  },

  roteiroSteps: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
    gap: "8px",
    color: "#68421f",
    fontSize: "11px",
  },

  preditiva: {
    background:
      "linear-gradient(135deg,#d86c00,#ff9514)",
    color: "white",
    borderRadius: "20px",
    padding: "27px 30px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "20px",
  },

  preditivaTitulo: {
    margin: "0 0 8px",
    fontSize: "25px",
  },

  preditivaTexto: {
    margin: 0,
    maxWidth: "700px",
    lineHeight: 1.5,
    opacity: 0.92,
  },

  preditivaIcone: {
    fontSize: "45px",
  },

  erroPage: {
    minHeight: "100vh",
    background: "#fffaf3",
    padding: "40px",
  },

  erroCard: {
    maxWidth: "700px",
    margin: "80px auto",
    background: "white",
    padding: "30px",
    borderRadius: "20px",
    border: "1px solid #f0c88f",
  },

  erroTitulo: {
    color: "#3d2300",
  },
};