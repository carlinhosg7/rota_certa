"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

type Props = {
  nome: string;
  perfil: string;
  usuario: string;
};

export default function Sidebar({
  nome,
  perfil,
  usuario,
}: Props) {
  const router = useRouter();

  async function sair() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });

    router.replace("/");
    router.refresh();
  }

  return (
    <aside className="sidebar">

      <div className="brand">
        <Image
          src="/logo-kidy.png"
          alt="KIDY"
          width={150}
          height={100}
          priority
        />

        <div>
          <b>KIDY</b>
          <span>Sales Intelligence</span>
        </div>
      </div>

      <nav>

        <a className="active" href="/dashboard#planejamento">
          ⌂ Visão Comercial
        </a>

        <a href="/dashboard#venda-mais">
          ◎ Venda Mais+
        </a>

        <a href="/dashboard#clientes">
          ◉ Clientes
        </a>

        <a href="/dashboard#clientes">
          ✦ Análise Preditiva
        </a>

        {perfil === "ADMIN" && (
          <a href="/admin/logs">
            ▦ Logs de Acesso
          </a>
        )}

      </nav>

      <div className="userbox">

        <small>USUÁRIO</small>

        <strong>
          {nome || usuario}
        </strong>

        <span>
          {perfil}
        </span>

        <button onClick={sair}>
          Sair
        </button>

      </div>

    </aside>
  );
}