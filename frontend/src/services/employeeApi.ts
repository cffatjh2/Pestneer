export type EmployeeRole = 'Administrator' | 'OperationsManager' | 'Technician';

export type EmployeeRecord = {
  id: string;
  name: string;
  email: string;
  phoneNumber: string;
  role: EmployeeRole;
  isActive: boolean;
  canSelfSchedule: boolean;
};

export type CreateEmployeeInput = {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  role: EmployeeRole;
  password: string;
  canSelfSchedule: boolean;
};

export type UpdateEmployeeInput = Omit<CreateEmployeeInput, 'password'> & {
  isActive: boolean;
  newPassword?: string;
};

export class SessionExpiredError extends Error {
  constructor(message = 'Oturumunuz güncel değil. Lütfen yeniden giriş yapın.') {
    super(message);
    this.name = 'SessionExpiredError';
  }
}

export async function getEmployees(accessToken: string): Promise<EmployeeRecord[]> {
  return request<EmployeeRecord[]>('/api/company/employees', accessToken);
}

export async function createEmployee(
  accessToken: string,
  input: CreateEmployeeInput,
): Promise<EmployeeRecord> {
  return request<EmployeeRecord>('/api/company/employees', accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateEmployee(
  accessToken: string,
  employeeId: string,
  input: UpdateEmployeeInput,
): Promise<EmployeeRecord> {
  return request<EmployeeRecord>(`/api/company/employees/${employeeId}`, accessToken, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
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
    throw new Error('Personel servisine ulaşılamıyor. Lütfen tekrar deneyin.');
  }

  if (!response.ok) {
    const problem = await response.json().catch(() => null) as {
      message?: string;
      errors?: Record<string, string[]>;
    } | null;
    const validationMessage = problem?.errors
      ? Object.values(problem.errors).flat()[0]
      : undefined;
    if (response.status === 401 || response.status === 403) {
      throw new SessionExpiredError(problem?.message);
    }
    throw new Error(problem?.message ?? validationMessage ?? 'Personel işlemi tamamlanamadı.');
  }

  return response.json() as Promise<T>;
}
