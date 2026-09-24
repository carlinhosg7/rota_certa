"use client";

import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";

export type CidadeMapa = {
  ordem: number;
  cidade: string;
  uf: string;
  cityKey: string;
  lat: number;
  lon: number;
  clientes: number;
  vermelhos: number;
  amarelos: number;
  verdes: number;
  score: number;
  distanciaAnteriorKm: number;
  distanciaAcumuladaKm: number;
};

type Props = {
  rota: CidadeMapa[];
  onCidadeClick?: (cityKey: string) => void;
};

export default function VendaMaisMap({
  rota,
  onCidadeClick,
}: Props) {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapElement.current) return;

    const cidadesValidas = rota.filter(
      (r) =>
        Number.isFinite(r.lat) &&
        Number.isFinite(r.lon)
    );

    if (!cidadesValidas.length) return;

    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    const map = L.map(mapElement.current, {
      zoomControl: true,
      scrollWheelZoom: true,
    });

    mapInstance.current = map;

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '&copy; OpenStreetMap contributors',
      }
    ).addTo(map);

    const pontos: L.LatLngExpression[] = [];

    cidadesValidas.forEach((cidade) => {
      const ponto: L.LatLngExpression = [
        cidade.lat,
        cidade.lon,
      ];

      pontos.push(ponto);

      const base = cidade.ordem === 1;

      const icon = L.divIcon({
        className: "",
        html: `
          <div style="
            width:38px;
            height:38px;
            border-radius:50%;
            display:flex;
            align-items:center;
            justify-content:center;
            background:${base ? "#111827" : "#f59e0b"};
            color:white;
            border:3px solid white;
            box-shadow:0 3px 12px rgba(0,0,0,.30);
            font-weight:900;
            font-size:14px;
          ">
            ${cidade.ordem}
          </div>
        `,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      });

      const marker = L.marker(ponto, {
        icon,
      }).addTo(map);

      marker.bindPopup(`
        <div style="
          min-width:210px;
          font-family:Arial,sans-serif;
        ">
          <div style="
            font-size:11px;
            font-weight:800;
            color:#d97706;
            margin-bottom:4px;
          ">
            ETAPA ${cidade.ordem}
          </div>

          <div style="
            font-size:16px;
            font-weight:900;
            margin-bottom:8px;
          ">
            ${cidade.cidade} / ${cidade.uf}
          </div>

          <div style="font-size:13px;line-height:1.7">
            <b>${cidade.clientes}</b> clientes<br/>
            🔴 ${cidade.vermelhos}
            &nbsp; 🟡 ${cidade.amarelos}
            &nbsp; 🟢 ${cidade.verdes}<br/>
            Score comercial:
            <b>${cidade.score.toFixed(3)}</b><br/>
            Trecho:
            <b>${cidade.distanciaAnteriorKm.toFixed(1)} km</b>
          </div>
        </div>
      `);

      marker.on("click", () => {
        onCidadeClick?.(cidade.cityKey);
      });
    });

    if (pontos.length > 1) {
      L.polyline(pontos, {
        weight: 5,
        opacity: 0.85,
      }).addTo(map);
    }

    const bounds = L.latLngBounds(pontos);

    map.fitBounds(bounds, {
      padding: [40, 40],
    });

    setTimeout(() => {
      map.invalidateSize();
    }, 100);

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [rota, onCidadeClick]);

  return (
    <div
      ref={mapElement}
      style={{
        width: "100%",
        height: "480px",
        borderRadius: "18px",
        overflow: "hidden",
        border: "1px solid #ead7bd",
        boxShadow: "0 8px 24px rgba(0,0,0,.08)",
      }}
    />
  );
}