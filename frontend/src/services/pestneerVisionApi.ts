export type VisionModelPreference = 'Auto' | 'pVision' | 'pLens';

export type VisionSettings = {
  enabled: boolean;
  reviewRequired: boolean;
  preferredModel: VisionModelPreference;
  disclaimer: string;
};

export async function getVisionSettings(token: string): Promise<VisionSettings> {
  return request('/api/vision/settings', token);
}

export async function updateVisionSettings(token: string, settings: Omit<VisionSettings, 'disclaimer'>): Promise<VisionSettings> {
  return request('/api/company/vision/settings', token, { method: 'PUT', body: JSON.stringify(settings) });
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { message?: string; detail?: string } | null;
    throw new Error(problem?.message ?? problem?.detail ?? 'PestneerVision ayarları alınamadı.');
  }
  return response.json() as Promise<T>;
}
