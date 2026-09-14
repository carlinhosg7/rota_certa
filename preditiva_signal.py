# -*- coding: utf-8 -*-
"""
Sinal comercial derivado da base Preditiva (histórico de compras).

Usado pelo app de Rotas para combinar "dias sem compra" (vindo da Carteira)
com um indicativo de "hora certa de vender" baseado no comportamento
histórico do cliente por coleção (Verão/Inverno) — sem depender de Agenda.

Para manter o app leve, a base Preditiva (bem maior que a Carteira) deve ser
filtrada por representante (ver `filtrar_por_representante`) logo após o
carregamento, ANTES de chamar `calcular_sinal_preditiva` — assim o cálculo
roda só sobre o histórico do representante selecionado, não da base toda.
"""
from datetime import datetime

import pandas as pd
import streamlit as st

from common.data_loading import carregar_parquets_concat
from common.formatting import identificar_colecao

# Mesma fonte usada pelo app Preditiva (preditiva/app_preditiva.py).
URLS_DADOS_PREDITIVA = [
    "https://raw.githubusercontent.com/carlinhosg7/streamlit02/main/DADOS_PREDITIVA_1.parquet",
    "https://raw.githubusercontent.com/carlinhosg7/streamlit02/main/DADOS_PREDITIVA_2.parquet",
    "https://raw.githubusercontent.com/carlinhosg7/streamlit02/main/DADOS_PREDITIVA_3.parquet",
    "https://raw.githubusercontent.com/carlinhosg7/streamlit02/main/DADOS_PREDITIVA_4.parquet",
    "https://raw.githubusercontent.com/carlinhosg7/streamlit02/main/DADOS_PREDITIVA_5.parquet",
    "https://raw.githubusercontent.com/carlinhosg7/streamlit02/main/DADOS_PREDITIVA_6.parquet",
]

# Preço padrão por par quando não há nenhuma venda com valor > 0 para
# calcular uma média (mesmo fallback usado no app Preditiva).
PRECO_PADRAO_FALLBACK = 60.0

# Cada arquivo .parquet da Preditiva tem centenas de colunas (um artefato de
# como foi exportado — vários blocos repetidos). Pro sinal de Rotas só
# precisamos destas; carregar só elas (em vez das ~346 colunas do arquivo)
# é o que evita estourar memória ao ler os 6 arquivos.
COLUNAS_NECESSARIAS = [
    "Codigo Cliente",
    "Codigo Representante",
    "Data Cadastro",
    "Data Ultima Compra",
    "Qtd Venda",
    "Vlr Venda",
]


def _norm_codigo(x) -> str:
    """Normaliza um código de representante/supervisor (string, sem zeros à esquerda)."""
    return str(x).strip().lstrip("0")


@st.cache_data(ttl=3600, show_spinner=False)
def carregar_dados_preditiva() -> pd.DataFrame:
    """
    Baixa e concatena os parquets da Preditiva (mesma fonte do app_preditiva.py),
    lendo só as colunas necessárias para o sinal de Rotas (ver
    COLUNAS_NECESSARIAS) em vez do arquivo inteiro — bem mais leve.
    """
    df = carregar_parquets_concat(URLS_DADOS_PREDITIVA, columns=COLUNAS_NECESSARIAS)
    df["Codigo Cliente"] = df["Codigo Cliente"].astype(str).str.strip().str.upper()
    return df


def filtrar_por_cliente(df_preditiva: pd.DataFrame, codigo_cliente) -> pd.DataFrame:
    """
    Filtra a base Preditiva para o histórico de UM único cliente — usada
    quando o usuário clica num cliente específico na tabela de Rotas pra ver
    a preditiva dele, sem precisar calcular o sinal pra carteira inteira.
    """
    alvo = str(codigo_cliente).strip().upper()
    codigos = df_preditiva["Codigo Cliente"].astype(str).str.strip().str.upper()
    return df_preditiva[codigos == alvo].copy()


def filtrar_por_representante(df_preditiva: pd.DataFrame, codigo_representante) -> pd.DataFrame:
    """
    Filtra a base Preditiva (grande) para apenas o histórico de um
    representante, ANTES de qualquer cálculo pesado — é isso que mantém o
    app leve: em vez de agregar a base inteira a cada interação, só
    processamos o pedaço relevante para a tela atual.

    Usa a mesma normalização de código do app Preditiva (string, sem zeros
    à esquerda) para casar com a Carteira mesmo que a formatação difira.
    """
    alvo = _norm_codigo(codigo_representante)
    codigos = df_preditiva["Codigo Representante"].astype(str).str.strip().str.lstrip("0")
    return df_preditiva[codigos == alvo].copy()


def _estacao(colecao) -> str:
    """Extrai 'Verão'/'Inverno' de uma string de coleção tipo 'Verão 2026'."""
    if colecao is None or (isinstance(colecao, float) and pd.isna(colecao)):
        return ""
    return str(colecao).split(" ")[0].strip()


def _minmax(s: pd.Series) -> pd.Series:
    s = pd.to_numeric(s, errors="coerce").fillna(0.0)
    if s.max() == s.min():
        return pd.Series([0.0] * len(s), index=s.index, dtype="float64")
    return (s - s.min()) / (s.max() - s.min())


def calcular_sinal_preditiva(df_preditiva: pd.DataFrame, hoje: datetime = None) -> pd.DataFrame:
    """
    Resume a base Preditiva (já filtrada por representante — ver
    `filtrar_por_representante`) por cliente (COD_CLIENTE) em um sinal
    comercial:

    - dias_sem_compra_hist: dias desde a última compra registrada na base Preditiva
    - vlr_total_hist: valor total histórico comprado (com o mesmo fallback de
      preço médio por par usado no app Preditiva, quando "Vlr Venda" vier zerado)
    - pct_valor_estacao_vigente: % do valor histórico comprado na mesma estação
      (Verão/Inverno) do momento de referência — indica se esse cliente costuma
      comprar "nessa época do ano"
    - sinal_preditiva: score 0–1 combinando recência histórica + aderência à
      estação vigente; quanto maior, mais "hora certa de vender" segundo o
      histórico de compras desse cliente

    Não tem cache próprio: como já recebe a base pré-filtrada por
    representante (bem menor), o cálculo é rápido o suficiente para rodar a
    cada interação sem precisar guardar em cache.
    """
    if df_preditiva.empty:
        return pd.DataFrame(columns=[
            "COD_CLIENTE", "dias_sem_compra_hist", "vlr_total_hist",
            "pct_valor_estacao_vigente", "sinal_preditiva",
        ])

    df = df_preditiva.copy()
    df["COD_CLIENTE"] = df["Codigo Cliente"].astype(str).str.strip().str.upper()
    df["Data Cadastro"] = pd.to_datetime(df.get("Data Cadastro"), errors="coerce", dayfirst=True)
    df["Data Ultima Compra"] = pd.to_datetime(df.get("Data Ultima Compra"), errors="coerce", dayfirst=True)
    df["Qtd Venda"] = pd.to_numeric(df.get("Qtd Venda"), errors="coerce").fillna(0.0)
    df["Vlr Venda"] = pd.to_numeric(df.get("Vlr Venda"), errors="coerce").fillna(0.0)

    # Preço médio por par (mesmo fallback do app Preditiva), usado para
    # estimar o valor de vendas sem "Vlr Venda" preenchido.
    df_base_preco = df[(df["Qtd Venda"] > 0) & (df["Vlr Venda"] > 0)]
    if not df_base_preco.empty:
        media_preco_par = (df_base_preco["Vlr Venda"] / df_base_preco["Qtd Venda"]).mean()
    else:
        media_preco_par = PRECO_PADRAO_FALLBACK

    df["_valor"] = df["Vlr Venda"].where(df["Vlr Venda"] > 0, df["Qtd Venda"] * media_preco_par)
    df["_estacao_compra"] = df["Data Cadastro"].apply(identificar_colecao).apply(_estacao)

    ref = pd.Timestamp(hoje or datetime.today())
    estacao_vigente = _estacao(identificar_colecao(ref))

    agg = (
        df.groupby("COD_CLIENTE")
        .agg(
            dias_sem_compra_hist=("Data Ultima Compra", lambda s: (ref - s.max()).days if s.notna().any() else 99999),
            vlr_total_hist=("_valor", "sum"),
        )
        .reset_index()
    )

    vlr_estacao = (
        df[df["_estacao_compra"] == estacao_vigente]
        .groupby("COD_CLIENTE")["_valor"]
        .sum()
        .rename("vlr_estacao_vigente_hist")
    )
    agg = agg.merge(vlr_estacao, on="COD_CLIENTE", how="left")
    agg["vlr_estacao_vigente_hist"] = agg["vlr_estacao_vigente_hist"].fillna(0.0)
    agg["pct_valor_estacao_vigente"] = (
        agg["vlr_estacao_vigente_hist"] / agg["vlr_total_hist"].replace(0, pd.NA)
    ).fillna(0.0).clip(0.0, 1.0)

    agg["_dias_norm"] = _minmax(agg["dias_sem_compra_hist"])
    agg["sinal_preditiva"] = (0.5 * agg["_dias_norm"]) + (0.5 * agg["pct_valor_estacao_vigente"])

    return agg[[
        "COD_CLIENTE", "dias_sem_compra_hist", "vlr_total_hist",
        "pct_valor_estacao_vigente", "sinal_preditiva",
    ]].copy()