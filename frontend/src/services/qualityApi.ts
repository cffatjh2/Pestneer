export type QualityLocation = { customerId: string; customerName: string; branchId?: string; branchName: string; address: string };
export type TrendPeriodPayload = { period: string; reportCount: number; totalStations: number; activeStations: number; plateChanges: number; totalCaught: number; activityRate: number };
export type PestTotalPayload = { pest: string; totalCaught: number };
export type RiskAnswer = { code: string; category: string; question: string; score: number; note?: string; recommendation?: string };
export type RiskMatrixRow = { location: string; pestCategory: string; severity: number; likelihood: number; note?: string };
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
  };
};

export type QualityDocument = {
  id: string; category: string; title: string; description?: string; fileName: string; contentType: string; sizeBytes: number;
  customerId?: string; customerName: string; branchId?: string; branchName: string; createdBy: string; createdAt: string;
  analysisId?: string; analysisType?: 'Trend' | 'Risk'; downloadUrl: string;
};

export type CreateTrendAnalysisInput = { customerId: string; branchId?: string; periodStart: string; periodEnd: string; title?: string; findings?: string; recommendations?: string };
export type CreateRiskAnalysisInput = { customerId: string; branchId?: string; assessmentDate: string; title?: string; findings?: string; correctiveActions?: string; recommendations?: string; sectorType?: string; currentFrequency?: string; riskMatrix: RiskMatrixRow[]; answers: RiskAnswer[] };
export type UploadQualityDocumentInput = { file: File; category: string; title?: string; description?: string; customerId?: string; branchId?: string };

export class QualitySessionExpiredError extends Error {
  constructor(message = 'Oturumunuz güncel değil. Lütfen yeniden giriş yapın.') { super(message); this.name = 'QualitySessionExpiredError'; }
}
export const getQualityLocations = (token: string) => request<QualityLocation[]>('/api/quality/locations', token);
export const getQualityAnalyses = (token: string, type?: 'Trend' | 'Risk') => request<QualityAnalysis[]>(`/api/quality/analyses${type ? `?type=${type}` : ''}`, token);
export const getQualityDocuments = (token: string, category?: string) => request<QualityDocument[]>(`/api/quality/documents${category ? `?category=${category}` : ''}`, token);
export const createTrendAnalysis = (token: string, input: CreateTrendAnalysisInput) => request<QualityAnalysis>('/api/quality/trend-analyses', token, { method: 'POST', body: JSON.stringify(input) });
export const createRiskAnalysis = (token: string, input: CreateRiskAnalysisInput) => request<QualityAnalysis>('/api/quality/risk-analyses', token, { method: 'POST', body: JSON.stringify(input) });

export async function uploadQualityDocument(token: string, input: UploadQualityDocumentInput) {
  const form = new FormData(); form.append('file', input.file); form.append('category', input.category);
  if (input.title) form.append('title', input.title); if (input.description) form.append('description', input.description);
  if (input.customerId) form.append('customerId', input.customerId); if (input.branchId) form.append('branchId', input.branchId);
  return request<QualityDocument>('/api/quality/documents/upload', token, { method: 'POST', body: form }, false);
}

export async function downloadQualityDocument(token: string, document: QualityDocument, open = false) {
  const response = await fetch(document.downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 || response.status === 403) throw new QualitySessionExpiredError();
  if (!response.ok) throw new Error('Belge indirilemedi.');
  const blob = await response.blob(); const url = URL.createObjectURL(blob);
  if (open && document.contentType === 'application/pdf') { window.open(url, '_blank', 'noopener,noreferrer'); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); return; }
  const anchor = window.document.createElement('a'); anchor.href = url; anchor.download = document.fileName; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

async function request<T>(path: string, token: string, init?: RequestInit, json = true): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { ...init, headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...init?.headers } }); }
  catch { throw new Error('Analiz ve belge servisine ulaşılamıyor. Lütfen tekrar deneyin.'); }
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { message?: string; detail?: string; errors?: Record<string, string[]> } | null;
    const validationMessage = problem?.errors ? Object.values(problem.errors).flat()[0] : undefined;
    if (response.status === 401 || response.status === 403) throw new QualitySessionExpiredError(problem?.message);
    throw new Error(problem?.message ?? problem?.detail ?? validationMessage ?? 'İşlem tamamlanamadı.');
  }
  return response.json() as Promise<T>;
}
