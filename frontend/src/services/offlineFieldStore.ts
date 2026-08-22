import type { WorkOrder } from '../types';
import type { VehicleStockCheck } from './fieldOperationsApi';
import type { ReportPhotoUpload, ServiceReportRecord, UpsertServiceReportInput } from './serviceReportApi';
import type { SitePlanRecord } from './sitePlanApi';
import type { EmployeePlanningOptions } from './workOrderApi';

const DATABASE_NAME = 'pestneer-field';
const DATABASE_VERSION = 3;
const CACHE_STORE = 'cache';
const DRAFT_STORE = 'drafts';
const QUEUE_STORE = 'queue';
const ACTION_STORE = 'actions';
const PHOTO_STORE = 'photos';
const UNREFERENCED_PHOTO_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CACHED_WORKSPACES = 8;
const photoIds = new WeakMap<File, string>();

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

type OfflinePhotoReference = Omit<OfflinePhoto, 'blob'>;
type StoredPhoto = { id: string; blob: Blob; size: number; createdAt: string };
type StoredLocalReportDraft = Omit<LocalReportDraft, 'photos'> & { photos: Array<OfflinePhotoReference | OfflinePhoto> };
type StoredQueuedReportSubmission = Omit<QueuedReportSubmission, 'photos'> & { photos: Array<OfflinePhotoReference | OfflinePhoto> };

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
  status: 'pending' | 'syncing' | 'failed' | 'conflict' | 'evidence-missing';
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
  await pruneOperationalCache();
}

export async function getCachedFieldWorkspace(accountId: string) {
  return get<FieldWorkspaceCache & { key: string }>(CACHE_STORE, `workspace:${accountId}`);
}

export async function cacheSitePlans(accountId: string, plans: SitePlanRecord[]) {
  await put(CACHE_STORE, { key: `site-plans:${accountId}`, plans, cachedAt: new Date().toISOString() });
  await pruneOperationalCache();
}

export async function getCachedSitePlans(accountId: string) {
  const cached = await get<{ key: string; plans: SitePlanRecord[] }>(CACHE_STORE, `site-plans:${accountId}`);
  return cached?.plans ?? [];
}

export async function saveLocalReportDraft(draft: LocalReportDraft) {
  await putReportWithPhotos(DRAFT_STORE, draft, draft.photos);
  void cleanupUnreferencedPhotos();
  dispatchSyncEvent();
}

export async function getLocalReportDraft(workOrderId: string): Promise<LocalReportDraft | undefined> {
  const draft = await get<StoredLocalReportDraft>(DRAFT_STORE, workOrderId);
  if (!draft) return undefined;
  return { ...draft, photos: await hydratePhotos(draft.photos) };
}

export async function removeLocalReportDraft(workOrderId: string) {
  await remove(DRAFT_STORE, workOrderId);
  void cleanupUnreferencedPhotos();
  dispatchSyncEvent();
}

export async function toOfflinePhotos(photos: ReportPhotoUpload[]) {
  return Promise.all(photos.map(async ({ file, location, status, description }) => {
    const id = await stablePhotoId(file);
    return {
      id,
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      blob: file,
      location,
      status,
      description,
    };
  }));
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
  const offlinePhotos = await toOfflinePhotos(photos);
  const item: QueuedReportSubmission = {
    id: crypto.randomUUID(), workOrderId, input, photos: offlinePhotos, createdAt: now,
    updatedAt: now, status: 'pending', attempts: 0, reportSaved,
  };
  await putReportWithPhotos(QUEUE_STORE, item, offlinePhotos);
  await removeLocalReportDraft(workOrderId);
  await requestBackgroundSync();
  dispatchSyncEvent();
  return item;
}

export async function listQueuedReports(): Promise<QueuedReportSubmission[]> {
  const items = await getAll<StoredQueuedReportSubmission>(QUEUE_STORE);
  return Promise.all(items.map(async (item) => {
    try {
      return { ...item, photos: await hydratePhotos(item.photos) } as QueuedReportSubmission;
    } catch (error) {
      return {
        ...item,
        photos: [],
        status: 'evidence-missing',
        error: error instanceof Error ? error.message : 'Çevrimdışı fotoğraf kanıtı bulunamadı.',
      } as QueuedReportSubmission;
    }
  }));
}

export async function updateQueuedReport(item: QueuedReportSubmission) {
  await putReportWithPhotos(QUEUE_STORE, { ...item, updatedAt: new Date().toISOString() }, item.photos);
  dispatchSyncEvent();
}

export async function removeQueuedReport(id: string) {
  await remove(QUEUE_STORE, id);
  void cleanupUnreferencedPhotos();
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
      if (!database.objectStoreNames.contains(PHOTO_STORE)) database.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
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

async function stablePhotoId(file: File) {
  const cached = photoIds.get(file);
  if (cached) return cached;
  let id: string;
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    id = `sha256:${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')}`;
  } else {
    // Metadata is not a content identity. A random ID avoids silently reusing another file's Blob.
    const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    id = `file:${randomId}`;
  }
  photoIds.set(file, id);
  return id;
}

async function putReportWithPhotos(
  storeName: typeof DRAFT_STORE | typeof QUEUE_STORE,
  value: LocalReportDraft | QueuedReportSubmission,
  photos: OfflinePhoto[],
) {
  const now = new Date().toISOString();
  const references = photos.map(({ blob: _, ...reference }) => reference);
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction([storeName, PHOTO_STORE], 'readwrite');
      const photoStore = transaction.objectStore(PHOTO_STORE);
      transaction.objectStore(storeName).put({ ...value, photos: references });

      for (const photo of photos) {
        const request = photoStore.get(photo.id);
        request.onsuccess = () => {
          if (!request.result) {
            photoStore.put({ id: photo.id, blob: photo.blob, size: photo.blob.size, createdAt: now } satisfies StoredPhoto);
          }
        };
      }

      transaction.onerror = () => reject(transaction.error ?? new Error('Çevrimdışı fotoğraf kaydı tamamlanamadı.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Çevrimdışı fotoğraf kaydı tamamlanamadı.'));
      transaction.oncomplete = () => resolve();
    });
  } finally {
    database.close();
  }
}

async function hydratePhotos(photos: Array<OfflinePhotoReference | OfflinePhoto>): Promise<OfflinePhoto[]> {
  const hydrated = await Promise.all(photos.map(async (photo) => {
    if ('blob' in photo) return photo;
    const stored = await get<StoredPhoto>(PHOTO_STORE, photo.id);
    if (!stored) throw new Error(`Çevrimdışı fotoğraf kanıtı eksik (${photo.name}). Kayıt otomatik gönderilmedi.`);
    return { ...photo, blob: stored.blob };
  }));
  return hydrated;
}

async function cleanupUnreferencedPhotos() {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      // A single transaction prevents cleanup from deleting a Blob while a new
      // draft or queue item is concurrently adding a reference to the same id.
      const transaction = database.transaction([DRAFT_STORE, QUEUE_STORE, PHOTO_STORE], 'readwrite');
      const draftRequest = transaction.objectStore(DRAFT_STORE).getAll();
      const queueRequest = transaction.objectStore(QUEUE_STORE).getAll();
      const photoStore = transaction.objectStore(PHOTO_STORE);
      const photoRequest = photoStore.getAll();
      let completedReads = 0;

      const deleteExpiredUnreferencedPhotos = () => {
        completedReads += 1;
        if (completedReads !== 3) return;
        const referenced = new Set<string>();
        (draftRequest.result as StoredLocalReportDraft[]).forEach((draft) => draft.photos.forEach((photo) => referenced.add(photo.id)));
        (queueRequest.result as StoredQueuedReportSubmission[]).forEach((item) => item.photos.forEach((photo) => referenced.add(photo.id)));
        const cutoff = Date.now() - UNREFERENCED_PHOTO_TTL_MS;
        (photoRequest.result as StoredPhoto[])
          .filter((photo) => !referenced.has(photo.id) && new Date(photo.createdAt).getTime() < cutoff)
          .forEach((photo) => photoStore.delete(photo.id));
      };

      draftRequest.onsuccess = deleteExpiredUnreferencedPhotos;
      queueRequest.onsuccess = deleteExpiredUnreferencedPhotos;
      photoRequest.onsuccess = deleteExpiredUnreferencedPhotos;
      transaction.onerror = () => reject(transaction.error ?? new Error('Çevrimdışı fotoğraf temizliği tamamlanamadı.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Çevrimdışı fotoğraf temizliği tamamlanamadı.'));
      transaction.oncomplete = () => resolve();
    });
  } finally {
    database.close();
  }
}

async function pruneOperationalCache() {
  const entries = await getAll<{ key: string; cachedAt?: string }>(CACHE_STORE);
  if (entries.length <= MAX_CACHED_WORKSPACES) return;
  const newest = [...entries].sort((left, right) => String(right.cachedAt ?? '').localeCompare(String(left.cachedAt ?? '')));
  await Promise.all(newest.slice(MAX_CACHED_WORKSPACES).map((entry) => remove(CACHE_STORE, entry.key)));
}

function transactionPromise<T = void>(database: IDBDatabase, storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest) {
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    let result: T;
    request.onsuccess = () => { result = request.result as T; };
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('Yerel veri işlemi tamamlanamadı.'));
    transaction.oncomplete = () => resolve(result);
  });
}
