from pathlib import Path
import json, re
import pandas as pd

ROOT = Path(r'D:\Kidy_sales_Intelligence')
DRIVE = Path(r'I:\Meu Drive\DADOS_SALES_INT')
CADASTRO = ROOT / 'data' / 'share-clientes.json'
OUTPUT = ROOT / 'data' / 'share-potencial-clientes.json'
AUDIT = ROOT / 'data' / 'share-potencial-conciliacao.csv'
ANOS_VALIDOS = [2017, 2018, 2019, 2020, 2021, 2023, 2024, 2025]
ARQUIVOS = [DRIVE / f'DADOS_PREDITIVA_{i}.parquet' for i in range(1,7)]

for arquivo in [CADASTRO, *ARQUIVOS]:
    if not arquivo.exists():
        raise SystemExit(f'Arquivo ausente: {arquivo}')

cadastro = json.loads(CADASTRO.read_text(encoding='utf-8'))
por_codigo = {}
for ibge, clientes in cadastro.items():
    for cliente in clientes:
        codigo = re.sub(r'\.0$', '', str(cliente['codigo']).strip())
        if codigo in por_codigo and por_codigo[codigo] != ibge:
            raise SystemExit(f'Cliente com IBGE duplicado: {codigo}')
        por_codigo[codigo] = ibge

print('Clientes identificados:', len(por_codigo))
partes = []
for arquivo in ARQUIVOS:
    frame = pd.read_parquet(arquivo, columns=['Codigo Cliente', 'Data Entrega', 'Qtd Venda'])
    frame['codigo'] = frame['Codigo Cliente'].astype('string').str.strip().str.replace(r'\.0$', '', regex=True)
    datas = frame['Data Entrega'].astype('string').str.strip()
    datas = datas.str.replace(r'^(\d{4})/(\d{2})/(\d{2})',r'\1-\2-\3',regex=True)
    frame['ano'] = pd.to_numeric(datas.str.slice(0,4), errors='coerce').astype('Int64')
    # Impede que datas malformadas sejam contabilizadas em um ano.
    dt = pd.to_datetime(datas, errors='coerce', format='mixed', dayfirst=True)
    iso = datas.str.match(r'^\d{4}-\d{2}-\d{2}', na=False)
    dt.loc[iso] = pd.to_datetime(datas.loc[iso], errors='coerce', format='ISO8601')
    frame.loc[dt.isna(), 'ano'] = pd.NA
    frame['pares'] = pd.to_numeric(frame['Qtd Venda'], errors='coerce')
    filtro = frame['ano'].isin(ANOS_VALIDOS) & frame['pares'].notna()
    # Dados por ano completo - nao mistura 2026 parcial e 2022 incompleto.
    partes.append(frame.loc[filtro, ['codigo','ano','pares']])
    print(f'{arquivo.name}: {len(frame):,} linhas')

df = pd.concat(partes, ignore_index=True)
df['ibge'] = df['codigo'].map(por_codigo)
total_sem_municipio = float(df.loc[df['ibge'].isna(), 'pares'].sum())
registros_sem_municipio = int(df['ibge'].isna().sum())
agrupado = df.loc[df['ibge'].notna()].groupby(['ibge','codigo','ano'], observed=True)['pares'].sum()
por_ibge = {ibge: {str(c['codigo']): {'2025': 0, 'pico': 0, 'ano_pico': None} for c in clientes} for ibge, clientes in cadastro.items()}
por_ano = {}
for (ibge, codigo, ano), pares in agrupado.items():
    item = por_ibge[str(ibge)].get(str(codigo))
    if item is None: continue
    n = int(round(float(pares)))
    if int(ano) == 2025: item['2025'] = n
    if n > item['pico']:
        item['pico'] = n
        item['ano_pico'] = int(ano)
    k = (str(ibge), int(ano))
    por_ano[k] = por_ano.get(k, 0) + n

# Conciliacao com o JSON de Share publicado: permite auditar divergencias por cidade.
vendas_path = ROOT / 'data' / 'share-vendas-anuais.json'
if vendas_path.exists():
    vendas = json.loads(vendas_path.read_text(encoding='utf-8'))
    linhas = []
    for ibge, clientes in por_ibge.items():
        base2025 = sum(c['2025'] for c in clientes.values())
        registrado = int(round(float(vendas.get(ibge, {}).get('2025', 0))))
        linhas.append({'codigo_ibge': ibge, 'clientes': len(clientes), 'pares2025_cliente': base2025, 'pares2025_share': registrado, 'diferenca': registrado - base2025})
    pd.DataFrame(linhas).to_csv(AUDIT, sep=';', index=False, encoding='utf-8-sig')
    print('Auditoria:', AUDIT)

payload = {'ano_base': 2025, 'criterio': 'Data Entrega; pico observado 2017-2021, 2023-2025', 'cidades': por_ibge}
OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print('Arquivo:', OUTPUT)
print('Municipios:', len(por_ibge), 'Clientes:', sum(len(v) for v in por_ibge.values()))
print('Registros sem IBGE:', registros_sem_municipio, 'Pares sem IBGE:', round(total_sem_municipio))
