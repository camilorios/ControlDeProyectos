// src/components/ProjectEditDialog.tsx
import React, { useEffect, useState } from "react";
import { projectsApi, Project, ProjectPayload } from "@/lib/azureDb";

type Props = {
  project: Project | null;         // el proyecto a editar (o null para cerrar)
  open: boolean;
  onClose: () => void;
  onSaved: () => void;             // callback para refrescar la lista después de guardar
};

function strOrNull(v: any) {
  if (v === undefined || v === null) return null;
  const s = String(v);
  return s.trim() === "" ? null : s;
}
function numOrNull(v: any) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const { data: project } = useQuery(['project', projectId], () =>
  projectsApi.getProject(projectId)
);

export default function ProjectEditDialog({ project, open, onClose, onSaved }: Props) {
  const [form, setForm] = useState<Partial<ProjectPayload & { id?: string }>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!project) return;
    setForm({
      nombre: project.nombre ?? "",
      pais: project.pais ?? "",
      consultor: project.consultor ?? "",
      numero_oportunidad: project.numero_oportunidad ?? "",
      client_name: project.client_name ?? "",
      pm: project.pm ?? "",
      monto_oportunidad: project.monto_oportunidad ?? "",
      planned_hours: project.planned_hours ?? "",
      executed_hours: project.executed_hours ?? "",
      hourly_rate: project.hourly_rate ?? "",
      start_date: project.start_date ?? "",
      end_date: project.end_date ?? "",
      finalizado: project.finalizado ?? false,
    });
  }, [project]);

  if (!open || !project) return null;

  const onChange = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      const payload: Partial<ProjectPayload> = {
        nombre: strOrNull(form.nombre) ?? "",
        pais: strOrNull(form.pais) ?? "",
        consultor: strOrNull(form.consultor) ?? "",
        numero_oportunidad: strOrNull(form.numero_oportunidad),

        client_name: strOrNull(form.client_name),
        pm: strOrNull(form.pm),

        monto_oportunidad: numOrNull(form.monto_oportunidad),
        planned_hours: numOrNull(form.planned_hours),
        executed_hours: numOrNull(form.executed_hours),
        hourly_rate: numOrNull(form.hourly_rate),

        start_date: strOrNull(form.start_date),
        end_date: strOrNull(form.end_date),

        // checkbox; el servidor también hace coerción, pero lo pasamos limpio
        finalizado: Boolean(form.finalizado),
      };

      const res = await projectsApi.update(project.id, payload);
      // Si usas toast: toast.success("Proyecto actualizado");
      onSaved();
      onClose();
    } catch (err: any) {
      console.error(err);
      // toast.error(err?.error || "No se pudo actualizar");
      alert(err?.error || "No se pudo actualizar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="w-full max-w-2xl bg-white rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Editar proyecto</h2>
          <button onClick={onClose} className="text-sm underline">Cerrar</button>
        </div>

        <form className="grid grid-cols-2 gap-3" onSubmit={onSubmit}>
          <label className="col-span-2">
            <span className="block text-xs text-gray-600">Nombre</span>
            <input
              value={form.nombre ?? ""}
              onChange={(e) => onChange("nombre", e.target.value)}
              className="w-full border rounded px-2 py-1"
              required
            />
          </label>

          <label>
            <span className="block text-xs text-gray-600">País</span>
            <input
              value={form.pais ?? ""}
              onChange={(e) => onChange("pais", e.target.value)}
              className="w-full border rounded px-2 py-1"
              required
            />
          </label>

          <label>
            <span className="block text-xs text-gray-600">Consultor</span>
            <input
              value={form.consultor ?? ""}
              onChange={(e) => onChange("consultor", e.target.value)}
              className="w-full border rounded px-2 py-1"
              required
            />
          </label>

          <label>
            <span className="block text-xs text-gray-600">N° Oportunidad</span>
            <input
              value={form.numero_oportunidad ?? ""}
              onChange={(e) => onChange("numero_oportunidad", e.target.value)}
              className="w-full border rounded px-2 py-1"
            />
          </label>

          <label>
            <span className="block text-xs text-gray-600">Cliente</span>
            <input
              value={form.client_name ?? ""}
              onChange={(e) => onChange("client_name", e.target.value)}
              className="w-full border rounded px-2 py-1"
            />
          </label>

          <label>
            <span className="block text-xs text-gray-600">PM</span>
            <input
              value={form.pm ?? ""}
              onChange={(e) => onChange("pm", e.target.value)}
              className="w-full border rounded px-2 py-1"
            />
          </label>

          <label>
            <span className="block text-xs text-gray-600">Monto oportunidad ($)</span>
            <input
              value={form.monto_oportunidad ?? ""}
              onChange={(e) => onChange("monto_oportunidad", e.target.value)}
              className="w-full border rounded px-2 py-1"
              inputMode="decimal"
            />
          </label>

          <label>
            <span className="block text-xs text-gray-600">Horas planificadas</span>
            <input
              value={form.planned_hours ?? ""}
              onChange={(e) => onChange("planned_hours", e.target.value)}
              className="w-full border rounded px-2 py-1"
              inputMode="numeric"
            />
          </label>

          <label>
            <span className="block text-xs text-gray-600">Horas ejecutadas</span>
            <input
              value={form.executed_hours ?? ""}
              onChange={(e) => onChange("executed_hours", e.target.value)}
              className="w-full border rounded px-2 py-1"
              inputMode="numeric"
            />
          </label>

          <label>
            <span className="block text-xs text-gray-600">Tarifa ($/h)</span>
            <input
              value={form.hourly_rate ?? ""}
              onChange={(e) => onChange("hourly_rate", e.target.value)}
              className="w-full border rounded px-2 py-1"
              inputMode="decimal"
            />
          </label>

          <label>
            <span className="block text-xs text-gray-600">Fecha inicio</span>
            <input
              type="date"
              value={form.start_date ?? ""}
              onChange={(e) => onChange("start_date", e.target.value)}
              className="w-full border rounded px-2 py-1"
            />
          </label>

          <label>
            <span className="block text-xs text-gray-600">Fecha fin</span>
            <input
              type="date"
              value={form.end_date ?? ""}
              onChange={(e) => onChange("end_date", e.target.value)}
              className="w-full border rounded px-2 py-1"
            />
          </label>

          <label className="col-span-2 inline-flex items-center gap-2 mt-2">
            <input
              type="checkbox"
              checked={!!form.finalizado}
              onChange={(e) => onChange("finalizado", e.target.checked)}
            />
            <span>Finalizado</span>
          </label>

          <div className="col-span-2 flex justify-end gap-2 mt-3">
            <button type="button" onClick={onClose} className="border px-3 py-1 rounded">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-60"
            >
              {loading ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
