/**
 * FASE 1 — espelho da carteira, sem ativacao no portal.
 * Execute na raiz do projeto, apos aplicar 01_criar_cache_carteira.sql:
 *   node --env-file=.env.local scripts/02_sincronizar_carteira.cjs "I:\\Meu Drive\\DADOS\\base clientes.xlsx"
 * ou, se as variaveis estiverem em .env:
 *   node --env-file=.env scripts/02_sincronizar_carteira.cjs "C:\\caminho\\base clientes.xlsx"
 * Nunca imprima nem compartilhe as variaveis de ambiente.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const XLSX = require("xlsx");
const { createClient } = require("@supabase/supabase-js");

function normalizar(v) {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
}
function codigo(v) { return String(v ?? "").trim().replace(/\.0+$/, ""); }
function acharCabecalho(rows, required) {
  return rows.findIndex((arr, ix) => ix < 20 && required.every(n => arr.some(v => normalizar(v) === normalizar(n))));
}
function campo(row, names) {
  const keys = Object.keys(row);
  for (const nome of names) {
    const key = keys.find(k => normalizar(k) === normalizar(nome));
    if (key) return row[key];
  }
  return undefined;
}
function montarCarteira(buffer) {
  const wb = XLSX.read(buffer, {type:"buffer",cellDates:true});
  let rows=[];
  for (const nome of wb.SheetNames) {
    const todas = XLSX.utils.sheet_to_json(wb.Sheets[nome], {header:1,defval:null,raw:true});
    const pos = acharCabecalho(todas,["Codigo Cliente","Cidade","Uf","Codigo Representante"]);
    if(pos>=0) {rows=todas.slice(pos);break;}
  }
  if(!rows.length) throw new Error("Cabecalho de carteira nao encontrado na planilha");
  const headers=rows[0].map(v=>String(v??""));
  const by=new Map();
  for(const arr of rows.slice(1)) {
    const r=Object.fromEntries(headers.map((h,i)=>[h,arr[i]]));
    const c=codigo(campo(r,["Codigo Cliente"]));
    const rep=codigo(campo(r,["Codigo Representante"]));
    const cidade=String(campo(r,["Cidade"])??"").trim();
    const uf=String(campo(r,["Uf","UF"])??"").trim().toUpperCase();
    if(!c||!rep||!cidade||!uf) continue;
    by.set(`${c}|${rep}`,{
      codigo_cliente:c,codigo_representante:rep,
      razao:String(campo(r,["Razao Social","Razão Social"])??"").trim(),
      codigo_supervisor:codigo(campo(r,["Codigo Supervisor","Supervisor"])),
      cidade,uf,city_key:`${normalizar(cidade)} - ${uf}`
    });
  }
  return [...by.values()];
}
async function buscarExclusoes(supabase) {
  const out=new Set();
  for(let inicio=0;;inicio+=1000) {
    const {data,error}=await supabase.from("kidy_clientes_excluidos")
      .select("codigo_cliente").eq("ativo",true)
      .order("codigo_cliente").range(inicio,inicio+999);
    if(error) throw new Error(`Exclusoes comerciais: ${error.message}`);
    for(const x of data??[]) out.add(codigo(x.codigo_cliente));
    if((data??[]).length<1000) break;
  }
  return out;
}
// Verifica o lote completo antes de renovar a validade sem reimportar.
// A contagem e todos os campos de cada cliente devem bater com a origem e exclusoes atuais.
async function loteExistenteConfere(client, loteId, carteira) {
  const {count,error:erroContagem}=await client.from("kidy_360_carteira_espelho_clientes")
    .select("codigo_cliente",{count:"exact",head:true}).eq("lote_id",loteId);
  if(erroContagem) throw new Error(`Falha consultando contagem existente: ${erroContagem.message}`);
  if(count!==carteira.length) return false;
  const esperado = new Map(carteira.map(c=>[`${c.codigo_cliente}|${c.codigo_representante}`,c]));
  const campos=["codigo_cliente","codigo_representante","razao","codigo_supervisor","cidade","uf","city_key"];
  const vistos=new Set();
  for(let inicio=0;inicio<carteira.length;inicio+=1000) {
    const {data,error}=await client.from("kidy_360_carteira_espelho_clientes")
      .select(campos.join(",")).eq("lote_id",loteId)
      .order("codigo_cliente",{ascending:true})
      .order("codigo_representante",{ascending:true})
      .range(inicio,Math.min(inicio+999,carteira.length-1));
    if(error) throw new Error(`Falha lendo lote existente na pagina ${inicio}: ${error.message}`);
    if(!data||data.length!==Math.min(1000,carteira.length-inicio)) return false;
    for(const linha of data) {
      const chave=`${linha.codigo_cliente}|${linha.codigo_representante}`;
      const original=esperado.get(chave);
      if(!original||vistos.has(chave)) return false;
      for(const campo of campos) if(String(linha[campo]??"")!==String(original[campo]??"")) return false;
      vistos.add(chave);
    }
  }
  return vistos.size===carteira.length;
}
async function main() {
  const arquivo=process.argv[2];
  if(!arquivo) throw new Error("Informe o caminho da planilha como primeiro argumento");
  const caminho=path.resolve(arquivo);
  if(!fs.existsSync(caminho)) throw new Error(`Arquivo nao encontrado: ${caminho}`);
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SECRET_KEY;
  if(!url||!key) throw new Error("Configure SUPABASE_URL e SUPABASE_SECRET_KEY no ambiente");
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const buffer=fs.readFileSync(caminho);
  const sha=crypto.createHash("sha256").update(buffer).digest("hex");
  const origem=montarCarteira(buffer);
  const excluidos=await buscarExclusoes(client);
  const carteira=origem.filter(c=>!excluidos.has(c.codigo_cliente));
  if(!carteira.length||carteira.length>100000) throw new Error(`Contagem suspeita: ${carteira.length}`);
  console.log(`Planilha normalizada: ${origem.length}; exclusoes: ${origem.length-carteira.length}; espelho: ${carteira.length}`);
  // SHA igual nao basta: as exclusoes comerciais podem ter mudado.
  // Consulta e compara integralmente o lote valido atual antes de poupar os inserts.
  const {data:existente,error:erroExistente}=await client.from("kidy_360_carteira_espelho_lotes")
    .select("lote_id,arquivo_sha256,total_registros")
    .eq("status","VALIDADO").order("criado_em",{ascending:false}).limit(1).maybeSingle();
  if(erroExistente) throw new Error(`Falha buscando ultimo lote validado: ${erroExistente.message}`);
  if(existente && existente.arquivo_sha256===sha && Number(existente.total_registros)===carteira.length) {
    if(await loteExistenteConfere(client,existente.lote_id,carteira)) {
      const verificadoEm=new Date().toISOString();
      const observacao=`Validacao integral: SHA256 da origem, contagem, chaves e todos os campos. VERIFICADO_EM=${verificadoEm}`;
      const {error:erroAtualizacao}=await client.from("kidy_360_carteira_espelho_lotes")
        .update({observacao}).eq("lote_id",existente.lote_id).eq("status","VALIDADO");
      if(erroAtualizacao) throw new Error(`Falha registrando verificacao: ${erroAtualizacao.message}`);
      console.log(`SEM ALTERACAO: espelho conferido integralmente; ${carteira.length} clientes; lote ${existente.lote_id}; VERIFICADO_EM=${verificadoEm}`);
      console.log(`SHA256: ${sha}`);
      return;
    }
    console.log("Lote existente nao coincide com os registros atuais; importando novo lote para seguranca.");
  }
  const lote=crypto.randomUUID();
  const {error:e1}=await client.from("kidy_360_carteira_espelho_lotes").insert({
    lote_id:lote,arquivo_sha256:sha,total_registros:carteira.length,status:"IMPORTANDO",
    origem:path.basename(caminho)
  });
  if(e1) throw new Error(`Falha criando lote: ${e1.message}`);
  try {
    for(let i=0;i<carteira.length;i+=400) {
      const pedaco=carteira.slice(i,i+400).map(c=>({...c,lote_id:lote}));
      const {error}=await client.from("kidy_360_carteira_espelho_clientes").insert(pedaco);
      if(error) throw new Error(`Falha no lote ${i}-${i+pedaco.length}: ${error.message}`);
      if(i%4000===0) console.log(`Importados ${Math.min(i+pedaco.length,carteira.length)} de ${carteira.length}`);
    }
    const {count,error:e2}=await client.from("kidy_360_carteira_espelho_clientes")
      .select("codigo_cliente",{count:"exact",head:true}).eq("lote_id",lote);
    if(e2) throw new Error(`Falha conferindo lote: ${e2.message}`);
    if(count!==carteira.length) throw new Error(`Contagem divergente: origem=${carteira.length} banco=${count}`);
    // Comparacao integral, antes de liberar o lote para a aplicacao.
    const esperadoPorChave = new Map(carteira.map(c => [`${c.codigo_cliente}|${c.codigo_representante}`, c]));
    const campos = ["codigo_cliente", "codigo_representante", "razao", "codigo_supervisor", "cidade", "uf", "city_key"];
    const verificados = new Set();
    for (let inicio = 0; inicio < carteira.length; inicio += 1000) {
      const {data, error} = await client.from("kidy_360_carteira_espelho_clientes")
        .select(campos.join(","))
        .eq("lote_id", lote)
        .order("codigo_cliente", {ascending:true})
        .order("codigo_representante", {ascending:true})
        .range(inicio, Math.min(inicio+999, carteira.length-1));
      if (error) throw new Error(`Conferencia da pagina ${inicio}: ${error.message}`);
      const esperadoTamanho = Math.min(1000, carteira.length-inicio);
      if (!data || data.length !== esperadoTamanho) throw new Error(`Pagina incompleta ${inicio}: ${data?.length ?? 0}/${esperadoTamanho}`);
      for (const linha of data) {
        const chave = `${linha.codigo_cliente}|${linha.codigo_representante}`;
        const original = esperadoPorChave.get(chave);
        if (!original || verificados.has(chave)) throw new Error(`Chave ausente ou duplicada: ${chave}`);
        for (const campo of campos) {
          if (String(linha[campo] ?? "") !== String(original[campo] ?? "")) throw new Error(`Divergencia: ${chave} / ${campo}`);
        }
        verificados.add(chave);
      }
    }
    if (verificados.size !== carteira.length) throw new Error(`Conferencia incompleta: ${verificados.size}/${carteira.length}`);
    // Nunca marcar VALIDADO antes da conferencia de todos os campos.
    const {error:e3}=await client.from("kidy_360_carteira_espelho_lotes")
      .update({status:"VALIDADO",observacao:`Validacao integral: SHA256 da origem, contagem, chaves e todos os campos. VERIFICADO_EM=${new Date().toISOString()}`}).eq("lote_id",lote);
    if(e3) throw new Error(`Falha validando lote: ${e3.message}`);
    console.log(`ESPELHO VALIDADO INTEGRALMENTE — ${count} linhas — lote ${lote}`);
    console.log(`SHA256: ${sha}`);
    console.log("O portal continua usando o Google Drive. NENHUMA troca de origem foi feita.");
  }catch(e){
    await client.from("kidy_360_carteira_espelho_lotes").update({status:"REJEITADO",observacao:String(e.message).slice(0,500)}).eq("lote_id",lote);
    throw e;
  }
}
main().catch(e=>{console.error("ERRO:",e.message);process.exitCode=1;});
