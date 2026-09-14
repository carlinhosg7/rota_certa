# ============================================================
# KIDY - INTELIGÊNCIA COMERCIAL + ROTA CAMPEÃ + ANÁLISE CLIENTE
# União de: Rotas_correto1.py + app6.py
#
# Fluxo:
# Supervisor -> Representante -> Cidade base -> Sugestão de rota
# -> Clientes das cidades da rota -> Status comercial (vermelho/amarelo/verde)
# -> Clique no cliente -> Análise comercial completa
# ============================================================

import os
import unicodedata
from datetime import datetime
from io import BytesIO, StringIO
from urllib.parse import quote
from pathlib import Path

import numpy as np
import pandas as pd
import requests
import streamlit as st
from PIL import Image

# Dependências de mapa
try:
    import folium
    from folium.plugins import HeatMap
    from streamlit_folium import st_folium
    MAPA_OK = True
except Exception:
    MAPA_OK = False

# ============================================================
# CONFIGURAÇÃO
# ============================================================
st.set_page_config(
    page_title="Inteligência Comercial + Rota Campeã",
    page_icon="📍",
    layout="wide",
    initial_sidebar_state="expanded",
)

MUNICIPIOS_URL = "https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/csv/municipios.csv"
ESTADOS_URL = "https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/csv/estados.csv"

URL_LOGO = "https://raw.githubusercontent.com/carlinhosg7/streamlit02/main/logo_kidy.png"
URL_LINHAS_XLSX = "https://github.com/carlinhosg7/streamlit02/raw/main/DADOS%20PREDITIVA%20LINHAS.xlsx"
URL_CATEGORIAS = "https://raw.githubusercontent.com/carlinhosg7/streamlit02/main/CATEGORIAS.csv"

# Bases locais do Kidy Suite (Windows)
PASTA_ROTA_CERTA = Path(r"D:\kidy_suite\rota_certa")
ARQUIVO_CARTEIRA = PASTA_ROTA_CERTA / "base clientes.xlsx"
PASTA_PREDITIVA = Path(r"D:\kidy_suite\preditiva")
PADRAO_PREDITIVA = "DADOS_PREDITIVA_*.parquet"

MAPA_SUPERVISORES = {
    "9902": "Centro Oeste",
    "9907": "Sul",
    "9914": "Norte / Nordeste",
    "9915": "REM",
    "9916": "SPC",
    "9917": "SPI",
}

MESES_PT = {
    1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril",
    5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
    9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro",
}

# ============================================================
# CSS
# ============================================================
st.markdown(
    """
    <style>
        .block-container {padding-top: 1.4rem; padding-bottom: 3rem;}
        .kpi-card {
            background: #202124;
            border: 1px solid rgba(247,164,0,.25);
            border-radius: 12px;
            padding: 14px 16px;
            min-height: 92px;
        }
        .kpi-label {font-size: 12px; color: #bbb; margin-bottom: 6px;}
        .kpi-value {font-size: 22px; font-weight: 700; color: #f7a400;}
        .status-red {background:#5d1117; border-left:6px solid #ff3344; padding:10px 14px; border-radius:8px;}
        .status-yellow {background:#5b4a08; border-left:6px solid #ffd43b; padding:10px 14px; border-radius:8px;}
        .status-green {background:#0f4d2e; border-left:6px solid #36d977; padding:10px 14px; border-radius:8px;}
        div[data-testid="stMetric"] {border: 1px solid rgba(255,255,255,.08); padding: 8px; border-radius: 10px;}
        div[data-testid="stMetricLabel"] p {font-size: 0.78rem !important;}
        div[data-testid="stMetricValue"] {font-size: 1.55rem !important; line-height: 1.15 !important;}
    </style>
    """,
    unsafe_allow_html=True,
)

# ============================================================
# FUNÇÕES BASE
# ============================================================
def norm(x):
    if x is None or pd.isna(x):
        return ""
    x = str(x).strip()
    x = unicodedata.normalize("NFKD", x)
    x = "".join(c for c in x if not unicodedata.combining(c))
    return x.upper().strip()


def clean_code(x):
    if x is None or pd.isna(x):
        return ""
    s = str(x).strip()
    if s.endswith(".0"):
        s = s[:-2]
    return s.lstrip("0") or "0"


def clean_supervisor(x):
    if x is None or pd.isna(x):
        return ""
    s = str(x).strip()
    if s.endswith(".0"):
        s = s[:-2]
    return s


def brl(x):
    try:
        return f"R$ {float(x):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return "R$ 0,00"


def safe_date(x):
    if pd.isna(x):
        return "Sem compra"
    return pd.to_datetime(x).strftime("%d/%m/%Y")


def find_column(df, candidates):
    # 1) match exato normalizado
    lookup = {norm(c).replace(" ", ""): c for c in df.columns}
    for cand in candidates:
        key = norm(cand).replace(" ", "")
        if key in lookup:
            return lookup[key]
    # 2) contains
    for cand in candidates:
        ck = norm(cand).replace(" ", "")
        for c in df.columns:
            nk = norm(c).replace(" ", "")
            if ck in nk or nk in ck:
                return c
    return None


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


def minmax_scale(s):
    s = pd.to_numeric(s, errors="coerce").fillna(0.0)
    if len(s) == 0 or s.max() == s.min():
        return pd.Series(np.zeros(len(s)), index=s.index, dtype="float64")
    return (s - s.min()) / (s.max() - s.min())


def osrm_route_geojson(points):
    coord_str = ";".join([f"{p['lon']},{p['lat']}" for p in points])
    url = f"https://router.project-osrm.org/route/v1/driving/{coord_str}"
    params = {"overview": "full", "geometries": "geojson", "steps": "false"}
    r = requests.get(url, params=params, timeout=30)
    r.raise_for_status()
    data = r.json()
    if "routes" not in data or not data["routes"]:
        raise ValueError("OSRM sem rotas retornadas.")
    coords = data["routes"][0]["geometry"]["coordinates"]
    return [(lat, lon) for lon, lat in coords]


def google_maps_dir_url(points):
    parts = [f"{p['lat']:.6f},{p['lon']:.6f}" for p in points]
    return "https://www.google.com/maps/dir/" + "/".join(quote(p) for p in parts)


def build_route_order(points, w_op=0.70, w_dist=0.30):
    """Base fixa no índice 0; próximos pontos combinam distância + oportunidade."""
    if len(points) <= 2:
        return list(range(len(points)))

    coords = np.array([(p["lat"], p["lon"]) for p in points], dtype="float64")
    op = np.array([p.get("op", 0.0) for p in points], dtype="float64")

    if op.max() != op.min():
        op_norm = (op - op.min()) / (op.max() - op.min())
    else:
        op_norm = np.zeros_like(op)

    n = len(points)
    visited = np.zeros(n, dtype=bool)
    order = [0]
    visited[0] = True

    for _ in range(n - 1):
        i = order[-1]
        d = haversine_vec(coords[i, 0], coords[i, 1], coords[:, 0], coords[:, 1])
        d[visited] = np.inf
        finite = np.isfinite(d)
        d_norm = d.copy()
        if finite.any():
            dmin, dmax = d[finite].min(), d[finite].max()
            d_norm[finite] = 0 if dmax == dmin else (d[finite] - dmin) / (dmax - dmin)

        cost = (w_dist * d_norm) - (w_op * op_norm)
        cost[visited] = np.inf
        j = int(np.argmin(cost))
        order.append(j)
        visited[j] = True

    return order


@st.cache_data(ttl=3600, show_spinner=False)
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
    geo = df_m.merge(df_e[["codigo_uf", "uf"]], on="codigo_uf", how="left")
    geo["latitude"] = pd.to_numeric(geo.get("latitude"), errors="coerce")
    geo["longitude"] = pd.to_numeric(geo.get("longitude"), errors="coerce")
    geo = geo.dropna(subset=["nome", "uf", "latitude", "longitude"]).copy()
    geo["city_key"] = geo["nome"].apply(norm) + " - " + geo["uf"].apply(norm)
    geo = geo.drop_duplicates("city_key")
    return geo[["city_key", "latitude", "longitude"]].copy()


@st.cache_data(ttl=3600, show_spinner=False)
def carregar_vendas():
    """Carrega todos os DADOS_PREDITIVA_*.parquet da pasta local, em linhas."""
    cols_base = [
        "Codigo Cliente", "Razao Social", "Codigo Grupo Cliente", "Grupo Cliente",
        "Codigo Representante", "Codigo Supervisor", "Numero Pedido",
        "Data Cadastro", "Data Ultima Compra", "Codigo Linha", "Linha",
        "Referencia", "Prazo Medio", "Qtd Venda", "Vlr Venda"
    ]

    if not PASTA_PREDITIVA.exists():
        raise ValueError(f"Pasta da preditiva não encontrada: {PASTA_PREDITIVA}")

    arquivos = sorted(PASTA_PREDITIVA.glob(PADRAO_PREDITIVA))
    if not arquivos:
        # tolera extensão digitada/gerada como .parque, caso exista
        arquivos = sorted(PASTA_PREDITIVA.glob("DADOS_PREDITIVA_*.parque"))

    if not arquivos:
        raise ValueError(
            f"Nenhum arquivo DADOS_PREDITIVA_*.parquet encontrado em {PASTA_PREDITIVA}"
        )

    partes = []
    for arquivo in arquivos:
        try:
            d = pd.read_parquet(arquivo)
        except Exception as e:
            raise ValueError(f"Erro ao ler {arquivo.name}: {e}") from e

        # Usa somente as colunas originais. Ignora Codigo Cliente_1, _2 etc.
        existentes = [c for c in cols_base if c in d.columns]
        if not existentes:
            continue
        parte = d[existentes].copy()
        parte["Arquivo Origem"] = arquivo.name
        partes.append(parte)

    if not partes:
        raise ValueError(
            "Os arquivos Parquet foram encontrados, mas nenhum possui as colunas principais do app6."
        )

    # IMPORTANTE: concatenação vertical (linhas), nunca horizontal (colunas).
    df = pd.concat(partes, ignore_index=True, sort=False)

    obrigatorias = [
        "Codigo Representante", "Codigo Supervisor", "Codigo Cliente",
        "Razao Social", "Data Cadastro", "Qtd Venda", "Vlr Venda"
    ]
    faltando = [c for c in obrigatorias if c not in df.columns]
    if faltando:
        raise ValueError(f"Parquets sem colunas obrigatórias: {faltando}")

    df["Codigo Representante"] = df["Codigo Representante"].apply(clean_code)
    df["Codigo Supervisor"] = df["Codigo Supervisor"].apply(clean_supervisor)
    df["Codigo Cliente"] = df["Codigo Cliente"].astype(str).str.strip().str.upper()
    df["Razao Social"] = df["Razao Social"].astype(str).str.strip()
    df["Data Cadastro"] = pd.to_datetime(df["Data Cadastro"], errors="coerce")
    if "Data Ultima Compra" in df.columns:
        df["Data Ultima Compra"] = pd.to_datetime(df["Data Ultima Compra"], errors="coerce")
    else:
        df["Data Ultima Compra"] = pd.NaT
    df["Qtd Venda"] = pd.to_numeric(df["Qtd Venda"], errors="coerce").fillna(0)
    df["Vlr Venda"] = pd.to_numeric(df["Vlr Venda"], errors="coerce").fillna(0.0)

    for c in ["Codigo Grupo Cliente", "Grupo Cliente", "Linha", "Referencia", "Codigo Linha"]:
        if c not in df.columns:
            df[c] = ""

    df["Codigo Grupo Cliente"] = df["Codigo Grupo Cliente"].astype(str).str.strip().str.upper()
    df["Grupo Cliente"] = df["Grupo Cliente"].astype(str).str.strip()
    df["Linha"] = df["Linha"].astype(str).str.strip()
    df["Preço Médio Produto"] = np.where(df["Qtd Venda"] > 0, df["Vlr Venda"] / df["Qtd Venda"], 0)
    df.attrs["arquivos_origem"] = [a.name for a in arquivos]
    return df


def _normaliza_nome_coluna(c):
    x = unicodedata.normalize("NFKD", str(c)).encode("ASCII", "ignore").decode("utf-8")
    return " ".join(x.strip().lower().replace("_", " ").split())


def _mapear_colunas_carteira(df):
    mapa = {_normaliza_nome_coluna(c): c for c in df.columns}

    def achar(candidatos):
        for cand in candidatos:
            k = _normaliza_nome_coluna(cand)
            if k in mapa:
                return mapa[k]
        return None

    return {
        "Codigo Cliente": achar(["Codigo Cliente", "Código Cliente", "Cod Cliente", "Cliente"]),
        "Razao Social": achar(["Razao Social", "Razão Social", "Nome Cliente", "Cliente Nome"]),
        "Cidade": achar(["Cidade", "Municipio", "Município", "Cidade Cliente"]),
        "Uf": achar(["Uf", "UF", "Estado", "UF Cliente"]),
        "Codigo Representante": achar(["Codigo Representante", "Código Representante", "Cod Representante", "Representante", "Rep"]),
        "Codigo Supervisor": achar(["Codigo Supervisor", "Código Supervisor", "Cod Supervisor", "Supervisor"]),
    }


def _ler_carteira_excel_bytes(conteudo):
    """Procura automaticamente a aba e a linha de cabeçalho da carteira."""
    bio = BytesIO(conteudo)
    xls = pd.ExcelFile(bio, engine="openpyxl")
    melhor = None

    for aba in xls.sheet_names:
        for header in range(0, 12):
            try:
                bio.seek(0)
                t = pd.read_excel(bio, sheet_name=aba, header=header, engine="openpyxl")
                cols = _mapear_colunas_carteira(t)
                essenciais = [cols["Codigo Cliente"], cols["Cidade"], cols["Uf"], cols["Codigo Representante"]]
                score = sum(x is not None for x in cols.values())
                if all(x is not None for x in essenciais):
                    return t, cols, aba, header
                if melhor is None or score > melhor[0]:
                    melhor = (score, t, cols, aba, header)
            except Exception:
                continue

    detalhes = melhor[2] if melhor else {}
    raise ValueError(
        "A base clientes.xlsx foi encontrada, mas não consegui localizar as colunas "
        "Codigo Cliente, Cidade, UF e Codigo Representante. "
        f"Melhor mapeamento encontrado: {detalhes}"
    )


@st.cache_data(ttl=3600, show_spinner=False)
def carregar_carteira():
    if not ARQUIVO_CARTEIRA.exists():
        raise ValueError(
            f"Base de clientes não encontrada: {ARQUIVO_CARTEIRA}. "
            "Confirme se o arquivo existe exatamente com o nome 'base clientes.xlsx'."
        )

    try:
        conteudo = ARQUIVO_CARTEIRA.read_bytes()
        t, cols, aba, header = _ler_carteira_excel_bytes(conteudo)

        out = pd.DataFrame()
        for destino, origem in cols.items():
            if origem is not None:
                out[destino] = t[origem]

        if "Razao Social" not in out.columns:
            out["Razao Social"] = ""
        if "Codigo Supervisor" not in out.columns:
            out["Codigo Supervisor"] = ""

        out["Codigo Cliente"] = out["Codigo Cliente"].astype(str).str.strip().str.upper()
        out["Codigo Representante"] = out["Codigo Representante"].apply(clean_code)
        out["Codigo Supervisor"] = out["Codigo Supervisor"].apply(clean_supervisor)
        out["Razao Social"] = out["Razao Social"].astype(str).str.strip()
        out["Cidade"] = out["Cidade"].astype(str).str.strip()
        out["Uf"] = out["Uf"].astype(str).str.strip().str.upper()

        out = out[
            out["Codigo Cliente"].ne("") &
            out["Codigo Representante"].ne("") &
            out["Cidade"].ne("") &
            out["Uf"].ne("")
        ].copy()

        out["city_key"] = out["Cidade"].apply(norm) + " - " + out["Uf"].apply(norm)
        out = out.drop_duplicates(["Codigo Cliente", "Codigo Representante"], keep="last")
        out.attrs["fonte"] = str(ARQUIVO_CARTEIRA)
        out.attrs["aba"] = aba
        out.attrs["header"] = header
        return out
    except Exception as e:
        raise ValueError(f"Erro ao ler {ARQUIVO_CARTEIRA}: {e}") from e


@st.cache_data(ttl=3600, show_spinner=False)
def carregar_dados():
    vendas = carregar_vendas()
    carteira = carregar_carteira()

    # Completa supervisor da carteira a partir do histórico do app6, quando necessário.
    mapa_rep_sup = (
        vendas[["Codigo Representante", "Codigo Supervisor"]]
        .dropna()
        .drop_duplicates()
        .groupby("Codigo Representante")["Codigo Supervisor"]
        .agg(lambda s: s.mode().iloc[0] if not s.mode().empty else s.iloc[0])
        .to_dict()
    )
    carteira["Codigo Supervisor"] = carteira.apply(
        lambda r: r["Codigo Supervisor"] if str(r["Codigo Supervisor"]).strip() else mapa_rep_sup.get(r["Codigo Representante"], ""),
        axis=1,
    )

    # Completa Razão Social da carteira com o histórico, quando necessário.
    mapa_nome = (
        vendas[["Codigo Cliente", "Razao Social"]]
        .dropna()
        .drop_duplicates("Codigo Cliente", keep="last")
        .set_index("Codigo Cliente")["Razao Social"]
        .to_dict()
    )
    carteira["Razao Social"] = carteira.apply(
        lambda r: r["Razao Social"] if str(r["Razao Social"]).strip() and str(r["Razao Social"]).lower() != "nan" else mapa_nome.get(r["Codigo Cliente"], ""),
        axis=1,
    )
    return vendas, carteira


@st.cache_data(ttl=3600, show_spinner=False)
def load_logo():
    r = requests.get(URL_LOGO, timeout=20)
    r.raise_for_status()
    return Image.open(BytesIO(r.content))


# ============================================================
# STATUS COMERCIAL POR CLIENTE
# ============================================================
def resumo_clientes(df_carteira_rep, df_vendas_rep):
    hoje = pd.Timestamp.today().normalize()
    ano_ini = pd.Timestamp(year=hoje.year, month=1, day=1)
    maio_ini = pd.Timestamp(year=hoje.year, month=5, day=1)

    # O universo nasce da CARTEIRA, não das vendas.
    base_cliente = (
        df_carteira_rep[["Codigo Cliente", "Razao Social", "Cidade", "Uf", "city_key"]]
        .drop_duplicates("Codigo Cliente", keep="last")
        .copy()
    )

    # Última compra real calculada pelo histórico.
    ult = (
        df_vendas_rep.groupby("Codigo Cliente", as_index=False)
        .agg(Data_Ultima_Compra=("Data Cadastro", "max"))
    ) if not df_vendas_rep.empty else pd.DataFrame(columns=["Codigo Cliente", "Data_Ultima_Compra"])

    mov_ano = (
        df_vendas_rep[(df_vendas_rep["Data Cadastro"] >= ano_ini) & (df_vendas_rep["Data Cadastro"] <= hoje)]
        .groupby("Codigo Cliente", as_index=False)
        .agg(Qtd_Ano=("Qtd Venda", "sum"), Vlr_Ano=("Vlr Venda", "sum"))
    )
    mov_maio = (
        df_vendas_rep[(df_vendas_rep["Data Cadastro"] >= maio_ini) & (df_vendas_rep["Data Cadastro"] <= hoje)]
        .groupby("Codigo Cliente", as_index=False)
        .agg(Qtd_Maio_Hoje=("Qtd Venda", "sum"), Vlr_Maio_Hoje=("Vlr Venda", "sum"))
    )
    hist = (
        df_vendas_rep.groupby("Codigo Cliente", as_index=False)
        .agg(Qtd_Historica=("Qtd Venda", "sum"), Vlr_Historico=("Vlr Venda", "sum"))
    )

    out = base_cliente.merge(ult, on="Codigo Cliente", how="left")
    out = out.merge(mov_ano, on="Codigo Cliente", how="left")
    out = out.merge(mov_maio, on="Codigo Cliente", how="left")
    out = out.merge(hist, on="Codigo Cliente", how="left")

    for c in ["Qtd_Ano", "Vlr_Ano", "Qtd_Maio_Hoje", "Vlr_Maio_Hoje", "Qtd_Historica", "Vlr_Historico"]:
        out[c] = pd.to_numeric(out[c], errors="coerce").fillna(0)

    # Garante que a última compra seja sempre datetime.
    # Quando o representante não possui vendas, o merge pode criar a coluna
    # como float por causa dos NaN; a conversão abaixo transforma esses casos
    # em NaT e evita Timestamp - float.
    out["Data_Ultima_Compra"] = pd.to_datetime(
        out["Data_Ultima_Compra"],
        errors="coerce"
    )

    out["Dias_Sem_Compra"] = (hoje - out["Data_Ultima_Compra"]).dt.days
    out["Dias_Sem_Compra"] = out["Dias_Sem_Compra"].fillna(99999).astype(int)

    def status_row(r):
        if r["Qtd_Ano"] <= 0:
            return "🔴 NÃO POSITIVADO NO ANO"
        if r["Qtd_Maio_Hoje"] <= 0:
            return "🟡 SEM COMPRA DESDE MAIO"
        return "🟢 ATIVO DESDE MAIO"

    out["Status"] = out.apply(status_row, axis=1)
    out["Prioridade"] = out["Status"].map({
        "🔴 NÃO POSITIVADO NO ANO": 3,
        "🟡 SEM COMPRA DESDE MAIO": 2,
        "🟢 ATIVO DESDE MAIO": 1,
    }).fillna(0)
    return out


# ============================================================
# RANKING DE CIDADES E ROTA
# ============================================================
def montar_estatistica_cidades(clientes_rep):
    city = (
        clientes_rep.groupby("city_key", as_index=False)
        .agg(
            clientes=("Codigo Cliente", "nunique"),
            vermelhos=("Status", lambda s: int((s == "🔴 NÃO POSITIVADO NO ANO").sum())),
            amarelos=("Status", lambda s: int((s == "🟡 SEM COMPRA DESDE MAIO").sum())),
            verdes=("Status", lambda s: int((s == "🟢 ATIVO DESDE MAIO").sum())),
            dias_media=("Dias_Sem_Compra", "mean"),
            vlr_hist=("Vlr_Historico", "sum"),
        )
    )

    # Oportunidade enfatiza não positivados e clientes sem compra desde maio.
    city["criticos"] = (city["vermelhos"] * 3) + (city["amarelos"] * 2)
    city["criticos_n"] = minmax_scale(city["criticos"])
    city["dias_n"] = minmax_scale(city["dias_media"].clip(upper=3650))
    city["vlr_n"] = minmax_scale(city["vlr_hist"])
    city["op_score"] = 0.65 * city["criticos_n"] + 0.25 * city["dias_n"] + 0.10 * city["vlr_n"]
    return city


def sugerir_cidades_rota(city_base, city_stats_geo, raio_km, n_cidades, w_op, w_dist):
    base_row = city_stats_geo[city_stats_geo["city_key"] == city_base]
    if base_row.empty:
        return pd.DataFrame()

    lat0 = float(base_row.iloc[0]["latitude"])
    lon0 = float(base_row.iloc[0]["longitude"])
    cand = city_stats_geo.copy()
    cand["DIST_KM"] = haversine_vec(lat0, lon0, cand["latitude"].values, cand["longitude"].values)
    cand = cand[cand["DIST_KM"] <= float(raio_km)].copy()
    if cand.empty:
        return pd.DataFrame()

    cand["dist_n"] = minmax_scale(cand["DIST_KM"])
    cand["op_n"] = minmax_scale(cand["op_score"])
    cand["final_score"] = (w_op * cand["op_n"]) + (w_dist * (1 - cand["dist_n"]))

    base_part = cand[cand["city_key"] == city_base].copy()
    other = cand[cand["city_key"] != city_base].sort_values("final_score", ascending=False).head(max(0, int(n_cidades) - 1))
    return pd.concat([base_part, other], ignore_index=True)


# ============================================================
# ANÁLISE DO CLIENTE (HERDADA/ORGANIZADA DO APP6)
# ============================================================
def identificar_colecao(data):
    if pd.isna(data):
        return None
    mes = data.month
    ano = data.year
    if 5 <= mes <= 10:
        return f"Verão {ano}"
    if mes >= 11:
        return f"Inverno {ano + 1}"
    return f"Inverno {ano}"


def analisar_cliente(df_total, df_carteira, codigo_cliente, status_cliente=None):
    codigo = str(codigo_cliente).strip()

    # --------------------------------------------------------
    # CADASTRO DO CLIENTE: vem da base clientes.xlsx
    # --------------------------------------------------------
    cadastro = pd.DataFrame()
    if df_carteira is not None and not df_carteira.empty and "Codigo Cliente" in df_carteira.columns:
        cadastro = df_carteira[
            df_carteira["Codigo Cliente"].astype(str).str.strip() == codigo
        ].copy()

    # --------------------------------------------------------
    # HISTÓRICO DO CLIENTE: vem dos Parquets da preditiva
    # --------------------------------------------------------
    cli = pd.DataFrame()
    if df_total is not None and not df_total.empty and "Codigo Cliente" in df_total.columns:
        cli = df_total[
            df_total["Codigo Cliente"].astype(str).str.strip() == codigo
        ].copy()

    # Garante estrutura mínima mesmo para cliente sem histórico de vendas.
    colunas_historico = [
        "Razao Social", "Cidade", "Uf", "Codigo Representante", "Codigo Supervisor",
        "Data Cadastro", "Data Ultima Compra", "Qtd Venda", "Vlr Venda", "Linha"
    ]
    for col in colunas_historico:
        if col not in cli.columns:
            cli[col] = pd.Series(dtype="object")

    if not cli.empty:
        cli["Data Cadastro"] = pd.to_datetime(cli["Data Cadastro"], errors="coerce")
        cli["Data Ultima Compra"] = pd.to_datetime(cli["Data Ultima Compra"], errors="coerce")
        cli["Qtd Venda"] = pd.to_numeric(cli["Qtd Venda"], errors="coerce").fillna(0)
        cli["Vlr Venda"] = pd.to_numeric(cli["Vlr Venda"], errors="coerce").fillna(0)

        # Mantém vendas válidas; devoluções/valores negativos não entram na análise comercial.
        cli = cli[(cli["Qtd Venda"] >= 0) & (cli["Vlr Venda"] >= 0)].copy()
        cli["Preço Médio Produto"] = np.where(
            cli["Qtd Venda"] > 0,
            cli["Vlr Venda"] / cli["Qtd Venda"],
            0,
        )
    else:
        cli["Preço Médio Produto"] = pd.Series(dtype="float64")

    def primeiro_valor(df, nomes, padrao=""):
        if df is None or df.empty:
            return padrao
        for nome in nomes:
            if nome in df.columns:
                s = df[nome].dropna()
                if not s.empty:
                    valor = s.iloc[0]
                    if str(valor).strip() not in {"", "nan", "None", "<NA>"}:
                        return valor
        return padrao

    # Cadastro/localização SEMPRE prioriza a base clientes.xlsx.
    razao = primeiro_valor(
        cadastro,
        ["Razao Social", "Razao_Social", "Razão Social", "Nome Cliente", "Cliente Nome"],
        "",
    )
    if not str(razao).strip():
        razao = primeiro_valor(cli, ["Razao Social", "Razao_Social", "Razão Social"], "Cliente")

    cidade = primeiro_valor(cadastro, ["Cidade", "Municipio", "Município", "Cidade Cliente"], "")
    uf = primeiro_valor(cadastro, ["Uf", "UF", "Estado", "UF Cliente"], "")

    rep = primeiro_valor(cadastro, ["Codigo Representante", "Código Representante", "Representante"], "")
    if not str(rep).strip():
        rep = primeiro_valor(cli, ["Codigo Representante"], "")
    rep = clean_code(rep) if str(rep).strip() else ""

    sup = primeiro_valor(cadastro, ["Codigo Supervisor", "Código Supervisor", "Supervisor"], "")
    if not str(sup).strip():
        sup = primeiro_valor(cli, ["Codigo Supervisor"], "")
    sup = clean_supervisor(sup) if str(sup).strip() else ""
    nome_sup = MAPA_SUPERVISORES.get(sup, sup)

    if cli.empty:
        ultima_compra = pd.NaT
        primeira_venda = pd.NaT
        ultima_venda = pd.NaT
        qtd_total = 0.0
        vlr_total = 0.0
        pm = 0.0
        melhor_mes = "Sem histórico"
    else:
        # Usa Data Cadastro como data efetiva das movimentações e Data Ultima Compra como apoio.
        ultima_compra = cli["Data Cadastro"].max()
        if pd.isna(ultima_compra):
            ultima_compra = cli["Data Ultima Compra"].max()
        primeira_venda = cli["Data Cadastro"].min()
        ultima_venda = cli["Data Cadastro"].max()
        qtd_total = cli["Qtd Venda"].sum()
        vlr_total = cli["Vlr Venda"].sum()
        pm = vlr_total / qtd_total if qtd_total > 0 else 0

        meses_compra = cli.loc[cli["Qtd Venda"] > 0, "Data Cadastro"].dropna().dt.month
        melhor_mes = (
            MESES_PT.get(int(meses_compra.mode().iloc[0]), "Sem histórico")
            if not meses_compra.empty
            else "Sem histórico"
        )

    st.divider()
    st.markdown(f"# 📊 Inteligência Comercial — {razao}")

    partes = [f"Cliente {codigo}"]
    if str(cidade).strip() or str(uf).strip():
        partes.append(f"{cidade} - {uf}".strip(" -"))
    if rep:
        partes.append(f"Representante {rep}")
    if nome_sup:
        partes.append(f"Supervisor {nome_sup}")
    st.caption(" | ".join(partes))

    if status_cliente:
        if status_cliente.startswith("🔴"):
            st.markdown(f'<div class="status-red"><b>{status_cliente}</b></div>', unsafe_allow_html=True)
        elif status_cliente.startswith("🟡"):
            st.markdown(f'<div class="status-yellow"><b>{status_cliente}</b></div>', unsafe_allow_html=True)
        else:
            st.markdown(f'<div class="status-green"><b>{status_cliente}</b></div>', unsafe_allow_html=True)

    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Última compra", safe_date(ultima_compra))
    c2.metric("Pares históricos", f"{int(qtd_total):,}".replace(",", "."))
    c3.metric("Valor histórico", brl(vlr_total))
    c4.metric("Preço médio", brl(pm))
    c5.metric("Melhor mês", melhor_mes)

    if cli.empty:
        st.warning("Este cliente está na carteira, mas não possui histórico de vendas nos Parquets carregados.")
    elif pd.notna(primeira_venda) and pd.notna(ultima_venda):
        st.caption(
            f"Histórico analisado: {primeira_venda.strftime('%d/%m/%Y')} até "
            f"{ultima_venda.strftime('%d/%m/%Y')}"
        )

    # ----------------------------
    # 3 últimas coleções
    # ----------------------------
    vendas = cli[cli["Data Cadastro"].notna()].copy()
    if not vendas.empty:
        vendas["Colecao"] = vendas["Data Cadastro"].apply(identificar_colecao)
        colecoes = (
            vendas.groupby("Colecao", as_index=False)
            .agg(
                Pares=("Qtd Venda", "sum"),
                Valor=("Vlr Venda", "sum"),
                Data_Inicial=("Data Cadastro", "min"),
                Data_Final=("Data Cadastro", "max"),
            )
            .sort_values("Data_Final", ascending=False)
            .head(3)
        )
        if not colecoes.empty:
            colecoes_view = colecoes.copy()
            colecoes_view["Pares"] = colecoes_view["Pares"].astype(int)
            colecoes_view["Valor"] = colecoes_view["Valor"].apply(brl)
            colecoes_view["Período"] = colecoes_view.apply(
                lambda r: f"{r['Data_Inicial'].strftime('%d/%m/%Y')} a {r['Data_Final'].strftime('%d/%m/%Y')}",
                axis=1,
            )
            st.markdown("### 👟 Vendas das 3 últimas coleções")
            st.dataframe(
                colecoes_view[["Colecao", "Pares", "Valor", "Período"]],
                use_container_width=True,
                hide_index=True,
            )

    # ----------------------------
    # 12 meses
    # ----------------------------
    if not vendas.empty:
        vendas["AnoMes"] = vendas["Data Cadastro"].dt.to_period("M").dt.to_timestamp()
        ult12 = (
            vendas.groupby("AnoMes", as_index=False)
            .agg(Pares=("Qtd Venda", "sum"), Valor=("Vlr Venda", "sum"))
            .sort_values("AnoMes", ascending=False)
            .head(12)
            .sort_values("AnoMes")
        )
        if not ult12.empty:
            ult12["Mês/Ano"] = ult12["AnoMes"].dt.strftime("%m/%Y")
            col_a, col_b = st.columns([1.05, 1.2])
            with col_a:
                st.markdown("### 📆 Últimos 12 meses")
                tab = ult12[["Mês/Ano", "Pares", "Valor"]].copy()
                tab["Pares"] = tab["Pares"].astype(int)
                tab["Valor"] = tab["Valor"].apply(brl)
                st.dataframe(tab, use_container_width=True, hide_index=True)
            with col_b:
                st.markdown("### 📈 Evolução mensal")
                chart_df = ult12.set_index("AnoMes")[["Pares"]]
                st.bar_chart(chart_df)

    # ----------------------------
    # Linhas/categorias ainda não compradas
    # ----------------------------
    st.markdown("### 🎯 Oportunidades de mix")
    linhas_nao = pd.DataFrame(columns=["codigo_linha", "linha"])
    categorias_nao = pd.DataFrame(columns=["categorias"])

    try:
        linhas_validas = pd.read_excel(URL_LINHAS_XLSX, engine="openpyxl")
        linhas_validas.columns = [
            unicodedata.normalize("NFKD", c).encode("ASCII", "ignore").decode("utf-8").strip().lower().replace(" ", "_")
            for c in linhas_validas.columns
        ]
        if "linha" in linhas_validas.columns:
            linhas_validas["linha"] = linhas_validas["linha"].astype(str).str.strip().str.upper()
            if "codigo_linha" in linhas_validas.columns:
                linhas_validas["codigo_linha"] = linhas_validas["codigo_linha"].astype(str).str.strip()
            else:
                linhas_validas["codigo_linha"] = ""

            if "Linha" in cli.columns and not cli.empty:
                compradas = (
                    cli.loc[cli["Qtd Venda"] > 0, "Linha"]
                    .dropna().astype(str).str.strip().str.upper().unique()
                )
            else:
                compradas = np.array([], dtype=object)

            linhas_nao = (
                linhas_validas[~linhas_validas["linha"].isin(compradas)][["codigo_linha", "linha"]]
                .drop_duplicates()
                .sort_values("linha")
                .reset_index(drop=True)
            )

            try:
                cats = pd.read_csv(URL_CATEGORIAS, encoding="latin1", sep=";")
                cats.columns = [
                    unicodedata.normalize("NFKD", c).encode("ASCII", "ignore").decode("utf-8").strip().lower().replace(" ", "_")
                    for c in cats.columns
                ]
                if "categorias" in cats.columns and "codigo_linha" in cats.columns:
                    cats["codigo_linha"] = cats["codigo_linha"].astype(str).str.strip()
                    merge = linhas_nao.copy()
                    merge["codigo_linha"] = merge["codigo_linha"].astype(str).str.strip()
                    categorias_nao = (
                        merge.merge(cats[["codigo_linha", "categorias"]], on="codigo_linha", how="left")[["categorias"]]
                        .dropna().drop_duplicates().sort_values("categorias").reset_index(drop=True)
                    )
            except Exception as e:
                st.info(f"Categorias não carregadas: {e}")
    except Exception as e:
        st.info(f"Linhas não compradas não carregadas: {e}")

    ca, cb = st.columns(2)
    with ca:
        st.markdown("#### Linhas ainda não compradas")
        if linhas_nao.empty:
            st.success("Cliente já comprou todas as linhas disponíveis ou não há base de linhas disponível.")
        else:
            st.dataframe(linhas_nao, use_container_width=True, hide_index=True, height=320)
    with cb:
        st.markdown("#### Categorias ainda não compradas")
        if categorias_nao.empty:
            st.success("Sem categorias adicionais identificadas.")
        else:
            st.dataframe(categorias_nao, use_container_width=True, hide_index=True, height=320)


# ============================================================
# AUTENTICAÇÃO COMPATÍVEL COM O APP6
# ============================================================
def autenticar_usuario_excel(caminho_arquivo="auth.xlsx"):
    """
    Mantém o login do app6 quando auth.xlsx estiver disponível.
    Se o arquivo não existir no ambiente, o app roda sem autenticação.
    Admin vê todos; representante logado fica restrito ao próprio código.
    """
    if not os.path.exists(caminho_arquivo):
        return None

    try:
        auth = pd.read_excel(caminho_arquivo, engine="openpyxl")
        auth.columns = [
            unicodedata.normalize("NFKD", c).encode("ascii", "ignore").decode("utf-8").strip().lower().replace(" ", "_")
            for c in auth.columns
        ]
        if "usuario" not in auth.columns or "senha" not in auth.columns:
            st.sidebar.warning("auth.xlsx existe, mas não possui as colunas usuario e senha.")
            return None

        auth["usuario"] = auth["usuario"].astype(str).str.strip()
        auth["senha"] = auth["senha"].astype(str).str.strip()
        st.session_state["autenticado"] = st.session_state.get("autenticado", False)

        if not st.session_state["autenticado"]:
            with st.sidebar:
                st.markdown("### 🔐 Login")
                usuario = st.text_input("Usuário", key="login_usuario").strip()
                senha = st.text_input("Senha", type="password", key="login_senha").strip()
                if st.button("Entrar", key="btn_login"):
                    linha = auth[auth["usuario"] == usuario]
                    if linha.empty:
                        st.error("Usuário não encontrado.")
                    elif senha == str(linha.iloc[0]["senha"]).strip():
                        st.session_state["autenticado"] = True
                        st.session_state["usuario_logado"] = usuario
                        st.rerun()
                    else:
                        st.error("Senha incorreta.")
            st.stop()

        return str(st.session_state.get("usuario_logado", "")).strip()
    except Exception as e:
        st.sidebar.warning(f"Falha ao carregar autenticação: {e}")
        return None


# ============================================================
# CABEÇALHO / CARGA
# ============================================================
try:
    logo = load_logo()
    st.sidebar.image(logo, width=105)
except Exception:
    pass

st.title("📍 Rota Campeã + Inteligência Comercial")
st.caption("Supervisor → Representante → Cidade → Rota → Clientes prioritários → Análise do cliente")

usuario_logado = autenticar_usuario_excel("auth.xlsx")

try:
    with st.spinner("Carregando base comercial..."):
        df_vendas, df_carteira = carregar_dados()
except Exception as e:
    st.error(f"Erro ao carregar a base: {e}")
    st.stop()

st.sidebar.caption(f"✅ Histórico: {PASTA_PREDITIVA}")
st.sidebar.caption(f"✅ Carteira: {ARQUIVO_CARTEIRA}")

# Segurança herdada do app6: representante logado vê somente a própria carteira.
if usuario_logado and usuario_logado.lower() != "admin":
    rep_login = clean_code(usuario_logado)
    df_vendas = df_vendas[df_vendas["Codigo Representante"] == rep_login].copy()
    df_carteira = df_carteira[df_carteira["Codigo Representante"] == rep_login].copy()
    if df_carteira.empty:
        st.error(f"O usuário {usuario_logado} não possui carteira vinculada ao código de representante {rep_login}.")
        st.stop()

# ============================================================
# FILTROS: SUPERVISOR -> REPRESENTANTE -> CIDADE
# ============================================================
st.sidebar.header("🎯 Planejamento comercial")

sup_values = sorted([x for x in df_carteira["Codigo Supervisor"].dropna().astype(str).unique() if x])
sup_options = [f"{s} - {MAPA_SUPERVISORES.get(s, 'Supervisor')}" for s in sup_values]
if not sup_options:
    st.error("Nenhum supervisor disponível na base.")
    st.stop()

sup_label = st.sidebar.selectbox("Supervisor", sup_options)
sup_sel = sup_label.split(" - ", 1)[0].strip()

df_sup = df_carteira[df_carteira["Codigo Supervisor"] == sup_sel].copy()
rep_values = sorted([x for x in df_sup["Codigo Representante"].dropna().astype(str).unique() if x])
if not rep_values:
    st.warning("Nenhum representante encontrado para o supervisor selecionado.")
    st.stop()

rep_sel = st.sidebar.selectbox("Representante", rep_values)
df_carteira_rep = df_sup[df_sup["Codigo Representante"] == str(rep_sel)].copy()
df_vendas_rep = df_vendas[df_vendas["Codigo Representante"] == str(rep_sel)].copy()

# Cliente único para o cálculo de status/rota
clientes_rep = resumo_clientes(df_carteira_rep, df_vendas_rep)

# Cidades reais da carteira do representante
city_options = sorted([x for x in clientes_rep["city_key"].dropna().astype(str).unique() if " - " in x])
if not city_options:
    st.warning("Nenhuma cidade encontrada para o representante selecionado.")
    st.stop()

city_base_sel = st.sidebar.selectbox("Cidade base", city_options)
raio = st.sidebar.slider("Raio máximo (km)", 30, 300, 120, 10)
n_cidades = st.sidebar.slider("Quantidade de cidades na rota", 2, 15, 6, 1)

st.sidebar.divider()
st.sidebar.subheader("⚖️ Peso da rota")
w_op_raw = st.sidebar.slider("Oportunidade comercial", 0.0, 1.0, 0.70, 0.05)
w_dist_raw = st.sidebar.slider("Proximidade", 0.0, 1.0, 0.30, 0.05)
if w_op_raw + w_dist_raw == 0:
    w_op, w_dist = 0.7, 0.3
else:
    soma_w = w_op_raw + w_dist_raw
    w_op, w_dist = w_op_raw / soma_w, w_dist_raw / soma_w

# ============================================================
# KPIs DO REPRESENTANTE
# ============================================================
red_count = int((clientes_rep["Status"] == "🔴 NÃO POSITIVADO NO ANO").sum())
yel_count = int((clientes_rep["Status"] == "🟡 SEM COMPRA DESDE MAIO").sum())
gre_count = int((clientes_rep["Status"] == "🟢 ATIVO DESDE MAIO").sum())

k1, k2, k3, k4 = st.columns(4)
k1.metric("Clientes do representante", f"{clientes_rep['Codigo Cliente'].nunique():,}".replace(",", "."))
k2.metric("🔴 Não positivados no ano", red_count)
k3.metric("🟡 Sem compra desde maio", yel_count)
k4.metric("🟢 Ativos desde maio", gre_count)

# ============================================================
# GEO + ROTA
# ============================================================
with st.spinner("Calculando oportunidade e rota sugerida..."):
    try:
        geo = load_geo()
    except Exception as e:
        st.error(f"Erro ao carregar coordenadas municipais: {e}")
        st.stop()

    city_stats = montar_estatistica_cidades(clientes_rep)
    city_stats_geo = city_stats.merge(geo, on="city_key", how="left")

    missing_geo = city_stats_geo[city_stats_geo["latitude"].isna()]["city_key"].tolist()
    if missing_geo:
        with st.expander(f"⚠️ {len(missing_geo)} cidade(s) sem coordenada"):
            st.write(missing_geo)

    city_stats_geo = city_stats_geo.dropna(subset=["latitude", "longitude"]).copy()

    if city_base_sel not in set(city_stats_geo["city_key"]):
        st.error("A cidade-base selecionada não casou com a base geográfica. Verifique Cidade/UF nos Parquets.")
        st.stop()

    rota_cidades = sugerir_cidades_rota(
        city_base_sel,
        city_stats_geo,
        raio,
        n_cidades,
        w_op,
        w_dist,
    )

if rota_cidades.empty:
    st.warning("Nenhuma cidade encontrada para montar a rota com os parâmetros atuais.")
    st.stop()

# Pontos e ordem
points = []
for _, r in rota_cidades.iterrows():
    points.append({
        "key": str(r["city_key"]),
        "lat": float(r["latitude"]),
        "lon": float(r["longitude"]),
        "op": float(r["op_score"]),
        "vermelhos": int(r["vermelhos"]),
        "amarelos": int(r["amarelos"]),
        "verdes": int(r["verdes"]),
        "clientes": int(r["clientes"]),
    })

# Garante a base no primeiro ponto
points.sort(key=lambda p: 0 if p["key"] == city_base_sel else 1)
order = build_route_order(points, w_op=w_op, w_dist=w_dist)
points_ordered = [points[i] for i in order]
route_keys = [p["key"] for p in points_ordered]

# ============================================================
# MAPA
# ============================================================
st.markdown("## 🗺️ Rota sugerida")

if not MAPA_OK:
    st.warning("Para visualizar o mapa, instale: pip install folium streamlit-folium")
else:
    try:
        rota_latlon = osrm_route_geojson(points_ordered)
        modo_rota = "OSRM — rota por ruas"
    except Exception:
        rota_latlon = [(p["lat"], p["lon"]) for p in points_ordered]
        modo_rota = "Linha reta — fallback"

    m = folium.Map(location=[points_ordered[0]["lat"], points_ordered[0]["lon"]], zoom_start=7, control_scale=True)

    heat = []
    for idx, p in enumerate(points_ordered):
        crit = (p["vermelhos"] * 3) + (p["amarelos"] * 2)
        if crit > 0:
            heat.append([p["lat"], p["lon"], crit])

        if idx == 0:
            color = "black"
            label = "BASE"
        elif p["vermelhos"] > 0:
            color = "red"
            label = "PRIORIDADE"
        elif p["amarelos"] > 0:
            color = "orange"
            label = "ATENÇÃO"
        else:
            color = "green"
            label = "ATIVO"

        popup = (
            f"<b>{idx}. {p['key']}</b><br>"
            f"{label}<br>"
            f"Clientes: {p['clientes']}<br>"
            f"🔴 Não positivados: {p['vermelhos']}<br>"
            f"🟡 Sem compra desde maio: {p['amarelos']}<br>"
            f"🟢 Ativos: {p['verdes']}"
        )
        folium.CircleMarker(
            [p["lat"], p["lon"]], radius=10 if idx == 0 else 8,
            color=color, fill=True, fill_color=color, fill_opacity=0.85,
            tooltip=f"{idx}. {p['key']}", popup=folium.Popup(popup, max_width=320)
        ).add_to(m)

    if heat:
        HeatMap(heat, radius=24, blur=18, min_opacity=0.25).add_to(m)

    folium.PolyLine(rota_latlon, weight=5, opacity=0.9).add_to(m)
    m.fit_bounds([[p["lat"], p["lon"]] for p in points_ordered])
    st.caption(f"{modo_rota} | Peso oportunidade={w_op:.2f} | proximidade={w_dist:.2f}")
    st_folium(m, use_container_width=True, height=590)

# Ordem + link Google
rota_ordem = pd.DataFrame({
    "Ordem": list(range(len(points_ordered))),
    "Cidade": route_keys,
    "🔴": [p["vermelhos"] for p in points_ordered],
    "🟡": [p["amarelos"] for p in points_ordered],
    "🟢": [p["verdes"] for p in points_ordered],
    "Clientes": [p["clientes"] for p in points_ordered],
})
st.dataframe(rota_ordem, use_container_width=True, hide_index=True)

maps_url = google_maps_dir_url(points_ordered)
st.markdown(f"➡️ [Abrir esta rota no Google Maps]({maps_url})")

# ============================================================
# CLIENTES DAS CIDADES DA ROTA
# ============================================================
st.markdown("## 👥 Clientes das cidades da rota")
st.caption(
    "🔴 nenhuma compra no ano vigente | 🟡 comprou no ano, mas não compra desde 01/05 | 🟢 possui compra desde 01/05"
)

clientes_rota = clientes_rep[clientes_rep["city_key"].isin(route_keys)].copy()
clientes_rota["Ordem_Status"] = clientes_rota["Status"].map({
    "🔴 NÃO POSITIVADO NO ANO": 1,
    "🟡 SEM COMPRA DESDE MAIO": 2,
    "🟢 ATIVO DESDE MAIO": 3,
})
clientes_rota["Ordem_Cidade"] = clientes_rota["city_key"].map({c: i for i, c in enumerate(route_keys)})
clientes_rota = clientes_rota.sort_values(
    ["Ordem_Status", "Ordem_Cidade", "Dias_Sem_Compra"],
    ascending=[True, True, False]
).reset_index(drop=True)

# filtro opcional da lista
status_filter = st.multiselect(
    "Mostrar status",
    ["🔴 NÃO POSITIVADO NO ANO", "🟡 SEM COMPRA DESDE MAIO", "🟢 ATIVO DESDE MAIO"],
    default=["🔴 NÃO POSITIVADO NO ANO", "🟡 SEM COMPRA DESDE MAIO"],
)
view = clientes_rota[clientes_rota["Status"].isin(status_filter)].copy() if status_filter else clientes_rota.copy()

view["Última Compra"] = view["Data_Ultima_Compra"].apply(safe_date)

# Razão Social: usa o nome canônico da base e aceita variações sem quebrar o app.
col_razao_view = None
for _cand in ["Razao Social", "Razao_Social", "Razão Social", "Nome Cliente", "Cliente Nome"]:
    if _cand in view.columns:
        col_razao_view = _cand
        break

if col_razao_view is None:
    view["Razao Social"] = ""
    col_razao_view = "Razao Social"

view["Cliente"] = (
    view["Codigo Cliente"].fillna("").astype(str).str.strip()
    + " - "
    + view[col_razao_view].fillna("").astype(str).str.strip()
).str.strip(" -")
view["Cidade/UF"] = view["Cidade"].astype(str) + " - " + view["Uf"].astype(str)
view["Valor Histórico"] = view["Vlr_Historico"].apply(brl)

cols_view = ["Status", "Cliente", "Cidade/UF", "Última Compra", "Dias_Sem_Compra", "Valor Histórico"]

st.info("Clique em uma linha da tabela para abrir a análise comercial completa do cliente.")
event = st.dataframe(
    view[cols_view],
    use_container_width=True,
    hide_index=True,
    height=430,
    on_select="rerun",
    selection_mode="single-row",
    key="tabela_clientes_rota",
)

selected_rows = []
try:
    selected_rows = event.selection.rows
except Exception:
    selected_rows = []

if selected_rows:
    idx = int(selected_rows[0])
    if idx < len(view):
        row = view.iloc[idx]
        st.session_state["cliente_selecionado"] = str(row["Codigo Cliente"])
        st.session_state["status_cliente_selecionado"] = str(row["Status"])

# Mantém seleção ao rerun
codigo_selecionado = st.session_state.get("cliente_selecionado")
status_selecionado = st.session_state.get("status_cliente_selecionado")

if codigo_selecionado:
    analisar_cliente(df_vendas, df_carteira, codigo_selecionado, status_selecionado)
else:
    st.caption("Selecione um cliente na tabela acima para abrir a inteligência comercial.")

st.sidebar.divider()
st.sidebar.caption(f"Atualizado em {datetime.now().strftime('%d/%m/%Y %H:%M')}")
