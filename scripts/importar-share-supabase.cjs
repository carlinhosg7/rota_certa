const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());
const { createClient } = require('@supabase/supabase-js');
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY ausentes em .env.local');
const db = createClient(url, key, {auth:{persistSession:false,autoRefreshToken:false}});
const nomes = [
  'share-municipios.json', 'share-vendas-anuais.json',
  'share-clientes.json', 'share-potencial-clientes.json',
  'share-acesso-indice.json'
];
async function main(){
  for (const nome of nomes){
    const arquivo = path.join(process.cwd(), 'data', nome);
    if (!fs.existsSync(arquivo)) throw new Error('Arquivo ausente: '+arquivo);
    const buffer=fs.readFileSync(arquivo);
    const conteudo=JSON.parse(buffer.toString('utf8'));
    const sha256=crypto.createHash('sha256').update(buffer).digest('hex');
    const {error}=await db.from('kidy_share_snapshots').upsert({nome,conteudo,sha256,atualizado_em:new Date().toISOString()},{onConflict:'nome'});
    if (error) throw new Error('Falha no upload '+nome+': '+error.message);
    console.log('OK:',nome,(buffer.length/1024/1024).toFixed(2),'MB');
  }
  const {data,error}=await db.from('kidy_share_snapshots').select('nome,sha256,atualizado_em');
  if(error) throw new Error(error.message);
  for (const nome of nomes) if(!data?.some(x=>x.nome===nome)) throw new Error('Ausente no banco: '+nome);
  console.log('VALIDADO: os 5 snapshots estao no Supabase.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
