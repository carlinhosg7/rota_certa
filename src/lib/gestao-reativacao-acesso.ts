import { carregarCarteira2027 } from "@/lib/carteira-2027-data";

export type UsuarioGestao = {
  perfil: string;
  codigo_representante?: string | null;
  codigo_supervisor?: string | null;
};

export async function clienteAutorizado(
  codigoCliente: string,
  usuario: UsuarioGestao
) {
  const carteira = await carregarCarteira2027();

  const cliente = carteira.clientes.find(
    c => String(c.codigoCliente).trim() === codigoCliente.trim()
  );

  if (!cliente) return null;

  const perfil = String(usuario.perfil ?? "").toUpperCase();

  if (["ADMIN", "ADMINISTRADOR", "GERENTE"].includes(perfil)) {
    return cliente;
  }

  if (
    perfil === "REPRESENTANTE" &&
    usuario.codigo_representante &&
    cliente.representanteAtual.some(
      r => String(r.codigo).trim() ===
           String(usuario.codigo_representante).trim()
    )
  ) {
    return cliente;
  }

  if (
    perfil === "SUPERVISOR" &&
    usuario.codigo_supervisor &&
    cliente.supervisores.some(
      s => String(s.codigo).trim() ===
           String(usuario.codigo_supervisor).trim()
    )
  ) {
    return cliente;
  }

  return null;
}
