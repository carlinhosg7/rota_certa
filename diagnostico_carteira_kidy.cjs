/* Diagnostico de integracao - Cadastro Kidy x Parquets de vendas.
   Executar na raiz do projeto com dependencias xlsx e hyparquet instaladas. */
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const { parquetReadObjects } = require('hyparquet');
const root = process.cwd();
const dirs = [root, path.join(root,'dados'), path.join(root,'data'), path.join(root,'public'), path.join(root,'public','dados'), process.env.KIDY_DADOS_DIR].filter(Boolean);
const findFile = (name) => {
  for(const dir of dirs){ const p=path.join(dir,name); if(fs.existsSync(p)) return p; }
  return null;
};
const names = ['DADOS PRETIVIA CLIENTES.xlsx', ...Array.from({length:6},(_,i)=>`DADOS_PREDITIVA_${i+1}.parquet`)];
const resolved = names.map(n=>({name:n,path:findFile(n)}));
console.log('\n=== ARQUIVOS ===');
resolved.forEach(x=>console.log(`${x.path?'OK':'AUSENTE'} ${x.name}${x.path?' -> '+x.path:''}`));
const normalize = v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
const xlsx = resolved[0].path;
if(xlsx){
 const wb=XLSX.readFile(xlsx,{cellDates:true});
 const sh=wb.Sheets[wb.SheetNames[0]];
 const matrix=XLSX.utils.sheet_to_json(sh,{header:1,defval:''});
 const headerIndex=matrix.findIndex(r=>r.some(v=>normalize(v)==='CODIGO CLIENTE')&&r.some(v=>normalize(v)==='GRUPO CLIENTE'));
 if(headerIndex<0) throw Error('Cabecalho do cadastro nao encontrado');
 const headers=matrix[headerIndex].map(String);
 const records=XLSX.utils.sheet_to_json(sh,{range:headerIndex,defval:''});
 const idx=key=>headers.find(h=>normalize(h)===normalize(key));
 const clientKey=idx('Codigo Cliente'),groupKey=idx('Grupo Cliente'), repKey=idx('Codigo Representante');
 const clients=new Set(),groups=new Set(), clientRep=new Set();
 for(const r of records){const c=String(r[clientKey]??'').trim(),g=String(r[groupKey]??'').trim(),rep=String(r[repKey]??'').trim();if(c){clients.add(c);clientRep.add(`${c}|${rep}`);}if(g)groups.add(normalize(g));}
 console.log('\n=== CADASTRO ===');
 console.log('Linhas:',records.length,'Clientes (codigo):',clients.size,'Grupos (nome):',groups.size,'Cliente x representante:',clientRep.size);
 console.log('Colunas:',headers.join(' | '));
}
(async()=>{
 for(const f of resolved.slice(1)){
  if(!f.path)continue;
  const buffer=fs.readFileSync(f.path);
  // Hyparquet accepts an AsyncBuffer with byteLength and slice(start,end).
  const file={byteLength:buffer.length, slice:async(start,end)=>Uint8Array.from(buffer.subarray(start,end)).buffer};
  console.log('\n===',f.name,'===');
  try {
   const rows=await parquetReadObjects({file,rowStart:0,rowEnd:5});
   console.log('Amostra:',rows.length,'registros');
   console.log('Colunas:',Object.keys(rows[0]||{}).join(' | '));
   console.log('Exemplo (dados mascarados):',JSON.stringify(Object.fromEntries(Object.entries(rows[0]||{}).map(([k,v])=>[k,/cnpj|cpf|nome|razao|cliente|contato|email|fone|endereco/i.test(k)?'[OCULTO]':typeof v==='bigint'?String(v):v]))));
  }catch(e){console.log('ERRO DE LEITURA:',e.message);}
 }
})().catch(e=>{console.error(e);process.exitCode=1});
