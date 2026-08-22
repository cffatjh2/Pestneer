import { apiFetch } from './apiBase';
import type { SitePlanCanvas } from './sitePlanApi';

const privateFileStorageEnabled = String(import.meta.env.VITE_PRIVATE_FILE_STORAGE ?? 'false').toLowerCase() === 'true';
const maximumQualityDocumentBytes = 15 * 1024 * 1024;
const qualityDocumentExtensions = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'png', 'jpg', 'jpeg', 'webp']);

export type QualityLocation = { customerId: string; customerName: string; branchId?: string; branchName: string; address: string };
export type TrendPeriodPayload = { period: string; reportCount: number; totalStations: number; activeStations: number; plateChanges: number; totalCaught: number; activityRate: number };
export type PestTotalPayload = { pest: string; totalCaught: number };
export type RiskAnswer = { code: string; category: string; question: string; score: number; note?: string; recommendation?: string };
export type RiskMatrixRow = { location: string; pestCategory: string; severity: number; likelihood: number; note?: string };
export type RiskHotspot = {
  location: string;
  pestCategory: string;
  severity: number;
  likelihood: number;
  score: number;
  level: string;
  note?: string;
  matchedElementId?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};
export type SitePlanRiskMap = {
  id: string;
  number: string;
  title: string;
  areaName: string;
  revision: number;
  canvas: SitePlanCanvas;
  hotspots: RiskHotspot[];
};
export type QualityAnalysis = {
  id: string; number: string; analysisType: 'Trend' | 'Risk'; templateCode: string; title: string; status: string;
  customerId: string; customerName: string; branchId?: string; branchName: string; periodStart: string; periodEnd: string;
  score?: number; level?: string; summary?: string; findings?: string; recommendations?: string; createdBy: string; createdAt: string;
  documentId?: string;
  payload: {
    reportCount?: number; totalStations?: number; activeStations?: number; plateChanges?: number; totalCaught?: number;
    activityRate?: number; trendDirection?: string; periods?: TrendPeriodPayload[]; pestTotals?: PestTotalPayload[];
    structuralRiskScore?: number; weatherRiskScore?: number; overallRiskScore?: number; riskLevel?: string;
    answers?: RiskAnswer[]; riskMatrix?: RiskMatrixRow[]; matrixRiskScore?: number; recommendedFrequency?: string; sectorType?: string; currentFrequency?: string; generatedRecommendations?: string[]; disclaimer?: string;
    weather?: { weather?: { condition: string; temperatureC: number; relativeHumidity: number }; risk?: { score: number; level: string; label: string }; pests?: { name: string; score: number; level: string; reasons: string[]; recommendations: string[] }[] };
    sitePlan?: SitePlanRiskMap;
  };
};

export type QualityDocument = {
  id: string; category: string; title: string; description?: string; fileName: string; contentType: string; sizeBytes: number;
  customerId?: string; customerName: string; branchId?: string; branchName: string; createdBy: string; createdAt: string;
  inventoryItemId?: string; productName?: string; licenseNumber?: string;
  analysisId?: string; analysisType?: 'Trend' | 'Risk'; downloadUrl: string;
};

export type CreateTrendAnalysisInput = { customerId: string; branchId?: string; periodStart: string; periodEnd: string; title?: string; findings?: string; recommendations?: string };
export type CreateRiskAnalysisInput = { customerId: string; branchId?: string; assessmentDate: string; title?: string; findings?: string; correctiveActions?: string; recommendations?: string; sectorType?: string; currentFrequency?: string; riskMatrix: RiskMatrixRow[]; answers: RiskAnswer[]; sitePlanId?: string };
export type UploadQualityDocumentInput = { file: File; category: string; title?: string; description?: string; customerId?: string; branchId?: string; inventoryItemId?: string; licenseNumber?: string };
export type QualityDocumentFilters = { category?: string; search?: string; customerId?: string; branchId?: string; inventoryItemId?: string; contentType?: 'pdf' | 'office' | 'image' | 'text'; dateFrom?: string; dateTo?: string };

export class QualitySessionExpiredError extends Error {
  constructor(message = 'Oturumunuz güncel değil. Lütfen yeniden giriş yapın.') { super(message); this.name = 'QualitySessionExpiredError'; }
}
export const getQualityLocations = (token: string) => request<QualityLocation[]>('/api/quality/locations', token);
export const getQualityAnalyses = (token: string, type?: 'Trend' | 'Risk') => request<QualityAnalysis[]>(`/api/quality/analyses${type ? `?type=${type}` : ''}`, token);
export const getQualityDocuments = (token: string, filters: QualityDocumentFilters = {}) => {
  const parameters = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value) parameters.set(key, value); });
  return request<QualityDocument[]>(`/api/quality/documents${parameters.size ? `?${parameters}` : ''}`, token);
};
export const createTrendAnalysis = (token: string, input: CreateTrendAnalysisInput) => request<QualityAnalysis>('/api/quality/trend-analyses', token, { method: 'POST', body: JSON.stringify(input) });
export const createRiskAnalysis = (token: string, input: CreateRiskAnalysisInput) => request<QualityAnalysis>('/api/quality/risk-analyses', token, { method: 'POST', body: JSON.stringify(input) });
export const archiveQualityDocument = (token: string, documentId: string) => request<QualityDocument>(`/api/quality/documents/${documentId}/archive`, token, { method: 'POST' });
export const unarchiveQualityDocument = (token: string, documentId: string) => request<QualityDocument>(`/api/quality/documents/${documentId}/unarchive`, token, { method: 'POST' });
export const deleteQualityDocument = (token: string, documentId: string) => request<{ message: string }>(`/api/quality/documents/${documentId}`, token, { method: 'DELETE' });

export async function uploadQualityDocument(token: string, input: UploadQualityDocumentInput) {
  if (privateFileStorageEnabled) {
    let storageUploadStarted = false;
    try {
      const { getFileStorageCapabilities, uploadPrivateFile } = await import('./fileStorageApi');
      const capabilities = await getFileStorageCapabilities(token);
      const extension = input.file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!capabilities.directUploadEnabled || input.file.size > maximumQualityDocumentBytes
        || input.file.size > capabilities.maximumFileSizeBytes || !qualityDocumentExtensions.has(extension)) {
        return uploadQualityDocumentLegacy(token, input);
      }
      const uploaded = await uploadPrivateFile(token, input.file, {
        onProgress: (progress) => { if (progress.phase !== 'hashing') storageUploadStarted = true; },
      });
      storageUploadStarted = true;
      return await request<QualityDocument>('/api/v2/quality/documents/from-stored-object', token, {
        method: 'POST',
        body: JSON.stringify({
          uploadId: uploaded.uploadId,
          storedObjectId: uploaded.file.id,
          category: input.category,
          title: input.title,
          description: input.description,
          customerId: input.customerId,
          branchId: input.branchId,
          inventoryItemId: input.inventoryItemId,
          licenseNumber: input.licenseNumber,
        }),
      });
    } catch (error) {
      if (error instanceof QualitySessionExpiredError || storageErrorStatus(error) === 401) throw new QualitySessionExpiredError();
      const status = storageErrorStatus(error);
      const mayUseLegacy = !storageUploadStarted && (status === undefined || [403, 404, 405, 503].includes(status));
      if (!mayUseLegacy) {
        throw error instanceof Error ? error : new Error('Belge güvenli depolamaya yüklenemedi. Lütfen tekrar deneyin.');
      }
    }
  }

  return uploadQualityDocumentLegacy(token, input);
}

async function uploadQualityDocumentLegacy(token: string, input: UploadQualityDocumentInput) {
  const form = new FormData(); form.append('file', input.file); form.append('category', input.category);
  if (input.title) form.append('title', input.title); if (input.description) form.append('description', input.description);
  if (input.customerId) form.append('customerId', input.customerId); if (input.branchId) form.append('branchId', input.branchId);
  if (input.inventoryItemId) form.append('inventoryItemId', input.inventoryItemId); if (input.licenseNumber) form.append('licenseNumber', input.licenseNumber);
  return request<QualityDocument>('/api/quality/documents/upload', token, { method: 'POST', body: form }, false);
}

function storageErrorStatus(error: unknown) {
  if (!error || typeof error !== 'object' || !('status' in error)) return undefined;
  return typeof error.status === 'number' ? error.status : undefined;
}

export async function downloadQualityDocument(token: string, document: QualityDocument, open = false) {
  const response = await apiFetch(document.downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 || response.status === 403) throw new QualitySessionExpiredError();
  if (!response.ok) throw new Error('Belge indirilemedi.');
  const blob = await response.blob(); const url = URL.createObjectURL(blob);
  if (open && document.contentType === 'application/pdf') { window.open(url, '_blank', 'noopener,noreferrer'); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); return; }
  const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = document.fileName; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

async function request<T>(path: string, token: string, init?: RequestInit, json = true): Promise<T> {
  let response: Response;
  try { response = await apiFetch(path, { ...init, headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...init?.headers } }); }
  catch { throw new Error('Analiz ve belge servisine ulaşılamıyor. Lütfen tekrar deneyin.'); }
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { message?: string; detail?: string; errors?: Record<string, string[]> } | null;
    const validationMessage = problem?.errors ? Object.values(problem.errors).flat()[0] : undefined;
    if (response.status === 401 || response.status === 403) throw new QualitySessionExpiredError(problem?.message);
    throw new Error(problem?.message ?? problem?.detail ?? validationMessage ?? 'İşlem tamamlanamadı.');
  }
  return response.json() as Promise<T>;
}
