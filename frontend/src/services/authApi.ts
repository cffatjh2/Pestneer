import type { AuthenticatedSession, LoginCredentials, PortalType } from '../auth/types';
import { apiFetch } from './apiBase';

export async function login(portal: PortalType, credentials: LoginCredentials): Promise<AuthenticatedSession> {
  let response: Response;

  try {
    response = await apiFetch(`/api/auth/${portal}/login`, {
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

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error('Giriş servisi yanıt vermedi. Lütfen tekrar deneyin.');
  }

  return response.json() as Promise<AuthenticatedSession>;
}
