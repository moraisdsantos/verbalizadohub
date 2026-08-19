import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Client, Proposal, ProposalStatus } from "../types";
import ProposalPreview from "./ProposalPreview";

type ClientsPageProps = {
  userEmail: string;
  onSignOut: () => void;
};

type ClientDraft = {
  legal_name: string;
  trade_name: string;
  contact_name: string;
  email: string;
  phone: string;
  tax_id: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  notes: string;
};

type ProposalItemDraft = {
  id?: string;
  description: string;
  quantity: string;
  unit_price: string;
};

type ProposalDraft = {
  proposal_number: string;
  title: string;
  status: ProposalStatus;
  issue_date: string;
  valid_until: string;
  payment_terms: string;
  notes: string;
  discount: string;
  tax_percentage: string;
  items: ProposalItemDraft[];
};

const emptyClient: ClientDraft = {
  legal_name: "",
  trade_name: "",
  contact_name: "",
  email: "",
  phone: "",
  tax_id: "",
  address: "",
  city: "",
  state: "",
  postal_code: "",
  notes: "",
};

const statusLabels: Record<ProposalStatus, string> = {
  draft: "Rascunho",
  sent: "Enviada",
  approved: "Aprovada",
  rejected: "Recusada",
  expired: "Expirada",
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createProposalNumber() {
  const now = new Date();
  const sequence = `${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}${String(now.getTime()).slice(-4)}`;
  return `VB-${now.getFullYear()}-${sequence}`;
}

function createEmptyProposal(): ProposalDraft {
  return {
    proposal_number: createProposalNumber(),
    title: "",
    status: "draft",
    issue_date: localDate(),
    valid_until: localDate(30),
    payment_terms: "",
    notes: "",
    discount: "0",
    tax_percentage: "0",
    items: [{ description: "", quantity: "1", unit_price: "" }],
  };
}

function proposalToDraft(proposal: Proposal): ProposalDraft {
  return {
    proposal_number: proposal.proposal_number,
    title: proposal.title,
    status: proposal.status,
    issue_date: proposal.issue_date,
    valid_until: proposal.valid_until ?? "",
    payment_terms: proposal.payment_terms ?? "",
    notes: proposal.notes ?? "",
    discount: String(proposal.discount),
    tax_percentage: String(proposal.tax_percentage),
    items: [...proposal.proposal_items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity === null ? "" : String(item.quantity),
        unit_price: String(item.unit_price),
      })),
  };
}

function getProposalTotal(proposal: Proposal) {
  const subtotal = proposal.proposal_items.reduce(
    (total, item) => total + (item.quantity ?? 1) * Number(item.unit_price),
    0,
  );
  const discounted = Math.max(0, subtotal - Number(proposal.discount));
  return discounted + discounted * (Number(proposal.tax_percentage) / 100);
}

function getDraftTotal(draft: ProposalDraft) {
  const subtotal = draft.items.reduce((total, item) => {
    const quantity = item.quantity.trim() === "" ? 1 : Number(item.quantity);
    return total + quantity * (Number(item.unit_price) || 0);
  }, 0);
  const discounted = Math.max(0, subtotal - (Number(draft.discount) || 0));
  return discounted + discounted * ((Number(draft.tax_percentage) || 0) / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T12:00:00Z`),
  );
}

export default function ClientsPage({ userEmail, onSignOut }: ClientsPageProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [isLoadingClients, setIsLoadingClients] = useState(true);
  const [isLoadingProposals, setIsLoadingProposals] = useState(false);
  const [message, setMessage] = useState("");
  const [clientEditor, setClientEditor] = useState<Client | "new" | null>(null);
  const [clientDraft, setClientDraft] = useState<ClientDraft>(emptyClient);
  const [proposalEditor, setProposalEditor] = useState<Proposal | "new" | null>(null);
  const [proposalDraft, setProposalDraft] = useState<ProposalDraft>(createEmptyProposal);
  const [previewProposal, setPreviewProposal] = useState<Proposal | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );

  const filteredClients = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return clients;
    return clients.filter((client) =>
      [client.legal_name, client.trade_name, client.contact_name, client.email]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("pt-BR").includes(term)),
    );
  }, [clients, search]);

  const loadClients = useCallback(async () => {
    if (!supabase) return;
    setIsLoadingClients(true);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("legal_name", { ascending: true });

    if (error) {
      setMessage(`Não foi possível carregar os clientes: ${error.message}`);
      setIsLoadingClients(false);
      return;
    }

    const loadedClients = (data ?? []) as Client[];
    setClients(loadedClients);
    setSelectedClientId((current) =>
      current && loadedClients.some((client) => client.id === current)
        ? current
        : loadedClients[0]?.id ?? null,
    );
    setIsLoadingClients(false);
  }, []);

  const loadProposals = useCallback(async (clientId: string | null) => {
    if (!supabase || !clientId) {
      setProposals([]);
      return;
    }

    setIsLoadingProposals(true);
    const { data, error } = await supabase
      .from("proposals")
      .select("*, proposal_items(*)")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(`Não foi possível carregar as propostas: ${error.message}`);
      setProposals([]);
    } else {
      setProposals(
        ((data ?? []) as Proposal[]).map((proposal) => ({
          ...proposal,
          proposal_items: [...(proposal.proposal_items ?? [])].sort(
            (a, b) => a.position - b.position,
          ),
        })),
      );
    }
    setIsLoadingProposals(false);
  }, []);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  useEffect(() => {
    void loadProposals(selectedClientId);
  }, [loadProposals, selectedClientId]);

  function openNewClient() {
    setClientDraft({ ...emptyClient });
    setClientEditor("new");
    setMessage("");
  }

  function openEditClient(client: Client) {
    setClientDraft({
      legal_name: client.legal_name,
      trade_name: client.trade_name ?? "",
      contact_name: client.contact_name ?? "",
      email: client.email ?? "",
      phone: client.phone ?? "",
      tax_id: client.tax_id ?? "",
      address: client.address ?? "",
      city: client.city ?? "",
      state: client.state ?? "",
      postal_code: client.postal_code ?? "",
      notes: client.notes ?? "",
    });
    setClientEditor(client);
    setMessage("");
  }

  async function saveClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !clientEditor) return;
    setIsSaving(true);
    setMessage("");

    const payload = {
      legal_name: clientDraft.legal_name.trim(),
      trade_name: clientDraft.trade_name.trim() || null,
      contact_name: clientDraft.contact_name.trim() || null,
      email: clientDraft.email.trim() || null,
      phone: clientDraft.phone.trim() || null,
      tax_id: clientDraft.tax_id.trim() || null,
      address: clientDraft.address.trim() || null,
      city: clientDraft.city.trim() || null,
      state: clientDraft.state.trim() || null,
      postal_code: clientDraft.postal_code.trim() || null,
      notes: clientDraft.notes.trim() || null,
    };

    const result =
      clientEditor === "new"
        ? await supabase.from("clients").insert(payload).select("*").single()
        : await supabase
            .from("clients")
            .update(payload)
            .eq("id", clientEditor.id)
            .select("*")
            .single();

    if (result.error) {
      setMessage(`Não foi possível salvar o cliente: ${result.error.message}`);
      setIsSaving(false);
      return;
    }

    setClientEditor(null);
    setSelectedClientId((result.data as Client).id);
    setMessage(clientEditor === "new" ? "Cliente criado." : "Cliente atualizado.");
    setIsSaving(false);
    await loadClients();
  }

  async function removeClient(client: Client) {
    if (!supabase) return;
    const confirmed = window.confirm(
      `Remover “${client.trade_name || client.legal_name}” e todas as propostas vinculadas?`,
    );
    if (!confirmed) return;

    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    if (error) {
      setMessage(`Não foi possível remover o cliente: ${error.message}`);
      return;
    }
    setMessage("Cliente e propostas vinculadas foram removidos.");
    await loadClients();
  }

  function openNewProposal() {
    if (!selectedClient) return;
    setProposalDraft(createEmptyProposal());
    setProposalEditor("new");
    setMessage("");
  }

  function openEditProposal(proposal: Proposal) {
    setProposalDraft(proposalToDraft(proposal));
    setProposalEditor(proposal);
    setMessage("");
  }

  function updateProposalItem(index: number, field: keyof ProposalItemDraft, value: string) {
    setProposalDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  }

  function addProposalItem() {
    setProposalDraft((current) => ({
      ...current,
      items: [...current.items, { description: "", quantity: "1", unit_price: "" }],
    }));
  }

  function removeProposalItem(index: number) {
    setProposalDraft((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function saveProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !selectedClient || !proposalEditor) return;

    if (proposalDraft.items.length === 0) {
      setMessage("Adicione pelo menos um serviço à proposta.");
      return;
    }

    setIsSaving(true);
    setMessage("");

    const proposalPayload = {
      client_id: selectedClient.id,
      proposal_number: proposalDraft.proposal_number.trim(),
      title: proposalDraft.title.trim(),
      status: proposalDraft.status,
      issue_date: proposalDraft.issue_date,
      valid_until: proposalDraft.valid_until || null,
      payment_terms: proposalDraft.payment_terms.trim() || null,
      notes: proposalDraft.notes.trim() || null,
      discount: Number(proposalDraft.discount) || 0,
      tax_percentage: Number(proposalDraft.tax_percentage) || 0,
    };

    let proposalId: string;

    if (proposalEditor === "new") {
      const { data, error } = await supabase
        .from("proposals")
        .insert(proposalPayload)
        .select("id")
        .single();
      if (error || !data) {
        setMessage(`Não foi possível salvar a proposta: ${error?.message ?? "erro desconhecido"}`);
        setIsSaving(false);
        return;
      }
      proposalId = data.id;
    } else {
      proposalId = proposalEditor.id;
      const { error } = await supabase
        .from("proposals")
        .update(proposalPayload)
        .eq("id", proposalId);
      if (error) {
        setMessage(`Não foi possível atualizar a proposta: ${error.message}`);
        setIsSaving(false);
        return;
      }
    }

    const itemPayloads = proposalDraft.items.map((item, position) => ({
      ...(item.id ? { id: item.id } : {}),
      proposal_id: proposalId,
      description: item.description.trim(),
      quantity: item.quantity.trim() === "" ? null : Number(item.quantity),
      unit_price: Number(item.unit_price),
      position,
    }));

    const existingItems = itemPayloads.filter((item) => "id" in item);
    const newItems = itemPayloads.filter((item) => !("id" in item));

    if (existingItems.length) {
      const { error } = await supabase.from("proposal_items").upsert(existingItems);
      if (error) {
        setMessage(`A proposta foi salva, mas os serviços não foram atualizados: ${error.message}`);
        setIsSaving(false);
        return;
      }
    }

    if (newItems.length) {
      const { error } = await supabase.from("proposal_items").insert(newItems);
      if (error) {
        setMessage(`A proposta foi salva, mas os novos serviços não foram incluídos: ${error.message}`);
        setIsSaving(false);
        return;
      }
    }

    if (proposalEditor !== "new") {
      const keptIds = proposalDraft.items.flatMap((item) => (item.id ? [item.id] : []));
      const removedIds = proposalEditor.proposal_items
        .map((item) => item.id)
        .filter((id) => !keptIds.includes(id));
      if (removedIds.length) {
        const { error } = await supabase.from("proposal_items").delete().in("id", removedIds);
        if (error) {
          setMessage(`A proposta foi atualizada, mas um serviço removido permaneceu: ${error.message}`);
          setIsSaving(false);
          return;
        }
      }
    }

    setProposalEditor(null);
    setMessage(proposalEditor === "new" ? "Proposta criada." : "Proposta atualizada.");
    setIsSaving(false);
    await loadProposals(selectedClient.id);
  }

  async function removeProposal(proposal: Proposal) {
    if (!supabase) return;
    if (!window.confirm(`Remover a proposta “${proposal.proposal_number}”?`)) return;
    const { error } = await supabase.from("proposals").delete().eq("id", proposal.id);
    if (error) {
      setMessage(`Não foi possível remover a proposta: ${error.message}`);
      return;
    }
    setMessage("Proposta removida.");
    await loadProposals(selectedClientId);
  }

  return (
    <div className="clients-page">
      <header className="module-page-header">
        <div>
          <a className="back-to-hub" href="#/">
            <span aria-hidden="true">←</span>
            Voltar ao hub
          </a>
          <p className="brand-kicker">Clientes e orçamentos</p>
          <h1>Clientes e propostas</h1>
          <p>Organize os dados comerciais, monte propostas e exporte documentos prontos para envio.</p>
        </div>
        <div className="account-box">
          <span>{userEmail}</span>
          <button type="button" onClick={onSignOut}>Sair</button>
        </div>
      </header>

      <div className="clients-toolbar">
        <label className="client-search">
          <span>Buscar cliente</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nome, contato ou e-mail"
          />
        </label>
        <button type="button" className="primary-action" onClick={openNewClient}>
          + Criar cliente
        </button>
      </div>

      <p className="module-message" role="status" aria-live="polite">{message}</p>

      <div className="clients-layout">
        <aside className="client-list-panel" aria-label="Clientes cadastrados">
          <div className="panel-heading">
            <div>
              <p className="section-eyebrow">Base comercial</p>
              <h2>Clientes</h2>
            </div>
            <span>{filteredClients.length}</span>
          </div>

          {isLoadingClients ? <p className="panel-placeholder">Carregando clientes…</p> : null}
          {!isLoadingClients && filteredClients.length === 0 ? (
            <div className="panel-placeholder">
              <strong>Nenhum cliente encontrado.</strong>
              <span>Crie o primeiro cadastro para começar.</span>
            </div>
          ) : null}
          <ul className="client-list">
            {filteredClients.map((client) => (
              <li key={client.id}>
                <button
                  type="button"
                  className={client.id === selectedClientId ? "selected" : ""}
                  onClick={() => setSelectedClientId(client.id)}
                >
                  <span className="client-avatar" aria-hidden="true">
                    {(client.trade_name || client.legal_name).slice(0, 2).toLocaleUpperCase("pt-BR")}
                  </span>
                  <span>
                    <strong>{client.trade_name || client.legal_name}</strong>
                    <small>{client.contact_name || client.email || client.legal_name}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="client-detail-panel">
          {selectedClient ? (
            <>
              <section className="client-detail-header">
                <div>
                  <p className="section-eyebrow">Cliente selecionado</p>
                  <h2>{selectedClient.trade_name || selectedClient.legal_name}</h2>
                  {selectedClient.trade_name ? <p>{selectedClient.legal_name}</p> : null}
                </div>
                <div className="compact-actions">
                  <button type="button" onClick={() => openEditClient(selectedClient)}>Editar</button>
                  <button type="button" className="danger-action" onClick={() => removeClient(selectedClient)}>Remover</button>
                </div>
              </section>

              <dl className="client-facts">
                <div>
                  <dt>Contato</dt>
                  <dd>{selectedClient.contact_name || "Não informado"}</dd>
                </div>
                <div>
                  <dt>E-mail</dt>
                  <dd>{selectedClient.email || "Não informado"}</dd>
                </div>
                <div>
                  <dt>Telefone</dt>
                  <dd>{selectedClient.phone || "Não informado"}</dd>
                </div>
                <div>
                  <dt>CPF/CNPJ</dt>
                  <dd>{selectedClient.tax_id || "Não informado"}</dd>
                </div>
              </dl>

              <section className="proposals-section">
                <div className="proposals-heading">
                  <div>
                    <p className="section-eyebrow">Histórico comercial</p>
                    <h2>Propostas</h2>
                  </div>
                  <button type="button" className="primary-action" onClick={openNewProposal}>
                    + Criar proposta
                  </button>
                </div>

                {isLoadingProposals ? <p className="panel-placeholder">Carregando propostas…</p> : null}
                {!isLoadingProposals && proposals.length === 0 ? (
                  <div className="proposal-empty-state">
                    <strong>Nenhuma proposta para este cliente.</strong>
                    <span>Crie uma proposta com serviços, quantidades e valores.</span>
                  </div>
                ) : null}

                {proposals.length ? (
                  <div className="proposal-table-wrap">
                    <table className="proposal-table">
                      <thead>
                        <tr>
                          <th>Proposta</th>
                          <th>Emissão</th>
                          <th>Status</th>
                          <th>Valor</th>
                          <th><span className="sr-only">Ações</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {proposals.map((proposal) => (
                          <tr key={proposal.id}>
                            <td>
                              <strong>{proposal.title}</strong>
                              <span>{proposal.proposal_number}</span>
                            </td>
                            <td>{formatDate(proposal.issue_date)}</td>
                            <td><span className={`proposal-status ${proposal.status}`}>{statusLabels[proposal.status]}</span></td>
                            <td>{currencyFormatter.format(getProposalTotal(proposal))}</td>
                            <td>
                              <div className="table-actions">
                                <button type="button" onClick={() => setPreviewProposal(proposal)}>Visualizar</button>
                                <button type="button" onClick={() => openEditProposal(proposal)}>Editar</button>
                                <button type="button" className="danger-action" onClick={() => removeProposal(proposal)}>Remover</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </section>
            </>
          ) : (
            <div className="client-detail-empty">
              <span aria-hidden="true">+</span>
              <h2>Crie um cliente para começar</h2>
              <p>As propostas ficarão organizadas dentro do cadastro de cada cliente.</p>
              <button type="button" className="primary-action" onClick={openNewClient}>Criar cliente</button>
            </div>
          )}
        </main>
      </div>

      {clientEditor ? (
        <div className="form-modal-backdrop" role="presentation">
          <section className="form-modal" role="dialog" aria-modal="true" aria-labelledby="client-form-title">
            <div className="form-modal-heading">
              <div>
                <p className="section-eyebrow">Cadastro comercial</p>
                <h2 id="client-form-title">{clientEditor === "new" ? "Criar cliente" : "Editar cliente"}</h2>
              </div>
              <button type="button" className="modal-close-button" onClick={() => setClientEditor(null)} aria-label="Fechar">×</button>
            </div>
            <form onSubmit={saveClient}>
              <div className="field-grid">
                <label className="field-wide">
                  <span>Razão social ou nome completo *</span>
                  <input required value={clientDraft.legal_name} onChange={(event) => setClientDraft({ ...clientDraft, legal_name: event.target.value })} />
                </label>
                <label>
                  <span>Nome fantasia</span>
                  <input value={clientDraft.trade_name} onChange={(event) => setClientDraft({ ...clientDraft, trade_name: event.target.value })} />
                </label>
                <label>
                  <span>CPF/CNPJ</span>
                  <input value={clientDraft.tax_id} onChange={(event) => setClientDraft({ ...clientDraft, tax_id: event.target.value })} />
                </label>
                <label>
                  <span>Pessoa de contato</span>
                  <input value={clientDraft.contact_name} onChange={(event) => setClientDraft({ ...clientDraft, contact_name: event.target.value })} />
                </label>
                <label>
                  <span>E-mail</span>
                  <input type="email" value={clientDraft.email} onChange={(event) => setClientDraft({ ...clientDraft, email: event.target.value })} />
                </label>
                <label>
                  <span>Telefone</span>
                  <input value={clientDraft.phone} onChange={(event) => setClientDraft({ ...clientDraft, phone: event.target.value })} />
                </label>
                <label className="field-wide">
                  <span>Endereço</span>
                  <input value={clientDraft.address} onChange={(event) => setClientDraft({ ...clientDraft, address: event.target.value })} />
                </label>
                <label>
                  <span>Cidade</span>
                  <input value={clientDraft.city} onChange={(event) => setClientDraft({ ...clientDraft, city: event.target.value })} />
                </label>
                <label>
                  <span>Estado</span>
                  <input maxLength={2} value={clientDraft.state} onChange={(event) => setClientDraft({ ...clientDraft, state: event.target.value.toLocaleUpperCase("pt-BR") })} />
                </label>
                <label>
                  <span>CEP</span>
                  <input value={clientDraft.postal_code} onChange={(event) => setClientDraft({ ...clientDraft, postal_code: event.target.value })} />
                </label>
                <label className="field-wide">
                  <span>Observações internas</span>
                  <textarea rows={3} value={clientDraft.notes} onChange={(event) => setClientDraft({ ...clientDraft, notes: event.target.value })} />
                </label>
              </div>
              <div className="form-modal-actions">
                <button type="button" className="secondary-action" onClick={() => setClientEditor(null)}>Cancelar</button>
                <button type="submit" className="primary-action" disabled={isSaving}>{isSaving ? "Salvando…" : "Salvar cliente"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {proposalEditor && selectedClient ? (
        <div className="form-modal-backdrop" role="presentation">
          <section className="form-modal proposal-form-modal" role="dialog" aria-modal="true" aria-labelledby="proposal-form-title">
            <div className="form-modal-heading">
              <div>
                <p className="section-eyebrow">{selectedClient.trade_name || selectedClient.legal_name}</p>
                <h2 id="proposal-form-title">{proposalEditor === "new" ? "Criar proposta" : "Editar proposta"}</h2>
              </div>
              <button type="button" className="modal-close-button" onClick={() => setProposalEditor(null)} aria-label="Fechar">×</button>
            </div>
            <form onSubmit={saveProposal}>
              <div className="field-grid proposal-main-fields">
                <label className="field-wide">
                  <span>Título da proposta *</span>
                  <input required value={proposalDraft.title} onChange={(event) => setProposalDraft({ ...proposalDraft, title: event.target.value })} placeholder="Ex.: Audiodescrição de mostra cultural" />
                </label>
                <label>
                  <span>Número da proposta *</span>
                  <input required value={proposalDraft.proposal_number} onChange={(event) => setProposalDraft({ ...proposalDraft, proposal_number: event.target.value })} />
                </label>
                <label>
                  <span>Status</span>
                  <select value={proposalDraft.status} onChange={(event) => setProposalDraft({ ...proposalDraft, status: event.target.value as ProposalStatus })}>
                    {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Data de emissão *</span>
                  <input required type="date" value={proposalDraft.issue_date} onChange={(event) => setProposalDraft({ ...proposalDraft, issue_date: event.target.value })} />
                </label>
                <label>
                  <span>Válida até</span>
                  <input type="date" value={proposalDraft.valid_until} onChange={(event) => setProposalDraft({ ...proposalDraft, valid_until: event.target.value })} />
                </label>
              </div>

              <div className="proposal-items-heading">
                <div>
                  <p className="section-eyebrow">Composição</p>
                  <h3>Serviços e valores</h3>
                </div>
                <button type="button" className="secondary-action" onClick={addProposalItem}>+ Adicionar serviço</button>
              </div>

              <div className="proposal-items-editor">
                {proposalDraft.items.map((item, index) => (
                  <div className="proposal-item-editor" key={item.id ?? index}>
                    <label className="item-description">
                      <span>Serviço *</span>
                      <input required value={item.description} onChange={(event) => updateProposalItem(index, "description", event.target.value)} placeholder="Descrição do serviço" />
                    </label>
                    <label>
                      <span>Quantidade</span>
                      <input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateProposalItem(index, "quantity", event.target.value)} placeholder="N/A" />
                    </label>
                    <label>
                      <span>Preço unitário *</span>
                      <input required type="number" min="0" step="0.01" value={item.unit_price} onChange={(event) => updateProposalItem(index, "unit_price", event.target.value)} placeholder="0,00" />
                    </label>
                    <div className="item-total">
                      <span>Valor</span>
                      <strong>{currencyFormatter.format((item.quantity.trim() === "" ? 1 : Number(item.quantity)) * (Number(item.unit_price) || 0))}</strong>
                    </div>
                    <button type="button" className="remove-item-button" onClick={() => removeProposalItem(index)} disabled={proposalDraft.items.length === 1} aria-label={`Remover serviço ${index + 1}`}>×</button>
                  </div>
                ))}
              </div>

              <div className="proposal-financial-fields">
                <label>
                  <span>Desconto em reais</span>
                  <input type="number" min="0" step="0.01" value={proposalDraft.discount} onChange={(event) => setProposalDraft({ ...proposalDraft, discount: event.target.value })} />
                </label>
                <label>
                  <span>Impostos (%)</span>
                  <input type="number" min="0" max="100" step="0.001" value={proposalDraft.tax_percentage} onChange={(event) => setProposalDraft({ ...proposalDraft, tax_percentage: event.target.value })} />
                </label>
                <div>
                  <span>Total da proposta</span>
                  <strong>{currencyFormatter.format(getDraftTotal(proposalDraft))}</strong>
                </div>
              </div>

              <div className="field-grid proposal-notes-fields">
                <label>
                  <span>Condições de pagamento</span>
                  <textarea rows={3} value={proposalDraft.payment_terms} onChange={(event) => setProposalDraft({ ...proposalDraft, payment_terms: event.target.value })} placeholder="Ex.: 50% na aprovação e 50% na entrega" />
                </label>
                <label>
                  <span>Observações da proposta</span>
                  <textarea rows={3} value={proposalDraft.notes} onChange={(event) => setProposalDraft({ ...proposalDraft, notes: event.target.value })} placeholder="Prazos, escopo e instruções especiais" />
                </label>
              </div>

              <div className="form-modal-actions">
                <button type="button" className="secondary-action" onClick={() => setProposalEditor(null)}>Cancelar</button>
                <button type="submit" className="primary-action" disabled={isSaving}>{isSaving ? "Salvando…" : "Salvar proposta"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {previewProposal && selectedClient ? (
        <ProposalPreview
          client={selectedClient}
          proposal={previewProposal}
          preparedBy={userEmail}
          onClose={() => setPreviewProposal(null)}
        />
      ) : null}
    </div>
  );
}
