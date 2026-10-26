from pathlib import Path
from datetime import datetime
import shutil,subprocess,sys
root=Path(r'D:\Kidy_sales_Intelligence')
backend=root/'src/lib/carteira-2027-data.ts'
page=root/'src/app/cliente/[codigo]/page.tsx'
backup=Path(r'D:\Kidy_sales_Intelligence_BACKUPS')/('contatos_360_'+datetime.now().strftime('%Y%m%d_%H%M%S'))

def replace_one(s,a,b,label):
 n=s.count(a)
 if n!=1:raise RuntimeError(f'{label}: esperado 1 trecho, encontrados {n}')
 return s.replace(a,b,1)

def edit_backend(s):
 s=replace_one(s,'const ARQUIVO = "DADOS PRETIVIA CLIENTES.xlsx";','const ARQUIVO = "DADOS PREDITIVA CLIENTES.xlsx";','arquivo Drive')
 s=replace_one(s,'export type ClienteCarteira = {','''export type ContatoCarteira = {
  nome: string;
  cargo: string;
  telefone: string;
  whatsapp: string;
  email: string;
};

export type ClienteCarteira = {''','tipo contatos')
 s=replace_one(s,'  codigoCliente: string;\n  razaoSocial: string;','''  codigoCliente: string;
  contatos: ContatoCarteira[];
  endereco: string;
  numeroEndereco: string;
  bairro: string;
  cidade: string;
  uf: string;
  razaoSocial: string;''','campos cliente')
 s=replace_one(s,'  "classificacaoProvisoria" | "representanteAtual" | "demaisRepresentantes"','''  "classificacaoProvisoria" | "representanteAtual" | "demaisRepresentantes"''','acumulado check') if False else s
 s=replace_one(s,'  cadastroDivergente: boolean;','''  cadastroDivergente: boolean;
  chavesContato: Set<string>;''','acumulado chaves')
 s=replace_one(s,'        codigoCliente: id,','''        codigoCliente: id,
        contatos: [],
        endereco: "",
        numeroEndereco: "",
        bairro: "",
        cidade: "",
        uf: "",
        chavesContato: new Set<string>(),''','init')
 s=replace_one(s,'    const c = mapa.get(id)!;\n\n    if (ultima', '''    const c = mapa.get(id)!;

    // Dados cadastrais importados do Drive, consolidados pelo Codigo Cliente.
    c.endereco ||= texto(r["Endereco"]);
    c.numeroEndereco ||= texto(r["Endereco Num"]);
    c.bairro ||= texto(r["Bairro"]);
    c.cidade ||= texto(r["Cidade"]);
    c.uf ||= texto(r["Uf"]);

    const contato: ContatoCarteira = {
      nome: texto(r["Nome Contato"]),
      cargo: texto(r["Cargo Contato"]),
      telefone: texto(r["Telefone Contato"]) || texto(r["Telefone"]),
      whatsapp: texto(r["Whatsapp"]),
      email: texto(r["Email Contato"]) || texto(r["Email"]),
    };
    const chaveContato = [contato.nome, contato.cargo, contato.telefone, contato.whatsapp, contato.email]
      .map(x => x.trim().toLowerCase()).join("|");
    if (chaveContato.replace(/\\|/g, "") && !c.chavesContato.has(chaveContato)) {
      c.contatos.push(contato);
      c.chavesContato.add(chaveContato);
    }

    if (ultima''','consolidacao')
 s=replace_one(s,'      codigoCliente: c.codigoCliente,','''      codigoCliente: c.codigoCliente,
      contatos: c.contatos,
      endereco: c.endereco,
      numeroEndereco: c.numeroEndereco,
      bairro: c.bairro,
      cidade: c.cidade,
      uf: c.uf,''','output')
 # chavesContato extra property omitted from output naturally
 return s

def edit_page(s):
 s=replace_one(s,'  const situacaoReceita = cadastro2027?.situacaoEmpresa || "NAO_VERIFICADA";', '''  const contatos360 = cadastro2027?.contatos ?? [];
  const endereco360 = cadastro2027
    ? [
        [cadastro2027.endereco, cadastro2027.numeroEndereco].filter(Boolean).join(", "),
        cadastro2027.bairro,
        [cadastro2027.cidade || cliente.cidade, cadastro2027.uf || cliente.uf].filter(Boolean).join(" / "),
      ].filter(Boolean).join(" - ")
    : "";
  const situacaoReceita = cadastro2027?.situacaoEmpresa || "NAO_VERIFICADA";''','vars')
 marker='''          </div>
        </section>

        <section style={styles.bloco}>
          <div style={styles.blocoTitulo}>'''
 if s.count(marker)!=1:raise RuntimeError(f'posicao do bloco 01: {s.count(marker)}')
 addition='''          </div>

          <div style={{ borderTop: "1px solid #f0c88f", marginTop: 22, paddingTop: 20 }}>
            <h3 style={{ fontSize: 16, margin: "0 0 14px" }}>Contato e localização</h3>
            {contatos360.length ? contatos360.map((contato, indice) => {
              const fone = contato.telefone.replace(/\\D/g, "");
              const zap = contato.whatsapp.replace(/\\D/g, "");
              const telefoneBrasil = (n: string) => n.length === 10 || n.length === 11 ? `55${n}` : n;
              const zapValido = zap.length >= 10 && zap.length <= 13;
              const foneValido = fone.length >= 10 && fone.length <= 13;
              const emailValido = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(contato.email);
              const mensagem = encodeURIComponent(`Olá! Sou da equipe comercial Kidy e gostaria de conversar sobre oportunidades para ${cliente.razao}.`);
              return (
                <div key={`${indice}-${contato.nome}-${contato.email}`} style={{ background: "#fff7eb", padding: 14, borderRadius: 12, marginBottom: 10 }}>
                  <div style={styles.infoGrid}>
                    <Info titulo="Responsável / cargo" valor={[contato.nome, contato.cargo].filter(Boolean).join(" — ") || "Não informado"} />
                    <Info titulo="Telefone" valor={contato.telefone || "Não informado"} />
                    <Info titulo="WhatsApp" valor={contato.whatsapp || "Não informado"} />
                    <Info titulo="E-mail" valor={contato.email || "Não informado"} />
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
                    {zapValido && <a href={`https://wa.me/${telefoneBrasil(zap)}?text=${mensagem}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
                    {foneValido && <a href={`tel:+${telefoneBrasil(fone)}`}>Ligar</a>}
                    {emailValido && <a href={`mailto:${contato.email}?subject=${encodeURIComponent("Contato comercial Kidy")}`}>E-mail</a>}
                  </div>
                </div>
              );
            }) : <p style={{ color: "#94602e" }}>Nenhum contato cadastrado na base do Drive.</p>}
            <div style={{ marginTop: 14 }}>
              <Info titulo="Endereço" valor={endereco360 || "Não informado"} />
              {endereco360 && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco360)}`} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 10 }}>Abrir rota no Google Maps</a>}
            </div>
            {(!contatos360.some(c => c.whatsapp) || !contatos360.some(c => c.email) || !endereco360) && (
              <p style={{ marginTop: 12, fontSize: 12, color: "#9a5700" }}>Cadastro incompleto: verificar WhatsApp, e-mail ou endereço.</p>
            )}
          </div>
        </section>

        <section style={styles.bloco}>
          <div style={styles.blocoTitulo}>'''
 return replace_one(s,marker,addition,'insercao bloco')

try:
 if not backend.exists() or not page.exists():raise RuntimeError('Projeto ou arquivos não encontrados')
 originals={p:p.read_bytes() for p in (backend,page)}
 changes={backend:edit_backend(originals[backend].decode('utf-8-sig').replace('\r\n','\n')),
          page:edit_page(originals[page].decode('utf-8-sig').replace('\r\n','\n'))}
 backup.mkdir(parents=True,exist_ok=True)
 for p,b in originals.items():
  dest=backup/p.relative_to(root);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b)
 try:
  for p,s in changes.items():p.write_text(s,encoding='utf-8',newline='\n')
  print('Arquivos alterados. Validando TypeScript...',flush=True)
  result=subprocess.run('npx tsc --noEmit',shell=True,cwd=root,timeout=180)
  if result.returncode:raise RuntimeError('TypeScript apresentou erros')
 except Exception:
  for p,b in originals.items():p.write_bytes(b)
  raise
 print('SUCESSO. Backup:',backup)
except Exception as e:
 print('FALHA / ALTERACOES REVERTIDAS OU NAO APLICADAS:',e)
 sys.exit(1)
