'use client';
import {useCallback,useEffect,useState} from 'react';
type Treino={id:string;campanha:string;codigo_cliente:string;nome_cliente_snapshot:string;codigo_representante:string;data_treinamento:string;descricao:string;participantes:number|null;status:string;criado_por:string;fonte_snapshot:string|null};
type Foto={id:string;criado_em:string};
const base='/api/campanha/treinamentos';
async function resposta(r:Response){const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(String(d?.erro||`HTTP ${r.status}`));return d;}
export default function AprovacaoClient(){
 const [lista,setLista]=useState<Treino[]>([]);
 const [id,setId]=useState('');
 const [fotos,setFotos]=useState<Foto[]>([]);
 const [erro,setErro]=useState('');
 const [aviso,setAviso]=useState('');
 const [motivo,setMotivo]=useState('');
 const [ocupado,setOcupado]=useState(false);
 const [admin,setAdmin]=useState(false);
 const carregar=useCallback(async()=>{try{const d=await resposta(await fetch('/api/campanha/aprovacao',{cache:'no-store'}));setLista(Array.isArray(d.treinamentos)?d.treinamentos:[]);setAdmin(d.admin===true);setErro('');}catch(e){setErro(e instanceof Error?e.message:'Falha ao carregar');}},[]);
 useEffect(()=>{void carregar();},[carregar]);
 useEffect(()=>{let ativo=true;if(!id){setFotos([]);return;}void(async()=>{try{const d=await resposta(await fetch(`${base}/${id}/fotos`,{cache:'no-store'}));if(ativo)setFotos(Array.isArray(d.fotos)?d.fotos:[]);}catch(e){if(ativo){setErro(e instanceof Error?e.message:'Erro ao carregar fotos');setFotos([]);}}})();return()=>{ativo=false};},[id]);
 const atual=lista.find(x=>x.id===id);
 const homologacao=atual?.campanha==='TESTE_CONQUISTE_AMOSTRA_2027';
 async function agir(acao:'ENVIAR'|'APROVAR'|'REPROVAR'){
  if(!atual||ocupado)return;
  if(acao==='REPROVAR'&&motivo.trim().length<10){setErro('Informe justificativa com pelo menos 10 caracteres.');return;}
  setOcupado(true);setErro('');setAviso('');
  try{const d=await resposta(await fetch(`${base}/${atual.id}/acao`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({acao,motivo})}));setAviso(`Treinamento atualizado para ${String(d.status)}.`);setMotivo('');await carregar();}
  catch(e){setErro(e instanceof Error?e.message:'Nao foi possivel movimentar o treinamento');}
  finally{setOcupado(false);}
 }
 const btn:React.CSSProperties={border:0,borderRadius:8,padding:'10px 14px',background:'#eb7d05',color:'#fff',fontWeight:700,cursor:'pointer'};
 const caixa:React.CSSProperties={background:'#fff',border:'1px solid #dbe3ed',borderRadius:10,padding:16};
 return <main style={{maxWidth:1120,margin:'20px auto',padding:'0 18px',color:'#293245'}}>
 <div style={{letterSpacing:2,color:'#db7100',fontSize:11,fontWeight:800}}>CONQUISTE SUA AMOSTRA 2027</div>
 <h1 style={{fontSize:27,margin:'3px 0'}}>Aprovação do Gestor</h1>
 <p style={{fontSize:13,margin:'0 0 18px'}}>Treinamentos cadastrados e enviados para conferência das evidências</p>
 <section style={caixa}>
 <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}><div><strong>Fila de aprovação</strong><p style={{fontSize:12,margin:'5px 0'}}>Treinamentos pendentes: {lista.filter(r=>r.status==='ENVIADO').length} · Rascunhos: {lista.filter(r=>r.status==='RASCUNHO').length}</p>{admin&&<span style={{fontSize:12,color:'#a34d00'}}>ADMIN: visão geral e registros de homologação identificados</span>}</div><button style={btn} onClick={()=>void carregar()} disabled={ocupado}>Atualizar fila</button></div>
 {erro&&<p role="alert" style={{color:'#b91c1c',fontWeight:600}}>{erro}</p>}
 {aviso&&<p role="status" style={{color:'#166534',fontWeight:600}}>{aviso}</p>}
 {lista.length===0?<p style={{fontSize:13,marginTop:20}}>Nenhum treinamento localizado. Para aprovação, o treinamento precisa estar cadastrado e enviado.</p>:<div style={{display:'grid',gridTemplateColumns:'minmax(240px,1fr) minmax(0,1.65fr)',gap:14,marginTop:14}}>
 <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:520,overflow:'auto'}}>{lista.map(r=><button type="button" key={r.id} onClick={()=>{setId(r.id);setErro('');setAviso('')}} style={{textAlign:'left',padding:12,borderRadius:8,border:r.id===id?'2px solid #e67b00':'1px solid #d1d5db',background:r.id===id?'#fff6e9':'#fff',cursor:'pointer',color:'#263445'}}><strong>{r.codigo_cliente} — {r.nome_cliente_snapshot}</strong><div style={{fontSize:12,marginTop:5}}>Rep. {r.codigo_representante} · {r.data_treinamento} · {r.status}</div>{r.campanha!=='CONQUISTE_AMOSTRA_2027'&&<div style={{fontSize:11,fontWeight:800,color:'#a16207'}}>HOMOLOGAÇÃO — SEM PONTUAÇÃO</div>}</button>)}</div>
 <div style={{...caixa,minWidth:0}}>{!atual?<p>Selecione um treinamento à esquerda.</p>:<>
 <h2 style={{fontSize:18,margin:'0 0 8px'}}>{atual.nome_cliente_snapshot}</h2>
 <p style={{fontSize:13}}>Cliente {atual.codigo_cliente} · Representante {atual.codigo_representante} · {atual.data_treinamento}</p>
 <p style={{fontSize:13}}>Status: <b>{atual.status}</b></p>
 {homologacao&&<p style={{fontWeight:700,color:'#a16207',fontSize:13}}>Registro técnico de homologação. Não conta para pontuação.</p>}
 <div style={{whiteSpace:'pre-wrap',fontSize:13,padding:10,background:'#f8fafc',borderRadius:8}}>{atual.descricao}</div>
 <p style={{fontSize:13}}>Participantes: {atual.participantes??'Não informado'}</p>
 <h3 style={{fontSize:15}}>Evidências fotográficas ({fotos.length})</h3>
 {fotos.length===0?<p style={{fontSize:12,color:'#64748b'}}>Nenhuma foto cadastrada.</p>:<div style={{display:'flex',flexWrap:'wrap',gap:10}}>{fotos.map(f=><a key={f.id} href={`${base}/${atual.id}/fotos/${f.id}`} target="_blank" rel="noreferrer"><img alt="Evidência de treinamento" src={`${base}/${atual.id}/fotos/${f.id}`} style={{width:130,height:115,objectFit:'cover',borderRadius:7,border:'1px solid #d1d5db'}}/></a>)}</div>}
 <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:18}}>
 {atual.status==='RASCUNHO'&&<button style={{...btn,background:'#166534'}} disabled={ocupado||fotos.length===0} onClick={()=>void agir('ENVIAR')}>Enviar ao gestor</button>}
 {atual.status==='ENVIADO'&&<button style={{...btn,background:'#166534'}} disabled={ocupado} onClick={()=>void agir('APROVAR')}>Aprovar treinamento</button>}
 {atual.status==='ENVIADO'&&<div style={{display:'flex',flexDirection:'column',gap:8,flex:'1 1 250px'}}><textarea style={{padding:10,minHeight:65,borderRadius:7,border:'1px solid #cbd5e1'}} value={motivo} onChange={e=>setMotivo(e.target.value)} placeholder="Justificativa da reprovação (mínimo 10 caracteres)"/><button style={{...btn,background:'#b91c1c'}} disabled={ocupado||motivo.trim().length<10} onClick={()=>void agir('REPROVAR')}>Reprovar treinamento</button></div>}
 </div>
 </>}</div></div>}
 </section>
 <p style={{fontSize:12,color:'#64748b',marginTop:14}}>Ações conferidas no servidor e registradas na auditoria. Homologação não gera pontuação.</p>
 </main>;
}
