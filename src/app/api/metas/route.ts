
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validarToken } from "@/lib/auth";
import { responderKidex } from "@/lib/kidex-api";

import {
  carregarMetas,
  carregarRealizado,
  carregarRealizadoAA,
  type TipoMeta,
  type PeriodicidadeMeta,
  type RegistroMeta,
  type RegistroRealizado,
} from "@/lib/metas-data";

import {
  calcularIndicador,
  calcularMetaSemanaEntreMeses,
} from "@/lib/metas-calculos";

import {
  carregarMapaRepresentantes,
  normalizarRepresentante,
  type MapaRepresentantes,
} from "@/lib/representantes-oficiais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function codigo(valor: unknown): string {
  return String(valor ?? "").trim().replace(/\.0+$/, "");
}

function dataUTC(ano: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function dataValida(valor: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;

  const data = new Date(`${valor}T00:00:00Z`);

  return Number.isNaN(data.getTime()) ||
    data.toISOString().slice(0, 10) !== valor
    ? null
    : data;
}

function extrairPeriodo(texto: string) {
  const datas = texto.match(/\d{2}\/\d{2}\/\d{4}/g);

  if (!datas || datas.length < 2) return null;

  const converter = (valor: string): Date | null => {
    const [dia, mes, ano] = valor.split("/").map(Number);
    const data = dataUTC(ano, mes, dia);

    return data.getUTCFullYear() === ano &&
      data.getUTCMonth() + 1 === mes &&
      data.getUTCDate() === dia
      ? data
      : null;
  };

  const inicio = converter(datas[0]);
  const fim = converter(datas[1]);

  if (!inicio || !fim || inicio > fim) return null;

  return { inicio, fim };
}

function supervisoresDaFonte(
  tipo: TipoMeta,
  periodicidade: PeriodicidadeMeta,
  filtros: string
): Set<string> | null {
  if (tipo !== "FATURAMENTO" || periodicidade !== "MENSAL") {
    return null;
  }

  const trecho = filtros.match(
    /Codigo Supervisor:\s*([^;|]+)/i
  );

  if (!trecho) return null;

  const valores = trecho[1]
    .split(",")
    .map(codigo)
    .filter((valor) => /^\d+$/.test(valor));

  return valores.length ? new Set(valores) : null;
}

function normalizarMeta(
  item: RegistroMeta,
  mapa: MapaRepresentantes
): RegistroMeta {
  const oficial = normalizarRepresentante(
    item.codigoRepresentante,
    mapa
  );

  return {
    ...item,
    codigoRepresentante: oficial.codigo,
    representante:
      mapa.cadastro.get(oficial.codigo)?.nome_rep ||
      item.representante,
  };
}

function normalizarRealizado(
  item: RegistroRealizado,
  mapa: MapaRepresentantes
): RegistroRealizado {
  const oficial = normalizarRepresentante(
    item.codigoRepresentante,
    mapa
  );

  return {
    ...item,
    codigoRepresentante: oficial.codigo,
    representante:
      mapa.cadastro.get(oficial.codigo)?.nome_rep ||
      item.representante,
    supervisor: oficial.supervisor || item.supervisor,
  };
}

function somar(
  registros: Array<{ quantidade: number; valor: number }>
) {
  return registros.reduce(
    (total, item) => ({
      pares: total.pares + item.quantidade,
      valores: total.valores + item.valor,
    }),
    { pares: 0, valores: 0 }
  );
}

function calcularMetaPeriodo(
  registros: RegistroMeta[],
  periodicidade: PeriodicidadeMeta,
  inicio: Date,
  fim: Date
) {
  if (periodicidade === "MENSAL") {
    return somar(registros);
  }

  return {
    pares: calcularMetaSemanaEntreMeses(
      registros.map((item) => ({
        ano: item.ano,
        mes: item.mes,
        meta: item.quantidade,
      })),
      inicio,
      fim
    ),
    valores: calcularMetaSemanaEntreMeses(
      registros.map((item) => ({
        ano: item.ano,
        mes: item.mes,
        meta: item.valor,
      })),
      inicio,
      fim
    ),
  };
}

export async function GET(req: NextRequest) {
  try {
    const token = (await cookies()).get("kidy_session")?.value;

    if (!token) {
      return NextResponse.json(
        { erro: "Não autenticado" },
        { status: 401 }
      );
    }

    const usuario: any = await validarToken(token);

    if (!usuario) {
      return NextResponse.json(
        { erro: "Sessão inválida" },
        { status: 401 }
      );
    }

    const params = req.nextUrl.searchParams;

    const tipo = params.get("tipo") || "FATURAMENTO";
    const periodicidade =
      params.get("periodicidade") || "MENSAL";
    const pedido = params.get("pedido") || "TODOS";
    const representante = codigo(params.get("representante"));
    const regionalFiltro = codigo(params.get("regional"));

    if (tipo === "KIDEX") {
      try {
        return await responderKidex(req, usuario);
      } catch (erro) {
        console.error("[KIDEX]", erro);
        return NextResponse.json({ erro: erro instanceof Error ? erro.message : "Falha ao carregar KIDEX" }, { status: 422 });
      }
    }

    if (!["FATURAMENTO", "ENTRADA"].includes(tipo)) {
      return NextResponse.json(
        { erro: "Tipo de indicador inválido" },
        { status: 400 }
      );
    }

    if (!["MENSAL", "SEMANAL"].includes(periodicidade)) {
      return NextResponse.json(
        { erro: "Periodicidade inválida" },
        { status: 400 }
      );
    }

    if (!["TODOS", "1", "4"].includes(pedido)) {
      return NextResponse.json(
        { erro: "Tipo de pedido inválido" },
        { status: 400 }
      );
    }

    // O realizado não possui separação por tipo de pedido.
    if (pedido !== "TODOS") {
      return NextResponse.json(
        {
          erro:
            "O realizado está consolidado. Não é possível " +
            "comparar Produção ou Kidex separadamente " +
            "sem uma fonte de realizado segmentada.",
        },
        { status: 422 }
      );
    }

    const tipoValidado = tipo as TipoMeta;
    const periodoValidado =
      periodicidade as PeriodicidadeMeta;

    const perfil = String(
      usuario.perfil || ""
    ).toUpperCase();

    const mapa = await carregarMapaRepresentantes();

    const codigoLogin = codigo(
      usuario.codigo_representante || usuario.usuario
    );

    const representanteLogin = /^\d+$/.test(codigoLogin)
      ? normalizarRepresentante(codigoLogin, mapa).codigo
      : "";

    if (
      perfil === "REPRESENTANTE" &&
      !mapa.cadastro.has(representanteLogin)
    ) {
      return NextResponse.json(
        { erro: "Representante não vinculado ao usuário" },
        { status: 403 }
      );
    }

    const representanteFiltro = representante
      ? normalizarRepresentante(representante, mapa).codigo
      : "";

    const [metasOriginais, fonte, fonteAA] = await Promise.all([
      carregarMetas(tipoValidado),
      carregarRealizado(tipoValidado, periodoValidado),
      carregarRealizadoAA(tipoValidado, periodoValidado),
    ]);

    const periodoFonte = extrairPeriodo(
      fonte.periodoOriginal
    );

    if (!periodoFonte) {
      return NextResponse.json(
        {
          erro: "Período do relatório não identificado",
          fonte: fonte.arquivo,
          aba: fonte.aba,
          periodoOriginal: fonte.periodoOriginal,
        },
        { status: 422 }
      );
    }

    const { inicio, fim } = periodoFonte;

    // No faturamento, as colunas AA já pertencem ao
    // mesmo relatório e período da fonte atual.
    // Na entrada, o relatório anterior deve corresponder
    // ao mesmo mês do ano anterior.
    let fonteAAValidada = fonteAA;

    if (fonteAA && tipoValidado === "ENTRADA") {
      const periodoAA = extrairPeriodo(fonteAA.periodoOriginal);

      const periodoCompativel =
        periodoAA !== null &&
        periodoAA.inicio.getUTCFullYear() ===
          inicio.getUTCFullYear() - 1 &&
        periodoAA.fim.getUTCFullYear() ===
          fim.getUTCFullYear() - 1 &&
        periodoAA.inicio.getUTCMonth() ===
          inicio.getUTCMonth() &&
        periodoAA.fim.getUTCMonth() ===
          fim.getUTCMonth() &&
        periodoAA.inicio.getUTCDate() ===
          inicio.getUTCDate() &&
        periodoAA.fim.getUTCDate() ===
          fim.getUTCDate();

      if (!periodoCompativel) {
        fonteAAValidada = null;
      }
    }

    if (
      periodoValidado === "MENSAL" &&
      (
        inicio.getUTCFullYear() !== fim.getUTCFullYear() ||
        inicio.getUTCMonth() !== fim.getUTCMonth()
      )
    ) {
      return NextResponse.json(
        { erro: "O relatório mensal contém mais de um mês" },
        { status: 422 }
      );
    }

    const inicioSolicitado = params.get("inicio");
    const fimSolicitado = params.get("fim");

    if (inicioSolicitado || fimSolicitado) {
      const inicioFiltro = dataValida(
        inicioSolicitado || ""
      );
      const fimFiltro = dataValida(
        fimSolicitado || ""
      );

      if (!inicioFiltro || !fimFiltro) {
        return NextResponse.json(
          { erro: "Informe inicio e fim em AAAA-MM-DD" },
          { status: 400 }
        );
      }

      if (
        inicioFiltro.getTime() !== inicio.getTime() ||
        fimFiltro.getTime() !== fim.getTime()
      ) {
        return NextResponse.json(
          {
            erro:
              "O período solicitado não corresponde " +
              "ao relatório disponível.",
            periodoDisponivel: fonte.periodoOriginal,
          },
          { status: 422 }
        );
      }
    }

    const supervisoresPermitidos = supervisoresDaFonte(
      tipoValidado,
      periodoValidado,
      fonte.filtrosOriginais
    );

    // Regionais e representantes seguem a planilha de metas.
    // O De/Para identifica o codigo oficial do representante.
    const regionaisDisponiveis = new Map<string, string>();

    const representantesPorRegional = new Map<
      string,
      {
        codigo: string;
        nome: string;
        regional: string;
        supervisor: string;
      }
    >();

    for (const item of metasOriginais) {
      const rep = normalizarRepresentante(
        item.codigoRepresentante,
        mapa
      ).codigo;

      if (
        perfil === "REPRESENTANTE" &&
        rep !== representanteLogin
      ) {
        continue;
      }

      if (!item.supervisor) continue;

      const oficial = mapa.cadastro.get(rep);
      const chave = `${item.supervisor}:${rep}`;

      if (!representantesPorRegional.has(chave)) {
        representantesPorRegional.set(chave, {
          codigo: rep,
          nome: oficial?.nome_rep || item.representante || rep,
          regional: item.regional,
          supervisor: item.supervisor,
        });
      }

      regionaisDisponiveis.set(
        item.supervisor,
        item.regional || item.supervisor
      );
    }

    const representantesDisponiveis = [
      ...representantesPorRegional.values(),
    ];

    if (
      regionalFiltro &&
      !regionaisDisponiveis.has(regionalFiltro)
    ) {
      return NextResponse.json(
        { erro: "Gestao regional nao disponivel para este usuario" },
        { status: 403 }
      );
    }

    const representantesDaRegional =
      representantesDisponiveis.filter(
        (item) =>
          !regionalFiltro ||
          item.supervisor === regionalFiltro
      );

    if (
      representanteFiltro &&
      !representantesDaRegional.some(
        (item) => item.codigo === representanteFiltro
      )
    ) {
      return NextResponse.json(
        { erro: "Representante nao pertence a regional selecionada" },
        { status: 403 }
      );
    }

    const opcoesRegionais = [
      ...regionaisDisponiveis.entries(),
    ]
      .map(([codigo, nome]) => ({ codigo, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    const opcoesRepresentantes = representantesDaRegional
      .map((item) => ({
        codigo: item.codigo,
        nome: item.nome,
        regional: item.supervisor,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const permitirRepresentante = (rep: string) => {
      if (perfil === "REPRESENTANTE") {
        return rep === representanteLogin;
      }

      return (
        !representanteFiltro ||
        rep === representanteFiltro
      );
    };

    // A regional do realizado é associada à regional da meta
    // pelo representante normalizado. A fonte continua sujeita
    // às restrições originais de supervisores.
    const supervisoresMetaPorRepresentante = new Map<string, Set<string>>();

    for (const item of metasOriginais) {
      const rep = normalizarRepresentante(
        item.codigoRepresentante,
        mapa
      ).codigo;

      if (!item.supervisor) continue;

      const regionais = supervisoresMetaPorRepresentante.get(rep)
        ?? new Set<string>();

      regionais.add(item.supervisor);
      supervisoresMetaPorRepresentante.set(rep, regionais);
    }

    const permitirSupervisor = (rep: string) => {
      const regionaisMeta = supervisoresMetaPorRepresentante.get(rep);

      if (
        regionalFiltro &&
        !regionaisMeta?.has(regionalFiltro)
      ) {
        return false;
      }

      if (!supervisoresPermitidos) return true;

      // A fonte de realizado possui recorte próprio.
      // Não presumimos que um representante fora do recorte
      // tenha realizado igual a zero.
      const supervisorFonte = normalizarRepresentante(
        rep,
        mapa
      ).supervisor;

      return (
        !!supervisorFonte &&
        supervisoresPermitidos.has(supervisorFonte)
      );
    };
    const metas = metasOriginais
      .map((item) => normalizarMeta(item, mapa))
      .filter((item) =>
        permitirRepresentante(item.codigoRepresentante) &&
        (!regionalFiltro || item.supervisor === regionalFiltro)
      )
      .filter((item) => {
        if (periodoValidado === "MENSAL") {
          return (
            item.ano === inicio.getUTCFullYear() &&
            item.mes === inicio.getUTCMonth() + 1
          );
        }

        const primeiroDia = dataUTC(
          item.ano,
          item.mes,
          1
        );

        const ultimoDia = dataUTC(
          item.ano,
          item.mes + 1,
          0
        );

        return primeiroDia <= fim && ultimoDia >= inicio;
      });

    const realizados = fonte.registros
      .map((item) => normalizarRealizado(item, mapa))
      .filter((item) =>
        permitirRepresentante(item.codigoRepresentante) &&
        permitirSupervisor(item.codigoRepresentante)
      );

    // AA passa pelas mesmas regras de acesso, De/Para,
    // regional e representante aplicadas ao realizado.
    const realizadosAA = (fonteAAValidada?.registros ?? [])
      .map((item) => normalizarRealizado(item, mapa))
      .filter((item) =>
        permitirRepresentante(item.codigoRepresentante) &&
        permitirSupervisor(item.codigoRepresentante)
      );

    // Preserva todos os representantes com meta,
    // inclusive aqueles sem realizado.
    const codigosComMeta = new Set(
      metas.map((item) => item.codigoRepresentante)
    );

    const codigosComRealizado = new Set(
      realizados.map((item) => item.codigoRepresentante)
    );

    const codigosConciliados = new Set(
      [...codigosComMeta].filter((rep) =>
        codigosComRealizado.has(rep)
      )
    );

    const metasSemRealizado = metas.filter(
      (item) =>
        !codigosComRealizado.has(item.codigoRepresentante)
    );

    const realizadosSemMeta = realizados.filter(
      (item) =>
        !codigosComMeta.has(item.codigoRepresentante)
    );

    // O realizado sem meta fica separado para auditoria.
    // Não é incorporado silenciosamente ao percentual.
    const realizadosConciliados = realizados.filter(
      (item) =>
        codigosComMeta.has(item.codigoRepresentante)
    );

    const totalMeta = calcularMetaPeriodo(
      metas,
      periodoValidado,
      inicio,
      fim
    );

    const totalRealizado = somar(
      realizadosConciliados
    );

    const totalRealizadoFonte = somar(realizados);

    // Mesmo universo conciliado com metas usado no ano atual.
    // Representantes sem realizado atual podem possuir AA.
    const totalAA = fonteAAValidada
      ? somar(
          realizadosAA.filter((item) =>
            codigosComMeta.has(item.codigoRepresentante)
          )
        )
      : null;

    const avisos: string[] = [
      "Códigos normalizados pelo cadastro oficial e De/Para do Supabase.",
      "Metas sem realizado permanecem no cálculo com realizado zero.",
      "Realizados sem meta são apresentados separadamente para auditoria.",
      periodoValidado === "SEMANAL"
        ? "Meta semanal proporcional aos dias úteis de segunda a sexta, sem feriados."
        : "Meta mensal conforme arquivo oficial.",
    ];

    if (!fonteAAValidada) {
      avisos.push(
        fonteAA
          ? "Comparativo AA indisponível: período histórico incompatível."
          : "Comparativo AA não disponível para esta periodicidade."
      );
    } else {
      avisos.push(
        "Comparativo AA obtido de " +
        fonteAAValidada.arquivo +
        " / " +
        fonteAAValidada.aba +
        "."
      );
    }

    if (supervisoresPermitidos) {
      avisos.push(
        "O realizado possui recorte de supervisores na fonte: " +
        [...supervisoresPermitidos].join(", ") +
        ". Não representa necessariamente o total nacional."
      );
    }

    const fonteComExclusoes =
      /(?:Exceto|\(Exceto\))/i.test(
        fonte.filtrosOriginais
      );

    if (fonteComExclusoes) {
      avisos.push(
        "O realizado contém exclusões de origem que não foram " +
        "comprovadamente reproduzidas na planilha de metas."
      );
    }

    // A meta vem do Excel oficial. O realizado vem do relatório.
    // Supervisor identificado não comprova, sozinho, equivalência
    // de tipo de pedido, filtros e abrangência entre as fontes.
    // Comparabilidade exige auditoria de cobertura,
    // filtros e período. Não declarar validada automaticamente.
    const abrangenciaValidada = false;
    if (!abrangenciaValidada) {
      avisos.push(
        "Comparabilidade ainda não validada. Não utilizar " +
        "o percentual como indicador oficial."
      );
    }

    return NextResponse.json({
      tipo: tipoValidado,
      periodicidade: periodoValidado,
      pedido: "TODOS",
      filtros: {
        regional: regionalFiltro,
        representante: representanteFiltro,
        regionais: opcoesRegionais,
        representantes: opcoesRepresentantes,
      },

      periodo: {
        inicio: inicio.toISOString().slice(0, 10),
        fim: fim.toISOString().slice(0, 10),
        original: fonte.periodoOriginal,
      },

      indicadores: {
        pares: {
          ...calcularIndicador(
            totalMeta.pares,
            totalRealizado.pares
          ),
          realizadoAA: totalAA?.pares ?? null,
        },
        valores: {
          ...calcularIndicador(
            totalMeta.valores,
            totalRealizado.valores
          ),
          realizadoAA: totalAA?.valores ?? null,
        },
      },

      comparabilidade: {
        validada: abrangenciaValidada,
        escopo:
          supervisoresPermitidos
            ? "REGIONAL"
            : "FONTE_ORIGINAL",
        supervisores: supervisoresPermitidos
          ? [...supervisoresPermitidos]
          : [],
        possuiExclusoes: fonteComExclusoes,
      },

      fonte: {
        arquivo: fonte.arquivo,
        aba: fonte.aba,
        filtrosOriginais: fonte.filtrosOriginais,
        registrosRealizado: realizados.length,
        registrosMeta: metas.length,
      },

      conciliacao: {
        representantesComMeta: codigosComMeta.size,
        representantesNoRealizado: codigosComRealizado.size,
        representantesConciliados: codigosConciliados.size,

        representantesSemRealizado: [
          ...new Set(
            metasSemRealizado.map(
              (item) => item.codigoRepresentante
            )
          ),
        ],

        representantesSemMeta: realizadosSemMeta.map(
          (item) => ({
            codigo: item.codigoRepresentante,
            nome: item.representante,
            pares: item.quantidade,
            valor: item.valor,
          })
        ),

        realizadoTotalFonte: totalRealizadoFonte,
        realizadoConciliado: totalRealizado,
        metaTotalEscopo: totalMeta,
      },

      avisos,
    });
  } catch (erro) {
    console.error("[API METAS]", erro);

    return NextResponse.json(
      { erro: "Falha ao carregar os indicadores de metas" },
      { status: 500 }
    );
  }
}
