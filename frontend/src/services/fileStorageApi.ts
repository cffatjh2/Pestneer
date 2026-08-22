import { apiFetch } from './apiBase';

export const SUPABASE_TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;
const HASH_CHUNK_SIZE_BYTES = 4 * 1024 * 1024;
const DEFAULT_TUS_RETRY_DELAYS = [0, 1_000, 3_000, 5_000, 10_000] as const;

export type FileDescriptor = {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  updatedAt: string;
  thumbnailId?: string;
};

export type FileUploadSession = {
  uploadId: string;
  uploadUrl?: string | null;
  uploadMethod: 'none' | 'PUT' | 'TUS';
  uploadToken?: string | null;
  storagePath?: string | null;
  bucket?: string | null;
  chunkSizeBytes?: number | null;
  expiresAt: string;
  alreadyAvailable: boolean;
  file?: FileDescriptor | null;
  requiredHeaders?: Record<string, string> | null;
};

export type FileDownloadTicket = {
  url: string;
  expiresAt: string;
  file: FileDescriptor;
};

export type FileStorageCapabilities = {
  directUploadEnabled: boolean;
  resumableThresholdBytes: number;
  chunkSizeBytes: number;
  maximumFileSizeBytes: number;
};

export type PrivateFileUploadPhase = 'hashing' | 'uploading' | 'verifying' | 'complete';

export type PrivateFileUploadProgress = {
  phase: PrivateFileUploadPhase;
  bytesTransferred: number;
  totalBytes: number;
  percentage: number;
  resumable: boolean;
};

export type UploadPrivateFileOptions = {
  signal?: AbortSignal;
  contentType?: string;
  idempotencyKey?: string;
  resume?: boolean;
  retryDelays?: readonly number[];
  onProgress?: (progress: PrivateFileUploadProgress) => void;
};

export type PrivateFileUploadResult = {
  uploadId: string;
  idempotencyKey: string;
  sha256: string;
  alreadyAvailable: boolean;
  file: FileDescriptor;
};

export type PrivateFileUploadTask = {
  result: Promise<PrivateFileUploadResult>;
  signal: AbortSignal;
  cancel: () => void;
};

export type CreateFileUploadSessionInput = {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  idempotencyKey: string;
};

export class PrivateFileStorageError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'PrivateFileStorageError';
  }
}

export class PrivateFileStorageSessionExpiredError extends PrivateFileStorageError {
  constructor() {
    super('Oturumunuzun süresi doldu. Lütfen yeniden giriş yapın.', 401);
    this.name = 'PrivateFileStorageSessionExpiredError';
  }
}

export async function createFileUploadSession(
  accessToken: string,
  input: CreateFileUploadSessionInput,
  signal?: AbortSignal,
): Promise<FileUploadSession> {
  const idempotencyKey = normalizeIdempotencyKey(input.idempotencyKey);
  return requestJson<FileUploadSession>('/api/v2/files/upload-sessions', accessToken, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      fileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      sha256: input.sha256,
    }),
  });
}

export async function getFileStorageCapabilities(
  accessToken: string,
  signal?: AbortSignal,
): Promise<FileStorageCapabilities> {
  return requestJson<FileStorageCapabilities>('/api/v2/files/capabilities', accessToken, {
    method: 'GET',
    signal,
  });
}

export async function completeFileUploadSession(
  accessToken: string,
  uploadId: string,
  signal?: AbortSignal,
): Promise<FileDescriptor> {
  const response = await requestJson<{ file: FileDescriptor }>(
    `/api/v2/files/upload-sessions/${encodeURIComponent(uploadId)}/complete`,
    accessToken,
    { method: 'POST', signal },
  );
  return response.file;
}

export async function getFileDownloadTicket(
  accessToken: string,
  storedObjectId: string,
  signal?: AbortSignal,
): Promise<FileDownloadTicket> {
  const ticket = await requestJson<FileDownloadTicket>(
    `/api/v2/files/${encodeURIComponent(storedObjectId)}/download-ticket`,
    accessToken,
    { method: 'GET', signal },
  );
  assertSafeRemoteUrl(ticket.url, 'Geçersiz dosya indirme adresi alındı.');
  return ticket;
}

export async function uploadPrivateFile(
  accessToken: string,
  file: File,
  options: UploadPrivateFileOptions = {},
): Promise<PrivateFileUploadResult> {
  validateFile(file);
  throwIfAborted(options.signal);

  const resumable = file.size > SUPABASE_TUS_CHUNK_SIZE_BYTES;
  const contentType = normalizeContentType(options.contentType || file.type || inferContentType(file.name));
  const sha256 = await hashFile(file, options.signal, options.onProgress, resumable);
  const idempotencyKey = options.idempotencyKey
    ? normalizeIdempotencyKey(options.idempotencyKey)
    : await createStableIdempotencyKey(file, contentType, sha256);

  throwIfAborted(options.signal);
  const session = await createFileUploadSession(accessToken, {
    fileName: file.name,
    contentType,
    sizeBytes: file.size,
    sha256,
    idempotencyKey,
  }, options.signal);

  if (session.alreadyAvailable) {
    if (!session.file) throw new PrivateFileStorageError('Hazır dosyanın bilgileri alınamadı.');
    assertDescriptor(session.file, file, contentType, sha256);
    notifyProgress(options.onProgress, 'complete', file.size, file.size, resumable);
    return { uploadId: session.uploadId, idempotencyKey, sha256, alreadyAvailable: true, file: session.file };
  }

  validateUploadSession(session, resumable);
  const uploadUrl = assertSafeRemoteUrl(session.uploadUrl!, 'Geçersiz dosya yükleme adresi alındı.');
  // The application JWT is intentionally never forwarded to Storage. Only these backend-issued,
  // method-specific headers are allowed on the direct PUT/TUS request.
  const headers = signedUploadHeaders(session, contentType);

  try {
    if (resumable) {
      await uploadWithTus(file, session, uploadUrl, headers, sha256, contentType, options);
    } else {
      await uploadWithSignedPut(file, uploadUrl, headers, options.signal, options.onProgress);
    }
  } catch (error) {
    // An earlier immutable PUT/TUS upload may have reached Storage while its completion request
    // was lost. Supabase then rejects the replay; backend completion still performs the
    // authoritative full size, MIME and SHA-256 verification before accepting the object.
    const status = error instanceof PrivateFileStorageError ? error.status : undefined;
    if (status !== 400 && status !== 409) throw error;
  }

  throwIfAborted(options.signal);
  notifyProgress(options.onProgress, 'verifying', file.size, file.size, resumable);
  const descriptor = await completeFileUploadSession(accessToken, session.uploadId, options.signal);
  assertDescriptor(descriptor, file, contentType, sha256);
  notifyProgress(options.onProgress, 'complete', file.size, file.size, resumable);
  return { uploadId: session.uploadId, idempotencyKey, sha256, alreadyAvailable: false, file: descriptor };
}

export function createPrivateFileUploadTask(
  accessToken: string,
  file: File,
  options: Omit<UploadPrivateFileOptions, 'signal'> = {},
): PrivateFileUploadTask {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    cancel: () => controller.abort(),
    result: uploadPrivateFile(accessToken, file, { ...options, signal: controller.signal }),
  };
}

async function requestJson<T>(path: string, accessToken: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('Authorization', `Bearer ${accessToken}`);

  let response: Response;
  try {
    response = await apiFetch(path, { ...init, headers });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new PrivateFileStorageError('Dosya servisine ulaşılamıyor. Lütfen yeniden deneyin.');
  }

  if (response.status === 401) throw new PrivateFileStorageSessionExpiredError();
  if (!response.ok) throw await responseError(response);
  try {
    return await response.json() as T;
  } catch {
    throw new PrivateFileStorageError('Dosya servisi geçersiz bir yanıt döndürdü.', response.status);
  }
}

async function responseError(response: Response): Promise<PrivateFileStorageError> {
  const body = await response.json().catch(() => null) as {
    message?: unknown;
    title?: unknown;
    detail?: unknown;
    errors?: Record<string, unknown>;
  } | null;
  const validationMessage = body?.errors
    ? Object.values(body.errors).flatMap((value) => Array.isArray(value) ? value : [value])
      .find((value): value is string => typeof value === 'string' && value.length > 0)
    : undefined;
  const message = [body?.message, body?.detail, validationMessage, body?.title]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return new PrivateFileStorageError(message ?? 'Dosya işlemi tamamlanamadı.', response.status);
}

async function hashFile(
  file: File,
  signal: AbortSignal | undefined,
  onProgress: UploadPrivateFileOptions['onProgress'],
  resumable: boolean,
): Promise<string> {
  notifyProgress(onProgress, 'hashing', 0, file.size, resumable);
  if (file.size <= SUPABASE_TUS_CHUNK_SIZE_BYTES && globalThis.crypto?.subtle) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    try {
      throwIfAborted(signal);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      notifyProgress(onProgress, 'hashing', file.size, file.size, resumable);
      return toHex(digest);
    } finally {
      bytes.fill(0);
    }
  }

  const { sha256 } = await import('@noble/hashes/sha2.js');
  throwIfAborted(signal);
  const hash = sha256.create();
  try {
    for (let offset = 0; offset < file.size; offset += HASH_CHUNK_SIZE_BYTES) {
      throwIfAborted(signal);
      const end = Math.min(offset + HASH_CHUNK_SIZE_BYTES, file.size);
      const bytes = new Uint8Array(await file.slice(offset, end).arrayBuffer());
      try {
        throwIfAborted(signal);
        hash.update(bytes);
      } finally {
        bytes.fill(0);
      }
      notifyProgress(onProgress, 'hashing', end, file.size, resumable);
    }
    return toHex(hash.digest());
  } finally {
    hash.destroy();
  }
}

function uploadWithSignedPut(
  file: File,
  uploadUrl: URL,
  headers: Record<string, string>,
  signal: AbortSignal | undefined,
  onProgress: UploadPrivateFileOptions['onProgress'],
): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve();
    };
    const abort = () => {
      request.abort();
      finish(abortError());
    };

    request.open('PUT', uploadUrl.toString(), true);
    request.withCredentials = false;
    Object.entries(headers).forEach(([name, value]) => request.setRequestHeader(name, value));
    request.upload.onprogress = (event) => {
      const transferred = event.lengthComputable ? event.loaded : Math.min(event.loaded, file.size);
      notifyProgress(onProgress, 'uploading', transferred, file.size, false);
    };
    request.onload = () => request.status >= 200 && request.status < 300
      ? finish()
      : finish(new PrivateFileStorageError('Dosya depolama servisine yüklenemedi.', request.status));
    request.onerror = () => finish(new PrivateFileStorageError('Dosya depolama servisine ulaşılamadı.'));
    request.onabort = () => finish(abortError());
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    notifyProgress(onProgress, 'uploading', 0, file.size, false);
    request.send(file);
  });
}

async function uploadWithTus(
  file: File,
  session: FileUploadSession,
  endpoint: URL,
  headers: Record<string, string>,
  sha256: string,
  contentType: string,
  options: UploadPrivateFileOptions,
): Promise<void> {
  const tus = await import('tus-js-client');
  throwIfAborted(options.signal);
  if (!tus.isSupported) throw new PrivateFileStorageError('Bu tarayıcı devam ettirilebilir yüklemeyi desteklemiyor.');

  const retryDelays = normalizeRetryDelays(options.retryDelays);
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let upload: InstanceType<typeof tus.Upload>;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve();
    };
    const abort = () => {
      finish(abortError());
      void upload.abort(false).catch(() => undefined);
    };

    upload = new tus.Upload(file, {
      endpoint: endpoint.toString(),
      chunkSize: SUPABASE_TUS_CHUNK_SIZE_BYTES,
      retryDelays,
      headers,
      uploadSize: file.size,
      uploadDataDuringCreation: false,
      storeFingerprintForResuming: options.resume !== false,
      removeFingerprintOnSuccess: true,
      fingerprint: () => Promise.resolve(`pesneer-${session.uploadId}-${sha256}`),
      metadata: {
        bucketName: session.bucket!,
        objectName: session.storagePath!,
        contentType,
        cacheControl: '300',
      },
      onProgress: (bytesTransferred, totalBytes) =>
        notifyProgress(options.onProgress, 'uploading', bytesTransferred, totalBytes, true),
      onSuccess: () => finish(),
      onError: (error) => {
        const status = error instanceof tus.DetailedError ? error.originalResponse?.getStatus() : undefined;
        finish(new PrivateFileStorageError('Devam ettirilebilir dosya yüklemesi tamamlanamadı.', status));
      },
    });

    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) {
      abort();
      return;
    }
    notifyProgress(options.onProgress, 'uploading', 0, file.size, true);

    const start = async () => {
      if (options.resume !== false) {
        try {
          const previous = (await upload.findPreviousUploads()).find((candidate) =>
            isSafePreviousUpload(candidate.uploadUrl, endpoint));
          if (previous) upload.resumeFromPreviousUpload(previous);
        } catch {
          // URL storage can be unavailable in hardened/private browser modes. A fresh TUS upload remains safe.
        }
      }
      throwIfAborted(options.signal);
      upload.start();
    };
    void start().catch((error) => finish(isAbortError(error) ? error : new PrivateFileStorageError(
      'Devam ettirilebilir dosya yüklemesi başlatılamadı.',
    )));
  });
}

function validateUploadSession(session: FileUploadSession, resumable: boolean): void {
  const expectedMethod = resumable ? 'TUS' : 'PUT';
  if (!session.uploadId || session.uploadMethod !== expectedMethod || !session.uploadUrl) {
    throw new PrivateFileStorageError('Dosya servisi uyumsuz bir yükleme oturumu döndürdü.');
  }
  if (resumable && (
    !session.uploadToken
    || !session.storagePath
    || !session.bucket
    || session.chunkSizeBytes !== SUPABASE_TUS_CHUNK_SIZE_BYTES
  )) {
    throw new PrivateFileStorageError('Devam ettirilebilir yükleme bilgileri eksik veya geçersiz.');
  }
}

function signedUploadHeaders(session: FileUploadSession, contentType: string): Record<string, string> {
  const allowed = session.uploadMethod === 'TUS'
    ? new Set(['x-signature'])
    : new Set(['content-type', 'cache-control']);
  const result: Record<string, string> = {};
  for (const [rawName, value] of Object.entries(session.requiredHeaders ?? {})) {
    const name = rawName.trim().toLowerCase();
    if (!allowed.has(name) || /[\r\n]/.test(value)) {
      throw new PrivateFileStorageError('Dosya servisi güvenli olmayan bir yükleme başlığı döndürdü.');
    }
    result[name] = value;
  }

  if (session.uploadMethod === 'TUS') {
    result['x-signature'] ??= session.uploadToken ?? '';
    if (!result['x-signature'] || result['x-signature'] !== session.uploadToken) {
      throw new PrivateFileStorageError('Yükleme imzası doğrulanamadı.');
    }
  } else {
    result['content-type'] ??= contentType;
    result['cache-control'] ??= 'max-age=300';
    if (normalizeContentType(result['content-type']) !== contentType) {
      throw new PrivateFileStorageError('Yükleme içerik türü dosyayla uyuşmuyor.');
    }
  }
  return result;
}

function assertDescriptor(descriptor: FileDescriptor, file: File, contentType: string, sha256: string): void {
  if (
    descriptor.fileName !== file.name
    || descriptor.sizeBytes !== file.size
    || descriptor.sha256.toLowerCase() !== sha256
    || normalizeContentType(descriptor.contentType) !== contentType
  ) {
    throw new PrivateFileStorageError('Doğrulanan dosya bilgileri yükleme isteğiyle uyuşmuyor.');
  }
}

function validateFile(file: File): void {
  if (!file || typeof file.name !== 'string' || typeof file.slice !== 'function'
    || file.size <= 0 || !file.name || /[\\/\x00-\x1f\x7f]/.test(file.name)) {
    throw new PrivateFileStorageError('Geçerli ve boş olmayan bir dosya seçin.');
  }
}

function normalizeIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 128 || /[\x00-\x1f\x7f]/.test(normalized)) {
    throw new PrivateFileStorageError('Idempotency anahtarı 8-128 güvenli karakter içermelidir.');
  }
  return normalized;
}

async function createStableIdempotencyKey(file: File, contentType: string, fileSha256: string): Promise<string> {
  const metadata = new TextEncoder().encode(`${file.name}\u0000${contentType}\u0000${file.size}`);
  try {
    const digest = globalThis.crypto?.subtle
      ? new Uint8Array(await crypto.subtle.digest('SHA-256', metadata))
      : (await import('@noble/hashes/sha2.js')).sha256(metadata);
    return `pesneer-${fileSha256}-${toHex(digest.subarray(0, 16))}`;
  } finally {
    metadata.fill(0);
  }
}

function normalizeContentType(value: string): string {
  const normalized = value.split(';', 1)[0].trim().toLowerCase();
  return normalized || 'application/octet-stream';
}

function inferContentType(fileName: string): string {
  const extension = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  return ({
    '.csv': 'text/csv',
    '.doc': 'application/msword',
    '.docm': 'application/vnd.ms-word.document.macroenabled.12',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.json': 'application/json',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
    '.odt': 'application/vnd.oasis.opendocument.text',
    '.odp': 'application/vnd.oasis.opendocument.presentation',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptm': 'application/vnd.ms-powerpoint.presentation.macroenabled.12',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.webp': 'image/webp',
    '.xls': 'application/vnd.ms-excel',
    '.xlsm': 'application/vnd.ms-excel.sheet.macroenabled.12',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xml': 'application/xml',
    '.zip': 'application/zip',
  } as Record<string, string>)[extension] ?? 'application/octet-stream';
}

function assertSafeRemoteUrl(value: string, message: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PrivateFileStorageError(message);
  }
  const localHttp = url.protocol === 'http:' && isLocalHost(url.hostname);
  if (url.protocol !== 'https:' && !localHttp) throw new PrivateFileStorageError(message);
  if (url.username || url.password) throw new PrivateFileStorageError(message);
  return url;
}

function isSafePreviousUpload(value: string | null, endpoint: URL): boolean {
  if (!value) return false;
  try {
    const url = assertSafeRemoteUrl(value, 'Geçersiz devam adresi.');
    const endpointPath = endpoint.pathname.replace(/\/+$/, '');
    return url.origin === endpoint.origin
      && (url.pathname === endpointPath || url.pathname.startsWith(`${endpointPath}/`));
  } catch {
    return false;
  }
}

function isLocalHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '[::1]';
}

function normalizeRetryDelays(value?: readonly number[]): number[] {
  const source = value ?? DEFAULT_TUS_RETRY_DELAYS;
  const normalized = source.filter((delay) => Number.isFinite(delay) && delay >= 0).map((delay) => Math.floor(delay));
  return normalized.length > 0 ? normalized.slice(0, 10) : [...DEFAULT_TUS_RETRY_DELAYS];
}

function notifyProgress(
  callback: UploadPrivateFileOptions['onProgress'],
  phase: PrivateFileUploadPhase,
  bytesTransferred: number,
  totalBytes: number,
  resumable: boolean,
): void {
  if (!callback) return;
  const safeTotal = Math.max(0, totalBytes);
  const safeTransferred = Math.min(Math.max(0, bytesTransferred), safeTotal);
  const percentage = safeTotal === 0 ? 0 : Math.round((safeTransferred / safeTotal) * 1_000) / 10;
  try {
    callback({ phase, bytesTransferred: safeTransferred, totalBytes: safeTotal, percentage, resumable });
  } catch {
    // Progress rendering must not break an in-flight upload.
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

function abortError(): DOMException {
  return new DOMException('Dosya yükleme iptal edildi.', 'AbortError');
}

function isAbortError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === 'AbortError';
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}
