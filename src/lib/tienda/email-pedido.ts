/**
 * Resuelve a qué email mandar los avisos de un pedido.
 * - Pedido con cuenta (`perfil_id`): email del usuario en auth.
 * - Pedido presencial sin cuenta: `email_cliente` cargado en el POS / admin.
 *
 * `tieneCuenta` indica si el destinatario puede abrir /tienda/pedido/[id]
 * (requiere sesión); si no, los mails van sin el botón "Ver pedido".
 */
export async function resolverEmailPedido(
  db: any,
  pedido: { perfil_id?: string | null; email_cliente?: string | null }
): Promise<{ email: string | null; tieneCuenta: boolean }> {
  if (pedido.perfil_id) {
    const { data: authUser } = await db.auth.admin.getUserById(pedido.perfil_id);
    const email = authUser?.user?.email ?? null;
    if (email) return { email, tieneCuenta: true };
  }
  return { email: pedido.email_cliente || null, tieneCuenta: false };
}
