import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validarToken } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import DashboardClient from "@/components/DashboardClient";
import {
  carregarMapaRepresentantes,
  normalizarRepresentante
} from "@/lib/representantes-oficiais";

export const dynamic = "force-dynamic";

export default async function VendaMaisPage() {
  const token = (await cookies()).get("kidy_session")?.value;

  if (!token) redirect("/");

  const sessao = await validarToken(token);

  if (!sessao) redirect("/");

  const usuario = String(sessao.usuario || "");
  const nome =
    usuario.trim().toLowerCase() === "demo.rep"
      ? "Demonstração KIDY"
      : String(sessao.nome || usuario);

  const perfil = String(sessao.perfil || "").toUpperCase();
  let inicial = { supervisor: "", representante: "" };

  if (["REPRESENTANTE", "REP"].includes(perfil)) {
    const mapa = await carregarMapaRepresentantes();

    const login = String(
      sessao.codigo_representante || sessao.usuario || ""
    ).trim().replace(/\.0+$/, "");

    const oficial = normalizarRepresentante(login, mapa);
    const cadastro = mapa.cadastro.get(oficial.codigo);

    if (cadastro?.ativo && oficial.supervisor) {
      inicial = {
        supervisor: String(oficial.supervisor),
        representante: oficial.codigo
      };
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        nome={nome}
        perfil={perfil}
        usuario={usuario}
      />

      <main className="content">
        <header className="topbar">
          <div>
            <span className="eyebrow">
              INTELIGÊNCIA COMERCIAL
            </span>

            <h1>Venda Mais+</h1>

            <p>
              Planejamento comercial, rotas e clientes prioritários
            </p>
          </div>
        </header>

        <DashboardClient inicial={inicial} />
      </main>
    </div>
  );
}