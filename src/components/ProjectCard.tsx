import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Clock, DollarSign, TrendingUp, Plus, Calendar, AlertCircle, Edit, Trash2, Check, MessageSquare } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Observation {
  id: string;
  text: string;
  date: string;
}

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
  observaciones: Observation[];
  terminado: boolean;
}

interface ProjectCardProps {
  project: Project;
  onUpdateHours: (id: string, hours: number) => void;
  onUpdateProject: (id: string, updates: Partial<Project>) => void;
  onDeleteProject: (id: string) => void;
}

export const ProjectCard = ({ project, onUpdateHours, onUpdateProject, onDeleteProject }: ProjectCardProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isObservationOpen, setIsObservationOpen] = useState(false);
  const [hoursToAdd, setHoursToAdd] = useState("");
  const [newObservation, setNewObservation] = useState("");
  
  // Edit form states
  const [editName, setEditName] = useState(project.name);
  const [editDescription, setEditDescription] = useState(project.description);
  const [editClientName, setEditClientName] = useState(project.clientName);
  const [editConsultant, setEditConsultant] = useState(project.consultant);
  const [editPm, setEditPm] = useState(project.pm);
  const [editCountry, setEditCountry] = useState(project.country);
  const [editPlannedHours, setEditPlannedHours] = useState(project.plannedHours.toString());
  const [editStartDate, setEditStartDate] = useState(project.startDate);
  const [editEndDate, setEditEndDate] = useState(project.endDate);
  const [editHourlyRate, setEditHourlyRate] = useState(project.hourlyRate.toString());

  const progress = (project.executedHours / project.plannedHours) * 100;
  const totalCost = project.executedHours * project.hourlyRate;
  const estimatedCost = project.plannedHours * project.hourlyRate;
  const isOverBudget = project.executedHours > project.plannedHours;

  // Calculate time-based status
  const now = new Date();
  const start = new Date(project.startDate);
  const end = new Date(project.endDate);
  const totalDuration = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();
  const timeProgress = Math.min(Math.max((elapsed / totalDuration) * 100, 0), 100);
  
  const getProjectStatus = () => {
    if (now < start) {
      return { label: "Pendiente", variant: "secondary" as const, icon: Clock };
    }
    if (now > end) {
      return progress >= 100 
        ? { label: "Completado", variant: "default" as const, icon: TrendingUp }
        : { label: "Retrasado", variant: "destructive" as const, icon: AlertCircle };
    }
    
    // Project is in progress
    if (progress < timeProgress - 10) {
      return { label: "Atrasado", variant: "destructive" as const, icon: AlertCircle };
    } else if (progress > timeProgress + 10) {
      return { label: "Adelantado", variant: "default" as const, icon: TrendingUp };
    } else {
      return { label: "En Progreso", variant: "outline" as const, icon: Clock };
    }
  };

  const status = getProjectStatus();
  const StatusIcon = status.icon;

  const handleAddHours = () => {
    const hours = parseFloat(hoursToAdd);
    if (isNaN(hours) || hours <= 0) {
      toast.error("Por favor ingrese un número válido de horas");
      return;
    }
    onUpdateHours(project.id, hours);
    setHoursToAdd("");
    setIsOpen(false);
    toast.success(`${hours} horas agregadas al proyecto`);
  };

  const handleEditProject = () => {
    const hours = parseFloat(editPlannedHours);
    if (isNaN(hours) || hours <= 0) {
      toast.error("Por favor ingrese horas planificadas válidas");
      return;
    }

    const rate = parseFloat(editHourlyRate);
    if (isNaN(rate) || rate <= 0) {
      toast.error("Por favor ingrese un valor por hora válido");
      return;
    }

    if (!editStartDate || !editEndDate) {
      toast.error("Las fechas de inicio y fin son requeridas");
      return;
    }

    if (new Date(editStartDate) > new Date(editEndDate)) {
      toast.error("La fecha de inicio no puede ser posterior a la fecha de fin");
      return;
    }

    onUpdateProject(project.id, {
      name: editName.trim(),
      description: editDescription.trim(),
      plannedHours: hours,
      startDate: editStartDate,
      endDate: editEndDate,
      clientName: editClientName.trim(),
      consultant: editConsultant.trim(),
      pm: editPm.trim(),
      country: editCountry.trim(),
      hourlyRate: rate,
    });

    setIsEditOpen(false);
    toast.success("Proyecto actualizado exitosamente");
  };

  const handleDelete = () => {
    onDeleteProject(project.id);
    toast.success("Proyecto eliminado");
  };

  const handleToggleTerminado = () => {
    onUpdateProject(project.id, { terminado: !project.terminado });
    toast.success(project.terminado ? "Proyecto marcado como activo" : "Proyecto marcado como terminado");
  };

  const handleAddObservation = () => {
    if (!newObservation.trim()) {
      toast.error("La observación no puede estar vacía");
      return;
    }
    const observation: Observation = {
      id: Date.now().toString(),
      text: newObservation.trim(),
      date: new Date().toISOString(),
    };
    onUpdateProject(project.id, {
      observaciones: [...project.observaciones, observation],
    });
    setNewObservation("");
    toast.success("Observación agregada");
  };

  return (
    <Card className="bg-gradient-card shadow-md hover:shadow-lg transition-all duration-300 border-border overflow-hidden">
      <div className="p-6">
        <div className="flex items-center gap-6">
          {/* Left Section: Project Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-lg font-semibold text-foreground truncate">{project.name}</h3>
              <Badge variant={status.variant} className="gap-1 shrink-0">
                <StatusIcon className="w-3 h-3" />
                {status.label}
              </Badge>
              {project.terminado && (
                <Badge variant="default" className="gap-1 shrink-0 bg-success">
                  <Check className="w-3 h-3" />
                  Terminado
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground line-clamp-1 mb-3">{project.description}</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
              {project.numeroOportunidad && (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">N° Oportunidad:</span> 
                  <span className="font-medium">{project.numeroOportunidad}</span>
                </div>
              )}
              {project.clientName && (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Cliente:</span> 
                  <span className="font-medium">{project.clientName}</span>
                </div>
              )}
              {project.country && (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">País:</span> 
                  <span className="font-medium">{project.country}</span>
                </div>
              )}
              {project.consultant && (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">Consultor:</span> 
                  <span className="font-medium">{project.consultant}</span>
                </div>
              )}
              {project.pm && (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">PM:</span> 
                  <span className="font-medium">{project.pm}</span>
                </div>
              )}
              <div className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="w-3 h-3" />
                <span>{new Date(project.startDate).toLocaleDateString()} - {new Date(project.endDate).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-1 text-primary font-medium">
                <DollarSign className="w-3 h-3" />
                <span>${project.hourlyRate}/h</span>
              </div>
            </div>
          </div>

          {/* Center Section: Progress and Stats */}
          <div className="flex items-center gap-6 px-6 border-l border-border">
            <div className="flex flex-col items-center justify-center min-w-[120px]">
              <Progress value={Math.min(progress, 100)} className="h-2 w-24 mb-2" />
              <span className={`text-sm font-semibold ${isOverBudget ? 'text-warning' : 'text-success'}`}>
                {project.executedHours} / {project.plannedHours} hrs
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Clock className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Planificado</p>
                <p className="text-sm font-semibold text-foreground">{project.plannedHours}h</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-success/10">
                <TrendingUp className="w-4 h-4 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ejecutado</p>
                <p className="text-sm font-semibold text-foreground">{project.executedHours}h</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-accent/10">
                <DollarSign className="w-4 h-4 text-accent" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Costo</p>
                <p className="text-sm font-semibold text-foreground">${totalCost.toLocaleString()}</p>
              </div>
            </div>

            {isOverBudget && (
              <div className="px-3 py-1 rounded-lg bg-warning/10 border border-warning/20">
                <p className="text-xs text-warning font-medium whitespace-nowrap">
                  ⚠️ +${(totalCost - estimatedCost).toLocaleString()}
                </p>
              </div>
            )}
          </div>

          {/* Right Section: Actions */}
          <div className="flex gap-2 shrink-0">
            <Button 
              size="sm" 
              variant={project.terminado ? "outline" : "default"}
              className="shadow-sm"
              onClick={handleToggleTerminado}
            >
              <Check className="w-4 h-4 mr-1" />
              {project.terminado ? "Reactivar" : "Terminar"}
            </Button>
            <Dialog open={isObservationOpen} onOpenChange={setIsObservationOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="shadow-sm">
                  <MessageSquare className="w-4 h-4 mr-1" />
                  Observaciones ({project.observaciones.length})
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
                <DialogHeader>
                  <DialogTitle>Observaciones del Proyecto</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <Label htmlFor="observation">Nueva Observación</Label>
                    <Textarea
                      id="observation"
                      placeholder="Escribe tu observación..."
                      value={newObservation}
                      onChange={(e) => setNewObservation(e.target.value)}
                      className="mt-2 min-h-[80px]"
                    />
                    <Button onClick={handleAddObservation} className="w-full mt-2 bg-gradient-primary">
                      Agregar Observación
                    </Button>
                  </div>
                  <div className="border-t pt-4">
                    <h4 className="font-semibold mb-3">Historial</h4>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto">
                      {project.observaciones.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No hay observaciones registradas
                        </p>
                      ) : (
                        project.observaciones.map((obs) => (
                          <div key={obs.id} className="bg-muted/50 p-3 rounded-lg">
                            <p className="text-sm text-foreground mb-1">{obs.text}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(obs.date).toLocaleString()}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" className="shadow-sm">
                  <Trash2 className="w-4 h-4 mr-1" />
                  Eliminar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acción no se puede deshacer. Esto eliminará permanentemente el proyecto.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="shadow-sm">
                  <Edit className="w-4 h-4 mr-1" />
                  Editar
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Editar Proyecto</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <Label htmlFor="edit-name">Nombre del Proyecto</Label>
                    <Input
                      id="edit-name"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-description">Descripción</Label>
                    <Textarea
                      id="edit-description"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="mt-2 min-h-[80px]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="edit-client">Cliente</Label>
                      <Input
                        id="edit-client"
                        value={editClientName}
                        onChange={(e) => setEditClientName(e.target.value)}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-country">País</Label>
                      <Input
                        id="edit-country"
                        value={editCountry}
                        onChange={(e) => setEditCountry(e.target.value)}
                        className="mt-2"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="edit-consultant">Consultor</Label>
                      <Input
                        id="edit-consultant"
                        value={editConsultant}
                        onChange={(e) => setEditConsultant(e.target.value)}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-pm">PM</Label>
                      <Input
                        id="edit-pm"
                        value={editPm}
                        onChange={(e) => setEditPm(e.target.value)}
                        className="mt-2"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="edit-hours">Horas Planificadas</Label>
                      <Input
                        id="edit-hours"
                        type="number"
                        step="0.5"
                        min="0"
                        value={editPlannedHours}
                        onChange={(e) => setEditPlannedHours(e.target.value)}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-rate">Valor por Hora ($)</Label>
                      <Input
                        id="edit-rate"
                        type="number"
                        step="0.5"
                        min="0"
                        value={editHourlyRate}
                        onChange={(e) => setEditHourlyRate(e.target.value)}
                        className="mt-2"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="edit-start">Fecha de Inicio</Label>
                      <Input
                        id="edit-start"
                        type="date"
                        value={editStartDate}
                        onChange={(e) => setEditStartDate(e.target.value)}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit-end">Fecha de Fin</Label>
                      <Input
                        id="edit-end"
                        type="date"
                        value={editEndDate}
                        onChange={(e) => setEditEndDate(e.target.value)}
                        className="mt-2"
                      />
                    </div>
                  </div>
                  <Button onClick={handleEditProject} className="w-full bg-gradient-primary">
                    Guardar Cambios
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-gradient-primary shadow-sm hover:shadow-glow">
                <Plus className="w-4 h-4 mr-1" />
                Horas
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registrar Horas</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div>
                  <Label htmlFor="hours">Horas trabajadas</Label>
                  <Input
                    id="hours"
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="0.0"
                    value={hoursToAdd}
                    onChange={(e) => setHoursToAdd(e.target.value)}
                    className="mt-2"
                  />
                </div>
                <Button onClick={handleAddHours} className="w-full bg-gradient-primary">
                  Agregar Horas
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>
      </div>
    </Card>
  );
};
