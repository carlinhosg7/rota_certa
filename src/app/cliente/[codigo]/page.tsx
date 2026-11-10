import {
  buscarVendasCliente360,
  buscarVendasClientes360,
  buscarPerfis360,
} from "@/lib/visao360-supabase";
import { normalizarRepresentante } from "@/lib/representantes-oficiais";
import type { Venda } from "@/lib/comercial-data";
import { calcularPrioridadeCliente } from "@/lib/prioridade-cliente";
import { obterPrioridade } from "@/lib/prioridade-cliente-db";
import { MessageCircle, Phone, Mail, MapPin } from "lucide-react";
import Link from "next/link";
import { calcularJanelaCompraFaturamento } from "@/lib/janela-compra-faturamento";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { validarToken } from "@/lib/auth";
import { acessoGlobal, regionaisPermitidas, representantesPermitidos } from "@/lib/escopo-acesso";
import { notFound } from "next/navigation";
import ResultadoAtendimento from "@/components/ResultadoAtendimento";
import ProdutosPotencialAbas from "@/components/ProdutosPotencialAbas";
import GestaoReativacao from "@/components/GestaoReativacao";
import ExportarCliente360PDF from "@/components/ExportarCliente360PDF";
import ClassificacaoCliente from "@/components/ClassificacaoCliente";
import { obterClassificacoes } from "@/lib/classificacoes-db";
import { carregarCarteira2027 } from "@/lib/carteira-2027-data";
import type { CodigoClassificacao } from "@/lib/classificacoes";
import {
  carregarCarteiraOficial360,

  cleanCode,
  cleanReferencia,
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

  const inicioDados = performance.now();
  const codigoLimpo = cleanCode(codigo);

  // Validacao de acesso antes de carregar dados comerciais.
  if (!acessoGlobal(usuario)) {
    const perfil = String(usuario.perfil ?? "").toUpperCase();

    const cadastroBase = await carregarCarteira2027();
    const cadastro = cadastroBase.clientes.find(
      c => cleanCode(String(c.codigoCliente)) === codigoLimpo
    );

    if (!cadastro) {
      notFound();
    }

    if (perfil === "REPRESENTANTE" || perfil === "REP") {
      // Comparacao por codigo comercial normalizado.
      // Nao autorizar por regional nem por historico.
      const normalizarCodigoAcesso = (valor: unknown) =>
        String(valor ?? "")
          .trim()
          .replace(/\\.0+$/, "")
          .replace(/^0+(?=\\d)/, "");

      const reps = await representantesPermitidos(usuario);

      const autorizados = new Set(
        (reps ?? [])
          .map(normalizarCodigoAcesso)
          .filter(Boolean)
      );

      const vinculados = (
        cadastro.representanteAtual ?? []
      ).map(r => normalizarCodigoAcesso(r.codigo));

      const autorizado = vinculados.some(
        codigoRep => autorizados.has(codigoRep)
      );

      if (!autorizado) {
        console.warn("[ACESSO 360 NEGADO]", {
          codigoCliente: codigoLimpo,
          perfil,
          representantesSessao: [...autorizados],
          representantesCliente: vinculados,
          motivo: autorizados.size
            ? "SEM_VINCULO_COM_REPRESENTANTE"
            : "SESSAO_SEM_CODIGO_REPRESENTANTE",
        });

        notFound();
      }

    } else if (perfil === "SUPERVISOR" || perfil === "GERENTE") {
      const regionais = await regionaisPermitidas(usuario);

      const autorizado = cadastro.supervisores?.some(
        s => regionais?.has(String(s.codigo).trim())
      );

      if (!autorizado) notFound();

    } else {
      notFound();
    }
  }

  const {
    carteira,
    produtosAutorizados,
    nomesReferencias,
    mapaRepresentantes,
  } = await carregarCarteiraOficial360();

  console.log(
    "[PERFORMANCE CLIENTE] bases leves:",
    Math.round(performance.now() - inicioDados),
    "ms"
  );

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
            ← Voltar para Venda Mais+
          </Link>
        </div>
      </main>
    );
  }

  // ============================================================
  // HISTÓRICO DO CLIENTE
  // ============================================================

  const inicioVendas360 = performance.now();

  const vendasDoCliente = await buscarVendasCliente360(codigoLimpo);

  for (const v of vendasDoCliente) {
    const oficial = normalizarRepresentante(v.rep, mapaRepresentantes);
    v.rep = oficial.codigo;
    if (oficial.supervisor) v.sup = oficial.supervisor;
  }

  console.log(
    "[PERFORMANCE CLIENTE] vendas Supabase:",
    vendasDoCliente.length,
    Math.round(performance.now() - inicioVendas360),
    "ms"
  );
  const vendasCliente = vendasDoCliente
    
    .filter((v) => v.data)
    .sort(
      (a, b) =>
        (b.data?.getTime() || 0) -
        (a.data?.getTime() || 0)
    );

  
  const vendasLimite360 = [...vendasDoCliente]
    
    .sort((a, b) => {
      const da = (a.dataEntrega ?? a.data)?.getTime() ?? 0;
      const db = (b.dataEntrega ?? b.data)?.getTime() ?? 0;
      return db - da;
    });

  const obterLimite360 = (
    campo: "limiteAprovado" | "limiteCredito" | "limiteDisponivel"
  ): number | null => {
    for (const v of vendasLimite360) {
      const valor = v[campo];

      if (valor !== null && valor !== undefined) {
        return valor;
      }
    }
    return null;
  };

  const limiteAprovado360 = obterLimite360("limiteAprovado");
  const limiteCredito360 = obterLimite360("limiteCredito");
  const limiteDisponivel360 = obterLimite360("limiteDisponivel");
const janelaComercial = await calcularJanelaCompraFaturamento(
    codigoLimpo,
    vendasDoCliente
  );
  const maximoJanela = Math.max(
    1,
    ...janelaComercial.meses.flatMap(m => [m.entradas, m.faturamentos])
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

  // A lista oficial de produtos autorizados ja e carregada pelo sistema.
  // Codigo da linha pode vir como 007 ou 7; a chave normalizada e identica.
  const normalizarLinha360 = (v: unknown) => String(v ?? "").trim().replace(/^0+(?=\d)/, "");
  const linhasAtivas360 = new Set(produtosAutorizados.map(p => normalizarLinha360(p.codigoLinha)).filter(Boolean));
  const refsAtivas360 = new Set(produtosAutorizados.map(p => cleanReferencia(p.referencia)).filter(Boolean));
  const linhaPlay360 = "7";
  const playAtiva360 = linhasAtivas360.has(linhaPlay360);

  const maxValorLinha = Math.max(1, ...mixLinhas.map((m) => m.valor));
  const maxParesLinha = Math.max(1, ...mixLinhas.map((m) => m.pares));
  const maxPedidosLinha = Math.max(1, ...mixLinhas.map((m) => m.pedidos.size));
  const maxDiasLinha = Math.max(1, ...mixLinhas.map((m) => Math.min(m.diasSemCompra ?? 0, 365)));

  const oportunidades = mixLinhas.filter(m => linhasAtivas360.has(normalizarLinha360(m.codigoLinha))).map((m) => {
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
    .filter(r => linhasAtivas360.has(normalizarLinha360(r.codigoLinha)) && refsAtivas360.has(cleanReferencia(r.referencia)))
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

  const inicioIndice = performance.now();

  const carteiraPorCodigo = new Map(
    carteira.map((c) => [cleanCode(c.codigo), c])
  );

  const perfisHistoricos = await buscarPerfis360();

  function proximidadeLog(a: number, b: number) {
    if (a <= 0 && b <= 0) return 1;
    if (a <= 0 || b <= 0) return 0;
    const dif = Math.abs(Math.log1p(a) - Math.log1p(b));
    return Math.max(0, 1 - dif / 4);
  }

  // Prioridade da sugestão: carteira ATIVA do representante;
  // quando não houver amostra suficiente, carteira ATIVA da regional.
  // Nunca completar a amostra com clientes de outras regionais.
  const carteiraComparacao2027 = await carregarCarteira2027();
  const representantesCliente = new Set(
    (carteiraComparacao2027.clientes.find(c => cleanCode(c.codigoCliente) === codigoLimpo)
      ?.representanteAtual ?? []).map(r => cleanCode(r.codigo))
  );
  const supervisoresCliente = new Set(
    (carteiraComparacao2027.clientes.find(c => cleanCode(c.codigoCliente) === codigoLimpo)
      ?.supervisores ?? []).map(r => cleanCode(r.codigo))
  );
  if (cliente.rep) representantesCliente.add(cleanCode(cliente.rep));
  if (cliente.sup) supervisoresCliente.add(cleanCode(cliente.sup));

  const ativosMesmoRepresentante = new Set<string>();
  const ativosMesmaRegional = new Set<string>();
  for (const c of carteiraComparacao2027.clientes) {
    if (c.carteira !== "01_ATIVA") continue;
    const cod = cleanCode(c.codigoCliente);
    if (!cod || cod === codigoLimpo) continue;
    if (c.representanteAtual.some(r => representantesCliente.has(cleanCode(r.codigo)))) {
      ativosMesmoRepresentante.add(cod);
    }
    if (c.supervisores.some(r => supervisoresCliente.has(cleanCode(r.codigo)))) {
      ativosMesmaRegional.add(cod);
    }
  }

  const candidatosSemelhantes = perfisHistoricos
    .map((perfil) => {
      const cod = cleanCode(perfil.codigo_cliente);

      if (cod === codigoLimpo) return null;

      const cad = carteiraPorCodigo.get(cod);

      if (!cad) return null;

      const mesmaRegional =
        cad.sup && cliente.sup && cad.sup === cliente.sup ? 1 : 0;

      const mesmoRep =
        cad.rep && cliente.rep && cad.rep === cliente.rep ? 1 : 0;

      const scoreSimilaridade =
        proximidadeLog(
          perfil.valor_historico,
          perfilCliente.valorHistorico
        ) * 0.30 +
        proximidadeLog(
          perfil.pares_historico,
          perfilCliente.paresHistorico
        ) * 0.25 +
        proximidadeLog(
          perfil.pedidos,
          perfilCliente.pedidos
        ) * 0.20 +
        proximidadeLog(
          perfil.mix,
          perfilCliente.mix
        ) * 0.15 +
        mesmaRegional * 0.08 +
        mesmoRep * 0.02;

      return {
        codigo: cod,
        vendas: [] as Venda[],
        scoreSimilaridade,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.scoreSimilaridade - a.scoreSimilaridade);

  const candidatosRep = candidatosSemelhantes.filter(c =>
    ativosMesmoRepresentante.has(c.codigo)
  );
  const candidatosRegional = candidatosSemelhantes.filter(c =>
    ativosMesmaRegional.has(c.codigo)
  );
  const usarCarteiraRep = candidatosRep.length >= 10;
  const origemComparacao = usarCarteiraRep
    ? "carteira ativa do representante"
    : "carteira ativa da regional do supervisor";
  const candidatosComparacao = (usarCarteiraRep ? candidatosRep : candidatosRegional)
    .slice(0, 40);

  // Consulta agrupada dos clientes semelhantes.
  const mapaVendasSemelhantes = await buscarVendasClientes360(
    candidatosComparacao.map((c) => c.codigo)
  );

  for (const candidato of candidatosComparacao) {
    const vendas =
      mapaVendasSemelhantes.get(candidato.codigo) ?? [];

    for (const v of vendas) {
      const oficial = normalizarRepresentante(
        v.rep,
        mapaRepresentantes
      );

      v.rep = oficial.codigo;

      if (oficial.supervisor) {
        v.sup = oficial.supervisor;
      }
    }

    candidato.vendas = vendas;
  }

  const candidatosComVendas = candidatosComparacao.filter(
    (c) => c.vendas.length > 0
  );

  const similares = candidatosComVendas.filter(
    (x) => x.scoreSimilaridade >= 0.45
  );

  const grupoSimilar =
    similares.length >= 10
      ? similares
      : candidatosComVendas.slice(0, 20);

  console.log(
    "[PERFORMANCE CLIENTE] similaridade Supabase:",
    candidatosComVendas.length,
    "clientes em",
    Math.round(performance.now() - inicioIndice),
    "ms"
  );
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
      // PLAY sempre participa da avaliacao, mesmo para cliente que ja a comprou.
      if (!chave || !linhasAtivas360.has(normalizarLinha360(codigoLinha)) ||
        (linhasCliente.has(chave) && normalizarLinha360(codigoLinha) !== linhaPlay360)) continue;

      const atual = porLinhaCliente.get(chave) || { codigoLinha, linha, pares: 0, valor: 0 };
      atual.pares += v.qtd || 0;
      atual.valor += v.vlr || 0;
      porLinhaCliente.set(chave, atual);

      if (v.referencia) {
        const p: PotencialLinha = potencialMap.get(chave) || {
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
      const p: PotencialLinha = potencialMap.get(chave) || {
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

  const produtosPotenciaisCalculados = [...potencialMap.values()]
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

  // PLAY e prioridade comercial para todos os clientes, inclusive compradores.
  // Se nao houver compras entre similares, usamos 0 real e nao inventamos score.
  const produtosPotenciais = (() => {
    // A linha PLAY permanece visível para todos os clientes.
    const playEncontrada = produtosPotenciaisCalculados.find(p => normalizarLinha360(p.codigoLinha) === linhaPlay360);
    const playBase = produtosAutorizados.find(p => normalizarLinha360(p.codigoLinha) === linhaPlay360);
    const play = playEncontrada ?? {
      chave: playBase?.codigoLinha ?? "007",
      codigoLinha: playBase?.codigoLinha ?? "007",
      linha: playBase?.linha || "TENIS KIDY PLAY RESPITEC",
      clientes: new Set<string>(),
      pares: [] as number[],
      valores: [] as number[],
      referencias: new Map<string, { referencia: string; pares: number; clientes: Set<string> }>(),
      penetracao: 0, paresMedianos: 0, valorMediano: 0,
      refs: [] as { referencia: string; pares: number; clientes: Set<string> }[],
      score: 0,
      potencial: "ALTO",
    };
    return [play, ...produtosPotenciaisCalculados.filter(p => normalizarLinha360(p.codigoLinha) !== linhaPlay360)].slice(0, 8);
  })();

  const principalPotencial = produtosPotenciais.find(p => normalizarLinha360(p.codigoLinha) !== linhaPlay360 && p.clientes.size > 0) || null;


  // ============================================================
  // DICIONÁRIO OFICIAL: REFERÊNCIA -> NOME
  // ============================================================


  // Motor V4: tres universos independentes, com permissao comercial.
  const repsPermitidosV4 = await representantesPermitidos(usuario);
  const regionaisPermitidasV4 = await regionaisPermitidas(usuario);
  const nacionalV4 = acessoGlobal(usuario);

  const cadastroV4 = new Map(
    carteiraComparacao2027.clientes.map(c => [
      cleanCode(c.codigoCliente), c
    ])
  );


  // V10: escopo real dos representantes atuais.
  // Nao usar o representante historico unico como filtro.
  const cadastroAlvoV10 = cadastroV4.get(codigoLimpo);

  const repOficialV10 = (valor: unknown) =>
    normalizarRepresentante(
      cleanCode(String(valor ?? "").replace(/^0+(?=\d)/, "")),
      mapaRepresentantes
    ).codigo;

  const repsPermitidosSetV10 = new Set(
    (repsPermitidosV4 ?? []).map(repOficialV10)
  );

  const perfilV10 = String(usuario.perfil ?? "")
    .trim().toUpperCase();

  const representanteLogadoV10 =
    perfilV10 === "REPRESENTANTE" ||
    perfilV10 === "REP";

  const repsClienteV10 = new Set(
    (cadastroAlvoV10?.representanteAtual ?? [])
      .map(r => repOficialV10(r.codigo))
      .filter(Boolean)
  );

  if (cliente.rep) {
    repsClienteV10.add(repOficialV10(cliente.rep));
  }

  const repsAlvoV10 = new Set(
    [...repsClienteV10].filter(rep =>
      nacionalV4 ||
      repsPermitidosSetV10.has(rep)
    )
  );

  const supAlvoV4 = cleanCode(
    cadastroAlvoV10?.supervisores?.[0]?.codigo ||
    cliente.sup ||
    ""
  );

  const ufAlvoV4 = String(
    cadastroAlvoV10?.uf || cliente.uf || ""
  ).trim().toUpperCase();

  const perfilScoreV10 = new Map(
    candidatosSemelhantes.map(c => [
      c.codigo,
      c.scoreSimilaridade
    ])
  );

  const representantesAtuaisV10 = (
    cad: (typeof carteiraComparacao2027.clientes)[number]
  ) => (cad.representanteAtual ?? [])
    .map(r => repOficialV10(r.codigo))
    .filter(Boolean);

  const supDoRepV10 = (rep: string) => cleanCode(
    mapaRepresentantes.cadastro.get(rep)
      ?.codigo_supervisor || ""
  );

  const permitidoV10 = (
    cad: (typeof carteiraComparacao2027.clientes)[number]
  ) => {
    const reps = representantesAtuaisV10(cad);

    if (nacionalV4) return true;

    if (representanteLogadoV10) {
      return reps.some(rep =>
        repsPermitidosSetV10.has(rep)
      );
    }

    return reps.some(rep =>
      repsPermitidosSetV10.has(rep) &&
      (
        regionaisPermitidasV4 === null ||
        regionaisPermitidasV4.has(supDoRepV10(rep))
      )
    );
  };

  // Fonte principal: clientes ativos no snapshot vigente.
  // Perfil historico e usado apenas para ordenacao.
  const candidatosAutorizadosV4 =
    carteiraComparacao2027.clientes
      .filter(cad => {
        const cod = cleanCode(cad.codigoCliente);

        return (
          Boolean(cod) &&
          cod !== codigoLimpo &&
          cad.carteira === "01_ATIVA" &&
          String(cad.situacaoEmpresa ?? "")
            .toUpperCase() !== "BAIXADA" &&
          permitidoV10(cad)
        );
      })
      .map(cad => ({
        codigo: cleanCode(cad.codigoCliente),
        scoreSimilaridade:
          perfilScoreV10.get(cleanCode(cad.codigoCliente)) ?? 0,
        vendas: [] as Venda[],
      }))
      .sort((a, b) =>
        b.scoreSimilaridade - a.scoreSimilaridade
      );

  // Amostra por universo comercial, sem alterar quem pertence a cada universo.
  // Minha carteira prioriza similaridade; estado/regional distribuem a amostra
  // para evitar sempre os mesmos 80 primeiros do ranking global.
  const amostrarPotencialV11 = <T,>(
    candidatos: T[],
    tipo: "carteira" | "estado" | "regional"
  ): T[] => {
    const limite = 80;
    if (candidatos.length <= limite) return candidatos;
    if (tipo === "carteira") return candidatos.slice(0, limite);
    const deslocamento = tipo === "estado" ? 0.75 : 0.25;
    const passo = candidatos.length / limite;
    return Array.from({ length: limite }, (_, indice) =>
      candidatos[Math.min(
        candidatos.length - 1,
        Math.floor((indice + deslocamento) * passo)
      )]
    );
  };

  const gruposPotencialV4 = [
    {
      id: "carteira",
      titulo: "Minha carteira",
      descricao: "Clientes ativos do mesmo representante",
      clientes: amostrarPotencialV11(candidatosAutorizadosV4.filter(c => {
        const cad = cadastroV4.get(c.codigo);
        return cad && representantesAtuaisV10(cad)
          .some(rep => repsAlvoV10.has(rep));
      }), "carteira"),
    },
    {
      id: "estado",
      titulo: "Meu estado",
      descricao: "Clientes ativos da UF " + ufAlvoV4,
      clientes: amostrarPotencialV11(candidatosAutorizadosV4.filter(c => {
        const cad = cadastroV4.get(c.codigo);
        return Boolean(
          ufAlvoV4 &&
          String(cad?.uf || "")
            .trim().toUpperCase() === ufAlvoV4
        );
      }), "estado"),
    },
    {
      id: "regional",
      titulo: "Minha regional",
      descricao: "Clientes ativos da regional " + supAlvoV4,
      clientes: amostrarPotencialV11(candidatosAutorizadosV4.filter(c => {
        const cad = cadastroV4.get(c.codigo);
        return Boolean(
          cad &&
          supAlvoV4 &&
          representantesAtuaisV10(cad).some(rep =>
            supDoRepV10(rep) === supAlvoV4
          )
        );
      }), "regional"),
    },
  ];

  console.log("[POTENCIAL V10 AMOSTRA]", {
    cliente: codigoLimpo,
    perfil: perfilV10,
    repsCliente: [...repsClienteV10],
    repsPermitidos: nacionalV4
      ? ["ACESSO_GLOBAL"]
      : [...repsPermitidosSetV10],
    repsComparacao: [...repsAlvoV10],
    autorizados: candidatosAutorizadosV4.length,
    carteira: gruposPotencialV4[0].clientes.length,
    estado: gruposPotencialV4[1].clientes.length,
    regional: gruposPotencialV4[2].clientes.length,
  });

  const codigosExtrasV4 = [...new Set(
    gruposPotencialV4.flatMap(g =>
      g.clientes.map(c => c.codigo)
    )
  )].filter(c => !mapaVendasSemelhantes.has(c));

  const extrasV4 = await buscarVendasClientes360(codigosExtrasV4);

  const vendasPorClienteV4 = new Map([
    ...mapaVendasSemelhantes,
    ...extrasV4,
  ]);

  const corteV4 = new Date();
  corteV4.setDate(corteV4.getDate() - 180);

  const linhasCompradasV4 = new Set(
    vendasCliente.map(v =>
      normalizarLinha360(v.codigoLinha)
    ).filter(Boolean)
  );

  const linhasOficiaisV4 = new Map(
    produtosAutorizados.map(p => [
      normalizarLinha360(p.codigoLinha), p
    ] as const)
  );

  function medianaV4(valores: number[]) {
    if (!valores.length) return 0;
    const v = [...valores].sort((a, b) => a - b);
    const i = Math.floor(v.length / 2);
    return v.length % 2 ? v[i] : (v[i - 1] + v[i]) / 2;
  }

  const abasPotencialV4 = gruposPotencialV4.map(grupo => {
    type Linha = {
      codigo: string;
      nome: string;
      compradores: Map<string, { pares: number; valor: number }>;
      referencias: Map<string, Set<string>>;
    };

    const linhas = new Map<string, Linha>();

    for (const candidato of grupo.clientes) {
      const vendas = vendasPorClienteV4.get(candidato.codigo) ?? [];

      for (const v of vendas) {
        if (v.qtd <= 0) continue;

        const cod = normalizarLinha360(v.codigoLinha);
        if (!cod || !linhasAtivas360.has(cod)) continue;

        if (
          cod !== linhaPlay360 &&
          linhasCompradasV4.has(cod)
        ) continue;

        const oficial = linhasOficiaisV4.get(cod);
        const item = linhas.get(cod) ?? {
          codigo: oficial?.codigoLinha || v.codigoLinha,
          nome: oficial?.linha || v.linha || `Linha ${cod}`,
          compradores: new Map<
            string, { pares: number; valor: number }
          >(),
          referencias: new Map<string, Set<string>>(),
        };

        const anterior = item.compradores.get(candidato.codigo)
          ?? { pares: 0, valor: 0 };

        anterior.pares += v.qtd;
        anterior.valor += v.vlr || 0;

        item.compradores.set(candidato.codigo, anterior);

        const ref = cleanReferencia(v.referencia);

        if (ref && refsAtivas360.has(ref)) {
          const clientesRef = item.referencias.get(ref)
            ?? new Set<string>();

          clientesRef.add(candidato.codigo);
          item.referencias.set(ref, clientesRef);
        }

        linhas.set(cod, item);
      }
    }

    const produtos = [...linhas.entries()].map(([cod, item]) => ({
      codigoLinha: item.codigo,
      linha: item.nome,
      play: cod === linhaPlay360,
      jaCompra: linhasCompradasV4.has(cod),
      clientes: item.compradores.size,
      percentual: grupo.clientes.length
        ? 100 * item.compradores.size / grupo.clientes.length
        : 0,
      medianaPares: medianaV4(
        [...item.compradores.values()].map(x => x.pares)
      ),
      medianaValor: medianaV4(
        [...item.compradores.values()].map(x => x.valor)
      ),
      referencias: [...item.referencias.entries()]
        .sort((a, b) => b[1].size - a[1].size)
        .slice(0, 5).map(([ref]) => ref),
    }))
    .filter(p => p.clientes >= 1 || p.play)
    .sort((a, b) =>
      b.percentual - a.percentual || b.clientes - a.clientes
    );

    const playEncontrada = produtos.find(p => p.play);
    const playOficial = linhasOficiaisV4.get(linhaPlay360);

    const play = playEncontrada ?? {
      codigoLinha: playOficial?.codigoLinha || "007",
      linha: playOficial?.linha || "TENIS KIDY PLAY RESPITEC",
      play: true,
      jaCompra: linhasCompradasV4.has(linhaPlay360),
      clientes: 0,
      percentual: 0,
      medianaPares: 0,
      medianaValor: 0,
      referencias: [] as string[],
    };

    return {
      id: grupo.id,
      titulo: grupo.titulo,
      descricao: grupo.descricao,
      amostra: grupo.clientes.length,
      produtos: [
        play,
        ...produtos.filter(p => !p.play)
      ].slice(0, 8),
    };
  });

  const nomeReferenciaPorRef = new Map(
    nomesReferencias.map((p) => [cleanReferencia(p.referencia), p])
  );

  // ============================================================
  // REPOSIÇÃO POR REFERÊNCIA - ÚLTIMA COMPRA ENTRE 91 E 180 DIAS
  // ============================================================

  const reposicoes = [...refMap.values()]
    .map((r) => {
      const refLimpa = cleanReferencia(r.referencia);
      const cadastroNome = nomeReferenciaPorRef.get(refLimpa);
      const dias = r.ultimaCompra
        ? Math.max(0, Math.floor((hoje.getTime() - r.ultimaCompra.getTime()) / 86400000))
        : null;

      return {
        ...r,
        referenciaNormalizada: refLimpa,
        nomeReferencia: cadastroNome?.nome || "",
        diasSemCompra: dias,
      };
    })
    .filter((r) =>
      r.diasSemCompra !== null &&
      r.diasSemCompra > 90 &&
      r.diasSemCompra <= 180
    )
    .sort((a, b) => (b.diasSemCompra || 0) - (a.diasSemCompra || 0));

  const normalizaNome = (valor: string) =>
    valor
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();

  const campanhasDaReferencia = (nome: string) => {
    const n = normalizaNome(nome || "");
    const campanhas: string[] = [];

    if (n.includes("BRINCAFLEX") || (n.includes("BRINCA") && n.includes("FLEX")))
      campanhas.push("Combo BrincaFlex");
    if (n.includes("LUZ")) campanhas.push("Natal Kidy com Luzes");
    if (n.includes("REBECCA")) campanhas.push("Rebecca Bonbon");
    if (n.includes("IMPULSO")) campanhas.push("Impulso 2");
    if (n.includes("KIDEX")) campanhas.push("Kidex - Dinheiro no Bolso");

    return campanhas;
  };

  const reposicoesComCampanha = reposicoes.map((r) => ({
    ...r,
    campanhas: campanhasDaReferencia(r.nomeReferencia),
  }));

  const possuiReposicao = reposicoesComCampanha.length > 0;
  const possuiCampanhaReposicao = reposicoesComCampanha.some((r) => r.campanhas.length > 0);

  // ============================================================
  // REFERÊNCIAS AUTORIZADAS + PERFORMANCE RECENTE
  // ============================================================

  const refsAutorizadas = new Set(
    produtosAutorizados.map((p) => cleanReferencia(p.referencia)).filter(Boolean)
  );

  const produtoPorRef = new Map<string, typeof produtosAutorizados>();
  for (const p of produtosAutorizados) {
    const ref = cleanReferencia(p.referencia);
    if (!ref) continue;
    const arr = produtoPorRef.get(ref) || [];
    arr.push(p);
    produtoPorRef.set(ref, arr);
  }

  const hojeMotor = new Date();
  const corteRecente = new Date(hojeMotor);
  corteRecente.setDate(corteRecente.getDate() - 180);

  type RefAtual = {
    referencia: string;
    linha: string;
    codigoLinha: string;
    clientesRecentes: number;
    paresRecentes: number;
    valorRecente: number;
    ultimaVenda: Date | null;
    produtos: string[];
    nome: string;
  };

  const referenciasAtuaisPorLinha = new Map<string, RefAtual[]>();

  for (const potencial of produtosPotenciais) {
    const chaveLinha = potencial.codigoLinha || potencial.linha;
    const aggRef = new Map<string, {
      clientes: Set<string>;
      pares: number;
      valor: number;
      ultima: Date | null;
    }>();

    for (const s of grupoSimilar) {
      for (const v of s.vendas) {
        const chaveVenda = v.codigoLinha || v.linha;
        const ref = cleanReferencia(v.referencia);

        if (
          chaveVenda !== chaveLinha ||
          !ref ||
          !refsAutorizadas.has(ref)
        ) continue;

        // Ranking usa comportamento recente, mas a autorização vem da whitelist.
        if (!v.data || v.data < corteRecente) continue;

        const a = aggRef.get(ref) || {
          clientes: new Set<string>(),
          pares: 0,
          valor: 0,
          ultima: null,
        };

        a.clientes.add(s.codigo);
        a.pares += v.qtd || 0;
        a.valor += v.vlr || 0;

        if (!a.ultima || v.data > a.ultima) a.ultima = v.data;

        aggRef.set(ref, a);
      }
    }

    // Se uma referência é autorizada mas ainda não apareceu no grupo semelhante
    // nos últimos 180 dias, ela não entra como recomendação principal.
    const ranked: RefAtual[] = [...aggRef.entries()]
      .map(([referencia, a]) => {
        const cadastro = produtoPorRef.get(referencia) || [];
        const produtos = [...new Set(
          cadastro.map((p) => p.produto).filter(Boolean)
        )].slice(0, 3);

        return {
          referencia,
          linha: potencial.linha,
          codigoLinha: potencial.codigoLinha,
          clientesRecentes: a.clientes.size,
          paresRecentes: a.pares,
          valorRecente: a.valor,
          ultimaVenda: a.ultima,
          produtos,
          nome: nomeReferenciaPorRef.get(cleanReferencia(referencia))?.nome || "",
        };
      })
      .sort(
        (a, b) =>
          b.clientesRecentes - a.clientesRecentes ||
          b.paresRecentes - a.paresRecentes ||
          b.valorRecente - a.valorRecente
      )
      .slice(0, 8);

    referenciasAtuaisPorLinha.set(chaveLinha, ranked);
  }

  const referenciasAutorizadasSugestao = produtosPotenciais
    .slice(0, 3)
    .flatMap((p) => {
      const chave = p.codigoLinha || p.linha;
      return (referenciasAtuaisPorLinha.get(chave) || []).slice(0, 4);
    })
    .filter(
      (r, i, arr) =>
        arr.findIndex((x) => x.referencia === r.referencia) === i
    )
    .slice(0, 10);

  // ============================================================
  // CAMPANHAS ATIVAS - REGRAS COMERCIAIS DO PDF DE SETEMBRO/2026
  // ============================================================

  // A campanha de produto nasce SOMENTE das referências recomendadas.
  // A referência exata consulta NOME_REFERENCIAS.xlsx; Codigo Linha não decide campanha.
  const referenciasComNome = referenciasAutorizadasSugestao
    .map((r) => ({
      ...r,
      referenciaNormalizada: cleanReferencia(r.referencia),
      nomeClassificacao:
        nomeReferenciaPorRef.get(cleanReferencia(r.referencia))?.nome || r.nome || "",
    }))
    .filter((r) => r.nomeClassificacao);

  const refsPorNome = (teste: (nomeNormalizado: string) => boolean) =>
    referenciasComNome.filter((r) => teste(
      r.nomeClassificacao
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
    ));

  const refsBrincaFlex = refsPorNome((n) =>
    n.includes("BRINCAFLEX") || (n.includes("BRINCA") && n.includes("FLEX"))
  );
  const refsLuzes = refsPorNome((n) => n.includes("LUZ"));
  const refsRebecca = refsPorNome((n) => n.includes("REBECCA"));
  const refsImpulso = refsPorNome((n) => n.includes("IMPULSO"));
  const refsKidex = refsPorNome((n) => n.includes("KIDEX"));

  const valorPedidoReferencia =
    principalPotencial?.valorMediano || valorHistorico;

  const campanhasAplicaveis: {
    nome: string;
    motivo: string;
    mecanica: string;
    prioridade: "ALTA" | "MÉDIA";
    referencias?: string[];
  }[] = [];

  if (refsBrincaFlex.length) {
    campanhasAplicaveis.push({
      nome: "Combo BrincaFlex",
      motivo: "Há referência recomendada classificada como BrincaFlex na base oficial de nomes.",
      mecanica: "Ativação: 24 pares de sandália + 24 pares de tênis. Reposição: 24 pares de sandália + 12 pares de tênis.",
      prioridade: "ALTA",
      referencias: refsBrincaFlex.map((r) => `${r.referencia} - ${r.nomeClassificacao}`),
    });
  }

  if (refsLuzes.length) {
    campanhasAplicaveis.push({
      nome: "Natal Kidy com Luzes",
      motivo: "Há referência recomendada classificada como Luzes na base oficial de nomes.",
      mecanica: "A cada 48 pares de produtos da linha Luzes, o cliente ganha 10 bags personalizadas Kidy.",
      prioridade: "ALTA",
      referencias: refsLuzes.map((r) => `${r.referencia} - ${r.nomeClassificacao}`),
    });

    if (!ultimaCompra || ultimaCompra <= new Date(2026, 3, 30)) {
      campanhasAplicaveis.push({
        nome: "Reconquista 2.0",
        motivo: "Cliente atende ao corte de recompra e possui referência recomendada classificada como Luzes.",
        mecanica: "Regra do material: não ter comprado a coleção Primavera Verão (último pedido 30/04/2026) e ter 1 linha de Luz no pedido.",
        prioridade: "ALTA",
        referencias: refsLuzes.map((r) => `${r.referencia} - ${r.nomeClassificacao}`),
      });
    }
  }

  if (refsRebecca.length) {
    campanhasAplicaveis.push({
      nome: "Rebecca Bonbon",
      motivo: "Há referência recomendada classificada como Rebecca na base oficial de nomes.",
      mecanica: "Na compra de 36 pares, o material informa benefício de exposição/testeira Rebecca Bonbon; solicitar na observação do pedido.",
      prioridade: "MÉDIA",
      referencias: refsRebecca.map((r) => `${r.referencia} - ${r.nomeClassificacao}`),
    });
  }

  if (refsImpulso.length) {
    campanhasAplicaveis.push({
      nome: "Impulso 2",
      motivo: "Há referência recomendada classificada como Impulso na base oficial de nomes.",
      mecanica: "Pedido de K360 com mínimo de 12 pares de Impulso: 60 pares de K360 = 4 camisetas; 84 pares = 6 camisetas. Informar quantidades e tamanhos na observação.",
      prioridade: "ALTA",
      referencias: refsImpulso.map((r) => `${r.referencia} - ${r.nomeClassificacao}`),
    });
  }

  if (refsKidex.length) {
    campanhasAplicaveis.push({
      nome: "Kidex - Dinheiro no Bolso",
      motivo: "Há referência recomendada classificada como Kidex na base oficial de nomes.",
      mecanica: "Campanha de incentivo ao representante com apuração e premiação mensal entre setembro e dezembro.",
      prioridade: "MÉDIA",
      referencias: refsKidex.map((r) => `${r.referencia} - ${r.nomeClassificacao}`),
    });
  }

  // Campanha financeira continua independente de produto/referência.
  if (valorPedidoReferencia >= 10000 || valorHistorico >= 10000) {
    campanhasAplicaveis.push({
      nome: "Rifa Balconista Campeão",
      motivo: "O porte financeiro do atendimento pode atingir a faixa da campanha.",
      mecanica: "Válida para compras acima de R$ 10.000,00. A participação deve ser informada no pedido.",
      prioridade: "MÉDIA",
    });
  }


  // ============================================================
  // PLANO DA VISITA
  // ============================================================

  const linhasPrioritarias = produtosPotenciais.slice(0, 3);

  const referenciasPrioritarias = referenciasAutorizadasSugestao
    .slice(0, 5)
    .map((r) => ({
      linha: r.linha,
      referencia: r.referencia,
      clientes: r.clientesRecentes,
      pares: r.paresRecentes,
    }));

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

  /* RECEITA E SUBCLASSIFICACOES 2027 */
  // Mesma carteira usada no painel da Receita. Nao altera os indicadores existentes.
  const carteira2027 = await carregarCarteira2027();
  const cadastro2027 = carteira2027.clientes.find(
    (c) => cleanCode(c.codigoCliente) === codigoLimpo
  );
  const razaoSocial360 = String(cadastro2027?.razaoSocial || cliente.razao || "").trim();
  const contatos360 = cadastro2027?.contatos ?? [];
  const endereco360 = cadastro2027
    ? [
        [cadastro2027.endereco, cadastro2027.numeroEndereco].filter(Boolean).join(", "),
        cadastro2027.bairro,
        [cadastro2027.cidade || cliente.cidade, cadastro2027.uf || cliente.uf].filter(Boolean).join(" / "),
      ].filter(Boolean).join(" - ")
    : "";
  const situacaoReceita = cadastro2027?.situacaoEmpresa || "NAO_VERIFICADA";
  const encerrada = situacaoReceita.toUpperCase() === "BAIXADA";
  const sugeridas: CodigoClassificacao[] = [];
  if (!encerrada) {
    if (cliente.bloqueio?.toUpperCase().includes("BLOQUE")) sugeridas.push("BLOQUEADA");
    if (["INAPTA", "SUSPENSA", "NAO LOCALIZADO", "PENDENTE FORMATO", "NAO_VERIFICADA", "NAO VERIFICADA"].includes(situacaoReceita.toUpperCase()))
      sugeridas.push("CADASTRO_VALIDAR");
    if (produtosPotenciais.some(p => p.potencial === "ALTO")) sugeridas.push("POTENCIAL_EXPANSAO");
    const inicioAnterior = new Date(hoje.getFullYear()-1, 0, 1);
    const fimAnterior = new Date(hoje.getFullYear()-1, hoje.getMonth(), hoje.getDate(), 23, 59, 59);
    const valorAnterior = vendasCliente.filter(v => v.data && v.data >= inicioAnterior && v.data <= fimAnterior)
      .reduce((s,v) => s + (v.vlr || 0), 0);
    if (valorAnterior > 0 && valorAno < valorAnterior * 0.75) sugeridas.push("REDUCAO_COMPRA");
  }
  // Escolhas humanas gravadas prevalecem sobre sugestoes; [] significa desmarcou tudo.
  const prioridadeCalculada = calcularPrioridadeCliente(
    vendasDoCliente,
    limiteDisponivel360
  );

  const prioridadeGravada = await obterPrioridade(codigoLimpo);
  const gravadas = await obterClassificacoes(codigoLimpo);
  const iniciais = gravadas === null ? sugeridas : gravadas;

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
          ← Voltar para Venda Mais+
        </Link>

        {/* CABEÇALHO */}

        <section style={styles.hero}>
          <div>
            <div style={styles.eyebrow}>
              INTELIGÊNCIA COMERCIAL
            </div>

            <h1 style={styles.titulo}>
              {cliente.codigo} — {razaoSocial360 || "Razão social não informada"}
            </h1>

            <div style={styles.localizacao}>
              {cliente.cidade} / {cliente.uf}
            </div>

            <div style={{ marginTop: 12 }}>
              <span style={{
                display: "inline-block",
                background: "#fff",
                color: "#9a4e00",
                padding: "7px 13px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 800
              }}>
                CARTEIRA: {
                  cadastro2027?.carteira === "01_ATIVA"
                    ? "01 — ATIVA"
                    : cadastro2027?.carteira === "02_REATIVACAO"
                    ? "02 — REATIVAÇÃO"
                    : "NÃO CLASSIFICADA"
                }
              </span>
            </div>

            {/* A analise financeira pertence ao cabecalho do Cliente 360. */}
            <div style={{ marginTop: 14 }}>
              <a
                href={`https://wa.me/5518997168520?text=${encodeURIComponent(
                  `Olá! Preciso que faça uma nova análise financeira do cliente:\n\nCódigo: ${cliente.codigo}\nRazão Social: ${String(cadastro2027?.razaoSocial || cliente.razao || "").trim()}\nCNPJ: ${String(cadastro2027?.cnpj || "").replace(/\D/g, "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 9,
                  background: "#16a34a",
                  color: "#ffffff",
                  borderRadius: 10,
                  padding: "11px 16px",
                  textDecoration: "none",
                  fontWeight: 800,
                  fontSize: 13,
                  boxShadow: "0 3px 8px rgba(0,0,0,0.14)",
                }}
              >
                💰 Solicitar análise financeira
              </a>
            </div>
          </div>

          <div style={styles.statusGrupo}>
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

            {possuiReposicao && (
              <div style={{ ...styles.status, ...styles.statusReposicao }}>
                <span>↻</span> REPOSIÇÃO
              </div>
            )}

            {possuiCampanhaReposicao && (
              <div style={{ ...styles.status, ...styles.statusCampanha }}>
                <span>★</span> CAMPANHA
              </div>
            )}
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

          <div style={{ borderTop: "1px solid #f0c88f", marginTop: 22, paddingTop: 20 }}>
            <h3 style={{ fontSize: 16, margin: "0 0 14px" }}>Contato e localização</h3>
            {contatos360.length ? contatos360.map((contato, indice) => {
              const fone = contato.telefone.replace(/\D/g, "");
              const zap = contato.whatsapp.replace(/\D/g, "");
              const telefoneBrasil = (n: string) => n.length === 10 || n.length === 11 ? `55${n}` : n;
              const zapValido = zap.length >= 10 && zap.length <= 13;
              const foneValido = fone.length >= 10 && fone.length <= 13;
              const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contato.email);
              const mensagem = encodeURIComponent(`Olá! Sou da equipe comercial Kidy e gostaria de conversar sobre oportunidades para ${cliente.razao}.`);
              return (
                <div key={`${indice}-${contato.nome}-${contato.email}`} style={{ background: "#fff7eb", padding: 14, borderRadius: 12, marginBottom: 10 }}>
                  <div style={styles.infoGrid}>
                    <Info titulo="Responsável / cargo" valor={[contato.nome, contato.cargo].filter(Boolean).join(" — ") || "Não informado"} />
                    <Info titulo="Telefone" valor={contato.telefone || "Não informado"} />
                    <Info titulo="WhatsApp" valor={contato.whatsapp || "Não informado"} />
                    <Info titulo="E-mail" valor={contato.email || "Não informado"} />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
                    {zapValido && <a href={`https://wa.me/${telefoneBrasil(zap)}?text=${mensagem}`} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, textDecoration: "none" }}><MessageCircle size={17} color="#25D366" /><span>WhatsApp</span></a>}
                    {foneValido && <a href={`tel:+${telefoneBrasil(fone)}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, textDecoration: "none" }}><Phone size={17} color="#16803C" /><span>Ligar</span></a>}
                    {emailValido && <a href={`mailto:${contato.email}?subject=${encodeURIComponent("Contato comercial Kidy")}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, textDecoration: "none" }}><Mail size={17} color="#2563EB" /><span>E-mail</span></a>}
                  </div>
                </div>
              );
            }) : <p style={{ color: "#94602e" }}>Nenhum contato cadastrado na base do Drive.</p>}
            <div style={{ marginTop: 14 }}>
              <Info titulo="Endereço" valor={endereco360 || "Não informado"} />
              {endereco360 && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco360)}`} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 10 }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700 }}><MapPin size={17} color="#EA4335" />Abrir rota no Google Maps</span></a>}
            </div>
            {(!contatos360.some(c => c.whatsapp) || !contatos360.some(c => c.email) || !endereco360) && (
              <p style={{ marginTop: 12, fontSize: 12, color: "#9a5700" }}>Cadastro incompleto: verificar WhatsApp, e-mail ou endereço.</p>
            )}
          </div>
        </section>

        <section style={styles.bloco}>
          <div style={styles.blocoTitulo}>Situação cadastral — Receita Federal</div>
          <div style={{fontSize:17,fontWeight:900,color:encerrada?"#b42318":"#3d2300"}}>
            {situacaoReceita.replaceAll("_", " ")}
          </div>
          <p style={{fontSize:12,color:"#815326"}}>
            {cadastro2027 ? `CNPJ: ${cadastro2027.cnpj || "não informado"}` : "Cliente não localizado na base cadastral 2027. Verificar vínculo pelo código."}
          </p>
          {encerrada && <p style={{fontWeight:800,color:"#b42318"}}>EMPRESA ENCERRADA — FORA DA FILA COMERCIAL. Histórico preservado.</p>}
        </section>
        {!["REPRESENTANTE", "REP"].includes(String(usuario.perfil ?? "").toUpperCase()) && (
        <ClassificacaoCliente
          codigo={codigoLimpo}
          iniciais={iniciais}
          sugeridas={sugeridas}
          encerrada={encerrada || !cadastro2027}
          prioridadeInicial={prioridadeGravada}
          prioridadeSugerida={prioridadeCalculada.classificacao}
          pontosPrioridade={prioridadeCalculada.pontos}
          motivosPrioridade={prioridadeCalculada.motivos}
          reativacao={prioridadeCalculada.reativacao}
        />
        )}

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
            titulo="LIMITE APROVADO"
            valor={limiteAprovado360 === null
              ? "Não informado"
              : moeda(limiteAprovado360)}
            detalhe="Limite aprovado"
          />

          <Card
            titulo="LIMITE DE CRÉDITO"
            valor={limiteCredito360 === null
              ? "Não informado"
              : moeda(limiteCredito360)}
            detalhe="Limite de crédito"
          />

          <Card
            titulo="LIMITE DISPONÍVEL"
            valor={moeda(limiteDisponivel360 ?? cliente.limite)}
            detalhe="Limite financeiro disponível"
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


        {/* INTELIGENCIA COMERCIAL 360 */}
        <section style={styles.bloco}>
          <div style={styles.blocoTitulo}>
            Inteligência Comercial do Cliente
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: 14,
            marginTop: 16
          }}>
            <div style={{
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              borderRadius: 12,
              padding: 16
            }}>
              <strong>COMPORTAMENTO DE COMPRA</strong>
              <p style={{lineHeight: 1.7, fontSize: 13}}>
                Última compra: {dataBR(ultimaCompra)}.
                Histórico de {numero(paresHistorico)} pares,
                equivalente a {moeda(valorHistorico)}.
              </p>
              <p style={{lineHeight: 1.7, fontSize: 13}}>
                Em 2026: {numero(paresAno)} pares e
                {" "}{moeda(valorAno)} em vendas.
              </p>
            </div>

            <div style={{
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              borderRadius: 12,
              padding: 16
            }}>
              <strong>CONDIÇÃO FINANCEIRA</strong>
              <p style={{lineHeight: 1.7, fontSize: 13}}>
                Situação: {cliente.bloqueio || "Não informada"}.
              </p>
              <p style={{lineHeight: 1.7, fontSize: 13}}>
                Limite aprovado:{" "}
                {limiteAprovado360 === null
                  ? "Não informado"
                  : moeda(limiteAprovado360)}.
              </p>
              <p style={{lineHeight: 1.7, fontSize: 13}}>
                Limite disponível:{" "}
                {moeda(limiteDisponivel360 ?? cliente.limite)}.
              </p>
            </div>

            <div style={{
              background: "#fff7ed",
              border: "1px solid #fed7aa",
              borderRadius: 12,
              padding: 16
            }}>
              <strong>RECOMENDAÇÃO COMERCIAL</strong>
              <p style={{lineHeight: 1.7, fontSize: 13}}>
                Verificar a necessidade de reposição,
                avaliar oportunidades de ampliação do mix
                e programar o próximo contato comercial.
                Confirmar a condição financeira atual
                antes de formalizar novos pedidos.
              </p>
            </div>
          </div>
        </section>


        {/* HISTÓRICO */}

        <section style={styles.bloco}>

          <div style={styles.blocoTitulo}>
            <span style={styles.numeroSecao}>
              02
            </span>

            Histórico comercial
          </div>

          <div style={{
            marginTop: 22,
            padding: 20,
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 14
          }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>
              Janela de Compra × Faturamento
            </h3>
            <p style={{ color: "#64748b", fontSize: 13 }}>
              Quantidade de pares por mês: entrada pela Data Cadastro e faturamento pela Data Entrega.
            </p>

            {!janelaComercial.disponivel && janelaComercial.meses.every(m => m.entradas === 0 && m.faturamentos === 0) ? (
              <p style={{ color: "#b45309" }}>
                Sem datas de entrada ou faturamento disponíveis para este cliente.
              </p>
            ) : janelaComercial.meses.every(m => m.entradas === 0 && m.faturamentos === 0) ? (
              <p style={{ color: "#64748b" }}>
                Nenhum pedido correspondente encontrado entre
                entrada e faturamento para este cliente.
              </p>
            ) : (
              <>
                <div style={{
                  display: "flex",
                  gap: 18,
                  marginBottom: 18,
                  flexWrap: "wrap",
                  fontSize: 13
                }}>
                  <span style={{ color: "#2563eb" }}>■ Entrada de pares</span>
                  <span style={{ color: "#16a34a" }}>■ Faturamento</span>
                </div>

                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(12, minmax(42px, 1fr))",
                  gap: 8,
                  overflowX: "auto",
                  paddingBottom: 10
                }}>
                  {janelaComercial.meses.map(m => (
                    <div key={m.mes} style={{ textAlign: "center" }}>
                      <div style={{
                        height: 120,
                        display: "flex",
                        alignItems: "flex-end",
                        justifyContent: "center",
                        gap: 3
                      }}>
                        <div
                          title={`Entradas: ${m.entradas}`}
                          style={{
                            width: 15,
                            height: `${Math.max(2, m.entradas / maximoJanela * 100)}%`,
                            background: "#2563eb",
                            borderRadius: "4px 4px 0 0"
                          }}
                        />
                        <div
                          title={`Faturamentos: ${m.faturamentos}`}
                          style={{
                            width: 15,
                            height: `${Math.max(2, m.faturamentos / maximoJanela * 100)}%`,
                            background: "#16a34a",
                            borderRadius: "4px 4px 0 0"
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 11, marginTop: 7 }}>
                        {m.mes}
                      </div>
                    </div>
                  ))}
                </div>

                <p style={{
                  fontSize: 12,
                  color: "#64748b",
                  marginTop: 14
                }}>
                  {janelaComercial.pedidosComparados} pares de entrada.
                  Faturamento disponível nos anos:{" "}
                  {janelaComercial.anosFaturamento.join(", ")}.
                  As barras representam a quantidade de pares por mês,
                  não valores financeiros.
                </p>
              </>
            )}
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

        {/* RESUMO ESCRITO DO HISTORICO COMERCIAL */}
        <section style={styles.bloco}>
          <div style={styles.blocoTitulo}>
            Análise Escrita — Entrada × Faturamento
          </div>

          <p style={{fontSize: 13, lineHeight: 1.7}}>
            A tabela apresenta pares por mês
            de entrada e pares
            por mês de faturamento, considerando os anos
            disponíveis na base.
          </p>

          <div style={{overflowX: "auto", marginTop: 14}}>
            <table style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13
            }}>
              <thead>
                <tr style={{background: "#fff1db"}}>
                  <th style={{padding: 10, textAlign: "left"}}>Mês</th>
                  <th style={{padding: 10, textAlign: "right"}}>
                    Entrada
                  </th>
                  <th style={{padding: 10, textAlign: "right"}}>
                    Faturamento
                  </th>
                </tr>
              </thead>
              <tbody>
                {janelaComercial.meses.map(m => (
                  <tr key={`analise-${m.mes}`}
                    style={{borderBottom: "1px solid #f0e0cd"}}>
                    <td style={{padding: 10}}>{m.mes}</td>
                    <td style={{padding: 10, textAlign: "right"}}>
                      {numero(m.entradas)}
                    </td>
                    <td style={{padding: 10, textAlign: "right"}}>
                      {numero(m.faturamentos)}
                    </td>
                  </tr>
                ))}
                <tr style={{fontWeight: 800, background: "#fff7ed"}}>
                  <td style={{padding: 10}}>TOTAL</td>
                  <td style={{padding: 10, textAlign: "right"}}>
                    {numero(janelaComercial.meses.reduce(
                      (s, m) => s + m.entradas, 0
                    ))}
                  </td>
                  <td style={{padding: 10, textAlign: "right"}}>
                    {numero(janelaComercial.meses.reduce(
                      (s, m) => s + m.faturamentos, 0
                    ))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p style={{
            fontSize: 12,
            lineHeight: 1.7,
            marginTop: 12
          }}>
            <strong>Maior volume de entrada:</strong>{" "}
            {[...janelaComercial.meses]
              .filter(m => m.entradas > 0)
              .sort((a, b) => b.entradas - a.entradas)
              .slice(0, 1)
              .map(m => `${m.mes} (${numero(m.entradas)} pares)`)
              .join("") || "Sem registros"}.
            {" "}
            <strong>Maior volume de faturamento:</strong>{" "}
            {[...janelaComercial.meses]
              .filter(m => m.faturamentos > 0)
              .sort((a, b) => b.faturamentos - a.faturamentos)
              .slice(0, 1)
              .map(m => `${m.mes} (${numero(m.faturamentos)} pares)`)
              .join("") || "Sem registros"}.
          </p>

          <p style={{fontSize: 11, opacity: 0.7}}>
            Um pedido faturado em meses diferentes pode ser
            contado uma vez em cada mês. Os totais não
            representam valores financeiros nem saldo em aberto.
          </p>
        </section>

        {possuiReposicao && (
          <section style={{ ...styles.bloco, ...styles.blocoReposicao }}>
            <div style={styles.blocoTitulo}>
              <span style={{ ...styles.numeroSecao, ...styles.numeroReposicao }}>↻</span>
              Reposição recomendada
              <span style={styles.contadorReposicao}>
                {reposicoesComCampanha.length} referência{reposicoesComCampanha.length === 1 ? "" : "s"}
              </span>
            </div>

            <div style={styles.reposicaoResumo}>
              Referências que este cliente já comprou e cuja última compra ocorreu entre 91 e 180 dias atrás.
              {possuiCampanhaReposicao && (
                <> As referências com campanha ativa estão sinalizadas para apoiar a abordagem comercial.</>
              )}
            </div>

            <div style={styles.tableWrap}>
              <table style={styles.tabela}>
                <thead>
                  <tr>
                    <th style={styles.th}>Referência</th>
                    <th style={styles.th}>Produto</th>
                    <th style={styles.th}>Linha</th>
                    <th style={styles.thRight}>Última compra</th>
                    <th style={styles.thRight}>Dias</th>
                    <th style={styles.th}>Campanha</th>
                  </tr>
                </thead>
                <tbody>
                  {reposicoesComCampanha.slice(0, 20).map((r) => (
                    <tr key={`reposicao-${r.referencia}-${r.codigoLinha}`}>
                      <td style={styles.td}>
                        <strong>{r.referencia}</strong>
                        <div style={styles.badgeReposicaoInline}>↻ REPOSIÇÃO</div>
                      </td>
                      <td style={styles.td}>
                        <strong>{r.nomeReferencia || "Nome não localizado"}</strong>
                      </td>
                      <td style={styles.td}>{r.linha}</td>
                      <td style={styles.tdRight}>{dataBR(r.ultimaCompra)}</td>
                      <td style={styles.tdRight}>
                        <strong>{numero(r.diasSemCompra || 0)}</strong>
                      </td>
                      <td style={styles.td}>
                        {r.campanhas.length ? (
                          <div style={styles.campanhasReposicao}>
                            {r.campanhas.map((campanha) => (
                              <span key={campanha} style={styles.badgeCampanhaInline}>★ {campanha}</span>
                            ))}
                          </div>
                        ) : (
                          <span style={styles.semCampanha}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {!encerrada && <>
        {/* PRODUTOS COM POTENCIAL - MOTOR V4 */}
        <ProdutosPotencialAbas abas={abasPotencialV4} />

        {/* RESULTADO DO ATENDIMENTO */}
        <GestaoReativacao codigoCliente={cliente.codigo} razaoSocial={razaoSocial360} cnpj={cadastro2027?.cnpj ?? ""} />
        <section style={styles.preditiva}>
          <div>
            <div style={styles.eyebrowBranco}>INTELIGÊNCIA COMERCIAL</div>
            <h2 style={styles.preditivaTitulo}>Próxima ação sugerida</h2>
            <p style={styles.preditivaTexto}>
              {principalPotencial
                ? `Trabalhar ${principalPotencial.linha}. O cliente ainda não possui histórico nessa linha, enquanto ${principalPotencial.penetracao.toFixed(0)}% dos ${grupoSimilar.length} clientes semelhantes compram. Como referência de abordagem, o grupo apresenta mediana de ${numero(principalPotencial.paresMedianos)} pares${referenciasAutorizadasSugestao.length ? `, priorizando as referências atualmente autorizadas ${referenciasAutorizadasSugestao.slice(0, 3).map((r) => r.referencia).join(", ")}` : ""}.`
                : "Priorize as linhas de maior score comercial e as referências com histórico mais consistente para este cliente."}
            </p>
          </div>
          <div style={styles.preditivaIcone}>✦</div>
        </section>
        </>}


        <ExportarCliente360PDF codigoCliente={codigoLimpo} />
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

  statusGrupo: {
    display: "flex",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: "8px",
  },

  statusReposicao: { color: "#9a5700", background: "#fff0c2" },
  statusCampanha: { color: "#7a3e00", background: "#ffe0a3" },
  blocoReposicao: { border: "2px solid #f2a43b", background: "#fffaf0" },
  numeroReposicao: { color: "#4c2a00", fontSize: "16px" },
  contadorReposicao: { marginLeft: "auto", fontSize: "11px", color: "#a15c18", fontWeight: 800 },
  reposicaoResumo: { marginBottom: "16px", padding: "12px 14px", borderRadius: "12px", background: "#fff1d8", color: "#805328", fontSize: "12px", lineHeight: 1.5 },
  badgeReposicaoInline: { display: "inline-block", marginTop: "5px", padding: "3px 7px", borderRadius: "999px", background: "#fff0c2", color: "#9a5700", fontSize: "8px", fontWeight: 900 },
  campanhasReposicao: { display: "flex", flexWrap: "wrap", gap: "5px" },
  badgeCampanhaInline: { display: "inline-block", padding: "4px 7px", borderRadius: "999px", background: "#dff5eb", color: "#0d7652", fontSize: "9px", fontWeight: 900, whiteSpace: "nowrap" },
  semCampanha: { color: "#b49777" },

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

  refAutorizada: {
    display: "flex",
    justifyContent: "space-between",
    gap: "14px",
    padding: "12px 0",
    borderBottom: "1px solid #f2dfc6",
    color: "#68421f",
  },

  refPerformance: {
    minWidth: "130px",
    textAlign: "right",
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    fontSize: "10px",
    color: "#9b6c3f",
  },

  campanhaCard: {
    padding: "12px 0",
    borderBottom: "1px solid #f2dfc6",
    color: "#68421f",
    fontSize: "11px",
    lineHeight: 1.45,
  },

  campanhaTopo: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    marginBottom: "6px",
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