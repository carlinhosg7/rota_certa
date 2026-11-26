"use client";
import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function ColetorNavegacao() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ultimo = useRef("");

  useEffect(() => {
    if (!pathname || pathname.startsWith("/api/") || pathname === "/") return;

    // Coletar somente identificadores de cliente/grupo. Nunca armazenar a query completa.
    let recurso: string | null = null;
    const cliente = pathname.match(/^\/cliente\/([^/]+)\/?$/);
    if (cliente) recurso = decodeURIComponent(cliente[1]);
    if (pathname.startsWith("/carteira/grupos")) {
      recurso = searchParams.get("grupo") || null;
    }
    if (recurso) recurso = recurso.trim().slice(0, 160);

    const chave = `${pathname}|${recurso || ""}`;
    if (ultimo.current === chave) return;
    ultimo.current = chave;

    void fetch("/api/evento", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evento: "ACESSO_TELA", rota: pathname, recurso }),
    }).catch(() => {
      // Nao interrompe a navegacao quando a auditoria esta indisponivel.
    });
  }, [pathname, searchParams]);

  return null;
}

export default function RegistroNavegacao() {
  return <Suspense fallback={null}><ColetorNavegacao /></Suspense>;
}