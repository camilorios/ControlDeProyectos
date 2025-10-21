// src/lib/azureDb.ts
import { api } from "./http";

// ---------- Tipos (ajústalos si ya tienes tus propios tipos) ----------
export type Project = {
  id: string;
  nombre: string;
  numero_oportunidad: string | null;
  pais: string;
  consultor: string;
  monto_oportunidad: number;
  terminado: boolean;
  client_name: string | null;
  pm: string | null;
  planned_hours: number | null;
  executed_hours: number | null;
  hourly_rate: number | null;
  start_date: string | null;
  end_date: string | null;
  fecha_creacion: string;
};

export type NewProject = {
  nombre: string;
  numero_oportunidad?: string | null;
  pais: string;
  consultor: string;
  monto_oportunidad: number;
  client_name?: string | null;
  pm?: string | null;
  planned_hours?: number | null;
  executed_hours?: number | null;
  hourly_rate?: number | null;
  start_date?: string | null; // "YYYY-MM-DD"
  end_date?: string | null;
};

export type Visit = {
  id: string;
  producto: string | null;
  client_name: string | null;
  numero_oportunidad: string | null;
  pais: string | null;
  consultor: string | null;
  hora: string | null;
  fecha: string | null;
  monto_oportunidad: number | null;
  activo: boolean;
  fecha_creacion: string;
};

export type NewVisit = Omit<Visit, "id" | "fecha_creacion" | "activo"> & {
  activo?: boolean;
};

// ---------- Funciones REST contra /api ----------
// PROJECTS
export async function getAllProjects(): Promise<Project[]> {
  return api.get<Project[]>("/api/projects");
}
export async function createProject(body: NewProject): Promise<Project> {
  return api.post<Project>("/api/projects", body);
}
export async function getProjectById(id: string): Promise<Project> {
  return api.get<Project>(`/api/projects/${id}`);
}
export async function updateProject(
  id: string,
  body: Partial<NewProject> & { terminado?: boolean }
): Promise<Project> {
  return api.put<Project>(`/api/projects/${id}`, body);
}
export async function deleteProject(id: string): Promise<{ ok: true }> {
  return api.del<{ ok: true }>(`/api/projects/${id}`);
}

// VISITS
export async function getAllVisits(): Promise<Visit[]> {
  return api.get<Visit[]>("/api/visits");
}
export async function createVisit(body: NewVisit): Promise<Visit> {
  return api.post<Visit>("/api/visits", body);
}
export async function deleteVisit(id: string): Promise<{ ok: true }> {
  return api.del<{ ok: true }>(`/api/visits/${id}`);
}

// ---------- OBJETOS de compatibilidad (lo que piden los componentes) ----------
// Muchos componentes importaban { projectsApi } desde '@/lib/azureDb'.
// Exportamos un objeto con los nombres "típicos" para no romper nada.
export const projectsApi = {
  // listas
  getAll: getAllProjects,
  list: getAllProjects,      // alias
  // lectura
  getOne: getProjectById,
  getById: getProjectById,   // alias
  // escritura
  create: createProject,
  update: updateProject,
  delete: deleteProject,
  remove: deleteProject      // alias
};

// Y lo mismo para visitas si hay componentes que lo usen así:
export const visitsApi = {
  getAll: getAllVisits,
  list: getAllVisits,        // alias
  create: createVisit,
  delete: deleteVisit,
  remove: deleteVisit        // alias
};
