import "server-only";

import type { JWTPayload } from "jose";

import {
  acessoGlobal,
  representantesPermitidos,
} from "@/lib/escopo-acesso";

export type EscopoShare = {
  nacional: boolean;
  representantes: Set<string>;
};

function codigo(valor: unknown): string {
  return String(valor ?? "")
    .trim()
    .replace(/\.0+$/, "");
}

export async function obterEscopoShare(
  usuario: JWTPayload
): Promise<EscopoShare> {
  if (acessoGlobal(usuario)) {
    return {
      nacional: true,
      representantes: new Set(),
    };
  }

  const permitidos = await representantesPermitidos(usuario);

  return {
    nacional: false,
    representantes: new Set(
      (permitidos ?? []).map(codigo).filter(Boolean)
    ),
  };
}

export function podeConsultarShare(
  escopo: EscopoShare
): boolean {
  return escopo.nacional ||
    escopo.representantes.size > 0;
}

export function representanteNoEscopo(
  escopo: EscopoShare,
  representante: unknown
): boolean {
  return escopo.nacional ||
    escopo.representantes.has(codigo(representante));
}

export function municipioNoEscopo(
  escopo: EscopoShare,
  representantesMunicipio: Record<string, number>
): boolean {
  if (escopo.nacional) return true;

  return Object.keys(representantesMunicipio ?? {})
    .some(rep => representanteNoEscopo(escopo, rep));
}

export function somarVendasShare(
  historico: Record<string, number>,
  escopo: EscopoShare
): number {
  return Object.entries(historico ?? {})
    .reduce((total, [rep, pares]) => {
      if (!representanteNoEscopo(escopo, rep)) {
        return total;
      }

      const quantidade = Number(pares);

      return total + (
        Number.isFinite(quantidade) ? quantidade : 0
      );
    }, 0);
}
