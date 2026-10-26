import { redirect } from "next/navigation";
import { obterAdministrador } from "@/lib/admin-auth";
import RepresentantesClient from "./RepresentantesClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function RepresentantesPage() {
  const administrador = await obterAdministrador();

  if (!administrador) {
    redirect("/dashboard");
  }

  return <RepresentantesClient administrador={administrador.nome} />;
}
