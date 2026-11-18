import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validarToken } from "@/lib/auth";
import EvidenciasAprovacoes from "./EvidenciasAprovacoes";
import TreinamentosClient from "./TreinamentosClient";

export const dynamic = "force-dynamic";

export default async function TreinamentosPage() {
  const token = (await cookies()).get("kidy_session")?.value;

  if (!token) redirect("/");

  const sessao = await validarToken(token);

  if (!sessao) redirect("/");

  const perfil = String(sessao.perfil || "").trim().toUpperCase();

  const podeAprovar = [
    "ADMIN",
    "ADMINISTRADOR",
    "DIRETOR",
    "GERENTE",
    "SUPERVISOR",
  ].includes(perfil);

  return (
    <>
      <TreinamentosClient />
      <EvidenciasAprovacoes podeAprovar={podeAprovar} />
    </>
  );
}