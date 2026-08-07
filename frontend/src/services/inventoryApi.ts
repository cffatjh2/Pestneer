import { FieldSessionExpiredError } from './fieldOperationsApi';

export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  minimumQuantity: number;
  lotNumber?: string;
  lastMovementAt: string;
  status: 'Yeterli' | 'Düşük' | 'Kritik';
};

export type CreateInventoryEntry = {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  minimumQuantity: number;
  lotNumber?: string;
};

export type CreateInventoryExit = {
  inventoryItemId: string;
  quantity: number;
  note?: string;
};

export type InventorySummary = {
  thisMonthExitCount: number;
};

export const getInventory = (token: string) => request<InventoryItem[]>('/api/company/inventory', token);

export const createInventoryEntry = (token: string, input: CreateInventoryEntry) =>
  request<InventoryItem>('/api/company/inventory/entries', token, { method: 'POST', body: JSON.stringify(input) });

export const createInventoryExit = (token: string, input: CreateInventoryExit) =>
  request<InventoryItem>('/api/company/inventory/exits', token, { method: 'POST', body: JSON.stringify(input) });

export const getInventorySummary = (token: string) =>
  request<InventorySummary>('/api/company/inventory/summary', token);

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers },
    });
  } catch {
    throw new Error('Stok servisine ulaşılamıyor. Lütfen tekrar deneyin.');
  }

  if (!response.ok) {
    const problem = await response.json().catch(() => null) as { message?: string; errors?: Record<string, string[]> } | null;
    if (response.status === 401 || response.status === 403) throw new FieldSessionExpiredError(problem?.message);
    const validation = problem?.errors ? Object.values(problem.errors).flat()[0] : undefined;
    throw new Error(problem?.message ?? validation ?? 'Stok işlemi tamamlanamadı.');
  }
  return response.json() as Promise<T>;
}
