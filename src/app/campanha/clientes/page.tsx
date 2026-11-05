import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validarToken } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";

export default async function CampanhaClientesPage() {
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
            <span className="eyebrow">CONQUISTE SUA AMOSTRA 2027</span>
            <h1>Campanha Clientes</h1>
            <p>Acompanhamento dos clientes participantes da campanha</p>
          </div>
        </header>
        <section style={{
          background: "#fff",
          border: "1px solid #fed7aa",
          borderRadius: 12,
          padding: 24
        }}>
          <h2>Campanha Clientes</h2>
          <p>
            Modulo em preparacao. Os indicadores e as regras
            dos clientes serao integrados nesta pagina.
          </p>
          <p>Nenhuma pontuacao de clientes foi calculada.</p>
        </section>
      </main>
    </div>
  );
}
