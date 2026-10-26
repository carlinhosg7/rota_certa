from pathlib import Path
import pandas as pd

base = Path(r"D:\Kidy_sales_Intelligence")

for prefixo, campo in [
    ("DADOS_PREDITIVA", "Data Cadastro"),
    ("DADOS_PREDITIVA_FAT", "Data Emissao")
]:
    print(f"\n{'='*65}\n{prefixo}")

    for i in range(1, 7):
        arquivo = base / f"{prefixo}_{i}.parquet"
        df = pd.read_parquet(arquivo, columns=[
            "Codigo Cliente", "Numero Pedido", campo
        ])

        serie = df[campo]
        datas = pd.to_datetime(serie, errors="coerce")

        print(f"\n{arquivo.name}")
        print("Tipo:", serie.dtype)
        print("Exemplos originais:", serie.dropna().head(8).tolist())
        print("Datas validas:", datas.notna().sum())
        print("Data minima:", datas.min())
        print("Data maxima:", datas.max())
        print("Anos identificados:")
        print(datas.dt.year.value_counts(dropna=False).sort_index().to_string())
