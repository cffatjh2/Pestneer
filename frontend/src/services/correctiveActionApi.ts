export type CorrectiveActionEvidence = { id: string; stage: 'Before' | 'After' | 'Supporting'; fileName: string; contentType: string; note?: string; createdAt: string; uploadedBy: string; downloadUrl: string };
export type CorrectiveActionHistory = { id: string; fromStatus?: string; toStatus: string; note?: string; occurredAt: string; changedBy: string };
export type CorrectiveAction = {
  id: string; number: string; sourceType: string; sourceId?: string; category: string; title: string; problem: string; rootCause?: string;
  proposedAction: string; responsibleParty: 'Customer' | 'Company' | 'Joint'; priority: 'Low' | 'Normal' | 'High' | 'Critical';
  status: 'Open' | 'InProgress' | 'AwaitingCustomer' | 'Completed' | 'Verified' | 'Rejected' | 'Cancelled'; dueDate: string; isOverdue: boolean;
  customerId: string; customerName: string; branchId?: string; branchName: string; assignedAccountId?: string; assignedAccountName?: string;
  customerApprovalStatus: 'Pending' | 'Approved' | 'Rejected'; customerApprovalAt?: string; customerApprovalNote?: string; recurrenceCount: number;
  createdAt: string; updatedAt: string; completedAt?: string; verifiedAt?: string; evidence: CorrectiveActionEvidence[]; history: CorrectiveActionHistory[];
};
export type CreateCorrectiveActionInput = {
  customerId: string; branchId?: string; category: string; title: string; problem: string; rootCause?: string; proposedAction: string;
  responsibleParty: CorrectiveAction['responsibleParty']; assignedAccountId?: string; priority: CorrectiveAction['priority']; dueDate: string; recurrenceKey?: string; note?: string;
};
export type UpdateCorrectiveActionInput = Pick<CreateCorrectiveActionInput, 'title' | 'problem' | 'rootCause' | 'proposedAction' | 'responsibleParty' | 'assignedAccountId' | 'priority' | 'dueDate' | 'note'> & { status: CorrectiveAction['status'] };

export class CorrectiveActionSessionExpiredError extends Error {
  constructor(message = 'Oturumunuz güncel değil. Lütfen yeniden giriş yapın.') { super(message); this.name = 'CorrectiveActionSessionExpiredError'; }
}

export const getCorrectiveActions = (token: string) => request<CorrectiveAction[]>('/api/corrective-actions/', token);
export const createCorrectiveAction = (token: string, input: CreateCorrectiveActionInput) => request<CorrectiveAction>('/api/corrective-actions/', token, { method: 'POST', body: JSON.stringify(input) });
export const updateCorrectiveAction = (token: string, id: string, input: UpdateCorrectiveActionInput) => request<CorrectiveAction>(`/api/corrective-actions/${id}`, token, { method: 'PUT', body: JSON.stringify(input) });
export const approveCorrectiveAction = (token: string, id: string, approved: boolean, note?: string) => request<CorrectiveAction>(`/api/customer/portal/corrective-actions/${id}/approval`, token, { method: 'POST', body: JSON.stringify({ approved, note }) });

export async function uploadCorrectiveActionEvidence(token: string, id: string, file: File, stage: CorrectiveActionEvidence['stage'], note?: string, customer = false) {
  const form = new FormData(); form.append('file', file); form.append('stage', stage); if (note) form.append('note', note);
  return request<CorrectiveActionEvidence>(customer ? `/api/customer/portal/corrective-actions/${id}/evidence` : `/api/corrective-actions/${id}/evidence`, token, { method: 'POST', body: form }, false);
}

export async function downloadCorrectiveActionEvidence(token: string, evidence: CorrectiveActionEvidence) {
  const response = await fetch(evidence.downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 || response.status === 403) throw new CorrectiveActionSessionExpiredError();
  if (!response.ok) throw new Error('Kanıt dosyası açılamadı.');
  const url = URL.createObjectURL(await response.blob()); window.open(url, '_blank', 'noopener,noreferrer'); window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function request<T>(path: string, token: string, init?: RequestInit, json = true): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { ...init, headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...init?.headers } }); }
  catch { throw new Error('Düzeltici faaliyet servisine ulaşılamıyor.'); }
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { message?: string; detail?: string; errors?: Record<string, string[]> } | null;
    const validation = problem?.errors ? Object.values(problem.errors).flat()[0] : undefined;
    if (response.status === 401 || response.status === 403) throw new CorrectiveActionSessionExpiredError(problem?.message);
    throw new Error(problem?.message ?? problem?.detail ?? validation ?? 'İşlem tamamlanamadı.');
  }
  return response.json() as Promise<T>;
}
