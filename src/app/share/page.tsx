import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validarToken } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import ShareClient from "./ShareClient";

export const dynamic = "force-dynamic";

export default async function SharePage() {

  const token = (await cookies()).get("kidy_session")?.value;

  if (!token) redirect("/");

  const usuario = await validarToken(token);

  if (!usuario) redirect("/");

  const nome = String(
    usuario.nome || usuario.usuario || "Usuario"
  );

  const perfil = String(usuario.perfil || "").toUpperCase();

  if (!["ADMIN", "REPRESENTANTE", "REP"].includes(perfil) || (perfil !== "ADMIN" && !String(usuario.codigo_representante ?? "").trim())) {
    redirect("/dashboard");
  }

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
            <span className="eyebrow">
              INTELIGENCIA COMERCIAL
            </span>
            <h1>Share de Mercado</h1>
            <p>
              Participacao de mercado e potencial de vendas por cidade
            </p>
          </div>

          <div className="profile-pill">
            <span>{nome}</span>
            <b>{perfil}</b>
          </div>
        </header>

        <ShareClient />

      </main>
    </div>
  );
}