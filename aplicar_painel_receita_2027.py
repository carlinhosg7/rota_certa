from pathlib import Path
from datetime import datetime
import shutil
import re

ROOT = Path('src/app/carteira')
files = [ROOT/'page.tsx', ROOT/'clientes/page.tsx', ROOT/'grupos/page.tsx']
for p in files:
    if not p.is_file():
        raise SystemExit(f'ARQUIVO AUSENTE: {p}')
orig = {p: p.read_text(encoding='utf-8-sig') for p in files}
if any('PAINEL_RECEITA_2027' in s for s in orig.values()):
    raise SystemExit('A integracao visual ja parece aplicada. Nenhum arquivo alterado.')

def rep(s, old, new, nome):
    count=s.count(old)
    if count!=1:
        raise ValueError(f'{nome}: ancora encontrada {count} vezes (esperado 1): {old[:90]!r}')
    return s.replace(old,new,1)

# Dashboard
p=files[0]; s=orig[p]
s=rep(s,'  classificacaoProvisoria: boolean;','  classificacaoProvisoria: boolean;\n  situacaoEmpresa: string;\n  cnpj: string;',str(p))
s=rep(s,'    representante?: string;','    representante?: string;\n    receita?: string;',str(p))
s=rep(s,'  const representanteFiltro = codigo(parametros.representante);','  const representanteFiltro = codigo(parametros.representante);\n  const receitaFiltro = String(parametros.receita ?? "").toUpperCase();',str(p))
anchor='  const total = clientes.length;'
insert='''  // PAINEL_RECEITA_2027: contagem por cliente e Grupo Cliente distinto.
  const clientesEscopo = clientes;
  const situacoesReceita = ["ATIVA", "BAIXADA", "INAPTA", "SUSPENSA", "NAO LOCALIZADO", "PENDENTE FORMATO", "NAO VERIFICADA"];
  const receitaValida = situacoesReceita.includes(receitaFiltro) ? receitaFiltro : "";
  const indicadoresReceita = situacoesReceita.map(situacao => {
    const encontrados = clientesEscopo.filter(c =>
      String(c.situacaoEmpresa || "NAO VERIFICADA").replaceAll("_", " ").toUpperCase() === situacao
    );
    const grupos = new Set(encontrados.map(c => String(c.grupoCliente || "").trim().toUpperCase()).filter(Boolean));
    return { situacao, clientes: encontrados.length, grupos: grupos.size };
  });
  const riscoReceita = clientesEscopo.filter(c =>
    ["BAIXADA", "INAPTA"].includes(String(c.situacaoEmpresa || "").toUpperCase()) && Number(c.limiteDisponivel) > 0
  ).length;
  if (receitaValida) {
    clientes = clientes.filter(c => String(c.situacaoEmpresa || "NAO VERIFICADA").replaceAll("_", " ").toUpperCase() === receitaValida);
  }

'''
s=rep(s,anchor,insert+anchor,str(p))
s=rep(s,'  if (representanteFiltro) query.set("representante", representanteFiltro);','  if (representanteFiltro) query.set("representante", representanteFiltro);\n  if (receitaValida) query.set("receita", receitaValida);',str(p))
# Form select before button
anchor='                <button type="submit" style={{'
insert='''                <label style={{display: "grid", gap: 6}}>
                  <span style={{fontSize: 12}}>Situação Receita Federal</span>
                  <select name="receita" defaultValue={receitaValida} style={{padding: 10, minWidth: 190}}>
                    <option value="">Todas</option>
                    {situacoesReceita.map(st => <option key={st} value={st}>{st}</option>)}
                  </select>
                </label>

'''
s=rep(s,anchor,insert+anchor,str(p))
anchor='              <div style={{\n                display: "grid",\n                gridTemplateColumns:'
insert='''              {/* PAINEL_RECEITA_2027 */}
              <section style={{background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: 20, marginBottom: 22}}>
                <h2 style={{fontSize: 18, marginBottom: 8}}>Situação cadastral — Receita Federal</h2>
                <p style={{fontSize: 12, color: "#64748b", marginBottom: 15}}>
                  Contagem de clientes por Código Cliente e grupos distintos por Grupo Cliente. Independente da classificação comercial.
                </p>
                <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10}}>
                  {indicadoresReceita.map(item => {
                    const q = new URLSearchParams({receita: item.situacao});
                    if (supervisorFiltro) q.set("supervisor", supervisorFiltro);
                    if (representanteFiltro) q.set("representante", representanteFiltro);
                    return <Link key={item.situacao} href={`/carteira/clientes?${q}`} style={{textDecoration: "none", color: "inherit", padding: 14, border: "1px solid #e2e8f0", borderRadius: 12}}>
                      <div style={{fontSize: 12, fontWeight: 700}}>{item.situacao}</div>
                      <div style={{fontSize: 24, fontWeight: 800}}>{inteiro(item.clientes)}</div>
                      <div style={{fontSize: 12, color: "#64748b"}}>{inteiro(item.grupos)} grupos</div>
                    </Link>;
                  })}
                </div>
                <p style={{marginTop: 15, fontSize: 13, color: "#b91c1c", fontWeight: 700}}>
                  Atenção: {inteiro(riscoReceita)} clientes com CNPJ baixado ou inapto e limite disponível.
                </p>
              </section>

'''
s=rep(s,anchor,insert+anchor,str(p))
# Dashboard existing cards links do not preserve receita filter: avoid misleading results when filtering by Receita; links to client list need receipt param via cartao optional extra? simpler add separate note.
orig[p]=s

# Clients
p=files[1]; s=orig[p]
s=rep(s,'  flags?: string[];','  flags?: string[];\n  situacaoEmpresa?: string;',str(p))
s=rep(s,'    busca?: string;','    busca?: string;\n    receita?: string;',str(p))
s=rep(s,'  const busca = String(params.busca ?? "").trim().slice(0, 100);','  const busca = String(params.busca ?? "").trim().slice(0, 100);\n  const situacoesReceita = ["ATIVA", "BAIXADA", "INAPTA", "SUSPENSA", "NAO LOCALIZADO", "PENDENTE FORMATO", "NAO VERIFICADA"];\n  const receita = situacoesReceita.includes(String(params.receita ?? "").toUpperCase()) ? String(params.receita).toUpperCase() : "";',str(p))
anchor='  if (busca) {\n'
insert='''  // PAINEL_RECEITA_2027
  if (receita) {
    clientes = clientes.filter(c => String(c.situacaoEmpresa || "NAO VERIFICADA").replaceAll("_", " ").toUpperCase() === receita);
  }

'''
s=rep(s,anchor,insert+anchor,str(p))
s=rep(s,'    if (busca) q.set("busca", busca);','    if (busca) q.set("busca", busca);\n    if (receita) q.set("receita", receita);',str(p))
anchor='            <input\n              name="busca"'
insert='''            <label style={{display: "grid", gap: 5, fontSize: 12}}>
              Situação Receita
              <select name="receita" defaultValue={receita} style={{padding: 12, border: "1px solid #cbd5e1", borderRadius: 9}}>
                <option value="">Todas</option>
                {situacoesReceita.map(st => <option key={st} value={st}>{st}</option>)}
              </select>
            </label>

'''
s=rep(s,anchor,insert+anchor,str(p))
s, n = re.subn(r'(\s+"(?:Situação|SituaÃ§Ã£o)",\n)(\s+"(?:Ação|AÃ§Ã£o)")', r'\1                    "Receita Federal",\n\2', s, count=1)
if n != 1: raise ValueError('clientes: cabecalho nao encontrado')
anchor='                      <td style={{ padding: 12 }}>\n                        {c.situacao || c.carteira || "—"}\n                      </td>'
# preserve original exact string potentially mojibake: use regex instead
import re
pattern=r'(\s*<td style=\{\{ padding: 12 \}\}>\s*\{c\.situacao \|\| c\.carteira \|\| [^\n]+\}\s*</td>)'
m=re.search(pattern,s)
if not m: raise ValueError('clientes: celula situacao nao encontrada')
s=s[:m.end()]+'''\n                      <td style={{ padding: 12, fontWeight: 700 }}>
                        {c.situacaoEmpresa || "NAO VERIFICADA"}
                      </td>'''+s[m.end():]
orig[p]=s

# Groups
p=files[2]; s=orig[p]
s=rep(s,'  limiteDisponivel?: number;','  limiteDisponivel?: number;\n  situacaoEmpresa?: string;',str(p))
s=rep(s,'    filtroCliente?: string;','    filtroCliente?: string;\n    receita?: string;',str(p))
anchor='  const representanteFiltro = codigo(params.representante);'
insert='''  const situacoesReceita = ["ATIVA", "BAIXADA", "INAPTA", "SUSPENSA", "NAO LOCALIZADO", "PENDENTE FORMATO", "NAO VERIFICADA"];
  const receita = situacoesReceita.includes(texto(params.receita).toUpperCase()) ? texto(params.receita).toUpperCase() : "";
'''
s=rep(s,anchor,anchor+'\n'+insert,str(p))
# group filtering only affects panel list; detail unaffected, explicitly indicate in UI
anchor='  const totalGruposPainel = gruposPainel.length;'
insert='''  // PAINEL_RECEITA_2027: indicadores respeitam permissões e filtros comerciais.
  const indicadoresReceita = situacoesReceita.map(st => {
    const afetados = gruposPainel.flatMap(g => g.clientes).filter(c =>
      String(c.situacaoEmpresa || "NAO VERIFICADA").replaceAll("_", " ").toUpperCase() === st
    );
    return {situacao: st, clientes: afetados.length, grupos: new Set(afetados.map(c => normalizar(c.grupoCliente)).filter(Boolean)).size};
  });
  const riscoReceita = gruposPainel.flatMap(g => g.clientes).filter(c =>
    ["BAIXADA", "INAPTA"].includes(String(c.situacaoEmpresa || "").toUpperCase()) && Number(c.limiteDisponivel) > 0
  ).length;
  if (receita) {
    for (const g of gruposPainel) {
      g.clientes = g.clientes.filter(c => String(c.situacaoEmpresa || "NAO VERIFICADA").replaceAll("_", " ").toUpperCase() === receita);
    }
    for (let i = gruposPainel.length - 1; i >= 0; i--) {
      if (!gruposPainel[i].clientes.length) gruposPainel.splice(i, 1);
    }
  }

'''
s=rep(s,anchor,insert+anchor,str(p))
if s.count('    if (busca) q.set("busca", busca);') != 2:
    raise ValueError('grupos: links de busca alterados')
s=s.replace('    if (busca) q.set("busca", busca);', '    if (busca) q.set("busca", busca);\n    if (receita) q.set("receita", receita);')
# Links de grupos preservam o filtro cadastral

anchor='      <button type="submit" style={{'
insert='''       <label style={{flex: "1 1 180px", fontSize: 12}}>
         Situação Receita Federal
         <select name="receita" defaultValue={receita} style={{display: "block", width: "100%", padding: 11, marginTop: 6}}>
           <option value="">Todas</option>
           {situacoesReceita.map(st => <option key={st} value={st}>{st}</option>)}
         </select>
       </label>

'''
s=rep(s,anchor,insert+anchor,str(p))
anchor='  <div style={{\n    display: "grid",\n    gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))",'
insert='''   <section style={painel}>
     <h2 style={{margin: "0 0 8px", fontSize: 18}}>Situação cadastral — Receita Federal</h2>
     <p style={{fontSize: 12, marginBottom: 14}}>Grupos distintos por Grupo Cliente; classificação cadastral independente da carteira comercial.</p>
     <div style={{display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10}}>
       {indicadoresReceita.map(item => {
         const q = new URLSearchParams({receita: item.situacao});
         if (supervisorFiltro) q.set("supervisor", supervisorFiltro);
         if (representanteFiltro) q.set("representante", representanteFiltro);
         return <Link key={item.situacao} href={`/carteira/grupos?${q}#lista-grupos`} style={{textDecoration: "none", color: "inherit", border: `1px solid ${cores.borda}`, padding: 12, borderRadius: 10}}>
           <div style={{fontSize: 12, fontWeight: 800}}>{item.situacao}</div>
           <div style={{fontSize: 24, fontWeight: 900}}>{numero(item.grupos)}</div>
           <div style={{fontSize: 12}}>{numero(item.clientes)} clientes</div>
         </Link>;
       })}
     </div>
     <p style={{marginTop: 12, color: cores.vermelho, fontWeight: 800, fontSize: 12}}>
       Atenção: {numero(riscoReceita)} clientes com CNPJ baixado ou inapto e limite disponível.
     </p>
   </section>

'''
s=rep(s,anchor,insert+anchor,str(p))
# group detail column and row
s, n = re.subn(r'(\s+"(?:Situação|SituaÃ§Ã£o)",\n)(\s+"(?:Última compra|Ãšltima compra)")', r'\1                          "Receita Federal",\n\2', s, count=1)
if n != 1: raise ValueError('grupos: cabecalho nao encontrado')
s=rep(s,'                          <td style={td}>{status(c)}</td>','                          <td style={td}>{status(c)}</td>\n                          <td style={td}>{c.situacaoEmpresa || "NAO VERIFICADA"}</td>',str(p))
orig[p]=s

# Write only after all anchors validate
stamp=datetime.now().strftime('%Y%m%d-%H%M%S')
for p in files:
    backup=p.with_name(p.name+f'.bak-receita-visual-{stamp}')
    shutil.copy2(p,backup)
    p.write_text(orig[p],encoding='utf-8')
    print(f'OK | {p} | backup={backup}')
print('CONCLUIDO | Execute: npx tsc --noEmit')
