export type CompanyBranding = {
  companyName: string;
  hasLogo: boolean;
  logoFileName?: string;
  logoUpdatedAt?: string;
  logoUrl?: string;
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

async function request(accessToken: string, url: string, init?: RequestInit) {
  let response: Response;
  try { response = await fetch(url, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` } }); }
  catch { throw new Error('Sunucuya bağlanılamadı.'); }
  if (response.status === 401) throw new CompanyBrandingSessionExpiredError();
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(payload?.message ?? 'Firma markası güncellenemedi.');
  }
  return response;
}

export class CompanyBrandingSessionExpiredError extends Error {}
