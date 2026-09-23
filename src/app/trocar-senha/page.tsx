"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function TrocarSenhaPage() {
  const router = useRouter();

  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function alterarSenha(e: FormEvent) {
    e.preventDefault();

    setErro("");

    if (novaSenha.length < 6) {
      setErro("A senha deve possuir pelo menos 6 caracteres.");
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setErro("As senhas informadas não são iguais.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/trocar-senha", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          novaSenha,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setErro(
          data.erro ||
            "Não foi possível alterar a senha."
        );
        return;
      }

      router.replace("/dashboard");

    } catch (error) {
      console.error(
        "Erro ao trocar senha:",
        error
      );

      setErro(
        "Não foi possível conectar ao servidor."
      );

    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">

      <section className="login-brand">

        <div>
          <span>
            KIDY SALES INTELLIGENCE
          </span>

          <h1>
            Segurança também faz parte da inteligência.
          </h1>

          <p>
            Defina sua nova senha para continuar utilizando
            a plataforma.
          </p>
        </div>

      </section>

      <section className="login-side">

        <form
          onSubmit={alterarSenha}
          className="login-card"
        >

          <span className="eyebrow">
            PRIMEIRO ACESSO
          </span>

          <h2>
            Crie sua nova senha
          </h2>

          <p>
            Por segurança, altere sua senha antes de continuar.
          </p>

          <label>
            Nova senha

            <input
              type="password"
              value={novaSenha}
              onChange={(e) =>
                setNovaSenha(e.target.value)
              }
              autoComplete="new-password"
              placeholder="Digite sua nova senha"
              required
            />
          </label>

          <label>
            Confirmar senha

            <input
              type="password"
              value={confirmarSenha}
              onChange={(e) =>
                setConfirmarSenha(e.target.value)
              }
              autoComplete="new-password"
              placeholder="Digite novamente"
              required
            />
          </label>

          {erro && (
            <div className="login-error">
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Alterando senha..."
              : "Criar nova senha"}
          </button>

          <small>
            © 2026 KIDY • Sales Intelligence
          </small>

        </form>

      </section>

    </main>
  );
}