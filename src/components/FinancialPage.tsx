import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ensureActiveSession, isExpiredJwtError, supabase } from "../lib/supabase";
import type {
  Client,
  Contract,
  Project,
  ProjectCost,
  ProjectTimeEntry,
  ProjectTimeEntryType,
} from "../types";

type FinancialPageProps = {
  userEmail: string;
  onSignOut: () => void;
};

type FinanceProject = Pick<Project, "id" | "name">;

type FinanceContract = Pick<
  Contract,
  | "id"
  | "project_id"
  | "title"
  | "status"
  | "total_value"
  | "effective_date"
  | "signed_at"
  | "created_at"
> & {
  projects: FinanceProject | FinanceProject[] | null;
  clients:
    | Pick<Client, "legal_name" | "trade_name" | "city" | "state">
    | Pick<Client, "legal_name" | "trade_name" | "city" | "state">[]
    | null;
};

type PeriodMode = "quarter" | "year";
type FinanceTab = "overview" | "quarters" | "work" | "regions" | "ai";

type PeriodMetrics = {
  revenue: number;
  pipeline: number;
  paidProjectCosts: number;
  plannedProjectCosts: number;
  actualLaborCost: number;
  plannedLaborCost: number;
  actualHours: number;
  plannedHours: number;
  contractCount: number;
  pipelineCount: number;
  actualCosts: number;
  plannedCosts: number;
  result: number;
  forecastResult: number;
  margin: number;
  averageTicket: number;
};

type QuarterMetrics = PeriodMetrics & { key: string; label: string };

type RegionMetrics = {
  key: string;
  label: string;
  macroRegion: string;
  revenue: number;
  pipeline: number;
  costs: number;
  plannedCosts: number;
  profit: number;
  margin: number;
  contractCount: number;
};

type TimeDraft = {
  project_id: string;
  professional_name: string;
  role: string;
  entry_date: string;
  hours: string;
  hourly_rate: string;
  entry_type: ProjectTimeEntryType;
  notes: string;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const decimalCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

const confirmedStatuses = new Set(["signed", "active", "expired"]);
const pipelineStatuses = new Set(["draft", "review"]);

const stateData: Record<string, { name: string; region: string }> = {
  AC: { name: "Acre", region: "Norte" },
  AL: { name: "Alagoas", region: "Nordeste" },
  AP: { name: "Amapá", region: "Norte" },
  AM: { name: "Amazonas", region: "Norte" },
  BA: { name: "Bahia", region: "Nordeste" },
  CE: { name: "Ceará", region: "Nordeste" },
  DF: { name: "Distrito Federal", region: "Centro-Oeste" },
  ES: { name: "Espírito Santo", region: "Sudeste" },
  GO: { name: "Goiás", region: "Centro-Oeste" },
  MA: { name: "Maranhão", region: "Nordeste" },
  MT: { name: "Mato Grosso", region: "Centro-Oeste" },
  MS: { name: "Mato Grosso do Sul", region: "Centro-Oeste" },
  MG: { name: "Minas Gerais", region: "Sudeste" },
  PA: { name: "Pará", region: "Norte" },
  PB: { name: "Paraíba", region: "Nordeste" },
  PR: { name: "Paraná", region: "Sul" },
  PE: { name: "Pernambuco", region: "Nordeste" },
  PI: { name: "Piauí", region: "Nordeste" },
  RJ: { name: "Rio de Janeiro", region: "Sudeste" },
  RN: { name: "Rio Grande do Norte", region: "Nordeste" },
  RS: { name: "Rio Grande do Sul", region: "Sul" },
  RO: { name: "Rondônia", region: "Norte" },
  RR: { name: "Roraima", region: "Norte" },
  SC: { name: "Santa Catarina", region: "Sul" },
  SP: { name: "São Paulo", region: "Sudeste" },
  SE: { name: "Sergipe", region: "Nordeste" },
  TO: { name: "Tocantins", region: "Norte" },
};

function normalize(value: string | null | undefined) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function getRelation<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function quarterKeyFromDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  const year = date.getUTCFullYear();
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `${year}-Q${quarter}`;
}

function currentQuarterKey() {
  return quarterKeyFromDate(todayIso());
}

function shiftQuarter(key: string, amount: number) {
  const [yearPart, quarterPart] = key.split("-Q");
  const date = new Date(Date.UTC(Number(yearPart), (Number(quarterPart) - 1) * 3 + amount * 3, 1, 12));
  return `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;
}

function quarterLabel(key: string) {
  const [year, quarter] = key.split("-Q");
  return `${quarter}º tri ${year}`;
}

function yearFromQuarter(key: string) {
  return Number(key.slice(0, 4));
}

function contractDate(contract: FinanceContract) {
  return contract.effective_date || contract.signed_at || contract.created_at.slice(0, 10);
}

function periodMatches(date: string, mode: PeriodMode, quarter: string, year: number) {
  if (mode === "quarter") return quarterKeyFromDate(date) === quarter;
  return Number(date.slice(0, 4)) === year;
}

function emptyMetrics(): PeriodMetrics {
  return {
    revenue: 0,
    pipeline: 0,
    paidProjectCosts: 0,
    plannedProjectCosts: 0,
    actualLaborCost: 0,
    plannedLaborCost: 0,
    actualHours: 0,
    plannedHours: 0,
    contractCount: 0,
    pipelineCount: 0,
    actualCosts: 0,
    plannedCosts: 0,
    result: 0,
    forecastResult: 0,
    margin: 0,
    averageTicket: 0,
  };
}

function finalizeMetrics(metrics: PeriodMetrics) {
  metrics.actualCosts = metrics.paidProjectCosts + metrics.actualLaborCost;
  metrics.plannedCosts = metrics.plannedProjectCosts + metrics.plannedLaborCost;
  metrics.result = metrics.revenue - metrics.actualCosts;
  metrics.forecastResult = metrics.revenue + metrics.pipeline - metrics.actualCosts - metrics.plannedCosts;
  metrics.margin = metrics.revenue > 0 ? (metrics.result / metrics.revenue) * 100 : 0;
  metrics.averageTicket = metrics.contractCount > 0 ? metrics.revenue / metrics.contractCount : 0;
  return metrics;
}

function percentageChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function changeText(change: number | null) {
  if (change === null) return "sem base comparável";
  if (Math.abs(change) < 0.05) return "estável";
  return `${change > 0 ? "+" : ""}${numberFormatter.format(change)}%`;
}

function resolveState(value: string | null) {
  const normalized = normalize(value);
  const abbreviation = Object.keys(stateData).find((key) => normalize(key) === normalized);
  const byName = Object.entries(stateData).find(([, data]) => normalize(data.name) === normalized)?.[0];
  const key = abbreviation || byName;
  if (!key) return { key: "NA", label: "Local não informado", macroRegion: "Sem região" };
  return { key, label: `${key} · ${stateData[key].name}`, macroRegion: stateData[key].region };
}

async function functionErrorMessage(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    try {
      const details = (await error.context.json()) as { error?: string };
      return details.error || "A função financeira recusou a solicitação.";
    } catch {
      return "A função financeira retornou um erro.";
    }
  }
  if (error instanceof FunctionsFetchError) return "O navegador não conseguiu conectar à função finance-insights.";
  if (error instanceof FunctionsRelayError) return "O Supabase não conseguiu iniciar a função finance-insights.";
  return error instanceof Error ? error.message : "Não foi possível gerar a análise.";
}

function FinanceIcon({ name }: { name: "growth" | "cost" | "profit" | "margin" | "time" | "region" | "ai" }) {
  const props = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "growth") return <svg {...props} aria-hidden="true"><path d="M3 3v18h18" /><path d="m7 16 4-5 3 3 6-8" /><path d="M16 6h4v4" /></svg>;
  if (name === "cost") return <svg {...props} aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M16 8h-5a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H8M12 6v12" /></svg>;
  if (name === "profit") return <svg {...props} aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19V3" /></svg>;
  if (name === "margin") return <svg {...props} aria-hidden="true"><path d="m5 19 14-14M7 7h.01M17 17h.01" /><circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /></svg>;
  if (name === "time") return <svg {...props} aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  if (name === "region") return <svg {...props} aria-hidden="true"><path d="M12 21s7-5 7-12a7 7 0 1 0-14 0c0 7 7 12 7 12Z" /><circle cx="12" cy="9" r="2" /></svg>;
  return <svg {...props} aria-hidden="true"><path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z" /></svg>;
}

export default function FinancialPage({ userEmail, onSignOut }: FinancialPageProps) {
  const [contracts, setContracts] = useState<FinanceContract[]>([]);
  const [projects, setProjects] = useState<FinanceProject[]>([]);
  const [costs, setCosts] = useState<ProjectCost[]>([]);
  const [timeEntries, setTimeEntries] = useState<ProjectTimeEntry[]>([]);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("quarter");
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarterKey);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [tab, setTab] = useState<FinanceTab>("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [timeModalOpen, setTimeModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [timeDraft, setTimeDraft] = useState<TimeDraft>({
    project_id: "",
    professional_name: "",
    role: "",
    entry_date: todayIso(),
    hours: "",
    hourly_rate: "",
    entry_type: "actual",
    notes: "",
  });

  const loadData = useCallback(async () => {
    const client = supabase;
    if (!client) return;
    setIsLoading(true);
    const session = await ensureActiveSession();
    if (!session) {
      setMessage("Sua sessão expirou. Entre novamente para consultar os dados financeiros.");
      setIsLoading(false);
      return;
    }

    const runQueries = () => Promise.all([
      client
        .from("contracts")
        .select("id,project_id,title,status,total_value,effective_date,signed_at,created_at,projects(id,name),clients(legal_name,trade_name,city,state)"),
      client.from("projects").select("id,name").order("name"),
      client.from("project_costs").select("*").order("incurred_on", { ascending: false }),
      client.from("project_time_entries").select("*").order("entry_date", { ascending: false }),
    ]);

    let [contractsResult, projectsResult, costsResult, timeResult] = await runQueries();
    let error = contractsResult.error || projectsResult.error || costsResult.error || timeResult.error;
    if (isExpiredJwtError(error)) {
      const refreshed = await ensureActiveSession(true);
      if (refreshed) {
        [contractsResult, projectsResult, costsResult, timeResult] = await runQueries();
        error = contractsResult.error || projectsResult.error || costsResult.error || timeResult.error;
      }
    }

    if (error) {
      setMessage(`Não foi possível carregar a visão financeira: ${error.message}`);
      setIsLoading(false);
      return;
    }

    setContracts((contractsResult.data ?? []) as unknown as FinanceContract[]);
    setProjects((projectsResult.data ?? []) as FinanceProject[]);
    setCosts((costsResult.data ?? []) as ProjectCost[]);
    setTimeEntries((timeResult.data ?? []) as ProjectTimeEntry[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const quarterKeys = useMemo(() => {
    const keys = new Set<string>();
    const current = currentQuarterKey();
    for (let offset = -11; offset <= 4; offset += 1) keys.add(shiftQuarter(current, offset));
    contracts.forEach((contract) => keys.add(quarterKeyFromDate(contractDate(contract))));
    costs.forEach((cost) => keys.add(quarterKeyFromDate(cost.incurred_on)));
    timeEntries.forEach((entry) => keys.add(quarterKeyFromDate(entry.entry_date)));
    return [...keys].sort().reverse();
  }, [contracts, costs, timeEntries]);

  const yearOptions = useMemo(
    () => [...new Set(quarterKeys.map(yearFromQuarter))].sort((a, b) => b - a),
    [quarterKeys],
  );

  const calculateMetrics = useCallback((mode: PeriodMode, quarter: string, year: number) => {
    const metrics = emptyMetrics();
    contracts.forEach((contract) => {
      const date = contractDate(contract);
      if (!periodMatches(date, mode, quarter, year)) return;
      const value = Number(contract.total_value || 0);
      if (confirmedStatuses.has(contract.status)) {
        metrics.revenue += value;
        metrics.contractCount += 1;
      } else if (pipelineStatuses.has(contract.status)) {
        metrics.pipeline += value;
        metrics.pipelineCount += 1;
      }
    });
    costs.forEach((cost) => {
      if (!periodMatches(cost.incurred_on, mode, quarter, year)) return;
      if (cost.status === "paid") metrics.paidProjectCosts += Number(cost.amount);
      else metrics.plannedProjectCosts += Number(cost.amount);
    });
    timeEntries.forEach((entry) => {
      if (!periodMatches(entry.entry_date, mode, quarter, year)) return;
      const hours = Number(entry.hours);
      const remuneration = hours * Number(entry.hourly_rate);
      if (entry.entry_type === "actual") {
        metrics.actualHours += hours;
        metrics.actualLaborCost += remuneration;
      } else {
        metrics.plannedHours += hours;
        metrics.plannedLaborCost += remuneration;
      }
    });
    return finalizeMetrics(metrics);
  }, [contracts, costs, timeEntries]);

  const selectedMetrics = useMemo(
    () => calculateMetrics(periodMode, selectedQuarter, selectedYear),
    [calculateMetrics, periodMode, selectedQuarter, selectedYear],
  );

  const previousMetrics = useMemo(() => {
    if (periodMode === "quarter") return calculateMetrics("quarter", shiftQuarter(selectedQuarter, -1), selectedYear);
    return calculateMetrics("year", selectedQuarter, selectedYear - 1);
  }, [calculateMetrics, periodMode, selectedQuarter, selectedYear]);

  const trendMetrics = useMemo(() => {
    const anchor = periodMode === "quarter" ? selectedQuarter : `${selectedYear}-Q4`;
    return Array.from({ length: 8 }, (_, index) => shiftQuarter(anchor, index - 7)).map((key) => ({
      key,
      label: quarterLabel(key),
      ...calculateMetrics("quarter", key, yearFromQuarter(key)),
    }));
  }, [calculateMetrics, periodMode, selectedQuarter, selectedYear]);

  const allQuarterMetrics = useMemo<QuarterMetrics[]>(
    () => quarterKeys.map((key) => ({ key, label: quarterLabel(key), ...calculateMetrics("quarter", key, yearFromQuarter(key)) })),
    [calculateMetrics, quarterKeys],
  );

  const periodLabel = periodMode === "quarter" ? quarterLabel(selectedQuarter) : `Ano de ${selectedYear}`;
  const revenueGrowth = percentageChange(selectedMetrics.revenue, previousMetrics.revenue);
  const costGrowth = percentageChange(selectedMetrics.actualCosts, previousMetrics.actualCosts);
  const resultGrowth = percentageChange(selectedMetrics.result, previousMetrics.result);
  const maxTrendValue = Math.max(1, ...trendMetrics.flatMap((item) => [item.revenue, item.actualCosts, Math.max(0, item.result)]));

  const health = useMemo(() => {
    if (selectedMetrics.revenue === 0 && selectedMetrics.actualCosts > 0) return { label: "Crítica", className: "critical", text: "Há custos realizados sem receita confirmada no período." };
    if (selectedMetrics.margin >= 25 && (revenueGrowth === null || revenueGrowth >= 0)) return { label: "Saudável", className: "healthy", text: "Margem acima de 25% e receita sem retração comparável." };
    if (selectedMetrics.margin >= 10 && selectedMetrics.result >= 0) return { label: "Atenção", className: "attention", text: "Resultado positivo, mas com margem que pede acompanhamento." };
    return { label: "Crítica", className: "critical", text: "Margem baixa ou resultado negativo no período selecionado." };
  }, [revenueGrowth, selectedMetrics]);

  const projectContractMap = useMemo(() => {
    const map = new Map<string, FinanceContract>();
    contracts.forEach((contract) => map.set(contract.project_id, contract));
    return map;
  }, [contracts]);

  const regionMetrics = useMemo<RegionMetrics[]>(() => {
    const regions = new Map<string, RegionMetrics>();
    const ensureRegion = (state: string | null) => {
      const resolved = resolveState(state);
      const existing = regions.get(resolved.key);
      if (existing) return existing;
      const created: RegionMetrics = {
        key: resolved.key,
        label: resolved.label,
        macroRegion: resolved.macroRegion,
        revenue: 0,
        pipeline: 0,
        costs: 0,
        plannedCosts: 0,
        profit: 0,
        margin: 0,
        contractCount: 0,
      };
      regions.set(resolved.key, created);
      return created;
    };

    contracts.forEach((contract) => {
      if (!periodMatches(contractDate(contract), periodMode, selectedQuarter, selectedYear)) return;
      const region = ensureRegion(getRelation(contract.clients)?.state || null);
      const value = Number(contract.total_value || 0);
      if (confirmedStatuses.has(contract.status)) {
        region.revenue += value;
        region.contractCount += 1;
      } else if (pipelineStatuses.has(contract.status)) region.pipeline += value;
    });

    costs.forEach((cost) => {
      if (!periodMatches(cost.incurred_on, periodMode, selectedQuarter, selectedYear)) return;
      const contract = projectContractMap.get(cost.project_id);
      const region = ensureRegion(getRelation(contract?.clients || null)?.state || null);
      if (cost.status === "paid") region.costs += Number(cost.amount);
      else region.plannedCosts += Number(cost.amount);
    });

    timeEntries.forEach((entry) => {
      if (!periodMatches(entry.entry_date, periodMode, selectedQuarter, selectedYear)) return;
      const contract = projectContractMap.get(entry.project_id);
      const region = ensureRegion(getRelation(contract?.clients || null)?.state || null);
      const remuneration = Number(entry.hours) * Number(entry.hourly_rate);
      if (entry.entry_type === "actual") region.costs += remuneration;
      else region.plannedCosts += remuneration;
    });

    return [...regions.values()]
      .map((region) => ({
        ...region,
        profit: region.revenue - region.costs,
        margin: region.revenue > 0 ? ((region.revenue - region.costs) / region.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.profit - a.profit);
  }, [contracts, costs, periodMode, projectContractMap, selectedQuarter, selectedYear, timeEntries]);

  const timeByProject = useMemo(() => {
    const grouped = new Map<string, { projectId: string; projectName: string; actualHours: number; plannedHours: number; actualCost: number; plannedCost: number }>();
    timeEntries.forEach((entry) => {
      if (!periodMatches(entry.entry_date, periodMode, selectedQuarter, selectedYear)) return;
      const project = projects.find((item) => item.id === entry.project_id);
      const current = grouped.get(entry.project_id) || {
        projectId: entry.project_id,
        projectName: project?.name || "Projeto não encontrado",
        actualHours: 0,
        plannedHours: 0,
        actualCost: 0,
        plannedCost: 0,
      };
      const hours = Number(entry.hours);
      const cost = hours * Number(entry.hourly_rate);
      if (entry.entry_type === "actual") {
        current.actualHours += hours;
        current.actualCost += cost;
      } else {
        current.plannedHours += hours;
        current.plannedCost += cost;
      }
      grouped.set(entry.project_id, current);
    });
    return [...grouped.values()].sort((a, b) => b.actualCost + b.plannedCost - (a.actualCost + a.plannedCost));
  }, [periodMode, projects, selectedQuarter, selectedYear, timeEntries]);

  const visibleTimeEntries = useMemo(
    () => timeEntries.filter((entry) => periodMatches(entry.entry_date, periodMode, selectedQuarter, selectedYear)),
    [periodMode, selectedQuarter, selectedYear, timeEntries],
  );

  function openTimeModal() {
    setTimeDraft({
      project_id: projects[0]?.id || "",
      professional_name: "",
      role: "",
      entry_date: todayIso(),
      hours: "",
      hourly_rate: "",
      entry_type: "actual",
      notes: "",
    });
    setTimeModalOpen(true);
  }

  async function saveTimeEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !timeDraft.project_id) return;
    setIsSaving(true);
    const { error } = await supabase.from("project_time_entries").insert({
      project_id: timeDraft.project_id,
      professional_name: timeDraft.professional_name.trim(),
      role: timeDraft.role.trim() || null,
      entry_date: timeDraft.entry_date,
      hours: Number(timeDraft.hours),
      hourly_rate: Number(timeDraft.hourly_rate || 0),
      entry_type: timeDraft.entry_type,
      notes: timeDraft.notes.trim() || null,
    });
    if (error) setMessage(`Não foi possível registrar as horas: ${error.message}`);
    else {
      setTimeModalOpen(false);
      setMessage("Apontamento de horas registrado.");
      await loadData();
    }
    setIsSaving(false);
  }

  async function removeTimeEntry(entry: ProjectTimeEntry) {
    if (!supabase || !window.confirm(`Remover o apontamento de ${entry.professional_name}?`)) return;
    const { error } = await supabase.from("project_time_entries").delete().eq("id", entry.id);
    if (error) setMessage(`Não foi possível remover o apontamento: ${error.message}`);
    else await loadData();
  }

  async function generateAiAnalysis(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!supabase) return;
    setIsGeneratingAi(true);
    setMessage("");
    try {
      const session = await ensureActiveSession();
      if (!session) throw new Error("Sua sessão expirou. Entre novamente.");
      const result = await supabase.functions.invoke("finance-insights", {
        body: {
          period: periodLabel,
          question: aiQuestion,
          summary: {
            methodology: "Receita no período de início do contrato; custos pagos e horas realizadas como realizados; custos e horas planejadas como projeção.",
            selectedPeriod: selectedMetrics,
            previousPeriod: previousMetrics,
            changes: { revenuePercent: revenueGrowth, costsPercent: costGrowth, resultPercent: resultGrowth },
            health: health.label,
            quarterlyHistory: trendMetrics,
            regions: regionMetrics.slice(0, 10),
            timeByProject: timeByProject.slice(0, 10),
          },
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (result.error) throw result.error;
      const answer = (result.data as { answer?: string })?.answer;
      if (!answer) throw new Error("A função não devolveu a análise financeira.");
      setAiAnswer(answer);
    } catch (error) {
      setMessage(await functionErrorMessage(error));
    } finally {
      setIsGeneratingAi(false);
    }
  }

  const topRegion = regionMetrics.find((region) => region.revenue > 0);
  const averageHourlyCost = selectedMetrics.actualHours > 0 ? selectedMetrics.actualLaborCost / selectedMetrics.actualHours : 0;
  const timeExecution = selectedMetrics.plannedHours > 0 ? (selectedMetrics.actualHours / selectedMetrics.plannedHours) * 100 : null;

  return (
    <div className="financial-page">
      <header className="financial-header">
        <div>
          <a className="back-to-hub" href="#/"><span aria-hidden="true">←</span> Voltar ao hub</a>
          <p className="brand-kicker">Estratégia e sustentabilidade</p>
          <h1>Visão financeira</h1>
          <p>Compare crescimento, custos, tempo, remuneração e rentabilidade dos mercados atendidos.</p>
        </div>
        <div className="account-box"><span>{userEmail}</span><button type="button" onClick={onSignOut}>Sair</button></div>
      </header>

      <section className="financial-toolbar" aria-label="Período e navegação financeira">
        <div className="financial-period-mode">
          <button type="button" className={periodMode === "quarter" ? "selected" : ""} onClick={() => setPeriodMode("quarter")}>Trimestre</button>
          <button type="button" className={periodMode === "year" ? "selected" : ""} onClick={() => setPeriodMode("year")}>Ano</button>
        </div>
        {periodMode === "quarter" ? (
          <label><span>Período analisado</span><select value={selectedQuarter} onChange={(event) => { setSelectedQuarter(event.target.value); setSelectedYear(yearFromQuarter(event.target.value)); setAiAnswer(""); }}>{quarterKeys.map((key) => <option key={key} value={key}>{quarterLabel(key)}</option>)}</select></label>
        ) : (
          <label><span>Período analisado</span><select value={selectedYear} onChange={(event) => { setSelectedYear(Number(event.target.value)); setAiAnswer(""); }}>{yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
        )}
        <span className={`financial-health ${health.className}`}><i /> Saúde financeira: <strong>{health.label}</strong></span>
        <button type="button" className="primary-action" onClick={openTimeModal}>+ Registrar horas</button>
      </section>

      <nav className="financial-tabs" aria-label="Seções da visão financeira">
        {([
          ["overview", "Visão geral"],
          ["quarters", "Comparativo"],
          ["work", "Tempo e remuneração"],
          ["regions", "Mercados"],
          ["ai", "Análise por IA"],
        ] as [FinanceTab, string][]).map(([value, label]) => <button key={value} type="button" className={tab === value ? "selected" : ""} onClick={() => setTab(value)}>{label}</button>)}
      </nav>

      <p className="module-message financial-message" role="status" aria-live="polite">{message}</p>

      <main className="financial-main">
        {isLoading ? <div className="financial-empty">Carregando dados financeiros...</div> : null}

        {!isLoading && tab === "overview" ? (
          <>
            <section className="financial-kpis" aria-label={`Indicadores de ${periodLabel}`}>
              <article><span className="financial-kpi-icon"><FinanceIcon name="growth" /></span><small>Receita confirmada</small><strong>{currencyFormatter.format(selectedMetrics.revenue)}</strong><em className={revenueGrowth !== null && revenueGrowth < 0 ? "negative" : "positive"}>{changeText(revenueGrowth)} ante o período anterior</em></article>
              <article><span className="financial-kpi-icon"><FinanceIcon name="cost" /></span><small>Custos realizados</small><strong>{currencyFormatter.format(selectedMetrics.actualCosts)}</strong><em className={costGrowth !== null && costGrowth > 0 ? "negative" : "positive"}>{changeText(costGrowth)} ante o período anterior</em></article>
              <article className={selectedMetrics.result < 0 ? "negative-card" : "positive-card"}><span className="financial-kpi-icon"><FinanceIcon name="profit" /></span><small>Resultado do período</small><strong>{currencyFormatter.format(selectedMetrics.result)}</strong><em className={resultGrowth !== null && resultGrowth < 0 ? "negative" : "positive"}>{changeText(resultGrowth)} ante o período anterior</em></article>
              <article><span className="financial-kpi-icon"><FinanceIcon name="margin" /></span><small>Margem operacional</small><strong>{numberFormatter.format(selectedMetrics.margin)}%</strong><em>{selectedMetrics.contractCount} contrato{selectedMetrics.contractCount === 1 ? "" : "s"} confirmado{selectedMetrics.contractCount === 1 ? "" : "s"}</em></article>
            </section>

            <section className="financial-overview-grid">
              <article className="financial-chart-card">
                <div className="financial-section-heading"><div><p className="section-eyebrow">Evolução trimestral</p><h2>Receita, custos e resultado</h2></div><div className="financial-chart-legend"><span className="revenue"><i />Receita</span><span className="cost"><i />Custos</span><span className="result"><i />Resultado</span></div></div>
                <div className="financial-bar-chart" role="img" aria-label="Comparação de receita, custos e resultado nos últimos oito trimestres">
                  {trendMetrics.map((item) => <div className="financial-bar-group" key={item.key}><div><i className="revenue" style={{ height: `${Math.max(2, item.revenue / maxTrendValue * 100)}%` }} title={`Receita: ${decimalCurrencyFormatter.format(item.revenue)}`} /><i className="cost" style={{ height: `${Math.max(2, item.actualCosts / maxTrendValue * 100)}%` }} title={`Custos: ${decimalCurrencyFormatter.format(item.actualCosts)}`} /><i className={`result ${item.result < 0 ? "negative" : ""}`} style={{ height: `${Math.max(2, Math.abs(item.result) / maxTrendValue * 100)}%` }} title={`Resultado: ${decimalCurrencyFormatter.format(item.result)}`} /></div><span>{item.label.replace(" tri ", "T/")}</span></div>)}
                </div>
              </article>

              <aside className={`financial-health-card ${health.className}`}>
                <p className="section-eyebrow">Leitura comparativa</p>
                <h2>{health.label}</h2>
                <p>{health.text}</p>
                <dl>
                  <div><dt>Pipeline bruto</dt><dd>{currencyFormatter.format(selectedMetrics.pipeline)}</dd></div>
                  <div><dt>Custos planejados</dt><dd>{currencyFormatter.format(selectedMetrics.plannedCosts)}</dd></div>
                  <div><dt>Resultado projetado</dt><dd>{currencyFormatter.format(selectedMetrics.forecastResult)}</dd></div>
                  <div><dt>Ticket médio confirmado</dt><dd>{currencyFormatter.format(selectedMetrics.averageTicket)}</dd></div>
                </dl>
              </aside>
            </section>

            <section className="financial-insight-grid">
              <article><FinanceIcon name="growth" /><div><strong>Crescimento</strong><p>{revenueGrowth === null ? "O período anterior não possui receita para formar uma base percentual." : `A receita confirmada ${revenueGrowth >= 0 ? "cresceu" : "recuou"} ${numberFormatter.format(Math.abs(revenueGrowth))}% na comparação.`}</p></div></article>
              <article><FinanceIcon name="time" /><div><strong>Tempo e remuneração</strong><p>{selectedMetrics.actualHours ? `${numberFormatter.format(selectedMetrics.actualHours)} horas realizadas, com custo médio de ${decimalCurrencyFormatter.format(averageHourlyCost)} por hora.` : "Ainda não há horas realizadas registradas neste período."}</p></div></article>
              <article><FinanceIcon name="region" /><div><strong>Mercado mais rentável</strong><p>{topRegion ? `${topRegion.label} lidera com resultado de ${currencyFormatter.format(topRegion.profit)} e margem de ${numberFormatter.format(topRegion.margin)}%.` : "Cadastre o estado dos clientes para comparar os mercados atendidos."}</p></div></article>
            </section>
          </>
        ) : null}

        {!isLoading && tab === "quarters" ? (
          <section className="financial-panel">
            <div className="financial-section-heading"><div><p className="section-eyebrow">Série histórica</p><h2>Comparativo trimestral</h2></div><p>Receitas são alocadas no trimestre de início do contrato.</p></div>
            <div className="financial-comparison-strip">
              <article><span>Receita</span><strong>{changeText(revenueGrowth)}</strong><small>{currencyFormatter.format(previousMetrics.revenue)} → {currencyFormatter.format(selectedMetrics.revenue)}</small></article>
              <article><span>Custos</span><strong>{changeText(costGrowth)}</strong><small>{currencyFormatter.format(previousMetrics.actualCosts)} → {currencyFormatter.format(selectedMetrics.actualCosts)}</small></article>
              <article><span>Resultado</span><strong>{changeText(resultGrowth)}</strong><small>{currencyFormatter.format(previousMetrics.result)} → {currencyFormatter.format(selectedMetrics.result)}</small></article>
              <article><span>Margem</span><strong>{numberFormatter.format(selectedMetrics.margin - previousMetrics.margin)} p.p.</strong><small>{numberFormatter.format(previousMetrics.margin)}% → {numberFormatter.format(selectedMetrics.margin)}%</small></article>
            </div>
            <div className="financial-table-wrap"><table className="financial-table"><thead><tr><th>Trimestre</th><th>Receita</th><th>Pipeline</th><th>Custos realizados</th><th>Custos planejados</th><th>Resultado</th><th>Margem</th></tr></thead><tbody>{allQuarterMetrics.map((item) => <tr key={item.key} className={item.key === selectedQuarter ? "selected" : ""}><td><button type="button" onClick={() => { setPeriodMode("quarter"); setSelectedQuarter(item.key); setSelectedYear(yearFromQuarter(item.key)); }}>{item.label}</button></td><td>{decimalCurrencyFormatter.format(item.revenue)}</td><td>{decimalCurrencyFormatter.format(item.pipeline)}</td><td>{decimalCurrencyFormatter.format(item.actualCosts)}</td><td>{decimalCurrencyFormatter.format(item.plannedCosts)}</td><td className={item.result < 0 ? "negative" : "positive"}>{decimalCurrencyFormatter.format(item.result)}</td><td>{numberFormatter.format(item.margin)}%</td></tr>)}</tbody></table></div>
            <p className="financial-method-note">Metodologia: receita confirmada considera contratos assinados, vigentes ou encerrados; rascunhos e contratos em revisão compõem o pipeline. Custos realizados somam custos pagos e remuneração das horas realizadas. Custos planejados somam custos previstos e remuneração das horas planejadas.</p>
          </section>
        ) : null}

        {!isLoading && tab === "work" ? (
          <section className="financial-panel">
            <div className="financial-section-heading"><div><p className="section-eyebrow">Capacidade e remuneração</p><h2>Tempo de trabalho por projeto</h2></div><button type="button" className="primary-action" onClick={openTimeModal}>+ Registrar horas</button></div>
            <div className="financial-work-kpis"><article><span>Horas realizadas</span><strong>{numberFormatter.format(selectedMetrics.actualHours)}h</strong></article><article><span>Horas planejadas</span><strong>{numberFormatter.format(selectedMetrics.plannedHours)}h</strong></article><article><span>Remuneração realizada</span><strong>{currencyFormatter.format(selectedMetrics.actualLaborCost)}</strong></article><article><span>Custo médio por hora</span><strong>{decimalCurrencyFormatter.format(averageHourlyCost)}</strong></article><article><span>Execução do planejamento</span><strong>{timeExecution === null ? "—" : `${numberFormatter.format(timeExecution)}%`}</strong></article></div>
            {timeByProject.length ? <div className="financial-table-wrap"><table className="financial-table"><thead><tr><th>Projeto</th><th>Horas realizadas</th><th>Horas planejadas</th><th>Remuneração realizada</th><th>Remuneração planejada</th><th>Desvio de horas</th></tr></thead><tbody>{timeByProject.map((item) => <tr key={item.projectId}><td><strong>{item.projectName}</strong></td><td>{numberFormatter.format(item.actualHours)}h</td><td>{numberFormatter.format(item.plannedHours)}h</td><td>{decimalCurrencyFormatter.format(item.actualCost)}</td><td>{decimalCurrencyFormatter.format(item.plannedCost)}</td><td className={item.actualHours > item.plannedHours && item.plannedHours > 0 ? "negative" : "positive"}>{item.plannedHours ? `${numberFormatter.format(item.actualHours - item.plannedHours)}h` : "sem previsão"}</td></tr>)}</tbody></table></div> : <div className="financial-empty compact">Nenhuma hora registrada para {periodLabel}.</div>}
            {visibleTimeEntries.length ? <div className="financial-time-list"><h3>Apontamentos do período</h3>{visibleTimeEntries.map((entry) => { const project = projects.find((item) => item.id === entry.project_id); return <article key={entry.id}><span className={entry.entry_type}><FinanceIcon name="time" /></span><div><strong>{entry.professional_name}</strong><small>{project?.name || "Projeto"} · {entry.role || "Função não informada"} · {entry.entry_date.split("-").reverse().join("/")}</small></div><b>{numberFormatter.format(Number(entry.hours))}h</b><em>{decimalCurrencyFormatter.format(Number(entry.hours) * Number(entry.hourly_rate))}</em><button type="button" onClick={() => void removeTimeEntry(entry)} aria-label={`Remover apontamento de ${entry.professional_name}`}>×</button></article>; })}</div> : null}
            <p className="financial-method-note warning">Para evitar dupla contagem, não registre a mesma remuneração simultaneamente como apontamento de horas e como custo avulso do projeto.</p>
          </section>
        ) : null}

        {!isLoading && tab === "regions" ? (
          <section className="financial-panel">
            <div className="financial-section-heading"><div><p className="section-eyebrow">Mercados atendidos</p><h2>Rentabilidade por estado e região</h2></div><p>O mercado é definido pelo estado cadastrado no cliente do contrato.</p></div>
            {regionMetrics.length ? <><div className="financial-region-bars">{regionMetrics.map((region) => { const maxRevenue = Math.max(1, ...regionMetrics.map((item) => item.revenue)); return <article key={region.key}><div><strong>{region.label}</strong><span>{region.macroRegion}</span></div><i><em style={{ width: `${region.revenue / maxRevenue * 100}%` }} /></i><b className={region.profit < 0 ? "negative" : "positive"}>{currencyFormatter.format(region.profit)}</b></article>; })}</div><div className="financial-table-wrap"><table className="financial-table"><thead><tr><th>Mercado</th><th>Macrorregião</th><th>Receita</th><th>Pipeline</th><th>Custos</th><th>Resultado</th><th>Margem</th><th>Contratos</th></tr></thead><tbody>{regionMetrics.map((region) => <tr key={region.key}><td><strong>{region.label}</strong></td><td>{region.macroRegion}</td><td>{decimalCurrencyFormatter.format(region.revenue)}</td><td>{decimalCurrencyFormatter.format(region.pipeline)}</td><td>{decimalCurrencyFormatter.format(region.costs)}</td><td className={region.profit < 0 ? "negative" : "positive"}>{decimalCurrencyFormatter.format(region.profit)}</td><td>{numberFormatter.format(region.margin)}%</td><td>{region.contractCount}</td></tr>)}</tbody></table></div></> : <div className="financial-empty"><FinanceIcon name="region" /><strong>Sem dados regionais para o período</strong><p>Preencha o campo Estado no cadastro dos clientes e confira as datas dos contratos.</p></div>}
          </section>
        ) : null}

        {!isLoading && tab === "ai" ? (
          <section className="financial-ai-layout">
            <div className="financial-ai-intro"><span><FinanceIcon name="ai" /></span><p className="section-eyebrow">Consulta estratégica</p><h2>Análise financeira por IA</h2><p>A IA recebe somente métricas agregadas do período. Ela compara evolução, margem, custos, horas e mercados, sem acessar contratos ou documentos do Drive.</p><form onSubmit={generateAiAnalysis}><label><span>Pergunta adicional, opcional</span><textarea rows={4} value={aiQuestion} onChange={(event) => setAiQuestion(event.target.value)} placeholder="Ex.: Onde estamos perdendo margem e o que deveria ser priorizado no próximo trimestre?" /></label><button type="submit" className="primary-action" disabled={isGeneratingAi}>{isGeneratingAi ? "Analisando..." : aiAnswer ? "Atualizar análise" : "Gerar sumário do período"}</button></form><small>A análise é gerencial e não substitui avaliação contábil, fiscal ou jurídica.</small></div>
            <article className="financial-ai-answer" aria-live="polite">{isGeneratingAi ? <div className="financial-ai-loading"><i /><strong>Comparando os indicadores de {periodLabel}...</strong></div> : aiAnswer ? aiAnswer.split("\n").filter(Boolean).map((line, index) => line.startsWith("#") ? <h3 key={index}>{line.replace(/^#+\s*/, "")}</h3> : <p key={index}>{line.replace(/^[-*]\s*/, "")}</p>) : <div className="financial-empty compact"><FinanceIcon name="ai" /><strong>Nenhuma análise gerada</strong><p>Selecione o período e solicite o sumário para receber uma leitura comparativa.</p></div>}</article>
          </section>
        ) : null}
      </main>

      {timeModalOpen ? (
        <div className="form-modal-backdrop"><section className="form-modal financial-time-modal" role="dialog" aria-modal="true" aria-labelledby="time-entry-title"><div className="form-modal-heading"><div><p className="section-eyebrow">Tempo e remuneração</p><h2 id="time-entry-title">Registrar horas</h2></div><button type="button" className="modal-close-button" onClick={() => setTimeModalOpen(false)} aria-label="Fechar">×</button></div><form onSubmit={saveTimeEntry}><div className="field-grid"><label className="field-wide"><span>Projeto *</span><select required value={timeDraft.project_id} onChange={(event) => setTimeDraft((current) => ({ ...current, project_id: event.target.value }))}><option value="">Selecione o projeto</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label><span>Profissional *</span><input required value={timeDraft.professional_name} onChange={(event) => setTimeDraft((current) => ({ ...current, professional_name: event.target.value }))} /></label><label><span>Função</span><input value={timeDraft.role} onChange={(event) => setTimeDraft((current) => ({ ...current, role: event.target.value }))} placeholder="Ex.: roteirista, narrador" /></label><label><span>Data *</span><input type="date" required value={timeDraft.entry_date} onChange={(event) => setTimeDraft((current) => ({ ...current, entry_date: event.target.value }))} /></label><label><span>Tipo *</span><select value={timeDraft.entry_type} onChange={(event) => setTimeDraft((current) => ({ ...current, entry_type: event.target.value as ProjectTimeEntryType }))}><option value="actual">Realizada</option><option value="planned">Planejada</option></select></label><label><span>Quantidade de horas *</span><input type="number" min="0.25" max="24" step="0.25" required value={timeDraft.hours} onChange={(event) => setTimeDraft((current) => ({ ...current, hours: event.target.value }))} /></label><label><span>Remuneração por hora *</span><input type="number" min="0" step="0.01" required value={timeDraft.hourly_rate} onChange={(event) => setTimeDraft((current) => ({ ...current, hourly_rate: event.target.value }))} /></label><label className="field-wide"><span>Observações</span><textarea rows={3} value={timeDraft.notes} onChange={(event) => setTimeDraft((current) => ({ ...current, notes: event.target.value }))} /></label></div><div className="form-modal-actions"><button type="button" className="secondary-action" onClick={() => setTimeModalOpen(false)}>Cancelar</button><button type="submit" className="primary-action" disabled={isSaving}>{isSaving ? "Salvando..." : "Registrar horas"}</button></div></form></section></div>
      ) : null}
    </div>
  );
}
