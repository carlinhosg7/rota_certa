"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function GlobalLoading() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function iniciar(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

      const alvo = event.target;
      if (!(alvo instanceof Element)) return;

      const link = alvo.closest("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (link.target && link.target !== "_self") return;
      if (link.hasAttribute("download")) return;

      const destino = new URL(link.href, window.location.href);

      if (destino.origin !== window.location.origin) return;

      const atual = window.location.pathname + window.location.search;
      const proximo = destino.pathname + destino.search;

      if (atual === proximo) return;

      setLoading(true);
    }

    document.addEventListener("click", iniciar, true);

    return () => {
      document.removeEventListener("click", iniciar, true);
    };
  }, []);

  useEffect(() => {
    setLoading(false);
  }, [pathname]);

  useEffect(() => {
    function finalizar() {
      setLoading(false);
    }

    window.addEventListener("popstate", finalizar);
    window.addEventListener("pageshow", finalizar);

    return () => {
      window.removeEventListener("popstate", finalizar);
      window.removeEventListener("pageshow", finalizar);
    };
  }, []);

  if (!loading) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Carregando página"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        background: "rgba(255,255,255,0.78)",
        backdropFilter: "blur(2px)",
      }}
    >
      <style>{`
        @keyframes kidy-loading-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div
        aria-hidden="true"
        style={{
          width: 52,
          height: 52,
          border: "5px solid #fed7aa",
          borderTopColor: "#f97316",
          borderRadius: "50%",
          animation: "kidy-loading-spin 0.75s linear infinite",
        }}
      />

      <span
        style={{
          color: "#9a3412",
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        Carregando, aguarde...
      </span>
    </div>
  );
}