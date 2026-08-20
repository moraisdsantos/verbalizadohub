import type { ContractStatus, ProjectStatus } from "../types";

export const contractStatusLabels: Record<ContractStatus, string> = {
  draft: "Rascunho",
  review: "Em revisão",
  signed: "Assinado",
  active: "Vigente",
  expired: "Encerrado",
  cancelled: "Cancelado",
};

export function projectStatusFromContract(status: ContractStatus): ProjectStatus {
  if (status === "active") return "active";
  if (status === "expired") return "completed";
  if (status === "cancelled") return "cancelled";
  return "planning";
}
