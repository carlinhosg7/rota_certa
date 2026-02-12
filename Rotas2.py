import streamlit as st
import pandas as pd
import numpy as np
from io import BytesIO
from datetime import date
import unicodedata
import requests

st.set_page_config(page_title="Rota por Raio (100km) — sem atendimento", layout="wide")

# =========================
# Config
# =========================
RADIUS_KM_DEFAULT = 100

# Repositório (versão com municípios/estados em CSV)
# Observação: municipios.csv costuma ter codigo_uf, e o uf (sigla) está em estados.csv
MUNICIPIOS_CSV_URL = "https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/csv/municipios.csv"
ESTADOS_CSV_URL    = "https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/csv/estados.csv"

# =========================
# Helpers
# =========================
def strip_accents(s: str) -> str:
    if s is None or pd.isna(s):
        return ""
    s = str(s).strip()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return s.upper()

def extract_cod_cliente(cliente_raw: str) -> str:
    """Extrai '8330' de '8330 - NOME DO CLIENTE' ou tenta pegar dígitos."""
    if pd.isna(cliente_raw):
        return ""
    s = str(cliente_raw).strip()
    if " - " in s:
        return s.split(" - ", 1)[0].strip()
    digits = "".join([c for c in s if c.isdigit()])
    return digits.strip()

def split_cidade_uf(cidade_raw: str):
    """'RECIFE - PE' -> ('RECIFE', 'PE')"""
    if pd.isna(cidade_raw):
        return ("", "")
    s = str(cidade_raw).strip()
    if " - " in s:
        c, uf = s.rsplit(" - ", 1)
        return (c.strip(), uf.strip())
    return (s.strip(), "")

def haversine_km(lat1, lon1, lat2, lon2):
    """Distância Haversine em km. Suporta arrays numpy em lat2/lon2."""
    R = 6371.0
    lat1 = np.radians(lat1)
    lon1 = np.radians(lon1)
    lat2 = np.radians(lat2)
    lon2 = np.radians(lon2)

    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    c = 2 * np.arcsin(np.sqrt(a))
    return R * c

def read_carteira_weird_excel(uploaded_file):
    """
    Seu arquivo de carteira vem com:
      - linha 0 vazia
      - linha 1 texto
      - linha 2 cabeçalho real
      - dados a partir da linha 3
    """
    raw = pd.read_excel(uploaded_file, header=None)
    headers = raw.iloc[2].tolist()
    df = raw.iloc[3:].copy()
    df.columns = headers
    df = df.reset_index(drop=True)
    return df

@st.cache_data(show_spinner=False)
def load_municipios_latlon():
    """
    Carrega municipios.csv + estados.csv e devolve:
      CITY_KEY, latitude, longitude
    onde CITY_KEY = 'NOME - UF' (normalizado sem acentos)
    """
    from io import StringIO

    # --- Municipios ---
    r = requests.get(MUNICIPIOS_CSV_URL, timeout=30)
    r.raise_for_status()
    df_m = pd.read_csv(StringIO(r.text))
    df_m.columns = [c.strip().lower() for c in df_m.columns]

    # Colunas esperadas no repo:
    # codigo_ibge,nome,latitude,longitude,capital,codigo_uf,...
    for need in ["nome", "latitude", "longitude"]:
        if need not in df_m.columns:
            raise ValueError(f"municipios.csv sem coluna '{need}'. Colunas: {list(df_m.columns)}")

    has_uf = "uf" in df_m.columns
    has_coduf = "codigo_uf" in df_m.columns

    # --- Estados (codigo_uf -> uf) ---
    if (not has_uf) and has_coduf:
        r2 = requests.get(ESTADOS_CSV_URL, timeout=30)
        r2.raise_for_status()
        df_e = pd.read_csv(StringIO(r2.text))
        df_e.columns = [c.strip().lower() for c in df_e.columns]

        # estados: codigo_uf,uf,nome,latitude,longitude,regiao
        if "codigo_uf" not in df_e.columns or "uf" not in df_e.columns:
            raise ValueError(f"estados.csv sem colunas esperadas (codigo_uf, uf). Colunas: {list(df_e.columns)}")

        df_m["codigo_uf"] = pd.to_numeric(df_m["codigo_uf"], errors="coerce")
        df_e["codigo_uf"] = pd.to_numeric(df_e["codigo_uf"], errors="coerce")

        df_m = df_m.merge(df_e[["codigo_uf", "uf"]], on="codigo_uf", how="left")

    if "uf" not in df_m.columns:
        raise ValueError(f"Não consegui obter a coluna 'uf'. Colunas: {list(df_m.columns)}")

    df_m["latitude"] = pd.to_numeric(df_m["latitude"], errors="coerce")
    df_m["longitude"] = pd.to_numeric(df_m["longitude"], errors="coerce")
    df_m["uf"] = df_m["uf"].astype(str)

    df_m = df_m.dropna(subset=["nome", "uf", "latitude", "longitude"]).copy()

    df_m["CITY_KEY"] = df_m["nome"].apply(strip_accents) + " - " + df_m["uf"].apply(strip_accents)
    df_m = df_m.drop_duplicates(subset=["CITY_KEY"], keep="first")

    return df_m[["CITY_KEY", "latitude", "longitude"]].copy()

def to_excel_download(df_clientes: pd.DataFrame, df_cidades: pd.DataFrame):
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df_clientes.to_excel(writer, sheet_name="CLIENTES_SEM_ATEND", index=False)
        df_cidades.to_excel(writer, sheet_name="CIDADES_NO_RAIO", index=False)
    output.seek(0)
    return output

# =========================
# UI
# =========================
st.title("📍 Rota por Raio — Cidades da agenda + 100km + Clientes sem atendimento")

col1, col2 = st.columns(2)
with col1:
    up_agenda = st.file_uploader("📅 Upload Agenda (ListaAtendimentos.xlsx)", type=["xlsx"])
with col2:
    up_carteira = st.file_uploader("👥 Upload Carteira (clientes/cidade/última compra)", type=["xlsx"])

if not up_agenda or not up_carteira:
    st.info("Envie **Agenda** e **Carteira** para rodar.")
    st.stop()

# =========================
# Load agenda
# =========================
df_ag = pd.read_excel(up_agenda)

# validações mínimas
need_ag = ["DATA AGENDADO", "CLIENTE", "CIDADE", "LOGIN", "SITUAÇÃO"]
missing_ag = [c for c in need_ag if c not in df_ag.columns]
if missing_ag:
    st.error(f"A agenda está sem colunas obrigatórias: {missing_ag}")
    st.stop()

df_ag["DATA AGENDADO"] = pd.to_datetime(df_ag["DATA AGENDADO"], errors="coerce").dt.date
df_ag["COD_CLIENTE"] = df_ag["CLIENTE"].apply(extract_cod_cliente).astype(str).str.strip()
df_ag["CIDADE_RAW"] = df_ag["CIDADE"].astype(str)
df_ag["CIDADE"], df_ag["UF"] = zip(*df_ag["CIDADE_RAW"].apply(split_cidade_uf))
df_ag["CITY_KEY"] = df_ag["CIDADE"].apply(strip_accents) + " - " + df_ag["UF"].apply(strip_accents)

# =========================
# Load carteira
# =========================
df_ca = read_carteira_weird_excel(up_carteira)

need_ca = ["Codigo Cliente", "Cidade", "Uf", "Data Ultima Compra", "Codigo Representante", "Razao Social"]
missing_ca = [c for c in need_ca if c not in df_ca.columns]
if missing_ca:
    st.error(f"A carteira está sem colunas obrigatórias: {missing_ca}")
    st.stop()

df_ca["COD_CLIENTE"] = df_ca["Codigo Cliente"].astype(str).str.strip()
df_ca["CIDADE"] = df_ca["Cidade"].astype(str).str.strip()
df_ca["UF"] = df_ca["Uf"].astype(str).str.strip()
df_ca["CITY_KEY"] = df_ca["CIDADE"].apply(strip_accents) + " - " + df_ca["UF"].apply(strip_accents)
df_ca["DATA_ULT_COMPRA"] = pd.to_datetime(df_ca["Data Ultima Compra"], errors="coerce").dt.date

# =========================
# Sidebar filters
# =========================
st.sidebar.header("🎯 Filtros")

rep_list = sorted(df_ag["LOGIN"].dropna().astype(str).unique().tolist())
rep_sel = st.sidebar.selectbox("Representante (LOGIN)", rep_list)

df_ag_rep = df_ag[df_ag["LOGIN"].astype(str) == str(rep_sel)].copy()

# carteira por representante
df_ca_rep = df_ca[df_ca["Codigo Representante"].astype(str).str.strip() == str(rep_sel)].copy()

min_d = df_ag_rep["DATA AGENDADO"].min()
max_d = df_ag_rep["DATA AGENDADO"].max()

dt_ini = st.sidebar.date_input("Data inicial", value=min_d if pd.notna(min_d) else date.today())
dt_fim = st.sidebar.date_input("Data final", value=max_d if pd.notna(max_d) else date.today())

status_opts = sorted(df_ag_rep["SITUAÇÃO"].dropna().unique().tolist())
default_status = [s for s in status_opts if str(s).upper() != "EXCLUIDO"] or status_opts
status_sel = st.sidebar.multiselect("Situação (agenda)", status_opts, default=default_status)

radius_km = st.sidebar.slider("Raio (km)", 10, 300, RADIUS_KM_DEFAULT, 10)

# aplica filtros na agenda
df_ag_f = df_ag_rep[
    (df_ag_rep["DATA AGENDADO"] >= dt_ini) &
    (df_ag_rep["DATA AGENDADO"] <= dt_fim)
].copy()

if status_sel:
    df_ag_f = df_ag_f[df_ag_f["SITUAÇÃO"].isin(status_sel)].copy()

# =========================
# KPIs base
# =========================
st.subheader("📊 Base filtrada (Representante + Período)")
k1, k2, k3, k4 = st.columns(4)
k1.metric("Agenda (registros)", f"{len(df_ag_f):,}".replace(",", "."))
k2.metric("Cidades na agenda", f"{df_ag_f['CITY_KEY'].nunique()}")
k3.metric("Clientes na carteira (rep)", f"{df_ca_rep['COD_CLIENTE'].nunique():,}".replace(",", "."))
k4.metric("Raio", f"{radius_km} km")

if df_ag_f.empty:
    st.warning("Sem registros na agenda nesse período/filtros.")
    st.stop()

with st.expander("Ver agenda filtrada"):
    st.dataframe(df_ag_f, use_container_width=True, height=260)

# =========================
# Carrega coordenadas cidades
# =========================
with st.spinner("Carregando base de coordenadas de municípios (Brasil)..."):
    df_mun = load_municipios_latlon()

# =========================
# Cidades base da agenda com coords
# =========================
base_cities = (
    df_ag_f[["CITY_KEY"]]
    .drop_duplicates()
    .merge(df_mun, on="CITY_KEY", how="left")
)

missing_coords = int(base_cities["latitude"].isna().sum())
if missing_coords > 0:
    st.warning(
        f"{missing_coords} cidade(s) da agenda não casaram na base de coordenadas. "
        "Provável diferença de grafia/abreviação. Essas cidades serão ignoradas no cálculo do raio."
    )

base_cities = base_cities.dropna(subset=["latitude", "longitude"]).copy()

if base_cities.empty:
    st.error("Nenhuma cidade da agenda casou com a base de coordenadas. Não dá pra calcular raio.")
    st.stop()

# =========================
# Calcula cidades dentro do raio (união)
# =========================
all_lat = df_mun["latitude"].values
all_lon = df_mun["longitude"].values
all_key = df_mun["CITY_KEY"].values

near_sets = set()
near_rows = []

for _, row in base_cities.iterrows():
    blt, blo = float(row["latitude"]), float(row["longitude"])
    dists = haversine_km(blt, blo, all_lat, all_lon)  # vetor
    mask = dists <= float(radius_km)

    keys_in = all_key[mask]
    dist_in = dists[mask]

    for k, dist_km in zip(keys_in, dist_in):
        near_sets.add(str(k))
        near_rows.append({
            "CITY_BASE": row["CITY_KEY"],
            "CITY_IN_RAIO": str(k),
            "DIST_KM": float(dist_km)
        })

df_cities_in = pd.DataFrame(near_rows)
df_cities_in = df_cities_in.sort_values(["CITY_BASE", "DIST_KM"], ascending=[True, True]).reset_index(drop=True)

# =========================
# Clientes da carteira nessas cidades (no raio) e SEM atendimento no período
# =========================
df_ca_in = df_ca_rep[df_ca_rep["CITY_KEY"].isin(near_sets)].copy()

clientes_atendidos_periodo = set(df_ag_f["COD_CLIENTE"].astype(str).tolist())
df_sem_atend = df_ca_in[~df_ca_in["COD_CLIENTE"].astype(str).isin(clientes_atendidos_periodo)].copy()

# prioridade por recência
ref_date = dt_fim
df_sem_atend["DIAS_SEM_COMPRAR"] = (pd.to_datetime(ref_date) - pd.to_datetime(df_sem_atend["DATA_ULT_COMPRA"])).dt.days
df_sem_atend["DIAS_SEM_COMPRAR"] = df_sem_atend["DIAS_SEM_COMPRAR"].fillna(99999).astype(int)

# ordenação "campeã": mais tempo sem comprar primeiro
cols_sort = ["DIAS_SEM_COMPRAR", "Cidade", "Razao Social"]
for c in cols_sort:
    if c not in df_sem_atend.columns:
        # só pra não quebrar em caso de nome diferente
        pass

df_sem_atend = df_sem_atend.sort_values(
    by=[c for c in cols_sort if c in df_sem_atend.columns],
    ascending=[False, True, True][:len([c for c in cols_sort if c in df_sem_atend.columns])]
).reset_index(drop=True)

# =========================
# OUTPUT
# =========================
st.subheader("🏙️ Cidades dentro do raio (a partir das cidades da agenda)")
st.caption("Aqui é a tabela cidade-base (da agenda) → cidades encontradas dentro do raio e distância aproximada (km).")
st.dataframe(df_cities_in, use_container_width=True, height=280)

st.subheader("🚫 Clientes sem atendimento (no período) dentro do raio")
st.caption("Definição: cliente da carteira em cidade <= raio de alguma cidade da agenda, mas NÃO aparece na agenda no período filtrado.")

# Seleção de colunas para exibir (mantém compatível com seu arquivo)
show_cols = [
    "Codigo Cliente", "Razao Social", "Cidade", "Uf",
    "Data Ultima Compra", "DIAS_SEM_COMPRAR",
    "Grupo Cliente", "Codigo Grupo Cliente",
    "Codigo Representante", "Supervisor",
    "Qtd Venda", "Vlr Venda"
]
show_cols = [c for c in show_cols if c in df_sem_atend.columns]

st.dataframe(df_sem_atend[show_cols], use_container_width=True, height=460)

excel_bytes = to_excel_download(df_sem_atend, df_cities_in)

st.download_button(
    "⬇️ Baixar Excel (Clientes sem atendimento + Cidades no raio)",
    data=excel_bytes,
    file_name=f"clientes_sem_atendimento_raio_{radius_km}km_rep_{rep_sel}_{dt_ini}_a_{dt_fim}.xlsx",
    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
)
