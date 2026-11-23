import sys
import json
import re
from pathlib import Path

import pandas as pd

ORIGEM = Path(r"I:\Meu Drive\DADOS_SALES_INT")

PASTA_SAIDA = Path(sys.argv[1])
CARTEIRA_JSON = Path(sys.argv[2])

INICIO = pd.Timestamp("2026-11-09")
FIM_EXCLUSIVO = pd.Timestamp("2026-11-24")

PASTA_SAIDA.mkdir(parents=True, exist_ok=True)

def codigo(v):
    if pd.isna(v):
        return ""
    return re.sub(r"\.0+$", "", str(v).strip())

with open(CARTEIRA_JSON, "r", encoding="utf-8") as f:
    carteira = set(json.load(f))

colunas = [
    "Codigo Cliente",
    "Razao Social",
    "Numero Pedido",
    "Data Cadastro",
    "Codigo Representante",
    "Codigo Supervisor"
]

arquivos = [
    ORIGEM / f"DADOS_PREDITIVA_{i}.parquet"
    for i in range(1, 7)
]

faltantes = [str(a) for a in arquivos if not a.exists()]

if faltantes:
    raise RuntimeError(
        "Parquets ausentes:\n" + "\n".join(faltantes)
    )

movimentos_periodo = []
total_linhas = 0
total_periodo = 0
datas_maximas = []

print("\n=== ANALISANDO PARQUETS ATUALIZADOS ===")

for arquivo in arquivos:
    df = pd.read_parquet(
        arquivo,
        columns=colunas
    )

    total_linhas += len(df)

    # Datas de cadastro originadas do Excel.
    # Preservar a data civil sem aplicar deslocamento UTC.
    datas_locais = pd.to_datetime(
        df["Data Cadastro"],
        errors="coerce"
    )

    data_maxima = datas_locais.max()

    if pd.notna(data_maxima):
        datas_maximas.append(data_maxima)

    mascara = (
        (datas_locais >= INICIO) &
        (datas_locais < FIM_EXCLUSIVO)
    )

    filtrado = df.loc[mascara].copy()

    filtrado["data_pedido"] = (
        datas_locais.loc[mascara]
        .dt.strftime("%Y-%m-%d")
    )

    total_periodo += len(filtrado)

    filtrado["codigo_cliente"] = (
        filtrado["Codigo Cliente"].map(codigo)
    )

    filtrado["numero_pedido"] = (
        filtrado["Numero Pedido"].map(codigo)
    )

    filtrado["representante"] = (
        filtrado["Codigo Representante"].map(codigo)
    )

    filtrado["supervisor"] = (
        filtrado["Codigo Supervisor"].map(codigo)
    )

    filtrado["razao_social"] = (
        filtrado["Razao Social"].fillna("").astype(str)
    )

    filtrado = filtrado[
        filtrado["codigo_cliente"].isin(carteira)
        & filtrado["numero_pedido"].ne("")
    ]

    movimentos_periodo.append(
        filtrado[
            [
                "codigo_cliente",
                "razao_social",
                "numero_pedido",
                "data_pedido",
                "representante",
                "supervisor"
            ]
        ]
    )

    print(
        arquivo.name,
        "| linhas:", len(df),
        "| periodo:", int(mascara.sum()),
        "| carteira 02:", len(filtrado)
    )

if movimentos_periodo:
    movimentos = pd.concat(
        movimentos_periodo,
        ignore_index=True
    )
else:
    movimentos = pd.DataFrame(columns=[
        "codigo_cliente",
        "razao_social",
        "numero_pedido",
        "data_pedido",
        "representante",
        "supervisor"
    ])

# Um pedido possui diversas linhas de produtos.
# Mantemos uma linha por cliente + pedido.
movimentos = movimentos.sort_values(
    ["data_pedido", "codigo_cliente", "numero_pedido"]
)

pedidos = movimentos.drop_duplicates(
    subset=["codigo_cliente", "numero_pedido"],
    keep="first"
).copy()

# Uma reativacao potencial por cliente:
# prevalece o primeiro pedido no periodo.
clientes = pedidos.drop_duplicates(
    subset=["codigo_cliente"],
    keep="first"
).copy()

pedidos_por_cliente = (
    pedidos.groupby("codigo_cliente")
    .size()
    .rename("pedidos_distintos")
    .reset_index()
)

clientes = clientes.merge(
    pedidos_por_cliente,
    on="codigo_cliente",
    how="left"
)

por_representante = (
    clientes.groupby(
        ["supervisor", "representante"],
        dropna=False
    )
    .size()
    .reset_index(name="clientes_reativados_potenciais")
    .sort_values(
        "clientes_reativados_potenciais",
        ascending=False
    )
)

por_supervisor = (
    clientes.groupby("supervisor", dropna=False)
    .size()
    .reset_index(name="clientes_reativados_potenciais")
    .sort_values(
        "clientes_reativados_potenciais",
        ascending=False
    )
)

clientes.to_csv(
    PASTA_SAIDA / "clientes_reativados_potenciais.csv",
    sep=";",
    index=False,
    encoding="utf-8-sig"
)

pedidos.to_csv(
    PASTA_SAIDA / "pedidos_reativacao.csv",
    sep=";",
    index=False,
    encoding="utf-8-sig"
)

por_representante.to_csv(
    PASTA_SAIDA / "reativacao_por_representante.csv",
    sep=";",
    index=False,
    encoding="utf-8-sig"
)

por_supervisor.to_csv(
    PASTA_SAIDA / "reativacao_por_supervisor.csv",
    sep=";",
    index=False,
    encoding="utf-8-sig"
)

ultima_data = (
    max(datas_maximas).strftime("%d/%m/%Y")
    if datas_maximas else "SEM DADOS"
)

resumo = {
    "periodo_inicio": "2026-11-09",
    "periodo_fim": "2026-11-23",
    "ultima_data_no_parquet": ultima_data,
    "linhas_parquet": total_linhas,
    "linhas_no_periodo": total_periodo,
    "clientes_carteira02_original": len(carteira),
    "pedidos_distintos_carteira02": len(pedidos),
    "clientes_reativados_potenciais": len(clientes),
    "elegibilidade_final_validada": False,
    "situacao_pedidos_validada": False
}

with open(
    PASTA_SAIDA / "resumo.json",
    "w",
    encoding="utf-8"
) as f:
    json.dump(resumo, f, ensure_ascii=False, indent=2)

print("\n======================================")
print("RESULTADO - REATIVACAO KIDY")
print("======================================")

for chave, valor in resumo.items():
    print(f"{chave}: {valor}")

print("\n=== POR SUPERVISOR ===")
print(por_supervisor.to_string(index=False))

print("\n=== POR REPRESENTANTE ===")
print(por_representante.to_string(index=False))

print("\n=== CLIENTES IDENTIFICADOS ===")
print(clientes.head(30).to_string(index=False))

print("\nRELATORIOS GERADOS EM:")
print(PASTA_SAIDA)

print("\nNENHUM DADO ALTERADO NO SUPABASE")