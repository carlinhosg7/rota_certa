import "server-only";
import * as XLSX from "xlsx";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validarToken } from "@/lib/auth";
import { carregarCarteira2027 } from "@/lib/carteira-2027-data";
import { acessoGlobal, regionaisPermitidas, representantesPermitidos } from "@/lib/escopo-acesso";
import { carregarMapaRepresentantes, normalizarRepresentante } from "@/lib/representantes-oficiais";
import { obterEscopoPrepostoCarteira, carregarClientesDoPreposto } from "@/lib/escopo-preposto-carteira";
import { listarPrepostosParaFiltro, carregarCodigosClientesPreposto } from "@/lib/prepostos-filtro-carteira";
import { listarGerentesRegionais } from "@/lib/carteira-gerentes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cod = (v: unknown): string => String(v ?? "").trim().replace(/\.0+$/, "");
const norm = (v: unknown): string => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
const semBaixa = (v: unknown): boolean => norm(v).replaceAll("_", " ") !== "BAIXADA";

export async function GET(req: NextRequest) {
  try {
    const token = (await cookies()).get("kidy_session")?.value;
    if (!token) return NextResponse.json({ erro: "Nao autenticado" }, { status: 401 });
    const sessao = await validarToken(token);
    if (!sessao) return NextResponse.json({ erro: "Sessao invalida" }, { status: 401 });

    const q = req.nextUrl.searchParams;
    const carteira = q.get("carteira") ?? "";
    if (carteira !== "ativa" && carteira !== "reativacao") {
      return NextResponse.json({ erro: "Carteira invalida" }, { status: 400 });
    }
    const perfil = norm(sessao.perfil);
    const geral = acessoGlobal(sessao);
    const filtroRep = cod(q.get("representante"));
    const filtroSup = cod(q.get("supervisor"));
    const filtroGerente = norm(q.get("gerente"));
    const filtroReceita = norm(q.get("receita"));
    const busca = norm(String(q.get("busca") ?? "").slice(0,100));
    const mapa = await carregarMapaRepresentantes();
    const preposto = await obterEscopoPrepostoCarteira(sessao);
    const regionais = await regionaisPermitidas(sessao);
    const repsPermitidos = await representantesPermitidos(sessao);
    const normalizarRep = (r: unknown): string => normalizarRepresentante(cod(r), mapa).codigo;

    // Permissoes calculadas no servidor, nunca confiadas a query string.
    const repsAutorizados = repsPermitidos === null ? null : new Set(repsPermitidos.map(normalizarRep));
    const repUsuario = normalizarRep(sessao.codigo_representante || sessao.usuario);
    const idsPreposto = preposto ? await carregarClientesDoPreposto(preposto.usuario) : null;
    const prepostosDisponiveis = filtroRep && !preposto ? await listarPrepostosParaFiltro(sessao, mapa) : [];
    const prepostoSelecionado = prepostosDisponiveis.find(p => p.usuario === filtroRep);
    const idsPrepostoSelecionado = prepostoSelecionado ? await carregarCodigosClientesPreposto(prepostoSelecionado.usuario) : null;
    const gerenteRegionais = filtroGerente
      ? new Set((await listarGerentesRegionais()).filter(r => norm(r.gerente) === filtroGerente).map(r => cod(r.codigo_supervisor)))
      : null;

    const fonte = await carregarCarteira2027();
    const situacaoAlvo = carteira === "ativa" ? "ATIVA" : "REATIVACAO";
    const registros = fonte.clientes.filter(c => {
      const id = cod(c.codigoCliente);
      const reps = (c.representantes ?? []).map(r => normalizarRep(r.codigo));
      const sups = (c.supervisores ?? []).map(s => cod(s.codigo));
      if (c.situacao !== situacaoAlvo || !semBaixa(c.situacaoEmpresa)) return false;
      if (preposto) {
        if (!idsPreposto?.has(id) || !reps.includes(preposto.titular)) return false;
        if (filtroRep && filtroRep !== preposto.usuario) return false;
      } else if (["REPRESENTANTE", "REP"].includes(perfil)) {
        if (!mapa.cadastro.get(repUsuario)?.ativo || !reps.includes(repUsuario)) return false;
        if (filtroRep && !prepostoSelecionado && normalizarRep(filtroRep) !== repUsuario) return false;
      } else if (!geral) {
        if (!regionais || !sups.some(s => regionais.has(s))) return false;
        if (!repsAutorizados || !reps.some(r => repsAutorizados.has(r))) return false;
      }
      if (!geral && !preposto && !["REPRESENTANTE", "REP", "SUPERVISOR", "GERENTE"].includes(perfil)) return false;
      if (filtroSup && !sups.includes(filtroSup)) return false;
      if (gerenteRegionais && !sups.some(s => gerenteRegionais.has(s))) return false;
      if (idsPrepostoSelecionado) {
        if (!idsPrepostoSelecionado.has(id) || !reps.includes(prepostoSelecionado!.codigo_representante_principal)) return false;
      } else if (filtroRep && !preposto) {
        const rep = normalizarRep(filtroRep);
        if (!mapa.cadastro.get(rep)?.ativo || !reps.includes(rep)) return false;
        if (repsAutorizados && !repsAutorizados.has(rep)) return false;
      }
      if (filtroReceita && norm(c.situacaoEmpresa).replaceAll("_", " ") !== filtroReceita) return false;
      if (busca && ![c.codigoCliente,c.razaoSocial,c.grupoCliente,c.cnpj].some(v => norm(v).includes(busca))) return false;
      return true;
    });

    registros.sort((a,b) => String(a.razaoSocial ?? "").localeCompare(String(b.razaoSocial ?? ""), "pt-BR"));
    // Somente dados comerciais: nao exportar tokens, contatos ou outros campos internos.
    const dados = registros.map(c => ({
      "Codigo Cliente": cod(c.codigoCliente),
      "Razao Social": c.razaoSocial ?? "",
      "CNPJ": c.cnpj ?? "",
      "Grupo Cliente": c.grupoCliente ?? "",
      "Cidade": c.cidade ?? "",
      "UF": c.uf ?? "",
      "Representante Codigo": (c.representanteAtual ?? []).map(r=>cod(r.codigo)).join(", "),
      "Representante": (c.representanteAtual ?? []).map(r=>r.nome).join(", "),
      "Supervisor": (c.supervisores ?? []).map(s=>cod(s.codigo)).join(", "),
      "Ultima Compra": c.ultimaCompra ?? "",
      "Situacao Comercial": c.situacao ?? "",
      "Situacao Receita": c.situacaoEmpresa ?? "NAO VERIFICADA",
      "Bloqueio Financeiro": c.bloqueadoFinanceiro ? "SIM" : "NAO",
      "Limite Disponivel": Number(c.limiteDisponivel) || 0,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(dados, { header: ["Codigo Cliente","Razao Social","CNPJ","Grupo Cliente","Cidade","UF","Representante Codigo","Representante","Supervisor","Ultima Compra","Situacao Comercial","Situacao Receita","Bloqueio Financeiro","Limite Disponivel"] });
    ws["!cols"] = [16,42,22,32,22,8,20,36,16,18,24,20,20,20].map(wch=>({wch}));
    XLSX.utils.book_append_sheet(wb, ws, carteira === "ativa" ? "Carteira 01" : "Carteira 02");
    const bytes = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
    const arquivo = new Uint8Array(bytes);
    const nome = `KIDY_CARTEIRA_${carteira === "ativa" ? "01_ATIVA" : "02_REATIVACAO"}_${new Date().toISOString().slice(0,10)}.xlsx`;
    return new Response(arquivo.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${nome}"`,
        "Cache-Control": "no-store, private",
      },
    });
  } catch (erro) {
    console.error("[EXPORTAR CARTEIRA 2027]", erro);
    return NextResponse.json({ erro: "Falha ao exportar carteira" }, { status: 500 });
  }
}