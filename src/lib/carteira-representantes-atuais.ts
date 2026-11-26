import "server-only";
import * as XLSX from "xlsx";
import { atualizarCatalogoDrive, lerArquivoComercial } from "./google-drive-adapter";
import { carregarMapaRepresentantes, normalizarRepresentante } from "./representantes-oficiais";
import type { ClienteCarteira } from "./carteira-2027-data";

const NOME_ARQUIVO = "CARTEIRA CLIENTES ATUAL.xlsx";

function cod(v: unknown): string {
  return String(v ?? "").trim().replace(/\.0+$/, "");
}
function cab(v: unknown): string {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim().toUpperCase();
}

type Entrada = { rep: string; nome: string };

async function obterCadastroAtual(): Promise<Map<string, Entrada>> {
  await atualizarCatalogoDrive(true);
  // Fonte oficial: nunca utilizar dados historicos como substituto silencioso.
  const buffer = await lerArquivoComercial(NOME_ARQUIVO);
  const livro = XLSX.read(buffer, { type: "buffer" });
  const aba = livro.Sheets[livro.SheetNames[0]];
  if (!aba) throw new Error(`${NOME_ARQUIVO}: aba ausente`);
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(aba, { header: 1, defval: "" });
  const linhaCab = linhas.findIndex(r => {
    const campos = r.map(cab);
    return campos.includes("CODIGO") && campos.includes("CODIGO REPRESENTANTE") && campos.includes("REPRESENTANTE");
  });
  if (linhaCab < 0) throw new Error(`${NOME_ARQUIVO}: colunas nao encontradas`);
  const colunas = linhas[linhaCab].map(cab);
  const idCol = colunas.indexOf("CODIGO");
  const repCol = colunas.indexOf("CODIGO REPRESENTANTE");
  const nomeCol = colunas.indexOf("REPRESENTANTE");
  const situacaoCol = colunas.indexOf("SITUACAO");
  const mapa = new Map<string, Entrada>();
  let conflitos = 0;
  for (const linha of linhas.slice(linhaCab + 1)) {
    const id = cod(linha[idCol]);
    if (!id) continue;
    const situacao = situacaoCol >= 0 ? cab(linha[situacaoCol]) : "ATIVO";
    if (situacao !== "ATIVO" && situacao !== "ATIVA") continue;
    const rep = cod(linha[repCol]);
    if (!rep) throw new Error(`Cliente ${id} sem codigo representante no cadastro atual`);
    const anterior = mapa.get(id);
    if (anterior && anterior.rep !== rep) conflitos++;
    mapa.set(id, { rep, nome: String(linha[nomeCol] ?? "").trim() });
  }
  if (conflitos) throw new Error(`${NOME_ARQUIVO}: ${conflitos} clientes com representantes conflitantes`);
  if (mapa.size < 10000) throw new Error(`${NOME_ARQUIVO}: apenas ${mapa.size} clientes validos, carga recusada`);
  return mapa;
}

type Carteira = { clientes: ClienteCarteira[]; resumo: Record<string, unknown> };

export async function aplicarRepresentantesAtuaisCarteira(origem: Carteira): Promise<Carteira> {
  const [cadastro, oficiais] = await Promise.all([
    obterCadastroAtual(),
    carregarMapaRepresentantes(),
  ]);
  let encontrados = 0;
  let naoEncontrados = 0;
  let repsNaoValidados = 0;
  const clientes = origem.clientes.map(c => {
    const atual = cadastro.get(cod(c.codigoCliente));
    if (!atual) {
      naoEncontrados++;
      // Falha fechada: nao conceder acesso com base no representante historico.
      return {
        ...c,
        representanteAtual: [],
        supervisores: [],
        flags: [...new Set([...(c.flags ?? []), "SEM_REPRESENTANTE_ATUAL_CADASTRO"])],
      };
    }
    encontrados++;
    const normalizado = normalizarRepresentante(atual.rep, oficiais);
    const ficha = oficiais.cadastro.get(normalizado.codigo);
    const ativo = Boolean(ficha?.ativo);
    if (!ativo) repsNaoValidados++;
    const repAtual = ativo ? [{
      codigo: normalizado.codigo,
      nome: ficha?.nome_rep || atual.nome || normalizado.codigo,
    }] : [];
    const supervisor = ativo && normalizado.supervisor ? [{
      codigo: normalizado.supervisor,
      nome: normalizado.supervisor,
    }] : [];
    const codigoAtual = repAtual[0]?.codigo;
    return {
      ...c,
      representanteAtual: repAtual,
      // O supervisor vigente substitui o historico para filtros e acesso.
      supervisores: supervisor,
      // Historico preservado; apenas reclassifica demais representantes.
      demaisRepresentantes: (c.representantes ?? []).filter(r => cod(r.codigo) !== codigoAtual),
      flags: ativo ? c.flags : [...new Set([...(c.flags ?? []), "REPRESENTANTE_ATUAL_NAO_VALIDADO"])],
    };
  });
  console.info(`[CARTEIRA ATUAL] cadastro=${cadastro.size} encontrados=${encontrados} semCadastro=${naoEncontrados} repsNaoValidados=${repsNaoValidados}`);
  return {
    ...origem,
    clientes,
    resumo: {
      ...origem.resumo,
      cadastroRepresentantesFonte: NOME_ARQUIVO,
      cadastroRepresentantesClientes: cadastro.size,
      cadastroRepresentantesEncontrados: encontrados,
      cadastroRepresentantesAusentes: naoEncontrados,
      cadastroRepresentantesNaoValidados: repsNaoValidados,
    },
  };
}
