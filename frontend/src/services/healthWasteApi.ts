export type HealthScoreComponent = {
  code: string;
  label: string;
  available: boolean;
  penalty: number;
  maxPenalty: number;
  detail: string;
};

export type HealthScoreLocation = {
  customerId: string;
  customerName: string;
  branchId?: string;
  branchName: string;
  address: string;
  score: number;
  level: 'Low' | 'Medium' | 'High';
  confidence: 'Low' | 'Medium' | 'High';
  currentReportCount: number;
  periodComparisonAvailable: boolean;
  previousActivityRate?: number;
  currentActivityRate?: number;
  activityRateChange?: number;
  periodStart: string;
  periodEnd: string;
  components: HealthScoreComponent[];
};

export type HealthScoreOverview = {
  generatedAt: string;
  averageScore: number;
  highRiskLocations: number;
  comparisonAvailableLocations: number;
  locations: HealthScoreLocation[];
};

export type WasteDisposalEvidence = { id: string; fileName: string; contentType: string; note?: string; createdAt: string; uploadedBy: string; downloadUrl: string };
export type WasteDisposalRecord = {
  id: string; number: string; customerId: string; customerName: string; branchId?: string; branchName: string;
  workOrderId?: string; workOrderNumber?: string; wasteType: string; quantity: number; unit: string; status: string;
  generatedAt: string; temporaryStorage?: string; recipientName?: string; carrierOrFacility?: string; disposalMethod?: string;
  documentNumber?: string; notes?: string; createdBy: string; createdAt: string; updatedAt: string; evidence: WasteDisposalEvidence[];
};

export type WasteDisposalInput = {
  customerId: string; branchId?: string; workOrderId?: string; wasteType: string; quantity: number; unit: string; status: string;
  generatedAt: string; temporaryStorage?: string; recipientName?: string; carrierOrFacility?: string; disposalMethod?: string;
  documentNumber?: string; notes?: string;
};

export class HealthWasteSessionExpiredError extends Error {}

export const getCompanyHealthScores = (token: string) => request<HealthScoreOverview>('/api/company/health-scores', token);
export const getCustomerHealthScores = (token: string) => request<HealthScoreOverview>('/api/customer/portal/health-scores', token);
export const getWasteDisposals = (token: string) => request<WasteDisposalRecord[]>('/api/company/waste-disposals/', token);
export const createWasteDisposal = (token: string, input: WasteDisposalInput) => request<WasteDisposalRecord>('/api/company/waste-disposals/', token, { method: 'POST', body: JSON.stringify(input) });
export const updateWasteDisposal = (token: string, id: string, input: Omit<WasteDisposalInput, 'customerId' | 'branchId' | 'workOrderId'>) => request<WasteDisposalRecord>(`/api/company/waste-disposals/${id}`, token, { method: 'PUT', body: JSON.stringify(input) });

export async function uploadWasteEvidence(token: string, id: string, file: File, note?: string) {
  const form = new FormData(); form.append('file', file); if (note) form.append('note', note);
  return request<WasteDisposalRecord>(`/api/company/waste-disposals/${id}/evidence`, token, { method: 'POST', body: form }, false);
}

import { shareOrDownloadFile } from '../utils/shareUtils';

export async function downloadWasteEvidence(token: string, evidence: WasteDisposalEvidence) {
  const response = await fetch(evidence.downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 || response.status === 403) throw new HealthWasteSessionExpiredError('Oturum süresi doldu.');
  if (!response.ok) throw new Error('Kanıt dosyası indirilemedi.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = evidence.fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function shareWasteEvidence(token: string, evidence: WasteDisposalEvidence, title?: string) {
  const response = await fetch(evidence.downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 || response.status === 403) throw new HealthWasteSessionExpiredError('Oturum süresi doldu.');
  if (!response.ok) throw new Error('Kanıt dosyası indirilemedi.');
  const blob = await response.blob();
  return await shareOrDownloadFile({
    title: title || evidence.fileName,
    fileName: evidence.fileName,
    blob,
    text: `${evidence.fileName} - Pestneer Atık / Bertaraf Kanıtı`,
  });
}


async function request<T>(path: string, token: string, init?: RequestInit, json = true): Promise<T> {
  const headers: HeadersInit = { Authorization: `Bearer ${token}`, ...(json ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers ?? {}) };
  const response = await fetch(path, { ...init, headers });
  if (response.status === 401 || response.status === 403) throw new HealthWasteSessionExpiredError('Oturum süresi doldu.');
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { message?: string; detail?: string; errors?: Record<string, string[]> } | null;
    throw new Error(problem?.message ?? problem?.detail ?? (problem?.errors ? Object.values(problem.errors).flat()[0] : undefined) ?? 'İşlem tamamlanamadı.');
  }
  return response.json() as Promise<T>;
}
