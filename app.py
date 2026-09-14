# -*- coding: utf-8 -*-
"""
Rota Campeã Automática
-----------------------
Fluxo, em ordem:

    1) Regional
    2) Representante
    3) Cidade base
    4) Sugestões de rota (mapa + ordem + roteiro por dia)
    5) Clientes sem compra nas cidades da rota
    6) Clique num cliente -> roda a Preditiva só daquele cliente

Não depende de Agenda (ListaAtendimentos.xlsx) nem de upload manual de
Carteira (lida direto de um arquivo fixo em disco, ver CARTEIRA_PATH).

A base Preditiva (bem maior que a Carteira) NÃO é carregada de cara — só é
baixada quando o usuário seleciona um cliente na tabela do passo 5, e nesse
momento é filtrada para o histórico de UM único cliente antes de qualquer
cálculo. É isso que mantém o carregamento inicial leve e rápido.

Rode com:
    streamlit run rota_certa/app_rotas.py
"""
import os
import sys
from datetime import date, datetime

import numpy as np
import pandas as pd
import streamlit as st

# Garante que a pasta raiz do projeto (onde fica o pacote "common") está no
# sys.path, independente de onde o comando "streamlit run" for executado.
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, PROJECT_ROOT)

from common.text_utils import norm, safe_str
from common.file_utils import read_carteira_weird_excel
from common.geo import haversine_vec, load_geo
from rota_certa.preditiva_signal import (
    calcular_sinal_preditiva,
    carregar_dados_preditiva,
    filtrar_por_cliente,
)
from rota_certa.routing import (
    build_route_order,
    chunk_by_size,
    google_maps_dir_url,
    minmax_scale,
    osrm_route_geojson,
    pick_stops_hybrid,
)

# Arquivo fixo da Carteira — substitua este arquivo quando quiser atualizar
# os dados, sem precisar mexer no código nem fazer upload pela tela.
CARTEIRA_PATH = os.path.join(PROJECT_ROOT, "rota_certa", "_legado", "base clientes.xlsx")

# ==============================
# CONFIG
# ==============================
st.set_page_config(page_title="🔥 Rota Campeã Automática", layout="wide")

# ==============================
# STREAMLIT
# ==============================
st.title("🔥 ROTA CAMPEÃ AUTOMÁTICA")

if not os.path.exists(CARTEIRA_PATH):
    st.error(f"Arquivo de Carteira não encontrado em: {CARTEIRA_PATH}")
    st.stop()

data_mod = datetime.fromtimestamp(os.path.getmtime(CARTEIRA_PATH))
st.caption(f"📁 Carteira carregada de `{CARTEIRA_PATH}` — atualizada em {data_mod:%d/%m/%Y %H:%M}.")

# --- Carteira
df_ca = read_carteira_weird_excel(CARTEIRA_PATH)

need_ca = [
    "Codigo Cliente", "Cidade", "Uf", "Data Ultima Compra",
    "Codigo Representante", "Representante", "Supervisor", "Razao Social",
]
missing_ca = [c for c in need_ca if c not in df_ca.columns]
if missing_ca:
    st.error(f"A carteira está sem colunas obrigatórias: {missing_ca}")
    st.stop()

df_ca["COD_CLIENTE"] = df_ca["Codigo Cliente"].astype(str).str.strip().str.upper()
df_ca["Cidade"] = df_ca["Cidade"].apply(safe_str)
df_ca["Uf"] = df_ca["Uf"].apply(safe_str)
df_ca["city_key"] = df_ca["Cidade"].apply(norm) + " - " + df_ca["Uf"].apply(norm)
df_ca["DATA_ULT_COMPRA"] = pd.to_datetime(df_ca["Data Ultima Compra"], errors="coerce")

# ==============================
# 1) REGIONAL  →  2) REPRESENTANTE
# ==============================
st.sidebar.header("🎯 Filtros")

regional_list = sorted(df_ca["Supervisor"].dropna().astype(str).unique().tolist())
regional_sel = st.sidebar.selectbox("1️⃣ Regional", regional_list)
df_ca_regional = df_ca[df_ca["Supervisor"].astype(str).str.strip() == str(regional_sel)].copy()

rep_opcoes = (
    df_ca_regional[["Codigo Representante", "Representante"]]
    .drop_duplicates()
    .assign(_label=lambda d: d["Codigo Representante"].astype(str).str.strip() + " - " + d["Representante"].astype(str).str.strip())
    .sort_values("_label")
)
rep_label_sel = st.sidebar.selectbox("2️⃣ Representante", rep_opcoes["_label"].tolist())
rep_sel = rep_label_sel.split(" - ", 1)[0].strip()

df_ca_rep = df_ca_regional[df_ca_regional["Codigo Representante"].astype(str).str.strip() == str(rep_sel)].copy()

dt_ref = st.sidebar.date_input("Data de referência (para dias sem compra)", value=date.today())
radius = st.sidebar.slider("Raio (km)", 50, 300, 100, 10)

st.sidebar.divider()
st.sidebar.subheader("🚀 Turbo da rota")
n_stops = st.sidebar.slider("Quantidade de cidades-alvo", 5, 30, 10, 1)
max_clientes_dia = st.sidebar.slider(
    "Máximo de clientes atendidos por dia", 1, 4, 4, 1,
    help="O roteiro por dia (passo 4) divide os clientes-alvo das cidades da rota em dias, respeitando esse máximo.",
)

w_op = st.sidebar.slider("Peso Oportunidade", 0.0, 1.0, 0.65, 0.05)
w_dist = st.sidebar.slider("Peso Distância", 0.0, 1.0, 0.35, 0.05)
if (w_op + w_dist) == 0:
    w_op, w_dist = 0.5, 0.5
else:
    s = w_op + w_dist
    w_op, w_dist = w_op / s, w_dist / s

st.sidebar.divider()
st.sidebar.subheader("🚫 Clientes sem compra")
dias_min = st.sidebar.slider("Dias mínimos sem compra para considerar cliente", 0, 365, 30, 5)

st.subheader("📊 Base filtrada")
st.caption(f"Regional: **{regional_sel}** → Representante: **{rep_label_sel}**")
c1, c2, c3 = st.columns(3)
c1.metric("Clientes carteira (rep)", f"{df_ca_rep['COD_CLIENTE'].nunique():,}".replace(",", "."))
c2.metric("Cidades carteira (rep)", f"{df_ca_rep['city_key'].nunique()}")
c3.metric("Raio", f"{radius} km")

if df_ca_rep.empty:
    st.warning("Sem clientes na carteira para esse representante.")
    st.stop()

# --- Carrega Geo
with st.spinner("Carregando coordenadas dos municípios..."):
    geo_all = load_geo()

# ==============================
# 3) CIDADE BASE
# ==============================
bases_disponiveis = sorted(
    set(df_ca_rep["city_key"].astype(str).unique().tolist()) & set(geo_all["city_key"].astype(str).unique().tolist())
)
if not bases_disponiveis:
    st.error("Nenhuma cidade da carteira desse representante casou com a base de coordenadas.")
    st.stop()

city_base_sel = st.selectbox("3️⃣ Cidade base (ponto de partida da rota)", bases_disponiveis, index=0)

base = geo_all[geo_all["city_key"] == city_base_sel].head(1).copy()

# --- Calcula cidades dentro do raio a partir da cidade base
lat_all = geo_all["latitude"].values
lon_all = geo_all["longitude"].values
key_all = geo_all["city_key"].values

lat1 = float(base["latitude"].iloc[0])
lon1 = float(base["longitude"].iloc[0])
d = haversine_vec(lat1, lon1, lat_all, lon_all)
mask = d <= float(radius)

df_raio = pd.DataFrame({
    "CITY_BASE": city_base_sel,
    "CITY_IN_RAIO": key_all[mask].astype(str),
    "DIST_KM": d[mask].astype(float),
}).sort_values("DIST_KM").reset_index(drop=True)

near_set = set(df_raio["CITY_IN_RAIO"].tolist())

# --- Carteira dentro do raio (ainda sem cruzar com Preditiva — isso só
# acontece por cliente, no passo 6)
df_ca_in = df_ca_rep[df_ca_rep["city_key"].isin(near_set)].copy()

if df_ca_in.empty:
    st.warning("Nenhum cliente da carteira dentro desse raio.")
    st.stop()

# dias sem compra (ref = data de referência escolhida) — usado tanto pro
# ranking de cidades quanto pra tabela de clientes sem compra do passo 5
ref_dt = pd.to_datetime(pd.Timestamp(dt_ref))
df_ca_in["dias_sem_compra"] = (ref_dt - df_ca_in["DATA_ULT_COMPRA"]).dt.days
df_ca_in["dias_sem_compra"] = df_ca_in["dias_sem_compra"].fillna(99999).astype(int)

if "Vlr Venda" in df_ca_in.columns:
    df_ca_in["Vlr Venda"] = pd.to_numeric(df_ca_in["Vlr Venda"], errors="coerce").fillna(0.0)
else:
    df_ca_in["Vlr Venda"] = 0.0

# ==============================
# RANKING + CITY STATS (Oportunidade por cidade, só com dados da Carteira)
# ==============================
ranking = (
    df_ca_in.groupby("city_key", as_index=False)
    .agg(
        clientes=("COD_CLIENTE", "count"),
        dias_media=("dias_sem_compra", "mean"),
        dias_max=("dias_sem_compra", "max"),
        vlr_total=("Vlr Venda", "sum"),
    )
)
ranking["score"] = ranking["clientes"] * ranking["dias_media"]
ranking = ranking.sort_values("score", ascending=False).reset_index(drop=True)

tmp = ranking.copy()
tmp["clientes_n"] = minmax_scale(tmp["clientes"])
tmp["dias_n"] = minmax_scale(tmp["dias_media"])
tmp["vlr_n"] = minmax_scale(tmp["vlr_total"])
tmp["op_score"] = (0.55 * tmp["clientes_n"]) + (0.35 * tmp["dias_n"]) + (0.10 * tmp["vlr_n"])
city_stats = tmp[["city_key", "op_score", "clientes", "dias_media", "vlr_total"]].copy()

st.subheader("🏆 Ranking de cidades no raio (mais oportunidade primeiro)")
st.caption("Score = (qtd clientes) × (média de dias sem compra), com base só na Carteira.")
st.dataframe(ranking, use_container_width=True, height=260)

with st.expander("Ver cidades no raio (cidade-base → cidade encontrada → km)"):
    st.dataframe(df_raio, use_container_width=True, height=320)

# ==============================
# 4) SUGESTÕES DE ROTA — MAPA + ORDEM + ROTEIRO POR DIA
# ==============================
st.divider()
st.subheader("4️⃣ 🗺️ Sugestões de rota (mapa + prioridade + heatmap + Google Maps)")

try:
    import folium
    from folium.plugins import HeatMap
    from streamlit_folium import st_folium
except Exception:
    st.error("Falta dependência do mapa. Instale: pip install folium streamlit-folium")
    st.stop()

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

order = build_route_order(points, w_op=w_op, w_dist=w_dist)
points_ordered = [points[i] for i in order]

# --- Clientes-alvo (sem compra) nas cidades da rota, já sequenciados na
# mesma ordem de visita das cidades — usado tanto pro roteiro por dia
# (que respeita o máximo de clientes/dia) quanto pra tabela do passo 5.
cidades_da_rota = {p["key"] for p in points_ordered}
df_alvo = df_ca_in[df_ca_in["city_key"].isin(cidades_da_rota)].copy()
df_alvo = df_alvo[df_alvo["dias_sem_compra"] >= int(dias_min)].copy()

ordem_cidade = {p["key"]: i for i, p in enumerate(points_ordered) if p["key"] != city_base_sel}
df_alvo["_ordem_cidade"] = df_alvo["city_key"].map(ordem_cidade).fillna(9999).astype(int)
df_alvo_view = (
    df_alvo.sort_values(["_ordem_cidade", "dias_sem_compra"], ascending=[True, False])
    .drop(columns=["_ordem_cidade"])
    .reset_index(drop=True)
)

rota_latlon = None
rota_modo = None
try:
    rota_latlon = osrm_route_geojson(points_ordered)
    rota_modo = "OSRM (por ruas, estilo Google Maps)"
except Exception:
    rota_latlon = [(p["lat"], p["lon"]) for p in points_ordered]
    rota_modo = "Linha reta (fallback — OSRM indisponível)"

center_lat = float(points_ordered[0]["lat"])
center_lon = float(points_ordered[0]["lon"])
m = folium.Map(location=[center_lat, center_lon], zoom_start=7, control_scale=True)

heat_data = []
for p in points_ordered:
    if p["prio"] != "BASE":
        heat_data.append([p["lat"], p["lon"], float(p["op"])])
if len(heat_data) > 0:
    HeatMap(heat_data, radius=25, blur=18, min_opacity=0.25).add_to(m)

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

folium.PolyLine(locations=rota_latlon, weight=5, opacity=0.9).add_to(m)

bounds = [[p["lat"], p["lon"]] for p in points_ordered]
m.fit_bounds(bounds)

st.caption(f"Rota desenhada usando: **{rota_modo}** | Pesos: Oportunidade={w_op:.2f}, Distância={w_dist:.2f}")
st_folium(m, use_container_width=True, height=650)

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

st.subheader(f"📅 Roteiro por dia (máx. {max_clientes_dia} clientes/dia) + abrir no Google Maps")

cols_show = [
    "COD_CLIENTE", "Razao Social", "Cidade", "Uf",
    "Data Ultima Compra", "dias_sem_compra",
    "Grupo Cliente", "Codigo Grupo Cliente",
    "Qtd Venda", "Vlr Venda",
]
cols_show = [c for c in cols_show if c in df_alvo_view.columns]

if df_alvo_view.empty:
    st.info(
        "Nenhum cliente sem compra (dentro do mínimo de dias configurado) nas cidades desta rota — "
        "sem clientes pra dividir em roteiro por dia."
    )
    df_days = pd.DataFrame(columns=["DIA", "CLIENTES", "CIDADES", "GOOGLE_MAPS_URL"])
else:
    city_coords = {p["key"]: (p["lat"], p["lon"]) for p in points_ordered}
    clientes_ordenados = df_alvo_view.to_dict("records")
    chunks_clientes = chunk_by_size(clientes_ordenados, max_clientes_dia)

    dia_por_cliente = {}
    roteiros = []
    for dnum, chunk in enumerate(chunks_clientes, start=1):
        cidades_dia = []
        for c in chunk:
            ck = c["city_key"]
            if ck not in cidades_dia:
                cidades_dia.append(ck)
            dia_por_cliente[c["COD_CLIENTE"]] = dnum

        day_points = [{"lat": points_ordered[0]["lat"], "lon": points_ordered[0]["lon"]}] + [
            {"lat": city_coords[ck][0], "lon": city_coords[ck][1]} for ck in cidades_dia if ck in city_coords
        ]
        gmaps = google_maps_dir_url(day_points)
        roteiros.append({
            "DIA": dnum,
            "CLIENTES": len(chunk),
            "CIDADES": " → ".join(cidades_dia),
            "GOOGLE_MAPS_URL": gmaps,
        })

    df_days = pd.DataFrame(roteiros)
    df_alvo_view["DIA_SUGERIDO"] = df_alvo_view["COD_CLIENTE"].map(dia_por_cliente)
    if "DIA_SUGERIDO" not in cols_show:
        cols_show = ["DIA_SUGERIDO"] + cols_show

    st.dataframe(df_days[["DIA", "CLIENTES", "CIDADES"]], use_container_width=True, height=220)
    for _, r in df_days.iterrows():
        st.markdown(f"**Dia {int(r['DIA'])}** — {int(r['CLIENTES'])} clientes ({r['CIDADES']})  \n➡️ [Abrir no Google Maps]({r['GOOGLE_MAPS_URL']})")

    csv_bytes = df_days.to_csv(index=False).encode("utf-8")
    st.download_button("⬇️ Baixar roteiro por dia (CSV)", data=csv_bytes, file_name="roteiro_por_dia.csv", mime="text/csv")

# ==============================
# 5) CLIENTES SEM COMPRA NAS CIDADES DA ROTA
# ==============================
st.divider()
st.subheader("5️⃣ 🚫 Clientes sem compra nas cidades da rota")

if df_alvo_view.empty:
    st.info("Nenhum cliente sem compra (dentro do mínimo de dias configurado) nas cidades desta rota.")
    st.stop()

st.caption("💡 Selecione um cliente na lista abaixo OU clique numa linha da tabela pra rodar a Preditiva dele (passo 6).")

opcao_vazia = "— selecione um cliente —"
opcoes_cliente = [opcao_vazia] + [
    f"{r['COD_CLIENTE']} - {r.get('Razao Social', '')}" for _, r in df_alvo_view.iterrows()
]
cliente_sel_combo = st.selectbox("🔮 Cliente para rodar a Preditiva", opcoes_cliente, key="combo_cliente_preditiva")

evento = st.dataframe(
    df_alvo_view[cols_show],
    use_container_width=True,
    height=420,
    on_select="rerun",
    selection_mode="single-row",
    key="tabela_clientes_sem_compra",
)

# ==============================
# 6) CLIENTE ESCOLHIDO (lista ou clique na tabela) → RODA A PREDITIVA DELE
# ==============================
linhas_sel = list(evento.selection.rows) if evento and evento.selection else []

cod_cliente_sel = None
nome_cliente_sel = None
if cliente_sel_combo != opcao_vazia:
    cod_cliente_sel, _, nome_cliente_sel = cliente_sel_combo.partition(" - ")
    cod_cliente_sel = cod_cliente_sel.strip()
    nome_cliente_sel = nome_cliente_sel.strip() or cod_cliente_sel
elif linhas_sel:
    cliente_row = df_alvo_view.iloc[linhas_sel[0]]
    cod_cliente_sel = str(cliente_row["COD_CLIENTE"])
    nome_cliente_sel = str(cliente_row.get("Razao Social", cod_cliente_sel))

if cod_cliente_sel:
    st.divider()
    st.subheader(f"6️⃣ 🔮 Preditiva do cliente: {cod_cliente_sel} - {nome_cliente_sel}")

    with st.spinner("Carregando histórico da Preditiva desse cliente... (só na primeira vez pode levar até ~1-2 min)"):
        try:
            df_pred_raw = carregar_dados_preditiva()
            df_pred_cliente = filtrar_por_cliente(df_pred_raw, cod_cliente_sel)
            df_sinal_cliente = calcular_sinal_preditiva(df_pred_cliente, hoje=dt_ref)
        except Exception as e:
            df_sinal_cliente = None
            st.warning(f"Não consegui carregar a Preditiva desse cliente agora ({e}).")

    if df_sinal_cliente is not None:
        if df_sinal_cliente.empty:
            st.info("Esse cliente não tem histórico na base Preditiva.")
        else:
            row = df_sinal_cliente.iloc[0]
            pc1, pc2, pc3, pc4 = st.columns(4)
            pc1.metric("Dias sem compra (hist. Preditiva)", f"{int(row['dias_sem_compra_hist']):,}".replace(",", "."))
            pc2.metric("Valor histórico total", f"R$ {row['vlr_total_hist']:,.2f}".replace(",", "X").replace(".", ",").replace("X", "."))
            pc3.metric("% valor na estação vigente", f"{row['pct_valor_estacao_vigente']*100:.0f}%")
            pc4.metric("Sinal Preditiva (0-1)", f"{row['sinal_preditiva']:.2f}")
            st.caption(
                "Sinal Preditiva combina recência histórica de compra com o quanto esse cliente costuma "
                "comprar na estação/coleção vigente (Verão/Inverno). Pra análise completa (produtos, "
                "condições de venda, previsão por linha), use o app Preditiva."
            )
else:
    st.caption("Nenhum cliente selecionado ainda.")