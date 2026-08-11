export type CalendarEntryKind = 'Task' | 'Note' | 'WorkOrder';
export type CalendarEntryPriority = 'Low' | 'Normal' | 'High';
export type CalendarEntryStatus = 'Planned' | 'Completed';

export type CalendarEntryRecord = {
  id: string;
  kind: CalendarEntryKind;
  title: string;
  description?: string;
  scheduledAt: string;
  isAllDay: boolean;
  assignedEmployeeAccountId?: string;
  assignedEmployeeName?: string;
  priority: CalendarEntryPriority;
  status: CalendarEntryStatus;
  createdAt: string;
  sourceType: 'CalendarEntry' | 'WorkOrder';
  workOrderId?: string;
  workOrderNumber?: string;
  customerName?: string;
  branchName?: string;
  serviceType?: string;
  canEdit: boolean;
};

export type SaveCalendarEntryInput = {
  kind: Exclude<CalendarEntryKind, 'WorkOrder'>;
  title: string;
  description?: string;
  date: string;
  time?: string;
  isAllDay: boolean;
  assignedEmployeeAccountId?: string;
  priority: CalendarEntryPriority;
  status: CalendarEntryStatus;
};

export class CalendarSessionExpiredError extends Error {
  constructor(message = 'Oturumunuz güncel değil. Lütfen yeniden giriş yapın.') {
    super(message);
    this.name = 'CalendarSessionExpiredError';
  }
}

export function getCalendarEntries(accessToken: string, from: string, to: string) {
  return request<CalendarEntryRecord[]>(`/api/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, accessToken);
}

export function createCalendarEntry(accessToken: string, input: SaveCalendarEntryInput) {
  return request<CalendarEntryRecord>('/api/calendar', accessToken, { method: 'POST', body: JSON.stringify(input) });
}

export function updateCalendarEntry(accessToken: string, entryId: string, input: SaveCalendarEntryInput) {
  return request<CalendarEntryRecord>(`/api/calendar/${entryId}`, accessToken, { method: 'PUT', body: JSON.stringify(input) });
}

export async function deleteCalendarEntry(accessToken: string, entryId: string) {
  await request<void>(`/api/calendar/${entryId}`, accessToken, { method: 'DELETE' });
}

async function request<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, ...init?.headers },
    });
  } catch {
    throw new Error('Takvim servisine ulaşılamıyor. Lütfen tekrar deneyin.');
  }

  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { message?: string; errors?: Record<string, string[]> } | null;
    const validationMessage = problem?.errors ? Object.values(problem.errors).flat()[0] : undefined;
    if (response.status === 401 || response.status === 403) throw new CalendarSessionExpiredError(problem?.message);
    throw new Error(problem?.message ?? validationMessage ?? 'Takvim işlemi tamamlanamadı.');
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
