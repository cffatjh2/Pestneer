export type ReportStationInput = {
  deviceNumber: string; area: string; deviceType: string; targetPest?: string; caughtCount: number;
  hasActivity: boolean; plateChanged: boolean; deviceStatus: string; notes?: string;
};

export type ReportProductInput = {
  productName: string; licenseNumber?: string; applicationMethod?: string; dilutionRate?: string;
  activeIngredient?: string; antidote?: string; packingQuantity?: string; amountUsed: number; unit: string;
};

export type UpsertServiceReportInput = {
  firmName: string; firmAddress?: string; firmPhone?: string; firmWeb?: string; responsibleManager?: string;
  permissionNumber?: string; teamManager?: string; targetPests?: string; residenceType?: string;
  areaSquareMeters?: number; workType?: string; consumables?: string; safetyMeasures?: string;
  applicationSummary?: string; findings?: string; correctiveActions?: string; recommendations?: string;
  customerRepresentativeName?: string; managerSignatureData?: string; customerSignatureData?: string;
  finalize: boolean; stations: ReportStationInput[]; products: ReportProductInput[];
};

export type ReportStation = ReportStationInput & { id: string };
export type ReportProduct = ReportProductInput & { id: string };
export type ReportPhoto = { id: string; fileName: string; contentType: string; uploadedAt: string; url: string };

export type ServiceReportRecord = {
  id: string; workOrderId: string; workOrderNumber: string; reportNumber: string; status: 'Draft' | 'Finalized';
  customerId: string; customerName: string; branchId?: string; branchName: string; branchAddress: string;
  scheduledAt: string; startedAt?: string; completedAt?: string; operatorName: string;
  firmName: string; firmAddress?: string; firmPhone?: string; firmWeb?: string; responsibleManager?: string;
  permissionNumber?: string; teamManager?: string; targetPests?: string; residenceType?: string;
  areaSquareMeters?: number; workType?: string; consumables?: string; safetyMeasures?: string;
  applicationSummary?: string; findings?: string; correctiveActions?: string; recommendations?: string;
  customerRepresentativeName?: string; managerSignatureData?: string; customerSignatureData?: string;
  verificationCode: string; updatedAt: string; finalizedAt?: string; totalStations: number; activeStations: number;
  plateChanges: number; totalCaught: number; activityRate: number; riskScore: number; riskLevel: 'Low' | 'Medium' | 'High';
  infestationIndicator: boolean; stations: ReportStation[]; products: ReportProduct[]; photos: ReportPhoto[];
};

export type TrendPeriod = { period: string; reportCount: number; totalStations: number; activeStations: number; plateChanges: number; totalCaught: number; activityRate: number; riskScore: number; riskLevel: string };
export type ServiceReportAnalytics = { from: string; to: string; reportCount: number; totalStations: number; activeStations: number; totalCaught: number; activityRate: number; riskScore: number; riskLevel: string; periods: TrendPeriod[]; pestTotals: { pest: string; totalCaught: number }[] };

export class ReportSessionExpiredError extends Error {
  constructor(message = 'Oturumunuz güncel değil. Lütfen yeniden giriş yapın.') { super(message); this.name = 'ReportSessionExpiredError'; }
}

export const getCompanyServiceReports = (token: string) => request<ServiceReportRecord[]>('/api/company/service-reports', token);
export const getEmployeeServiceReports = (token: string) => request<ServiceReportRecord[]>('/api/employee/service-reports', token);
export const getCustomerServiceReports = (token: string) => request<ServiceReportRecord[]>('/api/customer/service-reports', token);
export const getServiceReportByWorkOrder = (token: string, workOrderId: string) => request<ServiceReportRecord>(`/api/service-reports/work-orders/${workOrderId}`, token);
export const saveServiceReport = (token: string, workOrderId: string, input: UpsertServiceReportInput) => request<ServiceReportRecord>(`/api/service-reports/work-orders/${workOrderId}`, token, { method: 'PUT', body: JSON.stringify(input) });
export const getServiceReportAnalytics = (token: string, query = '') => request<ServiceReportAnalytics>(`/api/company/service-reports/analytics${query ? `?${query}` : ''}`, token);

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers } }); }
  catch { throw new Error('Rapor servisine ulaşılamıyor. Lütfen tekrar deneyin.'); }
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { message?: string; detail?: string; errors?: Record<string, string[]> } | null;
    const validationMessage = problem?.errors ? Object.values(problem.errors).flat()[0] : undefined;
    if (response.status === 401 || response.status === 403) throw new ReportSessionExpiredError(problem?.message);
    throw new Error(problem?.message ?? problem?.detail ?? validationMessage ?? 'Rapor işlemi tamamlanamadı.');
  }
  return response.json() as Promise<T>;
}
