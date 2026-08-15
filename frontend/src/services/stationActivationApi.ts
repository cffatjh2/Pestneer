import type { ReportStationInput } from './serviceReportApi';
import { apiFetch } from './apiBase';

export type StationActivationRecord = {
  id: string; workOrderId: string; workOrderNumber: string; number: string; status: 'Draft' | 'Finalized';
  customerId: string; customerName: string; branchId?: string; branchName: string; scheduledAt: string; operatorName: string;
  notes?: string; totalStations: number; activeStations: number; damagedStations: number; inaccessibleStations: number;
  totalCaught: number; updatedAt: string; finalizedAt?: string; stations: ReportStationInput[];
};

export type SaveStationActivationInput = { notes?: string; finalize: boolean; stations: ReportStationInput[] };

export const getStationActivations = (token: string) => request<StationActivationRecord[]>('/api/station-activations/', token);
export const getCustomerStationActivations = (token: string) => request<StationActivationRecord[]>('/api/customer/station-activations', token);
export const getStationActivationByWorkOrder = (token: string, workOrderId: string) => request<StationActivationRecord | null>(`/api/station-activations/work-orders/${workOrderId}`, token);
export const saveStationActivation = (token: string, workOrderId: string, input: SaveStationActivationInput) => request<StationActivationRecord>(`/api/station-activations/work-orders/${workOrderId}`, token, { method: 'PUT', body: JSON.stringify(input) });

export async function downloadStationActivationPdf(token: string, record: StationActivationRecord) {
  const response = await apiFetch(`/api/station-activations/${record.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('Aktivasyon PDF belgesi indirilemedi.');
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `${record.number}.pdf`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers } });
  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { message?: string; detail?: string; errors?: Record<string, string[]> } | null;
    throw new Error(problem?.message ?? problem?.detail ?? (problem?.errors ? Object.values(problem.errors).flat()[0] : undefined) ?? 'Aktivasyon listesi kaydedilemedi.');
  }
  return response.json() as Promise<T>;
}
