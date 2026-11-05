import Link from "next/link";
import type { ReactNode } from "react";

export default function TreinamentoRetornoLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <div
        style={{
          maxWidth: 1100,
          margin: "12px auto 0",
          padding: "0 16px",
        }}
      >
        <Link
          href="/campanha/treinamentos"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "9px 12px",
            color: "#b45309",
            backgroundColor: "#fff",
            border: "1px solid #fed7aa",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          ← Voltar ao Treinamento Saúde e Conforto
        </Link>
      </div>

      {children}
    </>
  );
}