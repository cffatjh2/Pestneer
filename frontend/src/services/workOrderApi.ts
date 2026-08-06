import type { WorkOrder, WorkStatus } from '../types';

export type CustomerBranchRecord = {
  id: string;
  name: string;
  code: string;
  address: string;
  city?: string;
  district?: string;
  contactName?: string;
  phoneNumber?: string;
  email?: string;
  latitude?: number;
  longitude?: number;
  mapUrl?: string;
  isActive: boolean;
};

export type CustomerRecord = {
  id: string;
  legalName: string;
  code: string;
  contactName?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  city?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  mapUrl?: string;
  isActive: boolean;
  branches: CustomerBranchRecord[];
};

export type CreateCustomerInput = {
  legalName: string;
  code?: string;
  contactName?: string;
  phoneNumber?: string;
  email?: string;
  address?: string;
  city?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  mapUrl?: string;
};

export type CreateBranchInput = {
  name: string;
  code?: string;
  address: string;
  city?: string;
  district?: string;
  contactName?: string;
  phoneNumber?: string;
  email?: string;
  latitude?: number;
  longitude?: number;
  mapUrl?: string;
};

export type CreateWorkOrdersInput = {
  customerId: string;
  branchIds: string[];
  serviceType: string;
  date: string;
  time: string;
  durationMinutes: number;
  employeeAccountId?: string;
  notes?: string;
};

type WorkOrderResponse = {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  branchId?: string;
  branchName: string;
  branchAddress: string;
  branchMapUrl?: string;
  serviceType: string;
  scheduledAt: string;
  durationMinutes: number;
  employeeAccountId?: string;
  employeeName: string;
  status: string;
  notes?: string;
};

export class WorkOrderSessionExpiredError extends Error {
  constructor(message = 'Oturumunuz güncel değil. Lütfen yeniden giriş yapın.') {
    super(message);
    this.name = 'WorkOrderSessionExpiredError';
  }
}

export async function getCustomers(accessToken: string): Promise<CustomerRecord[]> {
  return request<CustomerRecord[]>('/api/company/customers', accessToken);
}

export async function createCustomer(accessToken: string, input: CreateCustomerInput): Promise<CustomerRecord> {
  return request<CustomerRecord>('/api/company/customers', accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function addCustomerBranches(
  accessToken: string,
  customerId: string,
  branches: CreateBranchInput[],
): Promise<CustomerBranchRecord[]> {
  return request<CustomerBranchRecord[]>(`/api/company/customers/${customerId}/branches/bulk`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ branches }),
  });
}

export async function getWorkOrders(accessToken: string): Promise<WorkOrder[]> {
  const items = await request<WorkOrderResponse[]>('/api/company/work-orders', accessToken);
  return items.map(mapWorkOrder);
}

export async function createWorkOrders(
  accessToken: string,
  input: CreateWorkOrdersInput,
): Promise<WorkOrder[]> {
  const items = await request<WorkOrderResponse[]>('/api/company/work-orders/batch', accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return items.map(mapWorkOrder);
}

function mapWorkOrder(item: WorkOrderResponse): WorkOrder {
  const start = new Date(item.scheduledAt);
  const end = new Date(start.getTime() + item.durationMinutes * 60_000);
  return {
    recordId: item.id,
    id: item.number,
    customerId: item.customerId,
    branchId: item.branchId,
    client: item.customerName,
    branch: item.branchName,
    branchAddress: item.branchAddress,
    branchMapUrl: item.branchMapUrl,
    scheduledAt: item.scheduledAt,
    date: new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }).format(start),
    time: `${formatTime(start)} - ${formatTime(end)}`,
    service: item.serviceType,
    technician: item.employeeName,
    status: mapStatus(item.status),
    area: '-',
    notes: item.notes,
  };
}

function mapStatus(status: string): WorkStatus {
  if (status === 'InProgress') return 'Sahada';
  if (status === 'Completed') return 'Tamamlandı';
  return 'Planlandı';
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(value);
}

async function request<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...init?.headers,
      },
    });
  } catch {
    throw new Error('İş emri servisine ulaşılamıyor. Lütfen tekrar deneyin.');
  }

  if (!response.ok) {
    const problem = await response.json().catch(() => null) as {
      message?: string;
      errors?: Record<string, string[]>;
    } | null;
    const validationMessage = problem?.errors ? Object.values(problem.errors).flat()[0] : undefined;
    if (response.status === 401 || response.status === 403) {
      throw new WorkOrderSessionExpiredError(problem?.message);
    }
    throw new Error(problem?.message ?? validationMessage ?? 'İşlem tamamlanamadı.');
  }

  return response.json() as Promise<T>;
}
