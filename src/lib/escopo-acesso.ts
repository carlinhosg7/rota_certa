import "server-only";

import type { JWTPayload } from "jose";
import { supabase } from "@/lib/supabase";

type Sessao = JWTPayload;

const norm = (v: unknown): string =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

const cod = (v: unknown): string =>
  String(v ?? "").trim().replace(/\.0+$/, "");

/**
 * Acesso nacional:
 * ADMIN, ADMINISTRADOR, DIRETOR e Mauricio.
 */
export function acessoGlobal(u: Sessao): boolean {
  const perfil = norm(u.perfil);

  if (
    ["ADMIN", "ADMINISTRADOR", "DIRETOR"].includes(perfil)
  ) {
    return true;
  }

  if (perfil !== "GERENTE") {
    return false;
  }

  const login = norm(u.usuario);

  return [
    "MAURICIO",
    "MAURICIO.LALUCE",
    "MAURICIO.LALUCE@KIDY.COM.BR",
  ].includes(login);
}

/**
 * Regionais permitidas.
 *
 * null = acesso nacional
 * Set vazio = acesso negado
 */
export async function regionaisPermitidas(
  u: Sessao
): Promise<Set<string> | null> {

  if (acessoGlobal(u)) {
    return null;
  }

  const perfil = norm(u.perfil);

  if (perfil === "SUPERVISOR") {
    const usuario = String(u.usuario ?? "").trim();

    if (!usuario) {
      return new Set();
    }

    const { data, error } = await supabase
      .from("kidy_supervisores_acessos")
      .select("codigo_supervisor")
      .eq("usuario", usuario);

    if (error) {
      throw new Error(
        `Erro ao consultar acessos de supervisor: ${error.message}`
      );
    }

    return new Set(
      (data ?? [])
        .map((r) => cod(r.codigo_supervisor))
        .filter(Boolean)
    );
  }

  if (perfil === "GERENTE") {
    const gerente = norm(u.gerente || u.nome);

    if (!gerente) {
      return new Set();
    }

    const { data, error } = await supabase
      .from("kidy_gerentes_regionais")
      .select("codigo_supervisor,gerente")
      .eq("ativo", true);

    if (error) {
      throw new Error(
        `Erro ao consultar regionais de gerentes: ${error.message}`
      );
    }

    return new Set(
      (data ?? [])
        .filter((r) => norm(r.gerente) === gerente)
        .map((r) => cod(r.codigo_supervisor))
        .filter(Boolean)
    );
  }

  return new Set();
}

/**
 * Representantes autorizados para a sessão.
 *
 * null = acesso nacional
 * [] = nenhum representante autorizado
 */
export async function representantesPermitidos(
  u: Sessao
): Promise<string[] | null> {

  if (acessoGlobal(u)) {
    return null;
  }

  const perfil = norm(u.perfil);

  if (["REPRESENTANTE", "REP"].includes(perfil)) {
    const rep = cod(u.codigo_representante);

    return rep ? [rep] : [];
  }

  if (!["SUPERVISOR", "GERENTE"].includes(perfil)) {
    return [];
  }

  const regionais = await regionaisPermitidas(u);

  if (!regionais || regionais.size === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("representantes_cadastro")
    .select("codigo_rep,codigo_supervisor")
    .eq("ativo", true);

  if (error) {
    throw new Error(
      `Erro ao consultar representantes: ${error.message}`
    );
  }

  return [
    ...new Set(
      (data ?? [])
        .filter((r) =>
          regionais.has(cod(r.codigo_supervisor))
        )
        .map((r) => cod(r.codigo_rep))
        .filter(Boolean)
    ),
  ];
}
