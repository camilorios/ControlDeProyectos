// server.mjs
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import compression from "compression";
import morgan from "morgan";
import { Pool } from "pg";

/* ------------------------ Config básica ------------------------ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.resolve(path.dirname(__filename));

const PORT = process.env.PORT || 8080;

// Permite JSON grande (formularios con texto largo)
const app = express();
app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());
app.use(morgan("tiny"));

/* ------------------------ PostgreSQL Pool ------------------------ */
// 1) Conexión por cadena (DATABASE_URL) o por variables separadas
const hasDatabaseUrl = !!process.env.DATABASE_URL;
const pgConfig = hasDatabaseUrl
  ? {
      connectionString: process.env.DATABASE_URL,
      max: 10,
      ssl: { rejectUnauthorized: false },
    }
  : {
      host: process.env.PGHOST || process.env.PGHOSTNAME || "projectmn.postgres.database.azure.com",
      user: process.env.PGUSER || process.env.PGUSERNAME || "projectadmin",
      password: process.env.PGPASSWORD || "CHANGEME", // <-- ajusta si vas a correr local
      database: process.env.PGDATABASE || "controlproyectos",
      port: Number(process.env.PGPORT || 5432),
      max: 10,
      ssl: { rejectUnauthorized: false },
    };

const pool = new Pool(pgConfig);

// 2) Asegurar search_path y conectividad
pool.on("connect", async (client) => {
  try {
    await client.query(`SET search_path TO public;`);
  } catch (e) {
    console.error("Error setting search_path:", e.message);
  }
});

/* ------------------------ Utilidades SQL ------------------------ */
// Normaliza valor numérico (acepta string vacío o null)
const toNumber = (v, def = 0) =>
  v === undefined || v === null || v === "" || Number.isNaN(Number(v))
    ? def
    : Number(v);

// Normaliza fecha (string 'YYYY-MM-DD' o null)
const toDateOrNull = (s) => (s ? s : null);

// Asegura JSONB no nulo
const toJsonb = (v, def = []) => {
  if (v === undefined || v === null || v === "") return def;
  try {
    if (typeof v === "string") return JSON.parse(v);
    return v;
  } catch {
    return def;
  }
};

/* ------------------------ Endpoints Health / Debug ------------------------ */
app.get("/api/health/db", async (_req, res) => {
  try {
    const ping = await pool.query("SELECT 1 AS column");
    res.json({
      ok: true,
      ping: ping.rows[0],
      db: pgConfig.database,
      host: pgConfig.host || "via-connectionString",
    });
  } catch (err) {
    console.error("health/db error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Debug: conteo y listado crudo de projects (para validar persistencia)
app.get("/api/debug/projects/count", async (_req, res) => {
  try {
    const r = await pool.query(`SELECT COUNT(*)::int AS count FROM public.projects;`);
    res.json({ count: r.rows[0].count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/debug/projects", async (_req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM public.projects ORDER BY created_at DESC;`);
    res.json(r.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------ Handler reutilizable: listar projects ------------------------ */
async function listProjectsHandler(req, res) {
  try {
    const { status } = req.query;

    const baseSelect = `
      SELECT
        id,
        nombre,
        numero_oportunidad,
        COALESCE(pais, '')                 AS pais,
        COALESCE(consultor, '')            AS consultor,
        COALESCE(pm, '')                   AS pm,
        COALESCE(client_name, '')          AS client_name,
        COALESCE(monto_oportunidad, 0)::numeric AS monto_oportunidad,
        COALESCE(planned_hours, 0)::numeric     AS planned_hours,
        COALESCE(executed_hours, 0)::numeric    AS executed_hours,
        COALESCE(hourly_rate, 0)::numeric       AS hourly_rate,
        COALESCE(terminado, false)         AS terminado,
        COALESCE(activo, true)             AS activo,
        start_date,
        end_date,
        created_at,
        updated_at
      FROM public.projects
    `;

    let rows;
    if (status === "active") {
      const sql = `
        ${baseSelect}
        WHERE COALESCE(activo, true) = true
          AND COALESCE(terminado, false) = false
        ORDER BY created_at DESC
      `;
      rows = (await pool.query(sql)).rows;
    } else {
      const sql = `${baseSelect} ORDER BY created_at DESC`;
      rows = (await pool.query(sql)).rows;
    }

    res.json(rows);
  } catch (err) {
    console.error("GET /api/projects error:", err);
    res.status(500).json({ error: "Error listando proyectos" });
  }
}

/* ------------------------ API Projects ------------------------ */
// GET: lista (todos o ?status=active)
app.get("/api/projects", listProjectsHandler);

// Alias legacy: /api/projects/status=active  → redirige internamente al mismo handler
app.get("/api/projects/status=:status", (req, res) => {
  req.query.status = req.params.status;
  return listProjectsHandler(req, res);
});

// POST: crear proyecto
app.post("/api/projects", async (req, res) => {
  try {
    const {
      nombre,
      numeroOportunidad,
      numero_oportunidad,
      pais,
      consultor,
      pm,
      client_name,
      cliente, // por si el front lo envía como 'cliente'
      planned_hours,
      executed_hours,
      hourly_rate,
      start_date,
      end_date,
      montoOportunidad,
      monto_oportunidad,
      observaciones,
      descripcion, // no rompe si no existe
    } = req.body;

    const insertSql = `
      INSERT INTO public.projects
        (id, nombre, numero_oportunidad, pais, consultor, pm, client_name,
         monto_oportunidad, planned_hours, executed_hours, hourly_rate,
         start_date, end_date, terminado, activo, observaciones, created_at, updated_at)
      VALUES
        (gen_random_uuid()::text,
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10,
         $11, $12,
         false, true, $13, NOW(), NOW())
      RETURNING *;
    `;

    const params = [
      (nombre || "").trim(),
      (numeroOportunidad ?? numero_oportunidad ?? "").toString().trim(),
      (pais || "").trim(),
      (consultor || "").trim(),
      (pm || "").trim(),
      (client_name ?? cliente ?? "").toString().trim(),
      toNumber(montoOportunidad ?? monto_oportunidad, 0),
      toNumber(planned_hours, 0),
      toNumber(executed_hours, 0),
      toNumber(hourly_rate, 0),
      toDateOrNull(start_date),
      toDateOrNull(end_date),
      toJsonb(observaciones, []), // evita NOT NULL en JSONB
    ];

    const r = await pool.query(insertSql, params);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("POST /api/projects error:", err);
    res.status(500).json({ error: "Error creando proyecto", detail: err.message });
  }
});

// PUT: actualizar proyecto
app.put("/api/projects/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre,
      numeroOportunidad,
      numero_oportunidad,
      pais,
      consultor,
      pm,
      client_name,
      cliente,
      planned_hours,
      executed_hours,
      hourly_rate,
      start_date,
      end_date,
      montoOportunidad,
      monto_oportunidad,
      terminado,
      activo,
      observaciones,
    } = req.body;

    const updateSql = `
      UPDATE public.projects
      SET
        nombre             = COALESCE($2, nombre),
        numero_oportunidad = COALESCE($3, numero_oportunidad),
        pais               = COALESCE($4, pais),
        consultor          = COALESCE($5, consultor),
        pm                 = COALESCE($6, pm),
        client_name        = COALESCE($7, client_name),
        monto_oportunidad  = COALESCE($8, monto_oportunidad),
        planned_hours      = COALESCE($9, planned_hours),
        executed_hours     = COALESCE($10, executed_hours),
        hourly_rate        = COALESCE($11, hourly_rate),
        start_date         = COALESCE($12, start_date),
        end_date           = COALESCE($13, end_date),
        terminado          = COALESCE($14, terminado),
        activo             = COALESCE($15, activo),
        observaciones      = COALESCE($16, observaciones),
        updated_at         = NOW()
      WHERE id = $1
      RETURNING *;
    `;

    const params = [
      id,
      nombre?.trim(),
      (numeroOportunidad ?? numero_oportunidad)?.toString().trim(),
      pais?.trim(),
      consultor?.trim(),
      pm?.trim(),
      (client_name ?? cliente)?.toString().trim(),
      toNumber(montoOportunidad ?? monto_oportunidad, null),
      toNumber(planned_hours, null),
      toNumber(executed_hours, null),
      toNumber(hourly_rate, null),
      toDateOrNull(start_date),
      toDateOrNull(end_date),
      typeof terminado === "boolean" ? terminado : null,
      typeof activo === "boolean" ? activo : null,
      observaciones !== undefined ? toJsonb(observaciones, []) : null,
    ];

    const r = await pool.query(updateSql, params);
    if (r.rowCount === 0) return res.status(404).json({ error: "Proyecto no encontrado" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error("PUT /api/projects/:id error:", err);
    res.status(500).json({ error: "Error actualizando proyecto", detail: err.message });
  }
});

// DELETE: eliminar proyecto
app.delete("/api/projects/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const r = await pool.query(`DELETE FROM public.projects WHERE id = $1;`, [id]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Proyecto no encontrado" });
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/projects/:id error:", err);
    res.status(500).json({ error: "Error eliminando proyecto", detail: err.message });
  }
});

/* ------------------------ Static (SPA) y catch-all ------------------------ */
// Sirve el front desde /public
app.use(express.static(path.join(__dirname, "public")));

// Catch-all compatible con Express 5 (evita path-to-regexp con '*')
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* ------------------------ Arranque ------------------------ */
app.listen(PORT, () => {
  console.log(`API listening on http://0.0.0.0:${PORT}`);
  console.log(`search_path fijado a 'public'`);
});
