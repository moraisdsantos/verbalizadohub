import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type {
  Client,
  Contract,
  Project,
  ProjectAction,
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
};

type CostDraft = {
  description: string;
  category: string;
  amount: string;
  incurred_on: string;
  status: ProjectCostStatus;
  notes: string;
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

const weekdayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

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

function getWeeks(start: Date, end: Date) {
  const weeks: { start: Date; end: Date }[] = [];
  let cursor = startOfWeek(start);
  const finalWeek = endOfWeek(end);
  while (cursor <= finalWeek) {
    weeks.push({ start: cursor, end: addDays(cursor, 6) });
    cursor = addDays(cursor, 7);
  }
  return weeks;
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

function getIsoWeek(date: Date) {
  const target = new Date(date);
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4, 12));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / 604800000);
}

function getContract(project: ProjectWithRelations | null) {
  if (!project?.contracts) return null;
  return Array.isArray(project.contracts) ? project.contracts[0] ?? null : project.contracts;
}

function StageIcon({ name }: { name: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "planning") {
    return <svg {...common} aria-hidden="true"><path d="M4 19V5M4 6h11l-2 4 2 4H4" /></svg>;
  }
  if (name === "accessibility") {
    return <svg {...common} aria-hidden="true"><circle cx="12" cy="4" r="2" /><path d="M5 8h14M12 8v13M8 21l4-7 4 7" /></svg>;
  }
  if (name === "production") {
    return <svg {...common} aria-hidden="true"><path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" /></svg>;
  }
  if (name === "review") {
    return <svg {...common} aria-hidden="true"><path d="M4 4h16v16H4Z" /><path d="m8 12 2.5 2.5L16 9" /></svg>;
  }
  if (name === "delivery") {
    return <svg {...common} aria-hidden="true"><path d="M3 6h12v12H3Z" /><path d="M15 10h4l2 3v5h-6M7 18a2 2 0 1 0 0 .01M17 18a2 2 0 1 0 0 .01" /></svg>;
  }
  return <svg {...common} aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>;
}

function emptyStage(project: ProjectWithRelations | null): StageDraft {
  const start = project?.start_date || getContract(project)?.effective_date || todayIso();
  const end = project?.end_date || getContract(project)?.expires_at || isoFromDate(addDays(dateFromIso(start), 7));
  return { title: "", icon: "milestone", status: "planned", start_date: start, end_date: end };
}

export default function ProjectsPage({ userEmail, onSignOut }: ProjectsPageProps) {
  const [projects, setProjects] = useState<ProjectWithRelations[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [stages, setStages] = useState<ProjectStage[]>([]);
  const [actions, setActions] = useState<ProjectAction[]>([]);
  const [costs, setCosts] = useState<ProjectCost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [viewScale, setViewScale] = useState<ViewScale>("quarter");
  const [anchorDate, setAnchorDate] = useState(todayIso);
  const [stageEditor, setStageEditor] = useState<ProjectStage | "new" | null>(null);
  const [stageDraft, setStageDraft] = useState<StageDraft>(() => emptyStage(null));
  const [actionEditorOpen, setActionEditorOpen] = useState(false);
  const [actionDraft, setActionDraft] = useState<ActionDraft>({ description: "", assignee: "", due_date: todayIso(), stage_id: "" });
  const [costEditorOpen, setCostEditorOpen] = useState(false);
  const [costDraft, setCostDraft] = useState<CostDraft>({ description: "", category: "produção", amount: "", incurred_on: todayIso(), status: "planned", notes: "" });
  const [isSaving, setIsSaving] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const contract = getContract(selectedProject);
  const period = useMemo(() => getPeriod(anchorDate, viewScale), [anchorDate, viewScale]);
  const weeks = useMemo(() => getWeeks(period.start, period.end), [period.start, period.end]);
  const periodStartIso = isoFromDate(period.start);
  const periodEndIso = isoFromDate(period.end);

  const costsInPeriod = useMemo(
    () => costs.filter((cost) => cost.incurred_on >= periodStartIso && cost.incurred_on <= periodEndIso),
    [costs, periodEndIso, periodStartIso],
  );
  const revenue = Number(contract?.total_value || 0);
  const totalCosts = costs.reduce((total, cost) => total + Number(cost.amount), 0);
  const periodCosts = costsInPeriod.reduce((total, cost) => total + Number(cost.amount), 0);
  const paidCosts = costs.filter((cost) => cost.status === "paid").reduce((total, cost) => total + Number(cost.amount), 0);
  const liquidity = revenue - totalCosts;
  const margin = revenue > 0 ? (liquidity / revenue) * 100 : 0;

  const loadProjects = useCallback(async () => {
    if (!supabase) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("projects")
      .select("*, clients(legal_name,trade_name), contracts(id,title,status,drive_url,total_value,effective_date,expires_at)")
      .order("created_at", { ascending: false });
    if (error) {
      setMessage(`Não foi possível carregar os projetos: ${error.message}`);
      setIsLoading(false);
      return;
    }
    const loaded = (data ?? []) as unknown as ProjectWithRelations[];
    setProjects(loaded);
    setSelectedProjectId((current) => loaded.some((project) => project.id === current) ? current : loaded[0]?.id || "");
    setIsLoading(false);
  }, []);

  const loadProjectDetails = useCallback(async (projectId: string) => {
    if (!supabase || !projectId) {
      setStages([]);
      setActions([]);
      setCosts([]);
      return;
    }
    const [stagesResult, actionsResult, costsResult] = await Promise.all([
      supabase.from("project_stages").select("*").eq("project_id", projectId).order("position").order("start_date"),
      supabase.from("project_actions").select("*").eq("project_id", projectId).order("due_date"),
      supabase.from("project_costs").select("*").eq("project_id", projectId).order("incurred_on", { ascending: false }),
    ]);
    const error = stagesResult.error || actionsResult.error || costsResult.error;
    if (error) {
      setMessage(`Não foi possível carregar os dados do projeto: ${error.message}`);
      return;
    }
    setStages((stagesResult.data ?? []) as ProjectStage[]);
    setActions((actionsResult.data ?? []) as ProjectAction[]);
    setCosts((costsResult.data ?? []) as ProjectCost[]);
  }, []);

  useEffect(() => { void loadProjects(); }, [loadProjects]);
  useEffect(() => { void loadProjectDetails(selectedProjectId); }, [loadProjectDetails, selectedProjectId]);
  useEffect(() => {
    if (!selectedProject) return;
    const start = selectedProject.start_date || contract?.effective_date;
    if (start) setAnchorDate(start);
  }, [contract?.effective_date, selectedProject?.id, selectedProject?.start_date]);

  function movePeriod(direction: -1 | 1) {
    const date = dateFromIso(anchorDate);
    const months = viewScale === "month" ? 1 : viewScale === "quarter" ? 3 : 12;
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + direction * months);
    setAnchorDate(isoFromDate(date));
  }

  async function updateProjectStatus(status: ProjectStatus) {
    if (!supabase || !selectedProject) return;
    const { error } = await supabase.from("projects").update({ status }).eq("id", selectedProject.id);
    if (error) {
      setMessage(`Não foi possível alterar o status: ${error.message}`);
      return;
    }
    setProjects((current) => current.map((project) => project.id === selectedProject.id ? { ...project, status } : project));
    setMessage("Status do projeto atualizado.");
  }

  function openNewStage() {
    setStageDraft(emptyStage(selectedProject));
    setStageEditor("new");
  }

  function openStage(stage: ProjectStage) {
    setStageDraft({ title: stage.title, icon: stage.icon, status: stage.status, start_date: stage.start_date, end_date: stage.end_date });
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
      position: stageEditor === "new" ? stages.length : stageEditor.position,
    };
    const result = stageEditor === "new"
      ? await supabase.from("project_stages").insert(payload)
      : await supabase.from("project_stages").update(payload).eq("id", stageEditor.id);
    if (result.error) setMessage(`Não foi possível salvar a etapa: ${result.error.message}`);
    else {
      setStageEditor(null);
      setMessage(stageEditor === "new" ? "Etapa criada." : "Etapa atualizada.");
      await loadProjectDetails(selectedProject.id);
    }
    setIsSaving(false);
  }

  async function removeStage() {
    if (!supabase || !selectedProject || !stageEditor || stageEditor === "new") return;
    if (!window.confirm(`Remover a etapa “${stageEditor.title}”?`)) return;
    const { error } = await supabase.from("project_stages").delete().eq("id", stageEditor.id);
    if (error) setMessage(`Não foi possível remover a etapa: ${error.message}`);
    else {
      setStageEditor(null);
      setMessage("Etapa removida.");
      await loadProjectDetails(selectedProject.id);
    }
  }

  async function createDefaultStages() {
    if (!supabase || !selectedProject || stages.length) return;
    setIsSaving(true);
    const startIso = selectedProject.start_date || contract?.effective_date || todayIso();
    const start = dateFromIso(startIso);
    const requestedEnd = selectedProject.end_date || contract?.expires_at;
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
      setMessage("Etapas padrão criadas. Abra cada barra para ajustar datas e status.");
      await loadProjectDetails(selectedProject.id);
    }
    setIsSaving(false);
  }

  function openActionEditor() {
    setActionDraft({ description: "", assignee: "", due_date: todayIso(), stage_id: "" });
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
    });
    if (error) setMessage(`Não foi possível adicionar a ação: ${error.message}`);
    else {
      setActionEditorOpen(false);
      setMessage("Ação adicionada ao projeto.");
      await loadProjectDetails(selectedProject.id);
    }
    setIsSaving(false);
  }

  async function toggleAction(action: ProjectAction) {
    if (!supabase || !selectedProject) return;
    const completed = action.status !== "completed";
    const { error } = await supabase.from("project_actions").update({
      status: completed ? "completed" : "pending",
      completed_at: completed ? new Date().toISOString() : null,
    }).eq("id", action.id);
    if (error) setMessage(`Não foi possível atualizar a ação: ${error.message}`);
    else await loadProjectDetails(selectedProject.id);
  }

  async function removeAction(action: ProjectAction) {
    if (!supabase || !selectedProject) return;
    const { error } = await supabase.from("project_actions").delete().eq("id", action.id);
    if (error) setMessage(`Não foi possível remover a ação: ${error.message}`);
    else await loadProjectDetails(selectedProject.id);
  }

  function openCostEditor() {
    setCostDraft({ description: "", category: "produção", amount: "", incurred_on: todayIso(), status: "planned", notes: "" });
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
      await loadProjectDetails(selectedProject.id);
    }
    setIsSaving(false);
  }

  async function removeCost(cost: ProjectCost) {
    if (!supabase || !selectedProject) return;
    if (!window.confirm(`Remover o custo “${cost.description}”?`)) return;
    const { error } = await supabase.from("project_costs").delete().eq("id", cost.id);
    if (error) setMessage(`Não foi possível remover o custo: ${error.message}`);
    else await loadProjectDetails(selectedProject.id);
  }

  return (
    <div className="projects-page">
      <header className="module-page-header projects-header">
        <div>
          <a className="back-to-hub" href="#/"><span aria-hidden="true">←</span>Voltar ao hub</a>
          <p className="brand-kicker">Operação integrada</p>
          <h1>Visão de projetos</h1>
          <p>Acompanhe etapas, próximos passos, vigência contratual e resultado financeiro em uma única linha do tempo.</p>
        </div>
        <div className="account-box"><span>{userEmail}</span><button type="button" onClick={onSignOut}>Sair</button></div>
      </header>

      <section className="project-selector-bar">
        <label>
          <span>Projeto em foco</span>
          <select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)} disabled={isLoading}>
            {projects.length === 0 ? <option value="">Nenhum projeto cadastrado</option> : null}
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name} — {project.clients?.trade_name || project.clients?.legal_name}</option>)}
          </select>
        </label>
        {selectedProject ? (
          <label className="project-status-field">
            <span>Status do projeto</span>
            <select value={selectedProject.status} onChange={(event) => void updateProjectStatus(event.target.value as ProjectStatus)}>
              {Object.entries(projectStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        ) : null}
      </section>

      <p className="module-message projects-message" role="status" aria-live="polite">{message}</p>

      {!isLoading && !selectedProject ? (
        <section className="project-no-data">
          <span aria-hidden="true"><StageIcon name="planning" /></span>
          <h2>Nenhum projeto disponível</h2>
          <p>Cadastre um contrato para gerar o primeiro projeto automaticamente.</p>
          <a className="primary-action" href="#/contratos">Ir para contratos</a>
        </section>
      ) : null}

      {selectedProject ? (
        <>
          <section className="project-overview-card">
            <div className="project-overview-main">
              <p className="section-eyebrow">Projeto selecionado</p>
              <h2>{selectedProject.name}</h2>
              <p>{selectedProject.clients?.trade_name || selectedProject.clients?.legal_name}</p>
            </div>
            <dl className="project-contract-facts">
              <div><dt>Contrato</dt><dd>{contract?.title || "Sem contrato vinculado"}</dd></div>
              <div><dt>Vigência</dt><dd>{formatShortDate(contract?.effective_date || selectedProject.start_date)} a {formatShortDate(contract?.expires_at || selectedProject.end_date)}</dd></div>
              <div><dt>Situação</dt><dd>{projectStatusLabels[selectedProject.status]}</dd></div>
            </dl>
            {contract?.drive_url ? <a className="contract-drive-link" href={contract.drive_url} target="_blank" rel="noreferrer">Abrir contrato no Drive ↗</a> : null}
          </section>

          <section className="project-finance-grid" aria-label="Resumo financeiro">
            <article><span>Valor contratado</span><strong>{currencyFormatter.format(revenue)}</strong><small>Receita prevista do contrato</small></article>
            <article><span>Custos no período</span><strong>{currencyFormatter.format(periodCosts)}</strong><small>{currencyFormatter.format(paidCosts)} já pagos no projeto</small></article>
            <article className={liquidity < 0 ? "negative" : "positive"}><span>Saldo projetado</span><strong>{currencyFormatter.format(liquidity)}</strong><small>Margem estimada de {margin.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</small></article>
            <article><span>Custos totais</span><strong>{currencyFormatter.format(totalCosts)}</strong><small>Pagos e previstos</small></article>
          </section>

          <section className="project-calendar-card">
            <div className="project-calendar-toolbar">
              <div>
                <p className="section-eyebrow">Cronograma semanal</p>
                <h2>{period.label}</h2>
              </div>
              <div className="calendar-controls">
                <div className="period-navigation">
                  <button type="button" onClick={() => movePeriod(-1)} aria-label="Período anterior">←</button>
                  <button type="button" onClick={() => setAnchorDate(todayIso())}>Hoje</button>
                  <button type="button" onClick={() => movePeriod(1)} aria-label="Próximo período">→</button>
                </div>
                <div className="view-scale-switch" aria-label="Escala da visualização">
                  {(["month", "quarter", "year"] as ViewScale[]).map((scale) => <button key={scale} type="button" className={viewScale === scale ? "selected" : ""} onClick={() => setViewScale(scale)}>{scale === "month" ? "Mês" : scale === "quarter" ? "Trimestre" : "Ano"}</button>)}
                </div>
                <button type="button" className="primary-action" onClick={openNewStage}>+ Adicionar etapa</button>
              </div>
            </div>

            {stages.length === 0 ? (
              <div className="timeline-empty-state">
                <strong>O projeto ainda não tem etapas.</strong>
                <span>Use uma estrutura inicial ou crie as etapas manualmente.</span>
                <div><button type="button" className="primary-action" disabled={isSaving} onClick={() => void createDefaultStages()}>{isSaving ? "Criando…" : "Criar etapas padrão"}</button><button type="button" className="secondary-action" onClick={openNewStage}>Criar manualmente</button></div>
              </div>
            ) : (
              <div className="weekly-calendar">
                <div className="calendar-day-heading"><span />{weekdayLabels.map((day) => <strong key={day}>{day}</strong>)}</div>
                {weeks.map((week) => {
                  const weekStartIso = isoFromDate(week.start);
                  const weekEndIso = isoFromDate(week.end);
                  const weekStages = stages.filter((stage) => stage.start_date <= weekEndIso && stage.end_date >= weekStartIso);
                  const weekActions = actions.filter((action) => action.status === "pending" && action.due_date >= weekStartIso && action.due_date <= weekEndIso);
                  const today = todayIso();
                  const current = today >= weekStartIso && today <= weekEndIso;
                  return (
                    <div key={weekStartIso} className={`project-week-row ${current ? "current" : ""}`}>
                      <div className="project-week-label"><strong>Semana {getIsoWeek(week.start)}</strong><span>{formatShortDate(week.start)} — {formatShortDate(week.end)}</span></div>
                      <div className="project-week-grid">
                        {Array.from({ length: 7 }, (_, index) => {
                          const day = addDays(week.start, index);
                          return <span key={index} className={`week-day-number ${isoFromDate(day) === today ? "today" : ""}`} style={{ gridColumn: index + 1, gridRow: 1 }}>{day.getUTCDate()}</span>;
                        })}
                        {weekStages.map((stage, index) => {
                          const segmentStart = stage.start_date < weekStartIso ? weekStartIso : stage.start_date;
                          const segmentEnd = stage.end_date > weekEndIso ? weekEndIso : stage.end_date;
                          const startColumn = Math.round((dateFromIso(segmentStart).getTime() - week.start.getTime()) / 86400000) + 1;
                          const span = Math.round((dateFromIso(segmentEnd).getTime() - dateFromIso(segmentStart).getTime()) / 86400000) + 1;
                          return (
                            <button key={stage.id} type="button" className={`stage-segment ${stage.status}`} style={{ gridColumn: `${startColumn} / span ${span}`, gridRow: index + 2 }} onClick={() => openStage(stage)} title={`${stage.title}: ${stageStatusLabels[stage.status]}`}>
                              <StageIcon name={stage.icon} /><span>{stage.title}</span>
                            </button>
                          );
                        })}
                        {weekActions.map((action, index) => {
                          const column = Math.round((dateFromIso(action.due_date).getTime() - week.start.getTime()) / 86400000) + 1;
                          return <button key={action.id} type="button" className="week-action-marker" style={{ gridColumn: `${column} / span 1`, gridRow: weekStages.length + index + 2 }} onClick={() => void toggleAction(action)} title="Marcar ação como concluída"><span>!</span>{action.description}</button>;
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="timeline-legend">
              {Object.entries(stageStatusLabels).map(([status, label]) => <span key={status} className={status}><i />{label}</span>)}
              <span className="action"><i />Ação com prazo</span>
            </div>
          </section>

          <div className="project-bottom-grid">
            <section className="project-actions-card">
              <div className="project-panel-heading"><div><p className="section-eyebrow">Próximos passos</p><h2>Ações</h2></div><button type="button" className="primary-action" onClick={openActionEditor}>+ Adicionar ação</button></div>
              {actions.length === 0 ? <p className="project-panel-empty">Nenhuma ação cadastrada.</p> : (
                <ul className="project-actions-list">
                  {actions.map((action) => {
                    const overdue = action.status === "pending" && action.due_date < todayIso();
                    const stage = stages.find((item) => item.id === action.stage_id);
                    return <li key={action.id} className={`${action.status} ${overdue ? "overdue" : ""}`}><button type="button" className="action-check" onClick={() => void toggleAction(action)} aria-label={action.status === "completed" ? "Reabrir ação" : "Concluir ação"}>{action.status === "completed" ? "✓" : ""}</button><div><strong>{action.description}</strong><span>{stage ? `${stage.title} · ` : ""}{action.assignee ? `${action.assignee} · ` : ""}{overdue ? "Atrasada: " : "Até "}{formatShortDate(action.due_date)}</span></div><button type="button" className="project-row-remove" onClick={() => void removeAction(action)} aria-label="Remover ação">×</button></li>;
                  })}
                </ul>
              )}
            </section>

            <section className="project-costs-card">
              <div className="project-panel-heading"><div><p className="section-eyebrow">Liquidez</p><h2>Custos do período</h2></div><button type="button" className="primary-action" onClick={openCostEditor}>+ Adicionar custo</button></div>
              {costsInPeriod.length === 0 ? <p className="project-panel-empty">Nenhum custo em {period.label.toLocaleLowerCase("pt-BR")}.</p> : (
                <div className="project-cost-table-wrap"><table className="project-cost-table"><thead><tr><th>Descrição</th><th>Data</th><th>Status</th><th>Valor</th><th /></tr></thead><tbody>{costsInPeriod.map((cost) => <tr key={cost.id}><td><strong>{cost.description}</strong><span>{cost.category}</span></td><td>{formatShortDate(cost.incurred_on)}</td><td><span className={`cost-status ${cost.status}`}>{costStatusLabels[cost.status]}</span></td><td>{currencyFormatter.format(Number(cost.amount))}</td><td><button type="button" onClick={() => void removeCost(cost)} aria-label="Remover custo">×</button></td></tr>)}</tbody></table></div>
              )}
            </section>
          </div>
        </>
      ) : null}

      {stageEditor ? (
        <div className="form-modal-backdrop"><section className="form-modal project-small-modal" role="dialog" aria-modal="true" aria-labelledby="stage-modal-title"><div className="form-modal-heading"><div><p className="section-eyebrow">Cronograma</p><h2 id="stage-modal-title">{stageEditor === "new" ? "Adicionar etapa" : "Editar etapa"}</h2></div><button type="button" className="modal-close-button" onClick={() => setStageEditor(null)} aria-label="Fechar">×</button></div><form onSubmit={saveStage}><div className="field-grid"><label className="field-wide"><span>Título da etapa *</span><input required value={stageDraft.title} onChange={(event) => setStageDraft((current) => ({ ...current, title: event.target.value }))} /></label><label><span>Símbolo</span><select value={stageDraft.icon} onChange={(event) => setStageDraft((current) => ({ ...current, icon: event.target.value }))}>{iconOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label><span>Status</span><select value={stageDraft.status} onChange={(event) => setStageDraft((current) => ({ ...current, status: event.target.value as ProjectStageStatus }))}>{Object.entries(stageStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Início *</span><input type="date" required value={stageDraft.start_date} onChange={(event) => setStageDraft((current) => ({ ...current, start_date: event.target.value }))} /></label><label><span>Fim *</span><input type="date" min={stageDraft.start_date} required value={stageDraft.end_date} onChange={(event) => setStageDraft((current) => ({ ...current, end_date: event.target.value }))} /></label></div><div className="form-modal-actions">{stageEditor !== "new" ? <button type="button" className="project-delete-button" onClick={() => void removeStage()}>Remover etapa</button> : null}<button type="button" className="secondary-action" onClick={() => setStageEditor(null)}>Cancelar</button><button type="submit" className="primary-action" disabled={isSaving}>{isSaving ? "Salvando…" : "Salvar etapa"}</button></div></form></section></div>
      ) : null}

      {actionEditorOpen ? (
        <div className="form-modal-backdrop"><section className="form-modal project-small-modal" role="dialog" aria-modal="true" aria-labelledby="action-modal-title"><div className="form-modal-heading"><div><p className="section-eyebrow">Próximo passo</p><h2 id="action-modal-title">Adicionar ação</h2></div><button type="button" className="modal-close-button" onClick={() => setActionEditorOpen(false)} aria-label="Fechar">×</button></div><form onSubmit={saveAction}><div className="field-grid"><label className="field-wide"><span>O que precisa ser feito? *</span><textarea rows={4} required value={actionDraft.description} onChange={(event) => setActionDraft((current) => ({ ...current, description: event.target.value }))} /></label><label><span>Responsável</span><input value={actionDraft.assignee} onChange={(event) => setActionDraft((current) => ({ ...current, assignee: event.target.value }))} placeholder="Nome da pessoa" /></label><label><span>Prazo *</span><input type="date" required value={actionDraft.due_date} onChange={(event) => setActionDraft((current) => ({ ...current, due_date: event.target.value }))} /></label><label className="field-wide"><span>Etapa relacionada</span><select value={actionDraft.stage_id} onChange={(event) => setActionDraft((current) => ({ ...current, stage_id: event.target.value }))}><option value="">Sem etapa específica</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.title}</option>)}</select></label></div><div className="form-modal-actions"><button type="button" className="secondary-action" onClick={() => setActionEditorOpen(false)}>Cancelar</button><button type="submit" className="primary-action" disabled={isSaving}>{isSaving ? "Salvando…" : "Adicionar ação"}</button></div></form></section></div>
      ) : null}

      {costEditorOpen ? (
        <div className="form-modal-backdrop"><section className="form-modal project-small-modal" role="dialog" aria-modal="true" aria-labelledby="cost-modal-title"><div className="form-modal-heading"><div><p className="section-eyebrow">Financeiro</p><h2 id="cost-modal-title">Adicionar custo</h2></div><button type="button" className="modal-close-button" onClick={() => setCostEditorOpen(false)} aria-label="Fechar">×</button></div><form onSubmit={saveCost}><div className="field-grid"><label className="field-wide"><span>Descrição *</span><input required value={costDraft.description} onChange={(event) => setCostDraft((current) => ({ ...current, description: event.target.value }))} /></label><label><span>Categoria</span><select value={costDraft.category} onChange={(event) => setCostDraft((current) => ({ ...current, category: event.target.value }))}><option value="produção">Produção</option><option value="equipe">Equipe</option><option value="acessibilidade">Acessibilidade</option><option value="deslocamento">Deslocamento</option><option value="fornecedor">Fornecedor</option><option value="impostos">Impostos</option><option value="outros">Outros</option></select></label><label><span>Valor *</span><input type="number" min="0.01" step="0.01" required value={costDraft.amount} onChange={(event) => setCostDraft((current) => ({ ...current, amount: event.target.value }))} /></label><label><span>Data *</span><input type="date" required value={costDraft.incurred_on} onChange={(event) => setCostDraft((current) => ({ ...current, incurred_on: event.target.value }))} /></label><label><span>Status</span><select value={costDraft.status} onChange={(event) => setCostDraft((current) => ({ ...current, status: event.target.value as ProjectCostStatus }))}><option value="planned">Previsto</option><option value="paid">Pago</option></select></label><label className="field-wide"><span>Observações</span><textarea rows={3} value={costDraft.notes} onChange={(event) => setCostDraft((current) => ({ ...current, notes: event.target.value }))} /></label></div><div className="form-modal-actions"><button type="button" className="secondary-action" onClick={() => setCostEditorOpen(false)}>Cancelar</button><button type="submit" className="primary-action" disabled={isSaving}>{isSaving ? "Salvando…" : "Adicionar custo"}</button></div></form></section></div>
      ) : null}
    </div>
  );
}
