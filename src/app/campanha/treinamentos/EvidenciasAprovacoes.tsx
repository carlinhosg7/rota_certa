'use client';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

type Registro = { id:string;codigo_cliente:string;nome_cliente_snapshot:string;codigo_representante:string;data_treinamento:string;status:string };
type Foto = { id:string; tipo_mime:string; tamanho_bytes:number; criado_em:string };
const base='/api/campanha/treinamentos';
const MAX_FOTOS=5;
const MAX_BYTES=5*1024*1024;
async function json(res:Response) {
  const obj:unknown=await res.json().catch(()=>({}));
  const data=(obj && typeof obj==='object' && !Array.isArray(obj)) ? obj as Record<string,unknown> : {};
  if (!res.ok) throw Error(String(data.erro||`HTTP ${res.status}`));
  return data;
}
export default function EvidenciasAprovacoes() {
  const [registros,setRegistros]=useState<Registro[]>([]);
  const [homologacao,setHomologacao]=useState(false);
  const [podeHomologar,setPodeHomologar]=useState(false);
  const [selecionado,setSelecionado]=useState('');
  const [fotos,setFotos]=useState<Foto[]>([]);
  const [motivo,setMotivo]=useState('');
  const [msg,setMsg]=useState('');
  const [erro,setErro]=useState('');
  const [ocupado,setOcupado]=useState(false);
  const cameraRef=useRef<HTMLInputElement>(null);
  const galeriaRef=useRef<HTMLInputElement>(null);
  const carregar=useCallback(async()=>{
    try {
      const data=await json(await fetch(homologacao ? `${base}?homologacao=1` : base,{cache:'no-store'}));
      setRegistros(Array.isArray(data.treinamentos)?data.treinamentos as Registro[]:[]);
      setErro('');
    } catch(e) {setErro(e instanceof Error?e.message:'Erro ao consultar treinamentos');}
  },[homologacao]);
  const carregarFotos=useCallback(async(id:string)=>{
    if (!id){setFotos([]);return;}
    try {
      const data=await json(await fetch(`${base}/${id}/fotos`,{cache:'no-store'}));
      setFotos(Array.isArray(data.fotos)?data.fotos as Foto[]:[]);
    } catch(e) {setMsg(e instanceof Error?e.message:'Erro ao listar fotos');setFotos([]);}
  },[]);
  useEffect(()=>{
    let ativo=true;
    void (async()=>{
      try {
        const resposta=await fetch(`${base}?homologacao=1`,{cache:'no-store'});
        if(!resposta.ok)return;
        const dados=await json(resposta);
        if(ativo)setPodeHomologar(dados.podeHomologar===true);
      } catch {
        // Modo de teste nao disponivel para este usuario.
      }
    })();
    return ()=>{ativo=false;};
  },[]);
  useEffect(()=>{void carregar();},[carregar]);
  useEffect(()=>{void carregarFotos(selecionado);},[selecionado,carregarFotos]);
  const escolhido=registros.find(r=>r.id===selecionado);
  async function enviarArquivo(e:ChangeEvent<HTMLInputElement>){
    const arquivo=e.target.files?.[0];
    e.target.value='';
    if (!arquivo || !selecionado || ocupado) return;
    if (!['image/jpeg','image/png','image/webp'].includes(arquivo.type)){
      setMsg('Formato invalido. Use JPG, PNG ou WEBP.');return;
    }
    if (arquivo.size<1 || arquivo.size>MAX_BYTES){
      setMsg('A imagem precisa ter ate 5 MB.');return;
    }
    if(fotos.length>=MAX_FOTOS){setMsg('Limite de cinco fotos atingido.');return;}
    setOcupado(true);setMsg('Enviando foto...');
    try {
      const fd=new FormData();fd.append('foto',arquivo);
      await json(await fetch(`${base}/${selecionado}/fotos`,{method:'POST',body:fd}));
      await carregarFotos(selecionado);
      setMsg('Foto anexada com sucesso.');
    } catch(err) {setMsg(err instanceof Error?err.message:'Nao foi possivel anexar a foto');}
    finally {setOcupado(false);}
  }
  async function excluirFoto(fotoId:string){
    if(!selecionado || ocupado || !window.confirm('Excluir esta foto do rascunho?'))return;
    setOcupado(true);setMsg('Excluindo foto...');
    try {
      const o=await json(await fetch(`${base}/${selecionado}/fotos/${fotoId}`,{method:'DELETE'}));
      await carregarFotos(selecionado);
      setMsg(String(o.aviso||'Foto excluida.'));
    }catch(err){setMsg(err instanceof Error?err.message:'Falha ao excluir foto');}
    finally{setOcupado(false);}
  }
  async function agir(acao:'ENVIAR'|'APROVAR'|'REPROVAR') {
    if(!selecionado)return;
    if(acao==='REPROVAR'&&motivo.trim().length<10){setMsg('Informe justificativa com pelo menos 10 caracteres.');return;}
    setOcupado(true);setMsg('');
    try {
      const o=await json(await fetch(`${base}/${selecionado}/acao`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({acao,motivo}),
      }));
      setMsg(`Status atualizado: ${String(o.status)}. Nenhum ponto foi atribuido.`);
      setMotivo('');await carregar();
    }catch(e){setMsg(e instanceof Error?e.message:'Falha ao avaliar');}
    finally{setOcupado(false);}
  }
  const botao:React.CSSProperties={padding:'11px 15px',borderRadius:9,border:'none',background:'#ee7b0b',color:'#fff',fontWeight:700,cursor:'pointer'};
  const campo:React.CSSProperties={padding:10,border:'1px solid #cbd5e1',borderRadius:8,maxWidth:'100%'};
  return <section style={{background:'#fff',border:'1px solid #dbe3ed',borderRadius:12,padding:18,marginTop:18,color:'#1e293b'}}>
    <h2 style={{fontSize:20,margin:'0 0 6px'}}>4. Fotos e aprovacao gerencial</h2>
    <p style={{fontSize:13,color:'#64748b'}}>Salve um rascunho primeiro. Depois use a camera ou selecione fotos existentes (ate cinco fotos, 5 MB cada). E necessario ao menos uma foto para enviar a aprovacao.</p>
    <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
      <button
        type="button"
        style={{...botao,background:'#475569'}}
        onClick={()=>void carregar()}
        disabled={ocupado}
      >
        Atualizar treinamentos
      </button>

      {podeHomologar&&
        <button
          type="button"
          disabled={ocupado}
          style={{
            ...botao,
            background:homologacao?'#166534':'#7c3aed'
          }}
          onClick={()=>{
            setSelecionado('');
            setFotos([]);
            setMsg('');
            setErro('');
            setRegistros([]);
            setHomologacao(valor=>!valor);
          }}
        >
          {homologacao
            ? 'Voltar aos treinamentos oficiais'
            : 'Testar homologacao (ADMIN)'}
        </button>
      }

      {homologacao&&
        <strong style={{fontSize:12,color:'#7c3aed'}}>
          MODO HOMOLOGACAO - SEM PONTUACAO
        </strong>
      }
    </div>
    {erro&&<p role="alert" style={{color:'#b91c1c'}}>{erro}</p>}
    <div style={{margin:'16px 0'}}>
      <label htmlFor="treino-foto" style={{display:'block',fontWeight:700,fontSize:13,marginBottom:5}}>Treinamento cadastrado</label>
      <select id="treino-foto" style={{...campo,width:'100%'}} value={selecionado} onChange={e=>{setSelecionado(e.target.value);setMsg('');}}>
        <option value="">Selecione um treinamento existente</option>
        {registros.map(r=><option key={r.id} value={r.id}>{r.data_treinamento} · {r.codigo_cliente} — {r.nome_cliente_snapshot} · Rep. {r.codigo_representante} · {r.status}</option>)}
      </select>
    </div>
    {escolhido&&<div style={{border:'1px solid #e2e8f0',borderRadius:10,padding:14}}>
      <strong>{escolhido.nome_cliente_snapshot}</strong>
      <p style={{fontSize:13}}>Status: <b>{escolhido.status}</b></p>
      <h3 style={{fontSize:16}}>Fotos do treinamento ({fotos.length}/{MAX_FOTOS})</h3>
      {escolhido.status==='RASCUNHO'&&<div style={{display:'flex',flexWrap:'wrap',gap:10,marginBottom:14}}>
        <input ref={cameraRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>void enviarArquivo(e)} style={{display:'none'}} aria-label="Capturar foto com a camera" />
        <input ref={galeriaRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void enviarArquivo(e)} style={{display:'none'}} aria-label="Escolher foto da galeria" />
        <button type="button" style={botao} disabled={ocupado||fotos.length>=MAX_FOTOS} onClick={()=>cameraRef.current?.click()}>📷 Tirar foto</button>
        <button type="button" style={{...botao,background:'#334155'}} disabled={ocupado||fotos.length>=MAX_FOTOS} onClick={()=>galeriaRef.current?.click()}>📎 Anexar foto</button>
      </div>}
      {fotos.length===0&&<p style={{fontSize:13,color:'#64748b'}}>Nenhuma foto anexada.</p>}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:12,marginBottom:16}}>
        {fotos.map(f=><div key={f.id} style={{border:'1px solid #e2e8f0',borderRadius:9,padding:6,overflow:'hidden'}}>
          <a href={`${base}/${selecionado}/fotos/${f.id}`} target="_blank" rel="noopener noreferrer" style={{display:'block'}}>
            {/* API autenticada, imagem privada; <img> necessario para carregar endpoint interno */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${base}/${selecionado}/fotos/${f.id}`} alt="Foto do treinamento" loading="lazy" style={{width:'100%',height:100,objectFit:'cover',borderRadius:5}} />
          </a>
          <div style={{fontSize:11,color:'#64748b',marginTop:5}}>{new Date(f.criado_em).toLocaleString('pt-BR')}</div>
          {escolhido.status==='RASCUNHO'&&<button type="button" disabled={ocupado} onClick={()=>void excluirFoto(f.id)} style={{marginTop:6,width:'100%',background:'#fee2e2',color:'#991b1b',padding:7,border:0,borderRadius:6,cursor:'pointer',fontWeight:700}}>Excluir foto</button>}
        </div>)}
      </div>
      {escolhido.status==='RASCUNHO'&&<button type="button" style={{...botao,background:'#166534'}} onClick={()=>void agir('ENVIAR')} disabled={ocupado||fotos.length===0}>Enviar para aprovacao do gestor</button>}
      {escolhido.status==='ENVIADO'&&<div style={{display:'flex',flexWrap:'wrap',gap:10,alignItems:'center'}}>
        <button type="button" style={{...botao,background:'#166534'}} onClick={()=>void agir('APROVAR')} disabled={ocupado}>Aprovar (gestor)</button>
        <textarea aria-label="Justificativa da reprovacao" placeholder="Justificativa para reprovar (minimo 10 caracteres)" style={{...campo,flex:'1 1 250px'}} value={motivo} onChange={e=>setMotivo(e.target.value)}/>
        <button type="button" style={{...botao,background:'#b91c1c'}} disabled={ocupado||motivo.trim().length<10} onClick={()=>void agir('REPROVAR')}>Reprovar (gestor)</button>
      </div>}
      {['APROVADO','REPROVADO','CANCELADO'].includes(escolhido.status)&&<p style={{fontSize:13}}>Etapa encerrada. Fotos preservadas para consulta e auditoria.</p>}
    </div>}
    {msg&&<p role="status" style={{color:'#92400e',marginTop:14}}>{msg}</p>}
    <p style={{fontSize:12,color:'#64748b',marginTop:14}}>O envio e a exclusao sao verificados no servidor conforme usuario e status do treinamento. Nenhuma pontuacao automatica foi liberada.</p>
  </section>;
}
