import { cookies } from "next/headers";
import { validarToken } from "@/lib/auth";
import { NextResponse } from 'next/server';
import municipios from '../../../../data/share-municipios.json';
import { calcularShareMedio, gerentePorSupervisor, ultimoAnoCompleto, shareReal } from '../../../lib/share';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Historico = Record<string, Record<string, number>>;
async function carregarVendas(): Promise<Historico | null> {
  try {
    const arquivo = path.join(process.cwd(), 'data', 'share-vendas-anuais.json');
    return JSON.parse(await readFile(arquivo, 'utf8')) as Historico;
  } catch { return null; }
}
export async function GET() {

  const token = (await cookies()).get("kidy_session")?.value;

  if (!token) {
    return NextResponse.json(
      { erro: "Nao autenticado" },
      { status: 401 }
    );
  }

  const usuario = await validarToken(token);

  if (!usuario) {
    return NextResponse.json(
      { erro: "Sessao invalida" },
      { status: 401 }
    );
  }

  const perfil = String(usuario.perfil || "").toUpperCase();

  if (perfil !== "ADMIN") {
    return NextResponse.json(
      { erro: "Sem permissao" },
      { status: 403 }
    );
  }

  // IMPORTANTE: adaptar esta rota Ã  autenticaÃ§Ã£o jÃ¡ existente no KIDY antes de publicar.
  const vendas = await carregarVendas();
  const cidades = municipios.map(c => {
    const historico = vendas ? (vendas[String(c.codigo_ibge)] ?? {}) : null;
    const temUltimoAno = historico !== null && Object.prototype.hasOwnProperty.call(historico, String(ultimoAnoCompleto));
    return {
      ...c, gerente: gerentePorSupervisor(c.supervisor), vendas_ano: historico,
      share_medio_historico: historico ? calcularShareMedio(historico, c.potencial_pares, ultimoAnoCompleto) : null,
      share_ultimo_ano: historico ? shareReal(Number(historico[String(ultimoAnoCompleto)] ?? 0), c.potencial_pares) : null,
    };
  });
  return NextResponse.json({ cidades, ultimoAnoCompleto, vendasDisponiveis: vendas !== null,
    observacao: vendas ? 'Vendas dos Parquets importadas.' : 'Vendas nÃ£o carregadas; execute importar-vendas-parquet.py.' });
}
