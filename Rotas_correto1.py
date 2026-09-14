import streamlit as st
import pandas as pd
import numpy as np
import requests
import unicodedata
from datetime import date
from io import StringIO
from urllib.parse import quote

# ==============================
# CONFIG
# ==============================
MUNICIPIOS_URL = "https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/csv/municipios.csv"
ESTADOS_URL = "https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/csv/estados.csv"

st.set_page_config(page_title="🔥 Rota Campeã Automática", layout="wide")

# ==============================
# FUNÇÕES BASE
# ==============================
def norm(x):
    if x is None or pd.isna(x):
        return ""
    x = str(x).strip()
    x = unicodedata.normalize("NFKD", x)
    x = "".join([c for c in x if not unicodedata.combining(c)])
    return x.upper().strip()

def split_cidade_uf(cidade_raw: str):
    if pd.isna(cidade_raw):
        return ("", "")
    s = str(cidade_raw).strip()
    if " - " in s:
        c, uf = s.rsplit(" - ", 1)
        return (c.strip(), uf.strip())
    return (s.strip(), "")

def extract_cod_cliente(cliente_raw: str) -> str:
    if pd.isna(cliente_raw):
        return ""
    s = str(cliente_raw).strip()
    if " - " in s:
        return s.split(" - ", 1)[0].strip()
    digits = "".join([c for c in s if c.isdigit()])
    return digits.strip()

def safe_str(x):
    return "" if pd.isna(x) else str(x).strip()

def haversine_vec(lat1, lon1, lat2, lon2):
    R = 6371.0
    lat1 = np.radians(float(lat1))
    lon1 = np.radians(float(lon1))
    lat2 = np.radians(np.asarray(lat2, dtype="float64"))
    lon2 = np.radians(np.asarray(lon2, dtype="float64"))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    c = 2 * np.arcsin(np.sqrt(a))
    return R * c

def read_carteira_weird_excel(uploaded_file):
    raw = pd.read_excel(uploaded_file, header=None)
    headers = raw.iloc[2].tolist()
    df = raw.iloc[3:].copy()
    df.columns = headers
    return df.reset_index(drop=True)

@st.cache_data(show_spinner=False)
def load_geo():
    r1 = requests.get(MUNICIPIOS_URL, timeout=30)
    r1.raise_for_status()
    df_m = pd.read_csv(StringIO(r1.text))
    df_m.columns = [c.strip().lower() for c in df_m.columns]

    r2 = requests.get(ESTADOS_URL, timeout=30)
    r2.raise_for_status()
    df_e = pd.read_csv(StringIO(r2.text))
    df_e.columns = [c.strip().lower() for c in df_e.columns]

    df_m["codigo_uf"] = pd.to_numeric(df_m.get("codigo_uf"), errors="coerce")
    df_e["codigo_uf"] = pd.to_numeric(df_e.get("codigo_uf"), errors="coerce")

    df = df_m.merge(df_e[["codigo_uf", "uf"]], on="codigo_uf", how="left")

    df["latitude"] = pd.to_numeric(df.get("latitude"), errors="coerce")
    df["longitude"] = pd.to_numeric(df.get("longitude"), errors="coerce")

    df = df.dropna(subset=["nome", "uf", "latitude", "longitude"]).copy()
    df["city_key"] = df["nome"].apply(norm) + " - " + df["uf"].apply(norm)
    df = df.drop_duplicates(subset=["city_key"], keep="first")
    return df[["city_key", "latitude", "longitude"]].copy()

def try_build_city_key_from_agenda(df_ag):
    cidade_split = df_ag["CIDADE"].apply(split_cidade_uf)
    df_ag["CIDADE_ONLY"], df_ag["UF_FROM_CIDADE"] = zip(*cidade_split)

    if "UF" in df_ag.columns:
        df_ag["UF_FINAL"] = df_ag["UF"].apply(safe_str)
        df_ag.loc[df_ag["UF_FINAL"].eq(""), "UF_FINAL"] = df_ag["UF_FROM_CIDADE"].apply(safe_str)
    else:
        df_ag["UF_FINAL"] = df_ag["UF_FROM_CIDADE"].apply(safe_str)

    df_ag["CIDADE_FINAL"] = df_ag["CIDADE_ONLY"].apply(safe_str)
    df_ag["city_key"] = df_ag["CIDADE_FINAL"].apply(norm) + " - " + df_ag["UF_FINAL"].apply(norm)
    return df_ag

def osrm_route_geojson(points):
    # OSRM espera lon,lat
    coord_str = ";".join([f"{p['lon']},{p['lat']}" for p in points])
    url = f"https://router.project-osrm.org/route/v1/driving/{coord_str}"
    params = {"overview": "full", "geometries": "geojson", "steps": "false"}
    r = requests.get(url, params=params, timeout=30)
    r.raise_for_status()
    data = r.json()
    if "routes" not in data or not data["routes"]:
        raise ValueError("OSRM sem rotas retornadas.")
    coords = data["routes"][0]["geometry"]["coordinates"]  # [[lon, lat], ...]
    return [(lat, lon) for lon, lat in coords]

def google_maps_dir_url(points):
    """
    points: lista de dicts [{lat, lon}]
    Google Maps dir: https://www.google.com/maps/dir/lat,lon/lat,lon/...
    """
    parts = [f"{p['lat']:.6f},{p['lon']:.6f}" for p in points]
    return "https://www.google.com/maps/dir/" + "/".join([quote(p) for p in parts])

def chunk_list(lst, n_chunks):
    if n_chunks <= 1:
        return [lst]
    # divide aproximadamente igual
    k = len(lst)
    base = k // n_chunks
    extra = k % n_chunks
    out, start = [], 0
    for i in range(n_chunks):
        size = base + (1 if i < extra else 0)
        out.append(lst[start:start+size])
        start += size
    return [x for x in out if len(x) > 0]

def minmax_scale(s):
    s = pd.to_numeric(s, errors="coerce").fillna(0.0)
    if s.max() == s.min():
        return pd.Series(np.zeros(len(s)), index=s.index, dtype="float64")
    return (s - s.min()) / (s.max() - s.min())

def pick_stops_hybrid(city_base, df_raio, city_stats, n_stops, w_op, w_dist):
    """
    Seleciona cidades combinando oportunidade e proximidade:
    score_final = w_op * op_norm + w_dist * (1 - dist_norm)
    """
    df = df_raio[df_raio["CITY_BASE"] == city_base].copy()
    df = df[df["CITY_IN_RAIO"] != city_base].copy()
    if df.empty:
        return pd.DataFrame(columns=["CITY_IN_RAIO", "DIST_KM", "op_score", "final_score"])

    df = df.merge(city_stats, left_on="CITY_IN_RAIO", right_on="city_key", how="left")
    df["op_score"] = df["op_score"].fillna(0.0)
    df["dist_norm"] = minmax_scale(df["DIST_KM"])
    df["op_norm"] = minmax_scale(df["op_score"])
    df["final_score"] = (w_op * df["op_norm"]) + (w_dist * (1.0 - df["dist_norm"]))
    df = df.sort_values("final_score", ascending=False).head(int(n_stops)).copy()
    return df[["CITY_IN_RAIO", "DIST_KM", "op_score", "final_score"]].reset_index(drop=True)

def build_route_order(points, w_op, w_dist):
    """
    Rota comercial: vizinho mais próximo + oportunidade no próximo passo.
    custo = w_dist * dist_norm - w_op * op_norm (queremos menor custo)
    """
    if len(points) <= 2:
        return list(range(len(points)))

    coords = np.array([(p["lat"], p["lon"]) for p in points], dtype="float64")
    op = np.array([p.get("op", 0.0) for p in points], dtype="float64")
    op_norm = op.copy()
    if op_norm.max() != op_norm.min():
        op_norm = (op_norm - op_norm.min()) / (op_norm.max() - op_norm.min())
    else:
        op_norm = np.zeros_like(op_norm)

    n = len(points)
    visited = np.zeros(n, dtype=bool)
    order = [0]
    visited[0] = True

    for _ in range(n - 1):
        i = order[-1]
        d = haversine_vec(coords[i, 0], coords[i, 1], coords[:, 0], coords[:, 1])
        d[visited] = np.inf
        d_norm = d.copy()
        finite = np.isfinite(d_norm)
        if finite.any():
            dmin, dmax = d_norm[finite].min(), d_norm[finite].max()
            if dmax != dmin:
                d_norm[finite] = (d_norm[finite] - dmin) / (dmax - dmin)
            else:
                d_norm[finite] = 0.0

        cost = (w_dist * d_norm) - (w_op * op_norm)
        cost[visited] = np.inf
        j = int(np.argmin(cost))
        order.append(j)
        visited[j] = True

    return order

# ==============================
# STREAMLIT
# ==============================
st.title("🔥 ROTA CAMPEÃ AUTOMÁTICA (Agenda → Raio → Clientes sem atendimento)")

col1, col2 = st.columns(2)
with col1:
    agenda = st.file_uploader("📅 Upload Agenda (ListaAtendimentos.xlsx)", type=["xlsx"])
with col2:
    carteira = st.file_uploader("👥 Upload Carteira (clientes/cidade/última compra)", type=["xlsx"])

if not agenda or not carteira:
    st.info("Envie **Agenda** e **Carteira**.")
    st.stop()

# --- Agenda
df_ag = pd.read_excel(agenda)

need_ag = ["DATA AGENDADO", "CLIENTE", "CIDADE", "LOGIN", "SITUAÇÃO"]
missing_ag = [c for c in need_ag if c not in df_ag.columns]
if missing_ag:
    st.error(f"A agenda está sem colunas obrigatórias: {missing_ag}")
    st.stop()

df_ag["DATA AGENDADO"] = pd.to_datetime(df_ag["DATA AGENDADO"], errors="coerce").dt.date
df_ag["COD_CLIENTE"] = df_ag["CLIENTE"].apply(extract_cod_cliente).astype(str).str.strip()
df_ag = try_build_city_key_from_agenda(df_ag)

# --- Carteira
df_ca = read_carteira_weird_excel(carteira)

need_ca = ["Codigo Cliente", "Cidade", "Uf", "Data Ultima Compra", "Codigo Representante", "Razao Social"]
missing_ca = [c for c in need_ca if c not in df_ca.columns]
if missing_ca:
    st.error(f"A carteira está sem colunas obrigatórias: {missing_ca}")
    st.stop()

df_ca["COD_CLIENTE"] = df_ca["Codigo Cliente"].astype(str).str.strip()
df_ca["Cidade"] = df_ca["Cidade"].apply(safe_str)
df_ca["Uf"] = df_ca["Uf"].apply(safe_str)
df_ca["city_key"] = df_ca["Cidade"].apply(norm) + " - " + df_ca["Uf"].apply(norm)
df_ca["DATA_ULT_COMPRA"] = pd.to_datetime(df_ca["Data Ultima Compra"], errors="coerce")

# --- Sidebar filtros
st.sidebar.header("🎯 Filtros")
rep_list = sorted(df_ag["LOGIN"].dropna().astype(str).unique().tolist())
rep_sel = st.sidebar.selectbox("Representante (LOGIN)", rep_list)

df_ag_rep = df_ag[df_ag["LOGIN"].astype(str) == str(rep_sel)].copy()
df_ca_rep = df_ca[df_ca["Codigo Representante"].astype(str).str.strip() == str(rep_sel)].copy()

min_d = df_ag_rep["DATA AGENDADO"].min()
max_d = df_ag_rep["DATA AGENDADO"].max()

dt_ini = st.sidebar.date_input("Data inicial", value=min_d if pd.notna(min_d) else date.today())
dt_fim = st.sidebar.date_input("Data final", value=max_d if pd.notna(max_d) else date.today())

status_opts = sorted(df_ag_rep["SITUAÇÃO"].dropna().unique().tolist())
default_status = [s for s in status_opts if str(s).upper() != "EXCLUIDO"] or status_opts
status_sel = st.sidebar.multiselect("Situação (agenda)", status_opts, default=default_status)

radius = st.sidebar.slider("Raio (km)", 50, 300, 100, 10)

# --- TURBO: parâmetros da rota
st.sidebar.divider()
st.sidebar.subheader("🚀 Turbo da rota")
n_stops = st.sidebar.slider("Quantidade de cidades-alvo", 5, 30, 10, 1)
dias = st.sidebar.slider("Dividir em quantos dias", 1, 7, 2, 1)

w_op = st.sidebar.slider("Peso Oportunidade", 0.0, 1.0, 0.65, 0.05)
w_dist = st.sidebar.slider("Peso Distância", 0.0, 1.0, 0.35, 0.05)
if (w_op + w_dist) == 0:
    w_op, w_dist = 0.5, 0.5
else:
    s = w_op + w_dist
    w_op, w_dist = w_op / s, w_dist / s

# aplica filtros na agenda
df_ag_f = df_ag_rep[
    (df_ag_rep["DATA AGENDADO"] >= dt_ini) &
    (df_ag_rep["DATA AGENDADO"] <= dt_fim)
].copy()
if status_sel:
    df_ag_f = df_ag_f[df_ag_f["SITUAÇÃO"].isin(status_sel)].copy()

st.subheader("📊 Base filtrada")
c1, c2, c3, c4 = st.columns(4)
c1.metric("Agenda (registros)", f"{len(df_ag_f):,}".replace(",", "."))
c2.metric("Cidades na agenda", f"{df_ag_f['city_key'].nunique()}")
c3.metric("Clientes carteira (rep)", f"{df_ca_rep['COD_CLIENTE'].nunique():,}".replace(",", "."))
c4.metric("Raio", f"{radius} km")

if df_ag_f.empty:
    st.warning("Sem registros na agenda no período.")
    st.stop()

# --- Carrega Geo
with st.spinner("Carregando coordenadas dos municípios..."):
    geo_all = load_geo()

# junta coords nas cidades base da agenda
base = (
    df_ag_f[["city_key"]].drop_duplicates()
    .merge(geo_all, on="city_key", how="left")
)

missing = int(base["latitude"].isna().sum())
if missing > 0:
    st.warning(f"{missing} cidade(s) da agenda não casaram com a base de coordenadas e serão ignoradas no cálculo.")

base = base.dropna(subset=["latitude", "longitude"]).copy()
if base.empty:
    st.error("Nenhuma cidade da agenda casou com coordenadas. Não dá pra calcular raio.")
    st.stop()

# --- Calcula união das cidades no raio + tabela df_raio
near_set = set()
lat_all = geo_all["latitude"].values
lon_all = geo_all["longitude"].values
key_all = geo_all["city_key"].values

rows_raio = []
for _, r in base.iterrows():
    lat1 = float(r["latitude"])
    lon1 = float(r["longitude"])
    d = haversine_vec(lat1, lon1, lat_all, lon_all)
    mask = d <= float(radius)
    keys = key_all[mask]
    dists = d[mask]
    for k, dist_km in zip(keys, dists):
        k = str(k)
        near_set.add(k)
        rows_raio.append({"CITY_BASE": str(r["city_key"]), "CITY_IN_RAIO": k, "DIST_KM": float(dist_km)})

df_raio = pd.DataFrame(rows_raio)
if not df_raio.empty:
    df_raio = df_raio.sort_values(["CITY_BASE", "DIST_KM"]).reset_index(drop=True)

# --- Filtra carteira dentro do raio
df_ca_in = df_ca_rep[df_ca_rep["city_key"].isin(near_set)].copy()

# --- Clientes atendidos (na agenda do período)
atendidos = set(df_ag_f["COD_CLIENTE"].astype(str).tolist())

# --- Gap: clientes que NÃO estão na agenda no período
df_gap = df_ca_in[~df_ca_in["COD_CLIENTE"].astype(str).isin(atendidos)].copy()

# dias sem compra (ref = dt_fim)
ref_dt = pd.to_datetime(pd.Timestamp(dt_fim))
df_gap["dias_sem_compra"] = (ref_dt - df_gap["DATA_ULT_COMPRA"]).dt.days
df_gap["dias_sem_compra"] = df_gap["dias_sem_compra"].fillna(99999).astype(int)

# ==============================
# RANKING + CITY STATS (Oportunidade por cidade)
# ==============================
if "Vlr Venda" in df_gap.columns:
    df_gap["Vlr Venda"] = pd.to_numeric(df_gap["Vlr Venda"], errors="coerce").fillna(0.0)
else:
    df_gap["Vlr Venda"] = 0.0

ranking = (
    df_gap.groupby("city_key", as_index=False)
    .agg(
        clientes=("COD_CLIENTE", "count"),
        dias_media=("dias_sem_compra", "mean"),
        dias_max=("dias_sem_compra", "max"),
        vlr_total=("Vlr Venda", "sum"),
    )
)
ranking["score"] = ranking["clientes"] * ranking["dias_media"]
ranking = ranking.sort_values("score", ascending=False).reset_index(drop=True)

# Oportunidade (pode mexer aqui se quiser mais “comercial”):
# op_score = 0.55*(clientes_norm) + 0.35*(dias_norm) + 0.10*(vlr_norm)
tmp = ranking.copy()
tmp["clientes_n"] = minmax_scale(tmp["clientes"])
tmp["dias_n"] = minmax_scale(tmp["dias_media"])
tmp["vlr_n"] = minmax_scale(tmp["vlr_total"])
tmp["op_score"] = (0.55 * tmp["clientes_n"]) + (0.35 * tmp["dias_n"]) + (0.10 * tmp["vlr_n"])
city_stats = tmp[["city_key", "op_score", "clientes", "dias_media", "vlr_total"]].copy()

# ==============================
# OUTPUT TABELAS
# ==============================
st.subheader("🏆 Rota Campeã — Ranking de cidades no raio (mais oportunidade primeiro)")
st.caption("Score base = (qtd clientes sem atendimento) × (média de dias sem compra).")
st.dataframe(ranking, use_container_width=True, height=300)

st.subheader("🚫 Clientes sem atendimento dentro do raio (ordenado por dias sem compra)")
cols_show = [
    "COD_CLIENTE", "Razao Social", "Cidade", "Uf",
    "Data Ultima Compra", "dias_sem_compra",
    "Grupo Cliente", "Codigo Grupo Cliente",
    "Codigo Representante", "Supervisor",
    "Qtd Venda", "Vlr Venda"
]
cols_show = [c for c in cols_show if c in df_gap.columns]
df_gap_view = df_gap.sort_values("dias_sem_compra", ascending=False).reset_index(drop=True)
st.dataframe(df_gap_view[cols_show], use_container_width=True, height=520)

with st.expander("Ver cidades no raio (cidade-base → cidade encontrada → km)"):
    st.dataframe(df_raio, use_container_width=True, height=320)

# ==============================
# MAPA + ROTA TURBINADA
# ==============================
st.divider()
st.subheader("🗺️ Mapa — cidade da agenda + cidades-alvo (rota por ruas + prioridade + heatmap + Google Maps)")

# dependências
try:
    import folium
    from streamlit_folium import st_folium
    from folium.plugins import HeatMap
except Exception:
    st.error("Falta dependência do mapa. Instale: pip install folium streamlit-folium")
    st.stop()

# escolhe cidade base (da agenda filtrada)
bases_disponiveis = sorted(base["city_key"].astype(str).unique().tolist())
city_base_sel = st.selectbox("Cidade base (da agenda)", bases_disponiveis, index=0)

# Seleciona cidades alvo (híbrido: oportunidade + proximidade)
df_stops = pick_stops_hybrid(
    city_base=city_base_sel,
    df_raio=df_raio,
    city_stats=city_stats,
    n_stops=n_stops,
    w_op=w_op,
    w_dist=w_dist
)

if df_stops.empty:
    st.warning("Não consegui achar cidades próximas/oportunidade para essa base.")
    st.stop()

# monta pontos: base + stops
df_pts = (
    pd.DataFrame({"city_key": [city_base_sel] + df_stops["CITY_IN_RAIO"].tolist()})
    .merge(geo_all, on="city_key", how="left")
    .merge(city_stats[["city_key", "op_score", "clientes", "dias_media", "vlr_total"]], on="city_key", how="left")
)

df_pts["op_score"] = df_pts["op_score"].fillna(0.0)
df_pts["clientes"] = df_pts["clientes"].fillna(0.0)
df_pts["dias_media"] = df_pts["dias_media"].fillna(0.0)
df_pts["vlr_total"] = df_pts["vlr_total"].fillna(0.0)

df_pts = df_pts.dropna(subset=["latitude", "longitude"]).copy()
if len(df_pts) < 2:
    st.error("Não consegui coordenadas suficientes para montar o mapa/rota.")
    st.stop()

# define prioridade (cores) por quantis do op_score (só para os stops, não a base)
stops_only = df_pts[df_pts["city_key"] != city_base_sel].copy()
q33 = stops_only["op_score"].quantile(0.33) if not stops_only.empty else 0.0
q66 = stops_only["op_score"].quantile(0.66) if not stops_only.empty else 0.0

def prio_color(op):
    if op >= q66:
        return ("#1e9b4b", "ALTA")     # verde
    if op >= q33:
        return ("#f2b705", "MÉDIA")    # amarelo
    return ("#d62828", "BAIXA")        # vermelho

points = []
for _, r in df_pts.iterrows():
    key = str(r["city_key"])
    lat = float(r["latitude"])
    lon = float(r["longitude"])
    op = float(r["op_score"])
    if key == city_base_sel:
        color, prio = ("#111111", "BASE")
    else:
        color, prio = prio_color(op)
    points.append({
        "key": key,
        "lat": lat,
        "lon": lon,
        "op": op,
        "clientes": float(r["clientes"]),
        "dias_media": float(r["dias_media"]),
        "vlr_total": float(r["vlr_total"]),
        "color": color,
        "prio": prio
    })

# ordem da rota (comercial)
order = build_route_order(points, w_op=w_op, w_dist=w_dist)
points_ordered = [points[i] for i in order]

# tenta rota por ruas (OSRM)
rota_latlon = None
rota_modo = None
try:
    rota_latlon = osrm_route_geojson(points_ordered)
    rota_modo = "OSRM (por ruas, estilo Google Maps)"
except Exception:
    rota_latlon = [(p["lat"], p["lon"]) for p in points_ordered]
    rota_modo = "Linha reta (fallback — OSRM indisponível)"

# cria mapa
center_lat = float(points_ordered[0]["lat"])
center_lon = float(points_ordered[0]["lon"])
m = folium.Map(location=[center_lat, center_lon], zoom_start=7, control_scale=True)

# Heatmap (só stops)
heat_data = []
for p in points_ordered:
    if p["prio"] != "BASE":
        heat_data.append([p["lat"], p["lon"], float(p["op"])])
if len(heat_data) > 0:
    HeatMap(heat_data, radius=25, blur=18, min_opacity=0.25).add_to(m)

# Markers (CircleMarker por cor)
# Base
folium.CircleMarker(
    location=[points_ordered[0]["lat"], points_ordered[0]["lon"]],
    radius=10,
    color="#000000",
    fill=True,
    fill_color="#000000",
    fill_opacity=0.95,
    tooltip=f"BASE: {points_ordered[0]['key']}",
    popup=f"BASE: {points_ordered[0]['key']}"
).add_to(m)

# Stops
for idx, p in enumerate(points_ordered[1:], start=1):
    txt = (
        f"<b>PARADA {idx} — {p['key']}</b><br>"
        f"Prioridade: <b>{p['prio']}</b><br>"
        f"Oportunidade: {p['op']:.3f}<br>"
        f"Clientes: {p['clientes']:.0f}<br>"
        f"Dias médios sem compra: {p['dias_media']:.0f}<br>"
        f"Vlr total (hist): {p['vlr_total']:.2f}"
    )
    folium.CircleMarker(
        location=[p["lat"], p["lon"]],
        radius=8,
        color=p["color"],
        fill=True,
        fill_color=p["color"],
        fill_opacity=0.85,
        tooltip=f"PARADA {idx}: {p['key']} ({p['prio']})",
        popup=folium.Popup(txt, max_width=350)
    ).add_to(m)

# Rota desenhada
folium.PolyLine(locations=rota_latlon, weight=5, opacity=0.9).add_to(m)

# bounds
bounds = [[p["lat"], p["lon"]] for p in points_ordered]
m.fit_bounds(bounds)

st.caption(f"Rota desenhada usando: **{rota_modo}** | Pesos: Oportunidade={w_op:.2f}, Distância={w_dist:.2f}")
st_folium(m, use_container_width=True, height=650)

# tabela da ordem da rota
df_ord = pd.DataFrame({
    "ORDEM": list(range(len(points_ordered))),
    "TIPO": ["BASE"] + [f"PARADA {i}" for i in range(1, len(points_ordered))],
    "PRIORIDADE": [p["prio"] for p in points_ordered],
    "CIDADE": [p["key"] for p in points_ordered],
    "OP_SCORE": [p["op"] for p in points_ordered],
    "CLIENTES": [p["clientes"] for p in points_ordered],
    "DIAS_MEDIA": [p["dias_media"] for p in points_ordered],
    "VLR_TOTAL": [p["vlr_total"] for p in points_ordered],
    "LAT": [p["lat"] for p in points_ordered],
    "LON": [p["lon"] for p in points_ordered],
})
st.subheader("🧭 Ordem sugerida da rota (comercial)")
st.dataframe(df_ord, use_container_width=True, height=280)

# ==============================
# DIVISÃO EM DIAS + GOOGLE MAPS LINKS
# ==============================
st.subheader("📅 Roteiro por dia + abrir no Google Maps")

# divide APENAS as paradas (sem a base), e recoloca base no começo de cada dia
stops = points_ordered[1:]
dias = int(dias)
dias = max(1, min(dias, 7))

chunks = chunk_list(stops, dias)

roteiros = []
for d, chunk in enumerate(chunks, start=1):
    day_points = [points_ordered[0]] + chunk  # base + paradas do dia
    gmaps = google_maps_dir_url(day_points)

    roteiros.append({
        "DIA": d,
        "PARADAS": len(chunk),
        "CIDADES": " → ".join([p["key"] for p in day_points]),
        "GOOGLE_MAPS_URL": gmaps
    })

df_days = pd.DataFrame(roteiros)
st.dataframe(df_days[["DIA", "PARADAS", "CIDADES"]], use_container_width=True, height=220)

for _, r in df_days.iterrows():
    st.markdown(f"**Dia {int(r['DIA'])}** — {int(r['PARADAS'])} paradas  \n➡️ [Abrir no Google Maps]({r['GOOGLE_MAPS_URL']})")

# (opcional) baixar roteiro
csv_bytes = df_days.to_csv(index=False).encode("utf-8")
st.download_button("⬇️ Baixar roteiro por dia (CSV)", data=csv_bytes, file_name="roteiro_por_dia.csv", mime="text/csv")