import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validarToken } from "@/lib/auth";
import {
  acessoGlobal,
  regionaisPermitidas,
  representantesPermitidos
} from "@/lib/escopo-acesso";
import { carregarCarteira2027 } from "@/lib/carteira-2027-data";
import Carteira02Gestao from "@/components/Carteira02Gestao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const codigo = (v: unknown) =>
  String(v ?? "").trim().replace(/\.0+$/, "");

export default async function Carteira02PorRepresentante() {
  const token = (await cookies()).get("kidy_session")?.value;

  if (!token) redirect("/");

  const sessao = await validarToken(token);

  if (!sessao) redirect("/");

  const perfil = String(sessao.perfil ?? "").toUpperCase();
  const repLogin = codigo(
    sessao.codigo_representante || sessao.usuario
  );

  const dados = await carregarCarteira2027();

  let clientes = dados.clientes.filter(
    c =>
      c.situacao === "REATIVACAO" &&
      String(c.situacaoEmpresa ?? "").trim().toUpperCase()
        !== "BAIXADA"
  );

  if (perfil === "REPRESENTANTE" || perfil === "REP") {
    clientes = clientes.filter(c =>
      c.representantes?.some(r =>
        codigo(r.codigo) === repLogin
      )
    );
  } else if (
    perfil === "SUPERVISOR" || perfil === "GERENTE"
  ) {
    if (!acessoGlobal(sessao)) {
      const regionais = await regionaisPermitidas(sessao);
      clientes = clientes.filter(c =>
        c.supervisores?.some(s =>
          regionais?.has(codigo(s.codigo))
        )
      );
    }
  } else if (!acessoGlobal(sessao)) {
    clientes = [];
  }

  const repsPermitidos = await representantesPermitidos(sessao);

  if (repsPermitidos !== null) {
    clientes = clientes.map(c => ({
      ...c,
      representanteAtual: c.representanteAtual.filter(
        r => repsPermitidos.includes(codigo(r.codigo))
      )
    }));
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: "#f1f5f9",
      padding: "24px"
    }}>
      <div style={{
        maxWidth: 1500,
        margin: "0 auto"
      }}>
        <Link
          href="/carteira"
          style={{
            color: "#1d4ed8",
            fontWeight: 700,
            display: "inline-block",
            marginBottom: 20
          }}
        >
          Voltar para Gestão de Carteira
        </Link>

        <Carteira02Gestao clientes={clientes} />
      </div>
    </main>
  );
}