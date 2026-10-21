import { supabase } from "./supabase";

export type RepresentanteOficial = {
  codigo_rep: string;
  nome_rep: string | null;
  regional: string;
  codigo_supervisor: string | null;
  ativo: boolean;
};

export type MapaRepresentantes = {
  cadastro: Map<string, RepresentanteOficial>;
  dePara: Map<string, string>;
  versao: string;
};

const REGIONAIS: Record<string, string> = {
  "CENTRO OESTE": "9902",
  "SUL": "9907",
  "NORTE / NORDESTE": "9914",
  "REM": "9915",
  "SPC": "9916",
  "SPI": "9917",
  "MT/MS": "9918",
  "RN": "9919",
  "B2B": "9920",
};

function codigo(valor: unknown): string {
  return String(valor ?? "").trim().replace(/\.0+$/, "");
}

export function supervisorOficial(regional: string): string | null {
  const chave = regional
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

  return REGIONAIS[chave] ?? null;
}

export async function carregarMapaRepresentantes(): Promise<MapaRepresentantes> {
  const [cadastroResp, deParaResp] = await Promise.all([
    supabase
      .from("representantes_cadastro")
      .select("codigo_rep,nome_rep,regional,codigo_supervisor,ativo")
      .order("codigo_rep"),

    supabase
      .from("representantes_de_para")
      .select("codigo_antigo,codigo_atual")
      .order("codigo_antigo"),
  ]);

  if (cadastroResp.error) {
    throw new Error(`Cadastro representantes: ${cadastroResp.error.message}`);
  }

  if (deParaResp.error) {
    throw new Error(`De/Para representantes: ${deParaResp.error.message}`);
  }

  const cadastro = new Map<string, RepresentanteOficial>();

  for (const item of cadastroResp.data ?? []) {
    cadastro.set(codigo(item.codigo_rep), item);
  }

  const dePara = new Map<string, string>();

  for (const item of deParaResp.data ?? []) {
    const antigo = codigo(item.codigo_antigo);
    const atual = codigo(item.codigo_atual);

    if (cadastro.has(antigo)) {
      throw new Error(
        `De/Para inválido: código ${antigo} já é representante atual.`
      );
    }

    if (!cadastro.has(atual)) {
      throw new Error(
        `De/Para inválido: representante destino ${atual} não existe.`
      );
    }

    dePara.set(antigo, atual);
  }

  const versao = JSON.stringify({
    cadastro: [...cadastro.values()],
    dePara: [...dePara.entries()],
  });

  return { cadastro, dePara, versao };
}

export function normalizarRepresentante(
  codigoOriginal: string,
  mapa: MapaRepresentantes
): { codigo: string; supervisor: string | null } {
  const original = codigo(codigoOriginal);

  // Representantes atuais têm prioridade absoluta.
  const atual = mapa.cadastro.has(original)
    ? original
    : mapa.dePara.get(original) ?? original;

  const representante = mapa.cadastro.get(atual);

  if (!representante) {
    return { codigo: atual, supervisor: null };
  }

  return {
    codigo: atual,
    supervisor:
      representante.codigo_supervisor ||
      supervisorOficial(representante.regional),
  };
}
