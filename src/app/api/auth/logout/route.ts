import { NextRequest, NextResponse } from "next/server";
import { validarToken } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const token = req.cookies.get("kidy_session")?.value;
  const sid = req.cookies.get("kidy_sid")?.value || null;
  if (token) {
    const u = await validarToken(token);
    if (u) {
      try { await supabase.from("log_acesso").insert({ usuario: String(u.usuario || ""), nome: u.nome || null, perfil: u.perfil || null, codigo_representante: u.codigo_representante || null, session_id: sid, evento: "LOGOUT" }); } catch {}
    }
  }
  const res = NextResponse.json({ sucesso: true });
  res.cookies.delete("kidy_session"); res.cookies.delete("kidy_sid");
  return res;
}
