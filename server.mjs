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
  // Ej: "Database=controlproyectos;Server=projectmn.postgres.database.azure.com;User Id=projectadmin;Password=***"
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
  // 1) Connection String del App Service (Azure)
  const azureCs =
    process.env.AZURE_POSTGRESQL_CONNECTIONSTRING ||
    process.env.POSTGRESQLCONNSTR_AZURE_POSTGRESQL_CONNECTIONSTRING ||
    process.env.POSTGRESQLCONNSTR_POSTGRESQL ||
    process.env.POSTGRESQLCONNSTR_DEFAULT;

  if (azureCs) return parseAzureConnString(azureCs);

  // 2) Variables PGHOST/PGUSER/...
  return {
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || "controlproyectos",
    port: Number(process.env.PGPORT || 5432),
    ssl: { rejectUnauthorized: false },
  };
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
// Coerción numérica compatible (sustituye z.coerce.number para versiones antiguas)
const zNumCoerce = z
  .preprocess((v) => {
    if (v === null || v === undefined) return v;         // permitir null/undefined
    if (typeof v === "string" && v.trim() === "") return null; // "" -> null
    const n = Number(typeof v === "string" ? v.trim() : v);
    return Number.isFinite(n) ? n : NaN;                 // NaN para que z.number lo rechace
  }, z.number({ invalid_type_error: "Debe ser un número" }))
  .refine((n) => Number.isFinite(n), { message: "Debe ser un número válido" });

// ----------------------- Schemas ----------------------
const ProjectCreate = z.object({
  nombre: z.string().min(1, "nombre es requerido"),
  pais: z.string().min(1, "pais es requerido"),
  consultor: z.string().min(1, "consultor es requerido"),
  // IMPORTANTE: no usamos .min(); usamos refine para >= 0
  monto_oportunidad: zNumCoerce.refine((n) => n >= 0, {
    message: "monto_oportunidad debe ser >= 0",
  }),

  numero_oportunidad: z.string().nullable().optional(),
  client_name: z.string().nullable().optional(),
  pm: z.string().nullable().optional(),

  planned_hours: zNumCoerce.nullable().optional(),
  executed_hours: zNumCoerce.nullable().optional(),
  hourly_rate: zNumCoerce.nullable().optional(),

  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Formato de fecha YYYY-MM-DD" })
    .nullable()
    .optional(),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Formato de fecha YYYY-MM-DD" })
    .nullable()
    .optional(),
});

const ProjectUpdate = z.object({
  nombre: z.string().optional(),
  pais: z.string().optional(),
  consultor: z.string().optional(),
  monto_oportunidad: zNumCoerce.optional(),
  numero_oportunidad: z.string().nullable().optional(),
  client_name: z.string().nullable().optional(),
  pm: z.string().nullable().optional(),
  planned_hours: zNumCoerce.nullable().optional(),
  executed_hours: zNumCoerce.nullable().optional(),
  hourly_rate: zNumCoerce.nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  terminado: z.boolean().optional(),
});

const VisitCreate = z.object({
  producto: z.string().nullable().optional(),
  client_name: z.string().nullable().optional(),
  numero_oportunidad: z.string().nullable().optional(),
  pais: z.string().nullable().optional(),
  consultor: z.string().nullable().optional(),
  hora: z.string().nullable().optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  monto_oportunidad: zNumCoerce.nullable().optional(),
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

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

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
      return res
        .status(400)
        .json({ ok: false, error: "Datos inválidos", details: e.issues });
    }
    console.error("POST /api/projects error:", e);
    res.status(500).json({ ok: false, error: "Error creando proyecto" });
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

// Catch-all para SPA (evita error path-to-regexp con /(.*))
app.get("*", (_req, res) => {
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
