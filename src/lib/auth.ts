import { SignJWT, jwtVerify, JWTPayload } from "jose";

const secret = new TextEncoder().encode(
  (process.env.JWT_SECRET || "KIDY_SALES_INTELLIGENCE_2026").trim()
);

export type UsuarioSessao = {
  id: string | number;
  usuario: string;
  nome: string | null;
  perfil: string;
  codigo_representante: string | null;
  codigo_supervisor: string | null;
  supervisor: string | null;
  gerente: string | null;
};

export async function gerarToken(usuario: UsuarioSessao) {
  return new SignJWT({ ...usuario })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret);
}

export async function validarToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}
