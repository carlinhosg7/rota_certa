from pathlib import Path
import json, re, unicodedata
import pandas as pd

raiz = Path(r'D:\Kidy_sales_Intelligence')
drive = Path(r'I:\Meu Drive\DADOS_SALES_INT')
municipios_file = raiz / 'data' / 'share-municipios.json'
origem = next((p for p in [drive/'base clientes.xlsx', raiz/'base clientes.xlsx'] if p.exists()), None)
if origem is None: raise SystemExit('ERRO: base clientes.xlsx nao encontrada no Drive nem no projeto.')
if not municipios_file.exists(): raise SystemExit('ERRO: share-municipios.json ausente.')

def normalizar(v):
    if pd.isna(v): return ''
    v = unicodedata.normalize('NFKD', str(v).strip().upper())
    return re.sub(r'\s+', ' ', ''.join(ch for ch in v if not unicodedata.combining(ch)))

def codigo(v):
    if pd.isna(v): return ''
    return re.sub(r'\.0$', '', str(v).strip())

municipios = json.loads(municipios_file.read_text(encoding='utf-8'))
mapa = {}; ambiguos = set()
for m in municipios:
    k = (normalizar(m.get('uf','')), normalizar(m.get('cidade','')))
    ibge = str(m['codigo_ibge'])
    if k in mapa and mapa[k] != ibge: ambiguos.add(k)
    else: mapa[k] = ibge
for k in ambiguos: mapa.pop(k, None)

df = pd.read_excel(origem, sheet_name='base clientes', header=2, dtype=str)
df.columns = df.columns.str.strip()
for nome in ['Codigo Cliente','Razao Social','Cidade','Uf']:
    if nome not in df.columns: raise SystemExit(f'ERRO: coluna obrigatoria ausente: {nome}')
for nome in ['Grupo Cliente','Codigo Representante','Representante','Supervisor']:
    if nome not in df.columns: df[nome] = ''
df['codigo'] = df['Codigo Cliente'].map(codigo)
df = df[df['codigo'] != ''].copy()
df['chave'] = list(zip(df['Uf'].map(normalizar), df['Cidade'].map(normalizar)))
conflitos = set(df.groupby('codigo')['chave'].nunique().loc[lambda s:s>1].index)
df = df[~df['codigo'].isin(conflitos)].drop_duplicates(subset=['codigo']).copy()
df['ibge'] = df['chave'].map(mapa)
sem_ibge = df[df['ibge'].isna()].copy()
base = {}
for _, r in df[df['ibge'].notna()].iterrows():
    ibge = str(r['ibge'])
    def val(k): return '' if pd.isna(r[k]) else str(r[k]).strip()
    base.setdefault(ibge, []).append({
        'codigo':r['codigo'], 'razao_social':val('Razao Social'),
        'grupo_cliente':val('Grupo Cliente'), 'codigo_representante':val('Codigo Representante'),
        'representante':val('Representante'), 'supervisor':val('Supervisor'),
        'cidade':val('Cidade'), 'uf':val('Uf')
    })
for clientes in base.values(): clientes.sort(key=lambda v:(normalizar(v['razao_social']),v['codigo']))
destino = raiz/'data'/'share-clientes.json'
destino.write_text(json.dumps(base,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print('Fonte:',origem)
print('Municipios com clientes:',len(base))
print('Clientes distintos associados:',sum(map(len,base.values())))
print('Clientes sem municipio IBGE:',len(sem_ibge))
print('Clientes com municipio conflitante:',len(conflitos))
print('Arquivo criado:',destino)
