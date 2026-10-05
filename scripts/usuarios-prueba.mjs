// Usuarios de prueba, uno por rol, para probar el panel en una base de
// prueba (la local o la rama "rediseno" de Supabase). NUNCA en producción.
//
// Uso:
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service_role> \
//     node scripts/usuarios-prueba.mjs
// Opcionales:
//   PRUEBA_PASSWORD   contraseña para todos (si no, se genera una)
//   PRUEBA_DISCIPLINA disciplina de la representante (por defecto "Hockey Femenino")
//
// Las credenciales quedan en .usuarios-prueba.local (no se sube a git).
// Volver a correrlo actualiza la contraseña y los roles; no duplica nada.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";

const URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PRODUCCION = "nalvxuywlbtdmnpgjgwf";
if (!URL || !KEY) {
  console.error("Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY de la base de PRUEBA.");
  process.exit(1);
}
if (URL.includes(PRODUCCION)) {
  console.error("Esta es la base de producción: los usuarios de prueba no se crean ahí.");
  process.exit(1);
}

const PASSWORD = process.env.PRUEBA_PASSWORD ?? `Prueba-${randomBytes(6).toString("base64url")}`;
const DISCIPLINA = process.env.PRUEBA_DISCIPLINA ?? "Hockey Femenino";
const DOMINIO = "prueba.test";

const USUARIOS = [
  { email: `admin@${DOMINIO}`, nombre: "Ada", apellido: "Admin", roles: ["super_admin"], que: "Todo el sistema" },
  { email: `tesoreria@${DOMINIO}`, nombre: "Teo", apellido: "Tesorería", roles: ["tesorero"], que: "Contabilidad, cuotas, débito, liquidaciones, cambios para el débito" },
  { email: `fiscal@${DOMINIO}`, nombre: "Fina", apellido: "Fiscal", roles: ["comision_fiscal"], que: "Ve libros, cuotas y reportes sin poder cambiar nada" },
  { email: `secretaria@${DOMINIO}`, nombre: "Sara", apellido: "Secretaría", roles: ["secretaria"], que: "Padrón, altas y bajas, disciplinas, comunicaciones" },
  { email: `tienda@${DOMINIO}`, nombre: "Tino", apellido: "Tienda", roles: ["tienda"], que: "Pedidos, POS, productos, stock, compras" },
  { email: `eventos@${DOMINIO}`, nombre: "Eva", apellido: "Eventos", roles: ["eventos"], que: "Eventos y entradas" },
  { email: `scanner@${DOMINIO}`, nombre: "Escaner", apellido: "Puerta", roles: ["scanner"], que: "Solo el escáner de QR" },
  { email: `delegada@${DOMINIO}`, nombre: "Delia", apellido: "Delegada", roles: [], representante: true, que: `Panel de ${DISCIPLINA} (representante)` },
  { email: `socio@${DOMINIO}`, nombre: "Santi", apellido: "Socio", roles: [], socio: true, que: "Mi cuenta como socio: carnet y cuotas" },
  { email: `nosocio@${DOMINIO}`, nombre: "Nora", apellido: "Visitante", roles: [], que: "Usuario registrado sin membresía (tienda y eventos)" },
];

const db = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const socios = createClient(URL, KEY, { auth: { persistSession: false }, db: { schema: "socios" } });

async function usuarioPorEmail(email) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const u = data.users.find((x) => x.email?.toLowerCase() === email);
    if (u || data.users.length < 200) return u ?? null;
  }
  return null;
}

async function asegurarUsuario(u) {
  const existente = await usuarioPorEmail(u.email);
  const meta = { nombre: u.nombre, apellido: u.apellido };
  if (existente) {
    const { error } = await db.auth.admin.updateUserById(existente.id, { password: PASSWORD, user_metadata: meta, email_confirm: true });
    if (error) throw error;
    return existente.id;
  }
  const { data, error } = await db.auth.admin.createUser({ email: u.email, password: PASSWORD, email_confirm: true, user_metadata: meta });
  if (error) throw error;
  return data.user.id;
}

const { data: roles, error: eRoles } = await db.from("roles").select("id, nombre");
if (eRoles) throw eRoles;
const rolId = new Map(roles.map((r) => [r.nombre, r.id]));

const filas = [];
for (const u of USUARIOS) {
  try {
    const id = await asegurarUsuario(u);
    for (const r of u.roles) {
      const { error } = await db.from("perfil_roles").upsert({ perfil_id: id, rol_id: rolId.get(r) }, { onConflict: "perfil_id,rol_id" });
      if (error) throw error;
    }
    if (u.representante) {
      const { data: d } = await db.from("disciplinas").select("id").eq("nombre", DISCIPLINA).maybeSingle();
      if (!d) throw new Error(`No existe la disciplina "${DISCIPLINA}"`);
      const { data: ya } = await socios.from("representantes").select("id").eq("disciplina_id", d.id).eq("email", u.email).eq("activo", true).maybeSingle();
      if (!ya) {
        const { error } = await socios.rpc("guardar_representante", {
          p_id: null, p_disciplina: d.id,
          p_datos: { nombre: `${u.nombre} ${u.apellido}`, email: u.email, cargo: "Delegada (prueba)", recibe_liquidacion: true, acceso_panel: true },
        });
        if (error) throw error;
      }
    }
    if (u.socio) {
      const cedula = "90009009";
      const { data: p } = await db.from("padron_socios").select("id").eq("cedula", cedula).maybeSingle();
      let personaId = p?.id;
      if (!personaId) {
        const { data: plan } = await socios.from("planes").select("id").eq("tipo", "social").eq("activo", true).order("id").limit(1).maybeSingle();
        const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Montevideo" });
        const { data: nuevo, error } = await socios.rpc("alta_socio", {
          p_persona: { cedula, nombre: u.nombre, apellido: u.apellido, email: u.email },
          p_desde: hoy, p_planes: plan ? [{ plan_id: plan.id }] : [], p_medio: null,
        });
        if (error) throw error;
        personaId = nuevo;
      }
      const { error } = await db.from("padron_socios").update({ perfil_id: id, vinculado_at: new Date().toISOString() }).eq("id", personaId);
      if (error) throw error;
    }
    filas.push(`${u.email.padEnd(26)} ${u.que}`);
    console.log("ok", u.email);
  } catch (e) {
    console.log("FALLA", u.email, e.message ?? e);
  }
}

const texto = `Usuarios de prueba — ${URL}\nContraseña (todos): ${PASSWORD}\n\n${filas.join("\n")}\n`;
writeFileSync(".usuarios-prueba.local", texto);
console.log(`\nListo: ${filas.length} usuarios. Las credenciales quedaron en .usuarios-prueba.local`);
