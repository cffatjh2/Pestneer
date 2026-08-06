import type { AuthenticatedSession, LoginCredentials, PortalType } from '../auth/types';

export async function login(portal: PortalType, credentials: LoginCredentials): Promise<AuthenticatedSession> {
  let response: Response;

  try {
    response = await fetch(`/api/auth/${portal}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...credentials,
        companyCode: credentials.companyCode.trim(),
        email: credentials.email.trim(),
      }),
    });
  } catch {
    throw new Error('Giriş servisine ulaşılamıyor. Lütfen API servisinin çalıştığından emin olun.');
  }

  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(problem?.message ?? 'Giriş bilgileri doğrulanamadı.');
  }

  return response.json() as Promise<AuthenticatedSession>;
}
