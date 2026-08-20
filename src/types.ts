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

export type ProjectStatus =
  | "planning"
  | "active"
  | "paused"
  | "completed"
  | "cancelled";

export type Project = {
  id: string;
  client_id: string;
  name: string;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractSource = "pdf" | "proposal" | "manual";

export type ContractStatus =
  | "draft"
  | "review"
  | "signed"
  | "active"
  | "expired"
  | "cancelled";

export type Contract = {
  id: string;
  project_id: string;
  client_id: string;
  proposal_id: string | null;
  source: ContractSource;
  title: string;
  contract_number: string | null;
  status: ContractStatus;
  drive_file_id: string;
  drive_url: string;
  drive_mime_type: string;
  effective_date: string | null;
  expires_at: string | null;
  signed_at: string | null;
  total_value: number | null;
  service_description: string | null;
  payment_terms: string | null;
  client_data: Record<string, unknown>;
  extracted_data: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractFields = {
  title: string | null;
  contract_number: string | null;
  client_legal_name: string | null;
  client_trade_name: string | null;
  client_tax_id: string | null;
  client_contact_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_address: string | null;
  client_city: string | null;
  client_state: string | null;
  client_postal_code: string | null;
  service_description: string | null;
  effective_date: string | null;
  expires_at: string | null;
  signed_at: string | null;
  total_value: number | null;
  payment_terms: string | null;
};

export type ProjectStageStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "blocked";

export type ProjectStage = {
  id: string;
  project_id: string;
  title: string;
  icon: string;
  status: ProjectStageStatus;
  start_date: string;
  end_date: string;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectActionStatus = "pending" | "completed" | "cancelled";

export type ProjectAction = {
  id: string;
  project_id: string;
  stage_id: string | null;
  description: string;
  assignee: string | null;
  due_date: string;
  status: ProjectActionStatus;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectCostStatus = "planned" | "paid";

export type ProjectCost = {
  id: string;
  project_id: string;
  description: string;
  category: string;
  amount: number;
  incurred_on: string;
  status: ProjectCostStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
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

export type ProjectStatus =
  | "planning"
  | "active"
  | "paused"
  | "completed"
  | "cancelled";

export type Project = {
  id: string;
  client_id: string;
  name: string;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractSource = "pdf" | "proposal" | "manual";

export type ContractStatus =
  | "draft"
  | "review"
  | "signed"
  | "active"
  | "expired"
  | "cancelled";

export type Contract = {
  id: string;
  project_id: string;
  client_id: string;
  proposal_id: string | null;
  source: ContractSource;
  title: string;
  contract_number: string | null;
  status: ContractStatus;
  drive_file_id: string;
  drive_url: string;
  drive_mime_type: string;
  effective_date: string | null;
  expires_at: string | null;
  signed_at: string | null;
  total_value: number | null;
  service_description: string | null;
  payment_terms: string | null;
  client_data: Record<string, unknown>;
  extracted_data: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractFields = {
  title: string | null;
  contract_number: string | null;
  client_legal_name: string | null;
  client_trade_name: string | null;
  client_tax_id: string | null;
  client_contact_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  client_address: string | null;
  client_city: string | null;
  client_state: string | null;
  client_postal_code: string | null;
  service_description: string | null;
  effective_date: string | null;
  expires_at: string | null;
  signed_at: string | null;
  total_value: number | null;
  payment_terms: string | null;
};

export type ProjectStageStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "blocked";

export type ProjectStage = {
  id: string;
  project_id: string;
  title: string;
  icon: string;
  status: ProjectStageStatus;
  start_date: string;
  end_date: string;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectActionStatus = "pending" | "completed" | "cancelled";

export type ProjectAction = {
  id: string;
  project_id: string;
  stage_id: string | null;
  description: string;
  assignee: string | null;
  due_date: string;
  status: ProjectActionStatus;
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectCostStatus = "planned" | "paid";

export type ProjectCost = {
  id: string;
  project_id: string;
  description: string;
  category: string;
  amount: number;
  incurred_on: string;
  status: ProjectCostStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
