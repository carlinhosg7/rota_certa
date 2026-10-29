import json
import re
import unicodedata
from datetime import date
from pathlib import Path

import pandas as pd

raiz = Path(r"D:\Kidy_sales_Intelligence")
drive = Path(r"I:\Meu Drive\DADOS_SALES_INT")
saida = raiz / "data"
saida.mkdir(exist_ok=True)

arquivos = sorted(drive.glob("DADOS_PREDITIVA_[1-6].parquet"))
if len(arquivos) != 6:
    raise SystemExit(f"Esperados 6 Parquets. Encontrados: {len(arquivos)}")

def normalizar(valor):
    if pd.isna(valor):
        return ""
    texto = str(valor).strip().upper()
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", texto)

def codigo_cliente(valor):
    if pd.isna(valor):
        return ""
    return re.sub(r"\.0$", "", str(valor).strip())

print("\n=== MUNICIPIOS IBGE ===")

municipios = json.loads(
    (saida / "share-municipios.json").read_text(encoding="utf-8")
)

mapa = {}
ambiguos = set()

for m in municipios:
    chave = (normalizar(m["uf"]), normalizar(m["cidade"]))
    cod = str(m["codigo_ibge"])
    if chave in mapa and mapa[chave] != cod:
        ambiguos.add(chave)
    else:
        mapa[chave] = cod

for chave in ambiguos:
    mapa.pop(chave, None)

print("Municipios:", len(municipios))
print("Nomes ambiguos:", len(ambiguos))

print("\n=== CADASTRO DE CLIENTES ===")

clientes = pd.read_excel(
    raiz / "base clientes.xlsx",
    sheet_name="base clientes",
    header=2,
    dtype=str
)

clientes.columns = clientes.columns.str.strip()
clientes = clientes[["Codigo Cliente", "Cidade", "Uf"]].copy()

clientes["codigo"] = clientes["Codigo Cliente"].map(codigo_cliente)
clientes["chave"] = list(zip(
    clientes["Uf"].map(normalizar),
    clientes["Cidade"].map(normalizar)
))

clientes = clientes[clientes["codigo"] != ""]

conflitos = clientes.groupby("codigo")["chave"].nunique()
codigos_ambiguos = set(conflitos[conflitos > 1].index)

clientes = clientes[
    ~clientes["codigo"].isin(codigos_ambiguos)
].drop_duplicates(subset=["codigo"])

clientes["ibge"] = clientes["chave"].map(mapa)

cliente_ibge = dict(zip(clientes["codigo"], clientes["ibge"]))

print("Clientes distintos:", len(clientes))
print("Codigos com municipio conflitante:", len(codigos_ambiguos))
print("Clientes associados ao IBGE:", int(clientes["ibge"].notna().sum()))

print("\n=== PARQUETS / DATA ENTREGA ===")

partes = []
hoje = pd.Timestamp(date.today())

for arquivo in arquivos:
    df = pd.read_parquet(
        arquivo,
        columns=["Codigo Cliente", "Data Entrega", "Qtd Venda"]
    )

    df["cliente"] = df["Codigo Cliente"].map(codigo_cliente)

    texto = df["Data Entrega"].astype("string").str.strip()
    texto = texto.str.replace(
        r"^(\d{4})/(\d{2})/(\d{2})",
        r"\1-\2-\3",
        regex=True
    )

    df["entrega"] = pd.to_datetime(
        texto,
        format="mixed",
        errors="coerce",
        dayfirst=True
    )

    iso = texto.str.match(r"^\d{4}-\d{2}-\d{2}", na=False)

    df.loc[iso, "entrega"] = pd.to_datetime(
        texto.loc[iso],
        format="ISO8601",
        errors="coerce"
    )

    df["pares"] = pd.to_numeric(
        df["Qtd Venda"], errors="coerce"
    )

    print(
        arquivo.name,
        "| registros:", len(df),
        "| pares:", round(df["pares"].sum())
    )

    partes.append(df[["cliente", "entrega", "pares"]])

fat = pd.concat(partes, ignore_index=True)

futuras = fat["entrega"] > hoje

print("\nRegistros totais:", len(fat))
print("Pares totais:", round(fat["pares"].sum()))
print("Registros com entrega futura:", int(futuras.sum()))
print("Pares com entrega futura:", round(fat.loc[futuras, "pares"].sum()))

# Excluir datas futuras e registros sem data/quantidade.
base = fat[
    fat["entrega"].notna()
    & (fat["entrega"] <= hoje)
    & (fat["entrega"].dt.year >= 2016)
    & fat["pares"].notna()
].copy()

base["ano"] = base["entrega"].dt.year.astype(int)
base["ibge"] = base["cliente"].map(cliente_ibge)

localizadas = base["ibge"].notna()
pares_total = base["pares"].sum()
pares_localizados = base.loc[localizadas, "pares"].sum()

print("\n=== CONCILIACAO ===")
print("Registros no periodo:", len(base))
print("Registros com municipio:", int(localizadas.sum()))
print("Registros sem municipio:", int((~localizadas).sum()))
print("Pares no periodo:", round(pares_total))
print("Pares localizados:", round(pares_localizados))
print("Pares sem municipio:", round(pares_total - pares_localizados))
print(
    "Cobertura em pares:",
    f"{pares_localizados / pares_total * 100:.2f}%"
    if pares_total else "0%"
)

print("\n=== HISTORICO POR ANO ===")

resumo = base.groupby("ano").agg(
    registros=("pares", "size"),
    pares=("pares", "sum")
)

localizados_ano = (
    base.loc[localizadas].groupby("ano")["pares"].sum()
)

resumo["pares_com_ibge"] = localizados_ano
resumo["pares_com_ibge"] = resumo["pares_com_ibge"].fillna(0)

print(resumo.to_string())

# Gerar candidato sem substituir o arquivo usado pela API.
agrupado = (
    base.loc[localizadas]
    .groupby(["ibge", "ano"])["pares"]
    .sum()
)

resultado = {}
for (ibge, ano), pares in agrupado.items():
    resultado.setdefault(str(ibge), {})[str(ano)] = round(float(pares), 2)

arquivo_candidato = saida / "share-vendas-anuais.candidato.json"
arquivo_candidato.write_text(
    json.dumps(resultado, ensure_ascii=False),
    encoding="utf-8"
)

# Auditoria dos registros nao localizados.
pendencias = (
    base.loc[~localizadas]
    .groupby("cliente", dropna=False)
    .agg(registros=("pares", "size"), pares=("pares", "sum"))
    .sort_values("pares", ascending=False)
)

arquivo_auditoria = saida / "share-clientes-sem-ibge.csv"
pendencias.to_csv(
    arquivo_auditoria,
    sep=";",
    encoding="utf-8-sig"
)

print("\n=== ARQUIVOS DE CONFERENCIA ===")
print(arquivo_candidato)
print(arquivo_auditoria)
print("Municipios com vendas:", len(resultado))
print("\nNenhum arquivo oficial foi substituido.")
