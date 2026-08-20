import { type FormEvent, useState } from "react";
import { contractStatusLabels, projectStatusFromContract } from "../lib/contracts";
import { supabase } from "../lib/supabase";
import type { Contract, ContractStatus } from "../types";

type ContractEditDialogProps = {
  contract: Contract;
  projectName: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

export default function ContractEditDialog({
  contract,
  projectName,
  onClose,
  onSaved,
}: ContractEditDialogProps) {
  const [draft, setDraft] = useState({
    projectName,
    title: contract.title,
    contractNumber: contract.contract_number || "",
    status: contract.status,
    effectiveDate: contract.effective_date || "",
    expiresAt: contract.expires_at || "",
    signedAt: contract.signed_at || "",
    totalValue: contract.total_value === null ? "" : String(contract.total_value),
    serviceDescription: contract.service_description || "",
    paymentTerms: contract.payment_terms || "",
  });
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    if (!draft.projectName.trim() || !draft.title.trim()) {
      setMessage("Informe o nome do projeto e o título do contrato.");
      return;
    }

    setIsSaving(true);
    setMessage("");

    const { error: contractError } = await supabase
      .from("contracts")
      .update({
        title: draft.title.trim(),
        contract_number: draft.contractNumber.trim() || null,
        status: draft.status,
        effective_date: draft.effectiveDate || null,
        expires_at: draft.expiresAt || null,
        signed_at: draft.signedAt || null,
        total_value: draft.totalValue === "" ? null : Number(draft.totalValue),
        service_description: draft.serviceDescription.trim() || null,
        payment_terms: draft.paymentTerms.trim() || null,
      })
      .eq("id", contract.id);

    if (contractError) {
      setMessage(`Não foi possível editar o contrato: ${contractError.message}`);
      setIsSaving(false);
      return;
    }

    const { error: projectError } = await supabase
      .from("projects")
      .update({
        name: draft.projectName.trim(),
        status: projectStatusFromContract(draft.status),
        start_date: draft.effectiveDate || null,
        end_date: draft.expiresAt || null,
      })
      .eq("id", contract.project_id);

    if (projectError) {
      setMessage(`O contrato foi salvo, mas o projeto não pôde ser atualizado: ${projectError.message}`);
      setIsSaving(false);
      return;
    }

    await onSaved();
    onClose();
  }

  return (
    <div className="form-modal-backdrop" role="presentation">
      <section className="form-modal contract-edit-modal" role="dialog" aria-modal="true" aria-labelledby="contract-edit-title">
        <div className="form-modal-heading">
          <div>
            <p className="section-eyebrow">Contrato e projeto</p>
            <h2 id="contract-edit-title">Editar contrato</h2>
          </div>
          <button type="button" className="modal-close-button" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <form onSubmit={save}>
          <div className="field-grid contract-edit-fields">
            <label className="field-wide">
              <span>Nome do projeto *</span>
              <input required value={draft.projectName} onChange={(event) => setDraft((current) => ({ ...current, projectName: event.target.value }))} />
            </label>
            <label className="field-wide">
              <span>Título do contrato *</span>
              <input required value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
            </label>
            <label>
              <span>Número do contrato</span>
              <input value={draft.contractNumber} onChange={(event) => setDraft((current) => ({ ...current, contractNumber: event.target.value }))} />
            </label>
            <label>
              <span>Status do contrato</span>
              <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as ContractStatus }))}>
                {Object.entries(contractStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              <span>Início da vigência</span>
              <input type="date" value={draft.effectiveDate} onChange={(event) => setDraft((current) => ({ ...current, effectiveDate: event.target.value }))} />
            </label>
            <label>
              <span>Fim da vigência</span>
              <input type="date" min={draft.effectiveDate || undefined} value={draft.expiresAt} onChange={(event) => setDraft((current) => ({ ...current, expiresAt: event.target.value }))} />
            </label>
            <label>
              <span>Data da assinatura</span>
              <input type="date" value={draft.signedAt} onChange={(event) => setDraft((current) => ({ ...current, signedAt: event.target.value }))} />
            </label>
            <label>
              <span>Valor total</span>
              <input type="number" min="0" step="0.01" value={draft.totalValue} onChange={(event) => setDraft((current) => ({ ...current, totalValue: event.target.value }))} />
            </label>
            <label className="field-wide">
              <span>Objeto e serviços</span>
              <textarea rows={4} value={draft.serviceDescription} onChange={(event) => setDraft((current) => ({ ...current, serviceDescription: event.target.value }))} />
            </label>
            <label className="field-wide">
              <span>Condições de pagamento</span>
              <textarea rows={3} value={draft.paymentTerms} onChange={(event) => setDraft((current) => ({ ...current, paymentTerms: event.target.value }))} />
            </label>
          </div>

          <p className="module-message" role="status" aria-live="polite">{message}</p>
          <div className="form-modal-actions">
            <button type="button" className="secondary-action" onClick={onClose} disabled={isSaving}>Cancelar</button>
            <button type="submit" className="primary-action" disabled={isSaving}>{isSaving ? "Salvando..." : "Salvar alterações"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
