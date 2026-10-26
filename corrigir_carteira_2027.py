from pathlib import Path
from datetime import datetime
import re
import shutil

root = Path(r"D:\Kidy_sales_Intelligence")
backend = root / "src/lib/carteira-2027-data.ts"
frontend = root / "src/app/carteira/clientes/page.tsx"

stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
backup = root / f"backup_carteira_2027_{stamp}"
backup.mkdir()

for p in (backend, frontend):
    if not p.exists():
        raise SystemExit(f"Arquivo não encontrado: {p}")
    shutil.copy2(p, backup / p.name)

def replace_once(s, old, new, label):
    if old not in s:
        raise RuntimeError(f"Não encontrei o trecho: {label}. Backups em {backup}")
    return s.replace(old, new, 1)

s = backend.read_text(encoding="utf-8")

# Cadastro atual: base clientes.xlsx
s = replace_once(
    s,
    'const ARQUIVO = "DADOS PRETIVIA CLIENTES.xlsx";',
    '''const ARQUIVO = "DADOS PRETIVIA CLIENTES.xlsx";
const ARQUIVO_CADASTRO = "base clientes.xlsx";

type CadastroAtual = {
  razao: string;
  representantes: Set<string>;
};

async function carregarCadastroAtual(): Promise<Map<string, CadastroAtual>> {
  const buffer = await lerArquivoComercial(ARQUIVO_CADASTRO);
  const wb = XLSX.read(buffer, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: ""
  });

  const normalizar = (v: unknown) =>
    String(v ?? "").normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .trim().toUpperCase();

  const cabIndex = linhas.findIndex(l =>
    l.some(v => normalizar(v) === "CODIGO CLIENTE") &&
    l.some(v => normalizar(v) === "CODIGO REPRESENTANTE")
  );

  if (cabIndex < 0) {
    throw new Error("Cabeçalho da base clientes.xlsx não localizado.");
  }

  const cab = linhas[cabIndex].map(normalizar);
  const pos = (nome: string) => cab.indexOf(nome);

  const iCodigo = pos("CODIGO CLIENTE");
  const iRep = pos("CODIGO REPRESENTANTE");
  const iRazao = pos("RAZAO SOCIAL");

  if (iRazao < 0) {
    throw new Error("Coluna Razao Social não encontrada na base clientes.xlsx.");
  }

  const mapa = new Map<string, CadastroAtual>();

  for (const l of linhas.slice(cabIndex + 1)) {
    const id = codigo(l[iCodigo]);
    if (!id) continue;

    const razao = texto(l[iRazao]);
    const rep = codigo(l[iRep]);

    if (!mapa.has(id)) {
      mapa.set(id, { razao, representantes: new Set() });
    }

    const atual = mapa.get(id)!;
    if (razao && !atual.razao) atual.razao = razao;
    if (rep) atual.representantes.add(rep);
  }

  return mapa;
}''',
    "inserção cadastro atual"
)

s = replace_once(
    s,
    '  representantes: Pessoa[];',
    '''  representantes: Pessoa[];
  representanteAtual: Pessoa[];
  demaisRepresentantes: Pessoa[];''',
    "tipo ClienteCarteira"
)

s = replace_once(
    s,
    '  const mapa = new Map<string, Acumulado>();',
    '''  const cadastroAtual = await carregarCadastroAtual();
  const mapa = new Map<string, Acumulado>();''',
    "carregamento cadastro"
)

s = replace_once(
    s,
    '      razaoSocial: c.razaoSocial,',
    '''      razaoSocial: cadastroAtual.get(c.codigoCliente)?.razao || c.razaoSocial,''',
    "razão social"
)

s = replace_once(
    s,
    '''      representantes: [...c.representantes].map(
        ([codigo, nome]) => ({ codigo, nome })
      ),''',
    '''      representantes: [...c.representantes].map(
        ([codigo, nome]) => ({ codigo, nome })
      ),
      representanteAtual: [
        ...(cadastroAtual.get(c.codigoCliente)?.representantes ?? new Set<string>())
      ].map(codigo => ({
        codigo,
        nome: c.representantes.get(codigo) || codigo
      })),
      demaisRepresentantes: [...c.representantes]
        .filter(([codigo]) =>
          !cadastroAtual.get(c.codigoCliente)?.representantes.has(codigo)
        )
        .map(([codigo, nome]) => ({ codigo, nome })),''',
    "representantes atuais e históricos"
)

f = frontend.read_text(encoding="utf-8")

# Corrigir propriedade da data recebida pela API
f = f.replace(
    'dataUltimaCompra?:string;',
    'ultimaCompra?:string;'
)
f = f.replace(
    'dataUltimaCompra?: string;',
    'ultimaCompra?: string;'
)
f = f.replace('c.dataUltimaCompra', 'c.ultimaCompra')

# Incluir novos campos no tipo do frontend
match = re.search(r'(representantes\\?\\s*:\\s*Vinculo\\[\\]\\s*;)', f)
if not match:
    raise RuntimeError("Tipo representantes não encontrado no frontend.")

f = f[:match.end()] + '''
  representanteAtual?: Vinculo[];
  demaisRepresentantes?: Vinculo[];''' + f[match.end():]

# Trocar a célula que exibe todos os representantes
pattern = r'\\(c\\.representantes\\s*\\|\\|\\s*\\[\\]\\)\\.map\\(r\\s*=>\\s*r\\.nome\\s*\\|\\|\\s*r\\.codigo\\)\\.join\\(", "\\)'
replacement = '''(c.representanteAtual || []).map(r => r.nome || r.codigo).join(", ")'''

if not re.search(pattern, f):
    raise RuntimeError("Renderização de representantes não encontrada.")

f = re.sub(pattern, replacement, f, count=1)

# Preservar a estrutura atual; acrescentar coluna de demais representantes
# imediatamente após a célula de representante atual.
cell = re.search(
    r'<td\\b[^>]*>[\\s\\S]*?\\(c\\.representanteAtual \\|\\| \\[\\]\\)'
    r'\\.map\\(r => r\\.nome \\|\\| r\\.codigo\\)\\.join\\(", "\\)'
    r'[\\s\\S]*?</td>',
    f
)
if cell:
    original = cell.group(0)
    extra = '''
<td>
  {(c.demaisRepresentantes || [])
    .map(r => r.nome || r.codigo)
    .join(", ") || "—"}
</td>'''
    f = f[:cell.end()] + extra + f[cell.end():]

# Atualizar cabeçalho conhecido
f = f.replace(
    '"Grupo","Representante","Situação"',
    '"Grupo","Representante Atual","Demais Representantes","Última Compra","Situação"'
)

# Formatar a data no padrão brasileiro
f = f.replace(
    'c.ultimaCompra || "—"',
    '''c.ultimaCompra
      ? c.ultimaCompra.split("-").reverse().join("/")
      : "—"'''
)

# Gravar apenas depois de preparar ambas as alterações
backend.write_text(s, encoding="utf-8")
frontend.write_text(f, encoding="utf-8")

print("Arquivos atualizados.")
print("Backup:", backup)
print("Backend:", backend)
print("Frontend:", frontend)
