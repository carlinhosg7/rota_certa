import fs from "fs";
import os from "os";
import path from "path";

const drive = require("./google-drive-data.cjs");

export const DRIVE_CACHE_DIR = path.join(
  os.tmpdir(),
  "kidy-sales-intelligence-drive"
);

export type ArquivoDrive = {
  id: string;
  nome: string;
  caminho: string;
  tamanho: number;
  atualizadoEm?: string;
};

const GITHUB_RAW =
  "https://raw.githubusercontent.com/carlinhosg7/rota_certa/master";

const PARQUETS = [
  "DADOS_PREDITIVA_1.parquet",
  "DADOS_PREDITIVA_2.parquet",
  "DADOS_PREDITIVA_3.parquet",
  "DADOS_PREDITIVA_4.parquet",
  "DADOS_PREDITIVA_5.parquet",
  "DADOS_PREDITIVA_6.parquet"
];

let arquivosAtuais = new Map<string, ArquivoDrive>();

const downloadsAtivos = new Map<string, Promise<Buffer>>();

const CATALOGO_CACHE_MS = 15 * 60 * 1000;

let catalogoAtualizadoEm = 0;
let consultaCatalogoEmAndamento: Promise<ArquivoDrive[]> | null = null;

export async function atualizarCatalogoDrive(forcar = false): Promise<ArquivoDrive[]> {
  const agora = Date.now();

  if (
    !forcar &&
    arquivosAtuais.size > 0 &&
    agora - catalogoAtualizadoEm < CATALOGO_CACHE_MS
  ) {
    console.log(
      `[DRIVE] Catalogo em cache: ${arquivosAtuais.size} arquivos`
    );

    return Array.from(arquivosAtuais.values());
  }

  if (consultaCatalogoEmAndamento) {
    return consultaCatalogoEmAndamento;
  }

  const consulta = (async (): Promise<ArquivoDrive[]> => {
    const arquivos = await drive.listarArquivos() as ArquivoDrive[];

    const novoCatalogo = new Map<string, ArquivoDrive>();

    for (const arquivo of arquivos) {
      novoCatalogo.set(arquivo.nome, arquivo);
    }

    arquivosAtuais = novoCatalogo;
    catalogoAtualizadoEm = Date.now();

    console.log(
      `[DRIVE] Catalogo atualizado: ${arquivos.length} arquivos`
    );

    return arquivos;
  })();

  consultaCatalogoEmAndamento = consulta;

  try {
    return await consulta;
  } finally {
    consultaCatalogoEmAndamento = null;
  }
}

export function versoesCatalogoDrive(): string {
  return JSON.stringify(
    Array.from(arquivosAtuais.values())
      .map((arquivo) => ({
        nome: arquivo.nome,
        id: arquivo.id,
        tamanho: Number(arquivo.tamanho),
        atualizadoEm: arquivo.atualizadoEm || "",
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome))
  );
}
export function arquivoDrive(nome: string) {
  return arquivosAtuais.get(nome);
}

function validarArquivo(nome: string, buffer: Buffer) {
  if (!buffer.length) {
    throw new Error(`Arquivo vazio: ${nome}`);
  }

  if (nome.toLowerCase().endsWith(".parquet")) {
    if (
      buffer.subarray(0, 4).toString("ascii") !== "PAR1" ||
      buffer.subarray(-4).toString("ascii") !== "PAR1"
    ) {
      throw new Error(`Parquet invalido: ${nome}`);
    }
  }

  if (nome.toLowerCase().endsWith(".xlsx")) {
    if (
      buffer.length < 4 ||
      buffer.subarray(0, 2).toString("ascii") !== "PK"
    ) {
      throw new Error(`Excel invalido: ${nome}`);
    }
  }

  return buffer;
}

function versaoArquivo(arquivo: ArquivoDrive) {
  return JSON.stringify({
    id: arquivo.id,
    tamanho: Number(arquivo.tamanho),
    atualizadoEm: arquivo.atualizadoEm || ""
  });
}

function caminhoCache(nome: string) {
  const seguro = path.basename(nome);

  if (seguro !== nome || seguro === "." || seguro === "..") {
    throw new Error(`Nome de arquivo invalido: ${nome}`);
  }

  return path.join(DRIVE_CACHE_DIR, seguro);
}

function lerCacheValido(
  nome: string,
  arquivo: ArquivoDrive
): Buffer | null {
  const destino = caminhoCache(nome);
  const marcador = `${destino}.version`;

  if (!fs.existsSync(destino) || !fs.existsSync(marcador)) {
    return null;
  }

  try {
    const versao = fs.readFileSync(marcador, "utf8");

    if (versao !== versaoArquivo(arquivo)) {
      return null;
    }

    const tamanho = fs.statSync(destino).size;

    if (tamanho !== Number(arquivo.tamanho)) {
      return null;
    }

    return validarArquivo(nome, fs.readFileSync(destino));
  } catch {
    return null;
  }
}

function salvarCache(
  nome: string,
  arquivo: ArquivoDrive,
  buffer: Buffer
) {
  fs.mkdirSync(DRIVE_CACHE_DIR, { recursive: true });

  const destino = caminhoCache(nome);
  const marcador = `${destino}.version`;

  const temporario =
    `${destino}.${process.pid}.${Date.now()}.tmp`;

  const marcadorTemporario =
    `${marcador}.${process.pid}.${Date.now()}.tmp`;

  try {
    fs.writeFileSync(temporario, buffer);
    fs.writeFileSync(
      marcadorTemporario,
      versaoArquivo(arquivo),
      "utf8"
    );

    // Preserva o arquivo antigo ate o novo download
    // ter sido recebido e validado.
    fs.renameSync(temporario, destino);
    fs.renameSync(marcadorTemporario, marcador);
  } finally {
    if (fs.existsSync(temporario)) {
      fs.unlinkSync(temporario);
    }

    if (fs.existsSync(marcadorTemporario)) {
      fs.unlinkSync(marcadorTemporario);
    }
  }
}

async function baixarDriveComCache(
  nome: string
): Promise<Buffer> {
  const arquivo = arquivoDrive(nome);

  if (!arquivo) {
    throw new Error(`Arquivo nao encontrado no Drive: ${nome}`);
  }

  const cache = lerCacheValido(nome, arquivo);

  if (cache) {
    console.log(`[DRIVE CACHE] Reutilizando ${nome}`);
    return cache;
  }

  const chave = `${nome}:${versaoArquivo(arquivo)}`;

  const downloadExistente = downloadsAtivos.get(chave);

  if (downloadExistente) {
    return downloadExistente;
  }

  const download = (async () => {
    console.log(`[DRIVE] Baixando ${nome}`);

    const buffer = validarArquivo(
      nome,
      await drive.baixarArquivo(arquivo) as Buffer
    );

    if (buffer.length !== Number(arquivo.tamanho)) {
      throw new Error(`Tamanho incorreto: ${nome}`);
    }

    salvarCache(nome, arquivo, buffer);

    console.log(
      `[DRIVE CACHE] Atualizado ${nome} (${buffer.length} bytes)`
    );

    return buffer;
  })();

  downloadsAtivos.set(chave, download);

  try {
    return await download;
  } finally {
    downloadsAtivos.delete(chave);
  }
}

export async function lerArquivoComercial(
  nome: string
): Promise<Buffer> {
  const fonte = (
    process.env.KIDY_DATA_SOURCE || "github"
  ).toLowerCase();

  if (fonte === "drive") {
    return baixarDriveComCache(nome);
  }

  const url = `${GITHUB_RAW}/${nome
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  const resposta = await fetch(url, {
    cache: "no-store"
  });

  if (!resposta.ok) {
    throw new Error(
      `GitHub HTTP ${resposta.status}: ${nome}`
    );
  }

  return validarArquivo(
    nome,
    Buffer.from(await resposta.arrayBuffer())
  );
}

export async function prepararParquetsDrive() {
  fs.mkdirSync(DRIVE_CACHE_DIR, { recursive: true });

  for (const nome of PARQUETS) {
    const arquivo = arquivoDrive(nome);

    if (!arquivo) {
      throw new Error(`Parquet ausente no Drive: ${nome}`);
    }

    const destino = caminhoCache(nome);
    const marcador = `${destino}.version`;

    if (
      fs.existsSync(destino) &&
      fs.existsSync(marcador) &&
      fs.readFileSync(marcador, "utf8") ===
        versaoArquivo(arquivo) &&
      fs.statSync(destino).size === Number(arquivo.tamanho)
    ) {
      console.log(`[DRIVE CACHE] Reutilizando ${nome}`);
      continue;
    }

    await baixarDriveComCache(nome);
  }
}

export function pastaParquets() {
  return (
    process.env.KIDY_DATA_SOURCE || "github"
  ).toLowerCase() === "drive"
    ? DRIVE_CACHE_DIR
    : path.join(process.cwd(), "data");
}