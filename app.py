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
import uuid
from datetime import datetime, timezone
from io import BytesIO, StringIO
from urllib.parse import quote
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score
import requests
import streamlit as st
import bcrypt
from supabase import create_client
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
    page_title="KIDY Sales Intelligence",
    page_icon="📍",
    layout="wide",
    initial_sidebar_state="expanded",
)

MUNICIPIOS_URL = "https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/csv/municipios.csv"
ESTADOS_URL = "https://raw.githubusercontent.com/kelvins/Municipios-Brasileiros/main/csv/estados.csv"

URL_LOGO = "https://raw.githubusercontent.com/carlinhosg7/streamlit02/main/logo_kidy.png"
URL_LINHAS_XLSX = "https://github.com/carlinhosg7/streamlit02/raw/main/DADOS%20PREDITIVA%20LINHAS.xlsx"
URL_CATEGORIAS = "https://raw.githubusercontent.com/carlinhosg7/streamlit02/main/CATEGORIAS.csv"

# ============================================================
# ARQUIVOS DO PROJETO
# Funciona localmente e também no Streamlit Community Cloud.
# Todos os arquivos de dados abaixo devem ficar na mesma pasta do app.py.
# ============================================================
BASE_DIR = Path(__file__).resolve().parent

ARQUIVO_CARTEIRA = BASE_DIR / "base clientes.xlsx"
PASTA_PREDITIVA = BASE_DIR
ARQUIVO_LIMITE = BASE_DIR / "DADOS PRDITIVA LIMITE.xlsx"

PADRAO_PREDITIVA = "DADOS_PREDITIVA_*.parquet"

MAPA_SUPERVISORES = {
    "9902": "Centro Oeste",
    "9907": "SUL",
    "9914": "Norte / Nordeste",
    "9915": "REM",
    "9916": "SPC",
    "9917": "SPI",
    "9918": "MT/MS",
    "9919": "RN",
    "9920": "B2B",
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


def _parse_valor_brl(x):
    """Converte números e textos monetários brasileiros para float."""
    if x is None or pd.isna(x):
        return 0.0
    if isinstance(x, (int, float, np.number)):
        return float(x)
    s = str(x).strip()
    if not s or s.lower() in {"nan", "none", "<na>"}:
        return 0.0
    s = (
        s.replace("R$", "")
         .replace("\xa0", "")
         .replace(" ", "")
    )
    # Se houver vírgula, assume padrão brasileiro 1.234,56
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except Exception:
        return 0.0


def _normalizar_bloqueio_financeiro(x):
    if x is None or pd.isna(x):
        return ""
    s = str(x).strip()
    if not s or s.lower() in {"nan", "none", "<na>"}:
        return ""
    return s


def _bloqueio_label(x):
    s = norm(x)
    if not s:
        return "Não informado"

    # Variações comuns de bloqueado
    bloqueado = any(
        termo in s
        for termo in [
            "BLOQ", "BLOQUE", "SIM", "S", "RESTRIT",
            "INADIMPL", "SUSPENS", "TRAVAD"
        ]
    )

    # Variações comuns de liberado
    liberado = any(
        termo in s
        for termo in [
            "LIBER", "NAO", "NÃO", "N", "OK", "NORMAL"
        ]
    )

    if bloqueado and not liberado:
        return "🔴 Bloqueado"
    if liberado and not bloqueado:
        return "🟢 Liberado"
    return str(x).strip()


@st.cache_data(ttl=3600, show_spinner=False)
def carregar_limite_financeiro():
    """
    Lê DADOS PRDITIVA LIMITE.xlsx e devolve:
    Codigo Cliente | Limite | Bloqueio Financeiro
    """
    if not ARQUIVO_LIMITE.exists():
        raise ValueError(
            f"Arquivo de limite financeiro não encontrado: {ARQUIVO_LIMITE}"
        )

    try:
        bruto = pd.read_excel(ARQUIVO_LIMITE, engine="openpyxl")
    except Exception as e:
        raise ValueError(
            f"Erro ao ler o arquivo de limite financeiro {ARQUIVO_LIMITE}: {e}"
        ) from e

    col_cliente = find_column(
        bruto,
        [
            "Codigo Cliente", "Código Cliente", "Cod Cliente",
            "Cod. Cliente", "Cliente"
        ]
    )
    col_limite = find_column(
        bruto,
        [
            "Limite", "Limite Credito", "Limite Crédito",
            "Limite Financeiro", "Credito", "Crédito"
        ]
    )
    col_bloqueio = find_column(
        bruto,
        [
            "Bloqueio Financeiro", "Bloqueiro Financeiro",
            "Bloqueio", "Bloqueado", "Status Financeiro",
            "Situacao Financeira", "Situação Financeira"
        ]
    )

    if col_cliente is None:
        raise ValueError(
            "Não encontrei a coluna de Código do Cliente em "
            f"{ARQUIVO_LIMITE.name}. Colunas: {list(bruto.columns)}"
        )

    if col_limite is None:
        raise ValueError(
            "Não encontrei a coluna de Limite em "
            f"{ARQUIVO_LIMITE.name}. Colunas: {list(bruto.columns)}"
        )

    if col_bloqueio is None:
        raise ValueError(
            "Não encontrei a coluna de Bloqueio Financeiro em "
            f"{ARQUIVO_LIMITE.name}. Colunas: {list(bruto.columns)}"
        )

    fin = pd.DataFrame({
        "Codigo Cliente": bruto[col_cliente],
        "Limite": bruto[col_limite],
        "Bloqueio Financeiro": bruto[col_bloqueio],
    })

    fin["Codigo Cliente"] = (
        fin["Codigo Cliente"]
        .astype(str)
        .str.strip()
        .str.upper()
    )
    fin["Limite"] = fin["Limite"].apply(_parse_valor_brl)
    fin["Bloqueio Financeiro"] = (
        fin["Bloqueio Financeiro"]
        .apply(_normalizar_bloqueio_financeiro)
    )

    fin = fin[
        fin["Codigo Cliente"].ne("")
        & fin["Codigo Cliente"].ne("NAN")
    ].copy()

    # Se houver cliente repetido, usa a última linha preenchida do arquivo.
    fin = fin.drop_duplicates("Codigo Cliente", keep="last")

    return fin


@st.cache_data(ttl=3600, show_spinner=False)
def carregar_dados():
    vendas = carregar_vendas()
    carteira = carregar_carteira()

    # Limite e bloqueio financeiro por cliente
    limite_fin = carregar_limite_financeiro()

    # Remove colunas antigas caso existam para evitar _x/_y
    for _df in (vendas, carteira):
        for _c in ["Limite", "Bloqueio Financeiro"]:
            if _c in _df.columns:
                _df.drop(columns=[_c], inplace=True)

    vendas = vendas.merge(
        limite_fin,
        on="Codigo Cliente",
        how="left"
    )
    carteira = carteira.merge(
        limite_fin,
        on="Codigo Cliente",
        how="left"
    )

    vendas["Limite"] = pd.to_numeric(
        vendas["Limite"], errors="coerce"
    ).fillna(0.0)
    carteira["Limite"] = pd.to_numeric(
        carteira["Limite"], errors="coerce"
    ).fillna(0.0)

    vendas["Bloqueio Financeiro"] = (
        vendas["Bloqueio Financeiro"].fillna("").astype(str).str.strip()
    )
    carteira["Bloqueio Financeiro"] = (
        carteira["Bloqueio Financeiro"].fillna("").astype(str).str.strip()
    )

    # ========================================================
    # SUPERVISOR ATUAL POR REPRESENTANTE
    # ========================================================
    # Regra: usa a venda MAIS RECENTE (Data Cadastro) de cada representante.
    # Em empate de data, fica com a última ocorrência carregada.
    vendas_sup = vendas[
        ["Codigo Representante", "Codigo Supervisor", "Data Cadastro"]
    ].copy()

    vendas_sup["Codigo Representante"] = (
        vendas_sup["Codigo Representante"].apply(clean_code)
    )
    vendas_sup["Codigo Supervisor"] = (
        vendas_sup["Codigo Supervisor"].apply(clean_supervisor)
    )
    vendas_sup["Data Cadastro"] = pd.to_datetime(
        vendas_sup["Data Cadastro"], errors="coerce"
    )

    vendas_sup = vendas_sup[
        vendas_sup["Codigo Representante"].astype(str).str.strip().ne("")
        & vendas_sup["Codigo Supervisor"].astype(str).str.strip().ne("")
        & vendas_sup["Data Cadastro"].notna()
    ].copy()

    # Índice auxiliar garante desempate estável pela ocorrência mais recente
    # dentro dos arquivos já concatenados.
    vendas_sup["_ordem"] = np.arange(len(vendas_sup))

    vendas_sup = (
        vendas_sup
        .sort_values(
            ["Codigo Representante", "Data Cadastro", "_ordem"],
            ascending=[True, True, True]
        )
        .drop_duplicates("Codigo Representante", keep="last")
    )

    mapa_rep_sup = dict(
        zip(
            vendas_sup["Codigo Representante"],
            vendas_sup["Codigo Supervisor"]
        )
    )

    # Histórico mais recente tem prioridade sobre supervisor antigo da carteira.
    carteira["Codigo Supervisor"] = carteira.apply(
        lambda r: mapa_rep_sup.get(
            clean_code(r["Codigo Representante"]),
            clean_supervisor(r["Codigo Supervisor"])
        ),
        axis=1,
    )

    # ========================================================
    # PADRONIZA REGIONAIS PARA NÃO REPETIR
    # ========================================================
    # Exemplo: "Centro Oeste" e "9902" passam a representar a mesma regional.
    mapa_nome_para_codigo = {
        norm(nome): codigo
        for codigo, nome in MAPA_SUPERVISORES.items()
        if nome and nome != codigo
    }

    def _canonizar_supervisor(valor):
        s = clean_supervisor(valor)
        if not s:
            return ""

        # Se já é código conhecido, mantém.
        if s in MAPA_SUPERVISORES:
            return s

        # Se veio como nome textual de regional, converte para o código oficial.
        chave = norm(s)
        if chave in mapa_nome_para_codigo:
            return mapa_nome_para_codigo[chave]

        # Mantém regionais textuais como B2B, RN, MT / MS etc.
        return s

    carteira["Codigo Supervisor"] = (
        carteira["Codigo Supervisor"]
        .apply(_canonizar_supervisor)
    )

    vendas["Codigo Supervisor"] = (
        vendas["Codigo Supervisor"]
        .apply(_canonizar_supervisor)
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
        lambda r: (
            r["Razao Social"]
            if str(r["Razao Social"]).strip()
            and str(r["Razao Social"]).lower() != "nan"
            else mapa_nome.get(r["Codigo Cliente"], "")
        ),
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
    colunas_cliente = [
        "Codigo Cliente", "Razao Social", "Cidade", "Uf", "city_key",
        "Limite", "Bloqueio Financeiro"
    ]
    for _c in ["Limite", "Bloqueio Financeiro"]:
        if _c not in df_carteira_rep.columns:
            df_carteira_rep = df_carteira_rep.copy()
            df_carteira_rep[_c] = 0.0 if _c == "Limite" else ""

    base_cliente = (
        df_carteira_rep[colunas_cliente]
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

    # Ajuste fino: exibe na rota apenas clientes cuja última compra esteja
    # entre 01/01/2022 e hoje. Clientes sem compra ou com última compra
    # anterior a 2022 deixam de compor o universo da rota.
    data_corte_clientes = pd.Timestamp(year=2022, month=1, day=1)
    out = out[
        out["Data_Ultima_Compra"].notna()
        & (out["Data_Ultima_Compra"] >= data_corte_clientes)
        & (out["Data_Ultima_Compra"] <= hoje)
    ].copy()

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
    """
    Análise preditiva/comercial adaptada para reproduzir a saída do app_41.py,
    mantendo a integração com a Rota Campeã e as bases atuais.
    """
    codigo = str(codigo_cliente).strip().upper()

    # --------------------------------------------------------
    # CADASTRO DO CLIENTE: prioridade para base clientes.xlsx
    # --------------------------------------------------------
    cadastro = pd.DataFrame()
    if df_carteira is not None and not df_carteira.empty and "Codigo Cliente" in df_carteira.columns:
        cadastro = df_carteira[
            df_carteira["Codigo Cliente"].astype(str).str.strip().str.upper() == codigo
        ].copy()

    # --------------------------------------------------------
    # HISTÓRICO DO CLIENTE: Parquets da preditiva
    # --------------------------------------------------------
    cli = pd.DataFrame()
    if df_total is not None and not df_total.empty and "Codigo Cliente" in df_total.columns:
        cli = df_total[
            df_total["Codigo Cliente"].astype(str).str.strip().str.upper() == codigo
        ].copy()

    colunas_minimas = [
        "Razao Social", "Cidade", "Uf", "Codigo Representante", "Codigo Supervisor",
        "Codigo Grupo Cliente", "Grupo Cliente", "Data Cadastro", "Data Ultima Compra",
        "Numero Pedido", "Codigo Linha", "Qtd Venda", "Vlr Venda", "Linha"
    ]
    for col in colunas_minimas:
        if col not in cli.columns:
            cli[col] = pd.Series(dtype="object")

    if not cli.empty:
        cli["Data Cadastro"] = pd.to_datetime(cli["Data Cadastro"], errors="coerce")
        cli["Data Ultima Compra"] = pd.to_datetime(cli["Data Ultima Compra"], errors="coerce")
        cli["Qtd Venda"] = pd.to_numeric(cli["Qtd Venda"], errors="coerce").fillna(0)
        cli["Vlr Venda"] = pd.to_numeric(cli["Vlr Venda"], errors="coerce").fillna(0)

        # Mesmo critério do app_41: devoluções/negativos não entram na análise.
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

    # Cadastro/localização continua priorizando a carteira.
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
    nome_sup = MAPA_SUPERVISORES.get(sup, sup if sup else "Não informado")

    nome_grupo = primeiro_valor(cli, ["Grupo Cliente"], str(razao))
    codigo_grupo = primeiro_valor(cli, ["Codigo Grupo Cliente"], "")

    # Quantidade de lojas do grupo, como no app_41.
    total_lojas = 1
    if (
        df_total is not None and not df_total.empty and codigo_grupo
        and "Codigo Grupo Cliente" in df_total.columns and "Codigo Cliente" in df_total.columns
    ):
        grupo_mask = (
            df_total["Codigo Grupo Cliente"].astype(str).str.strip().str.upper()
            == str(codigo_grupo).strip().upper()
        )
        if rep and "Codigo Representante" in df_total.columns:
            grupo_mask &= df_total["Codigo Representante"].apply(clean_code) == rep
        total_lojas = int(df_total.loc[grupo_mask, "Codigo Cliente"].astype(str).nunique()) or 1

    # ========================================================
    # CABEÇALHO DA ANÁLISE - padrão do app_41
    # ========================================================
    st.divider()
    st.markdown(f"# 📊 Inteligência Comercial — {razao}")

    if status_cliente:
        if status_cliente.startswith("🔴"):
            st.markdown(f'<div class="status-red"><b>{status_cliente}</b></div>', unsafe_allow_html=True)
        elif status_cliente.startswith("🟡"):
            st.markdown(f'<div class="status-yellow"><b>{status_cliente}</b></div>', unsafe_allow_html=True)
        else:
            st.markdown(f'<div class="status-green"><b>{status_cliente}</b></div>', unsafe_allow_html=True)

    st.markdown(
        f"## 📍 Grupo Cliente: {nome_grupo} | 🏬 Lojas: {total_lojas} | 🆔 Representante(s): {rep or 'Não informado'}"
    )
    st.markdown(f"#### 🧑‍💼 Supervisor: {nome_sup}")
    if str(cidade).strip() or str(uf).strip():
        st.caption(f"Cliente {codigo} | {cidade} - {uf}".strip(" -"))

    # --------------------------------------------------------
    # SITUAÇÃO FINANCEIRA
    # --------------------------------------------------------
    limite_cliente = primeiro_valor(cadastro, ["Limite"], 0.0)
    limite_cliente = _parse_valor_brl(limite_cliente)

    bloqueio_cliente = primeiro_valor(
        cadastro,
        ["Bloqueio Financeiro"],
        ""
    )
    bloqueio_exib = _bloqueio_label(bloqueio_cliente)

    st.markdown("### 💳 Situação Financeira")
    fin1, fin2 = st.columns(2)
    fin1.metric("Limite", brl(limite_cliente))
    fin2.metric("Bloqueio Financeiro", bloqueio_exib)

    if cli.empty:
        st.warning("Este cliente está na carteira, mas não possui histórico de vendas nos Parquets carregados.")
        return

    dados_filtrados = cli.copy()
    dados_filtrados = dados_filtrados[
        dados_filtrados["Data Cadastro"].notna()
        & dados_filtrados["Qtd Venda"].notna()
        & dados_filtrados["Vlr Venda"].notna()
    ].copy()

    if dados_filtrados.empty:
        st.warning("Não há movimentações válidas para montar a análise preditiva deste cliente.")
        return

    # --------------------------------------------------------
    # KPIs exatamente na linha do app_41
    # --------------------------------------------------------
    # ========================================================
    # DATAS DA ANÁLISE
    # ========================================================
    # A data REAL da compra é "Data Cadastro".
    # "Data Ultima Compra" não é usada para montar o período, pois pode
    # vir replicada/desatualizada no histórico.
    datas_historico = pd.to_datetime(cli["Data Cadastro"], errors="coerce").dropna()

    if datas_historico.empty:
        ultima_compra = "Sem compra"
        periodo_analise = "Sem histórico"
    else:
        primeira_data = datas_historico.min()
        ultima_data = datas_historico.max()

        # Última compra real = maior Data Cadastro do cliente.
        ultima_compra = safe_date(ultima_data)

        # Período considera TODO o histórico disponível do cliente,
        # e não apenas as linhas que sobraram após filtros de quantidade/valor.
        periodo_analise = (
            f"{primeira_data.strftime('%d/%m/%Y')} até "
            f"{ultima_data.strftime('%d/%m/%Y')}"
        )

    vendas_totais = dados_filtrados["Qtd Venda"].sum()
    meses_validos = dados_filtrados.loc[dados_filtrados["Qtd Venda"] > 0, "Data Cadastro"].dropna().dt.month
    if not meses_validos.empty:
        melhor_mes_num = int(meses_validos.mode().iloc[0])
        melhor_mes_nome = MESES_PT.get(melhor_mes_num, "Mês inválido")
    else:
        melhor_mes_nome = "Sem histórico"

    col1, col2, col3 = st.columns(3)
    for col, label, value in zip(
        [col1, col2, col3],
        ["📅 Última Compra", "🕒 Período da Análise", "📈 Melhor Mês para Oferta"],
        [ultima_compra, periodo_analise, melhor_mes_nome],
    ):
        col.markdown(
            f"""
            <div class="kpi-card">
                <div class="kpi-label">{label}</div>
                <div class="kpi-value">{value}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    st.success(f"📦 Total de Itens Vendidos: {int(vendas_totais):,} unidades".replace(",", "."))

    # ========================================================
    # 3 ÚLTIMAS COLEÇÕES - mesma regra do app_41
    # ========================================================
    dados_filtrados["Qtd Venda"] = pd.to_numeric(dados_filtrados["Qtd Venda"], errors="coerce").fillna(0)
    dados_filtrados["Vlr Venda"] = pd.to_numeric(dados_filtrados["Vlr Venda"], errors="coerce").fillna(0)
    dados_filtrados = dados_filtrados[
        (dados_filtrados["Qtd Venda"] >= 0) & (dados_filtrados["Vlr Venda"] >= 0)
    ].copy()

    df_base_preco = dados_filtrados[
        (dados_filtrados["Qtd Venda"] > 0) & (dados_filtrados["Vlr Venda"] > 0)
    ].copy()

    if not df_base_preco.empty:
        media_preco_par = (
            df_base_preco["Vlr Venda"] / df_base_preco["Qtd Venda"]
        ).mean()
    else:
        media_preco_par = 60.0
        st.warning(
            f"⚠️ Nenhuma venda com valor encontrada. Estimativa padrão de R$ {media_preco_par:.2f} por par foi aplicada."
        )

    dados_filtrados["Vlr Venda Corrigido"] = np.where(
        dados_filtrados["Vlr Venda"] > 0,
        dados_filtrados["Vlr Venda"],
        dados_filtrados["Qtd Venda"] * media_preco_par,
    )

    dados_filtrados["Colecao"] = dados_filtrados["Data Cadastro"].apply(identificar_colecao)

    vendas_colecao = (
        dados_filtrados.dropna(subset=["Colecao"])
        .groupby("Colecao", as_index=False)
        .agg(
            Qtd_Venda=("Qtd Venda", "sum"),
            Vlr_Venda_Corrigido=("Vlr Venda Corrigido", "sum"),
            Data_Inicial=("Data Cadastro", "min"),
            Data_Final=("Data Cadastro", "max"),
        )
    )

    hoje = pd.Timestamp.today().normalize()
    colecao_vigente = identificar_colecao(hoje)

    if colecao_vigente not in vendas_colecao["Colecao"].astype(str).values:
        linha_vigente = pd.DataFrame({
            "Colecao": [colecao_vigente],
            "Qtd_Venda": [0],
            "Vlr_Venda_Corrigido": [0.0],
            "Data_Inicial": [hoje],
            "Data_Final": [hoje],
        })
        vendas_colecao = pd.concat([linha_vigente, vendas_colecao], ignore_index=True)

    colecoes_exibir = (
        vendas_colecao.sort_values("Data_Final", ascending=False)
        .drop_duplicates("Colecao")
        .head(3)
        .copy()
    )
    colecoes_exibir["Pares Vendidos"] = colecoes_exibir["Qtd_Venda"].fillna(0).astype(int)
    colecoes_exibir["Valor Vendido (R$)"] = colecoes_exibir["Vlr_Venda_Corrigido"].fillna(0).apply(brl)
    colecoes_exibir["Período da Coleta"] = colecoes_exibir.apply(
        lambda row: (
            f"{row['Data_Inicial'].strftime('%d/%m/%Y')} a {row['Data_Final'].strftime('%d/%m/%Y')}"
            if pd.notna(row["Data_Inicial"]) and pd.notna(row["Data_Final"])
            else "Período inválido"
        ),
        axis=1,
    )
    colecoes_exibir = colecoes_exibir[
        ["Colecao", "Pares Vendidos", "Valor Vendido (R$)", "Período da Coleta"]
    ].rename(columns={"Colecao": "Coleção"})

    st.markdown("### 👟 Vendas das 3 Últimas Coleções (Pares e Valores)")
    st.table(colecoes_exibir)

    # ========================================================
    # ÚLTIMOS 12 MESES - formato do app_41
    # ========================================================
    st.markdown("### 📆 Vendas dos Últimos 12 Meses")

    dados_filtrados["AnoMes"] = dados_filtrados["Data Cadastro"].dt.to_period("M").dt.to_timestamp()
    ultimos_12 = (
        dados_filtrados.groupby("AnoMes", as_index=False)
        .agg(
            Qtd_Venda=("Qtd Venda", "sum"),
            Vlr_Venda_Corrigido=("Vlr Venda Corrigido", "sum"),
        )
        .sort_values("AnoMes", ascending=False)
        .head(12)
        .sort_values("AnoMes")
    )

    ultimos_12["Mês/Ano"] = ultimos_12["AnoMes"].dt.strftime("%m/%Y")
    ultimos_12["Pares Vendidos"] = ultimos_12["Qtd_Venda"].fillna(0).astype(int)
    ultimos_12["Valor Vendido (R$)"] = ultimos_12["Vlr_Venda_Corrigido"].fillna(0).apply(brl)
    ultimos_12_meses_df = ultimos_12[["Mês/Ano", "Pares Vendidos", "Valor Vendido (R$)"]]
    st.table(ultimos_12_meses_df)

    # ========================================================
    # PREDIÇÃO DE LINHAS - MACHINE LEARNING V2
    # ========================================================
    st.markdown("## 🔮 Linhas com maior probabilidade de próxima compra")
    st.caption(
        "Machine Learning temporal: o modelo aprende, em vários pontos do histórico, "
        "se uma linha será recomprada nos 90 dias seguintes. Compras repetidas no mesmo "
        "pedido/data são consolidadas para não inflar frequência nem criar intervalos de 0 dias."
    )

    @st.cache_data(ttl=3600, show_spinner=False)
    def _preparar_eventos_ml(df_ml):
        base = df_ml.copy()
        base["Data Cadastro"] = pd.to_datetime(base["Data Cadastro"], errors="coerce")
        base["Qtd Venda"] = pd.to_numeric(base["Qtd Venda"], errors="coerce").fillna(0.0)
        base["Vlr Venda"] = pd.to_numeric(base["Vlr Venda"], errors="coerce").fillna(0.0)
        base["Codigo Cliente"] = base["Codigo Cliente"].astype(str).str.strip().str.upper()
        base["Linha"] = base["Linha"].astype(str).str.strip().str.upper()

        if "Numero Pedido" not in base.columns:
            base["Numero Pedido"] = ""

        base["Numero Pedido"] = base["Numero Pedido"].astype(str).str.strip()

        base = base[
            base["Data Cadastro"].notna()
            & base["Codigo Cliente"].ne("")
            & base["Codigo Cliente"].ne("NAN")
            & base["Linha"].ne("")
            & base["Linha"].ne("NAN")
            & (base["Qtd Venda"] > 0)
            & (base["Vlr Venda"] >= 0)
        ].copy()

        if base.empty:
            return pd.DataFrame()

        # Normaliza no nível do dia.
        base["Data Evento"] = base["Data Cadastro"].dt.normalize()

        # Quando há pedido, ele entra na chave; quando não há, a data evita
        # que várias linhas físicas do mesmo dia sejam tratadas como várias compras.
        base["_PedidoML"] = np.where(
            base["Numero Pedido"].isin(["", "nan", "None", "<NA>"]),
            "SEM_PEDIDO_" + base["Data Evento"].dt.strftime("%Y%m%d"),
            base["Numero Pedido"],
        )

        eventos = (
            base.groupby(
                ["Codigo Cliente", "Linha", "Data Evento", "_PedidoML"],
                as_index=False
            )
            .agg(
                Qtd_Evento=("Qtd Venda", "sum"),
                Vlr_Evento=("Vlr Venda", "sum"),
            )
        )

        # Se houver mais de um pedido da mesma linha no mesmo dia, considera
        # uma única ocasião de compra para cálculo de intervalo/frequência.
        eventos = (
            eventos.groupby(
                ["Codigo Cliente", "Linha", "Data Evento"],
                as_index=False
            )
            .agg(
                Qtd_Evento=("Qtd_Evento", "sum"),
                Vlr_Evento=("Vlr_Evento", "sum"),
                Pedidos_Evento=("_PedidoML", "nunique"),
            )
            .sort_values(["Codigo Cliente", "Linha", "Data Evento"])
            .reset_index(drop=True)
        )

        return eventos


    @st.cache_data(ttl=3600, show_spinner=False)
    def _montar_treino_ml(eventos):
        if eventos.empty:
            return pd.DataFrame(), pd.DataFrame(), None

        ev = eventos.copy().sort_values(
            ["Codigo Cliente", "Linha", "Data Evento"]
        ).reset_index(drop=True)

        grp_keys = ["Codigo Cliente", "Linha"]
        g = ev.groupby(grp_keys, sort=False)

        ev["N_Compra"] = g.cumcount() + 1
        ev["Primeira_Compra"] = g["Data Evento"].transform("min")
        ev["Data_Anterior"] = g["Data Evento"].shift(1)
        ev["Proxima_Compra"] = g["Data Evento"].shift(-1)
        ev["Gap_Anterior"] = (ev["Data Evento"] - ev["Data_Anterior"]).dt.days

        ev["Pares_Acumulados"] = g["Qtd_Evento"].cumsum()
        ev["Valor_Acumulado"] = g["Vlr_Evento"].cumsum()

        # Média histórica dos intervalos disponíveis até aquele evento.
        ev["_GapAux"] = pd.to_numeric(ev["Gap_Anterior"], errors="coerce")
        ev["Gap_Medio_Historico"] = (
            ev.groupby(grp_keys)["_GapAux"]
            .transform(lambda s: s.expanding().mean())
        )

        # Mediana global de recompra por linha para linhas com pouco histórico individual.
        gaps_validos = ev.loc[
            ev["Gap_Anterior"].notna() & (ev["Gap_Anterior"] > 0),
            ["Linha", "Gap_Anterior"]
        ].copy()

        mediana_linha = (
            gaps_validos.groupby("Linha")["Gap_Anterior"]
            .median()
            .rename("Gap_Mediano_Linha")
            .reset_index()
        )

        mediana_global = (
            float(gaps_validos["Gap_Anterior"].median())
            if not gaps_validos.empty else 180.0
        )

        ev = ev.merge(mediana_linha, on="Linha", how="left")
        ev["Gap_Mediano_Linha"] = (
            ev["Gap_Mediano_Linha"]
            .fillna(mediana_global)
            .clip(lower=15, upper=730)
        )

        # Horizonte da previsão: compra nos próximos 90 dias.
        horizonte = 90

        # Snapshots simulam o que o modelo saberia X dias depois da última compra.
        idades_snapshot = [15, 30, 60, 90, 120, 180, 270, 365, 540, 730]

        data_final_observada = ev["Data Evento"].max()
        linhas_treino = []

        cols_base = [
            "Codigo Cliente", "Linha", "Data Evento", "Proxima_Compra",
            "N_Compra", "Pares_Acumulados", "Valor_Acumulado",
            "Gap_Anterior", "Gap_Medio_Historico", "Gap_Mediano_Linha",
            "Primeira_Compra"
        ]

        for idade in idades_snapshot:
            snap = ev[cols_base].copy()
            snap["Data_Snapshot"] = snap["Data Evento"] + pd.to_timedelta(idade, unit="D")

            # Se já houve a próxima compra antes do snapshot, esse snapshot não é válido:
            # naquele momento a última compra já seria outra.
            snap = snap[
                snap["Proxima_Compra"].isna()
                | (snap["Proxima_Compra"] > snap["Data_Snapshot"])
            ].copy()

            # Só usamos negativos quando houve tempo para observar todo o horizonte.
            observavel = (
                snap["Proxima_Compra"].notna()
                | (snap["Data_Snapshot"] + pd.Timedelta(days=horizonte) <= data_final_observada)
            )
            snap = snap[observavel].copy()

            if snap.empty:
                continue

            snap["Target_90d"] = (
                snap["Proxima_Compra"].notna()
                & (snap["Proxima_Compra"] <= snap["Data_Snapshot"] + pd.Timedelta(days=horizonte))
            ).astype(int)

            snap["Dias_Desde_Ultima"] = idade
            snap["Tempo_Cliente_Dias"] = (
                snap["Data_Snapshot"] - snap["Primeira_Compra"]
            ).dt.days.clip(lower=0)

            snap["Mes"] = snap["Data_Snapshot"].dt.month
            snap["Mes_Sin"] = np.sin(2 * np.pi * snap["Mes"] / 12.0)
            snap["Mes_Cos"] = np.cos(2 * np.pi * snap["Mes"] / 12.0)

            snap["Gap_Anterior"] = pd.to_numeric(
                snap["Gap_Anterior"], errors="coerce"
            ).fillna(0)

            snap["Gap_Medio_Historico"] = pd.to_numeric(
                snap["Gap_Medio_Historico"], errors="coerce"
            )

            snap["Gap_Esperado"] = (
                snap["Gap_Medio_Historico"]
                .where(snap["Gap_Medio_Historico"] > 0, snap["Gap_Mediano_Linha"])
                .fillna(mediana_global)
                .clip(lower=15, upper=730)
            )

            # Quanto o cliente está próximo do momento esperado de recompra.
            snap["Razao_Ciclo"] = (
                snap["Dias_Desde_Ultima"] / snap["Gap_Esperado"]
            ).clip(0, 5)

            linhas_treino.append(snap)

        if not linhas_treino:
            return pd.DataFrame(), ev, mediana_global

        treino = pd.concat(linhas_treino, ignore_index=True)

        # Controle de memória em bases muito grandes.
        if len(treino) > 300_000:
            treino = treino.sample(300_000, random_state=42)

        return treino, ev, mediana_global


    def _treinar_modelo_temporal(treino):
        features = [
            "N_Compra",
            "Pares_Acumulados",
            "Valor_Acumulado",
            "Gap_Anterior",
            "Gap_Esperado",
            "Dias_Desde_Ultima",
            "Tempo_Cliente_Dias",
            "Razao_Ciclo",
            "Mes_Sin",
            "Mes_Cos",
        ]

        if treino.empty or treino["Target_90d"].nunique() < 2 or len(treino) < 100:
            return None, features, None

        t = treino.sort_values("Data_Snapshot").copy()
        corte = max(1, int(len(t) * 0.80))

        train = t.iloc[:corte].copy()
        test = t.iloc[corte:].copy()

        X_train = (
            train[features]
            .replace([np.inf, -np.inf], np.nan)
            .fillna(0.0)
        )
        y_train = train["Target_90d"].astype(int)

        if y_train.nunique() < 2:
            return None, features, None

        # Peso de classe sem depender de class_weight da versão do sklearn.
        n0 = max(1, int((y_train == 0).sum()))
        n1 = max(1, int((y_train == 1).sum()))
        total = n0 + n1
        peso0 = total / (2 * n0)
        peso1 = total / (2 * n1)
        sample_weight = np.where(y_train.values == 1, peso1, peso0)

        modelo = HistGradientBoostingClassifier(
            learning_rate=0.05,
            max_iter=180,
            max_leaf_nodes=15,
            min_samples_leaf=25,
            l2_regularization=2.0,
            random_state=42,
        )

        modelo.fit(X_train, y_train, sample_weight=sample_weight)

        auc = None
        if len(test) >= 50 and test["Target_90d"].nunique() == 2:
            X_test = (
                test[features]
                .replace([np.inf, -np.inf], np.nan)
                .fillna(0.0)
            )
            y_test = test["Target_90d"].astype(int)

            try:
                prob_test = modelo.predict_proba(X_test)[:, 1]
                auc = float(roc_auc_score(y_test, prob_test))
            except Exception:
                auc = None

        return modelo, features, auc


    eventos_ml = _preparar_eventos_ml(df_total)
    treino_ml, eventos_enriq, mediana_global_ml = _montar_treino_ml(eventos_ml)
    modelo_ml, features_ml, auc_ml = _treinar_modelo_temporal(treino_ml)

    ranking_pred = pd.DataFrame()

    if not eventos_enriq.empty:
        hoje_ml = pd.Timestamp.today().normalize()

        cli_ev = eventos_enriq[
            eventos_enriq["Codigo Cliente"] == codigo
        ].copy()

        if not cli_ev.empty:
            # Uma linha por produto/linha já comprada pelo cliente.
            atual = (
                cli_ev.sort_values("Data Evento")
                .groupby("Linha", as_index=False)
                .agg(
                    Ultima_Compra=("Data Evento", "max"),
                    Primeira_Compra=("Data Evento", "min"),
                    Frequencia=("Data Evento", "nunique"),
                    Pares_Historicos=("Qtd_Evento", "sum"),
                    Valor_Historico=("Vlr_Evento", "sum"),
                    Gap_Anterior=("Gap_Anterior", "last"),
                    Gap_Medio_Historico=("Gap_Anterior", "mean"),
                    Gap_Mediano_Linha=("Gap_Mediano_Linha", "last"),
                )
            )

            atual["Dias_Desde_Ultima"] = (
                hoje_ml - atual["Ultima_Compra"]
            ).dt.days.clip(lower=0)

            atual["Tempo_Cliente_Dias"] = (
                hoje_ml - atual["Primeira_Compra"]
            ).dt.days.clip(lower=0)

            atual["N_Compra"] = atual["Frequencia"]
            atual["Pares_Acumulados"] = atual["Pares_Historicos"]
            atual["Valor_Acumulado"] = atual["Valor_Historico"]

            atual["Gap_Anterior"] = pd.to_numeric(
                atual["Gap_Anterior"], errors="coerce"
            ).fillna(0)

            atual["Gap_Medio_Historico"] = pd.to_numeric(
                atual["Gap_Medio_Historico"], errors="coerce"
            )

            atual["Gap_Esperado"] = (
                atual["Gap_Medio_Historico"]
                .where(
                    atual["Gap_Medio_Historico"] > 0,
                    atual["Gap_Mediano_Linha"]
                )
                .fillna(mediana_global_ml if mediana_global_ml else 180.0)
                .clip(lower=15, upper=730)
            )

            atual["Razao_Ciclo"] = (
                atual["Dias_Desde_Ultima"] / atual["Gap_Esperado"]
            ).clip(0, 5)

            atual["Mes"] = hoje_ml.month
            atual["Mes_Sin"] = np.sin(2 * np.pi * atual["Mes"] / 12.0)
            atual["Mes_Cos"] = np.cos(2 * np.pi * atual["Mes"] / 12.0)

            if modelo_ml is not None:
                X_cli = (
                    atual[features_ml]
                    .replace([np.inf, -np.inf], np.nan)
                    .fillna(0.0)
                )

                p_ml = modelo_ml.predict_proba(X_cli)[:, 1]

                # Penaliza extrapolação muito além de 2 anos sem compra.
                # Isso impede linha de 2017/2018 aparecer com 100%.
                excesso_730 = np.maximum(
                    atual["Dias_Desde_Ultima"].values - 730,
                    0
                )
                fator_dormencia = np.exp(-excesso_730 / 365.0)

                # Ajuste de ciclo: maior aderência quando está perto do intervalo esperado.
                razao = atual["Razao_Ciclo"].values
                fator_ciclo = np.exp(-np.abs(razao - 1.0) / 1.25)
                fator_ciclo = 0.65 + 0.35 * fator_ciclo

                p_final = p_ml * fator_dormencia * fator_ciclo

                # Evita falsa precisão extrema.
                p_final = np.clip(p_final, 0.01, 0.95)

                atual["Probabilidade_Estimada"] = p_final * 100.0
                origem_modelo = "HistGradientBoosting temporal"
            else:
                # Fallback robusto, também respeitando recência e ciclo.
                rec = np.exp(-atual["Dias_Desde_Ultima"] / 540.0)
                ciclo = np.exp(-np.abs(atual["Razao_Ciclo"] - 1.0) / 1.25)

                atual["Probabilidade_Estimada"] = np.clip(
                    100 * (
                        0.45 * rec
                        + 0.30 * ciclo
                        + 0.15 * np.minimum(atual["Frequencia"] / 5.0, 1.0)
                        + 0.10 * np.minimum(atual["Pares_Historicos"] / 100.0, 1.0)
                    ),
                    1,
                    85,
                )
                origem_modelo = "Fallback temporal"

            # Próxima janela baseada no ciclo individual; se houver só uma compra,
            # usa a mediana de recompra daquela linha em todos os clientes.
            atual["Data_Esperada"] = (
                atual["Ultima_Compra"]
                + pd.to_timedelta(atual["Gap_Esperado"].round().astype(int), unit="D")
            )

            atual["Dias_Para_Esperada"] = (
                atual["Data_Esperada"] - hoje_ml
            ).dt.days

            def _janela(row):
                dias = int(row["Dias_Para_Esperada"])
                if dias <= 0:
                    if abs(dias) <= 30:
                        return "🔥 Janela aberta agora"
                    if abs(dias) <= 90:
                        return "🟠 Atrasada até 90 dias"
                    return "⚪ Ciclo muito atrasado"
                if dias <= 30:
                    return "🔥 Próximos 30 dias"
                if dias <= 60:
                    return "🟠 30–60 dias"
                if dias <= 90:
                    return "🟡 60–90 dias"
                return "⚪ Acima de 90 dias"

            atual["Janela_Compra"] = atual.apply(_janela, axis=1)

            # Evita trazer linhas praticamente mortas como prioridade comercial.
            atual = atual[
                atual["Probabilidade_Estimada"] >= 5
            ].copy()

            ranking_pred = (
                atual.sort_values(
                    ["Probabilidade_Estimada", "Ultima_Compra"],
                    ascending=[False, False]
                )
                .head(10)
                .copy()
            )

            if not ranking_pred.empty:
                ranking_pred["Probabilidade"] = ranking_pred[
                    "Probabilidade_Estimada"
                ].map(lambda x: f"{x:.1f}%".replace(".", ","))

                ranking_pred["Última compra"] = ranking_pred[
                    "Ultima_Compra"
                ].dt.strftime("%d/%m/%Y")

                ranking_pred["Frequência"] = ranking_pred[
                    "Frequencia"
                ].astype(int)

                ranking_pred["Intervalo médio"] = ranking_pred[
                    "Gap_Esperado"
                ].round().astype(int).astype(str) + " dias"

                ranking_pred["Pares históricos"] = ranking_pred[
                    "Pares_Historicos"
                ].round().astype(int)

                ranking_pred["Valor histórico"] = ranking_pred[
                    "Valor_Historico"
                ].apply(brl)

                st.dataframe(
                    ranking_pred[
                        [
                            "Linha",
                            "Probabilidade",
                            "Janela_Compra",
                            "Última compra",
                            "Frequência",
                            "Intervalo médio",
                            "Pares históricos",
                            "Valor histórico",
                        ]
                    ].rename(columns={"Janela_Compra": "Próxima janela"}),
                    use_container_width=True,
                    hide_index=True,
                )

                melhor = ranking_pred.iloc[0]
                st.success(
                    f"🎯 Melhor oportunidade: {melhor['Linha']} — "
                    f"{melhor['Probabilidade']} de recompra nos próximos 90 dias | "
                    f"{melhor['Janela_Compra']}."
                )

                if modelo_ml is not None:
                    if auc_ml is not None:
                        st.caption(
                            f"🤖 Modelo ativo: {origem_modelo} | "
                            f"AUC temporal: {auc_ml:.3f} | "
                            f"Treino: {len(treino_ml):,} snapshots".replace(",", ".")
                        )
                    else:
                        st.caption(
                            f"🤖 Modelo ativo: {origem_modelo} | "
                            f"Treino: {len(treino_ml):,} snapshots".replace(",", ".")
                        )
                else:
                    st.caption(
                        "ℹ️ Volume/classes insuficientes para o ML temporal; "
                        "usando fallback com recência + ciclo de recompra."
                    )
            else:
                st.info(
                    "Nenhuma linha atingiu propensão mínima de 5% para os próximos 90 dias."
                )
        else:
            st.info(
                "Este cliente ainda não possui histórico suficiente para gerar previsão por linha."
            )
    else:
        st.info("Base insuficiente para preparar o modelo preditivo temporal.")


    # ========================================================
    # PROBABILIDADE DE COMPRA EM UM MÊS SELECIONADO
    # ========================================================
    st.markdown("## 📅 Probabilidade de compra por mês")

    meses_opcoes = {
        "Janeiro": 1, "Fevereiro": 2, "Março": 3, "Abril": 4,
        "Maio": 5, "Junho": 6, "Julho": 7, "Agosto": 8,
        "Setembro": 9, "Outubro": 10, "Novembro": 11, "Dezembro": 12,
    }

    mes_nome_sel = st.selectbox(
        "Selecione o mês para estimar a probabilidade de compra",
        list(meses_opcoes.keys()),
        index=max(0, pd.Timestamp.today().month - 1),
        key=f"mes_prob_compra_{codigo}"
    )
    mes_sel = meses_opcoes[mes_nome_sel]

    def _probabilidade_mes_cliente(df_cliente_eventos, mes_alvo, ano_ref):
        if df_cliente_eventos is None or df_cliente_eventos.empty:
            return None

        hist = df_cliente_eventos.copy()
        hist["Data Evento"] = pd.to_datetime(hist["Data Evento"], errors="coerce")
        hist = hist.dropna(subset=["Data Evento"]).copy()

        if hist.empty:
            return None

        # Total de ocasiões de compra distintas do cliente
        dias_compra = (
            hist[["Data Evento"]]
            .drop_duplicates()
            .sort_values("Data Evento")
        )

        # Histórico mensal agregado
        mensal = (
            hist.assign(
                Ano=hist["Data Evento"].dt.year,
                Mes=hist["Data Evento"].dt.month
            )
            .groupby(["Ano", "Mes"], as_index=False)
            .agg(
                Compras=("Data Evento", "nunique"),
                Pares=("Qtd_Evento", "sum"),
                Valor=("Vlr_Evento", "sum"),
            )
        )

        anos_hist = sorted(mensal["Ano"].unique().tolist())
        if not anos_hist:
            return None

        # Presença histórica no mês selecionado
        anos_com_compra_mes = mensal.loc[
            mensal["Mes"] == mes_alvo, "Ano"
        ].nunique()

        taxa_presenca_mes = anos_com_compra_mes / max(1, len(anos_hist))

        # Frequência relativa de compras no mês
        total_compras = mensal["Compras"].sum()
        compras_mes = mensal.loc[
            mensal["Mes"] == mes_alvo, "Compras"
        ].sum()

        taxa_freq_mes = (
            compras_mes / total_compras
            if total_compras > 0 else 0.0
        )

        # Peso de recência: anos recentes pesam mais
        mensal["PesoRecencia"] = np.exp(
            -(ano_ref - mensal["Ano"]).clip(lower=0) / 2.5
        )

        rec_mes = mensal.loc[
            mensal["Mes"] == mes_alvo, "PesoRecencia"
        ].sum()

        rec_total = mensal["PesoRecencia"].sum()
        taxa_rec_mes = (
            rec_mes / rec_total
            if rec_total > 0 else 0.0
        )

        # Sazonalidade via seno/cosseno do mês
        angulo = 2 * np.pi * mes_alvo / 12.0
        mes_sin = np.sin(angulo)
        mes_cos = np.cos(angulo)

        # Afinidade sazonal do cliente:
        # compara o mês alvo com o "centro" circular dos meses em que ele compra
        meses_hist = hist["Data Evento"].dt.month.to_numpy()
        if len(meses_hist) > 0:
            sin_hist = np.sin(2 * np.pi * meses_hist / 12.0).mean()
            cos_hist = np.cos(2 * np.pi * meses_hist / 12.0).mean()

            dist = np.sqrt(
                (mes_sin - sin_hist) ** 2 +
                (mes_cos - cos_hist) ** 2
            )
            afinidade_sazonal = float(np.exp(-dist))
        else:
            afinidade_sazonal = 0.0

        # Recência geral do cliente
        ultima_data = hist["Data Evento"].max()
        hoje_ref = pd.Timestamp.today().normalize()
        dias_sem_compra = max(0, (hoje_ref - ultima_data).days)
        recencia_geral = float(np.exp(-dias_sem_compra / 365.0))

        # Probabilidade mensal base:
        # presença histórica + frequência + recência do mês + afinidade sazonal
        prob_base = (
            0.35 * taxa_presenca_mes
            + 0.25 * min(taxa_freq_mes * 12, 1.0)
            + 0.20 * min(taxa_rec_mes * 12, 1.0)
            + 0.20 * afinidade_sazonal
        )

        # Ajuste pela atividade recente do cliente
        prob_ajustada = prob_base * (0.65 + 0.35 * recencia_geral)

        # Faixa conservadora para evitar falsa certeza extrema
        prob_ajustada = float(np.clip(prob_ajustada, 0.01, 0.95))

        return {
            "prob": prob_ajustada * 100,
            "taxa_presenca_mes": taxa_presenca_mes * 100,
            "anos_com_compra_mes": int(anos_com_compra_mes),
            "anos_historico": int(len(anos_hist)),
            "compras_mes": int(compras_mes),
            "dias_sem_compra": int(dias_sem_compra),
        }

    prob_mes = _probabilidade_mes_cliente(
        cli_ev if "cli_ev" in locals() else pd.DataFrame(),
        mes_sel,
        pd.Timestamp.today().year
    )

    if prob_mes is not None:
        prob_mes_val = prob_mes["prob"]

        if prob_mes_val >= 70:
            nivel_mes = "🔥 Alta"
        elif prob_mes_val >= 40:
            nivel_mes = "🟡 Média"
        else:
            nivel_mes = "⚪ Baixa"

        c_mes1, c_mes2, c_mes3 = st.columns(3)

        c_mes1.metric(
            f"Probabilidade em {mes_nome_sel}",
            f"{prob_mes_val:.1f}%".replace(".", ",")
        )

        c_mes2.metric(
            "Nível",
            nivel_mes
        )

        c_mes3.metric(
            "Histórico no mês",
            f"{prob_mes['anos_com_compra_mes']} de {prob_mes['anos_historico']} anos"
        )

        st.caption(
            f"Baseado no padrão histórico do cliente: presença no mês, frequência, "
            f"recência e sazonalidade. Compras registradas em {mes_nome_sel}: "
            f"{prob_mes['compras_mes']}."
        )

        # Ranking das linhas mais prováveis para o mês selecionado
        if "atual" in locals() and not atual.empty:
            mensal_linhas = eventos_enriq[
                (eventos_enriq["Codigo Cliente"] == codigo)
                & (eventos_enriq["Data Evento"].dt.month == mes_sel)
            ].copy()

            hist_linha_mes = (
                mensal_linhas.groupby("Linha", as_index=False)
                .agg(
                    Compras_no_Mes=("Data Evento", "nunique"),
                    Pares_no_Mes=("Qtd_Evento", "sum"),
                    Ultima_no_Mes=("Data Evento", "max"),
                )
                if not mensal_linhas.empty
                else pd.DataFrame(
                    columns=[
                        "Linha", "Compras_no_Mes",
                        "Pares_no_Mes", "Ultima_no_Mes"
                    ]
                )
            )

            linhas_mes = atual.merge(
                hist_linha_mes,
                on="Linha",
                how="left"
            )

            linhas_mes["Compras_no_Mes"] = (
                pd.to_numeric(
                    linhas_mes["Compras_no_Mes"],
                    errors="coerce"
                ).fillna(0)
            )

            linhas_mes["Pares_no_Mes"] = (
                pd.to_numeric(
                    linhas_mes["Pares_no_Mes"],
                    errors="coerce"
                ).fillna(0)
            )

            max_comp_mes = max(
                1.0,
                float(linhas_mes["Compras_no_Mes"].max())
            )

            saz_linha = (
                linhas_mes["Compras_no_Mes"] / max_comp_mes
            ).clip(0, 1)

            # Combina propensão ML geral da linha com sazonalidade específica do mês.
            linhas_mes["Probabilidade_Mes"] = np.clip(
                (
                    0.65 * (
                        linhas_mes["Probabilidade_Estimada"] / 100.0
                    )
                    + 0.35 * saz_linha
                )
                * (0.60 + 0.40 * (prob_mes_val / 100.0))
                * 100.0,
                1,
                95
            )

            ranking_mes = (
                linhas_mes.sort_values(
                    ["Probabilidade_Mes", "Compras_no_Mes"],
                    ascending=[False, False]
                )
                .head(10)
                .copy()
            )

            ranking_mes["Probabilidade no mês"] = (
                ranking_mes["Probabilidade_Mes"]
                .map(lambda x: f"{x:.1f}%".replace(".", ","))
            )

            ranking_mes["Compras nesse mês"] = (
                ranking_mes["Compras_no_Mes"]
                .fillna(0)
                .astype(int)
            )

            ranking_mes["Pares nesse mês"] = (
                ranking_mes["Pares_no_Mes"]
                .fillna(0)
                .round()
                .astype(int)
            )

            ranking_mes["Última compra"] = (
                ranking_mes["Ultima_Compra"]
                .dt.strftime("%d/%m/%Y")
            )

            st.markdown(
                f"### 🎯 Linhas com maior probabilidade para {mes_nome_sel}"
            )

            st.dataframe(
                ranking_mes[
                    [
                        "Linha",
                        "Probabilidade no mês",
                        "Compras nesse mês",
                        "Pares nesse mês",
                        "Última compra",
                    ]
                ],
                use_container_width=True,
                hide_index=True,
            )

            if not ranking_mes.empty:
                melhor_mes = ranking_mes.iloc[0]
                st.success(
                    f"📌 Melhor oportunidade para {mes_nome_sel}: "
                    f"{melhor_mes['Linha']} — "
                    f"{melhor_mes['Probabilidade no mês']}."
                )
    else:
        st.info(
            "Histórico insuficiente para calcular a probabilidade mensal deste cliente."
        )

    # ========================================================
    # LINHAS / CATEGORIAS NÃO COMPRADAS - mesma lógica do app_41
    # ========================================================
    st.markdown("## 🧾 Linhas e Categorias que o Cliente Ainda Não Comprou")

    linhas_nao_compradas = pd.DataFrame(columns=["codigo_linha", "linha"])
    categorias_nao_compradas = pd.DataFrame(columns=["categorias"])

    try:
        linhas_validas = pd.read_excel(URL_LINHAS_XLSX, engine="openpyxl")
        linhas_validas.columns = [
            unicodedata.normalize("NFKD", str(col))
            .encode("ASCII", "ignore")
            .decode("utf-8")
            .strip()
            .lower()
            .replace(" ", "_")
            for col in linhas_validas.columns
        ]

        if "linha" not in linhas_validas.columns:
            similares = [c for c in linhas_validas.columns if "linha" in c]
            if similares:
                linhas_validas.rename(columns={similares[0]: "linha"}, inplace=True)
            else:
                raise ValueError(
                    f"A coluna 'linha' não foi encontrada. Colunas disponíveis: {list(linhas_validas.columns)}"
                )

        linhas_validas = linhas_validas.drop_duplicates(subset=["linha"]).copy()
        linhas_validas["linha"] = linhas_validas["linha"].astype(str).str.strip().str.upper()

        if "codigo_linha" not in linhas_validas.columns:
            cols_cod = [c for c in linhas_validas.columns if "cod" in c]
            if cols_cod:
                linhas_validas.rename(columns={cols_cod[0]: "codigo_linha"}, inplace=True)
            else:
                linhas_validas["codigo_linha"] = ""

        linhas_validas["codigo_linha"] = linhas_validas["codigo_linha"].astype(str).str.strip()

        linhas_compradas = (
            dados_filtrados.loc[dados_filtrados["Qtd Venda"] > 0, "Linha"]
            .dropna()
            .astype(str)
            .str.strip()
            .str.upper()
            .unique()
        )

        linhas_nao_compradas = (
            linhas_validas[~linhas_validas["linha"].isin(linhas_compradas)][["codigo_linha", "linha"]]
            .drop_duplicates()
            .sort_values("linha")
            .reset_index(drop=True)
        )

        df_categorias = pd.read_csv(URL_CATEGORIAS, encoding="latin1", sep=";")
        df_categorias.columns = [
            unicodedata.normalize("NFKD", str(col))
            .encode("ASCII", "ignore")
            .decode("utf-8")
            .strip()
            .lower()
            .replace(" ", "_")
            for col in df_categorias.columns
        ]

        for col in ["categorias", "codigo_linha"]:
            if col not in df_categorias.columns:
                raise ValueError(f"A coluna '{col}' não foi encontrada no arquivo CATEGORIAS.csv.")

        df_categorias["categorias"] = df_categorias["categorias"].astype(str).str.strip().str.upper()
        df_categorias["codigo_linha"] = df_categorias["codigo_linha"].astype(str).str.strip()

        merge = linhas_nao_compradas.copy()
        merge["codigo_linha"] = merge["codigo_linha"].astype(str).str.strip()
        categorias_nao_compradas = (
            merge.merge(
                df_categorias[["codigo_linha", "categorias"]],
                on="codigo_linha",
                how="left",
            )[["categorias"]]
            .dropna()
            .drop_duplicates()
            .sort_values("categorias")
            .reset_index(drop=True)
        )

    except Exception as e:
        st.warning(f"⚠️ Não foi possível concluir a análise de linhas/categorias: {e}")

    col_mix1, col_mix2 = st.columns(2)

    with col_mix1:
        st.markdown("### 📄 Linhas que o Cliente Ainda Não Comprou")
        if linhas_nao_compradas.empty:
            st.success("✅ O cliente comprou todas as linhas.")
        else:
            st.dataframe(
                linhas_nao_compradas[["codigo_linha", "linha"]].sort_values("linha"),
                use_container_width=True,
                hide_index=True,
            )

    with col_mix2:
        st.markdown("### 📑 Categorias que o Cliente Ainda Não Comprou")
        if categorias_nao_compradas.empty:
            st.success("✅ O cliente comprou todas as categorias.")
        else:
            st.dataframe(
                categorias_nao_compradas,
                use_container_width=True,
                hide_index=True,
            )

    # Mantém os objetos disponíveis para futuras exportações/relatórios.
    st.session_state["nome_grupo"] = str(nome_grupo)
    st.session_state["total_lojas"] = total_lojas
    st.session_state["cods_repr_str"] = rep
    st.session_state["nome_supervisor"] = nome_sup
    st.session_state["ultima_compra"] = ultima_compra
    st.session_state["periodo_analise"] = periodo_analise
    st.session_state["melhor_mes_nome"] = melhor_mes_nome
    st.session_state["colecoes_exibir"] = colecoes_exibir
    st.session_state["ultimos_12_meses_df"] = ultimos_12_meses_df
    st.session_state["linhas_nao_compradas"] = linhas_nao_compradas
    st.session_state["categorias_nao_compradas"] = categorias_nao_compradas

# ============================================================
# AUTENTICAÇÃO SUPABASE + LOG DE ACESSO
# ============================================================
@st.cache_resource
def get_supabase():
    import os

    # RENDER
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SECRET_KEY")

    # LOCAL - usa .streamlit/secrets.toml
    if not url or not key:
        try:
            url = st.secrets["supabase"]["url"]
            key = st.secrets["supabase"]["secret_key"]
        except Exception:
            pass

    if not url or not key:
        raise RuntimeError(
            "Configuração do Supabase ausente. "
            "Configure SUPABASE_URL e SUPABASE_SECRET_KEY."
        )

    return create_client(url, key)


def _detectar_navegador_sistema(user_agent):
    ua = (user_agent or "").lower()

    if "edg/" in ua:
        navegador = "Edge"
    elif "chrome/" in ua and "chromium" not in ua:
        navegador = "Chrome"
    elif "firefox/" in ua:
        navegador = "Firefox"
    elif "safari/" in ua and "chrome/" not in ua:
        navegador = "Safari"
    else:
        navegador = "Outro"

    if "windows" in ua:
        sistema = "Windows"
    elif "android" in ua:
        sistema = "Android"
    elif "iphone" in ua or "ipad" in ua or "ios" in ua:
        sistema = "iOS"
    elif "mac os" in ua or "macintosh" in ua:
        sistema = "macOS"
    elif "linux" in ua:
        sistema = "Linux"
    else:
        sistema = "Outro"

    dispositivo = "Mobile" if any(x in ua for x in ["mobile", "android", "iphone"]) else "Desktop"
    return navegador, sistema, dispositivo


def _ip_publico(ip):
    if not ip:
        return False
    ip = str(ip).strip()
    return not (
        ip.startswith("127.")
        or ip.startswith("10.")
        or ip.startswith("192.168.")
        or ip.startswith("172.16.")
        or ip in {"::1", "localhost"}
    )


@st.cache_data(ttl=3600, show_spinner=False)
def geolocalizar_ip(ip):
    """Geolocalização aproximada por IP. Não representa GPS/endereço exato."""
    base = {"cidade": None, "estado": None, "pais": None, "latitude": None, "longitude": None}
    if not _ip_publico(ip):
        return base
    try:
        r = requests.get(f"https://ipapi.co/{ip}/json/", timeout=6)
        if r.ok:
            j = r.json()
            base.update({
                "cidade": j.get("city"),
                "estado": j.get("region_code") or j.get("region"),
                "pais": j.get("country_name"),
                "latitude": j.get("latitude"),
                "longitude": j.get("longitude"),
            })
    except Exception:
        pass
    return base


def contexto_acesso():
    ip = None
    user_agent = ""
    timezone_browser = None

    try:
        ip = getattr(st.context, "ip_address", None)
    except Exception:
        pass

    try:
        headers = st.context.headers
        user_agent = headers.get("User-Agent", "")
        if not ip:
            forwarded = headers.get("X-Forwarded-For", "")
            if forwarded:
                ip = forwarded.split(",")[0].strip()
    except Exception:
        pass

    try:
        timezone_browser = getattr(st.context, "timezone", None)
    except Exception:
        pass

    navegador, sistema, dispositivo = _detectar_navegador_sistema(user_agent)
    geo = geolocalizar_ip(ip)

    return {
        "ip": ip,
        "cidade": geo["cidade"],
        "estado": geo["estado"],
        "pais": geo["pais"],
        "latitude": geo["latitude"],
        "longitude": geo["longitude"],
        "dispositivo": dispositivo,
        "navegador": navegador,
        "sistema_operacional": sistema,
        "timezone_browser": timezone_browser,
    }


def registrar_log_acesso(usuario_dados, evento="LOGIN"):
    try:
        supabase = get_supabase()
        ctx = contexto_acesso()
        payload = {
            "usuario": str(usuario_dados.get("usuario", "")),
            "nome": usuario_dados.get("nome"),
            "perfil": usuario_dados.get("perfil"),
            "codigo_representante": usuario_dados.get("codigo_representante"),
            "ip": ctx.get("ip"),
            "cidade": ctx.get("cidade"),
            "estado": ctx.get("estado"),
            "pais": ctx.get("pais"),
            "latitude": ctx.get("latitude"),
            "longitude": ctx.get("longitude"),
            "dispositivo": ctx.get("dispositivo"),
            "navegador": ctx.get("navegador"),
            "sistema_operacional": ctx.get("sistema_operacional"),
            "session_id": st.session_state.get("session_id"),
            "evento": evento,
        }
        supabase.table("log_acesso").insert(payload).execute()

        if evento == "LOGIN":
            supabase.table("usuarios").update({
                "ultimo_acesso": datetime.now(timezone.utc).isoformat(),
                "ultimo_ip": ctx.get("ip"),
                "ultima_cidade": ctx.get("cidade"),
                "ultimo_estado": ctx.get("estado"),
            }).eq("usuario", str(usuario_dados.get("usuario", ""))).execute()
    except Exception as e:
        # O log nunca deve derrubar a aplicação.
        print(f"Falha ao registrar log de acesso: {e}")


def registrar_login_falhou(usuario):
    try:
        dados = {"usuario": str(usuario or ""), "nome": None, "perfil": None, "codigo_representante": None}
        registrar_log_acesso(dados, evento="LOGIN_FALHOU")
    except Exception:
        pass



@st.cache_data(ttl=60, show_spinner=False)
def carregar_logs_acesso(limite=3000):
    """Lê os registros da tabela log_acesso no Supabase."""
    supabase = get_supabase()

    try:
        resp = (
            supabase.table("log_acesso")
            .select("*")
            .order("created_at", desc=True)
            .limit(int(limite))
            .execute()
        )
    except Exception:
        # Compatibilidade caso a tabela não possua created_at.
        resp = (
            supabase.table("log_acesso")
            .select("*")
            .limit(int(limite))
            .execute()
        )

    return pd.DataFrame(resp.data or [])


def exibir_logs_acesso_admin():
    """Painel de auditoria visível somente para ADMIN."""
    st.title("📋 Logs de Acesso")
    st.caption(
        "Auditoria de login, logout e tentativas de acesso registradas no Supabase."
    )

    if st.button("🔄 Atualizar logs", use_container_width=False):
        carregar_logs_acesso.clear()
        st.rerun()

    try:
        logs = carregar_logs_acesso()
    except Exception as e:
        st.error(
            "Não foi possível consultar a tabela `log_acesso` no Supabase. "
            f"Detalhe: {e}"
        )
        st.info(
            "Confirme no Supabase se a tabela `log_acesso` existe e se a chave "
            "usada pelo aplicativo possui permissão de leitura."
        )
        return

    if logs.empty:
        st.warning(
            "A tabela de logs está acessível, mas ainda não possui registros."
        )
        return

    # ----------------------------------------------------------
    # DATA/HORA
    # ----------------------------------------------------------
    coluna_data = None
    for cand in [
        "created_at", "data_hora", "data", "timestamp",
        "criado_em", "created"
    ]:
        if cand in logs.columns:
            coluna_data = cand
            break

    if coluna_data:
        logs["_DataHoraUTC"] = pd.to_datetime(
            logs[coluna_data],
            errors="coerce",
            utc=True
        )

        try:
            logs["_DataHoraBR"] = (
                logs["_DataHoraUTC"]
                .dt.tz_convert("America/Sao_Paulo")
            )
        except Exception:
            logs["_DataHoraBR"] = logs["_DataHoraUTC"]

        logs["Data/Hora"] = logs["_DataHoraBR"].dt.strftime(
            "%d/%m/%Y %H:%M:%S"
        )
    else:
        logs["_DataHoraUTC"] = pd.NaT
        logs["_DataHoraBR"] = pd.NaT
        logs["Data/Hora"] = ""

    # ----------------------------------------------------------
    # NORMALIZA CAMPOS
    # ----------------------------------------------------------
    for c in [
        "usuario", "nome", "perfil", "codigo_representante",
        "evento", "ip", "cidade", "estado", "pais",
        "dispositivo", "navegador", "sistema_operacional",
        "session_id"
    ]:
        if c not in logs.columns:
            logs[c] = ""

        logs[c] = logs[c].fillna("").astype(str).str.strip()

    logs["evento"] = logs["evento"].replace("", "SEM EVENTO")

    # ----------------------------------------------------------
    # KPIs
    # ----------------------------------------------------------
    agora_br = pd.Timestamp.now(tz="America/Sao_Paulo")
    hoje_br = agora_br.date()

    if coluna_data:
        datas_validas = logs["_DataHoraBR"].notna()

        logins_hoje = int(
            (
                datas_validas
                & (logs["_DataHoraBR"].dt.date == hoje_br)
                & (logs["evento"].str.upper() == "LOGIN")
            ).sum()
        )

        falhas_hoje = int(
            (
                datas_validas
                & (logs["_DataHoraBR"].dt.date == hoje_br)
                & (logs["evento"].str.upper() == "LOGIN_FALHOU")
            ).sum()
        )

        corte_30 = agora_br - pd.Timedelta(days=30)
        usuarios_30 = int(
            logs.loc[
                datas_validas
                & (logs["_DataHoraBR"] >= corte_30)
                & (logs["evento"].str.upper() == "LOGIN"),
                "usuario"
            ]
            .replace("", np.nan)
            .dropna()
            .nunique()
        )
    else:
        logins_hoje = 0
        falhas_hoje = 0
        usuarios_30 = int(
            logs.loc[
                logs["evento"].str.upper() == "LOGIN",
                "usuario"
            ]
            .replace("", np.nan)
            .dropna()
            .nunique()
        )

    total_logins = int(
        (logs["evento"].str.upper() == "LOGIN").sum()
    )

    k1, k2, k3, k4 = st.columns(4)
    k1.metric("Logins hoje", logins_hoje)
    k2.metric("Falhas hoje", falhas_hoje)
    k3.metric("Usuários únicos 30 dias", usuarios_30)
    k4.metric("Logins registrados", total_logins)

    # ----------------------------------------------------------
    # TODOS OS USUÁRIOS QUE JÁ ACESSARAM
    # ----------------------------------------------------------
    usuarios_acesso = logs[
        logs["evento"].str.upper().eq("LOGIN")
    ].copy()

    if not usuarios_acesso.empty:
        if coluna_data:
            usuarios_acesso = usuarios_acesso.sort_values(
                "_DataHoraBR",
                ascending=False
            )

        usuarios_resumo = (
            usuarios_acesso.groupby(
                ["usuario", "nome", "perfil", "codigo_representante"],
                dropna=False,
                as_index=False
            )
            .agg(
                Total_Acessos=("evento", "size"),
                Ultimo_Acesso=(
                    "_DataHoraBR",
                    "max"
                ) if coluna_data else ("evento", "size"),
            )
        )

        if coluna_data:
            usuarios_resumo["Último acesso"] = pd.to_datetime(
                usuarios_resumo["Ultimo_Acesso"],
                errors="coerce"
            ).dt.strftime("%d/%m/%Y %H:%M:%S")
        else:
            usuarios_resumo["Último acesso"] = ""

        usuarios_resumo = usuarios_resumo.rename(columns={
            "usuario": "Usuário",
            "nome": "Nome",
            "perfil": "Perfil",
            "codigo_representante": "Representante",
            "Total_Acessos": "Total de acessos",
        })

        st.markdown("### 👥 Todos os usuários que já acessaram")
        st.dataframe(
            usuarios_resumo[
                [
                    "Usuário",
                    "Nome",
                    "Perfil",
                    "Representante",
                    "Total de acessos",
                    "Último acesso",
                ]
            ].sort_values(
                ["Último acesso", "Usuário"],
                ascending=[False, True]
            ),
            use_container_width=True,
            hide_index=True,
            height=320,
        )

    # ----------------------------------------------------------
    # FILTROS
    # ----------------------------------------------------------
    st.markdown("### 🔎 Filtros")

    f1, f2, f3 = st.columns([1.4, 1.4, 2.0])

    eventos_disp = sorted(
        [x for x in logs["evento"].unique().tolist() if x]
    )

    eventos_sel = f1.multiselect(
        "Evento",
        eventos_disp,
        default=eventos_disp
    )

    perfis_disp = sorted(
        [x for x in logs["perfil"].unique().tolist() if x]
    )

    perfis_sel = f2.multiselect(
        "Perfil",
        perfis_disp,
        default=perfis_disp
    )

    busca = f3.text_input(
        "Buscar usuário, nome, representante, cidade ou IP",
        placeholder="Digite parte do nome, usuário, código, cidade ou IP..."
    ).strip()

    filtrado = logs.copy()

    if eventos_sel:
        filtrado = filtrado[
            filtrado["evento"].isin(eventos_sel)
        ].copy()

    if perfis_sel:
        filtrado = filtrado[
            filtrado["perfil"].isin(perfis_sel)
        ].copy()

    if busca:
        chave = norm(busca)

        mascara = pd.Series(False, index=filtrado.index)

        for c in [
            "usuario", "nome", "codigo_representante",
            "cidade", "estado", "ip"
        ]:
            mascara = mascara | filtrado[c].apply(
                lambda x: chave in norm(x)
            )

        filtrado = filtrado[mascara].copy()

    if coluna_data:
        datas_disponiveis = filtrado["_DataHoraBR"].dropna()

        if not datas_disponiveis.empty:
            data_min = datas_disponiveis.min().date()
            data_max = datas_disponiveis.max().date()

            periodo = st.date_input(
                "Período",
                value=(data_min, data_max),
                min_value=data_min,
                max_value=data_max,
            )

            if isinstance(periodo, (tuple, list)) and len(periodo) == 2:
                ini, fim = periodo

                filtrado = filtrado[
                    filtrado["_DataHoraBR"].notna()
                    & (filtrado["_DataHoraBR"].dt.date >= ini)
                    & (filtrado["_DataHoraBR"].dt.date <= fim)
                ].copy()

    # Mais recentes primeiro.
    if coluna_data:
        filtrado = filtrado.sort_values(
            "_DataHoraBR",
            ascending=False
        )

    st.markdown(
        f"### 🧾 Registros encontrados: {len(filtrado):,}".replace(",", ".")
    )

    colunas_exibir = [
        "Data/Hora",
        "evento",
        "usuario",
        "nome",
        "perfil",
        "codigo_representante",
        "ip",
        "cidade",
        "estado",
        "pais",
        "dispositivo",
        "navegador",
        "sistema_operacional",
    ]

    tabela = filtrado[
        [c for c in colunas_exibir if c in filtrado.columns]
    ].copy()

    tabela = tabela.rename(columns={
        "evento": "Evento",
        "usuario": "Usuário",
        "nome": "Nome",
        "perfil": "Perfil",
        "codigo_representante": "Representante",
        "ip": "IP",
        "cidade": "Cidade",
        "estado": "UF/Estado",
        "pais": "País",
        "dispositivo": "Dispositivo",
        "navegador": "Navegador",
        "sistema_operacional": "Sistema",
    })

    st.dataframe(
        tabela,
        use_container_width=True,
        hide_index=True,
        height=570
    )

    if not tabela.empty:
        csv_logs = tabela.to_csv(
            index=False,
            sep=";",
            encoding="utf-8-sig"
        ).encode("utf-8-sig")

        st.download_button(
            "⬇️ Exportar logs filtrados",
            data=csv_logs,
            file_name=(
                "logs_acesso_"
                + datetime.now().strftime("%Y%m%d_%H%M%S")
                + ".csv"
            ),
            mime="text/csv",
            use_container_width=False,
        )


def _buscar_usuario(usuario):
    supabase = get_supabase()
    resp = (
        supabase.table("usuarios")
        .select("id,usuario,nome,senha_hash,perfil,codigo_representante,ativo,trocar_senha,representante,codigo_supervisor,supervisor,gerente")
        .eq("usuario", str(usuario).strip())
        .limit(1)
        .execute()
    )
    dados = resp.data or []
    return dados[0] if dados else None


def _senha_confere(senha_digitada, senha_hash):
    try:
        return bcrypt.checkpw(
            str(senha_digitada).encode("utf-8"),
            str(senha_hash).encode("utf-8"),
        )
    except Exception:
        return False


def _trocar_senha(usuario, nova_senha):
    senha_hash = bcrypt.hashpw(
        nova_senha.encode("utf-8"),
        bcrypt.gensalt(rounds=12),
    ).decode("utf-8")

    get_supabase().table("usuarios").update({
        "senha_hash": senha_hash,
        "trocar_senha": False,
        "senha_alterada_em": datetime.now(timezone.utc).isoformat(),
    }).eq("usuario", str(usuario)).execute()


def autenticar_usuario_supabase():
    """
    Login pelo código do representante.
    ADMIN usa o usuário admin.
    Representantes ficam vinculados ao codigo_representante do cadastro.
    """
    if "session_id" not in st.session_state:
        st.session_state["session_id"] = str(uuid.uuid4())

    st.session_state.setdefault("autenticado", False)

    if not st.session_state["autenticado"]:
        st.markdown("## 🔐 Acesso — KIDY Sales Intelligence")
        st.caption("Entre com seu código de representante e sua senha.")

        with st.form("form_login", clear_on_submit=False):
            usuario = st.text_input("Usuário / Código do representante").strip()
            senha = st.text_input("Senha", type="password")
            entrar = st.form_submit_button("Entrar", use_container_width=True)

        if entrar:
            try:
                dados = _buscar_usuario(usuario)
            except Exception as e:
                st.error(f"Não foi possível conectar ao banco de autenticação: {e}")
                st.stop()

            if not dados:
                registrar_login_falhou(usuario)
                st.error("Usuário não encontrado.")
                st.stop()

            if not bool(dados.get("ativo", True)):
                registrar_login_falhou(usuario)
                st.error("Usuário inativo. Procure o administrador.")
                st.stop()

            if not _senha_confere(senha, dados.get("senha_hash", "")):
                registrar_login_falhou(usuario)
                st.error("Senha incorreta.")
                st.stop()

            st.session_state["autenticado"] = True
            st.session_state["usuario_logado"] = dados.get("usuario")
            st.session_state["usuario_dados"] = dados
            registrar_log_acesso(dados, evento="LOGIN")
            st.rerun()

        st.stop()

    dados = st.session_state.get("usuario_dados") or {}

    # Primeiro acesso dos representantes: obriga troca da senha inicial.
    if bool(dados.get("trocar_senha", False)):
        st.warning("Primeiro acesso: crie uma nova senha antes de continuar.")
        with st.form("form_troca_senha"):
            nova1 = st.text_input("Nova senha", type="password")
            nova2 = st.text_input("Confirme a nova senha", type="password")
            salvar = st.form_submit_button("Salvar nova senha", use_container_width=True)

        if salvar:
            if len(nova1) < 6:
                st.error("A nova senha deve ter pelo menos 6 caracteres.")
            elif nova1 != nova2:
                st.error("As senhas digitadas são diferentes.")
            elif nova1 == str(dados.get("usuario", "")):
                st.error("A nova senha não pode ser igual ao código do representante.")
            else:
                try:
                    _trocar_senha(dados.get("usuario"), nova1)
                    dados["trocar_senha"] = False
                    st.session_state["usuario_dados"] = dados
                    st.success("Senha alterada com sucesso.")
                    st.rerun()
                except Exception as e:
                    st.error(f"Não foi possível alterar a senha: {e}")
        st.stop()

    # Identificação e logout no menu lateral.
    nome_exibicao = dados.get("nome") or dados.get("usuario") or "Usuário"
    perfil = dados.get("perfil") or ""
    st.sidebar.success(f"👤 {nome_exibicao}")
    if perfil:
        st.sidebar.caption(f"Perfil: {perfil}")

    if st.sidebar.button("🚪 Sair", use_container_width=True):
        registrar_log_acesso(dados, evento="LOGOUT")
        session_id = str(uuid.uuid4())
        for chave in ["autenticado", "usuario_logado", "usuario_dados", "cliente_selecionado", "status_cliente_selecionado"]:
            st.session_state.pop(chave, None)
        st.session_state["session_id"] = session_id
        st.rerun()

    return str(dados.get("usuario", "")).strip(), dados


# ============================================================
# CABEÇALHO / CARGA
# ============================================================
st.title("📍 KIDY Sales Intelligence")
st.caption("Supervisor → Representante → Cidade → Rota → Clientes prioritários → Análise do cliente")

usuario_logado, usuario_dados = autenticar_usuario_supabase()

# ============================================================
# MENU ADMINISTRATIVO
# ============================================================
perfil_logado = str(usuario_dados.get("perfil", "")).strip().upper()

if perfil_logado == "ADMIN":
    # Logo visível somente para o administrador.
    try:
        logo = load_logo()
        st.sidebar.image(logo, width=105)
    except Exception:
        pass

    st.sidebar.divider()
    pagina_admin = st.sidebar.radio(
        "🛠️ Administração",
        ["📍 KIDY Sales Intelligence", "📋 Logs de Acesso"],
        key="pagina_admin"
    )

    if pagina_admin == "📋 Logs de Acesso":
        exibir_logs_acesso_admin()
        st.stop()

try:
    with st.spinner("Carregando base comercial..."):
        df_vendas, df_carteira = carregar_dados()
except Exception as e:
    st.error(f"Erro ao carregar a base: {e}")
    st.stop()

st.sidebar.caption(f"✅ Histórico: {PASTA_PREDITIVA.name or '.'}")
st.sidebar.caption(f"✅ Carteira: {ARQUIVO_CARTEIRA.name}")
st.sidebar.caption(f"✅ Limite: {ARQUIVO_LIMITE.name}")

# Segurança herdada do app6: representante logado vê somente a própria carteira.
if usuario_logado and str(usuario_dados.get("perfil", "")).upper() != "ADMIN":
    rep_login = clean_code(usuario_dados.get("codigo_representante") or usuario_logado)
    df_vendas = df_vendas[df_vendas["Codigo Representante"] == rep_login].copy()
    df_carteira = df_carteira[df_carteira["Codigo Representante"] == rep_login].copy()
    if df_carteira.empty:
        st.error(f"O usuário {usuario_logado} não possui carteira vinculada ao código de representante {rep_login}.")
        st.stop()

# ============================================================
# FILTROS: SUPERVISOR -> REPRESENTANTE -> CIDADE
# ============================================================
st.sidebar.header("🎯 Planejamento comercial")

# Supervisores que não devem aparecer no painel.
SUPERVISORES_EXCLUIR = {"ADRIANO PIRES", "NN", "SP", "TOTAL GERAL", "9905"}

def _supervisor_normalizado_para_filtro(x):
    return norm(x).replace("  ", " ").strip()

def _nome_supervisor_painel(codigo):
    codigo = str(codigo).strip()
    return MAPA_SUPERVISORES.get(codigo, codigo)

# Lista nasce da carteira já atualizada pelo histórico mais recente.
# set() garante que nenhuma regional seja repetida.
sup_values = sorted({
    str(x).strip()
    for x in df_carteira["Codigo Supervisor"].dropna().astype(str).unique()
    if str(x).strip()
    and _supervisor_normalizado_para_filtro(x) not in SUPERVISORES_EXCLUIR
})

# Garante que 9918, 9919 e 9920 apareçam se existirem no histórico carregado
# e houver representantes correspondentes na carteira.
for codigo_obrigatorio in ("9902", "9907", "9914", "9915", "9916", "9917", "9918", "9919", "9920"):
    reps_hist = set(
        df_vendas.loc[
            df_vendas["Codigo Supervisor"].astype(str).str.strip() == codigo_obrigatorio,
            "Codigo Representante"
        ].astype(str).str.strip()
    )

    reps_cart = set(
        df_carteira["Codigo Representante"].astype(str).str.strip()
    )

    if reps_hist & reps_cart:
        sup_values.append(codigo_obrigatorio)

sup_values = sorted(set(sup_values))

# Mapa entre o texto exibido e o valor real da base.
sup_display_to_value = {}

for s in sup_values:
    nome = _nome_supervisor_painel(s)

    if s in MAPA_SUPERVISORES:
        label = f"{s} - {nome}"
    else:
        label = nome

    # Se por qualquer motivo duas entradas produzirem o mesmo rótulo,
    # mantém apenas uma regional.
    sup_display_to_value[label] = s

sup_options = list(sup_display_to_value.keys())


if not sup_options:
    st.error("Nenhum supervisor disponível na base após os filtros definidos.")
    st.stop()

sup_label = st.sidebar.selectbox("Supervisor", sup_options)
sup_sel = sup_display_to_value[sup_label]

df_sup = df_carteira[df_carteira["Codigo Supervisor"].astype(str).str.strip() == sup_sel].copy()
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

if "Limite" not in view.columns:
    view["Limite"] = 0.0
if "Bloqueio Financeiro" not in view.columns:
    view["Bloqueio Financeiro"] = ""

view["Limite Financeiro"] = pd.to_numeric(
    view["Limite"], errors="coerce"
).fillna(0.0).apply(brl)

view["Bloqueio Financeiro"] = (
    view["Bloqueio Financeiro"]
    .apply(_bloqueio_label)
)

cols_view = [
    "Status", "Cliente", "Cidade/UF", "Última Compra",
    "Dias_Sem_Compra", "Valor Histórico",
    "Limite Financeiro", "Bloqueio Financeiro"
]

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
