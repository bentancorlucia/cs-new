import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/roles";
import { exigirOperador } from "@/lib/comercial/server";
import { hayCajaAbierta } from "@/lib/comercial/caja";
import { mensajeError } from "@/lib/contabilidad/formato";
import { validarValoresMto, validarRestriccionSocios } from "@/lib/mto/schema";
import { calcularPrecioExtra, resumirPersonalizacion } from "@/lib/mto/pricing";
import { extractComprobanteData } from "@/lib/comprobante/extract";
import {
  calcularDescuentoManual,
  precioListaUnitario,
  precioSocioUnitario,
  round2,
} from "@/lib/tienda/precios";
import type { MtoCampo } from "@/types/mto";
import type { Json, TablesInsert } from "@/types/database";
import type { LineaTicket, TicketVenta } from "@/components/pos/tipos";
import { conceptoDescuento, ticketDesdeBase } from "./ticket";

/*
 * POST /api/admin/pos/venta — venta presencial.
 *
 * - Efectivo: descuenta stock y asienta la venta contra la caja (la base
 *   exige caja abierta).
 * - Transferencia / mixto: reserva stock y queda pendiente de verificar el
 *   comprobante; el efectivo del mixto entra a la caja como seña.
 *
 * El comprobante viaja en la MISMA request (multipart: `datos` + `archivo`):
 * se sube antes de crear el pedido y, si algo falla después, se deshace
 * todo (pedido, registro del comprobante y archivo). Nunca queda una venta
 * por transferencia sin comprobante.
 *
 * Idempotencia: cada intento de cobro trae `idempotency_key`; si ya hay un
 * pedido POS con esa clave se devuelve ese (doble click, reintento por
 * corte de red) en lugar de crear otro.
 */

const TIPOS_COMPROBANTE = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_COMPROBANTE = 10 * 1024 * 1024;

const itemSchema = z.object({
  producto_id: z.number().int().positive(),
  variante_id: z.number().int().positive().optional().nullable(),
  cantidad: z.number().int().positive().max(999),
  // Encargue (MTO): no descuenta stock; la personalización se valida contra
  // `productos.mto_campos` y el recargo se calcula acá, no en el cliente.
  es_encargue: z.boolean().optional().default(false),
  personalizacion: z.record(z.string(), z.union([z.string(), z.number()])).optional().default({}),
});

const ventaSchema = z.object({
  idempotency_key: z.uuid("Falta la clave de la venta"),
  items: z.array(itemSchema).min(1, "Agregá al menos un producto").max(200),
  metodo_pago: z.enum(["efectivo", "transferencia", "mixto"]),
  // Solo para `mixto`: parte cobrada en efectivo. El resto va por transferencia.
  monto_efectivo: z.number().positive().optional().nullable(),
  nombre_cliente: z.string().trim().max(200).optional().nullable(),
  // Email para avisos del pedido (clientes presenciales sin cuenta).
  email_cliente: z
    .string()
    .trim()
    .max(255)
    .optional()
    .nullable()
    .refine((v) => !v || z.email().safeParse(v).success, { message: "Email inválido" }),
  perfil_socio_id: z.uuid().optional().nullable(),
  // Descuento manual del cajero. Precios de lista y de socio los calcula el
  // servidor; el cliente nunca manda precios.
  descuento_manual_tipo: z.enum(["porcentaje", "fijo"]).optional().nullable(),
  descuento_manual_valor: z.number().min(0).optional().nullable(),
  descuento_motivo: z.string().trim().max(500).optional().nullable(),
  // Total que vio el cajero. Si no coincide con el calculado, se rechaza.
  total_esperado: z.number().nonnegative(),
  notas: z.string().max(1000).optional().nullable(),
});

type Db = ReturnType<typeof createAdminClient>;

function fallo(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

async function buscarPorClave(db: Db, clave: string) {
  const { data } = await db
    .from("pedidos")
    .select("id")
    .eq("tipo", "pos")
    .eq("idempotency_key", clave)
    .order("id")
    .limit(1);
  return data?.[0]?.id ?? null;
}

/** Respuesta para una venta que ya existe con la misma clave. */
async function respuestaReplay(db: Db, pedidoId: number) {
  const ticket = await ticketDesdeBase(db, pedidoId);
  if (ticket === "en_proceso") {
    return fallo("Esta venta ya se está registrando. Esperá unos segundos y revisá Pedidos.", 409, {
      code: "en_proceso",
    });
  }
  if (!ticket) return null;
  return NextResponse.json({
    data: { id: ticket.pedido_id, numero_pedido: ticket.numero_pedido, estado: ticket.estado },
    ticket,
    idempotent_replay: true,
  });
}

async function leerRequest(request: NextRequest): Promise<{ body: unknown; archivo: File | null }> {
  const tipo = request.headers.get("content-type") ?? "";
  if (tipo.includes("multipart/form-data")) {
    const form = await request.formData();
    const datos = form.get("datos");
    const archivo = form.get("archivo");
    return {
      body: typeof datos === "string" ? JSON.parse(datos) : {},
      archivo: archivo instanceof File && archivo.size > 0 ? archivo : null,
    };
  }
  return { body: await request.json(), archivo: null };
}

export async function POST(request: NextRequest) {
  try {
    await exigirOperador();
  } catch {
    return fallo("No autorizado: requiere rol tienda o tesorero", 403);
  }

  let entrada: { body: unknown; archivo: File | null };
  try {
    entrada = await leerRequest(request);
  } catch {
    return fallo("Datos inválidos", 400);
  }
  const parsed = ventaSchema.safeParse(entrada.body);
  if (!parsed.success) {
    return fallo(parsed.error.issues[0]?.message ?? "Datos inválidos", 400, { details: parsed.error.issues });
  }
  const venta = parsed.data;
  const archivo = entrada.archivo;
  const db = createAdminClient();
  const user = await getCurrentUser();

  // 0. ¿Ya se registró esta venta? (doble click, reintento)
  const previo = await buscarPorClave(db, venta.idempotency_key);
  if (previo) {
    const r = await respuestaReplay(db, previo);
    if (r) return r;
  }

  const cobraEfectivo = venta.metodo_pago !== "transferencia";
  const requiereVerificacion = venta.metodo_pago !== "efectivo";

  // 1. Precondiciones del medio de pago (la base vuelve a exigir la caja).
  if (cobraEfectivo && !(await hayCajaAbierta())) {
    return fallo("Abrí la caja antes de cobrar en efectivo", 409, { code: "caja_cerrada" });
  }
  if (requiereVerificacion) {
    if (!archivo) return fallo("Adjuntá el comprobante de la transferencia", 400);
    if (!TIPOS_COMPROBANTE.includes(archivo.type)) {
      return fallo("Formato no permitido. Usá JPG, PNG, WebP o PDF.", 400);
    }
    if (archivo.size > MAX_COMPROBANTE) return fallo("El archivo no puede superar 10MB", 400);
  }

  // 2. Productos, variantes y condición de socio.
  const productoIds = [...new Set(venta.items.map((i) => i.producto_id))];
  const varianteIds = [
    ...new Set(
      venta.items
        .filter((i) => !i.es_encargue && i.variante_id != null)
        .map((i) => i.variante_id as number)
    ),
  ];

  const [{ data: prods }, { data: varis }, { data: perfilSocio }, { data: conVariantes }] = await Promise.all([
    db
      .from("productos")
      .select("id, nombre, precio, precio_socio, activo_pos, mto_disponible, mto_solo, mto_campos")
      .in("id", productoIds),
    varianteIds.length > 0
      ? db.from("producto_variantes").select("id, producto_id, nombre, precio_override, activo").in("id", varianteIds)
      : Promise.resolve({ data: [] as { id: number; producto_id: number; nombre: string; precio_override: number | null; activo: boolean | null }[] }),
    venta.perfil_socio_id
      ? db.from("perfiles").select("es_socio").eq("id", venta.perfil_socio_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("producto_variantes").select("producto_id").in("producto_id", productoIds).eq("activo", true),
  ]);

  const prodById = new Map((prods ?? []).map((p) => [p.id, p]));
  const variById = new Map((varis ?? []).map((v) => [v.id, v]));
  const tieneVariantes = new Set((conVariantes ?? []).map((v) => v.producto_id));
  const esSocio = perfilSocio?.es_socio === true;

  // 3. Precio por ítem (lista + socio + recargo de encargue).
  type ItemCalculado = {
    producto_id: number;
    variante_id: number | null;
    nombre: string;
    detalle: string | null;
    cantidad: number;
    es_encargue: boolean;
    personalizacion: Record<string, string | number>;
    precio_lista: number;
    precio_socio: number | null;
    precio_extra: number;
  };
  const itemsCalc: ItemCalculado[] = [];

  for (const item of venta.items) {
    const prod = prodById.get(item.producto_id);
    // El POS vende lo marcado para el POS, esté o no publicado en la web.
    if (!prod || prod.activo_pos !== true) {
      return fallo(`Producto no disponible en el POS (ID ${item.producto_id})`, 400);
    }

    if (!item.es_encargue) {
      if (prod.mto_solo) return fallo(`${prod.nombre} solo se vende bajo encargue`, 400);
      let override: number | null = null;
      let nombre = prod.nombre;
      if (item.variante_id != null) {
        const vari = variById.get(item.variante_id);
        if (!vari || vari.producto_id !== prod.id || vari.activo === false) {
          return fallo(`Variante no encontrada para ${prod.nombre}`, 400);
        }
        override = vari.precio_override;
        nombre = `${prod.nombre} - ${vari.nombre}`;
      } else if (tieneVariantes.has(prod.id)) {
        return fallo(`Elegí la variante de ${prod.nombre}`, 400);
      }
      itemsCalc.push({
        producto_id: prod.id,
        variante_id: item.variante_id ?? null,
        nombre,
        detalle: null,
        cantidad: item.cantidad,
        es_encargue: false,
        personalizacion: {},
        precio_lista: precioListaUnitario(prod, override),
        precio_socio: esSocio ? precioSocioUnitario(prod, override) : null,
        precio_extra: 0,
      });
      continue;
    }

    if (!prod.mto_disponible) return fallo(`${prod.nombre} no admite encargue`, 400);
    const campos = (Array.isArray(prod.mto_campos) ? prod.mto_campos : []) as unknown as MtoCampo[];
    const validacion = validarValoresMto(campos, item.personalizacion);
    if (!validacion.valid) {
      const primero = Object.values(validacion.errors)[0];
      return fallo(`${prod.nombre}: ${primero}`, 400);
    }
    if (validarRestriccionSocios(campos, validacion.cleaned, esSocio).length > 0) {
      return fallo(`${prod.nombre}: la personalización elegida es exclusiva de socios`, 403);
    }
    itemsCalc.push({
      producto_id: prod.id,
      // El encargue no se asocia a una variante del stock (igual que online).
      variante_id: null,
      nombre: prod.nombre,
      detalle:
        resumirPersonalizacion(campos, validacion.cleaned)
          .map((r) => `${r.label}: ${r.valor}`)
          .join(" · ") || null,
      cantidad: item.cantidad,
      es_encargue: true,
      personalizacion: validacion.cleaned,
      precio_lista: precioListaUnitario(prod),
      precio_socio: esSocio ? precioSocioUnitario(prod) : null,
      precio_extra: calcularPrecioExtra(campos, validacion.cleaned),
    });
  }

  // 4. Totales. `pedido_items.precio_unitario` guarda el precio de lista;
  // el beneficio de socio y el descuento manual van en `pedidos.descuento`.
  const subtotal = round2(itemsCalc.reduce((s, i) => s + (i.precio_lista + i.precio_extra) * i.cantidad, 0));
  const descuentoSocio = round2(
    itemsCalc.reduce((s, i) => (i.precio_socio != null ? s + (i.precio_lista - i.precio_socio) * i.cantidad : s), 0)
  );
  const descuentoManual = calcularDescuentoManual(
    subtotal - descuentoSocio,
    venta.descuento_manual_tipo,
    venta.descuento_manual_valor
  );
  const descuento = round2(descuentoSocio + descuentoManual);
  const total = round2(subtotal - descuento);

  if (Math.abs(venta.total_esperado - total) > 0.01) {
    return fallo(
      `El total calculado ($${total.toLocaleString("es-UY")}) no coincide con el de la pantalla ($${venta.total_esperado.toLocaleString("es-UY")}). Actualizá el POS: puede haber cambiado un precio.`,
      409,
      { code: "total_cambio", total }
    );
  }

  const esMixto = venta.metodo_pago === "mixto";
  const montoEfectivoMixto = esMixto ? round2(venta.monto_efectivo ?? 0) : 0;
  if (esMixto && (montoEfectivoMixto <= 0 || montoEfectivoMixto >= total)) {
    return fallo("En pago mixto el efectivo tiene que ser mayor a 0 y menor al total", 400);
  }
  if (requiereVerificacion && total <= 0) {
    return fallo("Una venta sin importe se cobra en efectivo", 400);
  }

  // 5. Comprobante: se sube ANTES de crear el pedido (si falla, no se crea nada).
  let rutaArchivo: string | null = null;
  let datosOcr: unknown = null;
  let urlComprobante = "";
  if (requiereVerificacion && archivo) {
    const ext = (archivo.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    rutaArchivo = `pos/${venta.idempotency_key}-${Date.now()}.${ext}`;
    const buffer = Buffer.from(await archivo.arrayBuffer());
    const [subida, ocr] = await Promise.all([
      db.storage.from("comprobantes").upload(rutaArchivo, buffer, { contentType: archivo.type, upsert: false }),
      extractComprobanteData(buffer, archivo.type === "application/pdf" ? "pdf" : "imagen").catch((e) => {
        console.error("OCR del comprobante POS:", e);
        return null;
      }),
    ]);
    if (subida.error) {
      console.error("Subida del comprobante POS:", subida.error);
      return fallo("No se pudo subir el comprobante. No se registró la venta: probá de nuevo.", 502);
    }
    datosOcr = ocr;
    const { data: firmada } = await db.storage
      .from("comprobantes")
      .createSignedUrl(rutaArchivo, 60 * 60 * 24 * 365);
    urlComprobante = firmada?.signedUrl ?? "";
  }

  const borrarArchivo = async () => {
    if (rutaArchivo) await db.storage.from("comprobantes").remove([rutaArchivo]);
  };

  // 6. Pedido.
  const hayEncargues = itemsCalc.some((i) => i.es_encargue);
  // Efectivo con encargues: queda 'encargado' hasta que llegue el producto.
  // Con transferencia pasa a 'encargado' al verificar el comprobante.
  const estadoInicial = requiereVerificacion ? "pendiente_verificacion" : hayEncargues ? "encargado" : "pagado";
  const tipoManual = descuentoManual > 0 ? venta.descuento_manual_tipo ?? null : null;
  const porcentajeManual =
    tipoManual === "porcentaje" ? Math.min(Number(venta.descuento_manual_valor) || 0, 100) : null;

  const pedidoData: TablesInsert<"pedidos"> = {
    perfil_id: venta.perfil_socio_id || null,
    tipo: "pos",
    estado: estadoInicial,
    subtotal,
    descuento,
    descuento_tipo: tipoManual ?? (descuentoSocio > 0 ? "socio" : null),
    descuento_porcentaje: porcentajeManual,
    descuento_motivo: venta.descuento_motivo || null,
    total,
    metodo_pago: venta.metodo_pago,
    nombre_cliente: venta.nombre_cliente || null,
    email_cliente: venta.email_cliente?.toLowerCase() || null,
    notas: venta.notas || null,
    vendedor_id: user?.id ?? null,
    aplico_precio_socio: descuentoSocio > 0,
    idempotency_key: venta.idempotency_key,
    ...(esMixto
      ? { monto_efectivo: montoEfectivoMixto, monto_transferencia: round2(total - montoEfectivoMixto) }
      : {}),
    // Transferencia / mixto: reserva stock sin descontar.
    ...(requiereVerificacion ? { stock_reservado: true, stock_reservado_at: new Date().toISOString() } : {}),
  };

  const { data: pedido, error: pedidoError } = await db
    .from("pedidos")
    .insert(pedidoData)
    .select("id, numero_pedido, perfil_id, email_cliente, created_at")
    .single();

  if (pedidoError || !pedido) {
    await borrarArchivo();
    // Mismo socio + misma clave en paralelo: el índice único la frena.
    if (pedidoError?.code === "23505") {
      const ganador = await buscarPorClave(db, venta.idempotency_key);
      const r = ganador ? await respuestaReplay(db, ganador) : null;
      if (r) return r;
    }
    console.error("Crear pedido POS:", pedidoError);
    return fallo(mensajeError(pedidoError), 500);
  }

  const numeroPedido = pedido.numero_pedido ?? String(pedido.id);

  // Dos requests con la misma clave que pasaron el chequeo a la vez: gana
  // el pedido más viejo y el otro se deshace.
  const primero = await buscarPorClave(db, venta.idempotency_key);
  if (primero != null && primero !== pedido.id) {
    await db.from("pedidos").delete().eq("id", pedido.id);
    await borrarArchivo();
    const r = await respuestaReplay(db, primero);
    if (r) return r;
    return fallo("Esta venta ya se está registrando", 409, { code: "en_proceso" });
  }

  const deshacer = async (comprobanteId?: number) => {
    if (comprobanteId) await db.from("comprobantes").delete().eq("id", comprobanteId);
    await db.from("pedidos").delete().eq("id", pedido.id);
    await borrarArchivo();
  };

  // 7. Registro del comprobante (antes de mover stock: si falla, se borra el pedido).
  let comprobanteId: number | undefined;
  if (rutaArchivo && archivo) {
    const { data: comp, error: compError } = await db
      .from("comprobantes")
      .insert({
        pedido_id: pedido.id,
        url: urlComprobante,
        nombre_archivo: archivo.name.slice(0, 255),
        tipo: archivo.type === "application/pdf" ? "pdf" : "imagen",
        tamano_bytes: archivo.size,
        datos_extraidos: (datosOcr ?? null) as Json,
        estado: "pendiente",
      })
      .select("id")
      .single();
    if (compError || !comp) {
      console.error("Registrar comprobante POS:", compError);
      await deshacer();
      return fallo("No se pudo registrar el comprobante. No se registró la venta: probá de nuevo.", 500);
    }
    comprobanteId = comp.id;
  }

  // 8. Stock y contabilidad en una sola transacción de la base:
  // - efectivo: descuenta stock + asiento de venta contra la caja.
  // - transferencia / mixto: reserva; el efectivo del mixto entra como seña.
  const itemsPayload = itemsCalc.map((i) => ({
    producto_id: i.producto_id,
    variante_id: i.variante_id,
    cantidad: i.cantidad,
    precio_unitario: i.precio_lista,
    subtotal: round2((i.precio_lista + i.precio_extra) * i.cantidad),
    es_encargue: i.es_encargue,
    personalizacion: i.personalizacion,
    precio_extra_personalizacion: i.precio_extra,
  }));

  const { data: rpc, error: rpcError } = requiereVerificacion
    ? await db.rpc("reservar_stock_pedido", { p_pedido_id: pedido.id, p_items: itemsPayload })
    : await db.rpc("descontar_stock_pedido", {
        p_pedido_id: pedido.id,
        p_items: itemsPayload,
        // La función acepta null (el tipo generado no lo refleja).
        p_registrado_por: (user?.id ?? null) as string,
      });

  if (rpcError) {
    console.error("Stock/asiento de la venta POS:", rpcError);
    await deshacer(comprobanteId);
    return fallo(mensajeError(rpcError), 409);
  }
  const resultado = (rpc ?? {}) as { ok?: boolean; faltantes?: { nombre: string; disponible: number }[] };
  if (resultado.ok === false) {
    await deshacer(comprobanteId);
    const f = resultado.faltantes?.[0];
    return fallo(f ? `Stock insuficiente para ${f.nombre}. Disponible: ${f.disponible}` : "Stock insuficiente", 409, {
      faltantes: resultado.faltantes ?? [],
    });
  }

  // 9. Encargue cobrado en efectivo: confirmación por mail. Con transferencia
  // o mixto el mail sale al verificar el comprobante.
  if (!requiereVerificacion && hayEncargues) {
    try {
      const { resolverEmailPedido } = await import("@/lib/tienda/email-pedido");
      const { email } = await resolverEmailPedido(db, pedido);
      if (email) {
        const { sendOrderConfirmation } = await import("@/lib/email/send");
        await sendOrderConfirmation(email, {
          nombreCliente: venta.nombre_cliente || "",
          numeroPedido,
          items: itemsCalc.map((i) => ({
            nombre: i.nombre,
            cantidad: i.cantidad,
            precioUnitario: i.precio_lista + i.precio_extra,
          })),
          total,
        });
      }
    } catch (e) {
      console.error("Mail de confirmación POS:", e);
    }
  }

  const lineas: LineaTicket[] = itemsCalc.map((i) => ({
    nombre: i.nombre,
    detalle: i.detalle,
    cantidad: i.cantidad,
    precio_unitario: round2(i.precio_lista + i.precio_extra),
    subtotal: round2((i.precio_lista + i.precio_extra) * i.cantidad),
    es_encargue: i.es_encargue,
  }));
  const descuentos: TicketVenta["descuentos"] = [];
  if (descuentoSocio > 0) descuentos.push({ concepto: "Beneficio socio", importe: descuentoSocio });
  if (descuentoManual > 0) {
    descuentos.push({
      concepto: conceptoDescuento(tipoManual, porcentajeManual, venta.descuento_motivo || null),
      importe: descuentoManual,
    });
  }
  const ticket: TicketVenta = {
    pedido_id: pedido.id,
    numero_pedido: numeroPedido,
    fecha: pedido.created_at ?? new Date().toISOString(),
    estado: estadoInicial,
    cliente: venta.nombre_cliente || null,
    items: lineas,
    subtotal,
    descuentos,
    total,
    metodo_pago: venta.metodo_pago,
    monto_efectivo: esMixto ? montoEfectivoMixto : null,
    monto_transferencia: esMixto ? round2(total - montoEfectivoMixto) : null,
  };

  return NextResponse.json({
    data: { id: pedido.id, numero_pedido: numeroPedido, estado: estadoInicial },
    ticket,
  });
}
