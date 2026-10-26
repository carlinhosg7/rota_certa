export const OPCOES_CLASSIFICACAO = [
  { id: "COMPRA_EM_DIA", nome: "Ativa — Compra em dia" },
  { id: "SEM_COMPRA_ULTIMA_COLECAO", nome: "Ativa — Sem compra da última coleção" },
  { id: "BLOQUEADA", nome: "Ativa — Bloqueada" },
  { id: "LIMITE_SEM_PEDIDO", nome: "Ativa — Limite disponível sem pedido" },
  { id: "REDUCAO_COMPRA", nome: "Ativa — Redução de compra" },
  { id: "CADASTRO_VALIDAR", nome: "Ativa — Cadastro a validar" },
  { id: "POTENCIAL_EXPANSAO", nome: "Ativa — Potencial de expansão" },
] as const;
export type CodigoClassificacao = (typeof OPCOES_CLASSIFICACAO)[number]["id"];
export function validarClassificacoes(v: unknown): CodigoClassificacao[] | null {
  if (!Array.isArray(v) || v.length > OPCOES_CLASSIFICACAO.length) return null;
  const permitidas = new Set<string>(OPCOES_CLASSIFICACAO.map(x => x.id));
  if (!v.every(x => typeof x === "string" && permitidas.has(x))) return null;
  return [...new Set(v)] as CodigoClassificacao[];
}
