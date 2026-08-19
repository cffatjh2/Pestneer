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
export const createSitePlan = (token: string, input: SaveSitePlanInput) => request<SitePlanRecord>('/api/site-plans/', token, { method: 'POST', body: JSON.stringify(input) });
export const updateSitePlan = (token: string, id: string, input: SaveSitePlanInput) => request<SitePlanRecord>(`/api/site-plans/${id}`, token, { method: 'PUT', body: JSON.stringify(input) });

import { shareOrDownloadFile } from '../utils/shareUtils';

export async function downloadSitePlan(token: string, plan: SitePlanRecord, open = false) {
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

export async function shareSitePlan(token: string, plan: SitePlanRecord) {
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
