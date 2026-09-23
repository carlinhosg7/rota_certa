import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { supabase } from "@/lib/supabase";
import { gerarToken } from "@/lib/auth";

async function logAcesso(req: NextRequest, dados: any, evento: string, sessionId: string) {
  try {
    const ua = req.headers.get("user-agent") || "";
    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
    const u = ua.toLowerCase();
    const navegador = u.includes("edg/") ? "Edge" : u.includes("chrome/") ? "Chrome" : u.includes("firefox/") ? "Firefox" : u.includes("safari/") ? "Safari" : "Outro";
    const sistema = u.includes("windows") ? "Windows" : u.includes("android") ? "Android" : (u.includes("iphone") || u.includes("ipad")) ? "iOS" : u.includes("mac") ? "macOS" : u.includes("linux") ? "Linux" : "Outro";
    const dispositivo = ["mobile", "android", "iphone"].some(x => u.includes(x)) ? "Mobile" : "Desktop";
    await supabase.from("log_acesso").insert({
      usuario: String(dados?.usuario || ""), nome: dados?.nome || null,
      perfil: dados?.perfil || null, codigo_representante: dados?.codigo_representante || null,
      ip, cidade: null, estado: null, pais: null, latitude: null, longitude: null,
      dispositivo, navegador, sistema_operacional: sistema, session_id: sessionId, evento,
    });
  } catch (e) { console.error("Falha ao registrar log:", e); }
}

export async function POST(req: NextRequest) {
  try {
    const { usuario, senha } = await req.json();
    const login = String(usuario || "").trim();
    if (!login || !senha) return NextResponse.json({ erro: "Informe usuário e senha." }, { status: 400 });

    const { data, error } = await supabase.from("usuarios")
      .select("id,usuario,nome,senha_hash,perfil,codigo_representante,ativo,trocar_senha,representante,codigo_supervisor,supervisor,gerente")
      .eq("usuario", login).limit(1).maybeSingle();

    if (error) throw error;
    const sessionId = randomUUID();
    if (!data || !data.ativo) {
      await logAcesso(req, { usuario: login }, "LOGIN_FALHOU", sessionId);
      return NextResponse.json({ erro: !data ? "Usuário não encontrado." : "Usuário inativo." }, { status: 401 });
    }
    const ok = await bcrypt.compare(String(senha), String(data.senha_hash || ""));
    if (!ok) {
      await logAcesso(req, data, "LOGIN_FALHOU", sessionId);
      return NextResponse.json({ erro: "Senha incorreta." }, { status: 401 });
    }

    const token = await gerarToken({
      id: data.id, usuario: data.usuario, nome: data.nome, perfil: String(data.perfil || "").toUpperCase(),
      codigo_representante: data.codigo_representante, codigo_supervisor: data.codigo_supervisor,
      supervisor: data.supervisor, gerente: data.gerente,
    });
    const res = NextResponse.json({ sucesso: true, trocar_senha: !!data.trocar_senha });
    res.cookies.set("kidy_session", token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 43200 });
    res.cookies.set("kidy_sid", sessionId, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 43200 });
    void logAcesso(req, data, "LOGIN", sessionId);
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ erro: "Erro interno no login." }, { status: 500 });
  }
}
