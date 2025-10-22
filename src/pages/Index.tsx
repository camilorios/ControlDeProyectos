import { useState, useEffect } from "react";
import { ProjectCard } from "@/components/ProjectCard";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { CreateVisitDialog } from "@/components/CreateVisitDialog";
import { VisitCard } from "@/components/VisitCard";
import { DashboardStats } from "@/components/DashboardStats";
import tigoLogo from "@/assets/tigo-business-logo.png";
import { projectsApi, visitsApi, AzureProject, AzureVisit } from "@/lib/azureDb";
import { useToast } from "@/hooks/use-toast";

interface Project {
  id: string;
  name: string;
  description: string;
  plannedHours: number;
  executedHours: number;
  hourlyRate: number;
  startDate: string;
  endDate: string;
  clientName: string;
  consultant: string;
  pm: string;
  country: string;
  numeroOportunidad: string;
  observaciones: Array<{ id: string; text: string; date: string }>;
  terminado: boolean;
}

interface Visit {
  id: string;
  producto: string;
  pais: string;
  consultor: string;
  tiempo: number;
  fecha: string;
  valorOportunidad: number;
  clientName: string;
  numeroOportunidad: string;
}

const Index = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Cargar datos desde Azure al iniciar
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [azureProjects, azureVisits] = await Promise.all([
          projectsApi.getAll(),
          visitsApi.getAll(),
        ]);

        // Convertir proyectos de Azure al formato local
        const mappedProjects: Project[] = azureProjects.map((p: AzureProject) => ({
          id: p.id,
          name: p.nombre,
          description: "",
          plannedHours: 0,
          executedHours: 0,
          hourlyRate: 0,
          startDate: new Date(p.fecha_creacion).toISOString().split("T")[0],
          endDate: "",
          clientName: "",
          consultant: p.consultor,
          pm: "",
          country: p.pais,
          numeroOportunidad: p.numero_oportunidad || "",
          observaciones: (p.observaciones || []).map((obs) => ({
            id: obs.id,
            text: obs.texto,
            date: obs.fecha,
          })),
          terminado: p.terminado,
        }));

        // Convertir visitas de Azure al formato local
        const mappedVisits: Visit[] = azureVisits.map((v: AzureVisit) => ({
          id: v.id,
          producto: v.producto,
          pais: v.pais,
          consultor: v.consultor,
          tiempo: Number(v.hora ?? 0),
          fecha: v.fecha,
          valorOportunidad: v.monto_oportunidad,
          clientName: v.client_name,
          numeroOportunidad: v.numero_oportunidad || "",
        }));

        setProjects(mappedProjects);
        setVisits(mappedVisits);
      } catch (error) {
        console.error("Error cargando datos:", error);
        toast({
          title: "Error de conexión",
          description:
            "No se puede conectar a la base de datos Azure. Verifica que el firewall de Azure permita conexiones desde las IPs de Supabase.",
          variant: "destructive",
        });
        // Permitir que la app cargue con datos vacíos
        setProjects([]);
        setVisits([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [toast]);

  const handleCreateProject = async (projectData: {
    name: string;
    description: string;
    plannedHours: number;
    startDate: string;
    endDate: string;
    clientName: string;
    consultant: string;
    pm: string;
    country: string;
    hourlyRate: number;
    numeroOportunidad: string;
  }) => {
    try {
      const newId = String(Date.now());
      await projectsApi.create({
        id: newId,
        nombre: projectData.name,
        numeroOportunidad: projectData.numeroOportunidad,
        pais: projectData.country,
        consultor: projectData.consultant,
        montoOportunidad: projectData.plannedHours * projectData.hourlyRate,
        fechaCreacion: new Date().toISOString(),
      });

      const newProject: Project = {
        id: newId,
        ...projectData,
        executedHours: 0,
        observaciones: [],
        terminado: false,
      };
      setProjects([...projects, newProject]);

      toast({
        title: "Proyecto creado",
        description: "El proyecto se ha guardado en la base de datos",
      });
    } catch (error) {
      console.error("Error creando proyecto:", error);
      toast({
        title: "Error",
        description: "No se pudo crear el proyecto",
        variant: "destructive",
      });
    }
  };

  const handleUpdateHours = (id: string, hoursToAdd: number) => {
    setProjects(
      projects.map((project) =>
        project.id === id
          ? { ...project, executedHours: project.executedHours + hoursToAdd }
          : project
      )
    );
  };

  const handleUpdateProject = async (id: string, updates: Partial<Project>) => {
    try {
      const project = projects.find((p) => p.id === id);
      if (!project) return;

      const updatedProject = { ...project, ...updates };

      await projectsApi.update(id, {
        nombre: updatedProject.name,
        numeroOportunidad: updatedProject.numeroOportunidad,
        pais: updatedProject.country,
        consultor: updatedProject.consultant,
        montoOportunidad:
          updatedProject.plannedHours * updatedProject.hourlyRate,
        terminado: updatedProject.terminado,
      });

      setProjects(
        projects.map((project) => (project.id === id ? updatedProject : project))
      );

      toast({
        title: "Proyecto actualizado",
        description: "Los cambios se han guardado en la base de datos",
      });
    } catch (error) {
      console.error("Error actualizando proyecto:", error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el proyecto",
        variant: "destructive",
      });
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await projectsApi.delete(id);
      setProjects(projects.filter((project) => project.id !== id));

      toast({
        title: "Proyecto eliminado",
        description: "El proyecto se ha eliminado de la base de datos",
      });
    } catch (error) {
      console.error("Error eliminando proyecto:", error);
      toast({
        title: "Error",
        description: "No se pudo eliminar el proyecto",
        variant: "destructive",
      });
    }
  };

  const handleCreateVisit = async (visitData: {
    producto: string;
    pais: string;
    consultor: string;
    tiempo: number;
    fecha: string;
    valorOportunidad: number;
    clientName: string;
    numeroOportunidad: string;
  }) => {
    try {
      const newId = String(Date.now());
      await visitsApi.create({
        id: newId,
        producto: visitData.producto,
        clientName: visitData.clientName,
        numeroOportunidad: visitData.numeroOportunidad,
        pais: visitData.pais,
        consultor: visitData.consultor,
        hora: String(visitData.tiempo ?? 0),
        fecha: visitData.fecha,
        montoOportunidad: visitData.valorOportunidad,
      });

      const newVisit: Visit = {
        id: newId,
        ...visitData,
      };
      setVisits([...visits, newVisit]);

      toast({
        title: "Visita creada",
        description: "La visita comercial se ha guardado en la base de datos",
      });
    } catch (error) {
      console.error("Error creando visita:", error);
      toast({
        title: "Error",
        description: "No se pudo crear la visita comercial",
        variant: "destructive",
      });
    }
  };

  const handleDeleteVisit = async (id: string) => {
    try {
      await visitsApi.delete(id);
      setVisits(visits.filter((visit) => visit.id !== id));

      toast({
        title: "Visita eliminada",
        description: "La visita comercial se ha eliminado de la base de datos",
      });
    } catch (error) {
      console.error("Error eliminando visita:", error);
      toast({
        title: "Error",
        description: "No se pudo eliminar la visita comercial",
        variant: "destructive",
      });
    }
  };

  const handleUpdateVisit = async (id: string, visitData: Omit<Visit, "id">) => {
    try {
      await visitsApi.update(id, {
        producto: visitData.producto,
        clientName: visitData.clientName,
        numeroOportunidad: visitData.numeroOportunidad,
        pais: visitData.pais,
        consultor: visitData.consultor,
        hora: String(visitData.tiempo ?? 0),
        fecha: visitData.fecha,
        montoOportunidad: visitData.valorOportunidad,
      });

      setVisits(visits.map((visit) => (visit.id === id ? { ...visitData, id } : visit)));

      toast({
        title: "Visita actualizada",
        description: "Los cambios se han guardado en la base de datos",
      });
    } catch (error) {
      console.error("Error actualizando visita:", error);
      toast({
        title: "Error",
        description: "No se pudo actualizar la visita comercial",
        variant: "destructive",
      });
    }
  };

  const totalPlannedHours = projects.reduce((sum, p) => sum + p.plannedHours, 0);
  const totalExecutedHours = projects.reduce((sum, p) => sum + p.executedHours, 0);
  const totalRevenue = projects.reduce(
    (sum, p) => sum + p.executedHours * p.hourlyRate,
    0
  );
  const totalVisits = visits.length;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Cargando datos...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <img src={tigoLogo} alt="Tigo Business" className="h-16 md:h-20 object-contain" />
        </div>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold text-foreground mb-2">
                Gestión de Proyectos
              </h1>
              <p className="text-muted-foreground">
                Control y seguimiento de horas por proyecto
              </p>
            </div>
            <div className="flex gap-3">
              <CreateProjectDialog onCreateProject={handleCreateProject} />
              <CreateVisitDialog onCreateVisit={handleCreateVisit} />
            </div>
          </div>

          <DashboardStats
            totalProjects={projects.length}
            totalPlannedHours={totalPlannedHours}
            totalExecutedHours={totalExecutedHours}
            totalRevenue={totalRevenue}
            totalVisits={totalVisits}
          />
        </div>

        {/* Projects Grid */}
        <div>
          <h2 className="text-2xl font-semibold text-foreground mb-6">
            Proyectos Activos
          </h2>
          {projects.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground text-lg mb-4">
                No hay proyectos registrados
              </p>
              <p className="text-sm text-muted-foreground">
                Crea tu primer proyecto para comenzar
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onUpdateHours={handleUpdateHours}
                  onUpdateProject={handleUpdateProject}
                  onDeleteProject={handleDeleteProject}
                />
              ))}
            </div>
          )}
        </div>

        {/* Commercial Visits Section */}
        <div className="mt-12">
          <h2 className="text-2xl font-semibold text-foreground mb-6">
            Visitas Comerciales
          </h2>
          {visits.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground text-lg mb-4">
                No hay visitas comerciales registradas
              </p>
              <p className="text-sm text-muted-foreground">
                Registra tu primera visita comercial
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {visits.map((visit) => (
                <VisitCard
                  key={visit.id}
                  visit={visit}
                  onDeleteVisit={handleDeleteVisit}
                  onUpdateVisit={handleUpdateVisit}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Index;
