import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validarToken } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import CampanhasClient from "../campanhas-clientes/CampanhasClient";

export default async function CampanhasRepresentantesPage() {
  const token = (await cookies()).get("kidy_session")?.value;

  if (!token) redirect("/");

  const usuario = await validarToken(token);

  if (!usuario) redirect("/");

  const nome = String(usuario.nome || usuario.usuario || "Usuario");
  const perfil = String(usuario.perfil || "").toUpperCase();

  return (
    <div className="app-shell">
      <Sidebar
        nome={nome}
        perfil={perfil}
        usuario={String(usuario.usuario || "")}
      />

      <main className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">INTELIGÊNCIA COMERCIAL</span>
            <h1>Campanhas Representantes</h1>
            <p>
              Artes oficiais, regulamentos e incentivos dos representantes.
            </p>
          </div>

          <div className="profile-pill">
            <span>{nome}</span>
            <b>{perfil}</b>
          </div>
        </header>

        <CampanhasClient modo="representantes" />
      </main>
    </div>
  );
}