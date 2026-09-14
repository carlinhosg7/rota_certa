# -*- coding: utf-8 -*-
"""
Lógica de seleção e ordenação de rota comercial (Rota Campeã).

Fica separada do arquivo principal do app para deixar a tela (app_rotas.py)
focada só em UI/orquestração.
"""
from urllib.parse import quote

import numpy as np
import pandas as pd
import requests

from common.geo import haversine_vec


def osrm_route_geojson(points):
    """Consulta o OSRM público e retorna a rota por ruas como lista de (lat, lon)."""
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
    """Monta um link de direções do Google Maps a partir de uma lista de pontos [{lat, lon}]."""
    parts = [f"{p['lat']:.6f},{p['lon']:.6f}" for p in points]
    return "https://www.google.com/maps/dir/" + "/".join([quote(p) for p in parts])


def chunk_list(lst, n_chunks):
    """Divide uma lista em n_chunks partes de tamanho aproximadamente igual."""
    if n_chunks <= 1:
        return [lst]
    k = len(lst)
    base = k // n_chunks
    extra = k % n_chunks
    out, start = [], 0
    for i in range(n_chunks):
        size = base + (1 if i < extra else 0)
        out.append(lst[start:start + size])
        start += size
    return [x for x in out if len(x) > 0]


def chunk_by_size(lst, max_size):
    """
    Divide uma lista em partes de tamanho no máximo max_size (em vez de num
    número fixo de partes) — usada pra limitar quantos clientes entram em
    cada dia de rota (ex.: no máximo 4 clientes atendidos por dia).
    """
    max_size = max(1, int(max_size))
    return [lst[i:i + max_size] for i in range(0, len(lst), max_size)]


def minmax_scale(s):
    """Normaliza uma série numérica para o intervalo [0, 1]."""
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