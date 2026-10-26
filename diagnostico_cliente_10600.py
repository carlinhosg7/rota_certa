import os
import glob
import pandas as pd

CLIENTE = "10600"
PASTA = r"D:\Kidy_sales_Intelligence"
CACHE = os.path.join(os.environ["TEMP"], "kidy-sales-intelligence-drive")

def normalizar(valor):
    return str(valor).strip().removesuffix(".0")

def analisar(nome, arquivos, coluna_data):
    print(f"\n{'=' * 65}")
    print(nome)
    print(f"{'=' * 65}")

    registros = []

    for arquivo in arquivos:
        df = pd.read_parquet(
            arquivo,
            columns=["Codigo Cliente", "Numero Pedido", coluna_data]
        )

        df["Codigo Cliente"] = df["Codigo Cliente"].map(normalizar)
        df["Numero Pedido"] = df["Numero Pedido"].map(normalizar)

        cliente = df[df["Codigo Cliente"] == CLIENTE].copy()
        cliente["Arquivo"] = os.path.basename(arquivo)

        print(
            os.path.basename(arquivo),
            "| Registros do cliente:", len(cliente)
        )

        if not cliente.empty:
            registros.append(cliente)

    if not registros:
        print("CLIENTE NAO ENCONTRADO NESTA BASE")
        return pd.DataFrame()

    resultado = pd.concat(registros, ignore_index=True)

    resultado[coluna_data] = pd.to_datetime(
        resultado[coluna_data],
        errors="coerce"
    )

    print("\nTotal de linhas:", len(resultado))
    print("Pedidos distintos:", resultado["Numero Pedido"].nunique())

    print("\nRegistros por ano:")
    print(resultado[coluna_data].dt.year.value_counts().sort_index())

    print("\nExemplos de pedidos:")
    print(
        resultado[
            ["Codigo Cliente", "Numero Pedido", coluna_data]
        ].drop_duplicates().head(15).to_string(index=False)
    )

    return resultado

pedidos = analisar(
    "ENTRADA DE PEDIDOS",
    sorted(glob.glob(os.path.join(PASTA, "DADOS_PREDITIVA_[1-6].parquet"))),
    "Data Cadastro"
)

faturamento = analisar(
    "FATURAMENTO",
    sorted(glob.glob(os.path.join(CACHE, "DADOS_PREDITIVA_FAT_*.parquet"))),
    "Data Emissao"
)

print("\n" + "=" * 65)
print("CRUZAMENTO CLIENTE 10600")
print("=" * 65)

if not pedidos.empty and not faturamento.empty:
    entrada = set(pedidos["Numero Pedido"])
    fat = set(faturamento["Numero Pedido"])

    comuns = entrada & fat

    print("Pedidos na entrada:", len(entrada))
    print("Pedidos no faturamento:", len(fat))
    print("Pedidos correspondentes:", len(comuns))

    print("\nExemplos de pedidos correspondentes:")
    print(sorted(comuns)[:20])

    print("\nExemplos de pedidos sem correspondencia:")
    print(sorted(entrada - fat)[:20])
else:
    print("Nao foi possivel cruzar: cliente ausente em uma das bases.")
