import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------- CONFIGURACIÓN PG ----------------
function parseAzureConnString(cs) {
  const parts = Object.fromEntries(
    cs.split(";").map((p) => {
      const [k, v] = p.split("=");
      return [k?.trim().toLowerCase(), v?.trim()];
    })
  );
  return {
    host: parts.server?.replace(/^tcp:/, ""),
    database: parts.database || "controlproyectos",
    user: parts["user id"],
    password: parts.password,
    port: Number(parts.port || 5432),
    ssl: { rejectUnauthorized: false },
  };
}

function buildPgConfig() {
  if (process.env.POSTGRESQLCONNSTR_AZURE) {
    return parseAzureConnString(process.env.POSTGRESQLCONNSTR_AZURE);
  }
  return {
    host: "projectmn.postgres.database.azure.com",
    database: "controlproyectos",
    user: "projectadmin",
    password: "Spymac1977*",
    port: 5432,
    ssl: { rejectUnauthorized: false },
  };
}

const pgConfig = buildPgConfig();
const pool = new Pool(pgConfig);

// Fija el search_path a public para toda la sesión
await (async () => {
  try {
    const client = await pool.connect();
    try {
      await client.query(`SET search_path TO public`);
      console.log("search_path fijado a 'public'");
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("No se pudo fijar search_path:", e.message);
  }
})();

// ---------------- NORMALIZADOR DE PAYLOAD ----------------
function normalizeProjectPayload(raw = {}) {
  const toNumOrNull = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const toIsoDateOrNull = (v) => {
    if (!v) return null;
    if (typeof v === "string" && v.includes("/")) {
      const [d, m, y] = v.split("/");
      return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    }
    return v;
  };
  return {
    // nombres
    nombre: raw.nombre ?? raw.project_name ?? null,

    // oportunidad (snake ES, camel ES, EN)
    numero_oportunidad:
      raw.numero_oportunidad ??
      raw.numeroOportunidad ??
      raw.opportunity_number ??
      null,

    // país / consultor (ES / EN)
    pais: raw.pais ?? raw.country ?? null,
    consultor: raw.consultor ?? raw.consultant ?? null,

    // cliente y PM (múltiples variantes)
    client_name:
      raw.client_name ??
      raw.cliente ??
      raw.nombre_cliente ??
      raw.nombreCliente ??
      null,
    pm: raw.pm ?? raw.pm_asignado ?? raw.pmAsignado ?? null,

    // métricas (snake ES, camel ES, EN)
    planned_hours:
      toNumOrNull(
        raw.planned_hours ?? raw.horas_planificadas ?? raw.horasPlanificadas
      ),
    executed_hours:
      toNumOrNull(
        raw.executed_hours ?? raw.horas_ejecutadas ?? raw.horasEjecutadas
      ),
    hourly_rate:
      toNumOrNull(raw.hourly_rate ?? raw.valor_hora ?? raw.valorHora),

    // monto oportunidad (snake ES, camel ES, genérico)
    monto_oportunidad:
      toNumOrNull(
        raw.monto_oportunidad ?? raw.montoOportunidad ?? raw.monto
      ),

    // fechas (snake ES, camel ES, EN ISO)
    start_date: toIsoDateOrNull(raw.start_date ?? raw.fecha_inicio ?? raw.fechaInicio),
    end_date:   toIsoDateOrNull(raw.end_date   ?? raw.fecha_fin    ?? raw.fechaFin),

    // flags y notas
    terminado: raw.terminado ?? raw.finalizado ?? false,

    // nunca null
    observaciones: raw.observaciones ?? "",
    // activo opcional por si el front lo envía
    activo: typeof raw.activo === "boolean" ? raw.activo : null,
  };
}

// ---------------- MIGRACIONES / CREACIÓN DE TABLAS ----------------
async function ensureTables() {
  // Crea si no existen (UUID id + columnas principales)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.projects (
      id UUID PRIMARY KEY,
      nombre TEXT NOT NULL,
      numero_oportunidad TEXT,
      pais TEXT NOT NULL,
      consultor TEXT NOT NULL,
      monto_oportunidad NUMERIC DEFAULT 0,
      client_name TEXT,
      pm TEXT,
      planned_hours NUMERIC DEFAULT 0,
      executed_hours NUMERIC DEFAULT 0,
      hourly_rate NUMERIC DEFAULT 0,
      start_date DATE,
      end_date DATE,
      terminado BOOLEAN DEFAULT false,
      observaciones TEXT DEFAULT '',
      activo BOOLEAN DEFAULT true,
      fecha_creacion TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Alinea columnas si la tabla existía de antes
  await pool.query(`
    ALTER TABLE public.projects
      ADD COLUMN IF NOT EXISTS client_name       TEXT,
      ADD COLUMN IF NOT EXISTS pm                TEXT,
      ADD COLUMN IF NOT EXISTS planned_hours     NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS executed_hours    NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS hourly_rate       NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS start_date        DATE,
      ADD COLUMN IF NOT EXISTS end_date          DATE,
      ADD COLUMN IF NOT EXISTS terminado         BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS observaciones     TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS activo            BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS fecha_creacion    TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT NOW();
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.visits (
      id UUID PRIMARY KEY,
      producto TEXT,
      client_name TEXT,
      numero_oportunidad TEXT,
      pais TEXT,
      consultor TEXT,
      hora TEXT,
      fecha DATE,
      monto_oportunidad NUMERIC,
      activo BOOLEAN DEFAULT true,
      fecha_creacion TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

// ---------------- APP EXPRESS ----------------
const app = express();
app.use(express.json());

// --- HEALTH ---
app.get("/api/health/db", async (_req, res) => {
  try {
    const r = await pool.query("SELECT 1");
    res.json({ ok: true, ping: r.rows[0], db: pgConfig.database, host: pgConfig.host });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// --- DEBUG ---
app.get("/api/debug/projects/count", async (_req, res) => {
  try {
    const r = await pool.query("SELECT COUNT(*)::int AS c FROM public.projects");
    res.json({ count: r.rows[0].c });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get("/api/debug/projects", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM public.projects ORDER BY fecha_creacion DESC LIMIT 10");
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// LISTAR PROYECTOS (con soporte para ?status=active)
app.get('/api/projects', async (req, res) => {
  try {
    const { status } = req.query;

    const baseSelect = `
      SELECT
        id,
        nombre,
        numero_oportunidad,
        COALESCE(pais, '')               AS pais,
        COALESCE(consultor, '')          AS consultor,
        COALESCE(pm, '')                 AS pm,
        COALESCE(client_name, '')        AS client_name,
        COALESCE(monto_oportunidad, 0)::numeric AS monto_oportunidad,
        COALESCE(planned_hours, 0)::numeric     AS planned_hours,
        COALESCE(executed_hours, 0)::numeric    AS executed_hours,
        COALESCE(hourly_rate, 0)::numeric       AS hourly_rate,
        COALESCE(terminado, false)       AS terminado,
        COALESCE(activo, true)           AS activo,
        start_date,
        end_date,
        created_at,
        updated_at
      FROM public.projects
    `;

    let rows;
    if (status === 'active') {
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
    console.error('GET /api/projects error', err);
    res.status(500).json({ error: 'Error listando proyectos' });
  }
});

// (Opcional) Alias por si el front alguna vez llama /api/projects/status=active
app.get('/api/projects/status=:status', (req, res, next) => {
  req.query.status = req.params.status;
  next();
}, app._router.stack.find(r => r.route && r.route.path === '/api/projects').route.stack[0].handle);


app.get("/api/projects/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM public.projects WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "No encontrado" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/projects", async (req, res) => {
  try {
    const p = normalizeProjectPayload(req.body);
    const id = uuidv4();
    const { rows } = await pool.query(
      `INSERT INTO public.projects 
       (id, nombre, numero_oportunidad, pais, consultor, monto_oportunidad, 
        client_name, pm, planned_hours, executed_hours, hourly_rate, 
        start_date, end_date, terminado, observaciones, activo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [
        id,
        p.nombre,
        p.numero_oportunidad,
        p.pais,
        p.consultor,
        p.monto_oportunidad ?? 0,
        p.client_name,
        p.pm,
        p.planned_hours ?? 0,
        p.executed_hours ?? 0,
        p.hourly_rate ?? 0,
        p.start_date,
        p.end_date,
        p.terminado,
        p.observaciones ?? "",
        p.activo ?? true,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error("POST /api/projects", e);
    res.status(500).json({ error: "Error creando proyecto", detail: e.message });
  }
});

app.put("/api/projects/:id", async (req, res) => {
  try {
    const p = normalizeProjectPayload(req.body);
    const result = await pool.query(
      `UPDATE public.projects SET
        nombre             = COALESCE($1, nombre),
        numero_oportunidad = COALESCE($2, numero_oportunidad),
        pais               = COALESCE($3, pais),
        consultor          = COALESCE($4, consultor),
        monto_oportunidad  = COALESCE($5, monto_oportunidad),
        client_name        = COALESCE($6, client_name),
        pm                 = COALESCE($7, pm),
        planned_hours      = COALESCE($8, planned_hours),
        executed_hours     = COALESCE($9, executed_hours),
        hourly_rate        = COALESCE($10, hourly_rate),
        start_date         = COALESCE($11, start_date),
        end_date           = COALESCE($12, end_date),
        terminado          = COALESCE($13, terminado),
        observaciones      = COALESCE($14, observaciones),
        activo             = COALESCE($15, activo),
        updated_at         = NOW()
      WHERE id = $16
      RETURNING *`,
      [
        p.nombre,
        p.numero_oportunidad,
        p.pais,
        p.consultor,
        p.monto_oportunidad,
        p.client_name,
        p.pm,
        p.planned_hours,
        p.executed_hours,
        p.hourly_rate,
        p.start_date,
        p.end_date,
        p.terminado,
        p.observaciones ?? "",
        typeof p.activo === "boolean" ? p.activo : null,
        req.params.id,
      ]
    );
    if (!result.rowCount) return res.status(404).json({ error: "No encontrado" });
    res.json(result.rows[0]);
  } catch (e) {
    console.error("PUT /api/projects", e);
    res.status(500).json({ error: e.message });
  }
});

// --- VISITS ---
app.get("/api/visits", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM public.visits WHERE activo = TRUE ORDER BY fecha_creacion DESC");
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/visits", async (req, res) => {
  try {
    const id = uuidv4();
    const v = req.body;
    const { rows } = await pool.query(
      `INSERT INTO public.visits (id, producto, client_name, numero_oportunidad, pais, consultor, hora, fecha, monto_oportunidad)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        id,
        v.producto,
        v.client_name,
        v.numero_oportunidad,
        v.pais,
        v.consultor,
        v.hora,
        v.fecha,
        v.monto_oportunidad,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------------- FRONTEND BUILD ----------------
const distPath = path.join(__dirname, "dist");
app.use(express.static(distPath));

// Compatible con Express 5 (SPA catch-all)
app.get(/^(?!\/api\/).*/, (req, res, next) => {
  if (req.method !== "GET") return next();
  res.sendFile(path.join(distPath, "index.html"));
});

// ---------------- INICIO ----------------
const port = process.env.PORT || 8080;
(async () => {
  await ensureTables();
  app.listen(port, () => console.log(`✅ Server escuchando en puerto ${port}`));
})();
