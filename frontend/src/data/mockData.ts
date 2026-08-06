import type {
  WorkOrder,
  StockItem,
  Employee,
  ServiceReport,
  NavItem,
} from '../types';

/* ---- Navigasyon (Arayüz Menü Yapısı) ----------------------------- */
export const navigation: NavItem[] = [
  { id: 'dashboard',   label: 'Operasyon Merkezi', iconName: 'LayoutDashboard' },
  { id: 'work-orders', label: 'İş Emirleri',       iconName: 'ClipboardList' },
  { id: 'calendar',    label: 'Takvim',             iconName: 'CalendarDays' },
  { id: 'stock',       label: 'Stok Yönetimi',      iconName: 'Package' },
  { id: 'reports',     label: 'Rapor & Analizler',  iconName: 'FileText' },
  { id: 'team',        label: 'Ekip',               iconName: 'Users' },
];

/* ---- Veri Dizileri (Boş Başlangıç Durumu) ----------------------- */
export const starterWorkOrders: WorkOrder[] = [];

export const stockItems: StockItem[] = [];

export const employees: Employee[] = [];

export interface CalendarEventData {
  day: number;
  time: string;
  title: string;
  tone: 'blue' | 'green' | 'purple' | 'orange';
}

export const calendarEvents: CalendarEventData[] = [];

/* ---- Şablon EK-1 Rapor Yapısı ----------------------------------- */
export const emptyReport: ServiceReport = {
  reportId: 'IE-000000-000',
  date: new Date().toLocaleDateString('tr-TR'),
  contactPhone: '-',

  firmName: '',
  firmAddress: '',
  firmPhone: '',
  firmWeb: '',
  responsibleManager: '',
  operator: '',
  permissionNumber: '',
  teamManager: '',

  applicationAddress: '-',
  targetPest: '-',
  applicationDate: new Date().toLocaleDateString('tr-TR'),
  applicationStartTime: '-',
  applicationEndTime: '-',
  residenceType: 'İşyeri',
  area: '-',
  workType: 'İlaçlama',
  consumables: '-',
  safetyMeasures: 'RG-4/7/2019-30821 yönetmeliğine uygun olarak hizmet verilmiş olup, alınması gereken önlemler sözlü olarak bildirilmiştir.',

  products: [],

  managerSignature: null,
  operatorSignature: null,

  verificationCode: '-',
  verificationUrl: 'https://pesneer.com/belge',
};

export const demoReport = emptyReport;
