export type CompanyEk1Defaults = {
  firmName?: string;
  firmAddress?: string;
  firmPhone?: string;
  firmWeb?: string;
  responsibleManager?: string;
  teamManager?: string;
  permissionNumber?: string;
};

const STORAGE_KEY = 'pesneer_ek1_company_defaults';

export function getStoredCompanyEk1Defaults(companyName?: string): CompanyEk1Defaults {
  try {
    const key = companyName ? `${STORAGE_KEY}_${companyName.trim().toLowerCase().replace(/\s+/g, '_')}` : STORAGE_KEY;
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw) as CompanyEk1Defaults;
  } catch {
    return {};
  }
}

export function saveStoredCompanyEk1Defaults(defaults: CompanyEk1Defaults, companyName?: string): void {
  try {
    const serialized = JSON.stringify(defaults);
    if (companyName) {
      const key = `${STORAGE_KEY}_${companyName.trim().toLowerCase().replace(/\s+/g, '_')}`;
      localStorage.setItem(key, serialized);
    } else {
      localStorage.setItem(STORAGE_KEY, serialized);
    }
  } catch {
    // Ignore localStorage write quota errors
  }
}
