export type CustomerPortalBranch = { id: string; name: string; code: string; address: string; city?: string; district?: string; phoneNumber?: string; email?: string; mapUrl?: string };
export type CustomerPortalWorkOrder = { id: string; number: string; branchId?: string; branchName: string; serviceType: string; visitType: string; scheduledAt: string; durationMinutes: number; status: string; employeeName: string; completionNote?: string; recommendation?: string };
export type EmergencyHistory = { status: string; note?: string; occurredAt: string; changedBy: string };
export type EmergencyRequestRecord = { id: string; number: string; customerId: string; customerName: string; branchId?: string; branchName: string; serviceType: string; priority: string; status: string; description: string; contactPhone?: string; assignedEmployeeAccountId?: string; employeeName: string; requestedAt: string; acknowledgedAt?: string; completedAt?: string; history: EmergencyHistory[] };
export type CustomerPortalSummary = { customerId: string; customerName: string; scope: 'Customer' | 'Branch'; branches: CustomerPortalBranch[]; upcomingWorkOrders: CustomerPortalWorkOrder[]; completedWorkOrders: CustomerPortalWorkOrder[]; emergencyRequests: EmergencyRequestRecord[] };
export type CreateEmergencyRequestInput = { branchId?: string; serviceType: 'EmergencyPaid' | 'EmergencyFree'; priority: 'Normal' | 'Urgent' | 'Critical'; description: string; contactPhone?: string };
export type UpdateEmergencyRequestInput = { status: string; employeeAccountId?: string; note?: string };

export class CustomerPortalSessionExpiredError extends Error {
  constructor(message = 'Oturumunuz güncel değil. Lütfen yeniden giriş yapın.') { super(message); this.name = 'CustomerPortalSessionExpiredError'; }
}

export const getCustomerPortalSummary = (token: string) => request<CustomerPortalSummary>('/api/customer/portal/summary', token);
export const createEmergencyRequest = (token: string, input: CreateEmergencyRequestInput) => request<EmergencyRequestRecord>('/api/customer/portal/emergency-requests', token, { method: 'POST', body: JSON.stringify(input) });
export const getCompanyEmergencyRequests = (token: string) => request<EmergencyRequestRecord[]>('/api/company/emergency-requests', token);
export const updateCompanyEmergencyRequest = (token: string, id: string, input: UpdateEmergencyRequestInput) => request<EmergencyRequestRecord>(`/api/company/emergency-requests/${id}`, token, { method: 'PUT', body: JSON.stringify(input) });
export const getEmployeeEmergencyRequests = (token: string) => request<EmergencyRequestRecord[]>('/api/employee/emergency-requests', token);
export const updateEmployeeEmergencyRequest = (token: string, id: string, input: UpdateEmergencyRequestInput) => request<EmergencyRequestRecord>(`/api/employee/emergency-requests/${id}/status`, token, { method: 'PUT', body: JSON.stringify(input) });

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers } }); }
  catch { throw new Error('Müşteri portalı servisine ulaşılamıyor. Lütfen tekrar deneyin.'); }
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { message?: string; detail?: string; errors?: Record<string, string[]> } | null;
    const validationMessage = problem?.errors ? Object.values(problem.errors).flat()[0] : undefined;
    if (response.status === 401 || response.status === 403) throw new CustomerPortalSessionExpiredError(problem?.message);
    throw new Error(problem?.message ?? problem?.detail ?? validationMessage ?? 'İşlem tamamlanamadı.');
  }
  return response.json() as Promise<T>;
}
