"use client";
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
type Item={id:string;codigo_cliente:string;nome_cliente_snapshot:string;codigo_representante:string;data_treinamento:string;status:string;
 kidy_campanha_treinamentos_marketing?:{status:string;cliente_confirmou:boolean|null}|{status:string;cliente_confirmou:boolean|null}[]|null;
 kidy_campanha_treinamentos_homologacao?:{homologado_por:string;homologado_em:string}|{homologado_por:string;homologado_em:string}[]|null};
const primeiro=<T,>(x:T|T[]|null|undefined):T|undefined=>Array.isArray(x)?x[0]:x??undefined;
export default function HomologacaoPage(){
 const [itens,setItens]=useState<Item[]>([]);const [erro,setErro]=useState('');const [msg,setMsg]=useState('');const [ocupado,setOcupado]=useState('');
 const carregar=useCallback(async()=>{try{const r=await fetch('/api/campanha/homologacao',{cache:'no-store'});const j=await r.json();if(!r.ok)throw Error(j.erro||'Erro');setItens(j.treinamentos??[]);setErro('');}catch(e){setErro(e instanceof Error?e.message:'Falha na consulta')}},[]);
 useEffect(()=>{void carregar()},[carregar]);
 async function homologar(id:string){if(!window.confirm('Homologar definitivamente este treinamento oficial?'))return;setOcupado(id);setMsg('');try{const r=await fetch('/api/campanha/homologacao',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});const j=await r.json();if(!r.ok)throw Error(j.erro||'Erro');setMsg('Treinamento homologado.');await carregar()}catch(e){setErro(e instanceof Error?e.message:'Falha ao homologar')}finally{setOcupado('')}}
 return <main style={{maxWidth:1100,margin:'20px auto',padding:20}}>
 <Link href="/campanha/treinamentos">← Voltar ao Treinamento Saúde e Conforto</Link>
 <h1>Homologação final dos treinamentos</h1><p>Exclusivo ADMIN. Apenas treinamentos oficiais aprovados pelo gestor e validados pelo Marketing podem gerar pontos.</p>
 <button onClick={()=>void carregar()}>Atualizar lista</button>{erro&&<p role="alert" style={{color:'crimson'}}>{erro}</p>}{msg&&<p role="status">{msg}</p>}
 <div style={{display:'grid',gap:12,marginTop:16}}>{itens.map(t=>{const m=primeiro(t.kidy_campanha_treinamentos_marketing);const h=primeiro(t.kidy_campanha_treinamentos_homologacao);const apto=m?.status==='VALIDADO'&&m.cliente_confirmou===true;return <article key={t.id} style={{padding:16,border:'1px solid #ddd',borderRadius:10,background:'#fff'}}><strong>{t.codigo_cliente} — {t.nome_cliente_snapshot}</strong><p>Rep. {t.codigo_representante} · Data {t.data_treinamento} · Gestor {t.status} · Marketing {m?.status??'Pendente'}</p>{h?<strong>Homologado por {h.homologado_por}</strong>:<button disabled={!apto||!!ocupado} onClick={()=>void homologar(t.id)}>{ocupado===t.id?'Salvando...':apto?'Homologar treinamento':'Aguardando Marketing'}</button>}</article>})}</div>
 {!itens.length&&!erro&&<p>Nenhum treinamento oficial aprovado encontrado. O treinamento de teste nao aparece aqui.</p>}
 </main>
}
