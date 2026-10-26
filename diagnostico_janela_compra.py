from pathlib import Path
import pandas as pd
import re

base = Path(r"D:\Kidy_sales_Intelligence")
saida = base / "diagnostico_janela_compra.txt"
linhas = []

def registrar(texto):
    linhas.append(str(texto))
    print(texto)

for tipo in ("DADOS_PREDITIVA", "DADOS_PREDITIVA_FAT"):
    registrar(f"\n{'=' * 60}\nBASE: {tipo}")

    arquivos = [base / f"{tipo}_{i}.parquet" for i in range(1, 7)]
    total_linhas = 0

    for arquivo in arquivos:
        if not arquivo.exists():
            registrar(f"AUSENTE: {arquivo.name}")
            continue

        df = pd.read_parquet(arquivo)
        total_linhas += len(df)

        registrar(f"\nARQUIVO: {arquivo.name}")
        registrar(f"LINHAS: {len(df):,}")
        registrar(f"COLUNAS: {len(df.columns)}")

        colunas_base = [
            c for c in df.columns
            if not re.search(r"_\d+$", str(c))
        ]

        registrar(f"CAMPOS PRINCIPAIS: {colunas_base}")

        for campo in ("Data Cadastro", "Data Emissao"):
            if campo in df:
                datas = pd.to_datetime(df[campo], errors="coerce", dayfirst=True)
                registrar(
                    f"{campo}: {datas.min()} até {datas.max()} "
                    f"| válidas: {datas.notna().sum():,}"
                )

        for campo in ("Codigo Cliente", "Numero Pedido"):
            if campo in df:
                registrar(
                    f"{campo}: distintos={df[campo].nunique(dropna=True):,}"
                )

        for campo in ("Qtd Venda", "Vlr Venda",
                      "Qtd Faturada", "Vlr Faturado"):
            if campo in df:
                valores = pd.to_numeric(df[campo], errors="coerce")
                registrar(f"{campo}: soma={valores.sum():,.2f}")

        repetidas = [
            c for c in df.columns
            if re.search(r"_\d+$", str(c))
        ]

        preenchidas = [
            c for c in repetidas
            if df[c].notna().any()
        ]

        registrar(f"COLUNAS SUFIXADAS: {len(repetidas)}")
        registrar(f"SUFIXADAS COM DADOS: {len(preenchidas)}")
        registrar(f"EXEMPLOS: {preenchidas[:15]}")

    registrar(f"\nTOTAL DE LINHAS DA BASE: {total_linhas:,}")

saida.write_text("\n".join(linhas), encoding="utf-8")
print(f"\nDIAGNOSTICO SALVO: {saida}")
