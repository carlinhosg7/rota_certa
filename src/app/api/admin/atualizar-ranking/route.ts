import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validarToken } from "@/lib/auth";
import { getData, cleanCode } from "@/lib/comercial-data";
import { carregarCarteira2027 } from "@/lib/carteira-2027-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Vinculo = { codigo: string; nome: string };
type Cliente = { codigoCliente: string; razaoSocial: string; grupoCliente: string; situacao: string; situacaoEmpresa: string; faixa: string; representanteAtual: Vinculo[]; supervisores: Vinculo[]; bloqueadoFinanceiro: boolean; limiteDisponivel: number };
type Stat = { pares: number; faturamento: number; ultima: number; anos: Set<number> };
const codigo = (v: unknown) => cleanCode(v);
const texto = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

export async function POST() {
  const token = (await cookies()).get("kidy_session")?.value;
  const usuario = token ? await validarToken(token) : null;
  const perfil = String(usuario?.perfil ?? "").toUpperCase();
  if (!usuario || !["ADMIN", "ADMINISTRADOR"].includes(perfil)) return NextResponse.json({ erro: "Acesso restrito ao administrador" }, { status: 403 });
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const chave = process.env.SUPABASE_SECRET_KEY || "";
  if (!base || !chave) return NextResponse.json({ erro: "Supabase nao configurado" }, { status: 500 });
  const inicio = Date.now();
  try {
    const carteira = await carregarCarteira2027();
    const clientes = (carteira.clientes as Cliente[]).filter(c => c.situacao === "REATIVACAO" && texto(c.situacaoEmpresa) !== "BAIXADA");
    const codigos = new Set(clientes.map(c => codigo(c.codigoCliente)));
    const dados = await getData();
    const stats = new Map<string, Stat>();
    for (const venda of dados.vendas) {
      const cod = codigo(venda.codigo);
      if (!codigos.has(cod)) continue;
      const entrega = venda.dataEntrega instanceof Date ? venda.dataEntrega.getTime() : new Date(venda.dataEntrega || "").getTime();
      if (!Number.isFinite(entrega) || !entrega) continue;
      let s = stats.get(cod);
      if (!s) { s = { pares: 0, faturamento: 0, ultima: 0, anos: new Set<number>() }; stats.set(cod, s); }
      s.pares += Number(venda.qtd) || 0;
      s.faturamento += Number(venda.vlr) || 0;
      s.ultima = Math.max(s.ultima, entrega);
      s.anos.add(new Date(entrega).getFullYear());
    }
    const hoje = Date.now();
    const linhas = clientes.map(c => {
      const cod = codigo(c.codigoCliente);
      const s = stats.get(cod);
      const dias = s?.ultima ? Math.max(0, Math.floor((hoje - s.ultima) / 86400000)) : null;
      const credito = Number(c.limiteDisponivel) || 0;
      const bloqueado = Boolean(c.bloqueadoFinanceiro);
      const score = dias === null ? 0 : Math.round(
        Math.min(40, ((s?.pares || 0) / 5000) * 40) +
        (dias <= 1095 ? 25 : dias <= 1825 ? 18 : dias <= 2555 ? 10 : 4) +
        Math.min(25, (s?.anos.size || 0) * 5) + (!bloqueado && credito > 0 ? 10 : 0)
      );
      const prioridade = dias === null ? "NAO_AVALIADO" : score >= 65 ? "ALTO" : score >= 35 ? "MEDIO" : "BAIXO";
      return { codigo_cliente: cod, nome: c.razaoSocial || "Nao informado", grupo: c.grupoCliente || "", representante: (c.representanteAtual || []).map(r => r.nome || r.codigo).join(", "), supervisor: (c.supervisores || []).map(s => s.nome || s.codigo).join(", "), representantes_codigos: (c.representanteAtual || []).map(r => codigo(r.codigo)), supervisores_codigos: (c.supervisores || []).map(s => codigo(s.codigo)), faixa: c.faixa || "", dias, pares: s?.pares || 0, faturamento: s?.faturamento || 0, credito, bloqueado, score, prioridade_automatica: prioridade, atualizado_em: new Date().toISOString() };
    });
    const url = `${base}/rest/v1/kidy_ranking_reativacao?on_conflict=codigo_cliente`;
    for (let i = 0; i < linhas.length; i += 200) {
      const resposta = await fetch(url, { method: "POST", headers: { apikey: chave, Authorization: `Bearer ${chave}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(linhas.slice(i, i + 200)), cache: "no-store" });
      if (!resposta.ok) throw new Error(`Falha gravando lote ${i}: ${resposta.status} ${await resposta.text()}`);
    }
    return NextResponse.json({ sucesso: true, clientes: linhas.length, segundos: Math.round((Date.now() - inicio) / 1000) });
  } catch (e) {
    console.error("[RANKING SNAPSHOT]", e);
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Falha desconhecida" }, { status: 500 });
  }
}
