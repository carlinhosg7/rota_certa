"use client";

import { useRef, useState } from "react";

type Props = { codigoCliente: string; nomeCliente: string };
type Modalidade = "GPS_CONFIRMACAO" | "INICIO_ATENDIMENTO";
type Local = { latitude: number; longitude: number; precisao_metros: number };
const JANELA_MS = 30 * 60 * 1000;

function obterGps(): Promise<{ local: Local | null; status: "VERIFICADO" | "IMPRECISO" | "NAO_VERIFICADO" }> {
  return new Promise(resolve => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ local: null, status: "NAO_VERIFICADO" }); return;
    }
    navigator.geolocation.getCurrentPosition(
      p => {
        const precisao = p.coords.accuracy;
        resolve({ local: { latitude: p.coords.latitude, longitude: p.coords.longitude, precisao_metros: precisao }, status: precisao <= 100 ? "VERIFICADO" : "IMPRECISO" });
      },
      () => resolve({ local: null, status: "NAO_VERIFICADO" }),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });
}

function tokenParaCliente(codigoCliente: string): string {
  const chave = `kidy-checkin-visita-${codigoCliente}`;
  try {
    const atual = sessionStorage.getItem(chave);
    if (atual) {
      const parsed: { token?: string; criado?: number } = JSON.parse(atual);
      if (parsed.token && parsed.criado && Date.now() - parsed.criado < JANELA_MS) return parsed.token;
    }
    const novo = crypto.randomUUID();
    sessionStorage.setItem(chave, JSON.stringify({ token: novo, criado: Date.now() }));
    return novo;
  } catch {
    return crypto.randomUUID();
  }
}

export default function CheckinAtendimento({ codigoCliente, nomeCliente }: Props) {
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [feito, setFeito] = useState(false);
  const sessaoRef = useRef<{ cliente: string; token: string } | null>(null);

  async function registrar(modalidade: Modalidade) {
    if (enviando) return;
    setEnviando(true); setMensagem("");
    try {
      if (sessaoRef.current?.cliente !== codigoCliente) {
        sessaoRef.current = { cliente: codigoCliente, token: tokenParaCliente(codigoCliente) };
      }
      const gps = await obterGps();
      if (modalidade === "GPS_CONFIRMACAO" && !gps.local) {
        setMensagem("GPS indisponível ou não autorizado. Habilite a localização para confirmar chegada.");
        return;
      }
      const resposta = await fetch("/api/checkin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_atendimento: sessaoRef.current.token, codigo_cliente: codigoCliente, modalidade, ...(gps.local || {}) }),
      });
      const json = await resposta.json();
      if (!resposta.ok || !json.sucesso) throw new Error(json.erro || "Erro no check-in");
      if (typeof json.checkin?.token_atendimento === "string") {
        sessaoRef.current = { cliente: codigoCliente, token: json.checkin.token_atendimento };
        try { sessionStorage.setItem(`kidy-checkin-visita-${codigoCliente}`, JSON.stringify({ token: json.checkin.token_atendimento, criado: Date.now() })); } catch { /* armazenamento indisponível */ }
      }
      setFeito(true);
      const status = json.checkin?.gps_status ?? gps.status;
      setMensagem(`${json.existente ? "Visita existente reutilizada" : "Check-in registrado"}. GPS: ${status}${gps.local ? ` (precisão estimada: ${Math.round(gps.local.precisao_metros)} m)` : ""}.`);
    } catch (e) {
      setMensagem(e instanceof Error ? e.message : "Erro ao registrar check-in");
    } finally { setEnviando(false); }
  }

  return (
    <div style={{ border: "1px solid #f2c57a", background: "#fff9ee", padding: 16, borderRadius: 12, marginBottom: 18 }}>
      <div style={{ fontWeight: 800, color: "#703c00", marginBottom: 6 }}>Check-in da visita · {nomeCliente}</div>
      <p style={{ fontSize: 12, color: "#704820", marginTop: 0 }}>
        A localização é solicitada somente ao iniciar ou confirmar a visita. Check-ins do mesmo cliente em até 30 minutos são reutilizados.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" disabled={enviando} onClick={() => registrar("GPS_CONFIRMACAO")}
          style={{ border: 0, borderRadius: 9, padding: "11px 14px", background: "#e77800", color: "white", fontWeight: 700, cursor: "pointer" }}>
          {enviando ? "Registrando..." : feito ? "Atualizar GPS da visita" : "Confirmar chegada por GPS"}
        </button>
        <button type="button" disabled={enviando || feito} onClick={() => registrar("INICIO_ATENDIMENTO")}
          style={{ border: "1px solid #bf8b43", borderRadius: 9, padding: "11px 14px", background: "white", color: "#703c00", fontWeight: 700, cursor: "pointer" }}>
          Iniciar atendimento (check-in automático)
        </button>
      </div>
      {mensagem && <p role="status" style={{ fontSize: 12, marginBottom: 0, color: feito ? "#186534" : "#8a4b00" }}>{mensagem}</p>}
      <p style={{ fontSize: 11, color: "#826742", marginBottom: 0 }}>
        GPS preciso não comprova presença na loja. A distância depende das coordenadas validadas do cliente.
      </p>
    </div>
  );
}
