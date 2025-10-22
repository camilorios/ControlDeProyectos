// src/lib/azureDb.ts
import { api } from "./http";

/**
 * Tipos base
 * Ajusta si tus componentes usan otros nombres.
 */

// Proyecto que devuelve el backend
export type Project = {
  id: string;
  nombre: string;
  numero_oportunidad: string | null;
  pais: string;
  consultor: string;
  monto_oportunidad: number | null;
  client_name: string | null;
  pm: string | null;
  planned_hours: number | null;
  executed_hours: number | null;
  hourly_rate: number | null;
  start_date: string | null;  // 'YYYY-MM-DD'
  end_date: string | null;    // 'YYYY-MM-DD'
  finalizado: boolean;        // <-- nuevo nombre consistente con el server
  activo: boolean;            // soft-delete
  fecha_creacion: string;     // ISO
  updated_at: string | null;  // ISO
};

// Payload para crear/editar.
// Permitimos string en números porque vienen de <input /> y el server los convierte.
export type ProjectPayload = {
  nombre: string;
  pais: string;
  consultor: string;

  numero_oportunidad?: string | null;

  monto_oportunidad?: number | string | null;
  planned_hours?: number | string | null;
  executed_hours?: number | string | null;
  hourly_rate?: number | string | null;

  start_date?: string | null;   // 'YYYY-MM-DD'
  end_date?: string | null;     // 'YYYY-MM-DD'

  client_name?: string | null;
  pm?: string | null;

  finalizado?: boolean | string | number | null; // checkbox / select
};

// ---------- Projects API ----------

/**
 * Lista proyectos.
 * @param status 'active' (por defecto) o 'archived'
 * - El server acepta /api/projects?status=active|archived
 * - Esta función devuelve siempre un array de Project.
 */
export async function getAllProjects(status: "active" | "archived" = "active"): Promise<Project[]> {
  // Intentamos compatibilidad con dos formatos de respuesta:
  //  - [ ... ]           (array directo)
  //  - { ok, data: [ ] } (envoltorio)
  const res = await api.get<any>(`/api/projects?status=${status}`);
  return Array.isArray(res) ? (res as Project[]) : (res?.data as Project[] ?? []);
}

export async function createProject(payload: ProjectPayload): Promise<Project> {
  return api.post<Project>("/api/projects", payload);
}

export async function getProjectById(id: string): Promise<Project> {
  return api.get<Project>(`/api/projects/${id}`);
}

export async function updateProject(
  id: string,
  payload: Partial<ProjectPayload>
): Promise<Project> {
  // El server admite actualización parcial (PUT).
  return api.put<Project>(`/api/projects/${id}`, payload);
}

/**
 * Archiva (soft-delete) un proyecto.
 * - Requiere que el proyecto esté `finalizado=true` (el server valida).
 * - Se mantiene en BD con activo=false para reportes.
 */
export async function archiveProject(id: string): Promise<{ ok: boolean; error?: string }> {
  return api.delete<{ ok: boolean; error?: string }>(`/api/projects/${id}`);
}

// Alias por compatibilidad con código existente que quizás usa "deleteProject".
export const deleteProject = archiveProject;

// Conveniente agrupación para importar como objeto
export const projectsApi = {
  getAll: getAllProjects,
  list: getAllProjects,     // alias
  create: createProject,
  getById: getProjectById,
  update: updateProject,
  archive: archiveProject,
  delete: deleteProject,    // alias
  remove: deleteProject,    // alias
};

// ---------- Visits API (si tu app las usa) ----------

export type Visit = {
  id: string;
  producto: string | null;
  client_name: string | null;
  numero_oportunidad: string | null;
  pais: string | null;
  consultor: string | null;
  hora: string | null;
  fecha: string | null;            // 'YYYY-MM-DD'
  monto_oportunidad: number | null;
  activo: boolean;
  fecha_creacion: string;          // ISO
};

export type VisitPayload = {
  producto?: string | null;
  client_name?: string | null;
  numero_oportunidad?: string | null;
  pais?: string | null;
  consultor?: string | null;
  hora?: string | null;
  fecha?: string | null;                 // 'YYYY-MM-DD'
  monto_oportunidad?: number | string | null;
};

export async function getAllVisits(status: "active" | "archived" = "active"): Promise<Visit[]> {
  const res = await api.get<any>(`/api/visits?status=${status}`);
  return Array.isArray(res) ? (res as Visit[]) : (res?.data as Visit[] ?? []);
}

export async function createVisit(payload: VisitPayload): Promise<Visit> {
  return api.post<Visit>("/api/visits", payload);
}

export async function deleteVisit(id: string): Promise<{ ok: boolean; error?: string }> {
  // Misma semántica de soft-delete (activo=false)
  return api.delete<{ ok: boolean; error?: string }>(`/api/visits/${id}`);
}

export const visitsApi = {
  getAll: getAllVisits,
  list: getAllVisits,  // alias
  create: createVisit,
  delete: deleteVisit,
  remove: deleteVisit, // alias
};
