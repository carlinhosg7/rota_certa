from pathlib import Path
from datetime import datetime
import shutil, subprocess, sys

root = Path(r'D:\Kidy_sales_Intelligence')
p = root / 'src/app/carteira/grupos/page.tsx'
if not p.exists():
    sys.exit(f'Arquivo nao encontrado: {p}')
original = p.read_bytes()
s = original.decode('utf-8-sig').replace('\r\n', '\n')
if 'name="gerente"' in s:
    sys.exit('Filtro gerente ja existe nesta pagina. Nenhuma alteracao realizada.')

def troca(antigo, novo, descricao):
    global s
    n = s.count(antigo)
    if n != 1 and not (descricao == 'linkFiltro' and n == 4):
        raise RuntimeError(f'{descricao}: esperado 1 trecho, encontrados {n}')
    s = s.replace(antigo, novo, 1)

try:
    troca('import { carregarCarteira2027 } from "../../../lib/carteira-2027-data";',
          'import { carregarCarteira2027 } from "../../../lib/carteira-2027-data";\nimport { listarGerentesRegionais } from "../../../lib/carteira-gerentes";', 'import')
    troca('    supervisor?: string;\n    representante?: string;', '    supervisor?: string;\n    gerente?: string;\n    representante?: string;', 'searchParams')
    troca('  representantes?: Vinculo[];\n  supervisores?: Vinculo[];', '  representantes?: Vinculo[];\n  representanteAtual?: Vinculo[];\n  supervisores?: Vinculo[];', 'tipo cliente')
    troca('c.representantes?.some(r => codigo(r.codigo) === repLogin)', 'c.representanteAtual?.some(r => codigo(r.codigo) === repLogin)', 'permissao representante')
    troca('  const supervisorFiltro = codigo(params.supervisor);', '''  const gerentesRegionais = await listarGerentesRegionais();
  const gerenteFiltro = texto(params.gerente).toUpperCase();
  const supervisoresGerente = new Set(
    gerentesRegionais.filter(g => g.gerente.toUpperCase() === gerenteFiltro)
      .map(g => codigo(g.codigo_supervisor))
  );
  const opcoesGerentes = [...new Set(gerentesRegionais.map(g => g.gerente))]
    .filter(Boolean).sort((a,b) => a.localeCompare(b, 'pt-BR'));
  const supervisorFiltro = codigo(params.supervisor);''', 'mapa gerente')
    troca('    for (const r of c.representantes || []) {', '    for (const r of c.representanteAtual || []) {', 'opcoes reps atuais')
    troca('        (!supervisorFiltro || c.supervisores?.some(', '''        (!gerenteFiltro || c.supervisores?.some(
          s => supervisoresGerente.has(codigo(s.codigo))
        )) &&
        (!supervisorFiltro || c.supervisores?.some(''', 'filtro gerente')
    troca('(!representanteFiltro || c.representantes?.some(', '(!representanteFiltro || c.representanteAtual?.some(', 'filtro rep atual')
    troca('    if (supervisorFiltro) q.set("supervisor", supervisorFiltro);', '    if (gerenteFiltro) q.set("gerente", gerenteFiltro);\n    if (supervisorFiltro) q.set("supervisor", supervisorFiltro);', 'linkFiltro')
    troca('    if (supervisorFiltro) q.set("supervisor", supervisorFiltro);\n    if (representanteFiltro) q.set("representante", representanteFiltro);\n    if (filtroGrupo !== "todos")', '    if (gerenteFiltro) q.set("gerente", gerenteFiltro);\n    if (supervisorFiltro) q.set("supervisor", supervisorFiltro);\n    if (representanteFiltro) q.set("representante", representanteFiltro);\n    if (filtroGrupo !== "todos")', 'paginacao')
    troca('    if (supervisorFiltro) q.set("supervisor", supervisorFiltro);\n    if (representanteFiltro) q.set("representante", representanteFiltro);\n\n    if (filtro !== "todos") q.set("filtroCliente", filtro);', '    if (gerenteFiltro) q.set("gerente", gerenteFiltro);\n    if (supervisorFiltro) q.set("supervisor", supervisorFiltro);\n    if (representanteFiltro) q.set("representante", representanteFiltro);\n\n    if (filtro !== "todos") q.set("filtroCliente", filtro);', 'link cliente')
    troca('      <label style={{ flex: "1 1 220px", fontSize: 12 }}>\n        Supervisor', '''      <label style={{ flex: "1 1 160px", fontSize: 12 }}>
        Gerente
        <select name="gerente" defaultValue={gerenteFiltro}
          style={{ display: "block", width: "100%", padding: 11, marginTop: 6 }}>
          <option value="">Todos</option>
          {opcoesGerentes.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </label>

      <label style={{ flex: "1 1 220px", fontSize: 12 }}>
        Supervisor''', 'select gerente')
    troca('const q = new URLSearchParams({receita: item.situacao});', 'const q = new URLSearchParams({receita: item.situacao});\n         if (gerenteFiltro) q.set("gerente", gerenteFiltro);', 'cards receita')
    troca('                  <input type="hidden" name="supervisor" value={supervisorFiltro} />', '                  <input type="hidden" name="gerente" value={gerenteFiltro} />\n                  <input type="hidden" name="supervisor" value={supervisorFiltro} />', 'busca')
    troca('  const linkGrupo = (g: Grupo) =>\n    `/carteira/grupos?grupo=${encodeURIComponent(g.chave)}`;', '''  const linkGrupo = (g: Grupo) => {
    const q = new URLSearchParams({ grupo: g.chave });
    if (gerenteFiltro) q.set('gerente', gerenteFiltro);
    if (supervisorFiltro) q.set('supervisor', supervisorFiltro);
    if (representanteFiltro) q.set('representante', representanteFiltro);
    return `/carteira/grupos?${q.toString()}`;
  };''', 'link grupo')
except Exception as e:
    sys.exit('NENHUMA ALTERACAO APLICADA: ' + str(e))

backupdir = Path(r'D:\Kidy_sales_Intelligence_BACKUPS') / ('grupos_gerente_' + datetime.now().strftime('%Y%m%d_%H%M%S'))
backupdir.mkdir(parents=True, exist_ok=True)
(backupdir / 'page.tsx').write_bytes(original)
p.write_bytes(s.encode('utf-8'))
print('Alteracao aplicada. Verificando TypeScript...')
try:
    result = subprocess.run(['cmd', '/c', 'npx tsc --noEmit'], cwd=root, timeout=180)
    if result.returncode:
        p.write_bytes(original)
        sys.exit('TypeScript apresentou erros. Arquivo ORIGINAL RESTAURADO. Backup: ' + str(backupdir))
except Exception as e:
    p.write_bytes(original)
    sys.exit('Falha na verificacao; arquivo ORIGINAL RESTAURADO: ' + str(e))
print('SUCESSO. Backup:', backupdir)
