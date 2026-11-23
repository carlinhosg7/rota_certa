import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validarToken } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { acessoGlobal, regionaisPermitidas, representantesPermitidos } from "@/lib/escopo-acesso";
import { carregarMapaRepresentantes, normalizarRepresentante } from "@/lib/representantes-oficiais";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAMPANHA = "CONQUISTE_AMOSTRA_2027";
const MESES = ["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01", "2027-03-01", "2027-04-01"];
const MODALIDADES = [
  { chave: "PRODUCAO", origem: "ENTRADA", modalidade: "PRODUCAO", limite: 60 },
  { chave: "FATURAMENTO", origem: "FATURAMENTO", modalidade: "TOTAL", limite: 60 },
  { chave: "KIDEX", origem: "ENTRADA", modalidade: "KIDEX", limite: 20 },
] as const;
const codigo = (v: unknown): string => String(v ?? "").trim().replace(/\.0+$/, "");
const numero = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : (Number.isFinite(Number(v)) ? Number(v) : null);

type Linha = {
  campanha: string; competencia: string; origem: string; modalidade: string;
  codigo_representante: string; representante_nome: string | null;
  codigo_supervisor: string | null; meta_valor: number | string | null;
  realizado_valor: number | string | null; status_dados: string;
};
type Acum = {
  codigo: string; nome: string; supervisor: string; modalidades: Record<string, {meta: number | null; realizado: number | null}>;
};

export async function GET(req: NextRequest) {
  try {
    const token = (await cookies()).get("kidy_session")?.value;
    if (!token) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });
    const usuario = await validarToken(token);
    if (!usuario) return NextResponse.json({ erro: "Sessão inválida" }, { status: 401 });

    const competencia = req.nextUrl.searchParams.get("competencia") ?? MESES[0];
    const supervisorFiltro = codigo(req.nextUrl.searchParams.get("supervisor"));
    const representanteFiltro = codigo(req.nextUrl.searchParams.get("representante"));
    if (!MESES.includes(competencia)) return NextResponse.json({ erro: "Competência inválida" }, { status: 400 });

    const global = acessoGlobal(usuario);
    const perfil = String(usuario.perfil ?? "").trim().toUpperCase();
    const papelRep = perfil === "REP" || perfil === "REPRESENTANTE";
    const [permitidos, regionais, mapa] = await Promise.all([
      representantesPermitidos(usuario), regionaisPermitidas(usuario), carregarMapaRepresentantes()
    ]);
    if (!global && (!permitidos || permitidos.length === 0)) {
      return NextResponse.json({ erro: "Sem representantes autorizados" }, { status: 403 });
    }
    if (!global && !papelRep && (!regionais || regionais.size === 0)) {
      return NextResponse.json({ erro: "Sem regionais autorizadas" }, { status: 403 });
    }
    const permitidosSet = new Set((permitidos ?? []).map(codigo));

    const linhas: Linha[] = [];
    for (let offset = 0; offset < 10000; offset += 500) {
      const { data, error } = await supabase
        .from("kidy_campanha_painel_base")
        .select("campanha,competencia,origem,modalidade,codigo_representante,representante_nome,codigo_supervisor,meta_valor,realizado_valor,status_dados")
        .eq("campanha", CAMPANHA).eq("competencia", competencia)
        .order("origem").order("modalidade").order("codigo_representante")
        .range(offset, offset + 499);
      if (error) throw new Error(`Consulta campanha: ${error.message}`);
      const lote = (data ?? []) as Linha[];
      linhas.push(...lote);
      if (lote.length < 500) break;
      if (offset === 9500) throw new Error("Limite de consulta atingido");
    }

    const grupos = new Map<string, Acum>();
    for (const linha of linhas) {
      const chaveModalidade = MODALIDADES.find(m => m.origem === linha.origem && m.modalidade === linha.modalidade);
      if (!chaveModalidade) continue;
      const rep = normalizarRepresentante(codigo(linha.codigo_representante), mapa).codigo;
      const oficial = mapa.cadastro.get(rep);
      const supervisor = codigo(oficial?.codigo_supervisor || linha.codigo_supervisor);
      if (!global) {
        // Sem cadastro oficial ativo não há atribuição segura de escopo.
        if (!oficial?.ativo || !permitidosSet.has(rep)) continue;
        if (!papelRep && regionais !== null && !regionais.has(supervisor)) continue;
      }
      if (supervisorFiltro && supervisor !== supervisorFiltro) continue;
      if (representanteFiltro && rep !== representanteFiltro) continue;
      let item = grupos.get(rep);
      if (!item) {
        item = { codigo: rep, nome: oficial?.nome_rep || linha.representante_nome || rep,
          supervisor: supervisor || "SEM_SUPERVISOR", modalidades: {} };
        grupos.set(rep, item);
      }
      const key = chaveModalidade.chave;
      const valorMeta = numero(linha.meta_valor);
      const valorRealizado = numero(linha.realizado_valor);
      const atual = item.modalidades[key] ?? { meta: null, realizado: null };
      if (valorMeta !== null) atual.meta = (atual.meta ?? 0) + valorMeta;
      if (valorRealizado !== null) atual.realizado = (atual.realizado ?? 0) + valorRealizado;
      item.modalidades[key] = atual;
    }

    const representantes = [...grupos.values()].map(item => {
      const indicadores = MODALIDADES.map(m => {
        const valores = item.modalidades[m.chave] ?? { meta: null, realizado: null };
        const calculavel = valores.meta !== null && valores.meta > 0 && valores.realizado !== null;
        const atingimento = calculavel ? Math.max(0, 100 * valores.realizado! / valores.meta!) : null;
        const pontosProjetados = calculavel ? (valores.realizado! >= valores.meta! ? m.limite : 0) : null;
        return { chave: m.chave, meta: valores.meta, realizado: valores.realizado,
          atingimento, teto: m.limite, pontosProjetados,
          situacao: valores.meta === null ? "SEM_META" : valores.meta <= 0 ? "META_INVALIDA" :
            valores.realizado === null ? "SEM_REALIZADO" : "PROJECAO" };
      });
      return { codigo: item.codigo, nome: item.nome, supervisor: item.supervisor, indicadores,
        pontosProjetados: indicadores.reduce((s, x) => s + (x.pontosProjetados ?? 0), 0),
        indicadoresCalculaveis: indicadores.filter(x => x.pontosProjetados !== null).length };
    }).sort((a, b) => a.supervisor.localeCompare(b.supervisor) || a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true }));

    const supMap = new Map<string, { supervisor: string; representantes: number; pontosProjetados: number }>();
    for (const rep of representantes) {
      const atual = supMap.get(rep.supervisor) ?? { supervisor: rep.supervisor, representantes: 0, pontosProjetados: 0 };
      atual.representantes++;
      atual.pontosProjetados += rep.pontosProjetados;
      supMap.set(rep.supervisor, atual);
    }
    const supervisores = [...supMap.values()].sort((a, b) => a.supervisor.localeCompare(b.supervisor));
    const totalProjetado = representantes.reduce((s, r) => s + r.pontosProjetados, 0);
    const aptos = representantes.filter(r => r.indicadores.some(i => i.meta !== null && i.meta > 0));

    return NextResponse.json({
      campanha: CAMPANHA, competencia,
      criterio: "PROJECAO_BINARIA_100_POR_CENTO_NAO_HOMOLOGADA",
      escalaIndividualComercial: 140,
      pontuacaoConcedida: null,
      observacao: "Simulação individual: 100% ou mais da meta concede a pontuação integral do indicador; abaixo de 100% concede zero. Ausência de realizado não equivale a zero. Treinamento e reativação não incluídos. Não concede prêmio.",
      resumo: { representantes: representantes.length, representantesComMeta: aptos.length,
        somaPontosIndividuais: totalProjetado,
        mediaPontosPorRepresentanteComMeta: aptos.length ? totalProjetado / aptos.length : null },
      supervisores, representantes
    });
  } catch (erro) {
    console.error("[CAMPANHA PROJECAO]", erro);
    return NextResponse.json({ erro: "Falha ao consultar pontuação projetada." }, { status: 500 });
  }
}
