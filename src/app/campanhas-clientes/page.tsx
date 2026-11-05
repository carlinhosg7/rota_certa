import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validarToken } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import CampanhasClient from "./CampanhasClient";

export default async function CampanhasClientesPage() {
  const token = (await cookies()).get("kidy_session")?.value;
  if (!token) redirect("/");
  const usuario = await validarToken(token);
  if (!usuario) redirect("/");
  const nome = String(usuario.nome || usuario.usuario || "Usuário");
  const perfil = String(usuario.perfil || "").toUpperCase();
  return (
    <div className="app-shell">
      <Sidebar nome={nome} perfil={perfil} usuario={String(usuario.usuario || "")} />
      <main className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">INTELIGÊNCIA COMERCIAL</span>
            <h1>Campanhas de Clientes</h1>
            <p>Condições comerciais, benefícios e orientações de participação</p>
          </div>
          <div className="profile-pill"><span>{nome}</span><b>{perfil}</b></div>
        </header>
        <CampanhasClient />
      </main>
    </div>
  );
}
