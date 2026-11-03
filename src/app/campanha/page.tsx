import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validarToken } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import CampanhaClient from "./CampanhaClient";

export default async function CampanhaPage() {
  const token = (await cookies()).get("kidy_session")?.value;
  if (!token) redirect("/");
  const usuario = await validarToken(token);
  if (!usuario) redirect("/");
  const nome = String(usuario.nome || usuario.usuario || "Usuario");
  const perfil = String(usuario.perfil || "").toUpperCase();
  return (
    <div className="app-shell">
      <Sidebar nome={nome} perfil={perfil} usuario={String(usuario.usuario || "")} />
      <main className="content">
        <header className="topbar"><div>
          <span className="eyebrow">INTELIGENCIA COMERCIAL</span>
          <h1>Conquiste Sua Amostra 2027</h1>
          <p>Acompanhamento das metas e indicadores da campanha</p>
        </div><div className="profile-pill"><span>{nome}</span><b>{perfil}</b></div></header>
        <CampanhaClient />
      </main>
    </div>
  );
}
