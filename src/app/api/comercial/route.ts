import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validarToken } from "@/lib/auth";

import {
  getData,
  MAPA_SUPERVISORES,
  resumirClientes,
  sugerirRota,
} from "@/lib/comercial-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // =========================================================
    // AUTENTICAÇÃO
    // =========================================================

    const token = (await cookies()).get("kidy_session")?.value;

    if (!token) {
      return NextResponse.json(
        { erro: "Não autenticado" },
        { status: 401 }
      );
    }

    const u: any = await validarToken(token);

    if (!u) {
      return NextResponse.json(
        { erro: "Sessão inválida" },
        { status: 401 }
      );
    }

    // =========================================================
    // BASES
    // =========================================================

    const { carteira, vendas, municipios } = await getData();

    const perfil = String(u.perfil || "").toUpperCase();

    const repLogin = String(
      u.codigo_representante || u.usuario || ""
    ).replace(/\.0+$/, "");

    let c = carteira;
    let v = vendas;

    // =========================================================
    // SEGURANÇA POR REPRESENTANTE
    // =========================================================

    if (perfil === "REPRESENTANTE") {
      c = c.filter((x) => x.rep === repLogin);
      v = v.filter((x) => x.rep === repLogin);
    }

    // =========================================================
    // PARÂMETROS
    // =========================================================

    const sup = req.nextUrl.searchParams.get("supervisor") || "";
    const rep = req.nextUrl.searchParams.get("representante") || "";
    const cidade = req.nextUrl.searchParams.get("cidade") || "";

    // Cidade clicada no mapa/card.
    // NÃO altera a cidade-base usada para calcular a rota.
    const clientesCidade =
      req.nextUrl.searchParams.get("clientesCidade") || "";

    const raioParam = Number(
      req.nextUrl.searchParams.get("raio") || "120"
    );

    const raio =
      Number.isFinite(raioParam) && raioParam > 0
        ? Math.min(raioParam, 500)
        : 120;

    // =========================================================
    // SUPERVISORES
    // =========================================================

    const supervisors = [
      ...new Set(c.map((x) => x.sup).filter(Boolean)),
    ]
      .filter(
        (x) =>
          ![
            "9905",
            "ADRIANO PIRES",
            "NN",
            "SP",
            "TOTAL GERAL",
          ].includes(String(x))
      )
      .sort()
      .map((codigo) => ({
        codigo,
        nome: MAPA_SUPERVISORES[codigo] || codigo,
        label: MAPA_SUPERVISORES[codigo]
          ? `${codigo} - ${MAPA_SUPERVISORES[codigo]}`
          : codigo,
      }));

    // =========================================================
    // REPRESENTANTES
    // =========================================================

    const cSup = sup ? c.filter((x) => x.sup === sup) : [];

    const reps = [...new Set(cSup.map((x) => x.rep))].sort((a, b) =>
      a.localeCompare(b, "pt-BR", { numeric: true })
    );

    // =========================================================
    // CARTEIRA DO REPRESENTANTE
    // =========================================================

    const cRep = rep ? cSup.filter((x) => x.rep === rep) : [];
    const vRep = rep ? v.filter((x) => x.rep === rep) : [];

    // =========================================================
    // RESUMO DOS CLIENTES
    // =========================================================

    const resumo = rep ? resumirClientes(cRep, vRep) : [];

    // =========================================================
    // CIDADES DA CARTEIRA
    // =========================================================

    const cidades = [...new Set(resumo.map((x) => x.cityKey))].sort();

    // =========================================================
    // KPIs DA CIDADE-BASE
    // =========================================================

    // Os cards superiores continuam representando a cidade-base.
    const selecionadosBase = cidade
      ? resumo.filter((x) => x.cityKey === cidade)
      : resumo;

    const kpis = {
      clientes: selecionadosBase.length,
      vermelhos: selecionadosBase.filter((x) =>
        x.status.startsWith("🔴")
      ).length,
      amarelos: selecionadosBase.filter((x) =>
        x.status.startsWith("🟡")
      ).length,
      verdes: selecionadosBase.filter((x) =>
        x.status.startsWith("🟢")
      ).length,
    };

    // =========================================================
    // CLIENTES EXIBIDOS
    // =========================================================

    // Se o usuário clicou em uma etapa da rota, mostramos os clientes
    // daquela cidade. Caso contrário, mostramos a cidade-base.
    const cidadeParaClientes = clientesCidade || cidade;

    const selecionadosClientes = cidadeParaClientes
      ? resumo.filter((x) => x.cityKey === cidadeParaClientes)
      : resumo;

    const clientes = selecionadosClientes
      .sort(
        (a, b) =>
          b.prioridade - a.prioridade ||
          b.diasSemCompra - a.diasSemCompra
      )
      .slice(0, 1000)
      .map((x) => ({
        codigo: x.codigo,
        razao: x.razao,
        cidade: x.cidade,
        uf: x.uf,
        status: x.status,
        diasSemCompra: x.diasSemCompra,
        ultimaCompra: x.ultimaCompra
          ?.toISOString()
          .slice(0, 10),
        limite: x.limite,
        bloqueio: x.bloqueio,
      }));

    // =========================================================
    // VENDA MAIS+ / ROTA COMERCIAL
    // =========================================================

    let rota: any[] = [];

    if (rep && cidade && municipios.length) {
      rota = sugerirRota(
        cidade,
        rep,
        cRep,
        vRep,
        municipios,
        8,
        raio
      ).map((r, index) => ({
        ordem: r.sequencia ?? index + 1,
        cidade: r.cidade,
        uf: r.uf,
        cityKey: r.cityKey,
        lat: r.lat,
        lon: r.lon,

        distanciaKm:
          Math.round(r.distanciaKm * 10) / 10,

        distanciaAnteriorKm:
          Math.round((r.distanciaAnteriorKm ?? 0) * 10) / 10,

        distanciaAcumuladaKm:
          Math.round((r.distanciaAcumuladaKm ?? 0) * 10) / 10,

        clientes: r.clientes,
        vermelhos: r.vermelhos,
        amarelos: r.amarelos,
        verdes: r.verdes,

        diasSemCompraMedio:
          Math.round(r.diasSemCompraMedio),

        limiteTotal:
          Math.round(r.limiteTotal * 100) / 100,

        score:
          Math.round(r.score * 10000) / 10000,
      }));
    }

    // =========================================================
    // RESPOSTA
    // =========================================================

    return NextResponse.json({
      supervisores: supervisors,
      representantes: reps,
      cidades,
      kpis,
      clientes,
      rota,
      raio,
      cidadeBase: cidade || null,
      cidadeClientes: cidadeParaClientes || null,
      perfil,
    });
  } catch (e: any) {
    console.error("[API COMERCIAL]", e);

    return NextResponse.json(
      {
        erro:
          e?.message ||
          "Erro ao carregar base comercial",
      },
      { status: 500 }
    );
  }
}
