import type { JWTPayload } from "jose";
type SessaoShare = JWTPayload;
export function ehAdminShare(u: SessaoShare): boolean {
  return String(u.perfil ?? '').toUpperCase() === 'ADMIN';
}
export function codigoRepresentanteShare(u: SessaoShare): string {
  return String(u.codigo_representante ?? '').trim();
}
export function ehRepresentanteShare(u: SessaoShare): boolean {
  return ['REPRESENTANTE', 'REP'].includes(String(u.perfil ?? '').toUpperCase());
}
export function podeAcessarShare(u: SessaoShare): boolean {
  return ehAdminShare(u) || (ehRepresentanteShare(u) && codigoRepresentanteShare(u).length > 0);
}
export function pertenceRepresentanteShare(u: SessaoShare, codigo: unknown): boolean {
  return ehAdminShare(u) || (ehRepresentanteShare(u) && codigoRepresentanteShare(u) === String(codigo ?? '').trim());
}
