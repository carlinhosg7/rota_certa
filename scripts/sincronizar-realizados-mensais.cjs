'use strict';
// Uso: node scripts/sincronizar-realizados-mensais.cjs [--importar]
// Sem flag: apenas pre-visualizacao e arquivos locais JSON. Nenhuma escrita remota.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const XLSX = require('xlsx');
const { loadEnvConfig } = require('@next/env');
loadEnvConfig(process.cwd());
const raiz = process.cwd();
const pasta = 'I:\\Meu Drive\\DADOS_SALES_INT';
const campanha = 'CONQUISTE_AMOSTRA_2027';
const competencia = '2026-11-01';
const inicio = '2026-11-01', fim = '2026-11-30';
const importar = process.argv.includes('--importar');
const modelos = [
  {origem:'ENTRADA',modalidade:'PRODUCAO',arquivo:'MATINAL COMERIAL.xlsx',aba:'ENTRADA MES PROD',tipoData:'Data Cadastro'},
  {origem:'ENTRADA',modalidade:'KIDEX',arquivo:'MATINAL COMERIAL.xlsx',aba:'KIDEX',tipoData:'Data Cadastro'},
  {origem:'FATURAMENTO',modalidade:'TOTAL',arquivo:'INDICADORES COMERCIAIS POR  FATURAMENTO.xlsx',aba:'MES',tipoData:'Data Entrega'},
];
function num(v,rotulo){
  if(v===null||v===undefined||String(v).trim()==='') throw Error('Valor vazio em '+rotulo);
  const n=typeof v==='number'?v:Number(String(v).replace(/\./g,'').replace(',','.'));
  if(!Number.isFinite(n))throw Error('Valor invalido '+rotulo+': '+v);
  return n;
}
function str(v){return String(v??'').trim();}
function cod(v){return str(v).replace(/\.0+$/,'');}
function dinheiro(v){return v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function fonte(modelo){
  const filepath=path.join(pasta,modelo.arquivo);
  if(!fs.existsSync(filepath))throw Error('Arquivo nao encontrado: '+filepath);
  const raw=fs.readFileSync(filepath);
  const sha=crypto.createHash('sha256').update(raw).digest('hex');
  const wb=XLSX.read(raw,{type:'buffer'});
  const ws=wb.Sheets[modelo.aba];if(!ws)throw Error('Aba nao encontrada: '+modelo.aba+' | '+filepath);
  const linhas=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,blankrows:false});
  const cab=linhas.findIndex(l=>Array.isArray(l)&&l.includes('Vlr Venda')&&l.includes('Qtd Venda')&&
    (l.includes('Codigo Representante')||l.includes('Codigo Representante Carteira')));
  if(cab<0)throw Error('Cabecalho nao identificado: '+modelo.aba);
  const col=linhas[cab].map(str);
  const campo=n=>col.indexOf(n);
  const iRep=campo('Codigo Representante')>=0?campo('Codigo Representante'):campo('Codigo Representante Carteira');
  const iNome=campo('Representante')>=0?campo('Representante'):campo('Representante Carteira');
  const iSup=campo('Codigo Supervisor')>=0?campo('Codigo Supervisor'):campo('Supervisor');
  const iValor=campo('Vlr Venda'),iPares=campo('Qtd Venda');
  const metadados=linhas.slice(0,cab).flat().map(str).find(t=>t.includes(modelo.tipoData+':'))||'';
  const periodo=metadados.match(new RegExp(modelo.tipoData+':\\s*(\\d{2}/\\d{2}/\\d{4})\\s*(?:à|a|ate|até)\\s*(\\d{2}/\\d{2}/\\d{4})','i'));
  if(!periodo||periodo[1]!=='01/11/2026'||periodo[2]!=='30/11/2026')
    throw Error('Periodo diferente do autorizado, aba '+modelo.aba+': '+metadados);
  if(modelo.modalidade==='PRODUCAO'&&!/Tipo Pedido:\s*Pedido Normal\s*;/i.test(metadados))
    throw Error('Aba de producao nao esta restrita a Pedido Normal');
  if(modelo.modalidade==='KIDEX'&&!/Tipo Pedido:\s*Pronta Entrega\s*;/i.test(metadados))
    throw Error('Aba de KIDEX nao esta restrita a Pronta Entrega');
  const agrupado=new Map();const conflitosSupervisores=new Map();let linhasValidas=0;
  for(const [ix,l] of linhas.slice(cab+1).entries()){
    const rep=cod(l[iRep]);if(!/^\d+$/.test(rep))continue;
    const valor=num(l[iValor],`${modelo.aba} linha ${ix+cab+2} valor`);
    const pares=num(l[iPares],`${modelo.aba} linha ${ix+cab+2} pares`);
    const antigo=agrupado.get(rep)||{codigo_representante:rep,representante_nome:str(l[iNome]),supervisor_origem:str(iSup>=0?l[iSup]:''),qtd_pares:0,valor_realizado:0};
    // Nao perde vendas por divergencia de supervisor no relatorio de origem.
    // Nao atribui um dos supervisores arbitrariamente: marca como pendente.
    const supervisorAtual=str(iSup>=0?l[iSup]:'');
    if (!antigo.supervisores_encontrados) antigo.supervisores_encontrados = [];
    if (supervisorAtual && !antigo.supervisores_encontrados.includes(supervisorAtual))
      antigo.supervisores_encontrados.push(supervisorAtual);
    if (antigo.supervisores_encontrados.length > 1) {
      antigo.supervisor_origem = '';
      conflitosSupervisores.set(rep, antigo.supervisores_encontrados);
    } else if (antigo.supervisores_encontrados.length === 1) {
      antigo.supervisor_origem = antigo.supervisores_encontrados[0];
    }
    antigo.valor_realizado+=valor;antigo.qtd_pares+=pares;
    agrupado.set(rep,antigo);linhasValidas++;
  }
  if(agrupado.size===0)throw Error('Nenhum representante encontrado: '+modelo.aba);
  const registros=[...agrupado.values()].sort((a,b)=>a.codigo_representante.localeCompare(b.codigo_representante,'pt-BR',{numeric:true}))
    .map(r=>({codigo_representante:r.codigo_representante,representante_nome:r.representante_nome,supervisor_origem:r.supervisor_origem,valor_realizado:Math.round(r.valor_realizado*1000000)/1000000,qtd_pares:Math.round(r.qtd_pares*1000000)/1000000}));
  const valor=registros.reduce((a,r)=>a+r.valor_realizado,0);
  const pares=registros.reduce((a,r)=>a+r.qtd_pares,0);
  const conflitos=[...conflitosSupervisores].map(([rep,supervisores])=>({representante:rep,supervisores}));
  return {...modelo,filepath,sha,metadados,linhasValidas,conflitos,registros,valor:Math.round(valor*100)/100,pares:Math.round(pares*1000)/1000};
}
async function main(){
  const dados=modelos.map(fonte);
  console.log('\n=== PREVIA OFICIAL - NOVEMBRO COMPLETO ===');
  console.table(dados.map(d=>({modalidade:d.modalidade,aba:d.aba,representantes:d.registros.length,linhas:d.linhasValidas,pares:d.pares,valor:dinheiro(d.valor)})));
  for(const d of dados){
    if(d.conflitos.length){
      console.log('ATENCAO - Supervisores divergentes em '+d.aba+':');
      console.table(d.conflitos.map(c=>({representante:c.representante,supervisores:c.supervisores.join(' / ')})));
      console.log('Esses representantes serao importados com supervisor_origem vazio; valores e pares preservados.');
    }
  }
  const pastaSaida=path.join(raiz,'_diagnosticos','campanha_mensal');
  fs.mkdirSync(pastaSaida,{recursive:true});
  const nome='previa_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
  const destino=path.join(pastaSaida,nome);
  fs.writeFileSync(destino,JSON.stringify({campanha,competencia,inicio,fim,gerado_em:new Date().toISOString(),fontes:dados},null,2));
  console.log('PREVIA SALVA:',destino);
  if(!importar){console.log('MODO PREVIA: NENHUM DADO ALTERADO');return;}
  if(!process.env.SUPABASE_URL||!process.env.SUPABASE_SECRET_KEY)
    throw Error('SUPABASE_URL e SUPABASE_SECRET_KEY devem existir no .env.local');
  const {createClient}=require('@supabase/supabase-js');
  const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  for(const d of dados){
    const {data:antigos,error:erroAntigos}=await db.from('kidy_campanha_cargas_mensais')
      .select('*').eq('campanha',campanha).eq('competencia',competencia)
      .eq('origem',d.origem).eq('modalidade',d.modalidade).eq('status','ATIVA');
    if(erroAntigos)throw Error('SQL 01 nao executado ou tabela inacessivel: '+erroAntigos.message);
    if(antigos?.length){
      const antigo=antigos[0];
      if(antigo.hash_arquivo===d.sha&&antigo.aba_origem===d.aba&&Number(antigo.valor_esperado)===d.valor&&Number(antigo.pares_esperados)===d.pares){
        console.log('SEM ALTERACAO:',d.modalidade);continue;
      }
    }
    const id=crypto.randomUUID();
    const carga={id,campanha,competencia,origem:d.origem,modalidade:d.modalidade,
      periodo_inicio:inicio,periodo_fim:fim,arquivo_origem:d.arquivo,aba_origem:d.aba,
      hash_arquivo:d.sha,registros_esperados:d.registros.length,valor_esperado:d.valor,pares_esperados:d.pares,status:'PREPARANDO'};
    const {error:eCarga}=await db.from('kidy_campanha_cargas_mensais').insert(carga);
    if(eCarga)throw Error('Criar carga '+d.modalidade+': '+eCarga.message);
    for(let i=0;i<d.registros.length;i+=50){
      const lote=d.registros.slice(i,i+50).map(r=>({...r,carga_id:id}));
      const {error}=await db.from('kidy_campanha_realizados_mensais').insert(lote);
      if(error)throw Error('Inserir lote '+d.modalidade+': '+error.message+' (carga '+id+' permaneceu PREPARANDO)');
    }
    const {error:eAtivacao}=await db.rpc('kidy_ativar_carga_mensal',{p_id:id});
    if(eAtivacao)throw Error('Ativar carga '+d.modalidade+': '+eAtivacao.message+' (carga '+id+' permaneceu PREPARANDO)');
    console.log('ATIVADA:',d.modalidade, 'id',id,'valor',dinheiro(d.valor));
  }
  console.log('IMPORTACAO CONCLUIDA: versoes antigas preservadas; view antiga da campanha NAO alterada.');
}
main().catch(e=>{console.error('ERRO:',e.message);process.exitCode=1});
