// server.mjs
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";

// ----------------------- Paths -----------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----------------------- PG Config -------------------
function parseAzureConnString(cs) {
  // Ejemplo: "Database=controlproyectos;Server=projectmn.postgres.database.azure.com;User Id=projectadmin;Password=***"
  const parts = Object.fromEntries(
    cs
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const i = p.indexOf("=");
        if (i === -1) return [p, ""];
        return [p.slice(0, i).toLowerCase().replace(/\s+/g, ""), p.slice(i + 1)];
      })
  );
  const host = (parts.server || parts.host || "").replace(/^tcp:/i, "");
  const database = parts.database || parts.db || process.env.PGDATABASE || "controlproyectos";
  const user = parts["userid"] || parts.user || parts.username || process.env.PGUSER;
  const password = parts.password || process.env.PGPASSWORD;
  const port = Number(parts.port || process.env.PGPORT || 5432);
  return {
    host,
    database,
    user,
    password,
    port,
    ssl: { rejectUnauthorized: false },
  };
}

function buildPgConfig() {
  const pickFirstByPrefix = (prefixes) => {
    for (const [k, v] of Object.entries(process.env)) {
      if (v && prefixes.some((p) => k.toUpperCase().startsWith(p))) {
        return { key: k, value: v };
      }
    }
    return null;
  };

  // 1) Connection strings del App Service
  const csAnyCustom = pickFirstByPrefix(["CUSTOMCONNSTR_"]);
  if (csAnyCustom) {
    const cfg = parseAzureConnString(csAnyCustom.value);
    cfg._source = csAnyCustom.key;
    console.log(`PG source: ${csAnyCustom.key} (Custom connstring)`);
    return cfg;
  }

  const csAnyPg = pickFirstByPrefix(["POSTGRESQLCONNSTR_"]);
  if (csAnyPg) {
    const cfg = parseAzureConnString(csAnyPg.value);
    cfg._source = csAnyPg.key;
    console.log(`PG source: ${csAnyPg.key} (PostgreSQL connstring)`);
    return cfg;
  }

  // 2) Variables sueltas PG*
  const cfgEnv = {
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || "controlproyectos",
    port: Number(process.env.PGPORT || 5432),
    ssl: { rejectUnauthorized: false },
    _source: "PG* env vars",
  };
  console.log(`PG source: individual PG* env vars`);
  return cfgEnv;
}

const pgConfig = buildPgConfig();
console.log("PG config →", {
  host: pgConfig.host,
  port: pgConfig.port,
  database: pgConfig.database,
  ssl: !!pgConfig.ssl,
});
const pool = new Pool(pgConfig);

// ----------------------- Zod Helpers ------------------
// Convierte "" -> null para campos string opcionales
const zStrOpt = z
  .preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().nullable())
  .optional();

// Coerción numérica; "" -> null; " 123 " -> 123
const zNumNullable = z
  .preprocess((v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === "string" && v.trim() === "") return null; // "" -> null
    const n = Number(typeof v === "string" ? v.trim() : v);
    return Number.isFinite(n) ? n : NaN;
  }, z.number({ invalid_type_error: "Debe ser un número" }).nullable());

// Coerción numérica requerida (no permite null)
const zNumRequired = z
  .preprocess((v) => {
    if (v === null || v === undefined) return NaN;
    if (typeof v === "string" && v.trim() === "") return NaN;
    const n = Number(typeof v === "string" ? v.trim() : v);
    return Number.isFinite(n) ? n : NaN;
  }, z.number({ invalid_type_error: "Debe ser un número" }));

// Fecha "YYYY-MM-DD" o null/omitir
const zDateOpt = z
  .preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Formato de fecha YYYY-MM-DD" })
    .nullable())
  .optional();
  
  // Acepta "", null, undefined, NaN, "nan" y cae al valor por defecto (0)
const zNumberOrDefault = (def = 0) =>
  z.preprocess((v) => {
    if (v === null || v === undefined) return def;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (s === "" || s === "nan") return def;
      const n = Number(s);
      return Number.isFinite(n) ? n : def;
    }
    if (typeof v === "number") {
      return Number.isFinite(v) ? v : def;
    }
    return def;
  }, z.number());

// ----------------------- Schemas ----------------------
const ProjectCreate = z.object({
  nombre: z.string().min(1, "nombre es requerido"),
  pais: z.string().min(1, "pais es requerido"),
  consultor: z.string().min(1, "consultor es requerido"),

  // NUEVO: acepta "", null, NaN, "nan" y los convierte a 0; valida >= 0
  monto_oportunidad: zNumberOrDefault(0).refine((n) => n >= 0, {
    message: "monto_oportunidad debe ser >= 0",
  }),

  numero_oportunidad: zStrOpt,   // "" -> null
  client_name: zStrOpt,          // "" -> null
  pm: zStrOpt,                   // "" -> null

  planned_hours: zNumNullable,   // "" -> null
  executed_hours: zNumNullable,  // "" -> null
  hourly_rate: zNumNullable,     // "" -> null

  start_date: zDateOpt,          // "" -> null
  end_date: zDateOpt,            // "" -> null
});

const ProjectUpdate = z.object({
  nombre: z.string().optional(),
  pais: z.string().optional(),
  consultor: z.string().optional(),
  monto_oportunidad: zNumNullable, // permite null
  numero_oportunidad: zStrOpt,
  client_name: zStrOpt,
  pm: zStrOpt,
  planned_hours: zNumNullable,
  executed_hours: zNumNullable,
  hourly_rate: zNumNullable,
  start_date: zDateOpt,
  end_date: zDateOpt,
  terminado: z.boolean().optional(),
});

const VisitCreate = z.object({
  producto: zStrOpt,
  client_name: zStrOpt,
  numero_oportunidad: zStrOpt,
  pais: zStrOpt,
  consultor: zStrOpt,
  hora: zStrOpt,
  fecha: zDateOpt,
  monto_oportunidad: zNumNullable,
  activo: z.boolean().optional(),
});

// ----------------------- Ensure Tables ----------------
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id UUID PRIMARY KEY,
      nombre TEXT NOT NULL,
      numero_oportunidad TEXT,
      pais TEXT NOT NULL,
      consultor TEXT NOT NULL,
      monto_oportunidad NUMERIC NOT NULL DEFAULT 0,
      client_name TEXT,
      pm TEXT,
      planned_hours NUMERIC,
      executed_hours NUMERIC,
      hourly_rate NUMERIC,
      start_date DATE,
      end_date DATE,
      terminado BOOLEAN NOT NULL DEFAULT false,
      fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS visits (
      id UUID PRIMARY KEY,
      producto TEXT,
      client_name TEXT,
      numero_oportunidad TEXT,
      pais TEXT,
      consultor TEXT,
      hora TEXT,
      fecha DATE,
      monto_oportunidad NUMERIC,
      activo BOOLEAN NOT NULL DEFAULT true,
      fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

// ----------------------- Express ----------------------
const app = express();
app.use(express.json());

// Health simple
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Health DB: prueba SELECT 1 y muestra de dónde leyó la cadena
app.get("/api/health/db", async (_req, res) => {
  try {
    const r = await pool.query("SELECT 1 as ok");
    res.json({
      ok: true,
      ping: r.rows[0].ok,
      source: pgConfig._source || "unknown",
      host: pgConfig.host,
      db: pgConfig.database,
      port: pgConfig.port,
      ssl: !!pgConfig.ssl,
    });
  } catch (e) {
    console.error("DB health error:", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ---------- Projects ----------
app.get("/api/projects", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM projects ORDER BY fecha_creacion DESC`
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Error listando proyectos" });
  }
});

app.get("/api/projects/:id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM projects WHERE id = $1 LIMIT 1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: "No encontrado" });
    res.json({ ok: true, project: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Error obteniendo proyecto" });
  }
});

app.put("/api/projects/:id", async (req, res) => {
  try {
    const parsed = ProjectUpdate.parse(req.body); // <- tu esquema parcial
    const fields = Object.keys(parsed);
    if (fields.length === 0) {
      return res.status(400).json({ ok: false, error: "No hay campos para actualizar." });
    }

    const values = [];
    const sets = [];
    let i = 1;
    for (const f of fields) {
      sets.push(`${f} = $${i++}`);
      values.push(parsed[f]);
    }
    values.push(req.params.id);

    const { rowCount } = await pool.query(
      `UPDATE projects SET ${sets.join(", ")}, updated_at = NOW() WHERE id = $${i}`,
      values
    );

    if (rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Proyecto no encontrado" });
    }
    res.json({ ok: true });
  } catch (e) {
    if (e.errors) {
      return res.status(400).json({ ok: false, error: "Datos inválidos", details: e.errors });
    }
    console.error(e);
    res.status(500).json({ ok: false, error: "Error actualizando proyecto" });
  }
});

app.post("/api/projects", async (req, res) => {
  try {
    const parsed = ProjectCreate.parse(req.body);

    const id = uuidv4();
    const {
      nombre,
      numero_oportunidad = null,
      pais,
      consultor,
      monto_oportunidad,
      client_name = null,
      pm = null,
      planned_hours = null,
      executed_hours = null,
      hourly_rate = null,
      start_date = null,
      end_date = null,
    } = parsed;

    const { rows } = await pool.query(
      `
      INSERT INTO projects
      (id, nombre, numero_oportunidad, pais, consultor, monto_oportunidad,
       client_name, pm, planned_hours, executed_hours, hourly_rate,
       start_date, end_date)
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *;
      `,
      [
        id,
        nombre,
        numero_oportunidad,
        pais,
        consultor,
        monto_oportunidad,
        client_name,
        pm,
        planned_hours,
        executed_hours,
        hourly_rate,
        start_date,
        end_date,
      ]
    );

    res.status(201).json({ ok: true, project: rows[0] });
  } catch (e) {
    if (e?.name === "ZodError") {
      console.error("Validation error:", e.issues);
      return res
        .status(400)
        .json({ ok: false, error: "Datos inválidos", details: e.issues });
    }
    console.error("POST /api/projects error:", e);
    res.status(500).json({ ok: false, error: "Error creando proyecto" });
  }
});

app.get("/api/projects", async (req, res) => {
  try {
    const status = (req.query.status || "active").toString();
    const onlyActive = status !== "archived";
    const { rows } = await pool.query(
      `SELECT id, nombre, numero_oportunidad, pais, consultor, monto_oportunidad,
              planned_hours, executed_hours, hourly_rate, start_date, end_date,
              client_name, pm, finalizado, activo, fecha_creacion, updated_at
       FROM projects
       WHERE activo = $1
       ORDER BY fecha_creacion DESC`,
      [onlyActive] // true => activos; false => archivados
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Error fetching projects" });
  }
});


app.put("/api/projects/:id", async (req, res) => {
  try {
    const data = ProjectUpdate.parse(req.body);

    const allowed = [
      "nombre",
      "numero_oportunidad",
      "pais",
      "consultor",
      "monto_oportunidad",
      "client_name",
      "pm",
      "planned_hours",
      "executed_hours",
      "hourly_rate",
      "start_date",
      "end_date",
      "terminado",
    ];

    const sets = [];
    const values = [];
    let i = 1;

    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        sets.push(`${key} = $${i++}`);
        values.push(data[key]);
      }
    }

    if (sets.length === 0) {
      return res.status(400).json({ ok: false, error: "Nada para actualizar" });
    }

    values.push(req.params.id);
    const { rows } = await pool.query(
      `UPDATE projects SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      values
    );

    if (!rows[0]) return res.status(404).json({ ok: false, error: "No encontrado" });
    res.json({ ok: true, project: rows[0] });
  } catch (e) {
    if (e?.name === "ZodError") {
      console.error("Validation error:", e.issues);
      return res
        .status(400)
        .json({ ok: false, error: "Datos inválidos", details: e.issues });
    }
    console.error(e);
    res.status(500).json({ ok: false, error: "Error actualizando proyecto" });
  }
});

app.delete("/api/projects/:id", async (req, res) => {
  try {
    const r = await pool.query(`DELETE FROM projects WHERE id = $1`, [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ ok: false, error: "No encontrado" });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Error eliminando proyecto" });
  }
});

// ---------- Visits ----------
app.get("/api/visits", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM visits WHERE activo = true ORDER BY fecha_creacion DESC`
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Error listando visitas" });
  }
});

app.post("/api/visits", async (req, res) => {
  try {
    const v = VisitCreate.parse(req.body);
    const id = uuidv4();

    const {
      producto = null,
      client_name = null,
      numero_oportunidad = null,
      pais = null,
      consultor = null,
      hora = null,
      fecha = null,
      monto_oportunidad = null,
      activo = true,
    } = v;

    const { rows } = await pool.query(
      `
      INSERT INTO visits
      (id, producto, client_name, numero_oportunidad, pais, consultor, hora, fecha, monto_oportunidad, activo)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *;
      `,
      [
        id,
        producto,
        client_name,
        numero_oportunidad,
        pais,
        consultor,
        hora,
        fecha,
        monto_oportunidad,
        activo,
      ]
    );

    res.status(201).json({ ok: true, visit: rows[0] });
  } catch (e) {
    if (e?.name === "ZodError") {
      console.error("Validation error:", e.issues);
      return res
        .status(400)
        .json({ ok: false, error: "Datos inválidos", details: e.issues });
    }
    console.error(e);
    res.status(500).json({ ok: false, error: "Error creando visita" });
  }
});

app.delete("/api/visits/:id", async (req, res) => {
  try {
    const r = await pool.query(`UPDATE visits SET activo = false WHERE id = $1`, [
      req.params.id,
    ]);
    if (r.rowCount === 0) return res.status(404).json({ ok: false, error: "No encontrada" });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Error eliminando visita" });
  }
});

// ----------------------- Static SPA -------------------
const distPath = path.join(__dirname, "dist");
app.use(express.static(distPath));

// Catch-all para SPA (no intercepta /api/*)
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(distPath, "index.html"));
});

// ----------------------- Start ------------------------
const port = process.env.PORT || 8080;

(async () => {
  try {
    await ensureTables();
    app.listen(port, "0.0.0.0", () => {
      console.log(`App running on http://localhost:${port}`);
    });
  } catch (e) {
    console.error("Startup error:", e);
    process.exit(1);
  }
})();
