export type ReportPestObservationInput = {
  pestKey: string;
  pestName: string;
  detectedCount: number;
  approvedCount: number;
  meanConfidence: number;
  source: 'PestneerVision' | 'VisionEdited' | 'Manual';
  modelName?: string;
  modelVersion?: string;
  reviewStatus: 'Approved' | 'PendingReview';
  visionResultJson?: string;
  analyzedAt?: string;
};

export type ReportStationInput = {
  sitePlanId?: string; sitePlanElementId?: string;
  qrCode?: string;
  deviceNumber: string; area: string; deviceType: string; targetPest?: string; caughtCount: number;
  hasActivity: boolean; plateChanged: boolean; deviceStatus: string; activityType?: string; inaccessibilityReason?: string;
  appliedVehicleStockItemId?: string; appliedProductName?: string; appliedAmount?: number; appliedUnit?: string;
  replacementVehicleStockItemId?: string; replacementProductName?: string; replacementQuantity?: number; replacementUnit?: string;
  notes?: string;
  pestObservations?: ReportPestObservationInput[];
};

export type ReportProductInput = {
  vehicleStockItemId?: string;
  productName: string; licenseNumber?: string; applicationMethod?: string; dilutionRate?: string;
  activeIngredient?: string; antidote?: string; packingQuantity?: string; amountUsed: number; unit: string;
};

export type ReportPhotoUpload = {
  file: File;
  location: string;
  status: string;
  description: string;
};

export type UpsertServiceReportInput = {
  firmName: string; firmAddress?: string; firmPhone?: string; firmWeb?: string; responsibleManager?: string;
  permissionNumber?: string; teamManager?: string; targetPests?: string; residenceType?: string;
  areaSquareMeters?: number; workType?: string; consumables?: string; safetyMeasures?: string;
  applicationSummary?: string; findings?: string; correctiveActions?: string; recommendations?: string;
  customerRepresentativeName?: string; managerSignatureData?: string; customerSignatureData?: string;
  additionalEmailRecipients?: string[];
  baseUpdatedAt?: string; forceOverwrite?: boolean;
  finalize: boolean; stations: ReportStationInput[]; products: ReportProductInput[];
};

export type ReportStation = ReportStationInput & { id: string };
export type ReportProduct = ReportProductInput & { id: string };
export type ReportPhoto = { id: string; fileName: string; contentType: string; uploadedAt: string; url: string; location?: string; status?: string; description?: string };

export type ServiceReportRecord = {
  id: string; workOrderId: string; workOrderNumber: string; reportNumber: string; status: 'Draft' | 'Finalized';
  customerId: string; customerName: string; branchId?: string; branchName: string; branchAddress: string;
  scheduledAt: string; startedAt?: string; completedAt?: string; customerDurationMinutes?: number; totalLaborMinutes: number; operatorName: string;
  firmName: string; firmAddress?: string; firmPhone?: string; firmWeb?: string; responsibleManager?: string;
  permissionNumber?: string; teamManager?: string; targetPests?: string; residenceType?: string;
  areaSquareMeters?: number; workType?: string; consumables?: string; safetyMeasures?: string;
  applicationSummary?: string; findings?: string; correctiveActions?: string; recommendations?: string;
  customerRepresentativeName?: string; managerSignatureData?: string; customerSignatureData?: string;
  verificationCode: string; updatedAt: string; finalizedAt?: string; totalStations: number; activeStations: number;
  plateChanges: number; totalCaught: number; activityRate: number; riskScore: number; riskLevel: 'Low' | 'Medium' | 'High';
  infestationIndicator: boolean; stations: ReportStation[]; products: ReportProduct[]; photos: ReportPhoto[];
  additionalEmailRecipients: string[]; emailDeliveryStatus: string; emailSentCount: number; emailRecipientCount: number;
};

export type TrendPeriod = { period: string; reportCount: number; totalStations: number; activeStations: number; plateChanges: number; totalCaught: number; activityRate: number; riskScore: number; riskLevel: string };
export type ServiceReportAnalytics = { from: string; to: string; reportCount: number; totalStations: number; activeStations: number; totalCaught: number; activityRate: number; riskScore: number; riskLevel: string; periods: TrendPeriod[]; pestTotals: { pest: string; totalCaught: number }[] };

export class ReportSessionExpiredError extends Error {
  constructor(message = 'Oturumunuz güncel değil. Lütfen yeniden giriş yapın.') { super(message); this.name = 'ReportSessionExpiredError'; }
}

export class ReportNetworkError extends Error {
  constructor() { super('İnternet bağlantısı bulunamadı. Rapor cihazda güvenle saklandı.'); this.name = 'ReportNetworkError'; }
}

export class ReportConflictError extends Error {
  constructor(message: string, public readonly current: ServiceReportRecord) { super(message); this.name = 'ReportConflictError'; }
}

export const getCompanyServiceReports = (token: string) => request<ServiceReportRecord[]>('/api/company/service-reports', token);
export const getEmployeeServiceReports = (token: string) => request<ServiceReportRecord[]>('/api/employee/service-reports', token);
export const getCustomerServiceReports = (token: string) => request<ServiceReportRecord[]>('/api/customer/service-reports', token);
export const getServiceReportByWorkOrder = (token: string, workOrderId: string) => request<ServiceReportRecord>(`/api/service-reports/work-orders/${workOrderId}`, token);
export const saveServiceReport = (token: string, workOrderId: string, input: UpsertServiceReportInput) => request<ServiceReportRecord>(`/api/service-reports/work-orders/${workOrderId}`, token, { method: 'PUT', body: JSON.stringify(input) });
export async function uploadServiceReportPhotos(token: string, workOrderId: string, photos: ReportPhotoUpload[]) {
  if (photos.length === 0) return [];
  const body = new FormData();
  photos.forEach((photo) => body.append('photos', photo.file));
  body.append('metadata', JSON.stringify(photos.map(({ location, status, description }) => ({ location, status, description }))));
  return request<ReportPhoto[]>(`/api/service-reports/work-orders/${workOrderId}/photos`, token, { method: 'POST', body }, false);
}
export const getServiceReportAnalytics = (token: string, query = '') => request<ServiceReportAnalytics>(`/api/company/service-reports/analytics${query ? `?${query}` : ''}`, token);

async function request<T>(path: string, token: string, init?: RequestInit, json = true): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { ...init, headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...init?.headers } }); }
  catch { throw new ReportNetworkError(); }
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { message?: string; detail?: string; errors?: Record<string, string[]>; current?: ServiceReportRecord } | null;
    const validationMessage = problem?.errors ? Object.values(problem.errors).flat()[0] : undefined;
    if (response.status === 401 || response.status === 403) throw new ReportSessionExpiredError(problem?.message);
    if (response.status === 409 && problem?.current) throw new ReportConflictError(problem.message ?? 'Rapor sürümü çakıştı.', problem.current);
    throw new Error(problem?.message ?? problem?.detail ?? validationMessage ?? 'Rapor işlemi tamamlanamadı.');
  }
  return response.json() as Promise<T>;
}
