import { NextRequest, NextResponse } from "next/server";
import { validarToken } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { carregarCarteira2027 } from "@/lib/carteira-2027-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cod = (v: unknown) => String(v ?? "").trim().replace(/\.0+$/, "");
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : null;
const JANELA_MINUTOS = 30;

type CheckinAnterior = {
  id: string;
  token_atendimento: string;
  codigo_cliente: string;
  modalidade: string;
  gps_status: string;
  precisao_metros: number | null;
  criado_em: string;
};

export async function POST(req: NextRequest) {
  const token = req.cookies.get("kidy_session")?.value;
  const sessao = token ? await validarToken(token) : null;
  if (!sessao) return NextResponse.json({ erro: "Não autenticado" }, { status: 401 });

  if (String(sessao.perfil ?? "").toUpperCase() !== "REPRESENTANTE") {
    return NextResponse.json({ erro: "Check-in disponível apenas para representantes" }, { status: 403 });
  }
  const usuario = String(sessao.usuario ?? "").trim();
  const rep = cod(sessao.codigo_representante);
  if (!usuario || !rep) return NextResponse.json({ erro: "Representante sem vínculo" }, { status: 403 });

  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return NextResponse.json({ erro: "JSON inválido" }, { status: 400 }); }
  const cliente = cod(corpo.codigo_cliente);
  const tokenAtendimento = corpo.token_atendimento;
  const modalidade = String(corpo.modalidade ?? "");
  if (!cliente || !uuid(tokenAtendimento) || !["GPS_CONFIRMACAO", "INICIO_ATENDIMENTO"].includes(modalidade)) {
    return NextResponse.json({ erro: "Dados do check-in inválidos" }, { status: 400 });
  }

  try {
    const carteira = await carregarCarteira2027();
    const cadastro = carteira.clientes.find(c => cod(c.codigoCliente) === cliente);
    if (!cadastro || !cadastro.representanteAtual.some(r => cod(r.codigo) === rep)) {
      return NextResponse.json({ erro: "Cliente fora de sua carteira" }, { status: 403 });
    }

    const latitude = num(corpo.latitude);
    const longitude = num(corpo.longitude);
    const precisao = num(corpo.precisao_metros);
    const gpsRecebido = latitude !== null && longitude !== null && precisao !== null &&
      Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && precisao >= 0;
    const gpsStatus = !gpsRecebido ? "NAO_VERIFICADO" : precisao <= 100 ? "VERIFICADO" : "IMPRECISO";

    const { data: peloToken, error: erroToken } = await supabase.from("kidy_checkins")
      .select("id,token_atendimento,codigo_cliente,modalidade,gps_status,precisao_metros,criado_em")
      .eq("usuario", usuario).eq("token_atendimento", tokenAtendimento).maybeSingle();
    if (erroToken) throw erroToken;
    if (peloToken && cod(peloToken.codigo_cliente) !== cliente) {
      return NextResponse.json({ erro: "Token vinculado a outro cliente" }, { status: 409 });
    }

    let anterior = peloToken as CheckinAnterior | null;
    if (!anterior) {
      const limite = new Date(Date.now() - JANELA_MINUTOS * 60_000).toISOString();
      const { data: recentes, error: erroRecentes } = await supabase.from("kidy_checkins")
        .select("id,token_atendimento,codigo_cliente,modalidade,gps_status,precisao_metros,criado_em")
        .eq("usuario", usuario).eq("codigo_cliente", cliente)
        .gte("criado_em", limite)
        .order("criado_em", { ascending: false }).limit(1);
      if (erroRecentes) throw erroRecentes;
      anterior = (recentes?.[0] ?? null) as CheckinAnterior | null;
    }

    if (anterior) {
      // Preserva o melhor GPS existente; não substitui precisão boa por ruim.
      const anteriorPrecisao = anterior.precisao_metros;
      const melhorarGps = gpsRecebido && (anteriorPrecisao === null || precisao < anteriorPrecisao);
      if (melhorarGps) {
        const { data, error } = await supabase.from("kidy_checkins")
          .update({ latitude, longitude, precisao_metros: precisao, gps_status: gpsStatus, atualizado_em: new Date().toISOString() })
          .eq("id", anterior.id).eq("usuario", usuario)
          .select("id,token_atendimento,modalidade,gps_status,precisao_metros,criado_em").single();
        if (error) throw error;
        return NextResponse.json({ sucesso: true, existente: true, checkin: data }, { headers: { "Cache-Control": "no-store" } });
      }
      return NextResponse.json({ sucesso: true, existente: true, checkin: anterior }, { headers: { "Cache-Control": "no-store" } });
    }

    const { data, error } = await supabase.from("kidy_checkins").insert({
      token_atendimento: tokenAtendimento,
      usuario,
      codigo_representante: rep,
      codigo_cliente: cliente,
      nome_cliente: cadastro.razaoSocial,
      modalidade,
      latitude: gpsRecebido ? latitude : null,
      longitude: gpsRecebido ? longitude : null,
      precisao_metros: gpsRecebido ? precisao : null,
      gps_status: gpsStatus,
    }).select("id,token_atendimento,modalidade,gps_status,precisao_metros,criado_em").single();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ sucesso: true, existente: true }, { headers: { "Cache-Control": "no-store" } });
      }
      throw error;
    }
    return NextResponse.json({ sucesso: true, existente: false, checkin: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[CHECKIN]", e);
    return NextResponse.json({ erro: "Não foi possível registrar o check-in" }, { status: 500 });
  }
}
