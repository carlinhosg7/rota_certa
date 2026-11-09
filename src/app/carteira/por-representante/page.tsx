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
import { carregarMapaRepresentantes, normalizarRepresentante } from "@/lib/representantes-oficiais";
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

  const [dados, mapa, repsAutorizados, regionaisAutorizadas] = await Promise.all([
    carregarCarteira2027(),
    carregarMapaRepresentantes(),
    representantesPermitidos(sessao),
    perfil === "REPRESENTANTE" || perfil === "REP"
      ? Promise.resolve(null)
      : regionaisPermitidas(sessao),
  ]);

  const normalizar = (valor: unknown) => codigo(valor);
  const autorizado = (rep: string, sup: string) =>
    (repsAutorizados === null || repsAutorizados.includes(rep)) &&
    (regionaisAutorizadas === null || regionaisAutorizadas.has(sup));

  const cadastro = [...mapa.cadastro.values()]
    .filter(r => r.ativo && Boolean(normalizar(r.codigo_supervisor)))
    .filter(r => autorizado(normalizar(r.codigo_rep), normalizar(r.codigo_supervisor)));

  const porSupervisor = new Map<string, {
    codigo: string;
    nome: string;
    representantes: { codigo: string; nome: string }[];
  }>();
  for (const r of cadastro) {
    const sup = normalizar(r.codigo_supervisor);
    const item = porSupervisor.get(sup) ?? {
      codigo: sup, nome: r.regional || sup, representantes: [],
    };
    item.representantes.push({
      codigo: normalizar(r.codigo_rep), nome: r.nome_rep || normalizar(r.codigo_rep),
    });
    porSupervisor.set(sup, item);
  }
  const hierarquia = [...porSupervisor.values()]
    .sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }))
    .map(s => ({ ...s, representantes: s.representantes.sort(
      (a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true })
    ) }));

  // Atribuicao de clientes: prioriza o responsavel atual, depois um De/Para
  // historico somente quando o destino oficial for unico e sem ambiguidades.
  // Nenhum cliente e contado duas vezes; vinculos sem correspondencia permanecem
  // sem representante, visiveis apenas para usuarios de acesso nacional.
  const clientes = dados.clientes
    .filter(c => c.situacao === 'REATIVACAO' &&
      String(c.situacaoEmpresa ?? '').trim().toUpperCase() !== 'BAIXADA')
    .flatMap(c => {
      const atuais = Array.isArray(c.representanteAtual) ? c.representanteAtual : [];
      const antigos = Array.isArray(c.representantes) ? c.representantes : [];
      const identificar = (v: unknown) => {
        const codigoAtual = normalizarRepresentante(normalizar(v), mapa).codigo;
        const r = mapa.cadastro.get(codigoAtual);
        return r?.ativo && normalizar(r.codigo_supervisor) ? r : null;
      };
      const atuaisValidos = atuais
        .map(r => identificar(r.codigo))
        .filter((r): r is NonNullable<typeof r> => r !== null);
      const historicosValidos = antigos
        .map(r => identificar(r.codigo))
        .filter((r): r is NonNullable<typeof r> => r !== null);
      const unicos = (arr: typeof atuaisValidos) =>
        [...new Map(arr.map(r => [normalizar(r.codigo_rep), r])).values()];
      const candidatos = unicos(atuaisValidos);
      const reserva = unicos(historicosValidos);
      const responsavel = candidatos[0] ?? (reserva.length === 1 ? reserva[0] : null);
      const rep = responsavel ? normalizar(responsavel.codigo_rep) : '';
      const sup = responsavel ? normalizar(responsavel.codigo_supervisor) : '';
      if (responsavel && !autorizado(rep, sup)) return [];
      if (!responsavel && !acessoGlobal(sessao)) return [];
      return [{
        ...c,
        representanteAtual: responsavel ? [{
          codigo: rep, nome: responsavel.nome_rep || rep,
        }] : [],
        supervisores: responsavel ? [{
          codigo: sup, nome: responsavel.regional || sup,
        }] : [],
      }];
    });

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

        <Carteira02Gestao clientes={clientes} hierarquia={hierarquia} />
      </div>
    </main>
  );
}