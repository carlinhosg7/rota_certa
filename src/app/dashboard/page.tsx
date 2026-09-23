import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validarToken } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import DashboardClient from "@/components/DashboardClient";

export default async function Dashboard(){
 const token=(await cookies()).get("kidy_session")?.value; if(!token)redirect("/"); const u:any=await validarToken(token); if(!u)redirect("/");
 const nome=String(u.nome||u.usuario||"Usuário"), perfil=String(u.perfil||"").toUpperCase();
 return <div className="app-shell"><Sidebar nome={nome} perfil={perfil} usuario={String(u.usuario||"")} /><main className="content">
  <header className="topbar"><div><span className="eyebrow">INTELIGÊNCIA COMERCIAL</span><h1>KIDY Sales Intelligence</h1><p>Supervisor → Representante → Cidade → Clientes prioritários</p></div><div className="profile-pill"><span>{nome}</span><b>{perfil}</b></div></header>
  <section className="hero-kidy"><div><span className="hero-tag">BASE COMERCIAL REAL</span><h2>Rota Campeã</h2><p>Carteira, histórico de compras e limite financeiro conectados ao novo sistema.</p></div><div className="hero-mark">KIDY</div></section>
  <DashboardClient />
 </main></div>
}
