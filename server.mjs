// server.mjs — API + Static + Azure PostgreSQL (Express 5 + ESM)
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { v4 as uuidv4 } from "uuid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// ---------------- Connection String de Azure ----------------
function getAzurePgConnString() {
  const pgTypeVar = Object.keys(process.env).find(k => k.startsWith("POSTGRESQLCONNSTR_"));
  if (pgTypeVar) return process.env[pgTypeVar];
  const customVar = Object.keys(process.env).find(k => k.startsWith("CUSTOMCONNSTR_"));
  if (customVar) return process.env[customVar];
  return process.env.DATABASE_URL || null;
}

function parseAzureConnStrKeyValue(connStr) {
  const pairs = connStr.split(";").map(s => s.trim()).filter(Boolean);
  const map = {};
  for (const p of pairs) {
    const i = p.indexOf("=");
    if (i > 0) map[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  let host = map["Server"] || map["Host"] || "";
  let port = Number(map["Port"] || 5432);
  if (host.includes(":")) { const [h, p] = host.split(":"); host = h; if (p) port = Number(p); }
  const user = map["User Id"] || map["UserID"] || map["User"];
  const sslRequired = String(map["Ssl Mode"] || map["SSL Mode"] || map["SSL"] || "")
    .toLowerCase().includes("require");
  return {
    host, port,
    database: map["Database"] || map["DB"] || map["Initial Catalog"],
    user, password: map["Password"],
    ssl: sslRequired ? { rejectUnauthorized: false } : false,
  };
}

const explicitEnv = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : undefined,
};

let poolConfig;
if (explicitEnv.host && explicitEnv.database && explicitEnv.user) {
  poolConfig = {
    host: explicitEnv.host,
    port: explicitEnv.port || 5432,
    database: explicitEnv.database,
    user: explicitEnv.user,
    password: explicitEnv.password,
    ssl: explicitEnv.ssl ?? { rejectUnauthorized: false },
  };
} else {
  const cs = getAzurePgConnString();
  if (!cs) { console.error("No DB env vars and no App Service Connection String found"); process.exit(1); }
  poolConfig = parseAzureConnStrKeyValue(cs);
}
// Forzar SSL si es Azure PG aunque la cadena no lo traiga
if (!poolConfig.ssl && /postgres\.database\.azure\.com$/i.test(poolConfig.host || "")) {
  poolConfig.ssl = { rejectUnauthorized: false };
}
console.log("PG config →", { host: poolConfig.host, port: poolConfig.port, database: poolConfig.database, ssl: !!poolConfig.ssl });
const pool = new Pool(poolConfig);

// ---------------- Esquema mínimo ----------------
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      numero_oportunidad TEXT,
      pais TEXT NOT NULL,
      consultor TEXT NOT NULL,
      monto_oportunidad NUMERIC NOT NULL,
      terminado BOOLEAN DEFAULT FALSE,
      client_name TEXT,
      pm TEXT,
      planned_hours NUMERIC,
      executed_hours NUMERIC,
      hourly_rate NUMERIC,
      start_date DATE,
      end_date DATE,
      fecha_creacion TIMESTAMP DEFAULT NOW()
    );`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_observations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      texto TEXT,
      fecha TIMESTAMP DEFAULT NOW()
    );`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY,
      producto TEXT,
      client_name TEXT,
      numero_oportunidad TEXT,
      pais TEXT,
      consultor TEXT,
      hora TEXT,
      fecha DATE,
      monto_oportunidad NUMERIC,
      activo BOOLEAN DEFAULT TRUE,
      fecha_creacion TIMESTAMP DEFAULT NOW()
    );`);
}
await ensureTables();

// ---------------- API ----------------
app.get("/api/health/db", async (_req, res) => {
  try { const r = await pool.query("SELECT NOW() as now"); res.json({ ok: true, now: r.rows[0].now }); }
  catch (e) { console.error("DB health error:", e); res.status(500).json({ ok: false, error: String(e?.message || e) }); }
});

// Projects
app.get("/api/projects", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*,
      COALESCE((
        SELECT json_agg(json_build_object('id', o.id, 'texto', o.texto, 'fecha', o.fecha) ORDER BY o.fecha DESC)
        FROM project_observations o WHERE o.project_id = p.id
      ), '[]') AS observaciones
      FROM projects p
      ORDER BY p.fecha_creacion DESC;`);
    res.json({ data: rows });
  } catch (e) { console.error(e); res.status(500).json({ error: "Error getting projects" }); }
});

app.post("/api/projects", async (req, res) => {
  try {
    const id = uuidv4();
    const { nombre, numero_oportunidad, pais, consultor, monto_oportunidad,
            client_name, pm, planned_hours, executed_hours, hourly_rate, start_date, end_date } = req.body;
    await pool.query(`
      INSERT INTO projects (
        id, nombre, numero_oportunidad, pais, consultor, monto_oportunidad,
        client_name, pm, planned_hours, executed_hours, hourly_rate, start_date, end_date
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13);`,
      [id, nombre, numero_oportunidad, pais, consultor, monto_oportunidad,
       client_name, pm, planned_hours, executed_hours, hourly_rate, start_date, end_date]);
    res.json({ id });
  } catch (e) { console.error(e); res.status(500).json({ error: "Error creating project" }); }
});

app.put("/api/projects/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const fields = ["nombre","numero_oportunidad","pais","consultor","monto_oportunidad","terminado",
                    "client_name","pm","planned_hours","executed_hours","hourly_rate","start_date","end_date"];
    const updates = []; const values = [];
    for (const f of fields) if (Object.prototype.hasOwnProperty.call(req.body, f)) { values.push(req.body[f]); updates.push(`${f} = $${values.length}`); }
    if (updates.length === 0) return res.json({ ok: true });
    values.push(id);
    await pool.query(`UPDATE projects SET ${updates.join(", ")} WHERE id = $${values.length};`, values);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "Error updating project" }); }
});

app.delete("/api/projects/:id", async (req, res) => {
  try { await pool.query(`DELETE FROM projects WHERE id = $1;`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).json({ error: "Error deleting project" }); }
});

app.post("/api/projects/:id/observations", async (req, res) => {
  try {
    const obsId = uuidv4();
    await pool.query(`INSERT INTO project_observations (id, project_id, texto) VALUES ($1,$2,$3);`,
      [obsId, req.params.id, req.body.texto ?? ""]);
    res.json({ id: obsId });
  } catch (e) { console.error(e); res.status(500).json({ error: "Error adding observation" }); }
});

app.delete("/api/projects/:id/observations/:obsId", async (req, res) => {
  try {
    await pool.query(`DELETE FROM project_observations WHERE id = $1 AND project_id = $2;`,
      [req.params.obsId, req.params.id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "Error deleting observation" }); }
});

// Visits
app.get("/api/visits", async (_req, res) => {
  try { const { rows } = await pool.query(`SELECT * FROM visits WHERE activo = TRUE ORDER BY fecha_creacion DESC;`); res.json({ data: rows }); }
  catch (e) { console.error(e); res.status(500).json({ error: "Error getting visits" }); }
});

app.post("/api/visits", async (req, res) => {
  try {
    const id = uuidv4();
    const { producto, client_name, numero_oportunidad, pais, consultor, hora, fecha, monto_oportunidad } = req.body;
    await pool.query(`
      INSERT INTO visits (id, producto, client_name, numero_oportunidad, pais, consultor, hora, fecha, monto_oportunidad)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9);`,
      [id, producto, client_name, numero_oportunidad, pais, consultor, hora, fecha, monto_oportunidad]);
    res.json({ id });
  } catch (e) { console.error(e); res.status(500).json({ error: "Error creating visit" }); }
});

app.put("/api/visits/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const fields = ["producto","client_name","numero_oportunidad","pais","consultor","hora","fecha","monto_oportunidad","activo"];
    const updates = []; const values = [];
    for (const f of fields) if (Object.prototype.hasOwnProperty.call(req.body, f)) { values.push(req.body[f]); updates.push(`${f} = $${values.length}`); }
    if (updates.length === 0) return res.json({ ok: true });
    values.push(id);
    await pool.query(`UPDATE visits SET ${updates.join(", ")} WHERE id = $${values.length};`, values);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "Error updating visit" }); }
});

app.delete("/api/visits/:id", async (req, res) => {
  try { await pool.query(`UPDATE visits SET activo = FALSE WHERE id = $1;`, [req.params.id]); res.json({ ok: true }); }
  catch (e) { console.error(e); res.status(500).json({ error: "Error deleting visit" }); }
});

// ---------------- Static (SPA) ----------------
app.use(express.static(path.join(__dirname, "dist")));
// Express 5: catch-all compatible
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// ---------------- Arranque ----------------
const port = process.env.PORT || 8080;
app.listen(port, "0.0.0.0", () => {
  console.log(`App running on http://localhost:${port}`);
});
