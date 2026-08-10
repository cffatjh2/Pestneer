export type AuditPackageFilter = {
  customerId: string;
  branchId?: string;
  periodStart: string;
  periodEnd: string;
  auditProfile: string;
  includeOptionalWaste: boolean;
};

export type AuditPreflightIssue = {
  code: string;
  severity: 'Blocking' | 'Warning';
  title: string;
  detail: string;
  suggestedAction?: string;
};

export type AuditSection = {
  code: string;
  label: string;
  itemCount: number;
  status: 'Complete' | 'Finding' | 'Optional';
};

export type AuditPreflight = AuditPackageFilter & {
  customerName: string;
  branchName: string;
  readinessScore: number;
  ready: boolean;
  blockingIssueCount: number;
  warningCount: number;
  evidenceCount: number;
  estimatedSizeBytes: number;
  issues: AuditPreflightIssue[];
  sections: AuditSection[];
};

export type AuditPackageItem = {
  id: string;
  section: string;
  sourceType: string;
  sourceId?: string;
  documentNumber: string;
  title: string;
  fileName: string;
  contentType: string;
  revision?: string;
  scope?: string;
  sourceDate: string;
  sha256: string;
  sizeBytes: number;
  downloadUrl: string;
};

export type AuditPackage = {
  id: string;
  number: string;
  title: string;
  auditProfile: string;
  status: string;
  customerId: string;
  customerName: string;
  branchId?: string;
  branchName: string;
  periodStart: string;
  periodEnd: string;
  includeOptionalWaste: boolean;
  readinessScore: number;
  itemCount: number;
  createdBy: string;
  createdAt: string;
  pdfSha256: string;
  zipSha256: string;
  pdfDownloadUrl: string;
  zipDownloadUrl: string;
  items: AuditPackageItem[];
};

export class AuditPackageSessionExpiredError extends Error {
  constructor(message = 'Oturumunuz güncel değil. Lütfen yeniden giriş yapın.') { super(message); this.name = 'AuditPackageSessionExpiredError'; }
}

export const getAuditPackages = (token: string) => request<AuditPackage[]>('/api/audit-packages', token);
export const previewAuditPackage = (token: string, input: AuditPackageFilter) => request<AuditPreflight>('/api/audit-packages/preflight', token, { method: 'POST', body: JSON.stringify(input) });
export const createAuditPackage = (token: string, input: AuditPackageFilter & { acknowledgeWarnings: boolean }) => request<AuditPackage>('/api/audit-packages', token, { method: 'POST', body: JSON.stringify(input) });

export async function downloadAuditPackage(token: string, path: string, fileName: string, open = false) {
  const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401 || response.status === 403) throw new AuditPackageSessionExpiredError();
  if (!response.ok) throw new Error('Denetim dosyası indirilemedi.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  if (open && blob.type === 'application/pdf') {
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers } });
  } catch {
    throw new Error('Denetim dosyası servisine ulaşılamıyor. Lütfen tekrar deneyin.');
  }
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { message?: string; detail?: string; errors?: Record<string, string[]> } | null;
    const validationMessage = problem?.errors ? Object.values(problem.errors).flat()[0] : undefined;
    if (response.status === 401 || response.status === 403) throw new AuditPackageSessionExpiredError(problem?.message);
    throw new Error(problem?.message ?? problem?.detail ?? validationMessage ?? 'İşlem tamamlanamadı.');
  }
  return response.json() as Promise<T>;
}
