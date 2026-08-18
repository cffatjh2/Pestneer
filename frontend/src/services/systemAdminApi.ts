import { apiFetch } from './apiBase';

export type SystemAdminSession = { accessToken: string; expiresAt: string; user: { id: string; displayName: string; email: string } };
export type SystemCompany = {
  id: string;
  legalName: string;
  code: string;
  isActive: boolean;
  isTrial: boolean;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  isTrialExpired: boolean;
  remainingDays: number;
  ownerName?: string | null;
  ownerEmail?: string | null;
  ownerPhone?: string | null;
  reportNotificationEmail?: string | null;
  createdAt: string;
  ownerCount: number;
  employeeCount: number;
  customerCount: number;
};
export type SystemAccount = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  portal: 'Owner' | 'Employee' | 'Customer' | 'SystemAdmin';
  role: string;
  hasAcceptedTerms?: boolean;
  createdAt?: string | null;
};

export const loginSystemAdmin = (email: string, password: string) => request<SystemAdminSession>('/api/system-control/auth/login', undefined, { method: 'POST', body: JSON.stringify({ email, password }) });
export const getSystemCompanies = (token: string) => request<SystemCompany[]>('/api/system-control/companies', token);
export const createSystemCompany = (token: string, input: Record<string, unknown>) => request('/api/system-control/companies', token, { method: 'POST', body: JSON.stringify(input) });
export const convertCompanyToReal = (token: string, companyId: string) => request<{ message: string; id: string; isTrial: boolean }>(`/api/system-control/companies/${companyId}/convert-to-real`, token, { method: 'POST' });
export const extendCompanyTrial = (token: string, companyId: string, days = 7) => request<{ message: string; id: string; isTrial: boolean; trialEndsAt: string }>(`/api/system-control/companies/${companyId}/extend-trial`, token, { method: 'POST', body: JSON.stringify({ days }) });
export const setCompanyTrial = (token: string, companyId: string, days = 7) => request<{ message: string; id: string; isTrial: boolean; trialEndsAt: string }>(`/api/system-control/companies/${companyId}/set-trial`, token, { method: 'POST', body: JSON.stringify({ days }) });
export const createSystemEmployee = (token: string, companyId: string, input: Record<string, unknown>) => request(`/api/system-control/companies/${companyId}/employees`, token, { method: 'POST', body: JSON.stringify(input) });
export const createSystemCustomer = (token: string, companyId: string, input: Record<string, unknown>) => request(`/api/system-control/companies/${companyId}/customers`, token, { method: 'POST', body: JSON.stringify(input) });
export const createSystemAdmin = (token: string, input: Record<string, unknown>) => request('/api/system-control/admins', token, { method: 'POST', body: JSON.stringify(input) });
export const getSystemAdmins = (token: string) => request<SystemAccount[]>('/api/system-control/admins', token);
export const getSystemCompanyAccounts = (token: string, companyId: string) => request<SystemAccount[]>(`/api/system-control/companies/${companyId}/accounts`, token);
export const resetSystemAccountPassword = (token: string, accountId: string, newPassword: string, newPasswordConfirmation: string) => request<{ message: string }>(`/api/system-control/accounts/${accountId}/password`, token, { method: 'PUT', body: JSON.stringify({ newPassword, newPasswordConfirmation }) });

async function request<T = unknown>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  if (!contentType.includes('application/json') && response.status !== 204) {
    throw new Error('API servisi yanıt vermedi veya sunucu geçersiz yanıt döndürdü.');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
      title?: string;
      errors?: Record<string, string[]>;
    };
    throw new Error(
      body.message ?? Object.values(body.errors ?? {}).flat()[0] ?? body.title ?? 'Giriş bilgileri hatalı veya yetkisiz erişim.'
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
