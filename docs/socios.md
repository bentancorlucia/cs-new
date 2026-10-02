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
- **Débito Visa**: por liquidación (`aplicar_liquidacion_visa`): un asiento con el neto al banco y la comisión como gasto (5.2.08), repartida entre el club (centro ADM) y cada disciplina en proporción a lo cobrado de sus cuotas por su `porcentaje_comision` (`disciplinas_cobranza`). Una persona una vez por período. Los rechazos se registran y no tocan la cuota (la deuda sigue).
- **Liquidación a las disciplinas** (`liquidar_disciplina`): lo cobrado de sus cuotas en el período (por fecha de aplicación) menos su parte de la comisión. Asiento: Debe 5.2.09 Transferencias a disciplinas (centro de la disciplina) / Haber 1.1.04.03 (lo que se compensa de su deuda, incluidos pedidos de tienda) / Haber banco (lo transferido). Un período no se liquida dos veces y no admite cobros posteriores con fecha dentro de él. Hoy lo transferido se trata como **gasto de la disciplina** (sin rendición de cuentas); si las disciplinas pasan a rendir, se cambia el parámetro `socios/liquidacion_disciplinas` a 1.1.04.03 y se agrega la rendición.
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

## Pendiente

- Pantallas de secretaría (padrón nuevo), de cuotas y cobranza, y estado de cuenta en Mi cuenta.
- Formato del archivo de liquidación de Visa (hoy se cargan las filas: persona, importe, cobrado/rechazado).
- Migrar el padrón actual: crear membresías e inscripciones desde `padron_socios`/`padron_disciplinas` (las categorías en texto libre se mapean a planes).
- Cron diario de `socios.sincronizar_vigencias()`.
