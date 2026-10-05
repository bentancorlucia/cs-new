# Socios: membresías, cuotas y cobranza

Schema `socios` (migraciones `20261005100000_socios_nucleo.sql` y `20261005110000_socios_cobranza.sql`, tests en `supabase/tests/socios_*.test.sql`). Modelo tomado de ContaSystem (persona ≠ membresía; la cuota es el documento de deuda; el saldo se calcula) con las reglas en la base, no en la app.

Tipos: `src/types/socios.ts` (`supabase gen types typescript --local --schema socios`).

## Decisiones

- **Persona** = `public.padron_socios` (cédula única, vínculo con la cuenta web por `perfil_id`). Se le agregaron `numero_socio`, `email` y `direccion`.
- **Ser socio** = tener una membresía vigente (`socios.membresias`: períodos `desde`/`hasta` con motivo de baja). `padron_socios.activo`, `padron_disciplinas`, `perfiles.es_socio` y los roles `socio`/`no_socio` **se derivan** (triggers + `socios.sincronizar_vigencias()` a diario para fechas futuras). El resto del sitio (precio socio, carnet, eventos) sigue leyendo lo de siempre. **No escribir `activo` ni `padron_disciplinas` a mano.**
- **No hay deportistas que no sean socios**: una inscripción a una disciplina tiene que estar dentro de una membresía.
- **Planes**: cuota social y cuotas de disciplina (`socios.planes`; una disciplina puede tener varios: categorías). Precios por vigencia (`plan_precios`, desde el día 1 de un mes); un precio usado no se modifica: se carga uno nuevo. Sin descuentos del club (las disciplinas los resuelven con sus planes).
- **Inscripciones** (`suscripciones`): persona × plan, mensual o anual (si el plan lo permite). Una sola cuota social a la vez; no se repite el mismo plan en fechas superpuestas. Cambio de categoría = `cambiar_plan` (cierra una y abre otra).
- **Medio de cobro** (`medios_cobro`, con historia): `debito_visa`, `transferencia_club`, `transferencia_disciplina` (a la cuenta de una disciplina), `efectivo`. **De la tarjeta solo se guardan los últimos 4 dígitos y el mes de vencimiento** (nunca el número completo).
- **Cuotas**: se emiten por lote mensual (`emitir_lote`), con **un asiento por lote**: Debe cuotas a cobrar / Haber ingreso (cuota social sin centro; disciplina con el centro de costo de la disciplina). Una por inscripción y período; inmutables (se corrigen con nota de crédito). La anual cubre el año calendario (o desde el mes de la inscripción) en proporción y se emite en el mes configurado. Cargos sueltos (cuota de ingreso, aporte extraordinario) con `emitir_cargo`.
- **Cobros**: se aplican a las cuotas más viejas con saldo (o a las elegidas); el excedente queda como **saldo a favor** (2.1.04.01) y se aplica solo al emitir las cuotas siguientes. Nunca por encima del saldo de la cuota, nunca a cuotas de otra persona ni emitidas después del cobro. Misma referencia bancaria, una sola vez.
- **Pago en la cuenta de una disciplina** (sus cuentas están a nombre de personas): Debe 1.1.04.03 Fondos en poder de disciplinas (auxiliar disciplina) — queda como deuda de la disciplina con el club (la cuota social que cobró, y su propia cuota hasta la liquidación).
- **Débito Visa**: por liquidación (`aplicar_liquidacion_visa(…, p_iva)`): un asiento con el neto al banco y la **comisión y su IVA por separado** como gasto (5.2.08), repartidos entre el club (centro ADM) y cada disciplina en proporción a **todo lo cobrado de sus socios** (cuota de la disciplina y cuota social a su cargo) por su `porcentaje_comision` (`disciplinas_cobranza`). Una persona una vez por período. Los rechazos se registran y no tocan la cuota (la deuda sigue).
- **Liquidación mensual a las disciplinas** (migración `20261008100000`, como la planilla "LIQUIDACION 2025 - DEBITO VISA" de tesorería): ver la sección "Liquidación mensual". Hoy lo transferido se trata como **gasto de la disciplina** (sin rendición de cuentas); si las disciplinas pasan a rendir, se cambia el parámetro `socios/liquidacion_disciplinas` a 1.1.04.03 y se agrega la rendición.
- **Notas de crédito** (`registrar_credito`): baja, anulación o bonificación. Debe ingreso de la cuota (con su centro) / Haber cuotas a cobrar.
- **Baja** (`dar_baja`): acredita siempre las cuotas de períodos posteriores (en la anual, la parte posterior que esté impaga) y, si se elige (o si lo dice la configuración), el resto de la deuda; cierra inscripciones y medio de cobro.
- **Anular** = contra-asiento; nada se edita ni se borra. Anular un cobro revierte también el saldo a favor que ya se había aplicado.
- **Morosidad configurable** (`socios.config`): "al día" = cuotas vencidas impagas ≤ tolerancia (una para débito, otra para el resto); día de vencimiento; si el mes del alta se cobra; qué hacer con la deuda en la baja; mes de la cuota anual.

## Permisos

| Rol | Puede |
|---|---|
| secretaria | altas, bajas, inscripciones, medio de cobro, planes; registrar cobros |
| tesorero | emitir cuotas, cargos, notas de crédito, anular, débito Visa, liquidar disciplinas, precios, configuración; registrar cobros |
| comision_fiscal | ver todo |
| socio | ver sus cuotas, cobros y estado de cuenta (`estado_cuenta` de su propia persona) |

## Funciones

Padrón (secretaría): `alta_socio(p_persona jsonb, p_desde, p_planes jsonb, p_medio jsonb)`, `dar_baja(p_persona, p_hasta, p_motivo, p_notas, p_anular_deuda)`, `anular_baja`, `inscribir`, `finalizar_inscripcion`, `cambiar_plan`, `cambiar_medio_cobro`.

Cuotas (tesorería): `previsualizar_lote(p_periodo)` (con `excluida` = motivo), `emitir_lote(p_periodo, p_fecha_emision?, p_fecha_vencimiento?, p_omitir bigint[])`, `emitir_cuota(p_suscripcion, p_periodo, p_importe?, p_motivo?)`, `emitir_cargo`, `anular_lote`, `anular_cuota`.

Cobranza: `registrar_cobro(p_persona, p_fecha, p_medio, p_importe, p_cuenta?, p_disciplina?, p_referencia?, p_cuotas?)` (también secretaría), `anular_cobro`, `registrar_credito(p_persona, p_fecha, p_tipo, p_motivo, p_cuotas jsonb [{cuota_id, importe?}])`, `anular_credito`, `aplicar_liquidacion_visa(p_periodo, p_fecha, p_comision, p_cobrados [{persona_id, importe, referencia?}], p_rechazados [{persona_id?, documento?, importe, motivo?}], p_cuenta?, p_archivo?)`, `anular_liquidacion_visa`, `previsualizar_liquidacion_disciplina(p_disciplina, p_desde, p_hasta)`, `liquidar_disciplina(p_disciplina, p_desde, p_hasta, p_fecha, p_compensar, p_cuenta?, p_notas?)`, `anular_liquidacion_disciplina`.

Consultas: vistas `cuotas_saldo` (pagado, acreditado, saldo) y `cobros_saldo` (saldo a favor); `situacion(p_fecha)` (cuotas vencidas, deuda, saldo a favor, al día), `estado_cuenta(p_persona)`, `control_contable()` (cuotas y saldo a favor contra la contabilidad: la diferencia tiene que ser 0).

## Cuentas (`parametros_cuentas`, proceso `socios`)

| Rol | Cuenta |
|---|---|
| cuotas_sociales_cobrar | 1.1.03.01 (también cargos) |
| cuotas_disciplina_cobrar | 1.1.03.02 |
| ingreso_cuota_social | 4.1.01 |
| ingreso_cuota_disciplina | 4.2.01 (con centro) |
| anticipos | 2.1.04.01 |
| banco_cobros | 1.1.01.05 |
| caja | 1.1.01.01 |
| disciplinas | 1.1.04.03 (auxiliar disciplina) |
| comision_cobranza | 5.2.08 (con centro) |
| liquidacion_disciplinas | 5.2.09 (con centro) |

## Disciplinas: cuenta corriente y planes de pago

Migraciones `20261007100000_disciplinas_cuenta_planes.sql` y `20261007110000_disciplinas_correcciones.sql`; pantallas en `/secretaria/disciplinas` (lista y detalle con pestañas Resumen, Cuenta corriente, Planes de pago y Socios).

- **Cuenta corriente** (`cuenta_corriente_disciplina`, `saldos_disciplinas`): la cuenta 1.1.04.03 con el auxiliar de la disciplina, todos los ejercicios (solo la apertura del primero). Tipos: compra de la tienda, devolución, cuota cobrada por la disciplina, liquidación (compensación), pago, anulación. Saldo + = deuda con el club. Solo tesorería, Comisión Fiscal y super_admin; secretaría ve la ficha y los socios.
- **Pagos de la disciplina** (`registrar_cobro_disciplina`, `anular_cobro_disciplina`): Debe banco/caja / Haber 1.1.04.03; se pueden imputar a un plan.
- **Liquidación = deuda del club; el pago es otro asiento** (migración `20261007120000_liquidaciones_deuda.sql`). `liquidar_disciplina` hace Debe 5.2.09 (centro de la disciplina) / Haber 2.1.07.02 *Liquidaciones a pagar a disciplinas* (auxiliar disciplina). `pagar_liquidacion_disciplina` (total o en partes) hace Debe 2.1.07.02 / Haber banco (lo transferido) y/o Haber 1.1.04.03 (lo compensado de la deuda de la disciplina, imputable a un plan). `anular_pago_liquidacion`; una liquidación con pagos no se anula. Vista `liquidaciones_disciplina_saldo`.
- **Cuenta corriente con las dos cuentas**: 1.1.04.03 (la disciplina le debe al club: compras, préstamos, cuotas que cobró) y 2.1.07.02 (el club le debe: liquidaciones sin pagar). Saldo neto Σ(debe − haber): + debe la disciplina, − le debe el club. `saldos_disciplinas()` da `debe_al_club`, `club_le_debe` y el neto. Los **préstamos** del club y otros movimientos son asientos manuales en Contabilidad sobre esas cuentas, con el auxiliar de la disciplina; figuran como "asiento manual".
- **Planes de pago** (`crear_plan_pago`, `cancelar_plan_pago`): cuotas con vencimiento sobre pedidos de la disciplina (importe = total de los pedidos o menos). No generan asientos: la deuda ya está desde la venta. Pagos y compensaciones de las liquidaciones (`liquidar_disciplina(..., p_plan)`) se imputan a las cuotas en orden; lo que excede queda a cuenta de la deuda general. Vistas `plan_pago_cuotas_saldo` y `planes_pago_resumen` (situación: al día, atrasado, cumplido, cancelado). Un pedido en un solo plan vigente y no se cancela mientras esté en uno; las cuotas no se editan (se cancela y se arma otro).

## Liquidación mensual (como la planilla de tesorería)

Por disciplina y mes del débito (`previsualizar_liquidacion_disciplina(d, mes)`, `previsualizar_liquidaciones_mes(mes)`, `liquidar_disciplinas_mes(mes, fecha, [ids])`):

```
  Cobrado por débito Visa de sus socios (la cuota entera, social incluida)
− cuota social del club (la cobrada en el débito y la "a cargo de la disciplina")
− comisión del débito − IVA de la comisión (su parte, en proporción)
+ cuotas de la disciplina cobradas por otros medios en el mes
= a pagar a la disciplina  (o a depositar, si da negativo)
```

- **La cuota social de cada socio de una disciplina la garantiza la disciplina**: al liquidar, la social del mes que siga impaga (tarjeta rebotada, pago directo a la disciplina, deuda) la pone la disciplina: queda cobrada con un cobro `liquidacion_disciplina` y la parte de la disciplina la sigue debiendo el socio (la cobra la disciplina). Es el "socios × cuota social" de la planilla.
- Un socio en varias disciplinas paga una sola cuota social: está a cargo de la disciplina de su inscripción más antigua (`cuotas.disciplina_responsable_id`, la fija un trigger al emitir).
- El débito Visa del mes cuenta entero aunque se acredite al mes siguiente; lo demás, por fecha de aplicación. Un mes liquidado no admite cobros con fecha dentro de él ni se puede anular su débito.
- Asiento: Debe 5.2.09 (centro de la disciplina) cuotas cobradas − gastos / Haber 1.1.03.01 la social que pone la disciplina / Haber 2.1.07.02 lo que se le paga (o Debe 1.1.04.03 lo que tiene que depositar). El pago sigue siendo otro asiento (`pagar_liquidacion_disciplina`).
- La liquidación guarda el detalle por socio (`detalle`: débito, rebote, para la disciplina, otros medios, social a cargo) y `resumen_liquidacion(id)` lo devuelve para la pantalla y el mail.
- **Mail a los representantes**: al liquidar, cada representante con `recibe_liquidacion` recibe el resumen (plantilla del sistema `liquidacion_disciplina`, editable en Comunicaciones; armado en `src/lib/socios/liquidacion-mail.ts`).

## Representantes y panel de la disciplina

Migraciones `20261008110000` a `20261008150000`; pantallas en `/disciplina/[id]`.

- `socios.representantes`: nombre, correo, cargo, si recibe la liquidación y si entra al panel. Se vincula sola con la cuenta del sitio con ese correo (también si la crea después) y el rol `representante_disciplina` se asigna y se quita solo. Los administran tesorería y secretaría (`guardar_representante`, `quitar_representante`).
- El panel usa funciones `disc_*` (SECURITY DEFINER): el representante solo ve y cambia su disciplina; el club también puede. Lecturas: `mis_disciplinas`, `disc_resumen`, `disc_socios`, `disc_planes`, `disc_liquidaciones`, `disc_cuenta`, `disc_cambios`. Cambios: `disc_alta_socio`, `disc_baja`, `disc_cambiar_plan`, `disc_cambiar_medio` (tarjetas), `disc_actualizar_datos`, `disc_crear_plan`, `disc_nuevo_precio`, `disc_registrar_cobro`. Delegan en las funciones de secretaría y tesorería con `socios.delegado` encendido solo durante la llamada.
- **Registro de cambios** (`socios.cambios_disciplina`): lo escriben triggers de membresías, inscripciones y medios de cobro, y las funciones del panel, haga el cambio quien lo haga (origen `representante` o `club`, quién, cuándo, antes y después, desde cuándo rige). No se edita ni se borra. Lo que cambia el débito (adhesión, tarjeta, alta o baja con débito, cambio de plan, precio) queda **pendiente** hasta que tesorería lo carga en el portal y lo marca (`marcar_cambios`). Pantalla: Cuotas → Cambios para el débito (`cambios_debito`).
- **Tarjetas**: el número completo se valida (Luhn) y se guarda **cifrado en Supabase Vault solo hasta que tesorería lo aplica**; en el medio de cobro quedan los últimos 4, el vencimiento y el emisor. `ver_tarjeta` (solo tesorería) lo muestra y deja registro de quién lo vio; `marcar_cambios` lo borra.

## Pendiente

- Pantallas de secretaría (padrón nuevo), de cuotas y cobranza, y estado de cuenta en Mi cuenta.
- Formato del archivo de liquidación de Visa (hoy se cargan las filas: persona, importe, cobrado/rechazado).
- Confirmar con tesorería: ¿un socio en dos disciplinas paga dos cuotas sociales (como en la planilla, una por disciplina) o una sola (como hace el sistema)?
- Migrar el padrón actual: crear membresías e inscripciones desde `padron_socios`/`padron_disciplinas` (las categorías en texto libre se mapean a planes).
- Cron diario de `socios.sincronizar_vigencias()`.
