import { podeAcessarShare, ehAdminShare, pertenceRepresentanteShare } from "@/lib/share-acesso";
import { obterEscopoShare, podeConsultarShare, municipioNoEscopo, somarVendasShare } from "@/lib/share-escopo";
import { cookies } from "next/headers";
import { validarToken } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { NextResponse } from "next/server";
import { lerJSONShare } from "@/lib/share-snapshots";
import {
  calcularShareMedio,
  gerentePorSupervisor,
  ultimoAnoCompleto,
  shareReal
} from "@/lib/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Historico = Record<string, Record<string, number>>;

type Municipio = {
  codigo_ibge: string;
  supervisor: string;
  potencial_pares: number;
  [campo: string]: unknown;
};



export async function GET() {
  const token = (await cookies()).get("kidy_session")?.value;

  if (!token) {
    return NextResponse.json(
      { erro: "Nao autenticado" }, { status: 401 }
    );
  }

  const usuario = await validarToken(token);

  if (!usuario) {
    return NextResponse.json(
      { erro: "Sessao invalida" }, { status: 401 }
    );
  }

  const escopo = await obterEscopoShare(usuario);

  if (!podeConsultarShare(escopo)) {
    return NextResponse.json(
      { erro: "Sem permissao" }, { status: 403 }
    );
  }

  try {
    const [municipios, vendas] = await Promise.all([
      lerJSONShare<Municipio[]>("share-municipios.json"),
      lerJSONShare<Historico>("share-vendas-anuais.json")
    ]);

    if (!Array.isArray(municipios) || municipios.length === 0) {
      throw new Error("Base municipal vazia ou invalida");
    }

    type HistoricoRepresentantes =
      Record<string, Record<string, Record<string, number>>>;

    type IndiceShare = {
      cidades: Record<string, {
        representantes: Record<string, number>;
      }>;
    };

    const [historicoRepresentantes, indice] = escopo.nacional
      ? [null, null]
      : await Promise.all([
          lerJSONShare<HistoricoRepresentantes>(
            "share-vendas-representantes.json"
          ),
          lerJSONShare<IndiceShare>(
            "share-acesso-indice.json"
          ),
        ]);

    if (!escopo.nacional && (!historicoRepresentantes || !indice?.cidades)) {
      throw new Error("Historico regional ou indice indisponivel");
    }

    type ClienteShare = {
      codigo_representante: string;
      representante: string;
      supervisor: string;
    };

    const [cadastroShare, vendasPorRepresentante] = await Promise.all([
      lerJSONShare<Record<string, ClienteShare[]>>(
        "share-clientes.json"
      ),
      escopo.nacional
        ? lerJSONShare<HistoricoRepresentantes>(
            "share-vendas-representantes.json"
          )
        : Promise.resolve(historicoRepresentantes!)
    ]);

    const cod = (valor: unknown) =>
      String(valor ?? "").trim().replace(/\\.0+$/, "");

    // Hierarquia comercial oficial do Supabase.
    const [
      { data: cadastroOficial, error: erroCadastro },
      { data: gerenciasOficiais, error: erroGerencias }
    ] = await Promise.all([
      supabase
        .from("representantes_cadastro")
        .select("codigo_rep,codigo_supervisor")
        .eq("ativo", true),

      supabase
        .from("kidy_gerentes_regionais")
        .select("gerente,codigo_supervisor")
        .eq("ativo", true)
    ]);

    if (erroCadastro || erroGerencias) {
      throw new Error(
        "Falha ao consultar a hierarquia oficial do Share"
      );
    }

    const supervisoresOficiais = new Map<string, string>(
      (cadastroOficial ?? []).map(r => [
        cod(r.codigo_rep),
        cod(r.codigo_supervisor)
      ])
    );

    const gerentesOficiais = new Map<string, string>(
      (gerenciasOficiais ?? []).map(r => [
        cod(r.codigo_supervisor),
        String(r.gerente ?? "").trim()
      ])
    );

    const representantesPorCidade = new Map<
      string,
      Map<string, {
        codigo: string;
        nome: string;
        supervisor: string;
        gerente: string;
        vendas_ano: Record<string, number>;
      }>
    >();

    for (const [ibge, clientes] of Object.entries(cadastroShare)) {
      const mapa = new Map<
        string,
        {
          codigo: string;
          nome: string;
          supervisor: string;
          gerente: string;
          vendas_ano: Record<string, number>;
        }
      >();

      for (const cliente of clientes) {
        const codigo = cod(cliente.codigo_representante);

        if (
          !codigo ||
          (!escopo.nacional && !escopo.representantes.has(codigo))
        ) {
          continue;
        }

        if (mapa.has(codigo)) continue;

        const vendas_ano: Record<string, number> = {};

        for (const [ano, porRep] of Object.entries(
          vendasPorRepresentante[ibge] ?? {}
        )) {
          vendas_ano[ano] = Number(porRep[codigo] ?? 0);
        }

        const supervisorOficial = supervisoresOficiais.get(codigo);
        const gerenteOficial = supervisorOficial
          ? gerentesOficiais.get(supervisorOficial)
          : undefined;

        // Nunca usar o cadastro antigo para atribuir
        // um representante a uma gerencia regional.
        if (!escopo.nacional && (!supervisorOficial || !gerenteOficial)) {
          continue;
        }

        const supervisor = supervisorOficial
          ?? String(cliente.supervisor ?? "");

        mapa.set(codigo, {
          codigo,
          nome: String(cliente.representante ?? codigo),
          supervisor,
          gerente: gerenteOficial ?? gerentePorSupervisor(supervisor),
          vendas_ano,
        });
      }

      representantesPorCidade.set(ibge, mapa);
    }

    const municipiosPermitidos = escopo.nacional
      ? municipios
      : municipios.filter(c => {
          const ibge = String(c.codigo_ibge);
          const representantes = indice?.cidades[ibge]?.representantes;

          return representantes
            ? municipioNoEscopo(escopo, representantes)
            : false;
        });

    const cidades = municipiosPermitidos.map(c => {
      const ibge = String(c.codigo_ibge);

      const historico: Record<string, number> = escopo.nacional
        ? (vendas[ibge] ?? {})
        : Object.fromEntries(
            Object.entries(historicoRepresentantes?.[ibge] ?? {})
              .map(([ano, representantes]) => [
                ano,
                somarVendasShare(representantes, escopo)
              ])
          );

      const potencial = Number(c.potencial_pares ?? 0);

      // O historico de referencia da planilha contem totais municipais.
      // Nao pode ser exposto como venda da equipe regional.
      const {
        referencia_planilha: _referenciaPlanilha,
        ...dadosMunicipio
      } = c;

      const dadosPublicos = escopo.nacional ? c : dadosMunicipio;

      const codigoUnico = !escopo.nacional &&
        escopo.representantes.size === 1
          ? [...escopo.representantes][0]
          : "";

      return {
        ...dadosPublicos,
        representante_codigo: escopo.nacional
          ? c.representante_codigo
          : codigoUnico,
        representante: escopo.nacional
          ? c.representante
          : "Equipe autorizada",
        supervisor: escopo.nacional
          ? c.supervisor
          : "Equipe autorizada",
        gerente: escopo.nacional
          ? gerentePorSupervisor(c.supervisor)
          : "Equipe autorizada",
        vendas_ano: historico,
        equipes_share: [
          ...(representantesPorCidade.get(ibge)?.values() ?? [])
        ],
        share_medio_historico: calcularShareMedio(
          historico,
          potencial,
          ultimoAnoCompleto
        ),
        share_ultimo_ano: shareReal(
          Number(historico[String(ultimoAnoCompleto)] ?? 0),
          potencial
        )
      };
    });

    return NextResponse.json({
      cidades,
      ultimoAnoCompleto,
      vendasDisponiveis: true,
      observacao: "Historico de entregas carregado do Google Drive."
    });

  } catch (erro) {
    console.error("[SHARE] Falha ao carregar bases:", erro);

    return NextResponse.json(
      { erro: "Dados do Share indisponiveis no Google Drive" },
      { status: 503 }
    );
  }
}