import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validarToken } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { credenciais } from "@/lib/campanha-treinamento-seguro";
import { representantesPermitidos, regionaisPermitidas } from "@/lib/escopo-acesso";
import { carregarMapaRepresentantes, normalizarRepresentante } from "@/lib/representantes-oficiais";


export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAMPANHA = "CONQUISTE_AMOSTRA_2027";
const cod = (v: unknown) => String(v ?? "").trim().replace(/\.0+$/, "");
const competenciaValida = (v: string) => /^2026-11-01$|^2026-12-01$|^2027-0[1-4]-01$/.test(v);

type Linha = {
  campanha: string;
  competencia: string;
  origem: string;
  modalidade: string;
  codigo_representante: string;
  representante_nome: string | null;
  codigo_supervisor: string | null;
  meta_pares: number | string;
  meta_valor: number | string;
  realizado_pares: number | string | null;
  realizado_valor: number | string | null;
  status_dados: string;
};

export async function GET(request: NextRequest) {
  try {
    const token = (await cookies()).get("kidy_session")?.value;
    if (!token) return NextResponse.json({ erro: "Nao autenticado" }, { status: 401 });
    const usuario = await validarToken(token);
    if (!usuario) return NextResponse.json({ erro: "Sessao invalida" }, { status: 401 });

    const q = request.nextUrl.searchParams;
    const competencia = q.get("competencia") ?? "2026-11-01";
    const supervisor = cod(q.get("supervisor"));
    const representante = cod(q.get("representante"));
    if (!competenciaValida(competencia)) {
      return NextResponse.json({ erro: "Competencia fora do periodo da campanha" }, { status: 400 });
    }

    const permitidos = await representantesPermitidos(usuario);
    if (permitidos !== null && permitidos.length === 0) {
      return NextResponse.json({ erro: "Sem representantes autorizados" }, { status: 403 });
    }
    if (representante && permitidos !== null && !permitidos.includes(representante)) {
      return NextResponse.json({ erro: "Representante fora do seu escopo" }, { status: 403 });
    }

    const regionais = await regionaisPermitidas(usuario);
    if (supervisor && regionais !== null && !regionais.has(supervisor)) {
      return NextResponse.json({ erro: "Supervisor fora do seu escopo" }, { status: 403 });
    }

    const mapaOficial = await carregarMapaRepresentantes();

    const cadastroVisivel = [...mapaOficial.cadastro.values()]
      .filter(r =>
        r.ativo &&
        Boolean(cod(r.codigo_supervisor)) &&
        (permitidos === null || permitidos.includes(cod(r.codigo_rep))) &&
        (
          ["REPRESENTANTE", "REP"].includes(
            String(usuario.perfil ?? "").trim().toUpperCase()
          ) ||
          regionais === null ||
          regionais.has(cod(r.codigo_supervisor))
        )
      );

    const oficiais = new Map(
      cadastroVisivel.map(r => [cod(r.codigo_rep), r])
    );

    const supervisoresDisponiveis = [
      ...new Set(cadastroVisivel.map(r => cod(r.codigo_supervisor)))
    ].sort();

    if (supervisor && !supervisoresDisponiveis.includes(supervisor)) {
      return NextResponse.json(
        { erro: "Supervisor fora do cadastro ou escopo" },
        { status: 403 }
      );
    }

    if (representante) {
      const atual = oficiais.get(representante);

      if (
        !atual ||
        (supervisor && cod(atual.codigo_supervisor) !== supervisor)
      ) {
        return NextResponse.json(
          { erro: "Representante fora da regional ou escopo" },
          { status: 403 }
        );
      }
    }

    let consulta = supabase
      .from("kidy_campanha_painel_base")
      .select("campanha,competencia,origem,modalidade,codigo_representante,representante_nome,codigo_supervisor,meta_pares,meta_valor,realizado_pares,realizado_valor,status_dados")
      .eq("campanha", CAMPANHA)
      .eq("competencia", competencia)
      .order("codigo_representante", { ascending: true })
      .range(0, 999);

    // Os filtros sao aplicados apos normalizar o historico.

    const { data, error } = await consulta;
    if (error) throw new Error(`Consulta do painel: ${error.message}`);
    const linhas = (data ?? []) as Linha[];
    if (linhas.length === 1000) throw new Error("Limite de consulta atingido. Implementar paginacao antes de exibir totais.");

    const visiveis = linhas.flatMap(r => {
      const codigoAtual = normalizarRepresentante(
        cod(r.codigo_representante),
        mapaOficial
      ).codigo;

      const oficial = oficiais.get(codigoAtual);
      if (!oficial) return [];

      const supAtual = cod(oficial.codigo_supervisor);

      if (supervisor && supAtual !== supervisor) return [];
      if (representante && codigoAtual !== representante) return [];

      return [{
        ...r,
        codigo_representante: codigoAtual,
        representante_nome: oficial.nome_rep || r.representante_nome,
        codigo_supervisor: supAtual,
      }];
    });

    // Visao nacional: inclui movimentos sem meta.
    // Visao restrita: preserva escopo de acesso existente.
    const visaoNacional =
      permitidos === null &&
      regionais === null &&
      !supervisor &&
      !representante;

    const visiveisComerciais = visaoNacional
      ? linhas
      : visiveis;

    console.log("[CAMPANHA DIAGNOSTICO]", {
      competencia,
      linhasSupabase: linhas.length,
      cadastroTotal: mapaOficial.cadastro.size,
      cadastroVisivel: cadastroVisivel.length,
      representantesOficiais: oficiais.size,
      representantesPermitidos: permitidos === null ? "SEM_RESTRICAO" : permitidos.length,
      regionaisPermitidas: regionais === null ? "SEM_RESTRICAO" : [...regionais],
      supervisorFiltro: supervisor,
      representanteFiltro: representante,
      linhasVisiveis: visiveis.length,
      linhasComerciais: visiveisComerciais.length,
      visaoNacional
    });
    const indicadores = [
      {
        chave: "PRODUCAO",
        origem: "ENTRADA",
        modalidade: "PRODUCAO",
        titulo: "Entrada Producao",
        pontos: 60
      },
      {
        chave: "FATURAMENTO",
        origem: "FATURAMENTO",
        modalidade: "TOTAL",
        titulo: "Faturamento",
        pontos: 60
      },
      {
        chave: "KIDEX",
        origem: "ENTRADA",
        modalidade: "KIDEX",
        titulo: "Entrada Kidex",
        pontos: 20
      }
    ].map((indicador) => {

      const itens = visiveisComerciais.filter(
        (l) =>
          l.origem === indicador.origem &&
          l.modalidade === indicador.modalidade
      );

      const itensComMeta = itens.filter(
        (l) => l.status_dados !== "SEM_META"
      );

      const itensComRealizado = itens.filter(
        (l) =>
          l.realizado_pares !== null &&
          l.realizado_valor !== null
      );

      const completos =
        itensComMeta.length > 0 &&
        itensComMeta.every(
          (l) =>
            l.status_dados !== "SEM_DADOS" &&
            l.realizado_pares !== null &&
            l.realizado_valor !== null
        );

      const metaPares = itensComMeta.reduce(
        (total, l) =>
          total + Number(l.meta_pares || 0),
        0
      );

      const metaValor = itensComMeta.reduce(
        (total, l) =>
          total + Number(l.meta_valor || 0),
        0
      );

      const realizadoPares =
        itensComRealizado.length > 0
          ? itensComRealizado.reduce(
              (total, l) =>
                total + Number(l.realizado_pares || 0),
              0
            )
          : null;

      const realizadoValor =
        itensComRealizado.length > 0
          ? itensComRealizado.reduce(
              (total, l) =>
                total + Number(l.realizado_valor || 0),
              0
            )
          : null;

      return {
        ...indicador,
        pontosProjetados: 0,

        representantes: new Set(
          itensComMeta.map(
            (l) => cod(l.codigo_representante)
          )
        ).size,

        metaPares,
        metaValor,
        realizadoPares,
        realizadoValor,

        percentualPares:
          realizadoPares === null || metaPares <= 0
            ? null
            : 100 * realizadoPares / metaPares,

        percentualValor:
          realizadoValor === null || metaValor <= 0
            ? null
            : 100 * realizadoValor / metaValor,

        status: completos
          ? "PARCIAL_NAO_HOMOLOGADO"
          : itensComRealizado.length > 0
            ? "INCOMPLETO_NAO_HOMOLOGADO"
            : "AGUARDANDO_DADOS",

        pontosConcedidos: 0
      };
    });
    // Pontos de treinamento: apenas registros oficiais homologados, sem testes.
    // A pontuacao global da campanha continua bloqueada ate as outras categorias estarem homologadas.
    const {base: hBase, headers: hHeaders} = credenciais();
    const hUrl = new URL(`${hBase}/rest/v1/kidy_campanha_treinamentos_homologacao`);
    hUrl.searchParams.set("select", "treinamento_id,kidy_campanha_treinamentos!inner(campanha,competencia,codigo_representante,codigo_supervisor_snapshot,status)");
    hUrl.searchParams.set("kidy_campanha_treinamentos.campanha", `eq.${CAMPANHA}`);
    hUrl.searchParams.set("kidy_campanha_treinamentos.competencia", `eq.${competencia}`);
    hUrl.searchParams.set("limit", "1000");
    const hRes = await fetch(hUrl, {headers:hHeaders,cache:'no-store'});
    if(!hRes.ok) throw new Error(`Consulta homologacoes: ${hRes.status}. Execute o SQL 01_homologacao.sql.`);
    const homs = await hRes.json() as unknown[];
    if (homs.length === 1000) throw new Error("Limite de homologacoes atingido; implementar paginacao.");
    const contagemPorRep = new Map<string, number>();
    for (const row of homs as Array<{kidy_campanha_treinamentos: {
      campanha:string; competencia:string; codigo_representante:string; codigo_supervisor_snapshot:string|null; status:string
    }}>) {
      const t = row.kidy_campanha_treinamentos;
      if (!t || t.status !== "APROVADO") continue;
      const rep = normalizarRepresentante(
        cod(t.codigo_representante),
        mapaOficial
      ).codigo;

      const oficial = oficiais.get(rep);
      if (!oficial) continue;

      if (representante && rep !== representante) continue;
      if (supervisor && cod(oficial.codigo_supervisor) !== supervisor) continue;
      contagemPorRep.set(rep, (contagemPorRep.get(rep) ?? 0) + 1);
    }
    const treinamentosValidos = [...contagemPorRep.values()].reduce((total, n) => total + Math.min(n, 5), 0);
    const pontosTreinamentos = treinamentosValidos * 6;
    const qtdRepresentantes = new Set(visiveis.map(r => cod(r.codigo_representante))).size;
    indicadores.push({
      chave: "TREINAMENTOS", titulo: "Treinamentos", pontos: 30,
      origem: "TREINAMENTOS", modalidade: "QUANTIDADE", representantes: qtdRepresentantes,
      metaPares: 5 * qtdRepresentantes, metaValor: 0,
      realizadoPares: treinamentosValidos, realizadoValor: 0,
      percentualPares: qtdRepresentantes ? 100 * treinamentosValidos / (5 * qtdRepresentantes) : null,
      percentualValor: null, status: "HOMOLOGADO_PARCIAL",
      pontosConcedidos: pontosTreinamentos,
      pontosProjetados: 0,
    });


    // Eventos de pedidos detectados. Nao sao pontos homologados.
    type Reat = {
      codigo_cliente: string;
      codigo_representante: string;
      codigo_supervisor: string;
      confirmado: boolean;
    };

    const eventos: Reat[] = [];

    for (let offset = 0; offset < 20000; offset += 1000) {
      const { data: lote, error: erroReat } = await supabase
        .from("kidy_reativacao_eventos")
        .select("codigo_cliente,codigo_representante,codigo_supervisor,confirmado")
        .eq("competencia", competencia)
        .order("codigo_cliente")
        .order("codigo_representante")
        .range(offset, offset + 999);

      if (erroReat) throw new Error(
        `Eventos de reativacao: ${erroReat.message}`
      );

      eventos.push(...((lote ?? []) as Reat[]));

      if ((lote ?? []).length < 1000) break;
      if (offset >= 19000) throw Error("Limite de eventos atingido");
    }

    const consultaNacional =
      permitidos === null &&
      regionais === null &&
      !representante &&
      !supervisor;

    const aptos = eventos.filter(e => {
      const rep = normalizarRepresentante(
        cod(e.codigo_representante), mapaOficial
      ).codigo;

      if (consultaNacional) return true;

      const oficial = oficiais.get(rep);
      if (!oficial) return false;

      const supAtual = cod(oficial.codigo_supervisor);

      return (!representante || representante === rep) &&
        (!supervisor || supervisor === supAtual) &&
        (permitidos === null || permitidos.includes(rep)) &&
        (regionais === null || regionais.has(supAtual));
    });

    const clientesDetectados = new Set(
      aptos.map(e => cod(e.codigo_cliente))
    ).size;

    // METAS OFICIAIS DE REATIVACAO - SUPABASE
    // Excel: META REATIVICAO.xlsx
    // Arredondamento normal ja aplicado na tabela.
    type MetaOficial = {
      codigo_representante: string;
      meta_clientes: number | null;
    };

    const metasOficiais: MetaOficial[] = [];

    for (let offset = 0; offset < 10000; offset += 500) {
      const { data: lote, error: erroMeta } = await supabase
        .from("kidy_campanha_metas_reativacao")
        .select("codigo_representante,meta_clientes")
        .eq("campanha", CAMPANHA)
        .eq("competencia", competencia)
        .order("codigo_representante")
        .range(offset, offset + 499);

      if (erroMeta) {
        throw new Error(`Falha nas metas de reativacao: ${erroMeta.message}`);
      }

      metasOficiais.push(...((lote ?? []) as MetaOficial[]));

      if ((lote ?? []).length < 500) break;

      if (offset >= 9500) {
        throw new Error("Limite de metas atingido.");
      }
    }


    // Metas independentes dos realizados comerciais.
    // Assim, os seis meses aparecem mesmo sem pedidos.
    const codigosVisiveis = new Set(
      cadastroVisivel
        .filter(r =>
          (!representante ||
            cod(r.codigo_rep) === representante) &&
          (!supervisor ||
            cod(r.codigo_supervisor) === supervisor)
        )
        .map(r => cod(r.codigo_rep))
        .filter(Boolean)
    );

    const metasPorRepresentante = new Map<string, number>();

    for (const linha of metasOficiais) {
      const rep = normalizarRepresentante(
        cod(linha.codigo_representante),
        mapaOficial
      ).codigo;

      if (!codigosVisiveis.has(rep)) continue;

      const meta = Number(linha.meta_clientes);

      if (
        linha.meta_clientes === null ||
        !Number.isInteger(meta) ||
        meta < 0
      ) {
        throw new Error(`Meta invalida do representante ${rep}`);
      }

      if (metasPorRepresentante.has(rep)) {
        throw new Error(`Meta duplicada para representante ${rep}`);
      }

      metasPorRepresentante.set(rep, meta);
    }

    const codigosComMeta = [...metasPorRepresentante.keys()];

    const metaReativacao = [...metasPorRepresentante.values()]
      .reduce((total, valor) => total + valor, 0);

    console.log("[CAMPANHA METAS REATIVACAO]", {
      competencia,
      representante,
      supervisor,
      representantesComMeta: codigosComMeta.length,
      metaOficial: metaReativacao,
      detectados: clientesDetectados
    });


    // Uma reativacao por codigo de cliente e representante.
    // Os pedidos repetidos nao multiplicam pontos.
    const clientesPorRep = new Map<string, Set<string>>();
    const clientesConfirmadosPorRep = new Map<string, Set<string>>();

    for (const evento of aptos) {
      const rep = normalizarRepresentante(
        cod(evento.codigo_representante),
        mapaOficial
      ).codigo;

      if (!metasPorRepresentante.has(rep)) continue;

      if (!clientesPorRep.has(rep)) {
        clientesPorRep.set(rep, new Set<string>());
      }

      clientesPorRep.get(rep)!.add(
        cod(evento.codigo_cliente)
      );

      if (evento.confirmado) {
        if (!clientesConfirmadosPorRep.has(rep)) {
          clientesConfirmadosPorRep.set(rep, new Set<string>());
        }
        clientesConfirmadosPorRep.get(rep)!.add(
          cod(evento.codigo_cliente)
        );
      }
    }

    // 100% da meta = 30 pontos. Abaixo = zero.
    // Nunca conceder pontos fracionados.
    const pontosProjetadosReativacao =
      [...metasPorRepresentante.entries()].reduce(
        (total, [rep, meta]) => {
          const quantidade = clientesPorRep.get(rep)?.size ?? 0;
          return total + (
            meta > 0 && quantidade >= meta ? 30 : 0
          );
        },
        0
      );

    // Pontuacao oficial somente com eventos confirmados
    // e competencia validada.
    const { data: validacaoMes, error: erroValidacao } =
      await supabase
        .from("kidy_reativacao_competencias")
        .select("status")
        .eq("competencia", competencia)
        .maybeSingle();

    if (erroValidacao) {
      throw new Error(erroValidacao.message);
    }

    const competenciaHomologada =
      String(validacaoMes?.status ?? "").toUpperCase() ===
      "VALIDADO";

    const pontosHomologadosReativacao =
      competenciaHomologada
        ? [...metasPorRepresentante.entries()].reduce(
            (total, [rep, meta]) => {
              const quantidade =
                clientesConfirmadosPorRep.get(rep)?.size ?? 0;
              return total + (
                meta > 0 && quantidade >= meta ? 30 : 0
              );
            },
            0
          )
        : 0;

    indicadores.push({
      chave:"REATIVACAO",titulo:"Reativação",pontos:30,
      origem:"REATIVACAO",modalidade:"CLIENTES",
      representantes:codigosComMeta.length,
      metaPares:metaReativacao,metaValor:0,realizadoPares:clientesDetectados,realizadoValor:0,
      percentualPares:metaReativacao > 0 ? 100 * clientesDetectados / metaReativacao : null,
      percentualValor:null,
      status:"DETECTADO_NAO_HOMOLOGADO",pontosConcedidos:pontosHomologadosReativacao,pontosProjetados:pontosProjetadosReativacao,
    });

    const opcoes = cadastroVisivel
      .filter(r =>
        !supervisor || cod(r.codigo_supervisor) === supervisor
      )
      .map(r => ({
        codigo: cod(r.codigo_rep),
        nome: r.nome_rep || cod(r.codigo_rep)
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    const supervisores = supervisoresDisponiveis;

    return NextResponse.json({
      campanha: CAMPANHA, competencia,
      filtros: { supervisor, representante, supervisores, representantes: opcoes },
      indicadores,
      pendentes: indicadores.some(i => i.chave === "REATIVACAO") ? [] : ["REATIVACAO"],
      pontuacao: { concedida: 0, disponivel: false, motivo: "Realizados e regras de premiacao ainda nao homologados" },
      avisos: ["Metas extraidas do historico oficial do Supabase.", "Sem dados nao significa zero vendas.", "Pontuacao bloqueada ate homologacao e fechamento."],
    });
  } catch (err) {
    console.error("[API CAMPANHA]", err);
    return NextResponse.json({ erro: "Nao foi possivel carregar a campanha. Verifique permissoes do Supabase e logs do servidor." }, { status: 500 });
  }
}
