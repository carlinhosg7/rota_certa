import { createClient } from "@supabase/supabase-js";

const url = (process.env.SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_SECRET_KEY || "").trim();

if (!url) throw new Error("SUPABASE_URL não configurada.");
if (!key) throw new Error("SUPABASE_SECRET_KEY não configurada.");

export const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    fetch: async (input, init) => {
      const inicio = Date.now();

      try {
        const resposta = await fetch(input, {
          ...init,
          cache: "no-store",
        });

        if (resposta.status === 401 || resposta.status === 403) {
          const dataServidor = resposta.headers.get("date");
          const horarioServidor = dataServidor
            ? Date.parse(dataServidor)
            : NaN;

          const diferencaSegundos =
            Number.isFinite(horarioServidor)
              ? Math.round((horarioServidor - Date.now()) / 1000)
              : null;

          console.warn("[SUPABASE JWT DIAG]", {
            status: resposta.status,
            utcAplicacao: new Date().toISOString(),
            utcGateway: dataServidor,
            diferencaSegundos,
            duracaoMs: Date.now() - inicio,
            ambiente: process.env.VERCEL_ENV || "local",
            diagnosticoCache: {
              age: resposta.headers.get("age"),
              cacheControl: resposta.headers.get("cache-control"),
              vercelCache: resposta.headers.get("x-vercel-cache"),
              nextjsCache: resposta.headers.get("x-nextjs-cache"),
              cfCacheStatus: resposta.headers.get("cf-cache-status"),
              via: resposta.headers.get("via"),
              server: resposta.headers.get("server"),
              requestId: resposta.headers.get("sb-request-id"),
            },
          });
        }

        return resposta;
      } catch (erro) {
        console.error("[SUPABASE HTTP DIAG]", {
          utcAplicacao: new Date().toISOString(),
          duracaoMs: Date.now() - inicio,
          erro: erro instanceof Error ? erro.name : "desconhecido",
        });

        throw erro;
      }
    },
  },
});