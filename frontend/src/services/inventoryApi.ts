import { FieldSessionExpiredError } from './fieldOperationsApi';

export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  minimumQuantity: number;
  unitCost: number;
  lotNumber?: string;
  lastMovementAt: string;
  vehicleQuantity: number;
  totalQuantity: number;
  status: 'Yeterli' | 'Düşük' | 'Kritik';
};

export type CreateInventoryEntry = {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  minimumQuantity: number;
  unitCost: number;
  lotNumber?: string;
};

export type CreateInventoryExit = {
  inventoryItemId: string;
  quantity: number;
  note?: string;
};

export type InventorySummary = {
  thisMonthExitCount: number;
  vehicleCount: number;
  vehicleStockItemCount: number;
};

export type InventoryAlert = {
  inventoryItemId: string;
  title: string;
  message: string;
  severity: 'Critical' | 'Warning';
  currentQuantity: number;
  minimumQuantity: number;
  unit: string;
  occurredAt: string;
};

export type VehicleStockItem = {
  id: string;
  inventoryItemId?: string;
  productName: string;
  quantity: number;
  unit: string;
  lastMovementAt: string;
  isManual: boolean;
};

export type VehicleRecord = {
  id: string;
  plate: string;
  brand: string;
  model: string;
  modelYear?: number;
  assignedEmployeeAccountId?: string;
  assignedEmployeeName: string;
  isActive: boolean;
  stockItems: VehicleStockItem[];
};

export type CreateVehicleInput = {
  plate: string;
  brand: string;
  model: string;
  modelYear?: number;
  assignedEmployeeAccountId?: string;
};

export type TransferInventoryInput = {
  inventoryItemId: string;
  vehicleId: string;
  quantity: number;
  note?: string;
};

export type TransferInventoryResult = { inventory: InventoryItem; vehicle: VehicleRecord };

export const getInventory = (token: string) => request<InventoryItem[]>('/api/company/inventory', token);

export const createInventoryEntry = (token: string, input: CreateInventoryEntry) =>
  request<InventoryItem>('/api/company/inventory/entries', token, { method: 'POST', body: JSON.stringify(input) });

export const createInventoryExit = (token: string, input: CreateInventoryExit) =>
  request<InventoryItem>('/api/company/inventory/exits', token, { method: 'POST', body: JSON.stringify(input) });

export const getInventorySummary = (token: string) =>
  request<InventorySummary>('/api/company/inventory/summary', token);

export const getInventoryAlerts = (token: string) =>
  request<InventoryAlert[]>('/api/company/inventory/alerts', token);

export const getVehicles = (token: string) =>
  request<VehicleRecord[]>('/api/company/inventory/vehicles', token);

export const createVehicle = (token: string, input: CreateVehicleInput) =>
  request<VehicleRecord>('/api/company/inventory/vehicles', token, { method: 'POST', body: JSON.stringify(input) });

export const updateVehicle = (token: string, vehicleId: string, input: CreateVehicleInput) =>
  request<VehicleRecord>(`/api/company/inventory/vehicles/${vehicleId}`, token, { method: 'PUT', body: JSON.stringify(input) });

export const transferInventoryToVehicle = (token: string, input: TransferInventoryInput) =>
  request<TransferInventoryResult>('/api/company/inventory/transfers', token, { method: 'POST', body: JSON.stringify(input) });

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
