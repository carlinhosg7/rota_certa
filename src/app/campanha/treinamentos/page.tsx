import EvidenciasAprovacoes from "./EvidenciasAprovacoes";
import TreinamentosClient from './TreinamentosClient';

export const dynamic = 'force-dynamic';

export default function TreinamentosPage() {
  return <><TreinamentosClient /><EvidenciasAprovacoes /></>;
}
