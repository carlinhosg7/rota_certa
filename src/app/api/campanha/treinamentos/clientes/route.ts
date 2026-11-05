import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { validarToken } from '@/lib/auth';
import { representantesPermitidos } from '@/lib/escopo-acesso';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const codigo = (v: unknown) => String(v ?? '').trim().replace(/\.0+$/, '');
const puro = (v: unknown) => String(v ?? '').trim();

type Vinculo = { codigo?: string | number; nome?: string };
type Cliente = {
  codigoCliente?: string | number;
  razaoSocial?: string;
  cidade?: string;
  uf?: string;
  situacao?: string;
  ultimaCompra?: string | null;
  representanteAtual?: Vinculo[];
  representantes?: Vinculo[];
};
type Linha = { codigo_cliente: string | number; dados: Cliente | null };

function credenciais() {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const chave = process.env.SUPABASE_SECRET_KEY || '';
  if (!base || !chave) throw new Error('Credenciais Supabase indisponiveis');
  return { base, headers: { apikey: chave, Authorization: `Bearer ${chave}` } };
}

function idsVinculados(cliente: Cliente): string[] {
  const pessoas = [
    ...(Array.isArray(cliente.representanteAtual) ? cliente.representanteAtual : []),
    ...(Array.isArray(cliente.representantes) ? cliente.representantes : []),
  ];
  return [...new Set(pessoas.map(p => codigo(p?.codigo)).filter(c => /^\d+$/.test(c)))];
}

function formatar(cliente: Cliente, permitido: Set<string> | null) {
  const representantes = idsVinculados(cliente).filter(rep => permitido === null || permitido.has(rep));
  return {
    codigoCliente: codigo(cliente.codigoCliente),
    razaoSocial: puro(cliente.razaoSocial),
    cidade: puro(cliente.cidade),
    uf: puro(cliente.uf),
    situacao: puro(cliente.situacao),
    ultimaCompra: cliente.ultimaCompra ?? null,
    representantes,
  };
}

async function consultarClientes(
  base: string,
  headers: Record<string, string>,
  snapshot: string,
  campo: 'codigo_cliente' | 'dados->>razaoSocial',
  filtro: string,
  limite: number,
): Promise<Linha[]> {
  const url = new URL(`${base}/rest/v1/kidy_carteira_clientes`);
  url.searchParams.set('select', 'codigo_cliente,dados');
  url.searchParams.set('snapshot_id', `eq.${snapshot}`);
  url.searchParams.set(campo, filtro);
  url.searchParams.set('limit', String(limite));
  const resposta = await fetch(url, { headers, cache: 'no-store' });
  if (!resposta.ok) throw new Error(`Busca carteira: HTTP ${resposta.status} ${(await resposta.text()).slice(0,180)}`);
  return await resposta.json() as Linha[];
}

export async function GET(req: NextRequest) {
  try {
    const token = (await cookies()).get('kidy_session')?.value;
    if (!token) return NextResponse.json({ erro: 'Nao autenticado' }, { status: 401 });
    const usuario = await validarToken(token);
    if (!usuario) return NextResponse.json({ erro: 'Sessao invalida' }, { status: 401 });

    const autorizados = await representantesPermitidos(usuario);
    if (autorizados !== null && autorizados.length === 0) {
      return NextResponse.json({ clientes: [], total: 0, motivo: 'Sem representantes autorizados' });
    }
    const permitidos = autorizados === null ? null : new Set(autorizados.map(codigo));
    const busca = puro(req.nextUrl.searchParams.get('q'));
    if (busca.length < 3 || busca.length > 80) {
      return NextResponse.json({ erro: 'Pesquise com 3 a 80 caracteres' }, { status: 400 });
    }
    // Evita que o texto do usuario seja interpretado como operadores PostgREST.
    const somenteNumeros = /^\d+$/.test(busca);
    const buscaTexto = busca.replace(/[^\p{L}\p{N} \-\.]/gu, ' ').trim().replace(/\s+/g, '*');
    if (!somenteNumeros && buscaTexto.length < 3) {
      return NextResponse.json({ erro: 'Informe um nome com pelo menos 3 caracteres' }, { status: 400 });
    }

    const { base, headers } = credenciais();
    const configUrl = new URL(`${base}/rest/v1/kidy_carteira_config`);
    configUrl.searchParams.set('select', 'snapshot_ativo');
    configUrl.searchParams.set('chave', 'eq.ATIVO');
    configUrl.searchParams.set('limit', '1');
    const config = await fetch(configUrl, { headers, cache: 'no-store' });
    if (!config.ok) throw new Error(`Snapshot: HTTP ${config.status}`);
    const valores = await config.json() as Array<{ snapshot_ativo?: string }>;
    const snapshot = valores[0]?.snapshot_ativo;
    if (!snapshot) return NextResponse.json({ erro: 'Carteira ativa indisponivel' }, { status: 503 });

    // Primeiro prioriza codigo exato. Depois pesquisa prefixo; texto usa ilike.
    // Limitacao consciente: sem busca indexada server-side por representante,
    // pesquisas muito amplas podem retornar uma amostra incompleta.
    const limite = 1000;
    const linhas = somenteNumeros
      ? await consultarClientes(base, headers, snapshot, 'codigo_cliente', `like.${busca}*`, limite)
      : await consultarClientes(base, headers, snapshot, 'dados->>razaoSocial', `ilike.*${buscaTexto}*`, limite);

    const encontrados = linhas
      .filter((linha): linha is Linha & { dados: Cliente } => Boolean(linha.dados))
      .map(linha => ({ ...linha.dados, codigoCliente: linha.codigo_cliente }))
      .filter(cliente => idsVinculados(cliente).some(rep => permitidos === null || permitidos.has(rep)))
      .map(cliente => formatar(cliente, permitidos));
    encontrados.sort((a, b) => {
      if (somenteNumeros) {
        const aExato = a.codigoCliente === busca ? 0 : 1;
        const bExato = b.codigoCliente === busca ? 0 : 1;
        if (aExato !== bExato) return aExato - bExato;
      }
      return a.codigoCliente.localeCompare(b.codigoCliente, 'pt-BR', { numeric: true });
    });

    return NextResponse.json({
      clientes: encontrados.slice(0, 50),
      total: Math.min(encontrados.length, 50),
      busca,
      completo: linhas.length < limite,
      aviso: linhas.length >= limite ? 'Pesquisa ampla: informe mais caracteres para refinar' : undefined,
    });
  } catch (e) {
    console.error('[TREINAMENTOS BUSCA CLIENTES]', e);
    return NextResponse.json({ erro: 'Nao foi possivel consultar os clientes' }, { status: 500 });
  }
}
