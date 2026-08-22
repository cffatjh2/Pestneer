import { apiFetch, apiUrl } from './apiBase';

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
  baitGelCompleted?: boolean;
  stickyPlateChanged?: boolean;
  stationCleaned?: boolean;
  stationRelocated?: boolean;
  stationReplaced?: boolean;
  lockCheckDone?: boolean;
  labelRenewed?: boolean;
};

export type ReportProductInput = {
  vehicleStockItemId?: string;
  licenseDocumentId?: string;
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

export type ServiceReportSummary = {
  id: string; workOrderId: string; workOrderNumber: string; reportNumber: string; status: 'Draft' | 'Finalized';
  customerId: string; customerName: string; branchId?: string; branchName: string;
  scheduledAt: string; operatorName: string; updatedAt: string; finalizedAt?: string;
  totalStations: number; activeStations: number; plateChanges: number; totalCaught: number;
  activityRate: number; riskScore: number; riskLevel: 'Low' | 'Medium' | 'High'; infestationIndicator: boolean;
  emailDeliveryStatus: string; emailSentCount: number; emailRecipientCount: number;
  detailUrl: string; pdfUrl: string;
};

type CursorPage<T> = {
  items: T[];
  nextCursor?: string | null;
  hasMore: boolean;
  snapshotVersion: string;
};

export const v2PortalDataEnabled = String(import.meta.env.VITE_V2_PORTAL_DATA ?? 'true').toLowerCase() !== 'false';

export type TrendPeriod = { period: string; reportCount: number; totalStations: number; activeStations: number; plateChanges: number; totalCaught: number; activityRate: number; riskScore: number; riskLevel: string };
export type ServiceReportAnalytics = { from: string; to: string; reportCount: number; totalStations: number; activeStations: number; totalCaught: number; activityRate: number; riskScore: number; riskLevel: string; periods: TrendPeriod[]; pestTotals: { pest: string; totalCaught: number }[] };

export type ServiceReportCatalog = {
  pestTypes: string[];
  activityTypes: string[];
  equipmentTypes: string[];
  inaccessibilityReasons: string[];
  residenceTypes: string[];
  workTypes: string[];
  safetyMeasures: string[];
  applicationMethods: string[];
  productUnits: string[];
  quickCounts: number[];
};

export class ReportSessionExpiredError extends Error {
  constructor(message = 'Oturumunuz güncel değil. Lütfen yeniden giriş yapın.') { super(message); this.name = 'ReportSessionExpiredError'; }
}

export class ReportNetworkError extends Error {
  constructor() { super('İnternet bağlantısı bulunamadı. Rapor cihazda güvenle saklandı.'); this.name = 'ReportNetworkError'; }
}

export class ReportConflictError extends Error {
  constructor(message: string, public readonly current: ServiceReportRecord) { super(message); this.name = 'ReportConflictError'; }
}

class ReportRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = 'ReportRequestError'; }
}

class CursorContractError extends Error {
  constructor() { super('Rapor sayfalama yanıtı beklenen biçimde değil.'); this.name = 'CursorContractError'; }
}

export const getCompanyServiceReports = (token: string) => request<ServiceReportRecord[]>('/api/company/service-reports', token);
export const getEmployeeServiceReports = (token: string) => request<ServiceReportRecord[]>('/api/employee/service-reports', token);
export const getCustomerServiceReports = (token: string) => request<ServiceReportRecord[]>('/api/customer/service-reports', token);
export const getEmployeeServiceReportSummaries = (token: string) => getPortalServiceReportSummaries(
  token,
  '/api/v2/employee/service-reports',
  () => getEmployeeServiceReports(token));
export const getCustomerServiceReportSummaries = (token: string) => getPortalServiceReportSummaries(
  token,
  '/api/v2/customer/service-reports',
  () => getCustomerServiceReports(token));
export const getServiceReportCatalog = (token: string) => request<ServiceReportCatalog>('/api/service-reports/catalog', token);
export const getServiceReportByWorkOrder = (token: string, workOrderId: string) => request<ServiceReportRecord>(`/api/service-reports/work-orders/${workOrderId}`, token);
export const getServiceReportDetail = async (token: string, report: Pick<ServiceReportSummary, 'id' | 'workOrderId'>) => {
  if (!v2PortalDataEnabled) return getServiceReportByWorkOrder(token, report.workOrderId);
  try {
    const detail = await request<ServiceReportRecord>(`/api/v2/service-reports/${report.id}`, token);
    if (!isServiceReportRecord(detail)) throw new CursorContractError();
    return detail;
  } catch (error) {
    if (!canFallbackToLegacy(error)) throw error;
    return getServiceReportByWorkOrder(token, report.workOrderId);
  }
};
export const getPreviousServiceReport = (token: string, workOrderId: string) => request<ServiceReportRecord | null>(`/api/service-reports/work-orders/${workOrderId}/previous`, token);
export const saveServiceReport = (token: string, workOrderId: string, input: UpsertServiceReportInput) => request<ServiceReportRecord>(`/api/service-reports/work-orders/${workOrderId}`, token, { method: 'PUT', body: JSON.stringify(input) });
export async function uploadServiceReportPhotos(token: string, workOrderId: string, photos: ReportPhotoUpload[]) {
  if (photos.length === 0) return [];
  const body = new FormData();
  photos.forEach((photo) => body.append('photos', photo.file));
  body.append('metadata', JSON.stringify(photos.map(({ location, status, description }) => ({ location, status, description }))));
  return request<ReportPhoto[]>(`/api/service-reports/work-orders/${workOrderId}/photos`, token, { method: 'POST', body }, false);
}
export const getServiceReportAnalytics = (token: string, query = '') => request<ServiceReportAnalytics>(`/api/company/service-reports/analytics${query ? `?${query}` : ''}`, token);
export const getServiceReportPdfUrl = (reportId: string) => apiUrl(`/api/service-reports/${reportId}/pdf`);

async function getPortalServiceReportSummaries(
  token: string,
  v2Path: string,
  legacyRequest: () => Promise<ServiceReportRecord[]>) {
  if (!v2PortalDataEnabled) return (await legacyRequest()).map(toServiceReportSummary);
  try {
    return await requestAllCursorPages<ServiceReportSummary>(v2Path, token, isServiceReportSummary);
  } catch (error) {
    if (!canFallbackToLegacy(error)) throw error;
    return (await legacyRequest()).map(toServiceReportSummary);
  }
}

async function requestAllCursorPages<T>(path: string, token: string, isItem: (value: unknown) => value is T): Promise<T[]> {
  const items: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  do {
    const separator = path.includes('?') ? '&' : '?';
    const page = await request<CursorPage<T>>(`${path}${separator}limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, token);
    if (!isCursorPage(page, isItem)) throw new CursorContractError();
    items.push(...page.items);
    if (!page.hasMore) break;
    if (!page.nextCursor || seenCursors.has(page.nextCursor)) throw new CursorContractError();
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  } while (cursor);

  return items;
}

function isCursorPage<T>(value: unknown, isItem: (item: unknown) => item is T): value is CursorPage<T> {
  if (!value || typeof value !== 'object') return false;
  const page = value as Partial<CursorPage<unknown>>;
  return Array.isArray(page.items) && page.items.every(isItem) && typeof page.hasMore === 'boolean' &&
    typeof page.snapshotVersion === 'string' && (page.nextCursor == null || typeof page.nextCursor === 'string');
}

function isServiceReportSummary(value: unknown): value is ServiceReportSummary {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ServiceReportSummary>;
  return typeof item.id === 'string' && typeof item.workOrderId === 'string' && typeof item.workOrderNumber === 'string' &&
    typeof item.reportNumber === 'string' && (item.status === 'Draft' || item.status === 'Finalized') &&
    typeof item.customerId === 'string' && typeof item.customerName === 'string' && isOptionalString(item.branchId) &&
    typeof item.branchName === 'string' && typeof item.scheduledAt === 'string' && typeof item.operatorName === 'string' &&
    typeof item.updatedAt === 'string' && isOptionalString(item.finalizedAt) && typeof item.totalStations === 'number' &&
    typeof item.activeStations === 'number' && typeof item.plateChanges === 'number' && typeof item.totalCaught === 'number' &&
    typeof item.activityRate === 'number' && typeof item.riskScore === 'number' &&
    (item.riskLevel === 'Low' || item.riskLevel === 'Medium' || item.riskLevel === 'High') &&
    typeof item.infestationIndicator === 'boolean' && typeof item.emailDeliveryStatus === 'string' &&
    typeof item.emailSentCount === 'number' && typeof item.emailRecipientCount === 'number' &&
    typeof item.detailUrl === 'string' && typeof item.pdfUrl === 'string';
}

function isServiceReportRecord(value: unknown): value is ServiceReportRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ServiceReportRecord>;
  return typeof item.id === 'string' && typeof item.workOrderId === 'string' && typeof item.reportNumber === 'string' &&
    Array.isArray(item.stations) && Array.isArray(item.products) && Array.isArray(item.photos);
}

function canFallbackToLegacy(error: unknown) {
  return error instanceof CursorContractError || error instanceof SyntaxError ||
    (error instanceof ReportRequestError && (error.status === 404 || error.status === 405 || error.status >= 500));
}

function isOptionalString(value: unknown) {
  return value == null || typeof value === 'string';
}

function toServiceReportSummary(report: ServiceReportRecord): ServiceReportSummary {
  return {
    id: report.id,
    workOrderId: report.workOrderId,
    workOrderNumber: report.workOrderNumber,
    reportNumber: report.reportNumber,
    status: report.status,
    customerId: report.customerId,
    customerName: report.customerName,
    branchId: report.branchId,
    branchName: report.branchName,
    scheduledAt: report.scheduledAt,
    operatorName: report.operatorName,
    updatedAt: report.updatedAt,
    finalizedAt: report.finalizedAt,
    totalStations: report.totalStations,
    activeStations: report.activeStations,
    plateChanges: report.plateChanges,
    totalCaught: report.totalCaught,
    activityRate: report.activityRate,
    riskScore: report.riskScore,
    riskLevel: report.riskLevel,
    infestationIndicator: report.infestationIndicator,
    emailDeliveryStatus: report.emailDeliveryStatus,
    emailSentCount: report.emailSentCount,
    emailRecipientCount: report.emailRecipientCount,
    detailUrl: `/api/v2/service-reports/${report.id}`,
    pdfUrl: `/api/service-reports/${report.id}/pdf`,
  };
}

async function request<T>(path: string, token: string, init?: RequestInit, json = true): Promise<T> {
  let response: Response;
  try { response = await apiFetch(path, { ...init, headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...init?.headers } }); }
  catch { throw new ReportNetworkError(); }
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { message?: string; detail?: string; errors?: Record<string, string[]>; current?: ServiceReportRecord } | null;
    const validationMessage = problem?.errors ? Object.values(problem.errors).flat()[0] : undefined;
    if (response.status === 401 || response.status === 403) throw new ReportSessionExpiredError(problem?.message);
    if (response.status === 409 && problem?.current) throw new ReportConflictError(problem.message ?? 'Rapor sürümü çakıştı.', problem.current);
    throw new ReportRequestError(problem?.message ?? problem?.detail ?? validationMessage ?? 'Rapor işlemi tamamlanamadı.', response.status);
  }
  return response.json() as Promise<T>;
}
