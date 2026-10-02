# Contabilidad (partida doble)

Módulo contable del club. Reemplaza a la tesorería actual (`/tesoreria`, tablas `cuentas_financieras`, `movimientos_financieros`, etc.), que sigue en uso hasta el corte. Se desarrolla en la rama `rediseno` contra el branch de Supabase `rediseno`.

- Esquema: `supabase/migrations/20261002120000_contabilidad_nucleo.sql`
- Tests de integridad: `supabase/tests/contabilidad_nucleo.test.sql` (`supabase test db`)
- Tipos: `src/types/contabilidad.ts` (generar con `supabase gen types typescript --local --schema contabilidad`)
- Rutas: `/contabilidad/*`, roles `super_admin`, `tesorero` (escritura) y `comision_fiscal` (solo lectura)

## Principios

1. **La base es la autoridad.** Las reglas viven en triggers y constraints del schema `contabilidad`, así valen también para `service_role`. La app valida para dar buenos mensajes, pero nunca es la única barrera.
2. **Un asiento confirmado no se modifica ni se borra.** Se corrige con una **reversión** (asiento espejo) y, si hace falta, uno nuevo.
3. **Todo importe se guarda en moneda funcional (UYU)** en `debe`/`haber`. Las líneas de cuentas en otra moneda guardan además `importe_origen` y `tc`, con `round(importe_origen × tc, 2) = debe + haber`.
4. **Ejercicio = año calendario** (Estatuto art. 25: cierra el 31/12). Períodos mensuales.
5. **Saldos a una fecha se acumulan desde el inicio del ejercicio**: la apertura ya resume lo anterior.

## Modelo

| Tabla | Para qué |
|---|---|
| `monedas` | `UYU`, `USD` (código BCU 2225) |
| `config` | fila única: `moneda_funcional` (UYU), `regimen_iva` (`no_contribuyente` por defecto) |
| `cotizaciones` | `(moneda, fecha) → tasa` en UYU por unidad; `fuente` `bcu` o `manual` |
| `cuentas` | plan de cuentas jerárquico (ver abajo) |
| `cuentas_sistema` | rol → cuenta: `resultado_ejercicio`, `resultados_acumulados`, `diferencia_cambio_ganada`, `diferencia_cambio_perdida` |
| `parametros_cuentas` | proceso + rol (+ moneda) → cuenta. Lo usan los módulos que contabilizan solos (tienda, cuotas) |
| `centros_costo` | uno por disciplina (`disciplina_id`) + Administración, Tienda, Eventos, Instalaciones |
| `ejercicios`, `periodos` | ejercicio con 12 períodos; estado `abierto`/`cerrado` |
| `asientos` | cabecera; `estado` `borrador`/`confirmado`; `tipo` (abajo); `numero` por ejercicio, asignado al confirmar |
| `lineas` | `debe`/`haber` (uno solo > 0), cuenta, auxiliares (`proveedor_id`, `disciplina_id`), `centro_costo_id`, moneda de origen |
| `auditoria` | append-only, una fila por cada alta/cambio/baja en las tablas contables |

### Plan de cuentas

Código jerárquico `1.1.01.05`; el primer dígito define la clase: 1 activo, 2 pasivo, 3 patrimonio, 4 ingresos, 5 egresos. Columnas relevantes:

- `imputable`: solo las imputables reciben líneas; las agrupadoras suman a sus hijas.
- `naturaleza`: `deudora`/`acreedora`. Las regularizadoras (amortizaciones acumuladas, previsiones) son activo acreedoras.
- `moneda`: NULL = UYU. Solo activo/pasivo pueden ser en USD; esas cuentas tienen `revalua = true`.
- `corriente`: para el Estado de Situación (se hereda del rubro 1.1 / 1.2 / 2.1 / 2.2).
- `es_disponibilidad`: cajas y bancos (flujo de efectivo).
- `requiere_auxiliar`: `proveedor` o `disciplina` → la línea tiene que indicarlo.
- `requiere_centro_costo`: cuotas de disciplina, gastos deportivos, etc.

Reglas del plan: el hijo hereda clase y queda un nivel abajo del padre; su código cuelga del código del padre; no se cuelgan cuentas de una imputable; una cuenta con movimientos no cambia ubicación, clase, naturaleza, moneda, imputabilidad ni auxiliar.

Cuentas destacadas: `1.1.04.01` Visa a cobrar (débito automático) · `1.1.04.03` Fondos en poder de disciplinas (auxiliar disciplina) · `2.1.01.01/02` Proveedores UYU/USD (auxiliar proveedor) · `2.1.01.03` Mercadería recibida a facturar · `2.1.05.01` Donaciones Olla del Hogar a transferir (fondos de terceros, no ingreso) · `3.1.01` Fondo social · `3.4.01/02` Superávit (déficit) acumulado / del ejercicio · `4.4.01/02/03` Ventas a socios / no socios / disciplinas · `1.1.04.08` y `2.1.03.02` IVA (inactivas mientras el club no sea contribuyente).

### Tipos de asiento

`manual` · `automatico` (lo genera un módulo, con `origen_tipo`/`origen_id` únicos) · `apertura` (uno por ejercicio) · `cierre` · `refundicion` · `revaluacion` · `reversion` (apunta al original con `asiento_revertido_id`; el original queda con `revertido_por_id`).

Solo `manual` lo crea un usuario. La apertura del **primer** ejercicio la carga el tesorero (`guardar_asiento` con `p_tipo = 'apertura'`); las siguientes las genera el cierre.

## Reglas que hace cumplir la base

- Asiento: se crea en borrador; al confirmar exige ≥ 2 líneas y Σdebe = Σhaber exacto; recibe número correlativo del ejercicio.
- Confirmado = inmutable (cabecera y líneas). Borrador: se edita y borra solo si su período está abierto.
- Ejercicio y período se derivan de la fecha; fecha sin ejercicio o en período cerrado → error.
- Línea: cuenta imputable y activa; moneda coherente con la cuenta; auxiliar y centro de costo si la cuenta los exige (y no se permiten si no los exige).
- Períodos se cierran en orden y sin borradores; se reabre solo el último cerrado.
- Ejercicios consecutivos sin superposición.
- Cotizaciones: la moneda funcional no lleva; una manual no pisa a una BCU.

## Funciones (RPC, schema `contabilidad`)

Escritura (exigen `tesorero` o `super_admin`):

| Función | Qué hace |
|---|---|
| `crear_ejercicio(p_anio int) → uuid` | ejercicio calendario + 12 períodos; tiene que seguir al último |
| `cerrar_periodo(p_periodo uuid)` / `reabrir_periodo(p_periodo uuid)` | |
| `guardar_asiento(p_id uuid \| null, p_fecha date, p_descripcion text, p_lineas jsonb, p_confirmar bool = false, p_tipo = 'manual') → uuid` | crea o reemplaza un borrador; opcionalmente lo confirma |
| `confirmar_asiento(p_id) → int` | devuelve el número |
| `eliminar_borrador(p_id)` | |
| `revertir_asiento(p_id, p_motivo text, p_fecha date = hoy) → uuid` | asiento espejo confirmado |
| `registrar_cotizacion(p_moneda, p_fecha, p_tasa, p_fuente = 'manual')` | |
| `revaluar_moneda_extranjera(p_fecha) → uuid \| null` | ajusta cuentas USD a la cotización de la fecha |
| `cerrar_ejercicio(p_ejercicio) → uuid` (id del siguiente) | revaluación + cierre de resultados + refundición + apertura del siguiente |
| `reabrir_ejercicio(p_ejercicio)` | solo el último cerrado y si el siguiente no tiene movimientos |
| `sincronizar_centros_disciplinas() → int` | crea centros de costo para disciplinas nuevas |

Formato de `p_lineas`:

```json
[
  { "cuenta_id": "uuid", "lado": "debe", "importe": 1500, "descripcion": "opcional",
    "tc": 40.46, "centro_costo_id": "uuid", "proveedor_id": 12, "disciplina_id": 3 }
]
```

`importe` va en la moneda de la cuenta (USD para cuentas en dólares). Si la cuenta es en USD y no viene `tc`, se usa `tc_vigente(moneda, fecha)`: la cotización del día hábil anterior (Decreto 150/007 art. 74).

Lectura (super_admin, tesorero, comision_fiscal):

| Función | Qué devuelve |
|---|---|
| `saldos(p_desde, p_hasta, p_excluir_cierre = false)` | por cuenta imputable: `debe_anterior`, `haber_anterior` (desde el inicio del ejercicio hasta `p_desde`), `debe`, `haber` del rango, `origen_anterior`, `origen_periodo` (en moneda de la cuenta, signo debe − haber). El rango tiene que estar dentro de un ejercicio |
| `libro_mayor(p_cuenta, p_desde, p_hasta)` | movimientos con saldo acumulado (signo de presentación de la clase) y saldo en moneda de origen |
| `tc_vigente(moneda, fecha)` / `tc_cierre(moneda, fecha)` | TC para documentos (día anterior) / para valuar saldos (mismo día) |
| `puede_leer()` / `puede_escribir()` | |

## Reportes

- **Signo de presentación por clase**: activo y egreso `debe − haber`; pasivo, patrimonio e ingreso `haber − debe` (`saldoPresentacion` en `src/lib/contabilidad/formato.ts`).
- **Estado de Resultados**: ingresos y egresos con `p_excluir_cierre = true` (si no, un ejercicio cerrado da cero).
- **Estado de Situación**: activo, pasivo y patrimonio con `p_excluir_cierre = true`, más el resultado del ejercicio (ingresos − egresos) como "Superávit (déficit) del ejercicio". Corriente / no corriente según `cuentas.corriente`.
- **Balance de sumas y saldos**: `saldos` + árbol del plan, sumando hijas en las agrupadoras.

## App

- `src/lib/contabilidad/server.ts`: `createContabilidadClient()` (sesión del usuario, schema `contabilidad`) y `createContabilidadAdminClient()` (service role, solo para cron).
- `src/lib/contabilidad/permisos.ts`: `permisosContabilidad()` → `{ puedeLeer, puedeEscribir }`; `exigirEscritura()` en Server Actions.
- `src/lib/contabilidad/formato.ts`: `formatImporte`, `formatFecha`, `hoyUruguay`, `saldoPresentacion`, nombres de clase/tipo/mes, `mensajeError`.
- Escrituras por Server Actions que llaman a las funciones RPC y hacen `revalidatePath`. La `comision_fiscal` ve todo pero sin botones de escritura.
- Cotizaciones BCU: servicio SOAP `https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsbcucotizaciones`, moneda 2225, cron diario.
