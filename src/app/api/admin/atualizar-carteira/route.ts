import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validarToken } from "@/lib/auth";
import { gerarCarteira2027DoDrive } from "@/lib/carteira-2027-data";
import { gravarSnapshotCarteira } from "@/lib/carteira-snapshot-supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const token = (
    await cookies()
  ).get("kidy_session")?.value;

  const usuario = token
    ? await validarToken(token)
    : null;

  const perfil = String(
    usuario?.perfil || ""
  ).toUpperCase();

  if (
    !usuario ||
    !["ADMIN", "ADMINISTRADOR"].includes(perfil)
  ) {
    return NextResponse.json(
      { erro: "Acesso restrito ao administrador." },
      { status: 403 }
    );
  }

  const inicio = Date.now();

  try {
    const carteira =
      await gerarCarteira2027DoDrive();

    const snapshot =
      await gravarSnapshotCarteira(carteira);

    return NextResponse.json({
      sucesso: true,
      snapshot: snapshot.id,
      clientes: snapshot.clientes,
      segundos: Math.round(
        (Date.now() - inicio) / 1000
      ),
    });
  } catch (erro) {
    console.error(
      "[ATUALIZAR CARTEIRA]",
      erro
    );

    return NextResponse.json(
      {
        erro: erro instanceof Error
          ? erro.message
          : "Falha na atualizacao.",
      },
      { status: 500 }
    );
  }
}