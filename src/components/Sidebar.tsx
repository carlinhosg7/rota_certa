"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Props = {
  nome: string;
  perfil: string;
  usuario: string;
};

export default function Sidebar({ nome, perfil, usuario }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const [recolhido, setRecolhido] = useState(false);

  useEffect(() => {
    try {
      setRecolhido(
        localStorage.getItem("kidy-sidebar-collapsed") === "1"
      );
    } catch {
      // Navegador sem armazenamento disponivel.
    }
  }, []);

  function alternarSidebar() {
    setRecolhido(atual => {
      const proximo = !atual;

      try {
        localStorage.setItem(
          "kidy-sidebar-collapsed",
          proximo ? "1" : "0"
        );
      } catch {
        // Mantem o controle funcionando sem armazenamento.
      }

      return proximo;
    });
  }

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  const itens = [

    { titulo: "Visão Comercial", href: "/dashboard#planejamento", rota: "/dashboard" },
    { titulo: "Venda Mais+", href: "/dashboard#venda-mais", rota: "" },
    { titulo: "Análise Preditiva", href: "/dashboard#clientes", rota: "" },
    { titulo: "Metas", href: "/metas", rota: "/metas" },
    { titulo: "Gestão de Carteira 2027", href: "/carteira", rota: "/carteira" }
  ];

  const estiloLink = (ativo: boolean): React.CSSProperties => ({
    display: "block",
    padding: "12px 14px",
    borderRadius: 10,
    textDecoration: "none",
    color: ativo ? "#9a3412" : "#422006",
    background: ativo ? "#fff7ed" : "transparent",
    fontWeight: ativo ? 800 : 600,
    fontSize: 14,
    lineHeight: 1.35
  });

  if (recolhido) {
    return (
      <aside className="sidebar is-collapsed">
        <button
          type="button"
          className="sidebar-toggle"
          onClick={alternarSidebar}
          title="Exibir menu lateral"
          aria-label="Exibir menu lateral"
          aria-expanded={false}
        >
          ☰
        </button>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <button
        type="button"
        className="sidebar-toggle"
        onClick={alternarSidebar}
        title="Ocultar menu lateral"
        aria-label="Ocultar menu lateral"
        aria-expanded={true}
      >
        ☰ Ocultar menu
      </button>
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

      <nav style={{ display: "grid", gap: 5 }}>
        {itens.map(item => {
          const ativo = item.rota === "/dashboard"
            ? pathname === "/dashboard"
            : Boolean(item.rota) &&
              (pathname === item.rota ||
                pathname.startsWith(item.rota + "/"));

          return (
            <Link
              key={item.titulo}
              href={item.href}
              style={estiloLink(ativo)}
            >
              {item.titulo}
            </Link>
          );
        })}

                <Link
          href="/gestao-reativacao"
          style={{
            ...estiloLink(pathname === "/gestao-reativacao"),
            marginLeft: 22,
            paddingLeft: 14,
            fontSize: 12,
            borderLeft: "2px solid #f97316",
          }}
        >
          Gestão de Reativação
        </Link>

        <Link
          href="/reativacao"
          style={{
            ...estiloLink(pathname === "/reativacao"),
            marginLeft: 22,
            paddingLeft: 14,
            fontSize: 12,
            borderLeft: "2px solid #f97316",
          }}
        >
          ↳ Ranking de Reativação
        </Link>

        {perfil.toUpperCase() === "ADMIN" && (
          <>
            <div style={{
              marginTop: 15,
              padding: "8px 14px 4px",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 1,
              color: "#78350f"
            }}>
              ADMINISTRAÇÃO
            </div>

            <Link
              href="/admin/representantes"
              style={estiloLink(pathname.startsWith("/admin/representantes"))}
            >
              Representantes
            </Link>

            <Link
              href="/admin/logs"
              style={estiloLink(pathname.startsWith("/admin/logs"))}
            >
              Logs de Acesso
            </Link>
          </>
        )}
      </nav>

      <div className="userbox">
        <small>USUÁRIO</small>
        <strong>{nome || usuario}</strong>
        <span>{perfil}</span>
        <button onClick={sair}>Sair</button>
      </div>
    </aside>
  );
}