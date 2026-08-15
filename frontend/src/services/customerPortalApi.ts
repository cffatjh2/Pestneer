import { apiFetch } from './apiBase';

export type CustomerPortalBranch = { id: string; name: string; code: string; address: string; city?: string; district?: string; phoneNumber?: string; email?: string; mapUrl?: string };
export type CustomerPortalWorkOrder = { id: string; number: string; branchId?: string; branchName: string; serviceType: string; visitType: string; scheduledAt: string; durationMinutes: number; status: string; employeeName: string; customerDurationMinutes?: number; totalLaborMinutes: number; completionNote?: string; recommendation?: string };
export type RequestHistory = { status: string; note?: string; occurredAt: string; changedBy: string };
export type EmergencyRequestRecord = { id: string; number: string; customerId: string; customerName: string; branchId?: string; branchName: string; requestType: string; subject: string; serviceType: string; contractId?: string; contractCoverage: string; chargeAmount: number; slaDueAt?: string; priority: string; status: string; description: string; contactPhone?: string; assignedEmployeeAccountId?: string; employeeName: string; requestedAt: string; dueAt?: string; requestedAppointmentAt?: string; closureApprovalStatus: string; closureApprovedAt?: string; closureApprovalNote?: string; acknowledgedAt?: string; completedAt?: string; history: RequestHistory[] };
export type CustomerPortalSummary = { customerId: string; customerName: string; scope: 'Customer' | 'Branch'; branches: CustomerPortalBranch[]; upcomingWorkOrders: CustomerPortalWorkOrder[]; completedWorkOrders: CustomerPortalWorkOrder[]; emergencyRequests: EmergencyRequestRecord[] };
export type CustomerCommercialProposalLine = { id: string; description: string; quantity: number; unit: string; unitPrice: number; lineTotal: number };
export type CustomerCommercialProposal = { id: string; number: string; branchId?: string; branchName: string; title: string; status: string; issueDate: string; validUntil: string; currency: string; subtotal: number; discountAmount: number; vatRate: number; vatAmount: number; totalAmount: number; notes?: string; terms?: string; decisionAt?: string; decisionNote?: string; canDecide: boolean; lines: CustomerCommercialProposalLine[] };
export type CustomerContractServicePlan = { id: string; branchId?: string; branchName: string; serviceType: string; recurrenceType: string; visitsPerPeriod: number; preferredDay: number; preferredTime: string; durationMinutes: number; generatedThrough?: string };
export type CustomerCommercialContract = { id: string; number: string; branchId?: string; branchName: string; title: string; status: string; startDate: string; endDate: string; billingFrequency: string; paymentTermDays: number; periodAmount: number; currency: string; scope?: string; terms?: string; installmentCount: number; remainingBalance: number; autoRenew: boolean; renewalNoticeDays: number; annualPriceIncreaseRate: number; freeEmergencyCallsPerYear: number; extraEmergencyCallPrice: number; responseTimeHours: number; generatedWorkOrderCount: number; servicePlans: CustomerContractServicePlan[] };
export type CustomerCommercialReceivable = { id: string; number: string; branchId?: string; branchName: string; contractNumber: string; description: string; issueDate: string; dueDate: string; amount: number; paidAmount: number; balance: number; currency: string; status: string; paidAt?: string };
export type CustomerCommercialSummary = { openBalance: number; overdueCount: number; pendingProposalCount: number; proposals: CustomerCommercialProposal[]; contracts: CustomerCommercialContract[]; receivables: CustomerCommercialReceivable[] };
export type CreateEmergencyRequestInput = { branchId?: string; requestType: 'EmergencyCall' | 'Complaint' | 'NewBranch' | 'AppointmentChange' | 'DocumentRequest' | 'StructuralCompletion'; subject: string; serviceType: 'EmergencyPaid' | 'EmergencyFree' | 'Standard'; priority: 'Low' | 'Normal' | 'Urgent' | 'Critical'; description: string; contactPhone?: string; dueAt?: string; requestedAppointmentAt?: string };
export type UpdateEmergencyRequestInput = { status: string; employeeAccountId?: string; note?: string; dueAt?: string };

export class CustomerPortalSessionExpiredError extends Error {}
async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> { const response = await apiFetch(path, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } }); if (response.status === 401) throw new CustomerPortalSessionExpiredError(); if (!response.ok) { const body = await response.json().catch(() => ({})); const message = body.message ?? Object.values(body.errors ?? {}).flat()[0] ?? 'İşlem tamamlanamadı.'; throw new Error(String(message)); } if (response.status === 204) return undefined as T; return response.json(); }

export const getCustomerPortalSummary = (token: string) => request<CustomerPortalSummary>('/api/customer/portal/summary', token);
export const getCustomerCommercialSummary = (token: string) => request<CustomerCommercialSummary>('/api/customer/portal/commercial', token);
export const decideCustomerProposal = (token: string, id: string, accepted: boolean, note?: string) => request<CustomerCommercialProposal>(`/api/customer/portal/commercial/proposals/${id}/decision`, token, { method: 'POST', body: JSON.stringify({ accepted, note }) });

import { shareOrDownloadFile } from '../utils/shareUtils';


export async function downloadCustomerCommercialPdf(token: string, kind: 'proposals' | 'contracts', id: string, number: string) { const response = await apiFetch(`/api/customer/portal/commercial/${kind}/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } }); if (response.status === 401) throw new CustomerPortalSessionExpiredError(); if (!response.ok) throw new Error('PDF indirilemedi.'); const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = `${number}.pdf`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

export async function shareCustomerCommercialPdf(token: string, kind: 'proposals' | 'contracts', id: string, number: string, title?: string) {
  const response = await apiFetch(`/api/customer/portal/commercial/${kind}/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401) throw new CustomerPortalSessionExpiredError();
  if (!response.ok) throw new Error('PDF indirilemedi.');
  const blob = await response.blob();
  return await shareOrDownloadFile({
    title: title || `${number} - ${kind === 'proposals' ? 'Teklif' : 'Sözleşme'}`,
    fileName: `${number}.pdf`,
    blob,
    text: `${title || number} - Pestneer Ticari Belge`,
  });
}

export const createEmergencyRequest = (token: string, input: CreateEmergencyRequestInput) => request<EmergencyRequestRecord>('/api/customer/portal/requests', token, { method: 'POST', body: JSON.stringify(input) });
export const addCustomerRequestMessage = (token: string, id: string, message: string) => request<EmergencyRequestRecord>(`/api/customer/portal/requests/${id}/messages`, token, { method: 'POST', body: JSON.stringify({ message }) });
export const approveCustomerRequestClosure = (token: string, id: string, approved: boolean, note?: string) => request<EmergencyRequestRecord>(`/api/customer/portal/requests/${id}/closure-approval`, token, { method: 'POST', body: JSON.stringify({ approved, note }) });
export const getCompanyEmergencyRequests = (token: string) => request<EmergencyRequestRecord[]>('/api/company/requests', token);
export const updateCompanyEmergencyRequest = (token: string, id: string, input: UpdateEmergencyRequestInput) => request<EmergencyRequestRecord>(`/api/company/requests/${id}`, token, { method: 'PUT', body: JSON.stringify(input) });
export const addCompanyRequestMessage = (token: string, id: string, message: string) => request<EmergencyRequestRecord>(`/api/company/requests/${id}/messages`, token, { method: 'POST', body: JSON.stringify({ message }) });
export const getEmployeeEmergencyRequests = (token: string) => request<EmergencyRequestRecord[]>('/api/employee/requests', token);
export const updateEmployeeEmergencyRequest = (token: string, id: string, input: UpdateEmergencyRequestInput) => request<EmergencyRequestRecord>(`/api/employee/requests/${id}/status`, token, { method: 'PUT', body: JSON.stringify(input) });
