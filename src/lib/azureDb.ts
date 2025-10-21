// src/lib/azureDb.ts
import { api } from "./http";

// Tipos mínimos (ajusta con tus tipos reales si ya existen)
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

// ------------- PROJECTS -------------
// Lo que antes era: callEdgeFunction('azure-db-projects', { method: 'GET_ALL' })
export async function getAllProjects(): Promise<Project[]> {
  return api.get<Project[]>("/api/projects");
}

// Lo que antes era: ... { method: 'CREATE', body }
export async function createProject(body: NewProject): Promise<Project> {
  return api.post<Project>("/api/projects", body);
}

// Lo que antes era: ... { method: 'GET_ONE', id }
export async function getProjectById(id: string): Promise<Project> {
  return api.get<Project>(`/api/projects/${id}`);
}

// Lo que antes era: ... { method: 'UPDATE', id, body }
export async function updateProject(id: string, body: Partial<NewProject>): Promise<Project> {
  return api.put<Project>(`/api/projects/${id}`, body);
}

// Lo que antes era: ... { method: 'DELETE', id }
export async function deleteProject(id: string): Promise<{ ok: true }> {
  return api.del<{ ok: true }>(`/api/projects/${id}`);
}

// ------------- VISITS -------------
export async function getAllVisits(): Promise<Visit[]> {
  return api.get<Visit[]>("/api/visits");
}

export async function createVisit(body: NewVisit): Promise<Visit> {
  return api.post<Visit>("/api/visits", body);
}

export async function deleteVisit(id: string): Promise<{ ok: true }> {
  return api.del<{ ok: true }>(`/api/visits/${id}`);
}
