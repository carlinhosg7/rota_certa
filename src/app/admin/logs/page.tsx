import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

import { validarToken } from "@/lib/auth";
import LogsClient, { type LogAcesso } from "./LogsClient";

import "./logs.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LogsPage() {
  // =========================================================
  // 1. VALIDAR SESSÃO
  // =========================================================

  const cookieStore = await cookies();

  const token = cookieStore.get("kidy_session")?.value;

  if (!token) {
    redirect("/");
  }

  const usuario: any = await validarToken(token);

  if (!usuario) {
    redirect("/");
  }

  // =========================================================
  // 2. VALIDAR PERFIL ADMIN
  // =========================================================

  const perfil = String(usuario.perfil || "")
    .trim()
    .toUpperCase();

  if (perfil !== "ADMIN") {
    redirect("/dashboard");
  }

  // =========================================================
  // 3. VARIÁVEIS SUPABASE
  // =========================================================

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !supabaseSecretKey) {
    console.error(
      "[ADMIN LOGS] SUPABASE_URL ou SUPABASE_SECRET_KEY não configurada."
    );

    return (
      <main className="logs-page">
        <div className="logs-container">
          <div className="logs-header">
            <div>
              <span className="logs-eyebrow">
                KIDY SALES INTELLIGENCE
              </span>

              <h1>Logs de acesso</h1>

              <p>
                Não foi possível conectar ao banco de dados.
              </p>
            </div>

            <a href="/dashboard" className="logs-back">
              ← Voltar
            </a>
          </div>
        </div>
      </main>
    );
  }

  // =========================================================
  // 4. CLIENTE SUPABASE
  // =========================================================

  const supabase = createClient(
    supabaseUrl,
    supabaseSecretKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  // =========================================================
  // 5. CARREGAR LOGS
  // =========================================================

  const { data, error } = await supabase
    .from("log_acesso")
    .select(`
      id,
      usuario,
      nome,
      perfil,
      codigo_representante,
      data_hora,
      ip,
      cidade,
      estado,
      pais,
      latitude,
      longitude,
      dispositivo,
      navegador,
      sistema_operacional,
      session_id,
      evento
    `)
    .order("data_hora", {
      ascending: false,
    })
    .limit(5000);

  if (error) {
    console.error(
      "[ADMIN LOGS] Erro Supabase:",
      error
    );
  }

  const logs: LogAcesso[] = (data ?? []).map(
    (log: any) => ({
      id: Number(log.id),

      usuario:
        log.usuario != null
          ? String(log.usuario)
          : null,

      nome:
        log.nome != null
          ? String(log.nome)
          : null,

      perfil:
        log.perfil != null
          ? String(log.perfil)
          : null,

      codigo_representante:
        log.codigo_representante != null
          ? String(log.codigo_representante)
          : null,

      data_hora:
        log.data_hora != null
          ? String(log.data_hora)
          : null,

      ip:
        log.ip != null
          ? String(log.ip)
          : null,

      cidade:
        log.cidade != null
          ? String(log.cidade)
          : null,

      estado:
        log.estado != null
          ? String(log.estado)
          : null,

      pais:
        log.pais != null
          ? String(log.pais)
          : null,

      latitude:
        log.latitude != null
          ? Number(log.latitude)
          : null,

      longitude:
        log.longitude != null
          ? Number(log.longitude)
          : null,

      dispositivo:
        log.dispositivo != null
          ? String(log.dispositivo)
          : null,

      navegador:
        log.navegador != null
          ? String(log.navegador)
          : null,

      sistema_operacional:
        log.sistema_operacional != null
          ? String(log.sistema_operacional)
          : null,

      session_id:
        log.session_id != null
          ? String(log.session_id)
          : null,

      evento:
        log.evento != null
          ? String(log.evento)
          : null,
    })
  );

  // =========================================================
  // 6. TELA
  // =========================================================

  return (
    <main className="logs-page">
      <div className="logs-container">

        <header className="logs-header">
          <div>
            <span className="logs-eyebrow">
              KIDY SALES INTELLIGENCE
            </span>

            <h1>Logs de acesso</h1>

            <p>
              Monitoramento de acessos e utilização da plataforma.
            </p>
          </div>

          <div className="logs-header-actions">
            <div className="logs-admin-info">
              <strong>
                {usuario.nome ||
                  usuario.usuario ||
                  "Administrador"}
              </strong>

              <span>ADMIN</span>
            </div>

            <a
              href="/dashboard"
              className="logs-back"
            >
              ← Voltar ao sistema
            </a>
          </div>
        </header>

        {error ? (
          <div className="logs-error">
            Não foi possível carregar os registros de acesso.
            Verifique a tabela logs_acesso no Supabase.
          </div>
        ) : (
          <>
            <section className="logs-summary">
              <div>
                <small>TOTAL DE REGISTROS</small>

                <strong>
                  {logs.length.toLocaleString("pt-BR")}
                </strong>
              </div>

              <div>
                <small>USUÁRIOS</small>

                <strong>
                  {
                    new Set(
                      logs
                        .map((x) => x.usuario)
                        .filter(Boolean)
                    ).size
                  }
                </strong>
              </div>

              <div>
                <small>REPRESENTANTES</small>

                <strong>
                  {
                    new Set(
                      logs
                        .map(
                          (x) =>
                            x.codigo_representante
                        )
                        .filter(Boolean)
                    ).size
                  }
                </strong>
              </div>

              <div>
                <small>EVENTOS</small>

                <strong>
                  {
                    new Set(
                      logs
                        .map((x) => x.evento)
                        .filter(Boolean)
                    ).size
                  }
                </strong>
              </div>
            </section>

            <LogsClient logs={logs} />
          </>
        )}

      </div>
    </main>
  );
}