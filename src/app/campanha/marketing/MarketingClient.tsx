'use client';
import { useCallback, useEffect, useState } from 'react';

type Feedback = { status: string; canal?: string; contato_em?: string; cliente_confirmou?: boolean; nota?: string; recomendaria?: boolean };
type Treinamento = {
  id: string; codigo_cliente: string; nome_cliente_snapshot: string | null;
  codigo_representante: string; data_treinamento: string; descricao: string;
  kidy_campanha_treinamentos_marketing: Feedback | Feedback[] | null;
};
const campo: React.CSSProperties = { width: '100%', padding: 10, border: '1px solid #d1d5db', borderRadius: 8 };
const legenda: React.CSSProperties = { fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 };
function feedback(t: Treinamento) { const f = t.kidy_campanha_treinamentos_marketing; return Array.isArray(f) ? f[0] : f; }
export default function MarketingClient() {
  const [lista, setLista] = useState<Treinamento[]>([]);
  const [id, setId] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [canal, setCanal] = useState('WHATSAPP');
  const [data, setData] = useState('');
  const [resultado, setResultado] = useState('INCONCLUSIVO');
  const [nota, setNota] = useState('BOM');
  const [recomendaria, setRecomendaria] = useState('SIM');
  const [comentarios, setComentarios] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [motivo, setMotivo] = useState('');
  const carregar = useCallback(async () => {
    setErro('');
    const res = await fetch('/api/campanha/marketing', { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.erro || 'Erro ao consultar');
    setLista(json.treinamentos || []);
  }, []);
  useEffect(() => { void carregar().catch(e => setErro(String(e.message || e))); }, [carregar]);
  const selecionado = lista.find(t => t.id === id);
  const atual = selecionado ? feedback(selecionado) : null;
  const finalizado = atual?.status === 'VALIDADO' || atual?.status === 'REPROVADO';
  async function enviar() {
    if (!selecionado || ocupado || finalizado) return;
    setOcupado(true); setErro(''); setAviso('');
    try {
      if (!data) throw new Error('Informe a data e hora do contato');
      const res = await fetch('/api/campanha/marketing', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: resultado, canal, contatoEm: new Date(data).toISOString(),
          confirmou: resultado === 'VALIDADO' ? true : resultado === 'REPROVADO' ? false : null,
          nota, recomendaria: recomendaria === 'SIM', comentarios, observacoes, motivo })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.erro || 'Erro ao salvar');
      setAviso('Feedback registrado: ' + json.status);
      await carregar();
    } catch(e) { setErro(e instanceof Error ? e.message : 'Falha ao salvar'); }
    finally { setOcupado(false); }
  }
  return <div style={{ maxWidth: 1050, padding: '16px 0 36px', display: 'grid', gap: 16 }}>
    <div style={{ padding: 18, background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 12 }}>
      <strong>Segunda validacao obrigatoria</strong><p>Somente treinamentos aprovados pelo gestor aparecem aqui. A confirmacao pelo cliente e exigida para validar; contatos inconclusivos podem ser retomados. Nenhum ponto e concedido nesta tela.</p>
    </div>
    {erro && <div role="alert" style={{ padding: 12, background: '#fee2e2', borderRadius: 8 }}>{erro}</div>}
    {aviso && <div role="status" style={{ padding: 12, background: '#dcfce7', borderRadius: 8 }}>{aviso}</div>}
    <section style={{ padding: 20, background: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
      <h2 style={{ marginTop: 0 }}>Fila de treinamentos aprovados</h2>
      <label style={legenda}>Treinamento</label>
      <select style={campo} value={id} onChange={e=> {setId(e.target.value);setAviso('');}}>
        <option value="">Selecione um treinamento</option>
        {lista.map(t=><option key={t.id} value={t.id}>{t.codigo_cliente} - {t.nome_cliente_snapshot || 'Cliente'} | Rep. {t.codigo_representante} | {t.data_treinamento} | {feedback(t)?.status || 'PENDENTE'}</option>)}
      </select>
      {selecionado && <div style={{ padding: 12, marginTop: 12, background: '#f8fafc', borderRadius: 8 }}>
        <strong>{selecionado.nome_cliente_snapshot || selecionado.codigo_cliente}</strong>
        <p>Codigo: {selecionado.codigo_cliente} · Representante: {selecionado.codigo_representante} · Data: {selecionado.data_treinamento}</p>
        <p>{selecionado.descricao}</p><strong>Status Marketing: {atual?.status || 'PENDENTE'}</strong>
      </div>}
    </section>
    {selecionado && <section style={{ padding: 20, background: 'white', borderRadius: 12, border: '1px solid #e5e7eb', display: 'grid', gap: 14 }}>
      <h2 style={{ margin: 0 }}>Avaliacao do cliente</h2>
      {finalizado ? <p>Esta avaliacao foi encerrada. Alteracoes exigem revisao administrativa auditada.</p> : <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
          <div><label style={legenda}>Canal do contato</label><select style={campo} value={canal} onChange={e=>setCanal(e.target.value)}><option value="WHATSAPP">WhatsApp</option><option value="TELEFONE">Telefone</option><option value="EMAIL">E-mail</option><option value="OUTRO">Outro</option></select></div>
          <div><label style={legenda}>Data e hora do contato</label><input type="datetime-local" style={campo} value={data} onChange={e=>setData(e.target.value)}/></div>
          <div><label style={legenda}>Resultado do contato</label><select style={campo} value={resultado} onChange={e=>setResultado(e.target.value)}><option value="INCONCLUSIVO">Nao foi possivel confirmar</option><option value="VALIDADO">Cliente confirmou treinamento</option><option value="REPROVADO">Cliente negou treinamento</option></select></div>
        </div>
        {resultado === 'VALIDADO' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
          <div><label style={legenda}>Avaliacao do cliente</label><select style={campo} value={nota} onChange={e=>setNota(e.target.value)}><option value="EXCELENTE">Excelente</option><option value="BOM">Bom</option><option value="REGULAR">Regular</option><option value="RUIM">Ruim</option></select></div>
          <div><label style={legenda}>Recomendaria o treinamento?</label><select style={campo} value={recomendaria} onChange={e=>setRecomendaria(e.target.value)}><option value="SIM">Sim</option><option value="NAO">Nao</option></select></div>
        </div>}
        {resultado === 'REPROVADO' && <div><label style={legenda}>Motivo da reprovacao (minimo 10 caracteres)</label><textarea style={campo} rows={3} value={motivo} onChange={e=>setMotivo(e.target.value)} required /></div>}
        <div><label style={legenda}>Comentarios do cliente</label><textarea style={campo} rows={3} value={comentarios} onChange={e=>setComentarios(e.target.value)} /></div>
        <div><label style={legenda}>Observacoes internas Marketing</label><textarea style={campo} rows={3} value={observacoes} onChange={e=>setObservacoes(e.target.value)} /></div>
        <button type="button" disabled={ocupado || !data || (resultado === 'REPROVADO' && motivo.trim().length < 10)} onClick={()=>void enviar()} style={{ background: '#f58220', color: '#fff', border: 0, borderRadius: 10, padding: '12px 20px', cursor: 'pointer', justifySelf: 'start', opacity: ocupado ? .6 : 1 }}>{ocupado ? 'Salvando...' : 'Registrar feedback'}</button>
      </>}
    </section>}
  </div>;
}
