export type AudioWork = {
  id: string;
  drive_file_id: string;
  drive_url: string;
  title: string;
  mime_type: string;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DriveMetadata = {
  fileId: string;
  title: string;
  mimeType: string;
  size: string | null;
};

export type Client = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  tax_id: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProposalStatus =
  | "draft"
  | "sent"
  | "approved"
  | "rejected"
  | "expired";

export type ProposalItem = {
  id: string;
  proposal_id: string;
  description: string;
  quantity: number | null;
  unit_price: number;
  position: number;
  created_at: string;
};

export type Proposal = {
  id: string;
  client_id: string;
  proposal_number: string;
  title: string;
  status: ProposalStatus;
  issue_date: string;
  valid_until: string | null;
  payment_terms: string | null;
  notes: string | null;
  discount: number;
  tax_percentage: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  proposal_items: ProposalItem[];
};
