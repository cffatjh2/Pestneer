import { apiFetch } from './apiBase';

export type SitePlanElementType = 'rect' | 'line' | 'door' | 'text' | 'station' | 'image';
import { cacheSitePlans, getCachedSitePlans, offlineScopeFromToken } from './offlineFieldStore';
export type SitePlanEquipmentShape = 'square' | 'circle' | 'diamond' | 'star' | 'hexagon';

export type SitePlanEquipmentType = {
  id: string;
  code: string;
  name: string;
  color: string;
  shape: SitePlanEquipmentShape;
};

export type SitePlanElement = {
  id: string;
  type: SitePlanElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  strokeWidth: number;
  stroke?: string;
  fill?: string;
  text?: string;
  equipmentTypeId?: string;
  stationNumber?: string;
  qrCode?: string;
  imageUrl?: string;
  opacity?: number;
};

export type SitePlanCanvas = {
  width: 1200;
  height: 720;
  equipmentTypes: SitePlanEquipmentType[];
  elements: SitePlanElement[];
  backgroundImage?: string | null;
  backgroundOpacity?: number;
  backgroundX?: number;
  backgroundY?: number;
  backgroundWidth?: number;
  backgroundHeight?: number;
};

export type SitePlanRecord = {
  id: string;
  number: string;
  title: string;
  areaName: string;
  fieldGuide: string;
  status: string;
  revision: number;
  revisionNote?: string;
  customerId: string;
  customerName: string;
  branchId?: string;
  branchName: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  canvas: SitePlanCanvas;
  document: { id: string; fileName: string; contentType: string; downloadUrl: string };
};

export type SitePlanSummary = Omit<SitePlanRecord, 'canvas'> & {
  detailUrl: string;
};

type CursorPage<T> = {
  items: T[];
  nextCursor?: string | null;
  hasMore: boolean;
  snapshotVersion: string;
};

export const v2SitePlanDataEnabled = String(import.meta.env.VITE_V2_SITE_PLAN_DATA ?? 'true').toLowerCase() !== 'false';

export type SaveSitePlanInput = {
  customerId: string;
  branchId?: string;
  title: string;
  areaName: string;
  fieldGuide?: string;
  revisionNote?: string;
  canvas: SitePlanCanvas;
};

export class SitePlanSessionExpiredError extends Error {
  constructor(message = 'Oturumunuz güncel değil. Lütfen yeniden giriş yapın.') {
    super(message);
    this.name = 'SitePlanSessionExpiredError';
  }
}

class SitePlanContractError extends Error {
  constructor() {
    super('Yerleşim planı özet yanıtı beklenen biçimde değil.');
    this.name = 'SitePlanContractError';
  }
}

export async function getSitePlans(token: string) {
  const scope = offlineScopeFromToken(token);
  try {
    const plans = await request<SitePlanRecord[]>('/api/site-plans/', token);
    await cacheSitePlans(scope, plans);
    return plans;
  } catch (error) {
    const cached = await getCachedSitePlans(scope);
    if (cached.length > 0) return cached;
    throw error;
  }
}
export async function getSitePlanSummaries(token: string): Promise<SitePlanSummary[]> {
  if (!v2SitePlanDataEnabled) return (await getSitePlans(token)).map(toSitePlanSummary);
  try {
    return await requestAllCursorPages('/api/v2/site-plans', token);
  } catch (error) {
    if (error instanceof SitePlanSessionExpiredError) throw error;
    return (await getSitePlans(token)).map(toSitePlanSummary);
  }
}

export async function getSitePlanDetail(token: string, plan: Pick<SitePlanSummary, 'id'>): Promise<SitePlanRecord> {
  if (v2SitePlanDataEnabled) {
    try {
      const detail = await request<SitePlanRecord>(`/api/v2/site-plans/${plan.id}`, token);
      if (!isSitePlanRecord(detail)) throw new SitePlanContractError();
      return detail;
    } catch (error) {
      if (error instanceof SitePlanSessionExpiredError) throw error;
    }
  }

  const legacyPlans = await getSitePlans(token);
  const legacy = legacyPlans.find((item) => item.id === plan.id);
  if (!legacy) throw new Error('Yerleşim planı bulunamadı.');
  return legacy;
}

export async function getMatchingSitePlanDetail(token: string, customerId: string, branchId?: string) {
  const summaries = await getSitePlanSummaries(token);
  const matching = summaries.find((item) => item.customerId === customerId &&
    (branchId ? item.branchId === branchId : !item.branchId));
  return matching ? getSitePlanDetail(token, matching) : null;
}

export function toSitePlanSummary(plan: SitePlanRecord): SitePlanSummary {
  const { canvas: _, ...summary } = plan;
  return { ...summary, detailUrl: `/api/v2/site-plans/${plan.id}` };
}
export const createSitePlan = (token: string, input: SaveSitePlanInput) => request<SitePlanRecord>('/api/site-plans/', token, { method: 'POST', body: JSON.stringify(input) });
export const updateSitePlan = (token: string, id: string, input: SaveSitePlanInput) => request<SitePlanRecord>(`/api/site-plans/${id}`, token, { method: 'PUT', body: JSON.stringify(input) });

import { shareOrDownloadFile } from '../utils/shareUtils';

export async function downloadSitePlan(token: string, plan: Pick<SitePlanSummary, 'document'>, open = false) {
  const response = await apiFetch(plan.document.downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 || response.status === 403) throw new SitePlanSessionExpiredError();
  if (!response.ok) throw new Error('Yerleşim planı PDF dosyası indirilemedi.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  if (open) {
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = plan.document.fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export async function shareSitePlan(token: string, plan: Pick<SitePlanSummary, 'number' | 'title' | 'customerName' | 'branchName' | 'document'>) {
  const response = await apiFetch(plan.document.downloadUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 || response.status === 403) throw new SitePlanSessionExpiredError();
  if (!response.ok) throw new Error('Yerleşim planı PDF dosyası indirilemedi.');
  const blob = await response.blob();
  return await shareOrDownloadFile({
    title: `${plan.number} - ${plan.title}`,
    fileName: plan.document.fileName,
    blob,
    text: `${plan.title} (${plan.customerName} · ${plan.branchName}) - Pestneer Yerleşim Planı`,
  });
}

async function requestAllCursorPages(path: string, token: string): Promise<SitePlanSummary[]> {
  const items: SitePlanSummary[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  do {
    const page = await request<CursorPage<SitePlanSummary>>(`${path}?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, token);
    if (!isCursorPage(page)) throw new SitePlanContractError();
    items.push(...page.items);
    if (!page.hasMore) break;
    if (!page.nextCursor || seenCursors.has(page.nextCursor)) throw new SitePlanContractError();
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  } while (cursor);

  return items;
}

function isCursorPage(value: unknown): value is CursorPage<SitePlanSummary> {
  if (!value || typeof value !== 'object') return false;
  const page = value as Partial<CursorPage<unknown>>;
  return Array.isArray(page.items) && page.items.every(isSitePlanSummary) && typeof page.hasMore === 'boolean' &&
    typeof page.snapshotVersion === 'string' && (page.nextCursor == null || typeof page.nextCursor === 'string');
}

function isSitePlanSummary(value: unknown): value is SitePlanSummary {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SitePlanSummary>;
  return typeof item.id === 'string' && typeof item.number === 'string' && typeof item.title === 'string' &&
    typeof item.areaName === 'string' && typeof item.fieldGuide === 'string' && typeof item.status === 'string' &&
    typeof item.revision === 'number' && isOptionalString(item.revisionNote) && typeof item.customerId === 'string' &&
    typeof item.customerName === 'string' && isOptionalString(item.branchId) && typeof item.branchName === 'string' &&
    typeof item.createdBy === 'string' && typeof item.createdAt === 'string' && typeof item.updatedAt === 'string' &&
    isSitePlanDocument(item.document) && typeof item.detailUrl === 'string';
}

function isSitePlanRecord(value: unknown): value is SitePlanRecord {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<SitePlanRecord>;
  return typeof item.id === 'string' && typeof item.number === 'string' && isSitePlanDocument(item.document) &&
    !!item.canvas && item.canvas.width === 1200 && item.canvas.height === 720 &&
    Array.isArray(item.canvas.equipmentTypes) && Array.isArray(item.canvas.elements);
}

function isSitePlanDocument(value: unknown): value is SitePlanRecord['document'] {
  if (!value || typeof value !== 'object') return false;
  const document = value as Partial<SitePlanRecord['document']>;
  return typeof document.id === 'string' && typeof document.fileName === 'string' &&
    typeof document.contentType === 'string' && typeof document.downloadUrl === 'string';
}

function isOptionalString(value: unknown) {
  return value == null || typeof value === 'string';
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await apiFetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers } });
  } catch {
    throw new Error('Yerleşim planı servisine ulaşılamıyor. Lütfen tekrar deneyin.');
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { message?: string; detail?: string; errors?: Record<string, string[]> } | null;
    const validationMessage = problem?.errors ? Object.values(problem.errors).flat()[0] : undefined;
    if (response.status === 401 || response.status === 403) throw new SitePlanSessionExpiredError(problem?.message);
    throw new Error(problem?.message ?? problem?.detail ?? validationMessage ?? 'Yerleşim planı işlemi tamamlanamadı.');
  }
  return response.json() as Promise<T>;
}
