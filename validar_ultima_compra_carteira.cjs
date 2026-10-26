const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("xlsx");
const { parquetReadObjects } = require("hyparquet");

const ROOT = process.cwd();
const CADASTRO = "I:\\Meu Drive\\DADOS_SALES_INT\\DADOS PRETIVIA CLIENTES.xlsx";

function texto(v) {
  return v == null ? "" : String(v).trim();
}

function codigo(v) {
  return texto(v).replace(/\.0$/, "");
}

function data(v) {
  if (v == null || v === "") return null;

  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
  }

  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0,10);
  }

  const s = texto(v);
  let m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;

  return null;
}

function maior(mapa, chave, valor) {
  if (!chave || !valor) return;
  const anterior = mapa.get(chave);
  if (!anterior || valor > anterior) mapa.set(chave, valor);
}

function corte24Meses(referencia) {
  const d = new Date(referencia + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - 24);
  return d.toISOString().slice(0,10);
}

async function executar() {
  const referencia = new Date().toISOString().slice(0,10);
  const corte = corte24Meses(referencia);

  console.log("\n=== VALIDACAO ULTIMA COMPRA ===");
  console.log("Data de referencia:", referencia);
  console.log("Corte de 24 meses:", corte);

  if (!fs.existsSync(CADASTRO)) {
    throw new Error("Cadastro nao encontrado");
  }

  const wb = XLSX.readFile(CADASTRO);
  const matriz = XLSX.utils.sheet_to_json(
    wb.Sheets[wb.SheetNames[0]],
    {header:1, defval:""}
  );

  const idx = matriz.findIndex(r =>
    r.some(x => texto(x).toLowerCase() === "codigo cliente") &&
    r.some(x => texto(x).toLowerCase() === "data ultima compra")
  );

  if (idx < 0) throw new Error("Cabecalho nao localizado");

  const headers = matriz[idx].map(texto);
  const ci = headers.indexOf("Codigo Cliente");
  const di = headers.indexOf("Data Ultima Compra");
  const gi = headers.indexOf("Grupo Cliente");

  const excel = new Map();
  const grupos = new Map();

  for (const r of matriz.slice(idx+1)) {
    const c = codigo(r[ci]);
    if (!c) continue;

    maior(excel, c, data(r[di]));

    if (!grupos.has(c)) grupos.set(c, new Set());
    if (texto(r[gi])) grupos.get(c).add(texto(r[gi]));
  }

  console.log("\nClientes com data no Excel:", excel.size);

  const parquet = new Map();

  for (let i=1; i<=6; i++) {
    const nome = `DADOS_PREDITIVA_${i}.parquet`;
    const caminho = path.join(ROOT,nome);
    if (!fs.existsSync(caminho)) throw new Error(nome+" ausente");

    const buffer = fs.readFileSync(caminho);
    const file = {
      byteLength:buffer.length,
      slice:async(a,b)=>Uint8Array.from(buffer.subarray(a,b)).buffer
    };

    let lidas=0;

    for (let inicio=0;;inicio+=5000) {
      const rows = await parquetReadObjects({
        file,
        rowStart:inicio,
        rowEnd:inicio+5000,
        columns:["Codigo Cliente","Data Ultima Compra"]
      });

      if (!rows.length) break;

      for (const r of rows) {
        maior(
          parquet,
          codigo(r["Codigo Cliente"]),
          data(r["Data Ultima Compra"])
        );
      }

      lidas+=rows.length;
      if (rows.length<5000) break;
    }

    console.log(nome, "linhas:",lidas);
  }

  let iguais=0, excelMaisRecente=0, parquetMaisRecente=0;
  let somenteExcel=0, somenteParquet=0;
  let semDataExcel=0;
  const divergencias=[];

  for (const [c,d] of excel) {
    const p=parquet.get(c);

    if (!p) {
      somenteExcel++;
      continue;
    }

    if (d===p) iguais++;
    else {
      if (d>p) excelMaisRecente++;
      else parquetMaisRecente++;

      if (divergencias.length<20) {
        divergencias.push({
          cliente:c,
          dataExcel:d,
          dataParquet:p
        });
      }
    }
  }

  for (const c of parquet.keys()) {
    if (!excel.has(c)) somenteParquet++;
  }

  for (const c of grupos.keys()) {
    if (!excel.has(c)) semDataExcel++;
  }

  const classificacao = {
    ativaPreliminar:0,
    reativacaoPreliminar:0
  };

  for (const d of excel.values()) {
    if (d>=corte) classificacao.ativaPreliminar++;
    else classificacao.reativacaoPreliminar++;
  }

  const resultado={
    referencia,
    corte24Meses:corte,
    clientesCadastro:grupos.size,
    clientesComDataExcel:excel.size,
    clientesComDataParquet:parquet.size,
    datasIguais:iguais,
    excelMaisRecente,
    parquetMaisRecente,
    somenteExcel,
    somenteParquet,
    clientesSemDataExcel:semDataExcel,
    classificacao,
    exemplosDivergencias:divergencias,
    aviso:"Classificacao preliminar por Codigo Cliente; sem comprovacao de faturamento."
  };

  console.log("\n=== RESULTADO ===");
  console.log(JSON.stringify(resultado,null,2));

  const dir=path.join(ROOT,"diagnosticos");
  fs.mkdirSync(dir,{recursive:true});

  const destino=path.join(dir,"validacao_ultima_compra_2027.json");
  fs.writeFileSync(destino,JSON.stringify(resultado,null,2),"utf8");

  console.log("\nRelatorio:",destino);
}

executar().catch(e=>{
  console.error(e.stack||e.message);
  process.exitCode=1;
});
