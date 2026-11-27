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

type Entrada = { rep: string; nome: string; razao: string };

async function obterCadastroAtual(): Promise<Map<string, Entrada>> {
  await atualizarCatalogoDrive();
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
  const razaoCol = colunas.indexOf("RAZAO SOCIAL");
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
    mapa.set(id, {
      rep,
      nome: String(linha[nomeCol] ?? "").trim(),
      razao: razaoCol >= 0 ? String(linha[razaoCol] ?? "").trim() : "",
    });
  }
  if (conflitos) throw new Error(`${NOME_ARQUIVO}: ${conflitos} clientes com representantes conflitantes`);
  if (mapa.size < 10000) throw new Error(`${NOME_ARQUIVO}: apenas ${mapa.size} clientes validos, carga recusada`);
  return mapa;
}

type Carteira = { clientes: ClienteCarteira[]; resumo: Record<string, unknown> };

export async function prepararFontesOficiaisCarteira() {
  const { listarClientesExcluidos } = await import("./clientes-excluidos");
  return Promise.all([
    obterCadastroAtual(),
    carregarMapaRepresentantes(),
    listarClientesExcluidos(),
  ] as const);
}

export async function aplicarRepresentantesAtuaisCarteira(
  origem: Carteira,
  fontes?: Awaited<ReturnType<typeof prepararFontesOficiaisCarteira>>
): Promise<Carteira> {
  const [cadastro, oficiais, excluidos] = fontes ?? await prepararFontesOficiaisCarteira();

  const existentes = new Set(origem.clientes.map(c => cod(c.codigoCliente)));
  const ausentes = [...cadastro.keys()].filter(id => !existentes.has(id) && !excluidos.has(id));
  const adicionais: ClienteCarteira[] = [];
  let recuperadosDrive = 0;
  let pendentes = 0;

  // Recuperar ficha completa e ultima compra quando a base preditiva possuir o cliente.
  let recuperados = new Map<string, ClienteCarteira>();
  if (ausentes.length > 0 && process.env.KIDY_CARTEIRA_HISTORICO_SINCRONO_2027 === "1") {
    try {
      const { gerarCarteira2027DoDrive } = await import("./carteira-2027-data");
      const atual = await gerarCarteira2027DoDrive();
      recuperados = new Map(atual.clientes.map(c => [cod(c.codigoCliente), c]));
    } catch (erro) {
      console.error("[CARTEIRA ATUAL] Base historica do Drive indisponivel; clientes nao encontrados ficarao pendentes.", erro);
    }
  }

  for (const id of ausentes) {
    const registro = cadastro.get(id)!;
    const completo = recuperados.get(id);
    if (completo) {
      recuperadosDrive++;
      adicionais.push({
        ...completo,
        codigoCliente: id,
        flags: [...new Set([...(completo.flags ?? []), "RECUPERADO_DO_CADASTRO_OFICIAL"])],
      });
      continue;
    }

    // Nao atribuir Carteira 01/02, situacao fiscal ou ultima compra por suposicao.
    pendentes++;
    adicionais.push({
      codigoCliente: id,
      contatos: [],
      endereco: "",
      numeroEndereco: "",
      bairro: "",
      cidade: "",
      uf: "",
      razaoSocial: registro.razao || `CLIENTE ${id} - CADASTRO A COMPLETAR`,
      cnpj: "",
      grupoCliente: "",
      codigoGrupoCliente: "",
      carteira: "PENDENTE_QUALIFICACAO",
      situacao: "PENDENTE_QUALIFICACAO",
      faixa: "SEM_HISTORICO_VALIDADO",
      mesesSemCompra: null,
      representantes: [],
      representanteAtual: [],
      demaisRepresentantes: [],
      supervisores: [],
      bloqueadoFinanceiro: false,
      limiteDisponivel: 0,
      clienteAtivoCadastro: true,
      situacaoEmpresa: "NAO_VERIFICADA",
      compraFaturadaConfirmada: false,
      classificacaoProvisoria: true,
      flags: ["RECUPERADO_DO_CADASTRO_OFICIAL", "CADASTRO_A_COMPLETAR", "RECEITA_A_VERIFICAR"],
      acompanhamento: {
        status: "NAO_INICIADO",
        potencial: "NAO_AVALIADO",
        ultimaColecao: null,
        ultimoContato: null,
        motivoNaoCompra: null,
        proximaAcao: null,
        prazo: null,
        responsavel: null,
        resultado: null,
      },
    });
  }

  let encontrados = 0;
  let naoEncontrados = 0;
  let repsNaoValidados = 0;
  const clientes = [...origem.clientes, ...adicionais].map(c => {
    const atual = cadastro.get(cod(c.codigoCliente));
    if (!atual) {
      naoEncontrados++;
      // Nenhum acesso concedido por representante historico.
      return {
        ...c,
        representantes: [],
        representanteAtual: [],
        demaisRepresentantes: c.representantes ?? [],
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
      representantes: repAtual,
      representanteAtual: repAtual,
      supervisores: supervisor,
      demaisRepresentantes: (c.representantes ?? []).filter(r => cod(r.codigo) !== codigoAtual),
      flags: ativo ? c.flags : [...new Set([...(c.flags ?? []), "REPRESENTANTE_ATUAL_NAO_VALIDADO"])],
    };
  });

  if (repsNaoValidados > 0) {
    throw new Error(`[CARTEIRA ATUAL] ${repsNaoValidados} clientes com representante vigente nao validado. Carga recusada.`);
  }
  const qtdAdicionados = adicionais.length;
  console.info(`[CARTEIRA ATUAL] cadastro=${cadastro.size} encontrados=${encontrados} semCadastro=${naoEncontrados} recuperados=${qtdAdicionados} historicoDrive=${recuperadosDrive} pendentes=${pendentes}`);
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
      cadastroRepresentantesAdicionados: qtdAdicionados,
      cadastroRepresentantesHistoricoDrive: recuperadosDrive,
      cadastroRepresentantesPendentes: pendentes,
    },
  };
}
