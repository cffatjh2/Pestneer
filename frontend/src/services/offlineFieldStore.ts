import type { WorkOrder } from '../types';
import type { VehicleStockCheck } from './fieldOperationsApi';
import type { ReportPhotoUpload, ServiceReportRecord, UpsertServiceReportInput } from './serviceReportApi';
import type { SitePlanRecord } from './sitePlanApi';
import type { EmployeePlanningOptions } from './workOrderApi';

const DATABASE_NAME = 'pestneer-field';
const DATABASE_VERSION = 2;
const CACHE_STORE = 'cache';
const DRAFT_STORE = 'drafts';
const QUEUE_STORE = 'queue';
const ACTION_STORE = 'actions';

export type QueuedFieldAction = {
  id: string;
  workOrderId: string;
  kind: 'Start' | 'VisitState';
  action?: 'Stop' | 'Pause' | 'FinishPart' | 'Skip' | 'Cancel';
  reason?: string;
  createdAt: string;
  updatedAt: string;
  status: 'pending' | 'syncing' | 'failed';
  attempts: number;
  error?: string;
};

export type OfflinePhoto = {
  id: string;
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
  location: string;
  status: string;
  description: string;
};

export type LocalReportDraft = {
  workOrderId: string;
  input: UpsertServiceReportInput;
  photos: OfflinePhoto[];
  stage: 'inspection' | 'report';
  stationIndex: number;
  updatedAt: string;
};

export type QueuedReportSubmission = {
  id: string;
  workOrderId: string;
  input: UpsertServiceReportInput;
  photos: OfflinePhoto[];
  createdAt: string;
  updatedAt: string;
  status: 'pending' | 'syncing' | 'failed' | 'conflict';
  attempts: number;
  error?: string;
  serverReport?: ServiceReportRecord;
  reportSaved?: ServiceReportRecord;
};

export type FieldWorkspaceCache = {
  orders: WorkOrder[];
  reports: ServiceReportRecord[];
  planning: EmployeePlanningOptions;
  vehicleStock: VehicleStockCheck | null;
  cachedAt: string;
};

export async function cacheFieldWorkspace(accountId: string, value: Omit<FieldWorkspaceCache, 'cachedAt'>) {
  await put(CACHE_STORE, { key: `workspace:${accountId}`, ...value, cachedAt: new Date().toISOString() });
}

export async function getCachedFieldWorkspace(accountId: string) {
  return get<FieldWorkspaceCache & { key: string }>(CACHE_STORE, `workspace:${accountId}`);
}

export async function cacheSitePlans(accountId: string, plans: SitePlanRecord[]) {
  await put(CACHE_STORE, { key: `site-plans:${accountId}`, plans, cachedAt: new Date().toISOString() });
}

export async function getCachedSitePlans(accountId: string) {
  const cached = await get<{ key: string; plans: SitePlanRecord[] }>(CACHE_STORE, `site-plans:${accountId}`);
  return cached?.plans ?? [];
}

export async function saveLocalReportDraft(draft: LocalReportDraft) {
  await put(DRAFT_STORE, draft);
  dispatchSyncEvent();
}

export async function getLocalReportDraft(workOrderId: string) {
  return get<LocalReportDraft>(DRAFT_STORE, workOrderId);
}

export async function removeLocalReportDraft(workOrderId: string) {
  await remove(DRAFT_STORE, workOrderId);
  dispatchSyncEvent();
}

export async function toOfflinePhotos(photos: ReportPhotoUpload[]) {
  return Promise.all(photos.map(async ({ file, location, status, description }) => ({
    id: crypto.randomUUID(),
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
    blob: file.slice(0, file.size, file.type),
    location,
    status,
    description,
  })));
}

export function toFiles(photos: OfflinePhoto[]) {
  return photos.map((photo) => ({
    file: new File([photo.blob], photo.name, { type: photo.type, lastModified: photo.lastModified }),
    location: photo.location ?? '',
    status: photo.status ?? 'Genel saha görünümü',
    description: photo.description ?? '',
  }));
}

export async function queueReportSubmission(workOrderId: string, input: UpsertServiceReportInput, photos: ReportPhotoUpload[], reportSaved?: ServiceReportRecord) {
  const now = new Date().toISOString();
  const item: QueuedReportSubmission = {
    id: crypto.randomUUID(), workOrderId, input, photos: await toOfflinePhotos(photos), createdAt: now,
    updatedAt: now, status: 'pending', attempts: 0, reportSaved,
  };
  await put(QUEUE_STORE, item);
  await removeLocalReportDraft(workOrderId);
  await requestBackgroundSync();
  dispatchSyncEvent();
  return item;
}

export async function listQueuedReports() {
  return getAll<QueuedReportSubmission>(QUEUE_STORE);
}

export async function updateQueuedReport(item: QueuedReportSubmission) {
  await put(QUEUE_STORE, { ...item, updatedAt: new Date().toISOString() });
  dispatchSyncEvent();
}

export async function removeQueuedReport(id: string) {
  await remove(QUEUE_STORE, id);
  dispatchSyncEvent();
}

export async function queueFieldAction(input: Pick<QueuedFieldAction, 'workOrderId' | 'kind' | 'action' | 'reason'>) {
  const now = new Date().toISOString();
  const item: QueuedFieldAction = { id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now, status: 'pending', attempts: 0 };
  await put(ACTION_STORE, item);
  await requestBackgroundSync();
  dispatchSyncEvent();
  return item;
}

export async function listQueuedFieldActions() {
  return getAll<QueuedFieldAction>(ACTION_STORE);
}

export async function updateQueuedFieldAction(item: QueuedFieldAction) {
  await put(ACTION_STORE, { ...item, updatedAt: new Date().toISOString() });
  dispatchSyncEvent();
}

export async function removeQueuedFieldAction(id: string) {
  await remove(ACTION_STORE, id);
  dispatchSyncEvent();
}

export function onFieldSyncChange(listener: () => void) {
  window.addEventListener('pestneer-field-sync', listener);
  return () => window.removeEventListener('pestneer-field-sync', listener);
}

export function offlineScopeFromToken(token: string) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: string; company_id?: string };
    return `${payload.company_id ?? 'company'}:${payload.sub ?? 'account'}`;
  } catch {
    return 'current-session';
  }
}

function dispatchSyncEvent() {
  window.dispatchEvent(new CustomEvent('pestneer-field-sync'));
}

async function requestBackgroundSync() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const syncRegistration = registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } };
    await syncRegistration.sync?.register('pestneer-field-sync');
  } catch { /* Periodic foreground synchronization remains active. */ }
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CACHE_STORE)) database.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      if (!database.objectStoreNames.contains(DRAFT_STORE)) database.createObjectStore(DRAFT_STORE, { keyPath: 'workOrderId' });
      if (!database.objectStoreNames.contains(QUEUE_STORE)) database.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
      if (!database.objectStoreNames.contains(ACTION_STORE)) database.createObjectStore(ACTION_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Yerel saha veritabanı açılamadı.'));
  });
}

async function put(storeName: string, value: unknown) {
  const database = await openDatabase();
  await transactionPromise(database, storeName, 'readwrite', (store) => store.put(value));
  database.close();
}

async function get<T>(storeName: string, key: IDBValidKey) {
  const database = await openDatabase();
  const value = await transactionPromise<T | undefined>(database, storeName, 'readonly', (store) => store.get(key));
  database.close();
  return value;
}

async function getAll<T>(storeName: string) {
  const database = await openDatabase();
  const value = await transactionPromise<T[]>(database, storeName, 'readonly', (store) => store.getAll());
  database.close();
  return value;
}

async function remove(storeName: string, key: IDBValidKey) {
  const database = await openDatabase();
  await transactionPromise(database, storeName, 'readwrite', (store) => store.delete(key));
  database.close();
}

function transactionPromise<T = void>(database: IDBDatabase, storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest) {
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
}
