from pathlib import Path
from datetime import datetime
import shutil

ROOT = Path(__file__).resolve().parent
PROJECT = Path.cwd()
page = PROJECT / 'src/app/cliente/[codigo]/page.tsx'
if not page.exists():
    raise SystemExit('ERRO: execute dentro de D:\\Kidy_sales_Intelligence')
raw = page.read_text(encoding='utf-8-sig')
if 'ClassificacaoCliente' in raw:
    raise SystemExit('JA INSTALADO: ClassificacaoCliente encontrado. Nenhum arquivo alterado.')
required = ['import ResultadoAtendimento', 'const produtosPotenciais =', '{/* CARDS */}', '{/* OPORTUNIDADES */}', '{/* RESULTADO DO ATENDIMENTO */}', '{/* IDENTIFICA']
for a in required:
    if a not in raw: raise SystemExit('ERRO: estrutura diferente. Nao alterei nada. Falta: '+a)

# Alterações só após todos os marcadores serem validados.
s = raw
s = s.replace('import ResultadoAtendimento from "@/components/ResultadoAtendimento";', '''import ResultadoAtendimento from "@/components/ResultadoAtendimento";
import ClassificacaoCliente from "@/components/ClassificacaoCliente";
import { obterClassificacoes } from "@/lib/classificacoes-db";
import { carregarCarteira2027 } from "@/lib/carteira-2027-data";
import type { CodigoClassificacao } from "@/lib/classificacoes";''', 1)
anchor = '  // ============================================================\n  // TELA\n  // ============================================================'
if anchor not in s: raise SystemExit('ERRO: ancora TELA ausente')
insert = '''  // Classificacoes permanentes: gravadas por cliente no Supabase.
  // BAIXADA vem da Receita Federal, nao de uma classificacao manual.
  const carteira2027 = await carregarCarteira2027();
  const registros2027 = Array.isArray(carteira2027)
    ? carteira2027
    : (carteira2027 as unknown as { clientes?: { codigoCliente: string; situacaoEmpresa: string }[] }).clientes || [];
  const registro2027 = registros2027.find(c => cleanCode(c.codigoCliente) === codigoLimpo);
  const situacaoReceita = String(registro2027?.situacaoEmpresa || "NAO_VERIFICADA").toUpperCase();
  const encerrada = situacaoReceita === "BAIXADA";
  const sugeridas: CodigoClassificacao[] = [];
  if (!encerrada) {
    if (cliente.bloqueio?.toUpperCase().includes("BLOQUE")) sugeridas.push("BLOQUEADA");
    if (["INAPTA", "SUSPENSA", "NAO LOCALIZADO", "PENDENTE FORMATO", "NAO_VERIFICADA"].includes(situacaoReceita))
      sugeridas.push("CADASTRO_VALIDAR");
    if (produtosPotenciais.some(p => p.potencial === "ALTO")) sugeridas.push("POTENCIAL_EXPANSAO");
    // Comparacao de periodos equivalentes, sem confundir queda sazonal com reducao.
    const inicioAnoAnterior = new Date(hoje.getFullYear() - 1, 0, 1);
    const corteAnoAnterior = new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate(), 23, 59, 59);
    const valorAnoAnteriorComparavel = vendasCliente
      .filter(v => v.data && v.data >= inicioAnoAnterior && v.data <= corteAnoAnterior)
      .reduce((total, v) => total + (v.vlr || 0), 0);
    if (valorAnoAnteriorComparavel > 0 && valorAno < valorAnoAnteriorComparavel * 0.75)
      sugeridas.push("REDUCAO_COMPRA");
  }
  // Selecoes manuais prevalecem. Sem registro, exibir sugestoes verificaveis.
  const gravadas = await obterClassificacoes(codigoLimpo);
  const iniciais = gravadas === null ? sugeridas : gravadas;

'''
s = s.replace(anchor, insert + anchor, 1)
# Renderiza o formulario antes dos cards.
s = s.replace('        {/* CARDS */}', '''        <ClassificacaoCliente codigo={codigoLimpo} iniciais={iniciais}
          sugeridas={sugeridas} encerrada={encerrada} />

        {/* CARDS */}''', 1)
# Para empresas encerradas: histórico permanece, mas não exibir roteiro de venda,
# campanhas, oportunidades e formulário de atendimento.
s = s.replace('        {/* OPORTUNIDADES */}', '''        {!encerrada && <>
        {/* OPORTUNIDADES */}''', 1)
s = s.replace('        {/* RESULTADO DO ATENDIMENTO */}', '''        {/* RESULTADO DO ATENDIMENTO */}''', 1)
# Fecha a condicional após a seção de próxima ação sugerida, antes do container.
end = '        </section>\n\n      </div>\n    </main>'
if end not in s: raise SystemExit('ERRO: fechamento de pagina inesperado')
s = s.replace(end, '        </section>\n        </>}\n\n      </div>\n    </main>', 1)

files = {
 'src/lib/classificacoes.ts': 'classificacoes.ts',
 'src/lib/classificacoes-db.ts': 'classificacoes-db.ts',
 'src/components/ClassificacaoCliente.tsx': 'ClassificacaoCliente.tsx',
 'src/app/api/clientes/[codigo]/classificacoes/route.ts': 'api/route.ts',
}
for relative in files:
    target = PROJECT / relative
    if target.exists(): raise SystemExit(f'ERRO: {relative} ja existe. Nao sobrescrevi.')

stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
backup = page.with_name(page.name + '.bak-subclasses-' + stamp)
shutil.copy2(page, backup)
page.write_text(s, encoding='utf-8')
print('OK | Tela modificada | backup:', backup)
for relative, source in files.items():
    target = PROJECT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / 'kidy_subclasses' / source, target)
    print('OK | Criado:', relative)
print('CONCLUIDO | Primeiro execute o SQL; depois: npx tsc --noEmit')
