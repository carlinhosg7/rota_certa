from pathlib import Path
import os
import pandas as pd

CLIENTE = "27317"
BASE = Path(r"D:\Kidy_sales_Intelligence")
CACHE = Path(os.environ["TEMP"]) / "kidy-sales-intelligence-drive"
SAIDA = BASE / "auditoria_faturamento_27317.xlsx"

def codigo(valor):
    return str(valor).strip().removesuffix(".0")

def carregar(pasta, padrao, colunas, data):
    partes = []
    for arquivo in sorted(pasta.glob(padrao)):
        df = pd.read_parquet(arquivo, columns=colunas)
        df["Codigo Cliente"] = df["Codigo Cliente"].map(codigo)
        df["Numero Pedido"] = df["Numero Pedido"].map(codigo)
        df = df[df["Codigo Cliente"] == CLIENTE].copy()
        df[data] = pd.to_datetime(df[data], errors="coerce")
        df["Arquivo"] = arquivo.name
        partes.append(df)
    return pd.concat(partes, ignore_index=True) if partes else pd.DataFrame(columns=colunas)

pedidos = carregar(
    BASE, "DADOS_PREDITIVA_[1-6].parquet",
    ["Codigo Cliente", "Numero Pedido", "Data Cadastro", "Qtd Venda", "Vlr Venda"],
    "Data Cadastro"
)

fat = carregar(
    CACHE, "DADOS_PREDITIVA_FAT_[1-6].parquet",
    ["Codigo Cliente", "Numero Pedido", "Data Emissao", "Qtd Faturada", "Vlr Faturado"],
    "Data Emissao"
)

entrada_pedidos = set(pedidos["Numero Pedido"])
fat_pedidos = set(fat["Numero Pedido"])

resumo = pd.DataFrame([
    ["Cliente", CLIENTE],
    ["Linhas de entrada", len(pedidos)],
    ["Pedidos distintos", len(entrada_pedidos)],
    ["Linhas de faturamento", len(fat)],
    ["Pedidos faturados distintos", len(fat_pedidos)],
    ["Pedidos coincidentes", len(entrada_pedidos & fat_pedidos)],
    ["Primeira entrada", str(pedidos["Data Cadastro"].min())],
    ["Ultima entrada", str(pedidos["Data Cadastro"].max())],
    ["Primeiro faturamento", str(fat["Data Emissao"].min()) if len(fat) else "SEM REGISTROS"],
    ["Ultimo faturamento", str(fat["Data Emissao"].max()) if len(fat) else "SEM REGISTROS"]
], columns=["Indicador", "Resultado"])

with pd.ExcelWriter(SAIDA, engine="openpyxl") as writer:
    resumo.to_excel(writer, "Resumo", index=False)
    pedidos.to_excel(writer, "Pedidos", index=False)
    fat.to_excel(writer, "Faturamento", index=False)

    pd.DataFrame({
        "Numero Pedido": sorted(entrada_pedidos - fat_pedidos)
    }).to_excel(writer, "Sem Correspondencia", index=False)

print("\nAUDITORIA CONCLUIDA")
print(resumo.to_string(index=False))
print("\nArquivo:", SAIDA)
