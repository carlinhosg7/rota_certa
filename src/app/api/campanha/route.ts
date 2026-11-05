import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validarToken } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { credenciais } from "@/lib/campanha-treinamento-seguro";
import { representantesPermitidos, regionaisPermitidas } from "@/lib/escopo-acesso";
import { metasReativacaoPorRepresentante, mesesMetaReativacao } from "@/lib/metas-reativacao-campanha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAMPANHA = "CONQUISTE_AMOSTRA_2027";
const cod = (v: unknown) => String(v ?? "").trim().replace(/\.0+$/, "");
const competenciaValida = (v: string) => /^2026-11-01$|^2026-12-01$|^2027-0[1-3]-01$/.test(v);

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

    let consulta = supabase
      .from("kidy_campanha_painel_base")
      .select("campanha,competencia,origem,modalidade,codigo_representante,representante_nome,codigo_supervisor,meta_pares,meta_valor,realizado_pares,realizado_valor,status_dados")
      .eq("campanha", CAMPANHA)
      .eq("competencia", competencia)
      .order("codigo_representante", { ascending: true })
      .range(0, 999);

    if (permitidos !== null) consulta = consulta.in("codigo_representante", permitidos);
    if (supervisor) consulta = consulta.eq("codigo_supervisor", supervisor);
    if (representante) consulta = consulta.eq("codigo_representante", representante);

    const { data, error } = await consulta;
    if (error) throw new Error(`Consulta do painel: ${error.message}`);
    const linhas = (data ?? []) as Linha[];
    if (linhas.length === 1000) throw new Error("Limite de consulta atingido. Implementar paginacao antes de exibir totais.");

    // Nunca autorizar pelo filtro enviado no navegador: o escopo ja foi aplicado no servidor.
    // O supervisor da meta pode estar desatualizado; para perfis regionais,
    // fazemos uma segunda validacao por escopo ativo do cadastro.
    const visiveis = linhas.filter((r) =>
      (permitidos === null || permitidos.includes(cod(r.codigo_representante))) &&
      (regionais === null || regionais.has(cod(r.codigo_supervisor)))
    );

    const indicadores = [
      { chave: "PRODUCAO", origem: "ENTRADA", modalidade: "PRODUCAO", titulo: "Entrada Producao", pontos: 60 },
      { chave: "FATURAMENTO", origem: "FATURAMENTO", modalidade: "TOTAL", titulo: "Faturamento", pontos: 60 },
      { chave: "KIDEX", origem: "ENTRADA", modalidade: "KIDEX", titulo: "Entrada Kidex", pontos: 20 },
    ].map((indicador) => {
      const itens = visiveis.filter((l) => l.origem === indicador.origem && l.modalidade === indicador.modalidade);
      const completos = itens.length > 0 && itens.every((l) => l.status_dados !== "SEM_DADOS" && l.realizado_pares !== null && l.realizado_valor !== null);
      const metaPares = itens.reduce((t, l) => t + Number(l.meta_pares || 0), 0);
      const metaValor = itens.reduce((t, l) => t + Number(l.meta_valor || 0), 0);
      const realizadoPares = completos ? itens.reduce((t, l) => t + Number(l.realizado_pares || 0), 0) : null;
      const realizadoValor = completos ? itens.reduce((t, l) => t + Number(l.realizado_valor || 0), 0) : null;
      return {
        ...indicador,
        representantes: new Set(itens.map((i) => cod(i.codigo_representante))).size,
        metaPares, metaValor, realizadoPares, realizadoValor,
        percentualPares: realizadoPares === null || metaPares <= 0 ? null : 100 * realizadoPares / metaPares,
        percentualValor: realizadoValor === null || metaValor <= 0 ? null : 100 * realizadoValor / metaValor,
        status: completos ? "PARCIAL_NAO_HOMOLOGADO" : "AGUARDANDO_DADOS",
        pontosConcedidos: 0,
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
      const rep = cod(t.codigo_representante);
      if (permitidos !== null && !permitidos.includes(rep)) continue;
      if (representante && rep !== representante) continue;
      if (supervisor && cod(t.codigo_supervisor_snapshot) !== supervisor) continue;
      if (regionais !== null && !regionais.has(cod(t.codigo_supervisor_snapshot))) continue;
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
    });

    // A campanha registra reativacoes detectadas na mudança da Carteira 02 para a 01.
    // A data é a primeira detecção no novo snapshot, e não comprovação de compra.
    // Apenas vinculos univocos permitem atribuir o resultado ao representante.
    const inicioMes = competencia;
    const fimMes = new Date(`${competencia}T12:00:00Z`);
    fimMes.setUTCMonth(fimMes.getUTCMonth() + 1);
    const fimExclusivo = fimMes.toISOString().slice(0, 10);
    type Reat = {codigo_cliente:string;codigo_representante_responsavel:string|null;codigo_supervisor_responsavel:string|null};
    const eventos:Reat[]=[];
    for(let offset=0;offset<20000;offset+=1000){
      const {data: lote,error: erroReat}=await supabase
        .from("kidy_reativacao_clientes")
        .select("codigo_cliente,codigo_representante_responsavel,codigo_supervisor_responsavel")
        .eq("competencia","2026-10-01").eq("reativado",true)
        .gte("data_reativacao",inicioMes).lt("data_reativacao",fimExclusivo)
        .order("codigo_cliente",{ascending:true}).range(offset,offset+999);
      if(erroReat)throw new Error(`Reativacao: ${erroReat.message}`);
      eventos.push(...((lote??[]) as Reat[]));
      if((lote??[]).length<1000)break;
    }
    const consultaNacional=permitidos===null && regionais===null && !representante && !supervisor;
    const aptos=eventos.filter(e=>{
      if(consultaNacional)return true;
      const r=cod(e.codigo_representante_responsavel),s=cod(e.codigo_supervisor_responsavel);
      return Boolean(r) && Boolean(s) &&
        (permitidos===null||permitidos.includes(r)) &&
        (regionais===null||regionais.has(s)) &&
        (!representante||representante===r) && (!supervisor||supervisor===s);
    });
    // Metas do arquivo META REATIVICAO: 5 clientes por representante a cada mes.
    // Escopo obtido da base da campanha ja filtrada por permissoes, sem expor metas alheias.
    const indiceMes = mesesMetaReativacao.indexOf(competencia as typeof mesesMetaReativacao[number]);
    const codigosVisiveis = [...new Set(visiveis.map(x => cod(x.codigo_representante)).filter(Boolean))];
    const codigosComMeta = codigosVisiveis.filter(c => metasReativacaoPorRepresentante[c] !== undefined);
    const metaReativacao = indiceMes >= 0
      ? codigosComMeta.reduce((total, c) => total + (metasReativacaoPorRepresentante[c][indiceMes] ?? 0), 0)
      : 0;
    indicadores.push({
      chave:"REATIVACAO",titulo:"Reativação",pontos:30,
      origem:"REATIVACAO",modalidade:"CLIENTES",
      representantes:codigosComMeta.length,
      metaPares:metaReativacao,metaValor:0,realizadoPares:aptos.length,realizadoValor:0,
      percentualPares:metaReativacao > 0 ? 100 * aptos.length / metaReativacao : null,
      percentualValor:null,
      status:"DETECTADO_NAO_HOMOLOGADO",pontosConcedidos:0,
    });

    const opcoes = [...new Map(visiveis.map((i) => [cod(i.codigo_representante), {
      codigo: cod(i.codigo_representante), nome: i.representante_nome || cod(i.codigo_representante),
    }])).values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const supervisores = [...new Set(visiveis.map((i) => cod(i.codigo_supervisor)).filter(Boolean))].sort();

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
