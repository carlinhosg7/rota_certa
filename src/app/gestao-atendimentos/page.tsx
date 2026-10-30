import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validarToken } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import GestaoAtendimentosClient from "./GestaoAtendimentosClient";

export const dynamic = "force-dynamic";

export default async function GestaoAtendimentos() {
  const token = (await cookies()).get("kidy_session")?.value;
  const sessao = token ? await validarToken(token) : null;
  if (!sessao) redirect("/");
  const perfil = String(sessao.perfil ?? "").toUpperCase();
  const nome = String(sessao.nome || sessao.usuario || "Usuário");
  return (
    <div className="app-shell">
      <Sidebar nome={nome} perfil={perfil} usuario={String(sessao.usuario || "")} />
      <main className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">INTELIGÊNCIA COMERCIAL</span>
            <h1>Gestão de Atendimentos</h1>
            <p>Acompanhamento de visitas, conversão, motivos e próximos contatos</p>
          </div>
          <div className="profile-pill"><span>{nome}</span><b>{perfil}</b></div>
        </header>
        <GestaoAtendimentosClient />
      </main>
    </div>
  );
}
