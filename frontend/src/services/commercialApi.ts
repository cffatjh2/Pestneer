import { apiFetch } from './apiBase';

export type ProposalLine = { id: string; description: string; quantity: number; unit: string; unitPrice: number; lineTotal: number };
export type Proposal = { id: string; number: string; customerId: string; customerName: string; branchId?: string; branchName: string; title: string; status: string; issueDate: string; validUntil: string; currency: string; subtotal: number; discountAmount: number; vatRate: number; vatAmount: number; totalAmount: number; notes?: string; terms?: string; customerDecisionAt?: string; customerDecisionNote?: string; createdAt: string; lines: ProposalLine[] };
export type ContractServicePlan = { id: string; branchId?: string; branchName: string; employeeAccountId?: string; employeeName: string; serviceType: string; recurrenceType: string; visitsPerPeriod: number; preferredDay: number; preferredTime: string; durationMinutes: number; branchPrice: number; generatedThrough?: string; isActive: boolean; generatedWorkOrderCount: number };
export type Contract = { id: string; number: string; customerId: string; customerName: string; branchId?: string; branchName: string; proposalId?: string; title: string; status: string; startDate: string; endDate: string; billingFrequency: string; billingDay: number; paymentTermDays: number; periodAmount: number; currency: string; scope?: string; terms?: string; autoRenew: boolean; renewalNoticeDays: number; annualPriceIncreaseRate: number; freeEmergencyCallsPerYear: number; extraEmergencyCallPrice: number; responseTimeHours: number; daysUntilEnd: number; renewalDue: boolean; invoiceCount: number; remainingBalance: number; generatedWorkOrderCount: number; createdAt: string; servicePlans: ContractServicePlan[] };
export type Receivable = { id: string; number: string; customerId: string; customerName: string; branchId?: string; branchName: string; contractId?: string; contractNumber: string; description: string; issueDate: string; dueDate: string; amount: number; paidAmount: number; balance: number; currency: string; status: string; paidAt?: string; paymentNote?: string };
export type ProfitabilityRow = { customerId: string; customerName: string; branchId?: string; branchName: string; revenue: number; productCost: number; personnelCost: number; fuelCost: number; repeatVisitCost: number; emergencyCallCost: number; otherCost: number; grossProfit: number; marginPercent: number; receivableBalance: number; completedVisits: number; repeatVisits: number; emergencyCalls: number; renewalScore: number };
export type ProfitabilitySummary = { revenue: number; totalCost: number; grossProfit: number; marginPercent: number; receivableBalance: number; collectionRate: number; contractsExpiringIn90Days: number; rows: ProfitabilityRow[] };
export type CreateProposalInput = { customerId: string; branchId?: string; title: string; issueDate: string; validUntil: string; vatRate: number; discountAmount: number; notes?: string; terms?: string; lines: { description: string; quantity: number; unit: string; unitPrice: number }[] };
export type ContractServicePlanInput = { branchId?: string; employeeAccountId?: string; serviceType: string; recurrenceType: 'Weekly' | 'Monthly' | 'Manual'; visitsPerPeriod: number; preferredDay: number; preferredTime: string; durationMinutes: number; branchPrice: number };
export type ConvertProposalInput = { startDate: string; endDate: string; billingFrequency: string; billingDay: number; paymentTermDays: number; periodAmount?: number; scope?: string; terms?: string; autoRenew?: boolean; renewalNoticeDays?: number; annualPriceIncreaseRate?: number; freeEmergencyCallsPerYear?: number; extraEmergencyCallPrice?: number; responseTimeHours?: number; servicePlans?: ContractServicePlanInput[] };
export type ContractGenerationResult = { contractId: string; generatedThrough: string; createdCount: number; skippedExistingCount: number };

export class CommercialSessionExpiredError extends Error {}
async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> { const response = await apiFetch(path, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) } }); if (response.status === 401) throw new CommercialSessionExpiredError(); if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(String(body.message ?? Object.values(body.errors ?? {}).flat()[0] ?? 'İşlem tamamlanamadı.')); } if (response.status === 204) return undefined as T; return response.json(); }
export const getProposals = (token: string) => request<Proposal[]>('/api/company/commercial/proposals', token);
export const createProposal = (token: string, input: CreateProposalInput) => request<Proposal>('/api/company/commercial/proposals', token, { method: 'POST', body: JSON.stringify(input) });
export const convertProposal = (token: string, id: string, input: ConvertProposalInput) => request<Contract>(`/api/company/commercial/proposals/${id}/convert`, token, { method: 'POST', body: JSON.stringify(input) });
export const getContracts = (token: string) => request<Contract[]>('/api/company/commercial/contracts', token);
export const generateContractWorkOrders = (token: string, id: string, throughDate?: string) => request<ContractGenerationResult>(`/api/company/commercial/contracts/${id}/generate-work-orders`, token, { method: 'POST', body: JSON.stringify({ throughDate }) });
export const renewContract = (token: string, id: string) => request<Contract>(`/api/company/commercial/contracts/${id}/renew`, token, { method: 'POST' });
export const getReceivables = (token: string) => request<Receivable[]>('/api/company/commercial/receivables', token);
export const recordPayment = (token: string, id: string, amount: number, note?: string) => request<Receivable>(`/api/company/commercial/receivables/${id}/payment`, token, { method: 'POST', body: JSON.stringify({ amount, note }) });
export const getProfitability = (token: string, start?: string, end?: string) => {
  const query = new URLSearchParams();
  if (start) query.set('start', start);
  if (end) query.set('end', end);
  const suffix = query.size ? `?${query.toString()}` : '';
  return request<ProfitabilitySummary>(`/api/company/commercial/profitability${suffix}`, token);
};

export type WorkOrderEconomicsInput = {
  revenue: number;
  personnelHourlyCost: number;
  distanceKm: number;
  fuelCost: number;
  repeatVisitCost: number;
  emergencyCallCost: number;
  otherCost: number;
};
export const saveWorkOrderEconomics = (token: string, id: string, input: WorkOrderEconomicsInput) => request<void>(`/api/company/commercial/work-orders/${id}/economics`, token, { method: 'PUT', body: JSON.stringify(input) });

import { shareOrDownloadFile } from '../utils/shareUtils';


export async function downloadCommercialPdf(token: string, kind: 'proposals' | 'contracts', id: string, number: string) { const response = await apiFetch(`/api/company/commercial/${kind}/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } }); if (response.status === 401) throw new CommercialSessionExpiredError(); if (!response.ok) throw new Error('PDF oluşturulamadı.'); const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = `${number}.pdf`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

export async function shareCommercialPdf(token: string, kind: 'proposals' | 'contracts', id: string, number: string, title?: string) {
  const response = await apiFetch(`/api/company/commercial/${kind}/${id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401) throw new CommercialSessionExpiredError();
  if (!response.ok) throw new Error('PDF oluşturulamadı.');
  const blob = await response.blob();
  return await shareOrDownloadFile({
    title: title || `${number} - ${kind === 'proposals' ? 'Teklif' : 'Sözleşme'}`,
    fileName: `${number}.pdf`,
    blob,
    text: `${title || number} - Pestneer Ticari Belge`,
  });
}

