export type CompanyBranding = {
  companyName: string;
  hasLogo: boolean;
  logoFileName?: string;
  logoUpdatedAt?: string;
  logoUrl?: string;
  reportNotificationEmail?: string;
  emailDeliveryConfigured: boolean;
  emailDeliveryProvider?: string;
  emailDeliveryConfigurationError?: string;
  emailOAuthAvailable: boolean;
  emailOAuthConnected: boolean;
  emailOAuthSenderEmail?: string;
  emailOAuthConnectedAt?: string;
  emailOAuthLastError?: string;
};

export async function getCompanyBranding(accessToken: string) {
  const response = await request(accessToken, '/api/company/branding/');
  return response.json() as Promise<CompanyBranding>;
}

export async function getCompanyLogoObjectUrl(accessToken: string) {
  const response = await request(accessToken, '/api/company/branding/logo');
  return URL.createObjectURL(await response.blob());
}

export async function uploadCompanyLogo(accessToken: string, logo: File) {
  const form = new FormData();
  form.append('logo', logo);
  const response = await request(accessToken, '/api/company/branding/logo', { method: 'POST', body: form });
  return response.json() as Promise<CompanyBranding>;
}

export async function deleteCompanyLogo(accessToken: string) {
  await request(accessToken, '/api/company/branding/logo', { method: 'DELETE' });
}

export async function updateReportNotificationEmail(accessToken: string, email?: string) {
  const response = await request(accessToken, '/api/company/branding/report-notification-email', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email?.trim() || null })
  });
  return response.json() as Promise<{ reportNotificationEmail?: string }>;
}

export async function retryReportEmails(accessToken: string) {
  const response = await request(accessToken, '/api/company/branding/email/retry', { method: 'POST' });
  return response.json() as Promise<{ reset: number; sent: number }>;
}

export async function testReportEmail(accessToken: string, email?: string) {
  const response = await request(accessToken, '/api/company/branding/email/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email?.trim() || null })
  });
  return response.json() as Promise<{ sent: boolean; recipient: string; provider: string }>;
}

export async function startGoogleEmailConnection(accessToken: string) {
  const response = await request(accessToken, '/api/company/branding/email/google/connect', { method: 'POST' });
  return response.json() as Promise<{ authorizationUrl: string }>;
}

export async function disconnectGoogleEmailConnection(accessToken: string) {
  await request(accessToken, '/api/company/branding/email/google', { method: 'DELETE' });
}

async function request(accessToken: string, url: string, init?: RequestInit) {
  let response: Response;
  try { response = await fetch(url, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` } }); }
  catch { throw new Error('Sunucuya bağlanılamadı.'); }
  if (response.status === 401) throw new CompanyBrandingSessionExpiredError();
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string; detail?: string; errors?: Record<string, string[]> } | null;
    throw new Error(payload?.message ?? payload?.detail ?? Object.values(payload?.errors ?? {})[0]?.[0] ?? 'Firma markası güncellenemedi.');
  }
  return response;
}

export class CompanyBrandingSessionExpiredError extends Error {}
