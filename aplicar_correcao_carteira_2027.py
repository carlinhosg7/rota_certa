from pathlib import Path
from datetime import datetime
import re, shutil, subprocess, sys

root=Path(r'D:\Kidy_sales_Intelligence')
back=root/'src/lib/carteira-2027-data.ts'
front=root/'src/app/carteira/clientes/page.tsx'
if not back.exists() or not front.exists():
    sys.exit('ERRO: execute na maquina Windows com o projeto em D:\\Kidy_sales_Intelligence')

original_b=back.read_text(encoding='utf-8-sig')
original_f=front.read_text(encoding='utf-8-sig')
b=original_b; f=original_f

def one(s, pattern, replacement, label, flags=0):
    result, count=re.subn(pattern, lambda m: replacement(m) if callable(replacement) else replacement, s, count=1, flags=flags)
    if count != 1: raise RuntimeError('Trecho nÃ£o encontrado: '+label+'; nenhum arquivo foi alterado.')
    return result

try:
    if 'representanteAtual: Pessoa[]' in b or 'representanteAtual?: Vinculo[]' in f:
        raise RuntimeError('CorreÃ§Ã£o jÃ¡ parece aplicada. Nenhum arquivo alterado.')

    # Busca somente o cadastro de clientes, sem carregar 1,2 milhÃ£o de vendas.
    cadastro=r'''type CadastroVigente = { razao: string; representantes: Set<string>; supervisores: Set<string> };

async function lerCadastroVigente(): Promise<Map<string, CadastroVigente>> {
  const buffer = await lerArquivoComercial("base clientes.xlsx");
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
  const norm = (v: unknown) => texto(v).normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
  const idx = linhas.findIndex(l => l.some(v => norm(v) === "CODIGO CLIENTE")
    && l.some(v => norm(v) === "CODIGO REPRESENTANTE"));
  if (idx < 0) throw new Error("CabeÃ§alho da base clientes.xlsx nÃ£o encontrado");
  const colunas = linhas[idx].map(norm);
  const coluna = (nome: string) => colunas.indexOf(nome);
  const idCol = coluna("CODIGO CLIENTE");
  const repCol = coluna("CODIGO REPRESENTANTE");
  const razaoCol = coluna("RAZAO SOCIAL");
  const supCol = coluna("CODIGO SUPERVISOR");
  if (razaoCol < 0) throw new Error("Coluna Razao Social nÃ£o encontrada no cadastro");
  const mapa = new Map<string, CadastroVigente>();
  for (const linha of linhas.slice(idx + 1)) {
    const id = codigo(linha[idCol]);
    if (!id) continue;
    const razao = texto(linha[razaoCol]);
    const rep = codigo(linha[repCol]);
    const sup = supCol >= 0 ? codigo(linha[supCol]) : "";
    if (!mapa.has(id)) mapa.set(id, { razao, representantes: new Set(), supervisores: new Set() });
    const c = mapa.get(id)!;
    if (razao && !c.razao) c.razao = razao;
    if (rep) c.representantes.add(rep);
    if (sup) c.supervisores.add(sup);
  }
  return mapa;
}
'''
    b=one(b,r'(const ARQUIVO\s*=\s*"DADOS PRETIVIA CLIENTES\.xlsx"\s*;)',lambda m:m.group(1)+'\n\n'+cadastro,'constante de arquivo')
    b=one(b,r'(export type ClienteCarteira\s*=\s*\{[\s\S]*?\brepresentantes:\s*Pessoa\[\];)',lambda m:m.group(1)+'\n  representanteAtual: Pessoa[];\n  demaisRepresentantes: Pessoa[];','tipo ClienteCarteira')
    # Os novos campos pertencem ao resultado final, nao ao Acumulado.
    b=one(
        b,
        r'(type\s+Acumulado\s*=\s*Omit<\s*ClienteCarteira\s*,\s*)([\s\S]*?)(>\s*&\s*\{)',
        lambda m: m.group(1) + m.group(2).rstrip() + ' | "representanteAtual" | "demaisRepresentantes"\n' + m.group(3),
        'tipo Acumulado'
    )
    b=one(b,r'(\bconst mapa\s*=\s*new Map<string,\s*Acumulado>\(\);)',lambda m:'const cadastroVigente = await lerCadastroVigente();\n  '+m.group(1),'mapa acumulado')
    b=one(b,r'(clientes\.push\(\{[\s\S]*?\brazaoSocial:\s*)c\.razaoSocial',lambda m:m.group(1)+'cadastroVigente.get(c.codigoCliente)?.razao || c.razaoSocial','razao no resultado')
    rep_pattern=r'(clientes\.push\(\{[\s\S]*?\brepresentantes:\s*\[\.\.\.c\.representantes\]\.map\(\s*\(\[codigo,\s*nome\]\)\s*=>\s*\(\{\s*codigo,\s*nome\s*\}\)\s*\),)'
    def add_rep(m):
        return m.group(1)+'''
      representanteAtual: [...(cadastroVigente.get(c.codigoCliente)?.representantes ?? new Set<string>())]
        .map(codigo => ({ codigo, nome: c.representantes.get(codigo) || codigo })),
      demaisRepresentantes: [...c.representantes]
        .filter(([codigo]) => !cadastroVigente.get(c.codigoCliente)?.representantes.has(codigo))
        .map(([codigo, nome]) => ({ codigo, nome })),'''
    b=one(b,rep_pattern,add_rep,'mapeamento de representantes')

    # Frontend: altera tipos e renderizaÃ§Ã£o, mantendo demais componentes.
    f=one(f,r'(type Cliente\s*=\s*\{[\s\S]*?)\bdataUltimaCompra\?:\s*string;',lambda m:m.group(1)+'ultimaCompra?: string;','tipo de data')
    f=one(f,r'(type Cliente\s*=\s*\{[\s\S]*?\brepresentantes\?:\s*Vinculo\[\];)',lambda m:m.group(1)+'\n  representanteAtual?: Vinculo[];\n  demaisRepresentantes?: Vinculo[];','tipo de representantes')
    f=one(f,r'("Grupo",\s*)"Representante",',lambda m:m.group(1)+'"Representante Atual",\n                    "Demais Representantes",','cabeÃ§alho')
    rep_cell=r'<td\s+style=\{\{\s*padding:\s*12\s*\}\}>\s*\{\(c\.representantes\s*\|\|\s*\[\]\)\s*\.map\(r\s*=>\s*r\.nome\s*\|\|\s*r\.codigo\)\s*\.join\(", "\)\s*\|\|\s*"[^"]*"\}\s*</td>'
    f=one(f,rep_cell,'''<td style={{ padding: 12 }}>
                        {(c.representanteAtual || [])
                          .map(r => r.nome || r.codigo)
                          .join(", ") || "â€”"}
                      </td>
                      <td style={{ padding: 12 }}>
                        {(c.demaisRepresentantes || [])
                          .map(r => r.nome || r.codigo)
                          .join(", ") || "â€”"}
                      </td>''','cÃ©lula representantes')
    f=one(f,r'\{c\.dataUltimaCompra\s*\|\|\s*"[^"]*"\}', '''{c.ultimaCompra
                          ? c.ultimaCompra.split("-").reverse().join("/")
                          : "â€”"}''','data ultima compra')

    # Filtra permissÃµes pelos vÃ­nculos vigentes. Caso cadastro ausente, nÃ£o autoriza histÃ³rico.
    f=one(f,r'(if\s*\(perfil\s*===\s*"REPRESENTANTE"\)\s*\{[\s\S]*?c\.)representantes(\?\.some\(r\s*=>\s*cod\(r\.codigo\)\s*===\s*repLogin\))',lambda m:m.group(1)+'representanteAtual'+m.group(2),'permissÃ£o representante')
    f=one(f,r'(if\s*\(representante\)\s*\{[\s\S]*?c\.)representantes(\?\.some\(r\s*=>\s*cod\(r\.codigo\)\s*===\s*representante\))',lambda m:m.group(1)+'representanteAtual'+m.group(2),'filtro representante')

    # Antes de gravar, assegura que nÃ£o sobrou referÃªncia ao campo antigo.
    if 'c.dataUltimaCompra' in f: raise RuntimeError('Ainda hÃ¡ referÃªncia Ã  data antiga')
except Exception as exc:
    sys.exit('NENHUMA ALTERAÃ‡ÃƒO APLICADA: '+str(exc))

backup=Path(r'D:\Kidy_sales_Intelligence_BACKUPS')/('correcao_'+datetime.now().strftime('%Y%m%d_%H%M%S'))
backup.mkdir(parents=True,exist_ok=True)
shutil.copy2(back,backup/'carteira-2027-data.ts')
shutil.copy2(front,backup/'page.tsx')
try:
    back.write_text(b,encoding='utf-8')
    front.write_text(f,encoding='utf-8')
    print('Arquivos corrigidos. Validando TypeScript...')
    result=subprocess.run(['cmd','/c','npx tsc --noEmit'],cwd=root)
    if result.returncode:
        raise RuntimeError('TypeScript retornou erros; restaurando os dois arquivos.')
except Exception as exc:
    back.write_text(original_b,encoding='utf-8')
    front.write_text(original_f,encoding='utf-8')
    sys.exit('ALTERAÃ‡Ã•ES REVERTIDAS: '+str(exc))
print('SUCESSO: TypeScript sem erros.')
print('BACKUP:',backup)
print('Teste agora a pÃ¡gina /carteira/clientes.')
