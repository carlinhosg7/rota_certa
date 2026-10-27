"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function GlobalLoadingInterno() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const urlAtual = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    setLoading(false);

    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, [urlAtual]);

  useEffect(() => {
    function finalizar() {
      setLoading(false);

      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
    }

    function iniciar(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;

      if (
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      ) return;

      const alvo = event.target;

      if (!(alvo instanceof Element)) return;

      const link = alvo.closest("a[href]");

      if (!(link instanceof HTMLAnchorElement)) return;

      if (link.target && link.target !== "_self") return;
      if (link.hasAttribute("download")) return;

      const destino = new URL(
        link.href,
        window.location.href
      );

      if (destino.origin !== window.location.origin) return;

      const atual =
        window.location.pathname +
        window.location.search;

      const proximo =
        destino.pathname +
        destino.search;

      if (atual === proximo) return;

      finalizar();
      setLoading(true);

      timer.current = setTimeout(() => {
        console.warn(
          "[GLOBAL LOADING] Limite de 15 segundos atingido."
        );

        setLoading(false);
        timer.current = null;
      }, 15000);
    }

    document.addEventListener("click", iniciar, true);
    window.addEventListener("popstate", finalizar);
    window.addEventListener("pageshow", finalizar);

    return () => {
      document.removeEventListener("click", iniciar, true);
      window.removeEventListener("popstate", finalizar);
      window.removeEventListener("pageshow", finalizar);

      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
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
export default function GlobalLoading() {
  return (
    <Suspense fallback={null}>
      <GlobalLoadingInterno />
    </Suspense>
  );
}