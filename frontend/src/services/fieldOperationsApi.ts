export type AttendanceStatus = 'notStarted' | 'working' | 'onBreak' | 'completed';

export type AttendanceRecord = {
  shiftId?: string;
  status: AttendanceStatus;
  workDate: string;
  startedAt?: string;
  endedAt?: string;
  workedMinutes: number;
  breakMinutes: number;
  calculatedAt: string;
};

export type VehicleStockItemInput = {
  vehicleStockItemId?: string;
  productName: string;
  quantity: number;
  unit: string;
  isManual: boolean;
};

export type VehicleStockCheck = {
  id: string;
  checkedAt: string;
  vehicleId?: string;
  plate?: string;
  vehicleDescription?: string;
  items: Array<VehicleStockItemInput & { id: string; inventoryItemId?: string }>;
};

export type WorkforceEmployee = {
  employeeId: string;
  name: string;
  email: string;
  status: AttendanceStatus | 'inactive';
  startedAt?: string;
  endedAt?: string;
  todayWorkedMinutes: number;
  todayBreakMinutes: number;
  weekWorkedMinutes: number;
  monthWorkedMinutes: number;
  lastStockCheckAt?: string;
};

export type WorkforceAnalytics = {
  date: string;
  activeEmployees: number;
  workingEmployees: number;
  completedEmployees: number;
  totalWorkedMinutes: number;
  weekWorkedMinutes: number;
  monthWorkedMinutes: number;
  employees: WorkforceEmployee[];
};

export class FieldSessionExpiredError extends Error {}

export const getTodayAttendance = (token: string) =>
  request<AttendanceRecord>('/api/employee/operations/attendance/today', token);

export const startShift = (token: string) =>
  request<AttendanceRecord>('/api/employee/operations/attendance/start', token, { method: 'POST' });

export const startBreak = (token: string) =>
  request<AttendanceRecord>('/api/employee/operations/attendance/break/start', token, { method: 'POST' });

export const endBreak = (token: string) =>
  request<AttendanceRecord>('/api/employee/operations/attendance/break/end', token, { method: 'POST' });

export const finishShift = (token: string) =>
  request<AttendanceRecord>('/api/employee/operations/attendance/finish', token, { method: 'POST' });

export const getVehicleStockCatalog = (token: string) =>
  request<string[]>('/api/employee/operations/vehicle-stock/catalog', token);

export const getLatestVehicleStock = (token: string) =>
  request<VehicleStockCheck | null>('/api/employee/operations/vehicle-stock/latest', token);

export const createVehicleStockCheck = (token: string, items: VehicleStockItemInput[]) =>
  request<VehicleStockCheck>('/api/employee/operations/vehicle-stock/checks', token, {
    method: 'POST',
    body: JSON.stringify({ items }),
  });

export const getWorkforceAnalytics = (token: string) =>
  request<WorkforceAnalytics>('/api/company/analytics/workforce', token);

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
    });
  } catch {
    throw new Error('Operasyon servisine ulaşılamıyor. Lütfen tekrar deneyin.');
  }

  if (response.status === 204) return null as T;
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as {
      message?: string;
      detail?: string;
      errors?: Record<string, string[]>;
    } | null;
    const validationMessage = problem?.errors ? Object.values(problem.errors).flat()[0] : undefined;
    const message = problem?.message ?? problem?.detail ?? validationMessage ?? 'İşlem tamamlanamadı.';
    if (response.status === 401 || response.status === 403) throw new FieldSessionExpiredError(message);
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}
