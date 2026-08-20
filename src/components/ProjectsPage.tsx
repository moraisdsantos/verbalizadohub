import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import type {
  Client,
  Contract,
  Project,
  ProjectAction,
  ProjectActionPriority,
  ProjectCost,
  ProjectCostStatus,
  ProjectStage,
  ProjectStageStatus,
  ProjectStatus,
} from "../types";

type ProjectsPageProps = {
  userEmail: string;
  onSignOut: () => void;
};

type ContractSummary = Pick<
  Contract,
  | "id"
  | "title"
  | "status"
  | "drive_url"
  | "total_value"
  | "effective_date"
  | "expires_at"
>;

type ProjectWithRelations = Project & {
  clients: Pick<Client, "legal_name" | "trade_name"> | null;
  contracts: ContractSummary | ContractSummary[] | null;
};

type ViewScale = "month" | "quarter" | "year";
type PanelTab = "general" | "stages" | "actions" | "costs";
type KpiFilter = "active" | "late" | "expiry" | "balance" | null;
type StageVisualStatus = ProjectStageStatus | "late";

type StageDraft = {
  title: string;
  icon: string;
  status: ProjectStageStatus;
  start_date: string;
  end_date: string;
};

type ActionDraft = {
  description: string;
  assignee: string;
  due_date: string;
  stage_id: string;
  priority: ProjectActionPriority;
  notes: string;
};

type CostDraft = {
  description: string;
  category: string;
  amount: string;
  incurred_on: string;
  status: ProjectCostStatus;
  notes: string;
};

type TimelineColumn = {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
  label: string;
};

const projectStatusLabels: Record<ProjectStatus, string> = {
  planning: "Planejamento",
  active: "Em andamento",
  paused: "Pausado",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const stageStatusLabels: Record<ProjectStageStatus, string> = {
  planned: "Planejada",
  in_progress: "Em andamento",
  completed: "Concluída",
  blocked: "Bloqueada",
};

const stageVisualLabels: Record<StageVisualStatus, string> = {
  ...stageStatusLabels,
  late: "Atrasada",
};

const priorityLabels: Record<ProjectActionPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

const costStatusLabels: Record<ProjectCostStatus, string> = {
  planned: "Previsto",
  paid: "Pago",
};

const iconOptions = [
  { value: "planning", label: "Planejamento" },
  { value: "accessibility", label: "Acessibilidade" },
  { value: "production", label: "Produção" },
  { value: "review", label: "Revisão" },
  { value: "delivery", label: "Entrega" },
  { value: "milestone", label: "Marco" },
];

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function dateFromIso(value: string) {
  return new Date(`${value}T12:00:00Z`);
}

function isoFromDate(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getUTCDay();
  result.setUTCDate(result.getUTCDate() - (day === 0 ? 6 : day - 1));
  return result;
}

function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 6);
}

function formatShortDate(value: string | Date | null) {
  if (!value) return "Não informada";
  const date = typeof value === "string" ? dateFromIso(value) : value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  })
    .format(date)
    .replace(" de ", " ");
}

function formatFullDate(value: string | null) {
  if (!value) return "Não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(dateFromIso(value));
}

function getPeriod(anchor: string, scale: ViewScale) {
  const date = dateFromIso(anchor);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (scale === "year") {
    return {
      start: new Date(Date.UTC(year, 0, 1, 12)),
      end: new Date(Date.UTC(year, 11, 31, 12)),
      label: String(year),
    };
  }
  if (scale === "quarter") {
    const quarterStart = Math.floor(month / 3) * 3;
    return {
      start: new Date(Date.UTC(year, quarterStart, 1, 12)),
      end: new Date(Date.UTC(year, quarterStart + 3, 0, 12)),
      label: `${Math.floor(month / 3) + 1}º trimestre de ${year}`,
    };
  }
  const monthName = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
  return {
    start: new Date(Date.UTC(year, month, 1, 12)),
    end: new Date(Date.UTC(year, month + 1, 0, 12)),
    label: monthName.charAt(0).toLocaleUpperCase("pt-BR") + monthName.slice(1),
  };
}

function getTimelineColumns(start: Date, end: Date, scale: ViewScale): TimelineColumn[] {
  if (scale === "year") {
    return Array.from({ length: 12 }, (_, month) => {
      const columnStart = new Date(Date.UTC(start.getUTCFullYear(), month, 1, 12));
      const columnEnd = new Date(Date.UTC(start.getUTCFullYear(), month + 1, 0, 12));
      return {
        start: columnStart,
        end: columnEnd,
        startIso: isoFromDate(columnStart),
        endIso: isoFromDate(columnEnd),
        label: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(columnStart),
      };
    });
  }

  const columns: TimelineColumn[] = [];
  let cursor = startOfWeek(start);
  const finalWeek = endOfWeek(end);
  while (cursor <= finalWeek) {
    const columnStart = new Date(cursor);
    const columnEnd = addDays(columnStart, 6);
    columns.push({
      start: columnStart,
      end: columnEnd,
      startIso: isoFromDate(columnStart),
      endIso: isoFromDate(columnEnd),
      label: `${String(columnStart.getUTCDate()).padStart(2, "0")}/${String(columnStart.getUTCMonth() + 1).padStart(2, "0")}`,
    });
    cursor = addDays(cursor, 7);
  }
  return columns;
}

function getContract(project: ProjectWithRelations | null) {
  if (!project?.contracts) return null;
  return Array.isArray(project.contracts) ? project.contracts[0] ?? null : project.contracts;
}

function getClientName(project: ProjectWithRelations) {
  return project.clients?.trade_name || project.clients?.legal_name || "Cliente não informado";
}

function getProjectDates(project: ProjectWithRelations) {
  const contract = getContract(project);
  return {
    start: project.start_date || contract?.effective_date || null,
    end: project.end_date || contract?.expires_at || null,
  };
}

function getProjectIcon(project: ProjectWithRelations) {
  const name = project.name.toLocaleLowerCase("pt-BR");
  if (name.includes("audiodescri") || name.includes("áudio")) return "production";
  if (name.includes("libras") || name.includes("acessibilidade")) return "accessibility";
  if (name.includes("revis") || name.includes("auditoria")) return "review";
  if (name.includes("entrega") || name.includes("festival")) return "delivery";
  if (name.includes("forma") || name.includes("curso")) return "planning";
  return "milestone";
}

function getProjectResponsible(projectActions: ProjectAction[]) {
  return projectActions.find((action) => action.assignee?.trim())?.assignee?.trim() || "Não definido";
}

function getProjectProgress(project: ProjectWithRelations, projectStages: ProjectStage[]) {
  if (project.status === "completed") return 100;
  if (!projectStages.length) return 0;
  const completed = projectStages.filter((stage) => stage.status === "completed").length;
  const active = projectStages.filter((stage) => stage.status === "in_progress").length;
  return Math.min(100, Math.round(((completed + active * 0.5) / projectStages.length) * 100));
}

function daysUntil(value: string | null) {
  if (!value) return null;
  const today = dateFromIso(todayIso()).getTime();
  return Math.ceil((dateFromIso(value).getTime() - today) / 86400000);
}

function getStageVisualStatus(stage: ProjectStage): StageVisualStatus {
  if (stage.status !== "completed" && stage.status !== "blocked" && stage.end_date < todayIso()) return "late";
  return stage.status;
}

function getColumnSpan(startIso: string, endIso: string, columns: TimelineColumn[]) {
  const first = columns.findIndex((column) => startIso <= column.endIso && endIso >= column.startIso);
  if (first < 0) return null;
  let last = first;
  for (let index = first + 1; index < columns.length; index += 1) {
    if (startIso <= columns[index].endIso && endIso >= columns[index].startIso) last = index;
  }
  return { first, last };
}

function timelineTodayPosition(columns: TimelineColumn[]) {
  if (!columns.length) return null;
  const start = columns[0].start.getTime();
  const end = columns[columns.length - 1].end.getTime() + 86400000;
  const today = dateFromIso(todayIso()).getTime();
  if (today < start || today > end) return null;
  return ((today - start) / (end - start)) * 100;
}

function StageIcon({ name }: { name: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "planning") return <svg {...common} aria-hidden="true"><path d="M4 19V5M4 6h11l-2 4 2 4H4" /></svg>;
  if (name === "accessibility") return <svg {...common} aria-hidden="true"><circle cx="12" cy="4" r="2" /><path d="M5 8h14M12 8v13M8 21l4-7 4 7" /></svg>;
  if (name === "production") return <svg {...common} aria-hidden="true"><path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" /></svg>;
  if (name === "review") return <svg {...common} aria-hidden="true"><path d="M4 4h16v16H4Z" /><path d="m8 12 2.5 2.5L16 9" /></svg>;
  if (name === "delivery") return <svg {...common} aria-hidden="true"><path d="M3 6h12v12H3Z" /><path d="M15 10h4l2 3v5h-6M7 18a2 2 0 1 0 0 .01M17 18a2 2 0 1 0 0 .01" /></svg>;
  return <svg {...common} aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>;
}

function UiIcon({ name }: { name: "search" | "projects" | "warning" | "calendar" | "finance" | "folder" | "close" | "check" }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "search") return <svg {...common} aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
  if (name === "projects") return <svg {...common} aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v5" /></svg>;
  if (name === "warning") return <svg {...common} aria-hidden="true"><path d="m12 3 9 17H3Z" /><path d="M12 9v4M12 17h.01" /></svg>;
  if (name === "calendar") return <svg {...common} aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>;
  if (name === "finance") return <svg {...common} aria-hidden="true"><path d="M3 3v18h18M7 16l4-5 3 3 6-8" /></svg>;
  if (name === "folder") return <svg {...common} aria-hidden="true"><path d="M3 6h7l2 2h9v11H3Z" /></svg>;
  if (name === "check") return <svg {...common} aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
  return <svg {...common} aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>;
}

function UserAvatar({ value }: { value: string }) {
  const initials = value
    .split(/[.@\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("pt-BR");
  return <span className="project-user-avatar" aria-hidden="true">{initials || "VB"}</span>;
}

function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`project-status-badge ${status}`}><i />{projectStatusLabels[status]}</span>;
}

function StageStatusBadge({ status }: { status: StageVisualStatus }) {
  return <span className={`stage-status-badge ${status}`}><i />{stageVisualLabels[status]}</span>;
}

function emptyStage(project: ProjectWithRelations | null): StageDraft {
  const start = project?.start_date || getContract(project)?.effective_date || todayIso();
  const end = project?.end_date || getContract(project)?.expires_at || isoFromDate(addDays(dateFromIso(start), 7));
  return { title: "", icon: "milestone", status: "planned", start_date: start, end_date: end };
}

export default function ProjectsPage({ userEmail, onSignOut }: ProjectsPageProps) {
  const [projects, setProjects] = useState<ProjectWithRelations[]>([]);
  const [allStages, setAllStages] = useState<ProjectStage[]>([]);
  const [allActions, setAllActions] = useState<ProjectAction[]>([]);
  const [allCosts, setAllCosts] = useState<ProjectCost[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [panelTab, setPanelTab] = useState<PanelTab>("general");
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [viewScale, setViewScale] = useState<ViewScale>("quarter");
  const [anchorDate, setAnchorDate] = useState(todayIso);
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [responsibleFilter, setResponsibleFilter] = useState("");
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>(null);
  const [stageEditor, setStageEditor] = useState<ProjectStage | "new" | null>(null);
  const [stageDraft, setStageDraft] = useState<StageDraft>(() => emptyStage(null));
  const [actionEditorOpen, setActionEditorOpen] = useState(false);
  const [actionDraft, setActionDraft] = useState<ActionDraft>({
    description: "",
    assignee: "",
    due_date: todayIso(),
    stage_id: "",
    priority: "medium",
    notes: "",
  });
  const [costEditorOpen, setCostEditorOpen] = useState(false);
  const [costDraft, setCostDraft] = useState<CostDraft>({
    description: "",
    category: "produção",
    amount: "",
    incurred_on: todayIso(),
    status: "planned",
    notes: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const selectedContract = getContract(selectedProject);
  const selectedStages = useMemo(
    () => allStages.filter((stage) => stage.project_id === selectedProjectId),
    [allStages, selectedProjectId],
  );
  const selectedActions = useMemo(
    () => allActions.filter((action) => action.project_id === selectedProjectId),
    [allActions, selectedProjectId],
  );
  const selectedCosts = useMemo(
    () => allCosts.filter((cost) => cost.project_id === selectedProjectId),
    [allCosts, selectedProjectId],
  );

  const period = useMemo(() => getPeriod(anchorDate, viewScale), [anchorDate, viewScale]);
  const columns = useMemo(
    () => getTimelineColumns(period.start, period.end, viewScale),
    [period.end, period.start, viewScale],
  );
  const todayPosition = useMemo(() => timelineTodayPosition(columns), [columns]);
  const timelineStyle = { "--timeline-columns": columns.length } as CSSProperties;

  const projectStages = useCallback(
    (projectId: string) => allStages.filter((stage) => stage.project_id === projectId),
    [allStages],
  );
  const projectActions = useCallback(
    (projectId: string) => allActions.filter((action) => action.project_id === projectId),
    [allActions],
  );
  const projectCosts = useCallback(
    (projectId: string) => allCosts.filter((cost) => cost.project_id === projectId),
    [allCosts],
  );

  const loadDashboard = useCallback(async () => {
    if (!supabase) {
      setMessage("A conexão com o Supabase não está configurada.");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const [projectsResult, stagesResult, actionsResult, costsResult] = await Promise.all([
      supabase
        .from("projects")
        .select("*, clients(legal_name,trade_name), contracts(id,title,status,drive_url,total_value,effective_date,expires_at)")
        .order("created_at", { ascending: false }),
      supabase.from("project_stages").select("*").order("position").order("start_date"),
      supabase.from("project_actions").select("*").order("due_date"),
      supabase.from("project_costs").select("*").order("incurred_on", { ascending: false }),
    ]);
    const error = projectsResult.error || stagesResult.error || actionsResult.error || costsResult.error;
    if (error) {
      setMessage(`Não foi possível carregar a visão de projetos: ${error.message}`);
      setIsLoading(false);
      return;
    }
    const loadedProjects = (projectsResult.data ?? []) as unknown as ProjectWithRelations[];
    const loadedActions = (actionsResult.data ?? []).map((action) => ({
      ...action,
      priority: action.priority || "medium",
      notes: action.notes || null,
    })) as ProjectAction[];
    setProjects(loadedProjects);
    setAllStages((stagesResult.data ?? []) as ProjectStage[]);
    setAllActions(loadedActions);
    setAllCosts((costsResult.data ?? []) as ProjectCost[]);
    setSelectedProjectId((current) => loadedProjects.some((project) => project.id === current) ? current : "");
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const clients = useMemo(
    () => [...new Set(projects.map(getClientName))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [projects],
  );
  const responsibles = useMemo(
    () => [...new Set(projects.map((project) => getProjectResponsible(projectActions(project.id))))]
      .filter((value) => value !== "Não definido")
      .sort((a, b) => a.localeCompare(b, "pt-BR")),
    [projectActions, projects],
  );

  const activeCount = projects.filter((project) => project.status === "active").length;
  const lateActionsCount = allActions.filter((action) => action.status === "pending" && action.due_date < todayIso()).length;
  const expiringCount = projects.filter((project) => {
    const remaining = daysUntil(getProjectDates(project).end);
    return remaining !== null && remaining >= 0 && remaining <= 30 && project.status !== "completed" && project.status !== "cancelled";
  }).length;
  const portfolioBalance = projects.reduce((total, project) => {
    const revenue = Number(getContract(project)?.total_value || 0);
    const costs = projectCosts(project.id).reduce((sum, cost) => sum + Number(cost.amount), 0);
    return total + revenue - costs;
  }, 0);

  const filteredProjects = useMemo(() => projects.filter((project) => {
    const client = getClientName(project);
    const actions = projectActions(project.id);
    const responsible = getProjectResponsible(actions);
    const searchValue = search.trim().toLocaleLowerCase("pt-BR");
    if (searchValue && !`${project.name} ${client}`.toLocaleLowerCase("pt-BR").includes(searchValue)) return false;
    if (clientFilter && client !== clientFilter) return false;
    if (statusFilter && project.status !== statusFilter) return false;
    if (responsibleFilter && responsible !== responsibleFilter) return false;
    if (kpiFilter === "active" && project.status !== "active") return false;
    if (kpiFilter === "late" && !actions.some((action) => action.status === "pending" && action.due_date < todayIso())) return false;
    if (kpiFilter === "expiry") {
      const remaining = daysUntil(getProjectDates(project).end);
      if (remaining === null || remaining < 0 || remaining > 30) return false;
    }
    if (kpiFilter === "balance") {
      const projectBalance = Number(getContract(project)?.total_value || 0)
        - projectCosts(project.id).reduce((sum, cost) => sum + Number(cost.amount), 0);
      if (projectBalance >= 0) return false;
    }
    return true;
  }), [clientFilter, kpiFilter, projectActions, projectCosts, projects, responsibleFilter, search, statusFilter]);

  function movePeriod(direction: -1 | 1) {
    const date = dateFromIso(anchorDate);
    const months = viewScale === "month" ? 1 : viewScale === "quarter" ? 3 : 12;
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + direction * months);
    setAnchorDate(isoFromDate(date));
  }

  function toggleExpanded(projectId: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function selectProject(projectId: string) {
    setPanelTab("general");
    setSelectedProjectId((current) => current === projectId ? "" : projectId);
  }

  async function updateProjectStatus(status: ProjectStatus) {
    if (!supabase || !selectedProject) return;
    const { error } = await supabase.from("projects").update({ status }).eq("id", selectedProject.id);
    if (error) setMessage(`Não foi possível alterar a situação: ${error.message}`);
    else {
      setProjects((current) => current.map((project) => project.id === selectedProject.id ? { ...project, status } : project));
      setMessage("Situação do projeto atualizada.");
    }
  }

  function openNewStage() {
    setStageDraft(emptyStage(selectedProject));
    setStageEditor("new");
  }

  function openStage(stage: ProjectStage) {
    setStageDraft({
      title: stage.title,
      icon: stage.icon,
      status: stage.status,
      start_date: stage.start_date,
      end_date: stage.end_date,
    });
    setStageEditor(stage);
  }

  async function saveStage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !selectedProject || !stageEditor) return;
    setIsSaving(true);
    const payload = {
      project_id: selectedProject.id,
      title: stageDraft.title.trim(),
      icon: stageDraft.icon,
      status: stageDraft.status,
      start_date: stageDraft.start_date,
      end_date: stageDraft.end_date,
      position: stageEditor === "new" ? selectedStages.length : stageEditor.position,
    };
    const result = stageEditor === "new"
      ? await supabase.from("project_stages").insert(payload)
      : await supabase.from("project_stages").update(payload).eq("id", stageEditor.id);
    if (result.error) setMessage(`Não foi possível salvar a etapa: ${result.error.message}`);
    else {
      setStageEditor(null);
      setMessage(stageEditor === "new" ? "Etapa criada." : "Etapa atualizada.");
      await loadDashboard();
    }
    setIsSaving(false);
  }

  async function removeStage() {
    if (!supabase || !stageEditor || stageEditor === "new") return;
    if (!window.confirm(`Remover a etapa “${stageEditor.title}”?`)) return;
    const { error } = await supabase.from("project_stages").delete().eq("id", stageEditor.id);
    if (error) setMessage(`Não foi possível remover a etapa: ${error.message}`);
    else {
      setStageEditor(null);
      setMessage("Etapa removida.");
      await loadDashboard();
    }
  }

  async function createDefaultStages() {
    if (!supabase || !selectedProject || selectedStages.length) return;
    setIsSaving(true);
    const startIso = selectedProject.start_date || selectedContract?.effective_date || todayIso();
    const start = dateFromIso(startIso);
    const requestedEnd = selectedProject.end_date || selectedContract?.expires_at;
    const end = requestedEnd ? dateFromIso(requestedEnd) : addDays(start, 69);
    const totalDays = Math.max(34, Math.round((end.getTime() - start.getTime()) / 86400000));
    const definitions = [
      ["Planejamento e alinhamento", "planning", 0, 0.14],
      ["Preparação dos recursos de acessibilidade", "accessibility", 0.15, 0.34],
      ["Produção", "production", 0.35, 0.68],
      ["Revisão e aprovação", "review", 0.69, 0.84],
      ["Entrega final", "delivery", 0.85, 1],
    ] as const;
    const payload = definitions.map(([title, icon, from, to], position) => ({
      project_id: selectedProject.id,
      title,
      icon,
      status: "planned" as ProjectStageStatus,
      start_date: isoFromDate(addDays(start, Math.floor(totalDays * from))),
      end_date: isoFromDate(addDays(start, Math.max(Math.floor(totalDays * from), Math.floor(totalDays * to)))),
      position,
    }));
    const { error } = await supabase.from("project_stages").insert(payload);
    if (error) setMessage(`Não foi possível criar as etapas: ${error.message}`);
    else {
      setMessage("Etapas padrão criadas. Abra cada etapa para ajustar as datas.");
      await loadDashboard();
    }
    setIsSaving(false);
  }

  function openActionEditor() {
    setActionDraft({
      description: "",
      assignee: "",
      due_date: todayIso(),
      stage_id: "",
      priority: "medium",
      notes: "",
    });
    setActionEditorOpen(true);
  }

  async function saveAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !selectedProject) return;
    setIsSaving(true);
    const { error } = await supabase.from("project_actions").insert({
      project_id: selectedProject.id,
      stage_id: actionDraft.stage_id || null,
      description: actionDraft.description.trim(),
      assignee: actionDraft.assignee.trim() || null,
      due_date: actionDraft.due_date,
      status: "pending",
      priority: actionDraft.priority,
      notes: actionDraft.notes.trim() || null,
    });
    if (error) setMessage(`Não foi possível adicionar a ação: ${error.message}`);
    else {
      setActionEditorOpen(false);
      setMessage("Ação adicionada ao projeto.");
      await loadDashboard();
    }
    setIsSaving(false);
  }

  async function toggleAction(action: ProjectAction) {
    if (!supabase) return;
    const completed = action.status !== "completed";
    const { error } = await supabase.from("project_actions").update({
      status: completed ? "completed" : "pending",
      completed_at: completed ? new Date().toISOString() : null,
    }).eq("id", action.id);
    if (error) setMessage(`Não foi possível atualizar a ação: ${error.message}`);
    else await loadDashboard();
  }

  async function removeAction(action: ProjectAction) {
    if (!supabase || !window.confirm(`Remover a ação “${action.description}”?`)) return;
    const { error } = await supabase.from("project_actions").delete().eq("id", action.id);
    if (error) setMessage(`Não foi possível remover a ação: ${error.message}`);
    else await loadDashboard();
  }

  function openCostEditor() {
    setCostDraft({
      description: "",
      category: "produção",
      amount: "",
      incurred_on: todayIso(),
      status: "planned",
      notes: "",
    });
    setCostEditorOpen(true);
  }

  async function saveCost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !selectedProject) return;
    setIsSaving(true);
    const { error } = await supabase.from("project_costs").insert({
      project_id: selectedProject.id,
      description: costDraft.description.trim(),
      category: costDraft.category,
      amount: Number(costDraft.amount),
      incurred_on: costDraft.incurred_on,
      status: costDraft.status,
      notes: costDraft.notes.trim() || null,
    });
    if (error) setMessage(`Não foi possível adicionar o custo: ${error.message}`);
    else {
      setCostEditorOpen(false);
      setMessage("Custo adicionado ao projeto.");
      await loadDashboard();
    }
    setIsSaving(false);
  }

  async function removeCost(cost: ProjectCost) {
    if (!supabase || !window.confirm(`Remover o custo “${cost.description}”?`)) return;
    const { error } = await supabase.from("project_costs").delete().eq("id", cost.id);
    if (error) setMessage(`Não foi possível remover o custo: ${error.message}`);
    else await loadDashboard();
  }

  const selectedProgress = selectedProject ? getProjectProgress(selectedProject, selectedStages) : 0;
  const selectedRevenue = Number(selectedContract?.total_value || 0);
  const selectedTotalCosts = selectedCosts.reduce((total, cost) => total + Number(cost.amount), 0);
  const selectedPaidCosts = selectedCosts.filter((cost) => cost.status === "paid").reduce((total, cost) => total + Number(cost.amount), 0);
  const selectedBalance = selectedRevenue - selectedTotalCosts;
  const selectedMargin = selectedRevenue > 0 ? (selectedBalance / selectedRevenue) * 100 : 0;
  const selectedDates = selectedProject ? getProjectDates(selectedProject) : { start: null, end: null };
  const selectedRemainingDays = daysUntil(selectedDates.end);

  const kpis = [
    { key: "active" as const, label: "Projetos ativos", value: String(activeCount), icon: "projects" as const },
    { key: "late" as const, label: "Ações atrasadas", value: String(lateActionsCount), icon: "warning" as const },
    { key: "expiry" as const, label: "Contratos a vencer", value: String(expiringCount), icon: "calendar" as const, note: "nos próximos 30 dias" },
    { key: "balance" as const, label: "Saldo projetado", value: currencyFormatter.format(portfolioBalance), icon: "finance" as const },
  ];

  return (
    <div className={`project-dashboard ${selectedProject ? "drawer-open" : ""}`}>
      <header className="project-dashboard-topbar">
        <a className="project-back-link" href="#/"><span aria-hidden="true">←</span> Voltar ao Hub</a>
        <div className="project-topbar-title">
          <span className="project-topbar-mark" aria-hidden="true"><UiIcon name="projects" /></span>
          <h1>Visão de Projetos</h1>
          <span>ver.balizado</span>
        </div>
        <div className="project-topbar-account">
          <UserAvatar value={userEmail} />
          <span>{userEmail}</span>
          <button type="button" onClick={onSignOut}>Sair</button>
        </div>
      </header>

      <main className="project-dashboard-main">
        <section className="project-filter-bar" aria-label="Filtros e período">
          <label className="project-search-field">
            <span className="sr-only">Buscar projeto ou cliente</span>
            <UiIcon name="search" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar projeto ou cliente..." />
          </label>
          <select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)} aria-label="Filtrar por cliente">
            <option value="">Todos os clientes</option>
            {clients.map((client) => <option key={client} value={client}>{client}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar por situação">
            <option value="">Todas as situações</option>
            {Object.entries(projectStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)} aria-label="Filtrar por responsável">
            <option value="">Todos os responsáveis</option>
            {responsibles.map((responsible) => <option key={responsible} value={responsible}>{responsible}</option>)}
          </select>
          <div className="project-period-switch" aria-label="Escala da visualização">
            {(["month", "quarter", "year"] as ViewScale[]).map((scale) => (
              <button key={scale} type="button" className={viewScale === scale ? "selected" : ""} onClick={() => setViewScale(scale)}>
                {scale === "month" ? "Mês" : scale === "quarter" ? "Trimestre" : "Ano"}
              </button>
            ))}
          </div>
          <div className="project-period-navigation">
            <button type="button" onClick={() => movePeriod(-1)} aria-label="Período anterior">‹</button>
            <strong>{period.label}</strong>
            <button type="button" onClick={() => movePeriod(1)} aria-label="Próximo período">›</button>
            <button type="button" onClick={() => setAnchorDate(todayIso())}>Hoje</button>
          </div>
          <a className="primary-action project-new-contract" href="#/contratos">+ Novo projeto via contrato</a>
        </section>

        <p className="module-message project-dashboard-message" role="status" aria-live="polite">{message}</p>

        <section className="project-kpi-grid" aria-label="Resumo dos projetos">
          {kpis.map((kpi) => (
            <button
              key={kpi.key}
              type="button"
              className={kpiFilter === kpi.key ? "selected" : ""}
              onClick={() => setKpiFilter((current) => current === kpi.key ? null : kpi.key)}
            >
              <span className={`project-kpi-icon ${kpi.key}`}><UiIcon name={kpi.icon} /></span>
              <span><small>{kpi.label}</small><strong>{kpi.value}</strong>{kpi.note ? <em>{kpi.note}</em> : null}</span>
              {kpiFilter === kpi.key ? <i>Filtro ativo</i> : null}
            </button>
          ))}
        </section>

        <section className="project-portfolio-card" aria-labelledby="portfolio-title">
          <div className="project-portfolio-heading">
            <div>
              <p className="section-eyebrow">Portfólio em andamento</p>
              <h2 id="portfolio-title">Projetos e etapas contratuais</h2>
            </div>
            <span>{filteredProjects.length} {filteredProjects.length === 1 ? "projeto" : "projetos"}</span>
          </div>

          {isLoading ? (
            <div className="project-dashboard-empty">Carregando projetos...</div>
          ) : projects.length === 0 ? (
            <div className="project-dashboard-empty">
              <span aria-hidden="true"><StageIcon name="planning" /></span>
              <strong>Nenhum projeto disponível</strong>
              <p>Cadastre um contrato para criar o primeiro projeto automaticamente.</p>
              <a className="primary-action" href="#/contratos">Ir para contratos</a>
            </div>
          ) : (
            <div className="project-portfolio-scroll">
              <div className="project-portfolio-table">
                <div className="project-portfolio-header">
                  <div>Projeto | Cliente</div>
                  <div className="project-timeline-columns" style={timelineStyle}>
                    {columns.map((column) => {
                      const current = todayIso() >= column.startIso && todayIso() <= column.endIso;
                      return <span key={column.startIso} className={current ? "current" : ""}>{column.label}</span>;
                    })}
                    {todayPosition !== null ? <i className="project-today-line" style={{ left: `${todayPosition}%` }}><span>hoje</span></i> : null}
                  </div>
                </div>

                {filteredProjects.length === 0 ? (
                  <div className="project-dashboard-empty compact">Nenhum projeto corresponde aos filtros selecionados.</div>
                ) : filteredProjects.map((project) => {
                  const stages = projectStages(project.id);
                  const actions = projectActions(project.id);
                  const responsible = getProjectResponsible(actions);
                  const progress = getProjectProgress(project, stages);
                  const dates = getProjectDates(project);
                  const remaining = daysUntil(dates.end);
                  const overdueCount = actions.filter((action) => action.status === "pending" && action.due_date < todayIso()).length;
                  const selected = selectedProjectId === project.id;
                  const expanded = expandedIds.has(project.id);
                  return (
                    <div key={project.id} className={`project-portfolio-project ${selected ? "selected" : ""}`}>
                      <div className="project-portfolio-row">
                        <button type="button" className="project-row-info" onClick={() => selectProject(project.id)}>
                          <span
                            className={`project-expand-toggle ${expanded ? "expanded" : ""}`}
                            role="button"
                            tabIndex={0}
                            aria-label={expanded ? "Recolher etapas" : "Expandir etapas"}
                            onClick={(event) => { event.stopPropagation(); toggleExpanded(project.id); }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                event.stopPropagation();
                                toggleExpanded(project.id);
                              }
                            }}
                          >›</span>
                          <span className="project-row-icon"><StageIcon name={getProjectIcon(project)} /></span>
                          <span className="project-row-copy">
                            <strong>{project.name}</strong>
                            <small>{getClientName(project)}</small>
                            <span className="project-row-meta">
                              <ProjectStatusBadge status={project.status} />
                              <span className="project-progress-track"><i style={{ width: `${progress}%` }} /></span>
                              <b>{progress}%</b>
                            </span>
                          </span>
                          <span className="project-row-aside">
                            <UserAvatar value={responsible} />
                            <small>{responsible}</small>
                            <em className={remaining !== null && remaining <= 30 ? "warning" : ""}>
                              {remaining === null ? "sem vigência" : remaining < 0 ? "vencido" : `${remaining} dias`}
                            </em>
                          </span>
                          {overdueCount ? <span className="project-overdue-count">{overdueCount} atrasada{overdueCount > 1 ? "s" : ""}</span> : null}
                        </button>
                        <div className="project-stage-layer" style={timelineStyle} onClick={() => selectProject(project.id)}>
                          {todayPosition !== null ? <i className="project-today-line" style={{ left: `${todayPosition}%` }} /> : null}
                          {stages.length === 0 ? <span className="project-no-stage-inline">Sem etapas cadastradas</span> : null}
                          {stages.map((stage, index) => {
                            const span = getColumnSpan(stage.start_date, stage.end_date, columns);
                            if (!span) return null;
                            const visualStatus = getStageVisualStatus(stage);
                            return (
                              <button
                                key={stage.id}
                                type="button"
                                className={`project-timeline-stage ${visualStatus}`}
                                style={{ gridColumn: `${span.first + 1} / ${span.last + 2}`, gridRow: index % 2 + 1 }}
                                title={`${stage.title} | ${stageVisualLabels[visualStatus]} | ${formatShortDate(stage.start_date)} a ${formatShortDate(stage.end_date)}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedProjectId(project.id);
                                  setPanelTab("stages");
                                  openStage(stage);
                                }}
                              >
                                <StageIcon name={stage.icon} /><span>{stage.title}</span>
                              </button>
                            );
                          })}
                          {actions.filter((action) => action.status === "pending").map((action) => {
                            const column = columns.findIndex((item) => action.due_date >= item.startIso && action.due_date <= item.endIso);
                            if (column < 0) return null;
                            const overdue = action.due_date < todayIso();
                            return (
                              <button
                                key={action.id}
                                type="button"
                                className={`project-action-marker ${overdue ? "overdue" : ""}`}
                                style={{ gridColumn: column + 1, gridRow: 3 }}
                                title={`${overdue ? "Atrasada: " : "Ação: "}${action.description}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedProjectId(project.id);
                                  setPanelTab("actions");
                                }}
                              >!</button>
                            );
                          })}
                        </div>
                      </div>

                      {expanded ? stages.map((stage) => {
                        const span = getColumnSpan(stage.start_date, stage.end_date, columns);
                        const visualStatus = getStageVisualStatus(stage);
                        return (
                          <div className="project-stage-subrow" key={stage.id}>
                            <button type="button" onClick={() => { setSelectedProjectId(project.id); setPanelTab("stages"); openStage(stage); }}>
                              <span><StageIcon name={stage.icon} /></span>
                              <strong>{stage.title}</strong>
                              <StageStatusBadge status={visualStatus} />
                            </button>
                            <div className="project-stage-subline" style={timelineStyle}>
                              {todayPosition !== null ? <i className="project-today-line" style={{ left: `${todayPosition}%` }} /> : null}
                              {span ? (
                                <button
                                  type="button"
                                  className={`project-timeline-stage ${visualStatus}`}
                                  style={{ gridColumn: `${span.first + 1} / ${span.last + 2}` }}
                                  onClick={() => { setSelectedProjectId(project.id); setPanelTab("stages"); openStage(stage); }}
                                >
                                  <StageIcon name={stage.icon} /><span>{stage.title}</span>
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      }) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="project-timeline-legend">
            {(["planned", "in_progress", "completed", "late", "blocked"] as StageVisualStatus[]).map((status) => (
              <span key={status} className={status}><i />{stageVisualLabels[status]}</span>
            ))}
            <span className="action"><i />Ação com prazo</span>
          </div>
        </section>
      </main>

      {selectedProject ? (
        <aside className="project-detail-drawer" aria-label={`Detalhes de ${selectedProject.name}`}>
          <div className="project-drawer-heading">
            <span className="project-row-icon"><StageIcon name={getProjectIcon(selectedProject)} /></span>
            <div><strong>{selectedProject.name}</strong><span>{getClientName(selectedProject)}</span></div>
            <ProjectStatusBadge status={selectedProject.status} />
            <button type="button" onClick={() => setSelectedProjectId("")} aria-label="Fechar detalhes"><UiIcon name="close" /></button>
          </div>
          <div className="project-drawer-tabs" role="tablist" aria-label="Informações do projeto">
            {([
              ["general", "Geral"],
              ["stages", "Etapas"],
              ["actions", "Ações"],
              ["costs", "Custos"],
            ] as [PanelTab, string][]).map(([tab, label]) => (
              <button key={tab} type="button" className={panelTab === tab ? "selected" : ""} onClick={() => setPanelTab(tab)}>{label}</button>
            ))}
          </div>
          <div className="project-drawer-body">
            {panelTab === "general" ? (
              <div className="project-drawer-section">
                <label className="project-drawer-status-field"><span>Situação do projeto</span><select value={selectedProject.status} onChange={(event) => void updateProjectStatus(event.target.value as ProjectStatus)}>{Object.entries(projectStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <dl className="project-detail-list">
                  <div><dt>Projeto</dt><dd>{selectedProject.name}</dd></div>
                  <div><dt>Cliente</dt><dd>{getClientName(selectedProject)}</dd></div>
                  <div><dt>Responsável</dt><dd>{getProjectResponsible(selectedActions)}</dd></div>
                  <div><dt>Contrato</dt><dd>{selectedContract?.title || "Sem contrato vinculado"}</dd></div>
                  <div><dt>Início</dt><dd>{formatFullDate(selectedDates.start)}</dd></div>
                  <div><dt>Término</dt><dd>{formatFullDate(selectedDates.end)}</dd></div>
                  <div><dt>Vigência restante</dt><dd className={selectedRemainingDays !== null && selectedRemainingDays <= 30 ? "warning" : ""}>{selectedRemainingDays === null ? "Não informada" : selectedRemainingDays < 0 ? "Contrato vencido" : `${selectedRemainingDays} dias`}</dd></div>
                  <div><dt>Valor contratado</dt><dd>{currencyFormatter.format(selectedRevenue)}</dd></div>
                </dl>
                {selectedContract?.drive_url ? <a className="project-drive-button" href={selectedContract.drive_url} target="_blank" rel="noreferrer"><UiIcon name="folder" /> Abrir contrato no Google Drive</a> : null}
                <div className="project-drawer-progress"><span><strong>Progresso geral</strong><b>{selectedProgress}%</b></span><i><em style={{ width: `${selectedProgress}%` }} /></i></div>
              </div>
            ) : null}

            {panelTab === "stages" ? (
              <div className="project-drawer-section">
                <div className="project-drawer-section-heading"><strong>Etapas do projeto</strong><button type="button" className="primary-action" onClick={openNewStage}>+ Adicionar etapa</button></div>
                {selectedStages.length === 0 ? <div className="project-drawer-empty"><strong>Nenhuma etapa cadastrada</strong><span>Crie uma estrutura inicial ou adicione etapas manualmente.</span><button type="button" className="secondary-action" disabled={isSaving} onClick={() => void createDefaultStages()}>{isSaving ? "Criando..." : "Criar etapas padrão"}</button></div> : selectedStages.map((stage) => {
                  const visualStatus = getStageVisualStatus(stage);
                  return <article className="project-drawer-stage" key={stage.id}><span><StageIcon name={stage.icon} /></span><div><strong>{stage.title}</strong><small>{formatShortDate(stage.start_date)} a {formatShortDate(stage.end_date)}</small></div><StageStatusBadge status={visualStatus} /><button type="button" onClick={() => openStage(stage)}>Editar</button></article>;
                })}
              </div>
            ) : null}

            {panelTab === "actions" ? (
              <div className="project-drawer-section">
                <div className="project-drawer-section-heading"><strong>Próximas ações</strong><button type="button" className="primary-action" onClick={openActionEditor}>+ Adicionar ação</button></div>
                {selectedActions.length === 0 ? <div className="project-drawer-empty"><strong>Nenhuma ação cadastrada</strong><span>Registre o próximo passo, o responsável e o prazo.</span></div> : selectedActions.map((action) => {
                  const overdue = action.status === "pending" && action.due_date < todayIso();
                  const stage = selectedStages.find((item) => item.id === action.stage_id);
                  const priority = action.priority || "medium";
                  return <article className={`project-drawer-action ${action.status} ${overdue ? "overdue" : ""}`} key={action.id}><button type="button" className="project-action-check" onClick={() => void toggleAction(action)} aria-label={action.status === "completed" ? "Reabrir ação" : "Concluir ação"}>{action.status === "completed" ? <UiIcon name="check" /> : null}</button><div><strong>{action.description}</strong><small>{action.assignee || "Sem responsável"} · {overdue ? "Atrasada: " : "Até "}{formatShortDate(action.due_date)}{stage ? ` · ${stage.title}` : ""}</small>{action.notes ? <p>{action.notes}</p> : null}</div><span className={`project-priority ${priority}`}>{priorityLabels[priority]}</span><button type="button" className="project-item-remove" onClick={() => void removeAction(action)} aria-label="Remover ação"><UiIcon name="close" /></button></article>;
                })}
              </div>
            ) : null}

            {panelTab === "costs" ? (
              <div className="project-drawer-section">
                <div className="project-drawer-finance">
                  <article><span>Receita contratada</span><strong>{currencyFormatter.format(selectedRevenue)}</strong></article>
                  <article><span>Custos previstos</span><strong>{currencyFormatter.format(selectedTotalCosts)}</strong></article>
                  <article><span>Custos pagos</span><strong>{currencyFormatter.format(selectedPaidCosts)}</strong></article>
                  <article className={selectedBalance < 0 ? "negative" : "positive"}><span>Saldo projetado</span><strong>{currencyFormatter.format(selectedBalance)}</strong><small>Margem de {selectedMargin.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</small></article>
                </div>
                <div className="project-drawer-section-heading"><strong>Custos do projeto</strong><button type="button" className="primary-action" onClick={openCostEditor}>+ Adicionar custo</button></div>
                {selectedCosts.length === 0 ? <div className="project-drawer-empty"><strong>Nenhum custo registrado</strong><span>Adicione custos para acompanhar a liquidez do projeto.</span></div> : selectedCosts.map((cost) => <article className="project-drawer-cost" key={cost.id}><div><strong>{cost.description}</strong><small>{cost.category} · {formatShortDate(cost.incurred_on)}</small></div><span className={cost.status}>{currencyFormatter.format(Number(cost.amount))}<small>{costStatusLabels[cost.status]}</small></span><button type="button" className="project-item-remove" onClick={() => void removeCost(cost)} aria-label="Remover custo"><UiIcon name="close" /></button></article>)}
              </div>
            ) : null}
          </div>
        </aside>
      ) : null}

      {stageEditor ? (
        <div className="form-modal-backdrop"><section className="form-modal project-small-modal" role="dialog" aria-modal="true" aria-labelledby="stage-modal-title"><div className="form-modal-heading"><div><p className="section-eyebrow">Cronograma</p><h2 id="stage-modal-title">{stageEditor === "new" ? "Adicionar etapa" : "Editar etapa"}</h2></div><button type="button" className="modal-close-button" onClick={() => setStageEditor(null)} aria-label="Fechar">×</button></div><form onSubmit={saveStage}><div className="field-grid"><label className="field-wide"><span>Título da etapa *</span><input required value={stageDraft.title} onChange={(event) => setStageDraft((current) => ({ ...current, title: event.target.value }))} /></label><label><span>Símbolo</span><select value={stageDraft.icon} onChange={(event) => setStageDraft((current) => ({ ...current, icon: event.target.value }))}>{iconOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label><span>Situação</span><select value={stageDraft.status} onChange={(event) => setStageDraft((current) => ({ ...current, status: event.target.value as ProjectStageStatus }))}>{Object.entries(stageStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Início *</span><input type="date" required value={stageDraft.start_date} onChange={(event) => setStageDraft((current) => ({ ...current, start_date: event.target.value }))} /></label><label><span>Fim *</span><input type="date" min={stageDraft.start_date} required value={stageDraft.end_date} onChange={(event) => setStageDraft((current) => ({ ...current, end_date: event.target.value }))} /></label></div><div className="form-modal-actions">{stageEditor !== "new" ? <button type="button" className="project-delete-button" onClick={() => void removeStage()}>Remover etapa</button> : null}<button type="button" className="secondary-action" onClick={() => setStageEditor(null)}>Cancelar</button><button type="submit" className="primary-action" disabled={isSaving}>{isSaving ? "Salvando..." : "Salvar etapa"}</button></div></form></section></div>
      ) : null}

      {actionEditorOpen ? (
        <div className="form-modal-backdrop"><section className="form-modal project-small-modal" role="dialog" aria-modal="true" aria-labelledby="action-modal-title"><div className="form-modal-heading"><div><p className="section-eyebrow">Próximo passo</p><h2 id="action-modal-title">Adicionar ação</h2></div><button type="button" className="modal-close-button" onClick={() => setActionEditorOpen(false)} aria-label="Fechar">×</button></div><form onSubmit={saveAction}><div className="field-grid"><label className="field-wide"><span>O que precisa ser feito? *</span><textarea rows={4} required value={actionDraft.description} onChange={(event) => setActionDraft((current) => ({ ...current, description: event.target.value }))} /></label><label><span>Responsável</span><input value={actionDraft.assignee} onChange={(event) => setActionDraft((current) => ({ ...current, assignee: event.target.value }))} placeholder="Nome da pessoa" /></label><label><span>Prazo *</span><input type="date" required value={actionDraft.due_date} onChange={(event) => setActionDraft((current) => ({ ...current, due_date: event.target.value }))} /></label><label><span>Etapa relacionada</span><select value={actionDraft.stage_id} onChange={(event) => setActionDraft((current) => ({ ...current, stage_id: event.target.value }))}><option value="">Sem etapa específica</option>{selectedStages.map((stage) => <option key={stage.id} value={stage.id}>{stage.title}</option>)}</select></label><label><span>Prioridade</span><select value={actionDraft.priority} onChange={(event) => setActionDraft((current) => ({ ...current, priority: event.target.value as ProjectActionPriority }))}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field-wide"><span>Observações</span><textarea rows={3} value={actionDraft.notes} onChange={(event) => setActionDraft((current) => ({ ...current, notes: event.target.value }))} /></label></div><div className="form-modal-actions"><button type="button" className="secondary-action" onClick={() => setActionEditorOpen(false)}>Cancelar</button><button type="submit" className="primary-action" disabled={isSaving}>{isSaving ? "Salvando..." : "Adicionar ação"}</button></div></form></section></div>
      ) : null}

      {costEditorOpen ? (
        <div className="form-modal-backdrop"><section className="form-modal project-small-modal" role="dialog" aria-modal="true" aria-labelledby="cost-modal-title"><div className="form-modal-heading"><div><p className="section-eyebrow">Financeiro</p><h2 id="cost-modal-title">Adicionar custo</h2></div><button type="button" className="modal-close-button" onClick={() => setCostEditorOpen(false)} aria-label="Fechar">×</button></div><form onSubmit={saveCost}><div className="field-grid"><label className="field-wide"><span>Descrição *</span><input required value={costDraft.description} onChange={(event) => setCostDraft((current) => ({ ...current, description: event.target.value }))} /></label><label><span>Categoria</span><select value={costDraft.category} onChange={(event) => setCostDraft((current) => ({ ...current, category: event.target.value }))}><option value="produção">Produção</option><option value="equipe">Equipe</option><option value="acessibilidade">Acessibilidade</option><option value="deslocamento">Deslocamento</option><option value="fornecedor">Fornecedor</option><option value="impostos">Impostos</option><option value="outros">Outros</option></select></label><label><span>Valor *</span><input type="number" min="0.01" step="0.01" required value={costDraft.amount} onChange={(event) => setCostDraft((current) => ({ ...current, amount: event.target.value }))} /></label><label><span>Data *</span><input type="date" required value={costDraft.incurred_on} onChange={(event) => setCostDraft((current) => ({ ...current, incurred_on: event.target.value }))} /></label><label><span>Situação</span><select value={costDraft.status} onChange={(event) => setCostDraft((current) => ({ ...current, status: event.target.value as ProjectCostStatus }))}><option value="planned">Previsto</option><option value="paid">Pago</option></select></label><label className="field-wide"><span>Observações</span><textarea rows={3} value={costDraft.notes} onChange={(event) => setCostDraft((current) => ({ ...current, notes: event.target.value }))} /></label></div><div className="form-modal-actions"><button type="button" className="secondary-action" onClick={() => setCostEditorOpen(false)}>Cancelar</button><button type="submit" className="primary-action" disabled={isSaving}>{isSaving ? "Salvando..." : "Adicionar custo"}</button></div></form></section></div>
      ) : null}
    </div>
  );
}
