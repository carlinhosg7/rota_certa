import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Image from "next/image";
import { validarToken } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import AlertasReativacao from "@/components/AlertasReativacao";

export default async function Dashboard() {
  const token = (await cookies()).get("kidy_session")?.value;
  if (!token) redirect("/");

  const sessao = await validarToken(token);
  if (!sessao) redirect("/");

  const usuario = String(sessao.usuario || "");
  const nome = usuario.trim().toLowerCase() === "demo.rep"
    ? "DemonstraÃ§Ã£o KIDY"
    : String(sessao.nome || sessao.usuario || "UsuÃ¡rio");
  const perfil = String(sessao.perfil || "").toUpperCase();

  return (
    <div className="app-shell">
      <Sidebar nome={nome} perfil={perfil} usuario={usuario} />

      <div
        style={{
          position: "fixed",
          top: 16,
          right: 20,
          zIndex: 100
        }}
      >
        <AlertasReativacao />
      </div>
      <main
        className="content"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "clamp(12px, 2vw, 28px)",
          minWidth: 0,
          minHeight: "100dvh",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: 1672,
            aspectRatio: "1672 / 941",
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 12px 32px rgba(67, 39, 10, .10)",
          }}
        >
          <Image
            src="/kidy-home-banner.png"
            alt="KIDY Sales Intelligence â€” InteligÃªncia que transforma dados em resultados"
            fill
            priority
            sizes="(max-width: 1000px) 100vw, calc(100vw - 280px)"
            style={{ objectFit: "contain" }}
          />
        </div>
      </main>
    </div>
  );
}