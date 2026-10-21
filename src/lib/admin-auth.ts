import "server-only";

import { cookies } from "next/headers";
import { validarToken } from "@/lib/auth";

export type AdministradorAutenticado = {
  id: string;
  usuario: string;
  nome: string;
  perfil: "ADMIN";
};

export async function obterAdministrador():
  Promise<AdministradorAutenticado | null> {

  const cookieStore = await cookies();
  const token = cookieStore.get("kidy_session")?.value;

  if (!token) return null;

  const sessao = await validarToken(token);

  if (!sessao) return null;

  const perfil = String(sessao.perfil ?? "")
    .trim()
    .toUpperCase();

  if (perfil !== "ADMIN") return null;

  const id = String(sessao.id ?? "").trim();
  const usuario = String(sessao.usuario ?? "").trim();

  if (!id || !usuario) return null;

  return {
    id,
    usuario,
    nome: String(sessao.nome ?? usuario),
    perfil: "ADMIN",
  };
}
