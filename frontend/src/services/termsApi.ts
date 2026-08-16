const API_BASE = '/api';

export type AcceptTermsResponse = {
  success: boolean;
  hasAcceptedTerms: boolean;
  termsAcceptedAt: string;
  termsAcceptedVersion: string;
  message: string;
};

export async function acceptTerms(
  accessToken: string,
  version = '2026.1',
  consentMarketing = true
): Promise<AcceptTermsResponse> {
  const response = await fetch(`${API_BASE}/account/accept-terms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ version, consentMarketing }),
  });

  if (!response.ok) {
    let message = 'Onay kaydedilemedi.';
    try {
      const data = await response.json();
      message = data.message || message;
    } catch {
      // noop
    }
    throw new Error(message);
  }

  return response.json();
}
