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

  const [campanhasRepresentantesAbertas, setCampanhasRepresentantesAbertas] =
    useState(false);

  const [treinamentosAbertos, setTreinamentosAbertos] =
    useState(false);

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
    { titulo: "Mapa de Oportunidades", href: "/venda-mais#planejamento", rota: "/venda-mais" },
    { titulo: "Metas", href: "/metas", rota: "/metas" },
    { titulo: "Campanhas Representantes", href: "/campanha", rota: "/campanha" },
    { titulo: "Campanhas de Clientes", href: "/campanhas-clientes", rota: "/campanhas-clientes" },
    { titulo: "Treinamentos", href: "/campanha/treinamentos", rota: "/campanha/treinamentos" },
    { titulo: "Share", href: "/share", rota: "/share" },
    { titulo: "Gestão de Atendimentos", href: "/gestao-atendimentos", rota: "/gestao-atendimentos" },
    { titulo: "Gestão de Carteira 2027", href: "/carteira", rota: "/carteira" },
    { titulo: "Carteira 02 por Representante", href: "/carteira/por-representante", rota: "/carteira/por-representante" }
  ];
  const ehRepresentante =
    ["REPRESENTANTE", "REP"].includes(perfil.trim().toUpperCase());

  const menusRepresentante = new Set([
    "Metas",
    "Campanhas Representantes",
    "Campanhas de Clientes",
    "Treinamentos",
    "Gestão de Carteira 2027",
  ]);

  const ehDemoRep = usuario.trim().toLowerCase() === "demo.rep";

  const ehPreposto =
    ehRepresentante &&
    ((/^\d{5,}$/.test(usuario.trim()) || usuario.trim().toLowerCase() === "demo.rep3") || usuario.trim().toLowerCase() === "demo.rep3");

  const itensVisiveis = ehRepresentante
    ? itens.filter(item =>
        (menusRepresentante.has(item.titulo) &&
         !(ehPreposto && item.titulo === "Campanhas Representantes")) ||
        (ehDemoRep && item.rota === "/venda-mais")
      )
    : itens;


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
      <Link href="/dashboard" className="brand" style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}>
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
      </Link>

            <nav style={{ display: "grid", gap: 5 }}>
        {itensVisiveis.map(item => {
          const ativo =
            pathname === item.rota ||
            (
              item.rota !== "/campanha" &&
              pathname.startsWith(item.rota + "/")
            );

          if (item.titulo === "Campanhas Representantes") {
            return (
              <div key={item.titulo}>
                <div style={{
                  display: "flex",
                  alignItems: "stretch",
                  gap: 4
                }}>
                  <Link
                    href="/campanhas-representantes"
                    style={{
                      ...estiloLink(
                        pathname === "/campanhas-representantes" ||
                        pathname === "/campanha"
                      ),
                      flex: 1,
                      minWidth: 0
                    }}
                  >
                    Campanhas Representantes
                  </Link>

                  <button
                    type="button"
                    onClick={() =>
                      setCampanhasRepresentantesAbertas(v => !v)
                    }
                    aria-expanded={campanhasRepresentantesAbertas}
                    aria-label="Abrir ou fechar campanhas representantes"
                    style={{
                      border: "1px solid #f0c88f",
                      background: "#fff7ed",
                      color: "#9a3412",
                      borderRadius: 8,
                      padding: "0 12px",
                      fontSize: 18,
                      cursor: "pointer"
                    }}
                  >
                    {campanhasRepresentantesAbertas ? "▾" : "▸"}
                  </button>
                </div>

                {campanhasRepresentantesAbertas && (
                  <div style={{
                    marginLeft: 16,
                    paddingLeft: 8,
                    borderLeft: "2px solid #f97316",
                    display: "grid",
                    gap: 3
                  }}>
                    <Link
                      href="/campanha"
                      style={{
                        ...estiloLink(pathname === "/campanha"),
                        padding: "10px 12px",
                        fontSize: 12
                      }}
                    >
                      ↳ Conquiste sua Amostra
                    </Link>

                    <Link
                      href="/campanhas-representantes#kidex-bolso"
                      style={{
                        ...estiloLink(false),
                        padding: "10px 12px",
                        fontSize: 12
                      }}
                    >
                      ↳ Campanhas Ativas
                    </Link>
                  </div>
                )}
              </div>
            );
          }

          if (item.titulo === "Treinamentos") {
            const treinamentoAtivo =
              pathname === "/campanha/treinamentos" ||
              pathname === "/campanha/aprovacao" ||
              pathname === "/campanha/marketing";

            return (
              <div key={item.titulo}>
                <button
                  type="button"
                  onClick={() => setTreinamentosAbertos(v => !v)}
                  aria-expanded={treinamentosAbertos}
                  style={{
                    ...estiloLink(treinamentoAtivo),
                    width: "100%",
                    border: 0,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    textAlign: "left"
                  }}
                >
                  <span>Treinamentos</span>
                  <span>{treinamentosAbertos ? "▾" : "▸"}</span>
                </button>

                {treinamentosAbertos && (
                  <div style={{
                    marginLeft: 16,
                    paddingLeft: 8,
                    borderLeft: "2px solid #f97316",
                    display: "grid",
                    gap: 3
                  }}>
                    <Link
                      href="/campanha/treinamentos"
                      style={{
                        ...estiloLink(
                          pathname === "/campanha/treinamentos"
                        ),
                        fontSize: 12,
                        padding: "10px 12px"
                      }}
                    >
                      ↳ Treinamento Saúde e Conforto
                    </Link>

                    {[
                      "ADMIN",
                      "ADMINISTRADOR",
                      "DIRETOR",
                      "GERENTE",
                      "SUPERVISOR"
                    ].includes(perfil.toUpperCase()) && (
                      <Link
                        href="/campanha/aprovacao"
                        style={{
                          ...estiloLink(
                            pathname === "/campanha/aprovacao"
                          ),
                          fontSize: 12,
                          padding: "10px 12px"
                        }}
                      >
                        ↳ Aprovação do Gestor
                      </Link>
                    )}

                    {(
                      ["ADMIN", "ADMINISTRADOR"].includes(
                        perfil.toUpperCase()
                      ) ||
                      ["jack.helena", "jessica"].includes(
                        usuario.trim().toLowerCase()
                      )
                    ) && (
                      <Link
                        href="/campanha/marketing"
                        style={{
                          ...estiloLink(
                            pathname === "/campanha/marketing"
                          ),
                          fontSize: 12,
                          padding: "10px 12px"
                        }}
                      >
                        ↳ Feedback do Marketing
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          }

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

        {!ehRepresentante && (
          <>
            <Link
              href="/gestao-reativacao"
              style={estiloLink(pathname === "/gestao-reativacao")}
            >
              Gestão de Reativação
            </Link>

            <Link
              href="/reativacao"
              style={{
                ...estiloLink(pathname === "/reativacao"),
                marginLeft: 22,
                fontSize: 12,
                borderLeft: "2px solid #f97316"
              }}
            >
              ↳ Ranking de Reativação
            </Link>
          </>
        )}

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
              style={estiloLink(
                pathname.startsWith("/admin/representantes")
              )}
            >
              Representantes
            </Link>

            <Link
              href="/admin/logs"
              style={estiloLink(
                pathname.startsWith("/admin/logs")
              )}
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