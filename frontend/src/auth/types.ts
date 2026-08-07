export type PortalType = 'owner' | 'employee' | 'customer';

export type LoginCredentials = {
  companyCode: string;
  email: string;
  password: string;
};

export type AuthenticatedSession = {
  accessToken: string;
  expiresAt: string;
  portal: PortalType;
  company: {
    id: string;
    name: string;
    code: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
  customerId?: string;
  customerBranchId?: string;
};
