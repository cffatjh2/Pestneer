import { v2PortalDataEnabled, type ReportStationInput } from './serviceReportApi';
import { apiFetch } from './apiBase';

export type StationActivationRecord = {
  id: string; workOrderId: string; workOrderNumber: string; number: string; status: 'Draft' | 'Finalized';
  customerId: string; customerName: string; branchId?: string; branchName: string; scheduledAt: string; operatorName: string;
  notes?: string; totalStations: number; activeStations: number; damagedStations: number; inaccessibleStations: number;
  totalCaught: number; updatedAt: string; finalizedAt?: string; stations: ReportStationInput[];
};

export type SaveStationActivationInput = { notes?: string; finalize: boolean; stations: ReportStationInput[] };

export type StationActivationSummary = {
  id: string; workOrderId: string; workOrderNumber: string; number: string; status: 'Draft' | 'Finalized';
  customerId: string; customerName: string; branchId?: string; branchName: string; scheduledAt: string; operatorName: string;
  totalStations: number; activeStations: number; damagedStations: number; inaccessibleStations: number;
  totalCaught: number; updatedAt: string; finalizedAt?: string; detailUrl: string; pdfUrl: string;
};

type CursorPage<T> = {
  items: T[];
  nextCursor?: string | null;
  hasMore: boolean;
  snapshotVersion: string;
};

class StationActivationRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = 'StationActivationRequestError'; }
}

class StationActivationContractError extends Error {
  constructor() { super('Aktivasyon sayfalama yanıtı beklenen biçimde değil.'); this.name = 'StationActivationContractError'; }
}

export const getStationActivations = (token: string) => request<StationActivationRecord[]>('/api/station-activations/', token);
export const getCustomerStationActivations = (token: string) => request<StationActivationRecord[]>('/api/customer/station-activations', token);
export const getStationActivationSummaries = (token: string) => getActivationSummaries(
  token,
  '/api/v2/station-activations',
  () => getStationActivations(token));
export const getCustomerStationActivationSummaries = (token: string) => getActivationSummaries(
  token,
  '/api/v2/customer/station-activations',
  () => getCustomerStationActivations(token));
export const getStationActivationByWorkOrder = (token: string, workOrderId: string) => request<StationActivationRecord | null>(`/api/station-activations/work-orders/${workOrderId}`, token);
export const getStationActivationDetail = async (token: string, activation: Pick<StationActivationSummary, 'id' | 'workOrderId'>) => {
  if (v2PortalDataEnabled) {
    try {
      const detail = await request<StationActivationRecord>(`/api/v2/station-activations/${activation.id}`, token);
      if (!isStationActivationRecord(detail)) throw new StationActivationContractError();
      return detail;
    } catch (error) {
      if (!canFallbackToLegacy(error)) throw error;
    }
  }
  const legacy = await getStationActivationByWorkOrder(token, activation.workOrderId);
  if (!legacy) throw new Error('İstasyon aktivasyonu bulunamadı.');
  return legacy;
};
export const saveStationActivation = (token: string, workOrderId: string, input: SaveStationActivationInput) => request<StationActivationRecord>(`/api/station-activations/work-orders/${workOrderId}`, token, { method: 'PUT', body: JSON.stringify(input) });

export async function downloadStationActivationPdf(token: string, record: StationActivationRecord) {
  const response = await apiFetch(`/api/station-activations/${record.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('Aktivasyon PDF belgesi indirilemedi.');
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${record.number}.pdf`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function getActivationSummaries(
  token: string,
  v2Path: string,
  legacyRequest: () => Promise<StationActivationRecord[]>) {
  if (!v2PortalDataEnabled) return (await legacyRequest()).map(toStationActivationSummary);
  try {
    return await requestAllCursorPages<StationActivationSummary>(v2Path, token, isStationActivationSummary);
  } catch (error) {
    if (!canFallbackToLegacy(error)) throw error;
    return (await legacyRequest()).map(toStationActivationSummary);
  }
}

async function requestAllCursorPages<T>(path: string, token: string, isItem: (value: unknown) => value is T): Promise<T[]> {
  const items: T[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  do {
    const page = await request<CursorPage<T>>(`${path}?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, token);
    if (!isCursorPage(page, isItem)) throw new StationActivationContractError();
    items.push(...page.items);
    if (!page.hasMore) break;
    if (!page.nextCursor || seenCursors.has(page.nextCursor)) throw new StationActivationContractError();
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

function isStationActivationSummary(value: unknown): value is StationActivationSummary {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<StationActivationSummary>;
  return typeof item.id === 'string' && typeof item.workOrderId === 'string' && typeof item.workOrderNumber === 'string' &&
    typeof item.number === 'string' && (item.status === 'Draft' || item.status === 'Finalized') &&
    typeof item.customerId === 'string' && typeof item.customerName === 'string' && isOptionalString(item.branchId) &&
    typeof item.branchName === 'string' && typeof item.scheduledAt === 'string' && typeof item.operatorName === 'string' &&
    typeof item.totalStations === 'number' && typeof item.activeStations === 'number' && typeof item.damagedStations === 'number' &&
    typeof item.inaccessibleStations === 'number' && typeof item.totalCaught === 'number' && typeof item.updatedAt === 'string' &&
    isOptionalString(item.finalizedAt) && typeof item.detailUrl === 'string' && typeof item.pdfUrl === 'string';
}

function isStationActivationRecord(value: unknown): value is StationActivationRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<StationActivationRecord>;
  return typeof item.id === 'string' && typeof item.workOrderId === 'string' && Array.isArray(item.stations);
}

function canFallbackToLegacy(error: unknown) {
  return error instanceof StationActivationContractError || error instanceof SyntaxError ||
    (error instanceof StationActivationRequestError && (error.status === 404 || error.status === 405 || error.status >= 500));
}

function isOptionalString(value: unknown) {
  return value == null || typeof value === 'string';
}

function toStationActivationSummary(record: StationActivationRecord): StationActivationSummary {
  return {
    id: record.id,
    workOrderId: record.workOrderId,
    workOrderNumber: record.workOrderNumber,
    number: record.number,
    status: record.status,
    customerId: record.customerId,
    customerName: record.customerName,
    branchId: record.branchId,
    branchName: record.branchName,
    scheduledAt: record.scheduledAt,
    operatorName: record.operatorName,
    totalStations: record.totalStations,
    activeStations: record.activeStations,
    damagedStations: record.damagedStations,
    inaccessibleStations: record.inaccessibleStations,
    totalCaught: record.totalCaught,
    updatedAt: record.updatedAt,
    finalizedAt: record.finalizedAt,
    detailUrl: `/api/v2/station-activations/${record.id}`,
    pdfUrl: `/api/station-activations/${record.id}/pdf`,
  };
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers } });
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { message?: string; detail?: string; errors?: Record<string, string[]> } | null;
    throw new StationActivationRequestError(
      problem?.message ?? problem?.detail ?? (problem?.errors ? Object.values(problem.errors).flat()[0] : undefined) ?? 'Aktivasyon listesi kaydedilemedi.',
      response.status);
  }
  return response.json() as Promise<T>;
}
