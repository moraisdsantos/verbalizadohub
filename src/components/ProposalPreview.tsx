import type { Client, Proposal } from "../types";

type ProposalPreviewProps = {
  client: Client;
  proposal: Proposal;
  preparedBy: string;
  onClose: () => void;
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const numberFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value}T12:00:00Z`),
  );
}

function getSubtotal(proposal: Proposal) {
  return proposal.proposal_items.reduce(
    (total, item) => total + (item.quantity ?? 1) * Number(item.unit_price),
    0,
  );
}

export default function ProposalPreview({
  client,
  proposal,
  preparedBy,
  onClose,
}: ProposalPreviewProps) {
  const logoUrl = `${import.meta.env.BASE_URL}verbalizado-horizontal.png`;
  const subtotal = getSubtotal(proposal);
  const discountedSubtotal = Math.max(0, subtotal - Number(proposal.discount));
  const tax = discountedSubtotal * (Number(proposal.tax_percentage) / 100);
  const total = discountedSubtotal + tax;
  const clientAddress = [
    client.address,
    [client.city, client.state].filter(Boolean).join(" / "),
    client.postal_code,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="proposal-preview-backdrop" role="presentation">
      <div
        className="proposal-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="proposal-preview-title"
      >
        <div className="proposal-preview-toolbar">
          <div>
            <span>Visualização da proposta</span>
            <strong id="proposal-preview-title">{proposal.proposal_number}</strong>
          </div>
          <div>
            <button type="button" className="secondary-action" onClick={onClose}>
              Fechar
            </button>
            <button type="button" className="primary-action" onClick={() => window.print()}>
              Exportar / salvar PDF
            </button>
          </div>
        </div>

        <article className="proposal-print-area">
          <header className="proposal-document-header">
            <img src={logoUrl} alt="ver.balizado — acessibilidade comunicacional" />
            <div>
              <span>Proposta comercial</span>
              <strong>{proposal.proposal_number}</strong>
            </div>
          </header>

          <section className="proposal-document-summary">
            <div>
              <p className="document-label">Proposta para</p>
              <h1>{client.trade_name || client.legal_name}</h1>
              {client.trade_name ? <p>{client.legal_name}</p> : null}
              {client.tax_id ? <p>CPF/CNPJ: {client.tax_id}</p> : null}
              {clientAddress ? <p>{clientAddress}</p> : null}
              {client.contact_name ? <p>Aos cuidados de {client.contact_name}</p> : null}
              {[client.email, client.phone].filter(Boolean).length ? (
                <p>{[client.email, client.phone].filter(Boolean).join(" · ")}</p>
              ) : null}
            </div>
            <dl>
              <div>
                <dt>Data de emissão</dt>
                <dd>{formatDate(proposal.issue_date)}</dd>
              </div>
              <div>
                <dt>Válida até</dt>
                <dd>{formatDate(proposal.valid_until)}</dd>
              </div>
              <div>
                <dt>Preparada por</dt>
                <dd>{preparedBy}</dd>
              </div>
            </dl>
          </section>

          <section className="proposal-document-title">
            <p className="document-label">Objeto da proposta</p>
            <h2>{proposal.title}</h2>
          </section>

          <table className="proposal-document-table">
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Quantidade</th>
                <th>Preço unitário</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {proposal.proposal_items.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td>{item.quantity === null ? "Não aplicável" : numberFormatter.format(item.quantity)}</td>
                  <td>{currencyFormatter.format(Number(item.unit_price))}</td>
                  <td>{currencyFormatter.format((item.quantity ?? 1) * Number(item.unit_price))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className="proposal-document-bottom">
            <div className="proposal-document-notes">
              {proposal.payment_terms ? (
                <div>
                  <p className="document-label">Condições de pagamento</p>
                  <p>{proposal.payment_terms}</p>
                </div>
              ) : null}
              {proposal.notes ? (
                <div>
                  <p className="document-label">Observações</p>
                  <p>{proposal.notes}</p>
                </div>
              ) : null}
            </div>

            <dl className="proposal-document-totals">
              <div>
                <dt>Subtotal</dt>
                <dd>{currencyFormatter.format(subtotal)}</dd>
              </div>
              {Number(proposal.discount) > 0 ? (
                <div>
                  <dt>Desconto</dt>
                  <dd>− {currencyFormatter.format(Number(proposal.discount))}</dd>
                </div>
              ) : null}
              {Number(proposal.tax_percentage) > 0 ? (
                <div>
                  <dt>Impostos ({numberFormatter.format(Number(proposal.tax_percentage))}%)</dt>
                  <dd>{currencyFormatter.format(tax)}</dd>
                </div>
              ) : null}
              <div className="proposal-total-row">
                <dt>Total</dt>
                <dd>{currencyFormatter.format(total)}</dd>
              </div>
            </dl>
          </section>

          <footer className="proposal-document-footer">
            <strong>ver.balizado</strong>
            <span>Acessibilidade comunicacional</span>
          </footer>
        </article>
      </div>
    </div>
  );
}
