"use client";
import Image from "next/image";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter(); const [usuario,setUsuario]=useState(""); const [senha,setSenha]=useState(""); const [erro,setErro]=useState(""); const [loading,setLoading]=useState(false);
  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setLoading(true);

    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ usuario, senha }),
      });

      const d = await r.json();

      // Temporário: ajuda a validar o fluxo no DevTools.
      console.log("RESPOSTA LOGIN:", d);

      if (!r.ok) {
        setErro(d.erro || "Falha no login.");
        return;
      }

      // Usuários marcados para troca obrigatória não entram no dashboard.
      if (d.trocar_senha === true) {
        console.log("REDIRECIONANDO PARA TROCA DE SENHA");
        router.replace("/trocar-senha");
        return;
      }

      console.log("REDIRECIONANDO PARA DASHBOARD");
      router.replace("/dashboard");
    } catch (error) {
      console.error("ERRO LOGIN:", error);
      setErro("Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }
  return <main className="login-page"><section className="login-brand"><Image src="/logo-kidy.png" alt="KIDY" width={360} height={250} priority /><div><span>KIDY SALES INTELLIGENCE</span><h1>Inteligência que transforma dados em rota.</h1><p>Planejamento comercial, priorização de clientes e análise preditiva em uma única plataforma.</p></div></section><section className="login-side"><form onSubmit={entrar} className="login-card"><span className="eyebrow">ACESSO RESTRITO</span><h2>Bem-vindo</h2><p>Entre com seu usuário e senha.</p><label>Usuário<input value={usuario} onChange={e=>setUsuario(e.target.value)} autoComplete="username" placeholder="Usuário / código" /></label><label>Senha<input type="password" value={senha} onChange={e=>setSenha(e.target.value)} autoComplete="current-password" placeholder="Sua senha" /></label>{erro&&<div className="login-error">{erro}</div>}<button disabled={loading}>{loading?"Entrando...":"Entrar"}</button><small>© 2026 KIDY • Sales Intelligence</small></form></section></main>;
}
