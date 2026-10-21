"use client";

type Props = {
  mensagem?: string;
  detalhe?: string;
  progresso?: number;
};

export default function KidyLoading({
  mensagem = "Carregando dados...",
  detalhe = "Estamos preparando as informações.",
  progresso
}: Props) {
  const temProgresso =
    typeof progresso === "number" &&
    Number.isFinite(progresso);

  const valor = temProgresso
    ? Math.min(100, Math.max(0, progresso))
    : 25;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={mensagem}
      style={{
        minHeight: 260,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24
      }}
    >
      <div style={{
        textAlign: "center",
        maxWidth: 360,
        width: "100%"
      }}>
        <div style={{
          width: 76,
          height: 76,
          margin: "0 auto 18px",
          position: "relative"
        }}>
          <svg
            viewBox="0 0 80 80"
            width="76"
            height="76"
            style={{
              animation: temProgresso
                ? "none"
                : "kidy-loading-rotate 1.2s linear infinite"
            }}
          >
            <circle
              cx="40"
              cy="40"
              r="32"
              fill="none"
              stroke="#e2e8f0"
              strokeWidth="7"
            />
            <circle
              cx="40"
              cy="40"
              r="32"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={
                temProgresso
                  ? `${valor / 100 * 201} 201`
                  : "52 201"
              }
              transform="rotate(-90 40 40)"
            />
          </svg>

          {temProgresso && (
            <strong style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#92400e",
              fontSize: 16
            }}>
              {Math.round(valor)}%
            </strong>
          )}
        </div>

        <strong style={{
          display: "block",
          fontSize: 17,
          color: "#92400e"
        }}>
          {mensagem}
        </strong>

        <p style={{
          fontSize: 13,
          color: "#64748b",
          marginTop: 8
        }}>
          {detalhe}
        </p>

        <style>{`
          @keyframes kidy-loading-rotate {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @media (prefers-reduced-motion: reduce) {
            svg { animation-duration: 3s !important; }
          }
        `}</style>
      </div>
    </div>
  );
}