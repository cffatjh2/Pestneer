export type ManagedAccount = {
  id: string;
  name: string;
  email: string;
  portal: 'Owner' | 'Employee' | 'Customer' | 'SystemAdmin';
  role: string;
};

export async function changeOwnPassword(accessToken: string, currentPassword: string, newPassword: string, newPasswordConfirmation: string) {
  return request<{ message: string }>('/api/account/password', accessToken, {
    method: 'PUT',
    body: JSON.stringify({ currentPassword, newPassword, newPasswordConfirmation }),
  });
}

export async function getCompanyManagedAccounts(accessToken: string) {
  return request<ManagedAccount[]>('/api/company/account-security/accounts', accessToken);
}

export async function resetCompanyAccountPassword(accessToken: string, accountId: string, newPassword: string, newPasswordConfirmation: string) {
  return request<{ message: string }>(`/api/company/account-security/accounts/${accountId}/password`, accessToken, {
    method: 'PUT',
    body: JSON.stringify({ newPassword, newPasswordConfirmation }),
  });
}

async function request<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) },
  });
  if (response.status === 401) throw new AccountSecuritySessionExpiredError();
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string; detail?: string; errors?: Record<string, string[]> } | null;
    throw new Error(payload?.message ?? payload?.detail ?? Object.values(payload?.errors ?? {}).flat()[0] ?? 'İşlem tamamlanamadı.');
  }
  return response.json() as Promise<T>;
}

export class AccountSecuritySessionExpiredError extends Error {}
