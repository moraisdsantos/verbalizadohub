import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import ContractEditDialog from "./ContractEditDialog";
import { contractStatusLabels } from "../lib/contracts";
import { supabase } from "../lib/supabase";
import type {
  Client,
  Contract,
  ContractFields,
  ContractSource,
  ContractStatus,
  Project,
  Proposal,
} from "../types";

type ContractsPageProps = {
  userEmail: string;
  onSignOut: () => void;
};

type ContractWithRelations = Contract & {
  projects: Pick<Project, "name" | "status"> | null;
  clients: Pick<Client, "legal_name" | "trade_name"> | null;
  proposals: Pick<Proposal, "proposal_number" | "title"> | null;
};

type ContractDraft = {
  project_name: string;
  client_id: string;
  proposal_id: string;
  title: string;
  contract_number: string;
  status: ContractStatus;
  effective_date: string;
  expires_at: string;
  signed_at: string;
  total_value: string;
  service_description: string;
  payment_terms: string;
  client_legal_name: string;
  client_trade_name: string;
  client_tax_id: string;
  client_contact_name: string;
  client_email: string;
  client_phone: string;
  client_address: string;
  client_city: string;
  client_state: string;
  client_postal_code: string;
};

type DriveResult = {
  driveFileId: string;
  driveUrl: string;
  driveMimeType: string;
  fileName: string;
};

const sourceLabels: Record<ContractSource, string> = {
  pdf: "PDF interpretado",
  proposal: "Gerado da proposta",
  manual: "Cadastro manual",
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function localDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createEmptyDraft(): ContractDraft {
  return {
    project_name: "",
    client_id: "",
    proposal_id: "",
    title: "Contrato de Prestação de Serviços",
    contract_number: "",
    status: "draft",
    effective_date: localDate(),
    expires_at: "",
    signed_at: "",
    total_value: "",
    service_description: "",
    payment_terms: "50% antes do início dos serviços e 50% após a entrega final",
    client_legal_name: "",
    client_trade_name: "",
    client_tax_id: "",
    client_contact_name: "",
    client_email: "",
    client_phone: "",
    client_address: "",
    client_city: "",
    client_state: "",
    client_postal_code: "",
  };
}

function normalize(value: string | null | undefined) {
  return (value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function formatDate(value: string | null) {
  if (!value) return "Não informada";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T12:00:00Z`),
  );
}

function getProposalTotal(proposal: Proposal) {
  const subtotal = proposal.proposal_items.reduce(
    (total, item) => total + (item.quantity ?? 1) * Number(item.unit_price),
    0,
  );
  const discounted = Math.max(0, subtotal - Number(proposal.discount));
  return discounted + discounted * (Number(proposal.tax_percentage) / 100);
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Não foi possível ler o PDF selecionado."));
    reader.readAsDataURL(file);
  });
}

async function functionErrorMessage(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    try {
      const details = (await error.context.json()) as { error?: string };
      return details.error || "A função de contratos recusou a solicitação.";
    } catch {
      return "A função de contratos retornou um erro.";
    }
  }
  if (error instanceof FunctionsFetchError) {
    return "O navegador não conseguiu conectar à função contract-ai.";
  }
  if (error instanceof FunctionsRelayError) {
    return "O Supabase não conseguiu iniciar a função contract-ai.";
  }
  return error instanceof Error ? error.message : "Não foi possível processar o contrato.";
}

function FlowIcon({ source }: { source: ContractSource }) {
  if (source === "pdf") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M6 2h8l4 4v16H6Z" />
        <path d="M14 2v5h5M9 13h6M9 17h4" />
        <path d="m12 8-2 2-2-2" />
      </svg>
    );
  }
  if (source === "proposal") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M4 5h10M4 10h8M4 15h6" />
        <path d="m14 15 2 2 4-5" />
        <path d="M3 2h18v20H3Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </svg>
  );
}

export default function ContractsPage({ userEmail, onSignOut }: ContractsPageProps) {
  const [contracts, setContracts] = useState<ContractWithRelations[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [flow, setFlow] = useState<ContractSource | null>(null);
  const [draft, setDraft] = useState<ContractDraft>(createEmptyDraft);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfBase64, setPdfBase64] = useState("");
  const [aiFields, setAiFields] = useState<ContractFields | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<"analyze" | "save" | null>(null);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editingContract, setEditingContract] = useState<ContractWithRelations | null>(null);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === draft.client_id) ?? null,
    [clients, draft.client_id],
  );

  const filteredContracts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return contracts.filter((contract) => {
      if (!showArchived && contract.archived_at) return false;
      if (!term) return true;
      return (
      [
        contract.title,
        contract.contract_number,
        contract.projects?.name,
        contract.clients?.trade_name,
        contract.clients?.legal_name,
      ]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("pt-BR").includes(term))
      );
    });
  }, [contracts, search, showArchived]);

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setIsLoading(true);
    const [clientsResult, proposalsResult, contractsResult] = await Promise.all([
      supabase.from("clients").select("*").order("legal_name"),
      supabase
        .from("proposals")
        .select("*, proposal_items(*)")
        .order("created_at", { ascending: false }),
      supabase
        .from("contracts")
        .select(
          "*, projects(name,status), clients(legal_name,trade_name), proposals(proposal_number,title)",
        )
        .order("created_at", { ascending: false }),
    ]);

    const firstError = clientsResult.error || proposalsResult.error || contractsResult.error;
    if (firstError) {
      setMessage(`Não foi possível carregar o módulo: ${firstError.message}`);
      setIsLoading(false);
      return;
    }

    setClients((clientsResult.data ?? []) as Client[]);
    setProposals(
      ((proposalsResult.data ?? []) as Proposal[]).map((proposal) => ({
        ...proposal,
        proposal_items: [...(proposal.proposal_items ?? [])].sort(
          (a, b) => a.position - b.position,
        ),
      })),
    );
    setContracts((contractsResult.data ?? []) as unknown as ContractWithRelations[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function updateDraft<K extends keyof ContractDraft>(field: K, value: ContractDraft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function applyClient(clientId: string, preserveExtractedData = false) {
    const client = clients.find((item) => item.id === clientId);
    setDraft((current) => ({
      ...current,
      client_id: clientId,
      client_legal_name:
        preserveExtractedData && current.client_legal_name
          ? current.client_legal_name
          : client?.legal_name || "",
      client_trade_name:
        preserveExtractedData && current.client_trade_name
          ? current.client_trade_name
          : client?.trade_name || "",
      client_tax_id:
        preserveExtractedData && current.client_tax_id
          ? current.client_tax_id
          : client?.tax_id || "",
      client_contact_name:
        preserveExtractedData && current.client_contact_name
          ? current.client_contact_name
          : client?.contact_name || "",
      client_email:
        preserveExtractedData && current.client_email
          ? current.client_email
          : client?.email || "",
      client_phone:
        preserveExtractedData && current.client_phone
          ? current.client_phone
          : client?.phone || "",
      client_address:
        preserveExtractedData && current.client_address
          ? current.client_address
          : client?.address || "",
      client_city:
        preserveExtractedData && current.client_city
          ? current.client_city
          : client?.city || "",
      client_state:
        preserveExtractedData && current.client_state
          ? current.client_state
          : client?.state || "",
      client_postal_code:
        preserveExtractedData && current.client_postal_code
          ? current.client_postal_code
          : client?.postal_code || "",
    }));
  }

  function openFlow(source: ContractSource) {
    const next = createEmptyDraft();
    if (source !== "pdf" && clients[0]) {
      next.client_id = clients[0].id;
      next.client_legal_name = clients[0].legal_name;
      next.client_trade_name = clients[0].trade_name || "";
      next.client_tax_id = clients[0].tax_id || "";
      next.client_contact_name = clients[0].contact_name || "";
      next.client_email = clients[0].email || "";
      next.client_phone = clients[0].phone || "";
      next.client_address = clients[0].address || "";
      next.client_city = clients[0].city || "";
      next.client_state = clients[0].state || "";
      next.client_postal_code = clients[0].postal_code || "";
    }
    setDraft(next);
    setFlow(source);
    setPdfFile(null);
    setPdfBase64("");
    setAiFields(null);
    setMessage("");
  }

  function closeFlow() {
    if (busyAction) return;
    setFlow(null);
    setPdfFile(null);
    setPdfBase64("");
    setAiFields(null);
  }

  function applyProposal(proposalId: string) {
    const proposal = proposals.find((item) => item.id === proposalId);
    if (!proposal) {
      updateDraft("proposal_id", proposalId);
      return;
    }
    const client = clients.find((item) => item.id === proposal.client_id);
    setDraft((current) => ({
      ...current,
      proposal_id: proposal.id,
      client_id: proposal.client_id,
      project_name: current.project_name || proposal.title,
      title: `Contrato de Prestação de Serviços — ${proposal.title}`,
      total_value: String(getProposalTotal(proposal)),
      service_description: proposal.proposal_items
        .map((item) => {
          const quantity = item.quantity === null ? "" : ` (${item.quantity}x)`;
          return `${item.description}${quantity}`;
        })
        .join("; "),
      payment_terms: proposal.payment_terms || current.payment_terms,
      client_legal_name: client?.legal_name || "",
      client_trade_name: client?.trade_name || "",
      client_tax_id: client?.tax_id || "",
      client_contact_name: client?.contact_name || "",
      client_email: client?.email || "",
      client_phone: client?.phone || "",
      client_address: client?.address || "",
      client_city: client?.city || "",
      client_state: client?.state || "",
      client_postal_code: client?.postal_code || "",
    }));
  }

  async function analyzePdf() {
    if (!supabase || !pdfFile) return;
    if (pdfFile.type !== "application/pdf") {
      setMessage("Selecione um arquivo PDF.");
      return;
    }
    if (pdfFile.size > 20 * 1024 * 1024) {
      setMessage("O PDF precisa ter no máximo 20 MB.");
      return;
    }

    setBusyAction("analyze");
    setMessage("Lendo o contrato com a OpenAI…");
    try {
      const base64 = await fileToBase64(pdfFile);
      const { data: authData } = await supabase.auth.getSession();
      if (!authData.session) throw new Error("Sua sessão expirou. Entre novamente.");
      const result = await supabase.functions.invoke("contract-ai", {
        body: { action: "analyze_pdf", fileBase64: base64, fileName: pdfFile.name },
        headers: { Authorization: `Bearer ${authData.session.access_token}` },
      });
      if (result.error) throw result.error;
      const fields = (result.data as { fields?: ContractFields })?.fields;
      if (!fields) throw new Error("A função não devolveu os dados do contrato.");

      const matchedClient = clients.find((client) => {
        const taxMatch = normalize(fields.client_tax_id) && normalize(client.tax_id) === normalize(fields.client_tax_id);
        const emailMatch = fields.client_email && client.email?.toLocaleLowerCase() === fields.client_email.toLocaleLowerCase();
        const nameMatch = normalize(client.legal_name) === normalize(fields.client_legal_name);
        return Boolean(taxMatch || emailMatch || nameMatch);
      });

      setAiFields(fields);
      setPdfBase64(base64);
      setDraft((current) => ({
        ...current,
        client_id: matchedClient?.id || "",
        title: fields.title || current.title,
        contract_number: fields.contract_number || "",
        status: fields.signed_at ? "signed" : "review",
        effective_date: fields.effective_date || "",
        expires_at: fields.expires_at || "",
        signed_at: fields.signed_at || "",
        total_value: fields.total_value === null ? "" : String(fields.total_value),
        service_description: fields.service_description || "",
        payment_terms: fields.payment_terms || "",
        client_legal_name: fields.client_legal_name || "",
        client_trade_name: fields.client_trade_name || "",
        client_tax_id: fields.client_tax_id || "",
        client_contact_name: fields.client_contact_name || "",
        client_email: fields.client_email || "",
        client_phone: fields.client_phone || "",
        client_address: fields.client_address || "",
        client_city: fields.client_city || "",
        client_state: fields.client_state || "",
        client_postal_code: fields.client_postal_code || "",
      }));
      setMessage(
        matchedClient
          ? "Dados extraídos. Revise tudo antes de criar o projeto."
          : "Dados extraídos. Selecione o cliente correspondente antes de salvar.",
      );
    } catch (error) {
      setMessage(await functionErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  function toContractFields(): ContractFields & { project_name: string } {
    return {
      project_name: draft.project_name.trim(),
      title: draft.title.trim() || null,
      contract_number: draft.contract_number.trim() || null,
      client_legal_name: draft.client_legal_name.trim() || null,
      client_trade_name: draft.client_trade_name.trim() || null,
      client_tax_id: draft.client_tax_id.trim() || null,
      client_contact_name: draft.client_contact_name.trim() || null,
      client_email: draft.client_email.trim() || null,
      client_phone: draft.client_phone.trim() || null,
      client_address: draft.client_address.trim() || null,
      client_city: draft.client_city.trim() || null,
      client_state: draft.client_state.trim() || null,
      client_postal_code: draft.client_postal_code.trim() || null,
      service_description: draft.service_description.trim() || null,
      effective_date: draft.effective_date || null,
      expires_at: draft.expires_at || null,
      signed_at: draft.signed_at || null,
      total_value: draft.total_value === "" ? null : Number(draft.total_value),
      payment_terms: draft.payment_terms.trim() || null,
    };
  }

  async function invokeContractFunction(body: Record<string, unknown>) {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data: authData } = await supabase.auth.getSession();
    if (!authData.session) throw new Error("Sua sessão expirou. Entre novamente.");
    const result = await supabase.functions.invoke("contract-ai", {
      body,
      headers: { Authorization: `Bearer ${authData.session.access_token}` },
    });
    if (result.error) throw result.error;
    return result.data;
  }

  async function rollbackDriveFile(fileId: string) {
    try {
      await invokeContractFunction({ action: "delete_drive_file", fileId });
    } catch (error) {
      console.error("Não foi possível remover o arquivo após a falha:", error);
    }
  }

  async function saveContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !flow) return;
    if (!draft.project_name.trim()) {
      setMessage("Informe o nome do projeto que será criado.");
      return;
    }
    if (!selectedClient) {
      setMessage("Selecione um cliente já cadastrado.");
      return;
    }
    if (flow === "proposal" && !draft.proposal_id) {
      setMessage("Selecione a proposta que dará origem ao contrato.");
      return;
    }
    if (flow === "pdf" && (!pdfFile || !pdfBase64 || !aiFields)) {
      setMessage("Selecione e interprete o PDF antes de salvar.");
      return;
    }

    setBusyAction("save");
    setMessage("Salvando o contrato no Google Drive e criando o projeto…");
    let driveFileId = "";
    let projectId = "";

    try {
      const fields = toContractFields();
      let drive: DriveResult;
      if (flow === "pdf") {
        drive = (await invokeContractFunction({
          action: "store_uploaded_contract",
          fileBase64: pdfBase64,
          fileName: pdfFile?.name,
        })) as DriveResult;
      } else {
        drive = (await invokeContractFunction({
          action: "create_contract_document",
          fields,
          fileName: `${draft.project_name.trim()} — contrato`,
        })) as DriveResult;
      }
      if (!drive?.driveFileId || !drive.driveUrl) {
        throw new Error("A função não devolveu o link do arquivo no Google Drive.");
      }
      driveFileId = drive.driveFileId;

      const { data: authData } = await supabase.auth.getSession();
      if (!authData.session) throw new Error("Sua sessão expirou. Entre novamente.");
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .insert({
          client_id: selectedClient.id,
          name: draft.project_name.trim(),
          status: "planning",
          start_date: draft.effective_date || null,
          end_date: draft.expires_at || null,
          created_by: authData.session.user.id,
        })
        .select("id")
        .single();
      if (projectError || !project) {
        throw new Error(`Não foi possível criar o projeto: ${projectError?.message || "erro desconhecido"}`);
      }
      projectId = project.id;

      const { error: contractError } = await supabase.from("contracts").insert({
        project_id: projectId,
        client_id: selectedClient.id,
        proposal_id: draft.proposal_id || null,
        source: flow,
        title: draft.title.trim(),
        contract_number: draft.contract_number.trim() || null,
        status: draft.status,
        drive_file_id: drive.driveFileId,
        drive_url: drive.driveUrl,
        drive_mime_type: drive.driveMimeType,
        effective_date: draft.effective_date || null,
        expires_at: draft.expires_at || null,
        signed_at: draft.signed_at || null,
        total_value: draft.total_value === "" ? null : Number(draft.total_value),
        service_description: draft.service_description.trim() || null,
        payment_terms: draft.payment_terms.trim() || null,
        client_data: {
          legal_name: draft.client_legal_name.trim(),
          trade_name: draft.client_trade_name.trim() || null,
          tax_id: draft.client_tax_id.trim() || null,
          contact_name: draft.client_contact_name.trim() || null,
          email: draft.client_email.trim() || null,
          phone: draft.client_phone.trim() || null,
          address: draft.client_address.trim() || null,
          city: draft.client_city.trim() || null,
          state: draft.client_state.trim() || null,
          postal_code: draft.client_postal_code.trim() || null,
        },
        extracted_data: flow === "pdf" ? aiFields : {},
        created_by: authData.session.user.id,
      });
      if (contractError) {
        throw new Error(`Não foi possível registrar o contrato: ${contractError.message}`);
      }

      setFlow(null);
      setPdfFile(null);
      setPdfBase64("");
      setAiFields(null);
      setMessage("Contrato salvo no Google Drive e projeto criado com sucesso.");
      await loadData();
    } catch (error) {
      if (projectId) await supabase.from("projects").delete().eq("id", projectId);
      if (driveFileId) await rollbackDriveFile(driveFileId);
      setMessage(await functionErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  async function toggleArchive(contract: ContractWithRelations) {
    if (!supabase) return;
    const archivedAt = contract.archived_at ? null : new Date().toISOString();
    const { error } = await supabase
      .from("contracts")
      .update({ archived_at: archivedAt })
      .eq("id", contract.id);
    if (error) {
      setMessage(`Não foi possível ${archivedAt ? "arquivar" : "desarquivar"} o contrato: ${error.message}`);
      return;
    }
    setMessage(archivedAt ? "Contrato arquivado." : "Contrato restaurado.");
    await loadData();
  }

  async function deleteContract(contract: ContractWithRelations) {
    if (!supabase) return;
    const projectName = contract.projects?.name || contract.title;
    const confirmed = window.confirm(
      `Remover definitivamente o contrato “${contract.title}”? O projeto “${projectName}”, suas etapas, ações e custos também serão removidos do Supabase. O arquivo continuará preservado no Google Drive.`,
    );
    if (!confirmed) return;

    const { error } = await supabase.from("projects").delete().eq("id", contract.project_id);
    if (error) {
      setMessage(`Não foi possível remover o contrato: ${error.message}`);
      return;
    }
    setMessage("Contrato e projeto removidos do hub. O arquivo foi preservado no Google Drive.");
    await loadData();
  }

  return (
    <div className="contracts-page">
      <header className="module-page-header contracts-header">
        <div>
          <a className="back-to-hub" href="#/">
            <span aria-hidden="true">←</span>
            Voltar ao hub
          </a>
          <p className="brand-kicker">Contratos e projetos</p>
          <h1>Contratos</h1>
          <p>
            Leia documentos com a OpenAI, gere contratos a partir de propostas ou
            faça um cadastro manual. Cada contrato cria um projeto automaticamente.
          </p>
        </div>
        <div className="account-box">
          <span>{userEmail}</span>
          <button type="button" onClick={onSignOut}>Sair</button>
        </div>
      </header>

      <section className="contract-flow-section" aria-labelledby="contract-flow-title">
        <div className="contract-section-heading">
          <div>
            <p className="section-eyebrow">Novo contrato</p>
            <h2 id="contract-flow-title">Como você quer começar?</h2>
          </div>
          <p>O arquivo final fica no Google Drive; apenas os dados operacionais ficam no Supabase.</p>
        </div>

        <div className="contract-flow-grid">
          <button type="button" className="contract-flow-card" onClick={() => openFlow("pdf")}>
            <span className="contract-flow-icon"><FlowIcon source="pdf" /></span>
            <span className="contract-flow-number">01</span>
            <strong>Carregar contrato em PDF</strong>
            <span>A OpenAI extrai os dados para você revisar antes de salvar e criar o projeto.</span>
          </button>
          <button type="button" className="contract-flow-card" onClick={() => openFlow("proposal")}>
            <span className="contract-flow-icon"><FlowIcon source="proposal" /></span>
            <span className="contract-flow-number">02</span>
            <strong>Gerar a partir da proposta</strong>
            <span>Use cliente, serviços e valores de um orçamento no modelo da ver.balizado.</span>
          </button>
          <button type="button" className="contract-flow-card" onClick={() => openFlow("manual")}>
            <span className="contract-flow-icon"><FlowIcon source="manual" /></span>
            <span className="contract-flow-number">03</span>
            <strong>Cadastrar manualmente</strong>
            <span>Preencha os campos e gere um contrato no Drive a partir do modelo oficial.</span>
          </button>
        </div>
      </section>

      <p className="module-message contracts-message" role="status" aria-live="polite">{message}</p>

      <section className="contracts-list-section" aria-labelledby="contracts-list-title">
        <div className="contracts-list-heading">
          <div>
            <p className="section-eyebrow">Base contratual</p>
            <h2 id="contracts-list-title">Contratos e projetos criados</h2>
          </div>
          <div className="contract-list-controls">
            <label className="contract-search">
              <span>Buscar</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Contrato, cliente ou projeto"
              />
            </label>
            <label className="contract-archive-filter">
              <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
              <span>Mostrar arquivados</span>
            </label>
          </div>
        </div>

        {isLoading ? <p className="contracts-placeholder">Carregando contratos…</p> : null}
        {!isLoading && filteredContracts.length === 0 ? (
          <div className="contracts-empty-state">
            <span aria-hidden="true"><FlowIcon source="manual" /></span>
            <h3>Nenhum contrato cadastrado</h3>
            <p>Escolha uma das três opções acima para criar o primeiro projeto.</p>
          </div>
        ) : null}

        {filteredContracts.length ? (
          <div className="contracts-table-wrap">
            <table className="contracts-table">
              <thead>
                <tr>
                  <th>Contrato</th>
                  <th>Cliente</th>
                  <th>Projeto criado</th>
                  <th>Vigência</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredContracts.map((contract) => (
                  <tr key={contract.id} className={contract.archived_at ? "is-archived" : ""}>
                    <td>
                      <strong>{contract.title}</strong>
                      <span>{contract.contract_number || sourceLabels[contract.source]}</span>
                      {contract.archived_at ? <em className="contract-archived-label">Arquivado</em> : null}
                    </td>
                    <td>{contract.clients?.trade_name || contract.clients?.legal_name || "—"}</td>
                    <td><span className="project-pill">{contract.projects?.name || "—"}</span></td>
                    <td>{formatDate(contract.effective_date)}<br />até {formatDate(contract.expires_at)}</td>
                    <td>{contract.total_value === null ? "—" : currencyFormatter.format(contract.total_value)}</td>
                    <td><span className={`contract-status ${contract.status}`}>{contractStatusLabels[contract.status]}</span></td>
                    <td>
                      <div className="contract-row-actions">
                        <a href={contract.drive_url} target="_blank" rel="noreferrer">Drive ↗</a>
                        <button type="button" onClick={() => setEditingContract(contract)}>Editar</button>
                        <button type="button" onClick={() => void toggleArchive(contract)}>{contract.archived_at ? "Desarquivar" : "Arquivar"}</button>
                        <button type="button" className="danger" onClick={() => void deleteContract(contract)}>Remover</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {flow ? (
        <div className="form-modal-backdrop contract-modal-backdrop" role="presentation">
          <section className="form-modal contract-form-modal" role="dialog" aria-modal="true" aria-labelledby="contract-form-title">
            <div className="form-modal-heading">
              <div>
                <p className="section-eyebrow">{sourceLabels[flow]}</p>
                <h2 id="contract-form-title">
                  {flow === "pdf" ? "Interpretar e cadastrar contrato" : flow === "proposal" ? "Gerar contrato da proposta" : "Cadastrar contrato manualmente"}
                </h2>
              </div>
              <button type="button" className="modal-close-button" onClick={closeFlow} aria-label="Fechar">×</button>
            </div>

            {flow === "pdf" ? (
              <div className="contract-source-panel">
                <label htmlFor="contract-pdf">Contrato em PDF, até 20 MB</label>
                <div className="contract-file-row">
                  <input
                    id="contract-pdf"
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(event) => {
                      setPdfFile(event.target.files?.[0] || null);
                      setPdfBase64("");
                      setAiFields(null);
                    }}
                  />
                  <button type="button" className="primary-action" disabled={!pdfFile || busyAction !== null} onClick={analyzePdf}>
                    {busyAction === "analyze" ? "Interpretando…" : "Interpretar com a OpenAI"}
                  </button>
                </div>
                <p>{aiFields ? "Leitura concluída. Confira os campos abaixo." : "O PDF só será enviado ao Google Drive depois da sua revisão."}</p>
              </div>
            ) : null}

            {flow === "proposal" ? (
              <div className="contract-source-panel">
                <label htmlFor="contract-proposal">Proposta ou orçamento</label>
                <select id="contract-proposal" required value={draft.proposal_id} onChange={(event) => applyProposal(event.target.value)}>
                  <option value="">Selecione uma proposta</option>
                  {proposals.map((proposal) => {
                    const client = clients.find((item) => item.id === proposal.client_id);
                    return <option key={proposal.id} value={proposal.id}>{proposal.proposal_number} — {proposal.title} — {client?.trade_name || client?.legal_name}</option>;
                  })}
                </select>
                <p>Os serviços, o valor, as condições e o cliente serão preenchidos automaticamente.</p>
              </div>
            ) : null}

            <form onSubmit={saveContract}>
              <fieldset className="contract-form-section">
                <legend>Projeto e vínculo</legend>
                <div className="field-grid contract-main-fields">
                  <label className="field-wide">
                    <span>Nome do projeto *</span>
                    <input required value={draft.project_name} onChange={(event) => updateDraft("project_name", event.target.value)} placeholder="Ex.: Festival XYZ — Audiodescrição 2026" />
                    <small>Este nome será usado para criar o projeto vinculado.</small>
                  </label>
                  <label>
                    <span>Cliente cadastrado *</span>
                    <select required value={draft.client_id} onChange={(event) => applyClient(event.target.value, flow === "pdf")}>
                      <option value="">Selecione o cliente</option>
                      {clients.map((client) => <option key={client.id} value={client.id}>{client.trade_name || client.legal_name}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Status do contrato</span>
                    <select value={draft.status} onChange={(event) => updateDraft("status", event.target.value as ContractStatus)}>
                      {Object.entries(contractStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                </div>
              </fieldset>

              <fieldset className="contract-form-section">
                <legend>Dados do contrato</legend>
                <div className="field-grid contract-main-fields">
                  <label className="field-wide">
                    <span>Título *</span>
                    <input required value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} />
                  </label>
                  <label>
                    <span>Número do contrato</span>
                    <input value={draft.contract_number} onChange={(event) => updateDraft("contract_number", event.target.value)} placeholder="Ex.: CT-2026-001" />
                  </label>
                  <label>
                    <span>Valor total</span>
                    <input type="number" min="0" step="0.01" value={draft.total_value} onChange={(event) => updateDraft("total_value", event.target.value)} placeholder="0,00" />
                  </label>
                  <label>
                    <span>Início da vigência</span>
                    <input type="date" value={draft.effective_date} onChange={(event) => updateDraft("effective_date", event.target.value)} />
                  </label>
                  <label>
                    <span>Fim da vigência</span>
                    <input type="date" min={draft.effective_date || undefined} value={draft.expires_at} onChange={(event) => updateDraft("expires_at", event.target.value)} />
                  </label>
                  <label>
                    <span>Data da assinatura</span>
                    <input type="date" value={draft.signed_at} onChange={(event) => updateDraft("signed_at", event.target.value)} />
                  </label>
                  <label className="field-wide">
                    <span>Objeto e serviços *</span>
                    <textarea required rows={5} value={draft.service_description} onChange={(event) => updateDraft("service_description", event.target.value)} placeholder="Descreva o objeto, os serviços e as entregas." />
                  </label>
                  <label className="field-wide">
                    <span>Condições de pagamento</span>
                    <textarea rows={3} value={draft.payment_terms} onChange={(event) => updateDraft("payment_terms", event.target.value)} />
                  </label>
                </div>
              </fieldset>

              <fieldset className="contract-form-section">
                <legend>Dados do contratante</legend>
                <div className="field-grid contract-client-fields">
                  <label className="field-wide"><span>Razão social ou nome completo *</span><input required value={draft.client_legal_name} onChange={(event) => updateDraft("client_legal_name", event.target.value)} /></label>
                  <label><span>Nome fantasia</span><input value={draft.client_trade_name} onChange={(event) => updateDraft("client_trade_name", event.target.value)} /></label>
                  <label><span>CPF/CNPJ</span><input value={draft.client_tax_id} onChange={(event) => updateDraft("client_tax_id", event.target.value)} /></label>
                  <label><span>Responsável</span><input value={draft.client_contact_name} onChange={(event) => updateDraft("client_contact_name", event.target.value)} /></label>
                  <label><span>E-mail</span><input type="email" value={draft.client_email} onChange={(event) => updateDraft("client_email", event.target.value)} /></label>
                  <label><span>Telefone</span><input value={draft.client_phone} onChange={(event) => updateDraft("client_phone", event.target.value)} /></label>
                  <label className="field-wide"><span>Endereço</span><input value={draft.client_address} onChange={(event) => updateDraft("client_address", event.target.value)} /></label>
                  <label><span>Cidade</span><input value={draft.client_city} onChange={(event) => updateDraft("client_city", event.target.value)} /></label>
                  <label><span>Estado</span><input value={draft.client_state} onChange={(event) => updateDraft("client_state", event.target.value)} /></label>
                  <label><span>CEP</span><input value={draft.client_postal_code} onChange={(event) => updateDraft("client_postal_code", event.target.value)} /></label>
                </div>
              </fieldset>

              <div className="contract-review-note">
                <strong>Revisão obrigatória</strong>
                <p>A interpretação por IA pode conter erros. Confira nomes, documentos, datas, valores e cláusulas antes de usar ou assinar o contrato.</p>
              </div>

              <div className="form-modal-actions">
                <button type="button" className="secondary-action" disabled={busyAction !== null} onClick={closeFlow}>Cancelar</button>
                <button type="submit" className="primary-action" disabled={busyAction !== null}>
                  {busyAction === "save" ? "Salvando…" : "Salvar no Drive e criar projeto"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {editingContract ? (
        <ContractEditDialog
          contract={editingContract}
          projectName={editingContract.projects?.name || ""}
          onClose={() => setEditingContract(null)}
          onSaved={async () => {
            setMessage("Contrato e projeto atualizados.");
            await loadData();
          }}
        />
      ) : null}
    </div>
  );
}
