import "server-only";
import { randomUUID } from "node:crypto";
import type { ClienteCarteira } from "./carteira-2027-data";

type Carteira = {
  clientes: ClienteCarteira[];
  resumo: Record<string, unknown>;
};

type Snapshot = {
  id: string;
  total_clientes: number;
  resumo: Record<string, unknown>;
  status: string;
};

function configuracao() {
  const base = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ""
  ).replace(/\/$/, "");

  const chave = process.env.SUPABASE_SECRET_KEY || "";

  if (!base || !chave) {
    throw new Error("Credenciais Supabase ausentes.");
  }

  return {
    base,
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
    },
  };
}

async function requisicao(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const { headers } = configuracao();

  const resposta = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(60000),
    headers: {
      ...headers,
      ...(init.headers || {}),
    },
  });

  if (!resposta.ok) {
    const erro = await resposta.text();

    throw new Error(
      `Supabase HTTP ${resposta.status}: ${erro.slice(0, 500)}`
    );
  }

  return resposta;
}

export async function gravarSnapshotCarteira(
  carteira: Carteira
) {
  const { base } = configuracao();
  const id = randomUUID();
  const clientes = carteira.clientes;

  if (!clientes.length) {
    throw new Error("Carteira vazia. Atualizacao cancelada.");
  }

  const codigos = new Set(
    clientes.map(c => c.codigoCliente)
  );

  if (codigos.size !== clientes.length) {
    throw new Error("Existem codigos de clientes duplicados.");
  }

  const urlSnapshots =
    `${base}/rest/v1/kidy_carteira_snapshots`;

  await requisicao(urlSnapshots, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      id,
      total_clientes: clientes.length,
      resumo: carteira.resumo,
      status: "CARREGANDO",
    }),
  });

  try {
    const urlClientes =
      `${base}/rest/v1/kidy_carteira_clientes`;

    for (let i = 0; i < clientes.length; i += 100) {
      const lote = clientes.slice(i, i + 100).map(c => ({
        snapshot_id: id,
        codigo_cliente: c.codigoCliente,
        dados: c,
      }));

      await requisicao(urlClientes, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(lote),
      });

      console.log(
        `[SNAPSHOT] ${Math.min(i + 100, clientes.length)}/${clientes.length}`
      );
    }

    const contagem = await requisicao(
      `${urlClientes}?select=codigo_cliente&snapshot_id=eq.${id}&limit=1`,
      {
        method: "HEAD",
        headers: {
          Prefer: "count=exact",
        },
      }
    );

    const contentRange =
      contagem.headers.get("content-range") || "";

    const gravados = Number(
      contentRange.split("/")[1]
    );

    if (
      !Number.isFinite(gravados) ||
      gravados !== clientes.length
    ) {
      throw new Error(
        `Carga incompleta: ${gravados}/${clientes.length}`
      );
    }

    await requisicao(
      `${urlSnapshots}?id=eq.${id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "PRONTO",
        }),
      }
    );

    await requisicao(
      `${base}/rest/v1/kidy_carteira_config?on_conflict=chave`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          chave: "ATIVO",
          snapshot_ativo: id,
          atualizado_em: new Date().toISOString(),
        }),
      }
    );

    console.log(
      `[SNAPSHOT] Ativado: ${id} - ${gravados} clientes`
    );

    return {
      id,
      clientes: gravados,
    };
  } catch (erro) {
    try {
      await requisicao(
        `${urlSnapshots}?id=eq.${id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "ERRO",
          }),
        }
      );
    } catch (erroStatus) {
      console.error(
        "[SNAPSHOT] Falha registrando erro:",
        erroStatus
      );
    }

    throw erro;
  }
}

export async function lerSnapshotCarteira(): Promise<Carteira> {
  const { base } = configuracao();

  const configResp = await requisicao(
    `${base}/rest/v1/kidy_carteira_config?select=snapshot_ativo&chave=eq.ATIVO&limit=1`
  );

  const configuracoes = await configResp.json() as Array<{
    snapshot_ativo: string | null;
  }>;

  const id: string = configuracoes[0]?.snapshot_ativo || "";

  if (!id) {
    throw new Error(
      "Nenhum snapshot ativo. Execute a carga inicial."
    );
  }

  const metaResp = await requisicao(
    `${base}/rest/v1/kidy_carteira_snapshots?select=id,total_clientes,resumo,status&id=eq.${encodeURIComponent(id)}&limit=1`
  );

  const meta = (
    await metaResp.json() as Snapshot[]
  )[0];

  if (!meta || meta.status !== "PRONTO") {
    throw new Error("Snapshot indisponivel.");
  }

  const total = meta.total_clientes;
  const paginas = Math.ceil(total / 1000);

  const resultados: ClienteCarteira[][] =
    new Array(paginas);

  let proxima = 0;

  async function trabalhador() {
    while (proxima < paginas) {
      const pagina = proxima++;
      const inicio = pagina * 1000;

      const resposta = await requisicao(
        `${base}/rest/v1/kidy_carteira_clientes?select=dados&snapshot_id=eq.${encodeURIComponent(id)}&order=codigo_cliente.asc&limit=1000&offset=${inicio}`
      );

      const linhas = await resposta.json() as Array<{
        dados: ClienteCarteira;
      }>;

      const esperado = Math.min(
        1000,
        total - inicio
      );

      if (linhas.length !== esperado) {
        throw new Error(
          `Pagina ${pagina + 1} incompleta.`
        );
      }

      resultados[pagina] = linhas.map(
        linha => linha.dados
      );
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(5, paginas) },
      () => trabalhador()
    )
  );

  const clientes = resultados.flat();

  if (clientes.length !== total) {
    throw new Error(
      `Snapshot incompleto: ${clientes.length}/${total}`
    );
  }

  return {
    clientes,
    resumo: meta.resumo,
  };
}