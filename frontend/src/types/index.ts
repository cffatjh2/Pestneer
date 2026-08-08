/* ------------------------------------------------------------------ */
/*  Pesneer — Tip Tanımları                                           */
/*  İleride backend API'den gelen tipler buradan dışa aktarılacak.    */
/* ------------------------------------------------------------------ */

/* ---- Navigasyon -------------------------------------------------- */
export type ViewId =
  | 'dashboard'
  | 'work-orders'
  | 'calendar'
  | 'stock'
  | 'reports'
  | 'documents'
  | 'team';

/* ---- İş Emri ----------------------------------------------------- */
export type WorkStatus = 'Planlandı' | 'Sahada' | 'Tamamlandı' | 'İptal';

export type WorkOrderHistory = {
  id: string;
  fromStatus?: string;
  toStatus: string;
  note?: string;
  occurredAt: string;
  changedBy: string;
};

export type WorkOrderPhoto = {
  id: string;
  fileName: string;
  contentType: string;
  uploadedAt: string;
  url: string;
};

export interface WorkOrder {
  recordId: string;
  id: string;
  customerId: string;
  branchId?: string;
  client: string;
  branch: string;
  branchAddress: string;
  branchMapUrl?: string;
  employeeAccountId?: string;
  scheduledAt: string;
  durationMinutes: number;
  date: string;
  time: string;
  service: string;
  visitType: string;
  recurrenceType: string;
  recurrenceGroupId?: string;
  technician: string;
  technicalStatus: string;
  status: WorkStatus;
  area: string;
  notes?: string;
  startedAt?: string;
  completedAt?: string;
  completionNote?: string;
  recommendation?: string;
  history: WorkOrderHistory[];
  photos: WorkOrderPhoto[];
}

/* ---- Stok -------------------------------------------------------- */
export type StockLevel = 'Yeterli' | 'Kritik' | 'Düşük';

export interface StockItem {
  id: string;
  name: string;
  category: string;
  amount: string;
  minimum: string;
  status: StockLevel;
  lot?: string;
  lastMovement?: string;
}

/* ---- Ekip -------------------------------------------------------- */
export type EmployeeState = 'Sahada' | 'Müsait' | 'Toplantıda' | 'İzinli';

export interface Employee {
  id: string;
  name: string;
  role: string;
  initials: string;
  jobs: number;
  state: EmployeeState;
  color: 'blue' | 'purple' | 'green' | 'orange';
  phone?: string;
  email?: string;
  canSelfSchedule?: boolean;
}

/* ---- EK-1 Biyosidal Ürün Uygulama İşlem Formu ------------------- */
export interface BiocidalProduct {
  tradeName: string;
  licenseInfo: string;
  applicationMethod: string;
  dilutionRate: string;
  activeIngredient: string;
  antidote: string;
  packingQuantity: string;
  amountUsed: string;
}

export interface ServiceReport {
  /* Üst bilgi */
  reportId: string;
  date: string;
  contactPhone: string;

  /* Uygulama yapan firma */
  firmName: string;
  firmAddress: string;
  firmPhone: string;
  firmWeb: string;
  responsibleManager: string;
  operator: string;
  permissionNumber: string;
  teamManager: string;

  /* Uygulama yapılan yer */
  applicationAddress: string;
  targetPest: string;
  applicationDate: string;
  applicationStartTime: string;
  applicationEndTime: string;
  residenceType: string;
  area: string;
  workType: string;
  consumables: string;
  safetyMeasures: string;

  /* Kullanılan ürünler */
  products: BiocidalProduct[];

  /* İmzalar */
  managerSignature?: string | null;
  operatorSignature?: string | null;

  /* Doğrulama */
  verificationCode: string;
  verificationUrl: string;
}

/* ---- Navigasyon Öğesi -------------------------------------------- */
export interface NavItem {
  id: ViewId;
  label: string;
  iconName: string;
  badge?: number;
}
