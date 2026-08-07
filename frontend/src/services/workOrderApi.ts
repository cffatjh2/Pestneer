import type { WorkOrder, WorkStatus } from '../types';

export type CustomerBranchRecord = { id: string; name: string; code: string; address: string; city?: string; district?: string; contactName?: string; phoneNumber?: string; email?: string; latitude?: number; longitude?: number; mapUrl?: string; isActive: boolean };
export type CustomerRecord = { id: string; legalName: string; code: string; contactName?: string; phoneNumber?: string; email?: string; address?: string; city?: string; district?: string; latitude?: number; longitude?: number; mapUrl?: string; isActive: boolean; branches: CustomerBranchRecord[] };
export type CreateCustomerInput = { legalName: string; code?: string; contactName?: string; phoneNumber?: string; email?: string; address?: string; city?: string; district?: string; latitude?: number; longitude?: number; mapUrl?: string; portalContactName?: string; portalEmail?: string; portalPassword?: string };
export type CreateBranchInput = { name: string; code?: string; address: string; city?: string; district?: string; contactName?: string; phoneNumber?: string; email?: string; latitude?: number; longitude?: number; mapUrl?: string; portalContactName?: string; portalEmail?: string; portalPassword?: string };
export type BranchEmployeeAssignmentInput = { branchId: string; employeeAccountId?: string };

export type CreateWorkOrdersInput = {
  customerId: string; branchIds: string[]; serviceType: string; date: string; time: string; durationMinutes: number;
  employeeAccountId?: string; notes?: string; visitType?: string; recurrenceType?: string; occurrenceCount?: number;
  manualDates?: string[]; branchAssignments?: BranchEmployeeAssignmentInput[];
};

export type UpdateWorkOrderInput = {
  employeeAccountId?: string; serviceType: string; visitType: string; date: string; time: string;
  durationMinutes: number; notes?: string; status: string;
};

type WorkOrderResponse = {
  id: string; number: string; customerId: string; customerName: string; branchId?: string; branchName: string; branchAddress: string; branchMapUrl?: string;
  serviceType: string; visitType: string; recurrenceType: string; recurrenceGroupId?: string; scheduledAt: string; durationMinutes: number;
  employeeAccountId?: string; employeeName: string; status: string; notes?: string; startedAt?: string; completedAt?: string;
  completionNote?: string; recommendation?: string; history: WorkOrder['history']; photos: WorkOrder['photos'];
};

export type EmployeePlanningOptions = { canSelfSchedule: boolean; customers: CustomerRecord[] };

export class WorkOrderSessionExpiredError extends Error {
  constructor(message = 'Oturumunuz güncel değil. Lütfen yeniden giriş yapın.') { super(message); this.name = 'WorkOrderSessionExpiredError'; }
}

export const getCustomers = (token: string) => request<CustomerRecord[]>('/api/company/customers', token);
export const createCustomer = (token: string, input: CreateCustomerInput) => request<CustomerRecord>('/api/company/customers', token, { method: 'POST', body: JSON.stringify(input) });
export const addCustomerBranches = (token: string, customerId: string, branches: CreateBranchInput[]) => request<CustomerBranchRecord[]>(`/api/company/customers/${customerId}/branches/bulk`, token, { method: 'POST', body: JSON.stringify({ branches }) });
export async function getWorkOrders(token: string) { return (await request<WorkOrderResponse[]>('/api/company/work-orders', token)).map(mapWorkOrder); }
export async function createWorkOrders(token: string, input: CreateWorkOrdersInput) { return (await request<WorkOrderResponse[]>('/api/company/work-orders/batch', token, { method: 'POST', body: JSON.stringify(input) })).map(mapWorkOrder); }
export async function updateWorkOrder(token: string, id: string, input: UpdateWorkOrderInput) { return mapWorkOrder(await request<WorkOrderResponse>(`/api/company/work-orders/${id}`, token, { method: 'PUT', body: JSON.stringify(input) })); }
export async function getEmployeeWorkOrders(token: string) { return (await request<WorkOrderResponse[]>('/api/employee/work-orders', token)).map(mapWorkOrder); }
export const getEmployeePlanningOptions = (token: string) => request<EmployeePlanningOptions>('/api/employee/work-orders/planning-options', token);
export async function selfScheduleWorkOrders(token: string, input: CreateWorkOrdersInput) { return (await request<WorkOrderResponse[]>('/api/employee/work-orders/self-schedule', token, { method: 'POST', body: JSON.stringify(input) })).map(mapWorkOrder); }
export async function startEmployeeWorkOrder(token: string, id: string) { return mapWorkOrder(await request<WorkOrderResponse>(`/api/employee/work-orders/${id}/start`, token, { method: 'POST' })); }
export async function completeEmployeeWorkOrder(token: string, id: string, completionNote: string, recommendation: string, photos: File[]) {
  const form = new FormData();
  form.set('completionNote', completionNote); form.set('recommendation', recommendation);
  photos.forEach((photo) => form.append('photos', photo));
  return mapWorkOrder(await request<WorkOrderResponse>(`/api/employee/work-orders/${id}/complete`, token, { method: 'POST', body: form }, false));
}

function mapWorkOrder(item: WorkOrderResponse): WorkOrder {
  const start = new Date(item.scheduledAt); const end = new Date(start.getTime() + item.durationMinutes * 60_000);
  return {
    recordId: item.id, id: item.number, customerId: item.customerId, branchId: item.branchId, client: item.customerName, branch: item.branchName,
    branchAddress: item.branchAddress, branchMapUrl: item.branchMapUrl, employeeAccountId: item.employeeAccountId, scheduledAt: item.scheduledAt,
    durationMinutes: item.durationMinutes, date: new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }).format(start),
    time: `${formatTime(start)} - ${formatTime(end)}`, service: item.serviceType, visitType: item.visitType, recurrenceType: item.recurrenceType,
    recurrenceGroupId: item.recurrenceGroupId, technician: item.employeeName, technicalStatus: item.status, status: mapStatus(item.status), area: '-', notes: item.notes,
    startedAt: item.startedAt, completedAt: item.completedAt, completionNote: item.completionNote, recommendation: item.recommendation,
    history: item.history ?? [], photos: item.photos ?? [],
  };
}

function mapStatus(status: string): WorkStatus {
  if (status === 'InProgress') return 'Sahada';
  if (status === 'Completed') return 'Tamamlandı';
  if (status === 'Cancelled') return 'İptal';
  return 'Planlandı';
}
function formatTime(value: Date) { return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(value); }

async function request<T>(path: string, token: string, init?: RequestInit, json = true): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { ...init, headers: { ...(json ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...init?.headers } }); }
  catch { throw new Error('İş emri servisine ulaşılamıyor. Lütfen tekrar deneyin.'); }
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { message?: string; detail?: string; errors?: Record<string, string[]> } | null;
    const validationMessage = problem?.errors ? Object.values(problem.errors).flat()[0] : undefined;
    if (response.status === 401 || response.status === 403) throw new WorkOrderSessionExpiredError(problem?.message);
    throw new Error(problem?.message ?? problem?.detail ?? validationMessage ?? 'İşlem tamamlanamadı.');
  }
  return response.json() as Promise<T>;
}
