import { apiFetch } from './apiBase';

export type QualityInspectionType = 'Random' | 'ManagerVisit' | 'RiskBased' | 'ComplaintFollowUp' | 'SecondControl';
export type QualityGrade = 'Pending' | 'Excellent' | 'Good' | 'Acceptable' | 'NeedsImprovement' | 'Critical';

export type QualityInspection = {
  id: string; number: string; inspectionType: QualityInspectionType; selectionReason: string; status: 'Planned' | 'Completed';
  serviceReportId: string; reportNumber: string; workOrderNumber: string; customerName: string; branchName: string;
  employeeAccountId: string; employeeName: string; inspectorName: string; scheduledAt?: string; inspectedAt?: string;
  photoQualityScore: number; stationCompletionScore: number; productDoseScore: number; signatureScore: number;
  timelinessScore: number; reportCompletenessScore: number; totalScore: number; grade: QualityGrade;
  requiresCorrectiveAction: boolean; findings?: string; notes?: string; correctiveActionId?: string; correctiveActionNumber?: string;
  createdAt: string; updatedAt: string;
};

export type QualityInspectionCandidate = {
  serviceReportId: string; reportNumber: string; workOrderNumber: string; customerName: string; branchName: string;
  employeeAccountId?: string; employeeName: string; finalizedAt: string; recommended: boolean; recommendationReason: string;
  stationCount: number; photoCount: number; preliminaryScore: number;
};

export type EmployeeQualityScore = { employeeAccountId: string; employeeName: string; inspectionCount: number; averageScore?: number; grade: QualityGrade };
export type QualityInspectionSummary = { openCount: number; completedCount: number; averageScore?: number; correctiveActionCount: number; employees: EmployeeQualityScore[] };

export class QualityInspectionSessionExpiredError extends Error {}

export const getQualityInspections = (token: string) => request<QualityInspection[]>('/api/company/quality-inspections/', token);
export const getQualityInspectionSummary = (token: string) => request<QualityInspectionSummary>('/api/company/quality-inspections/summary', token);
export const getQualityInspectionCandidates = (token: string) => request<QualityInspectionCandidate[]>('/api/company/quality-inspections/candidates', token);
export const createQualityInspection = (token: string, input: { serviceReportId: string; inspectionType: QualityInspectionType; selectionReason: string; scheduledAt?: string }) => request<QualityInspection>('/api/company/quality-inspections/', token, { method: 'POST', body: JSON.stringify(input) });
export const completeQualityInspection = (token: string, id: string, input: { photoQualityScore: number; stationCompletionScore: number; productDoseScore: number; signatureScore: number; timelinessScore: number; reportCompletenessScore: number; findings?: string; notes?: string; createCorrectiveAction: boolean }) => request<QualityInspection>(`/api/company/quality-inspections/${id}/complete`, token, { method: 'PUT', body: JSON.stringify(input) });

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers } });
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { message?: string; detail?: string; errors?: Record<string, string[]> } | null;
    if (response.status === 401 || response.status === 403) throw new QualityInspectionSessionExpiredError(problem?.message ?? 'Oturum süresi doldu.');
    throw new Error(problem?.message ?? problem?.detail ?? (problem?.errors ? Object.values(problem.errors).flat()[0] : undefined) ?? 'Kalite kontrol işlemi tamamlanamadı.');
  }
  return response.json() as Promise<T>;
}
