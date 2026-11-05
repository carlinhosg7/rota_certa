'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import styles from './treinamentos.module.css';

type Cliente = {
  codigoCliente: string;
  razaoSocial: string;
  cidade: string;
  uf: string;
  situacao: string;
  ultimaCompra: string | null;
  representantes: string[];
};

type Treinamento = {
  id: string;
  codigo_cliente: string;
  nome_cliente_snapshot: string;
  codigo_representante: string;
  codigo_supervisor_snapshot?: string | null;
  data_treinamento: string;
  descricao: string;
  participantes: number;
  status: string;
  criado_em: string;
};

const inicio = '2026-11-09';
const fim = '2027-03-31';
const dataBrasil = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

async function lerResposta(r: Response): Promise<Record<string, unknown>> {
  const dados: unknown = await r.json().catch(() => ({}));
  const objeto = dados && typeof dados === 'object' && !Array.isArray(dados)
    ? dados as Record<string, unknown> : {};
  if (!r.ok) throw new Error(typeof objeto.erro === 'string' ? objeto.erro : `Erro HTTP ${r.status}`);
  return objeto;
}

export default function TreinamentosClient() {
  const [busca, setBusca] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [representante, setRepresentante] = useState('');
  const [data, setData] = useState('');
  const [participantes, setParticipantes] = useState('');
  const [descricao, setDescricao] = useState('');
  const [registros, setRegistros] = useState<Treinamento[]>([]);
  const [homologacao, setHomologacao] = useState(false);
  const [podeHomologar, setPodeHomologar] = useState(false);
  const [carregandoBusca, setCarregandoBusca] = useState(false);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroBusca, setErroBusca] = useState('');
  const [erroLista, setErroLista] = useState('');
  const [aviso, setAviso] = useState('');

  const atualizarLista = useCallback(async () => {
    setCarregandoLista(true); setErroLista('');
    try {
      const resultado = await lerResposta(await fetch(homologacao ? '/api/campanha/treinamentos?homologacao=1' : '/api/campanha/treinamentos', { cache: 'no-store' }));
      setRegistros(Array.isArray(resultado.treinamentos) ? resultado.treinamentos as Treinamento[] : []);
      setPodeHomologar(resultado.podeHomologar === true);
    } catch (e) { setErroLista(e instanceof Error ? e.message : 'Falha ao consultar treinamentos'); }
    finally { setCarregandoLista(false); }
  }, [homologacao]);

  useEffect(() => { void atualizarLista(); }, [atualizarLista]);

  async function pesquisar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setCliente(null); setRepresentante(''); setClientes([]); setErroBusca(''); setAviso('');
    const termo = busca.trim();
    if (termo.length < 3 || termo.length > 80) { setErroBusca('Digite de 3 a 80 caracteres.'); return; }
    setCarregandoBusca(true);
    try {
      const resultado = await lerResposta(await fetch(`/api/campanha/treinamentos/clientes?q=${encodeURIComponent(termo)}`, { cache: 'no-store' }));
      setClientes(Array.isArray(resultado.clientes) ? resultado.clientes as Cliente[] : []);
    } catch (e) { setErroBusca(e instanceof Error ? e.message : 'Falha ao pesquisar cliente'); }
    finally { setCarregandoBusca(false); }
  }

  function escolher(c: Cliente) {
    setCliente(c);
    setRepresentante(c.representantes.length === 1 ? c.representantes[0] : '');
    setClientes([]); setAviso('');
  }

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setAviso('');
    if (!cliente || !representante) { setAviso('Selecione o cliente e o representante.'); return; }
    if (!data || data < inicio || data > fim || data > dataBrasil()) {
      setAviso('Informe uma data já realizada dentro do período da campanha.'); return;
    }
    const n = Number(participantes);
    if (!Number.isInteger(n) || n < 1 || n > 10000) { setAviso('Informe de 1 a 10.000 participantes.'); return; }
    if (descricao.trim().length < 10 || descricao.trim().length > 3000) {
      setAviso('A descrição deve ter entre 10 e 3.000 caracteres.'); return;
    }
    setSalvando(true);
    try {
      const resultado = await lerResposta(await fetch('/api/campanha/treinamentos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigoCliente: cliente.codigoCliente, codigoRepresentante: representante,
          dataTreinamento: data, participantes: n, descricao: descricao.trim() }),
      }));
      setCliente(null); setRepresentante(''); setBusca(''); setData(''); setParticipantes(''); setDescricao('');
      setAviso(`Rascunho cadastrado com sucesso! Protocolo: ${String(resultado.id ?? '')}. Sem pontuação.`);
      await atualizarLista();
    } catch (e) { setAviso(e instanceof Error ? e.message : 'Não foi possível salvar o rascunho.'); }
    finally { setSalvando(false); }
  }

  const hoje = dataBrasil();
  const habilitarCadastro = hoje >= inicio;
  return (
    <main className={styles.pagina}>
      <div className={styles.topo}>
        <div>
          <a className={styles.voltar} href="/campanha">← Voltar para Campanha</a>
          <h1>Treinamento Saúde e Conforto</h1>
          <p>Conquiste Sua Amostra 2027 · Cadastro e acompanhamento de rascunhos</p>
        </div>
        <span className={styles.etiqueta}>Sem pontuação nesta fase</span>
      </div>
      <div className={styles.avisoFixo}>Período da campanha: 09/11/2026 a 31/03/2027. Não é possível registrar treinamentos com data futura. Fotos e aprovação serão adicionadas posteriormente.</div>
      <section className={styles.painel}>
        <h2>1. Localizar cliente</h2>
        <form className={styles.busca} onSubmit={pesquisar}>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Código do cliente ou razão social (mínimo 3 caracteres)" maxLength={80} aria-label="Pesquisar cliente" />
          <button type="submit" disabled={carregandoBusca}>{carregandoBusca ? 'Pesquisando...' : 'Pesquisar'}</button>
        </form>
        {erroBusca && <p className={styles.erro} role="alert">{erroBusca}</p>}
        {clientes.length > 0 && <div className={styles.resultados}>{clientes.map(c => (
          <button type="button" className={styles.clienteItem} key={c.codigoCliente} onClick={() => escolher(c)}>
            <strong>{c.codigoCliente} · {c.razaoSocial}</strong>
            <span>{c.cidade}/{c.uf} · {c.situacao} · Representantes: {c.representantes.join(', ')}</span>
          </button>
        ))}</div>}
        {!carregandoBusca && !erroBusca && busca.trim().length >= 3 && !cliente && clientes.length === 0 && <p className={styles.ajuda}>Nenhum cliente na lista. Pesquise novamente ou use o código exato do cliente.</p>}
        {cliente && <div className={styles.selecionado}>
          <strong>{cliente.codigoCliente} · {cliente.razaoSocial}</strong>
          <span>{cliente.cidade}/{cliente.uf} · Situação: {cliente.situacao} · Última compra: {cliente.ultimaCompra ?? 'Não informada'}</span>
          <button type="button" onClick={() => { setCliente(null); setRepresentante(''); }}>Trocar cliente</button>
        </div>}
      </section>
      <section className={styles.painel}>
        <h2>2. Informações do treinamento</h2>
        <form onSubmit={salvar} className={styles.formulario}>
          <label>Representante responsável
            <select value={representante} onChange={e => setRepresentante(e.target.value)} disabled={!cliente || salvando} required>
              <option value="">Selecione o representante</option>
              {cliente?.representantes.map(rep => <option value={rep} key={rep}>Representante {rep}</option>)}
            </select>
          </label>
          <div className={styles.duasColunas}>
            <label>Data do treinamento
              <input type="date" min={inicio} max={hoje < fim ? hoje : fim} value={data} onChange={e => setData(e.target.value)} disabled={salvando || !habilitarCadastro} required />
            </label>
            <label>Número de participantes
              <input type="number" min={1} max={10000} step={1} value={participantes} onChange={e => setParticipantes(e.target.value)} disabled={salvando || !habilitarCadastro} required />
            </label>
          </div>
          <label>Descrição do treinamento
            <textarea value={descricao} onChange={e => setDescricao(e.target.value)} minLength={10} maxLength={3000} rows={5} disabled={salvando || !habilitarCadastro} required placeholder="Descreva o conteúdo apresentado, público treinado e resultados." />
          </label>
          {!habilitarCadastro && <p className={styles.ajuda}>O cadastro ficará disponível em 09/11/2026, data de início da campanha.</p>}
          {aviso && <p className={styles.feedback} role="status">{aviso}</p>}
          <button className={styles.salvar} type="submit" disabled={!cliente || !representante || salvando || !habilitarCadastro}>{salvando ? 'Salvando...' : 'Salvar rascunho'}</button>
        </form>
      </section>
      <section className={styles.painel}>
        <div className={styles.linhaTitulo}><h2>3. Treinamentos registrados {homologacao ? '(HOMOLOGACAO)' : ''}</h2>
        {podeHomologar && <button type="button" onClick={() => {setRegistros([]); setHomologacao(v => !v);}} style={{background:homologacao?'#9a3412':'#fff7ed',color:homologacao?'#fff':'#9a3412',border:'1px solid #fb923c',padding:'8px 12px',borderRadius:8,fontWeight:700}}>{homologacao ? 'Voltar aos oficiais' : 'Testar homologacao (ADMIN)'}</button>}<button type="button" onClick={() => void atualizarLista()} disabled={carregandoLista}>{carregandoLista ? 'Atualizando...' : 'Atualizar'}</button></div>
        {erroLista && <p className={styles.erro} role="alert">{erroLista}</p>}
        {!erroLista && !carregandoLista && registros.length === 0 && <p className={styles.ajuda}>Nenhum treinamento cadastrado para os representantes autorizados.</p>}
        {registros.length > 0 && <div className={styles.rolagem}><table><thead><tr><th>Data</th><th>Cliente</th><th>Representante</th><th>Participantes</th><th>Status</th></tr></thead><tbody>
          {registros.map(r => <tr key={r.id}><td>{r.data_treinamento?.slice(0,10).split('-').reverse().join('/')}</td><td>{r.codigo_cliente} · {r.nome_cliente_snapshot}</td><td>{r.codigo_representante}</td><td>{r.participantes}</td><td>{r.status}</td></tr>)}
        </tbody></table></div>}
        {registros.length === 100 && <p className={styles.ajuda}>Exibindo os 100 registros mais recentes.</p>}
      </section>
    </main>
  );
}
