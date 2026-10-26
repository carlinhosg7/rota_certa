from pathlib import Path
from datetime import datetime
import re, shutil, subprocess, sys

root=Path(r'D:\Kidy_sales_Intelligence')
painel=root/'src/app/carteira/page.tsx'
lista=root/'src/app/carteira/clientes/page.tsx'
modulo=root/'src/lib/carteira-gerentes.ts'
if not painel.exists() or not lista.exists(): sys.exit('Execute no computador Windows, dentro do projeto D:\\Kidy_sales_Intelligence')
orig={painel:painel.read_text(encoding='utf-8-sig'),lista:lista.read_text(encoding='utf-8-sig')}
p=orig[painel]; l=orig[lista]
if 'listarGerentesRegionais' in p or 'listarGerentesRegionais' in l: sys.exit('Integração já detectada; nenhum arquivo alterado.')

def sub(s,pattern,repl,label, count=1):
    out,n=re.subn(pattern,lambda m: repl(m) if callable(repl) else repl,s,count=count)
    if n!=count: raise RuntimeError(f'{label}: esperado {count} trecho(s), encontrados {n}. Nenhum arquivo alterado.')
    return out

module_text='''import "server-only";

export type GerenteRegional = {
  codigo_supervisor: string;
  regional: string;
  gerente: string;
  ativo: boolean;
};

/** Consulta exclusivamente no servidor. Não expõe a chave do Supabase ao navegador. */
export async function listarGerentesRegionais(): Promise<GerenteRegional[]> {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.error("[GERENTES] Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no servidor.");
    return [];
  }
  try {
    const response = await fetch(
      `${url.replace(/\\/$/, "")}/rest/v1/kidy_gerentes_regionais?select=codigo_supervisor,regional,gerente,ativo&ativo=eq.true&order=gerente.asc,regional.asc`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" }
    );
    if (!response.ok) {
      console.error("[GERENTES] Falha na consulta:", response.status);
      return [];
    }
    const dados: unknown = await response.json();
    if (!Array.isArray(dados)) return [];
    return dados.filter((x): x is GerenteRegional =>
      x !== null && typeof x === "object" &&
      typeof x.codigo_supervisor === "string" && typeof x.gerente === "string"
    );
  } catch (erro) {
    console.error("[GERENTES] Erro ao consultar Supabase:", erro);
    return [];
  }
}
'''

try:
    for which in ('p','l'):
        s=p if which=='p' else l
        s='import { listarGerentesRegionais } from "@/lib/carteira-gerentes";\n'+s
        s=sub(s,r'(searchParams:\s*Promise<\{)',lambda m:m.group(1)+'\n    gerente?: string;',f'{which} tipo URL')
        if which=='p':
            s=sub(s,r'(const parametros = await searchParams;)',lambda m:m.group(1)+'\n  const gerenteFiltro = String(parametros.gerente ?? "").trim().toUpperCase();\n  const gerentesRegionais = await listarGerentesRegionais();\n  const gerentesDisponiveis = [...new Set(gerentesRegionais.map(g => g.gerente))].sort((a,b) => a.localeCompare(b, "pt-BR"));\n  const regionaisGerente = new Set(gerentesRegionais.filter(g => g.gerente === gerenteFiltro).map(g => codigo(g.codigo_supervisor)));', 'painel params')
            s=sub(s,r'(  const supervisores = new Map<string, string>\(\);)',lambda m:'  if (gerenteFiltro) {\n    clientes = clientes.filter(c => c.supervisores?.some(s => regionaisGerente.has(codigo(s.codigo))));\n  }\n\n'+m.group(1),'painel filtro gerente')
            s=sub(s,r'(  if \(supervisorFiltro\) query\.set\("supervisor", supervisorFiltro\);)',lambda m:'  if (gerenteFiltro) query.set("gerente", gerenteFiltro);\n'+m.group(1),'painel url query')
            s=sub(s,r'(\s*<label style=\{\{display: "grid", gap: 6\}\}>\s*<span style=\{\{fontSize: 12\}\}>Supervisor</span>)',lambda m:'\n                 <label style={{display: "grid", gap: 6}}>\n                   <span style={{fontSize: 12}}>Gerente</span>\n                   <select name="gerente" defaultValue={gerenteFiltro} style={{padding: 10, minWidth: 190}}>\n                     <option value="">Todos</option>\n                     {gerentesDisponiveis.map(g => <option key={g} value={g}>{g}</option>)}\n                   </select>\n                 </label>'+m.group(1),'painel seletor gerente')
            s=sub(s,r'(if \(supervisorFiltro\) q\.set\("supervisor", supervisorFiltro\);)',lambda m:'if (gerenteFiltro) q.set("gerente", gerenteFiltro);\n                     '+m.group(1),'painel links receita')
            s=sub(s,r'(\.\.\.\(supervisorFiltro \? \{ supervisor: supervisorFiltro \} : \{\}\),)',lambda m:'...(gerenteFiltro ? { gerente: gerenteFiltro } : {}),\n     '+m.group(1),'painel links faixas')
            # cartao links: include manager by adding an optional final argument and forwarding it
            s=sub(s,r'(  representante = ""\s*\) \{)',lambda m:'  representante = "",\n  gerente = ""\n) {','cartao assinatura')
            s=sub(s,r'(  const params = new URLSearchParams\(\{ filtro \}\);)',lambda m:m.group(1)+'\n  if (gerente) params.set("gerente", gerente);','cartao query')
            s=sub(s,r'(supervisorFiltro, representanteFiltro\))',lambda m:'supervisorFiltro, representanteFiltro, gerenteFiltro)', 'cartoes links',count=5)
            s=sub(s,r'(\{cartao\(\s*"Clientes na carteira",\s*inteiro\(total\),\s*`\$\{inteiro\(grupos\)\} grupos distintos`)(\s*\)\})',lambda m:m.group(1)+', "#172b4d", "todos", supervisorFiltro, representanteFiltro, gerenteFiltro'+m.group(2),'cartao total')
        else:
            s=sub(s,r'(  const params = await searchParams;)',lambda m:m.group(1)+'\n  const gerenteFiltro = String(params.gerente ?? "").trim().toUpperCase();\n  const gerentesRegionais = await listarGerentesRegionais();\n  const gerentesDisponiveis = [...new Set(gerentesRegionais.map(g => g.gerente))].sort((a,b) => a.localeCompare(b, "pt-BR"));\n  const regionaisGerente = new Set(gerentesRegionais.filter(g => g.gerente === gerenteFiltro).map(g => cod(g.codigo_supervisor)));','lista params')
            s=sub(s,r'(  if \(supervisor\) \{)',lambda m:'  if (gerenteFiltro) {\n    clientes = clientes.filter(c => c.supervisores?.some(s => regionaisGerente.has(cod(s.codigo))));\n  }\n\n'+m.group(1),'lista filtro gerente')
            s=sub(s,r'(    q\.set\("filtro", filtro\);)',lambda m:m.group(1)+'\n    if (gerenteFiltro) q.set("gerente", gerenteFiltro);','lista paginação')
            s=sub(s,r'(\s*<input type="hidden" name="filtro" value=\{filtro\} />)',lambda m:m.group(1)+'\n             <label style={{display: "grid", gap: 5, fontSize: 12}}>\n               Gerente\n               <select name="gerente" defaultValue={gerenteFiltro} style={{padding: 12, border: "1px solid #cbd5e1", borderRadius: 9}}>\n                 <option value="">Todos</option>\n                 {gerentesDisponiveis.map(g => <option key={g} value={g}>{g}</option>)}\n               </select>\n             </label>','lista seletor gerente')
        if which=='p':p=s
        else:l=s
except Exception as e:
    sys.exit('NENHUMA ALTERAÇÃO APLICADA: '+str(e))

backup=Path(r'D:\Kidy_sales_Intelligence_BACKUPS')/('gerentes_'+datetime.now().strftime('%Y%m%d_%H%M%S'))
backup.mkdir(parents=True,exist_ok=True)
for f in (painel,lista):shutil.copy2(f,backup/f.name.replace('.tsx',('_painel' if f==painel else '_clientes')+'.tsx'))
oldmodule=modulo.read_bytes() if modulo.exists() else None
try:
    painel.write_text(p,encoding='utf-8')
    lista.write_text(l,encoding='utf-8')
    modulo.write_text(module_text,encoding='utf-8')
    print('Arquivos integrados. Validando TypeScript...')
    res=subprocess.run('npx tsc --noEmit',cwd=root,shell=True)
    if res.returncode:raise RuntimeError('Falha na validação TypeScript')
    print('SUCESSO: TypeScript sem erros. Backup:',backup)
    print('ATENÇÃO: confirme que SUPABASE_SERVICE_ROLE_KEY existe no ambiente servidor.')
except Exception as e:
    painel.write_text(orig[painel],encoding='utf-8')
    lista.write_text(orig[lista],encoding='utf-8')
    if oldmodule is None:modulo.unlink(missing_ok=True)
    else:modulo.write_bytes(oldmodule)
    sys.exit('ALTERAÇÕES REVERTIDAS: '+str(e))
