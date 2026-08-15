export type SystemAdminSession = { accessToken: string; expiresAt: string; user: { id: string; displayName: string; email: string } };
export type SystemCompany = { id: string; legalName: string; code: string; isActive: boolean; createdAt: string; ownerCount: number; employeeCount: number; customerCount: number };

export const loginSystemAdmin = (email: string, password: string) => request<SystemAdminSession>('/api/system-control/auth/login', undefined, { method: 'POST', body: JSON.stringify({ email, password }) });
export const getSystemCompanies = (token: string) => request<SystemCompany[]>('/api/system-control/companies', token);
export const createSystemCompany = (token: string, input: Record<string, unknown>) => request('/api/system-control/companies', token, { method: 'POST', body: JSON.stringify(input) });
export const createSystemEmployee = (token: string, companyId: string, input: Record<string, unknown>) => request(`/api/system-control/companies/${companyId}/employees`, token, { method: 'POST', body: JSON.stringify(input) });
export const createSystemCustomer = (token: string, companyId: string, input: Record<string, unknown>) => request(`/api/system-control/companies/${companyId}/customers`, token, { method: 'POST', body: JSON.stringify(input) });

async function request<T = unknown>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers ?? {}) } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string; title?: string; errors?: Record<string, string[]> };
    throw new Error(body.message ?? Object.values(body.errors ?? {}).flat()[0] ?? body.title ?? 'İşlem tamamlanamadı.');
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
