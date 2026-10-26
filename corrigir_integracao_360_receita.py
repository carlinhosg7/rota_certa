from pathlib import Path
from datetime import datetime
import shutil

root=Path.cwd()
page=root/'src/app/cliente/[codigo]/page.tsx'
if not page.is_file(): raise SystemExit('ERRO: execute na raiz do projeto Kidy.')
s=page.read_text(encoding='utf-8-sig')
if '/* RECEITA E SUBCLASSIFICACOES 2027 */' in s:
    raise SystemExit('JA APLICADO: nenhum arquivo modificado.')
imports='import ResultadoAtendimento from "@/components/ResultadoAtendimento";'
anchor='        {/* CARDS */}'
if s.count(imports)!=1 or s.count(anchor)!=1 or s.count('  // TELA\n')!=1:
    raise SystemExit('ERRO: marcadores da pagina diferentes; nenhum arquivo modificado.')
required=['src/lib/classificacoes.ts','src/lib/classificacoes-db.ts','src/components/ClassificacaoCliente.tsx','src/lib/carteira-2027-data.ts']
for f in required:
    if not (root/f).is_file(): raise SystemExit(f'ERRO: falta {f}; nenhum arquivo modificado.')
# O objeto da carteira 2027 retorna {clientes: ...}; usamos a situacao ja integrada com Receita.
s=s.replace(imports,imports+'\nimport ClassificacaoCliente from "@/components/ClassificacaoCliente";\nimport { obterClassificacoes } from "@/lib/classificacoes-db";\nimport { carregarCarteira2027 } from "@/lib/carteira-2027-data";\nimport type { CodigoClassificacao } from "@/lib/classificacoes";',1)
marker='  // ============================================================\n  // TELA\n  // ============================================================'
if marker not in s: raise SystemExit('ERRO: marcador TELA ausente; nenhum arquivo modificado.')
block='''  /* RECEITA E SUBCLASSIFICACOES 2027 */
  // Mesma carteira usada no painel da Receita. Nao altera os indicadores existentes.
  const carteira2027 = await carregarCarteira2027();
  const cadastro2027 = carteira2027.clientes.find(
    (c) => cleanCode(c.codigoCliente) === codigoLimpo
  );
  const situacaoReceita = cadastro2027?.situacaoEmpresa || "NAO_VERIFICADA";
  const encerrada = situacaoReceita.toUpperCase() === "BAIXADA";
  const sugeridas: CodigoClassificacao[] = [];
  if (!encerrada) {
    if (cliente.bloqueio?.toUpperCase().includes("BLOQUE")) sugeridas.push("BLOQUEADA");
    if (["INAPTA", "SUSPENSA", "NAO LOCALIZADO", "PENDENTE FORMATO", "NAO_VERIFICADA", "NAO VERIFICADA"].includes(situacaoReceita.toUpperCase()))
      sugeridas.push("CADASTRO_VALIDAR");
    if (produtosPotenciais.some(p => p.potencial === "ALTO")) sugeridas.push("POTENCIAL_EXPANSAO");
    const inicioAnterior = new Date(hoje.getFullYear()-1, 0, 1);
    const fimAnterior = new Date(hoje.getFullYear()-1, hoje.getMonth(), hoje.getDate(), 23, 59, 59);
    const valorAnterior = vendasCliente.filter(v => v.data && v.data >= inicioAnterior && v.data <= fimAnterior)
      .reduce((s,v) => s + (v.vlr || 0), 0);
    if (valorAnterior > 0 && valorAno < valorAnterior * 0.75) sugeridas.push("REDUCAO_COMPRA");
  }
  // Escolhas humanas gravadas prevalecem sobre sugestoes; [] significa desmarcou tudo.
  const gravadas = await obterClassificacoes(codigoLimpo);
  const iniciais = gravadas === null ? sugeridas : gravadas;

'''
s=s.replace(marker,block+marker,1)
ui='''        <section style={styles.bloco}>
          <div style={styles.blocoTitulo}>Situação cadastral — Receita Federal</div>
          <div style={{fontSize:17,fontWeight:900,color:encerrada?"#b42318":"#3d2300"}}>
            {situacaoReceita.replaceAll("_", " ")}
          </div>
          <p style={{fontSize:12,color:"#815326"}}>
            {cadastro2027 ? `CNPJ: ${cadastro2027.cnpj || "não informado"}` : "Cliente não localizado na base cadastral 2027. Verificar vínculo pelo código."}
          </p>
          {encerrada && <p style={{fontWeight:800,color:"#b42318"}}>EMPRESA ENCERRADA — FORA DA FILA COMERCIAL. Histórico preservado.</p>}
        </section>
        <ClassificacaoCliente codigo={codigoLimpo} iniciais={iniciais}
          sugeridas={sugeridas} encerrada={encerrada || !cadastro2027} />

'''
s=s.replace(anchor,ui+anchor,1)
# Suprimir recomendacoes de venda e atendimento em empresas baixadas; manter historico/mix.
open_tag='        {/* OPORTUNIDADES */}'
close_tag='        {/* RESULTADO DO ATENDIMENTO */}'
if s.count(open_tag)!=1 or s.count(close_tag)!=1:
    raise SystemExit('ERRO: secoes comerciais inesperadas; nenhum arquivo modificado.')
s=s.replace(open_tag,'        {!encerrada && <>\n'+open_tag,1)
# Fechar depois da ultima secao, antes do fim do container
end='        </section>\n\n      </div>\n    </main>'
if s.count(end)!=1: raise SystemExit('ERRO: fim da pagina diferente; nenhum arquivo modificado.')
s=s.replace(end,'        </section>\n        </>}\n\n      </div>\n    </main>',1)
# Desabilitar alteracoes caso cliente nao encontrado no cadastro 2027: o componente usa encerrada como bloqueio.
# Nao muda API, RLS, painel da Receita ou outras paginas.
backup=page.with_name(page.name+'.bak-integracao-receita-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
shutil.copy2(page,backup)
page.write_text(s,encoding='utf-8')
print('OK | Atualizada somente:',page)
print('BACKUP:',backup)
print('AGORA: npx tsc --noEmit')
print('OBS: conferir no navegador; API de gravacao ainda precisa de teste de autorizacao.')
