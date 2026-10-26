# -*- coding: utf-8 -*-
"""Atualizador seguro dos Parquets do KIDY Sales Intelligence.
Uso: python atualizar_preditiva.py [--publicar]
Sem --publicar: somente teste; nao altera os seis arquivos ativos.
"""
import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime
from pathlib import Path

ORIGEM = Path(r'I:\Meu Drive\DADOS\DADOS 4')
DESTINO = Path(r'I:\Meu Drive\DADOS_SALES_INT')
QTD_PARTES = 6
PREFIXO = 'DADOS_PREDITIVA'
EXTENSOES = {'.xlsx', '.xlsm', '.xls', '.csv'}


def falhar(mensagem):
    raise RuntimeError(mensagem)


def limpar_colunas(df):
    import pandas as pd
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    if len(df.columns) != 22:
        falhar(f'Esperadas 22 colunas (A:V), recebidas {len(df.columns)}')
    if any(not c or c.lower().startswith('unnamed:') for c in df.columns):
        falhar('Cabecalho vazio encontrado nas colunas A:V.')
    if len(set(df.columns)) != len(df.columns):
        falhar('Existem nomes de colunas repetidos nas colunas A:V.')
    df = df.dropna(how='all')
    return df


def ler_arquivo(arquivo):
    import pandas as pd
    if arquivo.suffix.lower() == '.csv':
        erros = []
        for encoding in ('utf-8-sig', 'cp1252'):
            for sep in (';', ','):
                try:
                    df = pd.read_csv(arquivo, sep=sep, encoding=encoding, usecols=range(22), dtype='string', low_memory=False)
                    return limpar_colunas(df)
                except Exception as exc:
                    erros.append(str(exc))
        falhar(f'Falha ao ler CSV {arquivo.name}: {erros[-1]}')
    # dtype=object preserva numeros/datas do Excel; datas sao normalizadas abaixo.
    return limpar_colunas(pd.read_excel(arquivo, sheet_name=0, usecols='A:V', dtype=object))


def padronizar(df):
    import pandas as pd
    # Datas de origem: nao inventar data de faturamento onde estiver vazia.
    for coluna in ('Data Cadastro', 'Data Entrega', 'Data Ultima Compra', 'Data Cadastro Cliente'):
        if coluna in df.columns:
            serie = df[coluna]
            # Numeros de serie Excel sao convertidos apenas para datas plausiveis.
            numericos = pd.to_numeric(serie, errors='coerce')
            excel = numericos.between(20000, 80000)
            datas = pd.to_datetime(serie.where(~excel), errors='coerce', dayfirst=True)
            if excel.any():
                datas.loc[excel] = pd.to_datetime(numericos.loc[excel], unit='D', origin='1899-12-30', errors='coerce')
            invalidas = serie.notna() & serie.astype(str).str.strip().ne('') & datas.isna()
            if invalidas.any():
                falhar(f'{coluna}: {int(invalidas.sum())} datas invalidas; interrompido para nao perder dados.')
            df[coluna] = datas
    return df


def hash_arquivo(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for bloco in iter(lambda: f.read(1024 * 1024), b''):
            h.update(bloco)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--publicar', action='store_true', help='Publicar os seis arquivos depois da validacao')
    args = parser.parse_args()
    try:
        import pandas as pd
        import pyarrow.parquet as pq
    except ImportError:
        falhar('Instale as dependencias: python -m pip install pandas openpyxl pyarrow xlrd')
    if not ORIGEM.is_dir():
        falhar(f'Pasta de origem nao encontrada: {ORIGEM}')
    DESTINO.mkdir(parents=True, exist_ok=True)
    arquivos = sorted(p for p in ORIGEM.iterdir() if p.is_file() and p.suffix.lower() in EXTENSOES and not p.name.startswith('~$'))
    if not arquivos:
        falhar(f'Nenhum Excel/CSV encontrado diretamente em {ORIGEM}')
    stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    pasta_execucao = DESTINO / '_atualizacoes' / stamp
    pasta_execucao.mkdir(parents=True, exist_ok=False)
    pasta_nova = pasta_execucao / 'novos'
    pasta_nova.mkdir()
    logs = []
    quadros = []
    colunas_base = None
    for idx, arquivo in enumerate(arquivos, 1):
        print(f'[{idx}/{len(arquivos)}] Lendo {arquivo.name}', flush=True)
        df = ler_arquivo(arquivo)
        if colunas_base is None:
            colunas_base = list(df.columns)
            obrigatorias = ['Codigo Cliente', 'Numero Pedido', 'Data Cadastro', 'Data Entrega']
            faltantes = [c for c in obrigatorias if c not in colunas_base]
            if faltantes:
                falhar(f'Colunas obrigatorias ausentes: {faltantes}; encontradas: {colunas_base}')
        elif list(df.columns) != colunas_base:
            falhar(f'Colunas divergentes em {arquivo.name}. Esperadas {colunas_base}; recebidas {list(df.columns)}')
        logs.append({'arquivo': arquivo.name, 'linhas': int(len(df)), 'bytes': arquivo.stat().st_size})
        quadros.append(df)
    dados = pd.concat(quadros, ignore_index=True)
    del quadros
    dados = padronizar(dados)
    if dados.empty:
        falhar('Consolidado vazio: nenhuma publicacao sera feita.')
    # Nao remover linhas de itens; somente remover linhas completamente vazias.
    # Nao ordenar: manter ordem original por arquivo e por linha.
    total = len(dados)
    limites = [(total * i // QTD_PARTES, total * (i + 1) // QTD_PARTES) for i in range(QTD_PARTES)]
    saidas = []
    for i, (inicio, fim) in enumerate(limites, 1):
        nome = f'{PREFIXO}_{i}.parquet'
        caminho = pasta_nova / nome
        fatia = dados.iloc[inicio:fim]
        fatia.to_parquet(caminho, engine='pyarrow', index=False, compression='snappy')
        meta = pq.ParquetFile(caminho)
        if meta.metadata.num_rows != len(fatia) or meta.schema_arrow.names != list(dados.columns):
            falhar(f'Falha na validacao do arquivo {nome}')
        saidas.append({'arquivo': nome, 'linhas': int(len(fatia)), 'bytes': caminho.stat().st_size, 'sha256': hash_arquivo(caminho)})
    if sum(x['linhas'] for x in saidas) != total:
        falhar('A soma das partes difere do total.')
    datas = {}
    for coluna in ('Data Cadastro', 'Data Entrega'):
        if coluna in dados:
            serie = dados[coluna].dropna()
            datas[coluna] = {'preenchidas': int(len(serie)), 'minima': str(serie.min()) if len(serie) else None, 'maxima': str(serie.max()) if len(serie) else None}
    cliente = dados['Codigo Cliente'].astype('string').str.strip().str.replace(r'\.0$', '', regex=True)
    amostra = dados.loc[cliente.eq('27317').fillna(False)]
    auditoria = {'cliente': '27317', 'linhas': int(len(amostra)), 'pedidos_distintos': int(amostra['Numero Pedido'].nunique()), 'linhas_com_data_entrega': int(amostra['Data Entrega'].notna().sum()), 'pedidos_com_data_entrega': int(amostra.loc[amostra['Data Entrega'].notna(), 'Numero Pedido'].nunique())}
    relatorio = {'execucao': stamp, 'modo': 'PUBLICACAO' if args.publicar else 'TESTE', 'origem': str(ORIGEM), 'destino': str(DESTINO), 'arquivos_origem': logs, 'total_linhas': int(total), 'colunas': list(dados.columns), 'datas': datas, 'cliente_27317': auditoria, 'parquets': saidas}
    relatorio_path = pasta_execucao / 'relatorio.json'
    relatorio_path.write_text(json.dumps(relatorio, ensure_ascii=False, indent=2), encoding='utf-8')
    print('\nVALIDACAO OK:', total, 'linhas,', len(dados.columns), 'colunas')
    print('CLIENTE 27317:', json.dumps(auditoria, ensure_ascii=False))
    print('RELATORIO:', relatorio_path)
    if not args.publicar:
        print('MODO TESTE: arquivos ativos NAO foram alterados.')
        print('Para publicar: python atualizar_preditiva.py --publicar')
        return
    # Backup de todos os arquivos ativos antes de substituir qualquer um.
    pasta_backup = pasta_execucao / 'backup_ativos'
    pasta_backup.mkdir()
    ativos = [DESTINO / x['arquivo'] for x in saidas]
    existentes = [p for p in ativos if p.exists()]
    for p in existentes:
        shutil.copy2(p, pasta_backup / p.name)
        if hash_arquivo(p) != hash_arquivo(pasta_backup / p.name):
            falhar(f'Backup nao validado: {p.name}')
    trocados = []
    try:
        for novo, ativo in zip(saidas, ativos):
            # arquivo intermediario no mesmo volume permite replace atomico por arquivo
            temporario = DESTINO / ('.' + novo['arquivo'] + '.' + stamp + '.tmp')
            shutil.copy2(pasta_nova / novo['arquivo'], temporario)
            if hash_arquivo(temporario) != novo['sha256']:
                falhar(f'Copia de publicacao corrompida: {novo["arquivo"]}')
            os.replace(temporario, ativo)
            trocados.append(ativo)
        # Manifesto por ultimo; consumidores podem usa-lo como marcador de versao.
        manifesto_tmp = DESTINO / ('.manifesto_preditiva.' + stamp + '.tmp')
        manifesto_tmp.write_text(json.dumps({'versao': stamp, 'parquets': saidas}, ensure_ascii=False, indent=2), encoding='utf-8')
        os.replace(manifesto_tmp, DESTINO / 'manifesto_preditiva.json')
    except Exception:
        for ativo in reversed(trocados):
            backup = pasta_backup / ativo.name
            if backup.exists():
                shutil.copy2(backup, ativo)
            elif ativo.exists():
                ativo.unlink()
        raise
    print('PUBLICACAO LOCAL CONCLUIDA. Backups:', pasta_backup)
    print('ATENCAO: aguarde sincronizacao completa do Google Drive antes de validar no portal.')

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('\nERRO:', exc, file=sys.stderr)
        sys.exit(1)
