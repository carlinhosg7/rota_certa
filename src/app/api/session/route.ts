import { NextRequest, NextResponse } from "next/server";
import { validarToken } from "@/lib/auth";
export async function GET(req: NextRequest) {
  const token = req.cookies.get("kidy_session")?.value;
  if (!token) return NextResponse.json({ autenticado: false }, { status: 401 });
  const usuario = await validarToken(token);
  if (!usuario) return NextResponse.json({ autenticado: false }, { status: 401 });
  return NextResponse.json({ autenticado: true, usuario });
}
