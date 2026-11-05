import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { validarToken } from '@/lib/auth';
import Sidebar from '@/components/Sidebar';
import MarketingClient from './MarketingClient';

export default async function MarketingPage() {
  const token = (await cookies()).get('kidy_session')?.value;
  if (!token) redirect('/');
  const usuario = await validarToken(token);
  if (!usuario) redirect('/');
  const nome = String(usuario.nome || usuario.usuario || 'Usuario');
  const perfil = String(usuario.perfil || '').toUpperCase();
  return <div className="app-shell">
    <Sidebar nome={nome} perfil={perfil} usuario={String(usuario.usuario || '')} />
    <main className="content">
      <header className="topbar"><div>
        <span className="eyebrow">CONQUISTE SUA AMOSTRA 2027</span>
        <Link
  href="/campanha/treinamentos"
  style={{
    display: 'inline-flex',
    alignItems: 'center',
    marginBottom: 14,
    color: '#ea7600',
    fontSize: 13,
    fontWeight: 700,
    textDecoration: 'none'
  }}
>
  ← Voltar ao Treinamento Saúde e Conforto
</Link>
<h1>Feedback do Marketing</h1>
        <p>Confirmacao do treinamento diretamente com o cliente</p>
      </div></header>
      <MarketingClient />
    </main>
  </div>;
}
