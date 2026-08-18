import { lazy, Suspense, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { ViewId, WorkOrder, ServiceReport } from './types';
import { demoReport } from './data/mockData';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import LoginPage from './auth/LoginPage';
import type { AuthenticatedSession } from './auth/types';
import LandingPage from './marketing/LandingPage';
import KvkkConsentModal from './components/modals/KvkkConsentModal';
import { getEmployees, SessionExpiredError, type EmployeeRecord } from './services/employeeApi';
import {
  addCustomerBranches,
  createCustomer,
  createWorkOrders,
  getCustomers,
  getWorkOrders,
  updateWorkOrder,
  WorkOrderSessionExpiredError,
  type CreateBranchInput,
  type CreateCustomerInput,
  type CreateWorkOrdersInput,
  type UpdateWorkOrderInput,
  type CustomerRecord,
} from './services/workOrderApi';

import PortalFooter from './components/layout/PortalFooter';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const WorkOrders = lazy(() => import('./pages/WorkOrders'));
const Calendar = lazy(() => import('./pages/Calendar'));
const Stock = lazy(() => import('./pages/Stock'));
const Team = lazy(() => import('./pages/Team'));
const ReportView = lazy(() => import('./pages/ReportView'));
const ReportsAnalytics = lazy(() => import('./pages/ReportsAnalytics'));
const QualityCenter = lazy(() => import('./components/quality/QualityCenter'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const RequestCenter = lazy(() => import('./pages/RequestCenter'));
const CommercialManagement = lazy(() => import('./pages/CommercialManagement'));
const WorkOrderModal = lazy(() => import('./components/modals/WorkOrderModal'));
const WorkOrderDetailModal = lazy(() => import('./components/modals/WorkOrderDetailModal'));
const StationActivationModal = lazy(() => import('./components/modals/StationActivationModal'));
const CustomerBranchModal = lazy(() => import('./components/modals/CustomerBranchModal'));
const CustomerPortal = lazy(() => import('./portals/CustomerPortal'));
const QualityComplianceHub = lazy(() => import('./components/compliance/QualityComplianceHub'));
const EmployeePortal = lazy(() => import('./portals/EmployeePortal'));
const SystemAdminPage = lazy(() => import('./pages/SystemAdminPage'));

function LoadingScreen() {
  return <div className="app-loading-screen"><span className="spinner" /><strong>Pestneer hazırlanıyor…</strong></div>;
}

function OwnerPortal({ session, onLogout }: { session: AuthenticatedSession; onLogout: () => void }) {
  const [activeView, setActiveView] = useState<ViewId>('dashboard');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [isPlanningLoading, setIsPlanningLoading] = useState(true);
  const [planningError, setPlanningError] = useState<string | null>(null);
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<WorkOrder | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [stationModalOrder, setStationModalOrder] = useState<WorkOrder | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [reopenOrderAfterCustomer, setReopenOrderAfterCustomer] = useState(false);
  const [activeReport, setActiveReport] = useState<ServiceReport | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadPlanningData = async () => {
    setIsPlanningLoading(true);
    setPlanningError(null);
    try {
      const [orderItems, customerItems, employeeItems] = await Promise.all([
        getWorkOrders(session.accessToken),
        getCustomers(session.accessToken),
        getEmployees(session.accessToken),
      ]);
      setWorkOrders(orderItems);
      setCustomers(customerItems);
      setEmployees(employeeItems);
    } catch (error) {
      if (error instanceof WorkOrderSessionExpiredError || error instanceof SessionExpiredError) {
        onLogout();
        return;
      }
      setPlanningError(error instanceof Error ? error.message : 'Planlama verileri yüklenemedi.');
    } finally {
      setIsPlanningLoading(false);
    }
  };

  useEffect(() => { void loadPlanningData(); }, [session.accessToken]);

  const handleCreateOrder = async (input: CreateWorkOrdersInput) => {
    try {
      const created = await createWorkOrders(session.accessToken, input);
      setWorkOrders((current) => [...created, ...current]);
      setIsNewOrderModalOpen(false);
      showToast(`${created.length} şube için ${created.length} iş emri oluşturuldu.`);
    } catch (error) {
      if (error instanceof WorkOrderSessionExpiredError) {
        onLogout();
        return;
      }
      throw error;
    }
  };

  const handleUpdateOrder = async (input: UpdateWorkOrderInput) => {
    if (!editingOrder) return;
    try {
      const updated = await updateWorkOrder(session.accessToken, editingOrder.recordId, input);
      setWorkOrders((current) => current.map((item) => item.recordId === updated.recordId ? updated : item));
      setEditingOrder(null);
      setSelectedOrder((current) => current?.recordId === updated.recordId ? updated : current);
      showToast(`${updated.id} iş emri güncellendi.`);
    } catch (error) {
      if (error instanceof WorkOrderSessionExpiredError) { onLogout(); return; }
      throw error;
    }
  };

  const openCustomerManagement = (fromWorkOrder = false) => {
    setReopenOrderAfterCustomer(fromWorkOrder);
    if (fromWorkOrder) setIsNewOrderModalOpen(false);
    setIsCustomerModalOpen(true);
  };

  const handleCustomerBranches = async (
    customerId: string | null,
    customerInput: CreateCustomerInput | null,
    branches: CreateBranchInput[],
  ) => {
    try {
      let targetCustomerId = customerId;
      let createdCustomerName: string | null = null;
      if (customerInput) {
        const customer = await createCustomer(session.accessToken, customerInput);
        targetCustomerId = customer.id;
        createdCustomerName = customer.legalName;
      }
      if (!targetCustomerId) throw new Error('Müşteri seçimi tamamlanamadı.');
      if (branches.length > 0) {
        await addCustomerBranches(session.accessToken, targetCustomerId, branches);
      }
      setCustomers(await getCustomers(session.accessToken));
      setIsCustomerModalOpen(false);
      showToast(branches.length > 0
        ? `${branches.length} şube müşteri portföyüne eklendi.`
        : `${createdCustomerName ?? 'Çatı müşteri'} müşteri portföyüne eklendi.`);
      if (reopenOrderAfterCustomer) setIsNewOrderModalOpen(true);
      setReopenOrderAfterCustomer(false);
    } catch (error) {
      if (error instanceof WorkOrderSessionExpiredError) {
        onLogout();
        return;
      }
      throw error;
    }
  };

  const renderContent = () => {
    if (activeReport) return <ReportView report={activeReport} onBack={() => setActiveReport(null)} />;
    switch (activeView) {
      case 'dashboard':
        return <Dashboard accessToken={session.accessToken} onSessionExpired={onLogout} workOrders={workOrders} onCreate={() => setIsNewOrderModalOpen(true)} onReport={() => setActiveReport(demoReport)} />;
      case 'work-orders':
        return <WorkOrders accessToken={session.accessToken} employees={employees} onSessionExpired={onLogout} workOrders={workOrders} customers={customers} isLoading={isPlanningLoading} loadError={planningError} onReload={() => void loadPlanningData()} onCreate={() => setIsNewOrderModalOpen(true)} onManageCustomers={() => openCustomerManagement(false)} onEdit={setEditingOrder} onView={setSelectedOrder} />;
      case 'calendar': return <Calendar accessToken={session.accessToken} employees={employees} onSessionExpired={onLogout} onNotify={showToast} />;
      case 'stock': return <Stock accessToken={session.accessToken} employees={employees} onSessionExpired={onLogout} />;
      case 'team': return <Team accessToken={session.accessToken} companyCode={session.company.code} onNotify={showToast} onSessionExpired={onLogout} />;
      case 'reports': return <ReportsAnalytics accessToken={session.accessToken} companyName={session.company.name} userName={session.user.name} workOrders={workOrders} onSessionExpired={onLogout} />;
      case 'documents': return <QualityCenter accessToken={session.accessToken} mode="staff" onSessionExpired={onLogout} standalone canManageLicenses />;
      case 'requests': return <RequestCenter accessToken={session.accessToken} employees={employees} onSessionExpired={onLogout} />;
      case 'commercial': return <CommercialManagement accessToken={session.accessToken} customers={customers} employees={employees} workOrders={workOrders} onSessionExpired={onLogout} />;
      case 'compliance': return <QualityComplianceHub accessToken={session.accessToken} employees={employees} onSessionExpired={onLogout} />;
      case 'settings': return <SettingsPage accessToken={session.accessToken} companyName={session.company.name} onSessionExpired={onLogout} onNotify={showToast} />;
      default: return <section className="page"><h1>Yapım aşamasında</h1></section>;
    }
  };

  return (
    <div className="app-shell">
      <Sidebar activeView={activeView} setActiveView={(view) => { setActiveView(view); setActiveReport(null); }} isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} onNotify={showToast} companyName={session.company.name} userName={session.user.name} userRole={session.user.role} onLogout={onLogout} />
      <div className="sidebar-scrim" style={{ display: isMenuOpen ? 'block' : 'none' }} onClick={() => setIsMenuOpen(false)} />
      <main className="main-content">
        <Topbar activeView={activeView} onMenuOpen={() => setIsMenuOpen(true)} accessToken={session.accessToken} onStockOpen={() => setActiveView('stock')} />
        {renderContent()}
        <PortalFooter />
      </main>

      {isNewOrderModalOpen && <WorkOrderModal customers={customers} employees={employees} onClose={() => setIsNewOrderModalOpen(false)} onManageCustomers={() => openCustomerManagement(true)} onCreate={handleCreateOrder} />}
      {editingOrder && <WorkOrderModal customers={customers} employees={employees} editingOrder={editingOrder} onClose={() => setEditingOrder(null)} onUpdate={handleUpdateOrder} />}
      {selectedOrder && <WorkOrderDetailModal order={selectedOrder} accessToken={session.accessToken} onClose={() => setSelectedOrder(null)} onEdit={() => { setEditingOrder(selectedOrder); setSelectedOrder(null); }} onOpenStations={() => { setStationModalOrder(selectedOrder); setSelectedOrder(null); }} />}
      {stationModalOrder && <StationActivationModal accessToken={session.accessToken} order={stationModalOrder} onClose={() => setStationModalOrder(null)} />}
      {isCustomerModalOpen && <CustomerBranchModal customers={customers} onClose={() => { setIsCustomerModalOpen(false); setReopenOrderAfterCustomer(false); }} onSubmit={handleCustomerBranches} />}
      {toastMessage && <div className="toast"><AlertCircle size={20} />{toastMessage}</div>}
    </div>
  );
}

function isSystemControlPath(pathname: string) {
  return pathname.replace(/\/+$/, '') === '/pestneer-system-control-9f4c2';
}

function hasUserAcceptedTerms(user?: { id: string; hasAcceptedTerms?: boolean }): boolean {
  if (!user) return false;
  if (user.hasAcceptedTerms) return true;
  if (typeof window !== 'undefined') {
    const localAccepted = window.localStorage.getItem(`pestneer_terms_accepted_${user.id}`);
    if (localAccepted) return true;
  }
  return false;
}

export default function App() {
  if (isSystemControlPath(window.location.pathname)) return <Suspense fallback={<LoadingScreen />}><SystemAdminPage /></Suspense>;
  const [session, setSession] = useState<AuthenticatedSession | null>(loadStoredSession);
  const [isLoginVisible, setIsLoginVisible] = useState(false);
  const [initialAuthMode, setInitialAuthMode] = useState<'login' | 'demo'>('login');

  const handleAuthenticated = (authenticatedSession: AuthenticatedSession, rememberMe = true) => {
    window.sessionStorage.setItem('pesneer.session', JSON.stringify(authenticatedSession));
    if (rememberMe) {
      window.localStorage.setItem('pesneer.session', JSON.stringify(authenticatedSession));
    } else {
      window.localStorage.removeItem('pesneer.session');
    }
    setSession(authenticatedSession);
  };

  const handleLogout = () => {
    window.sessionStorage.removeItem('pesneer.session');
    window.localStorage.removeItem('pesneer.session');
    setSession(null);
  };

  if (!session && !isLoginVisible) {
    return (
      <LandingPage
        onLogin={() => {
          setInitialAuthMode('login');
          setIsLoginVisible(true);
        }}
        onOpenDemo={() => {
          setInitialAuthMode('demo');
          setIsLoginVisible(true);
        }}
      />
    );
  }
  if (!session) {
    return (
      <LoginPage
        initialMode={initialAuthMode}
        onAuthenticated={handleAuthenticated}
        onBack={() => setIsLoginVisible(false)}
      />
    );
  }

  // Zorunlu KVKK ve Kullanıcı Sözleşmesi Onay Kapısı
  if (!hasUserAcceptedTerms(session.user)) {
    return (
      <KvkkConsentModal
        session={session}
        onAccepted={(updatedSession) => {
          setSession(updatedSession);
        }}
        onLogout={handleLogout}
      />
    );
  }

  if (session.portal === 'employee') return <Suspense fallback={<LoadingScreen />}><EmployeePortal session={session} onLogout={handleLogout} /></Suspense>;
  if (session.portal === 'customer') return <Suspense fallback={<LoadingScreen />}><CustomerPortal session={session} onLogout={handleLogout} /></Suspense>;
  return <Suspense fallback={<LoadingScreen />}><OwnerPortal session={session} onLogout={handleLogout} /></Suspense>;
}

function loadStoredSession(): AuthenticatedSession | null {
  try {
    const stored = window.sessionStorage.getItem('pesneer.session') || window.localStorage.getItem('pesneer.session');
    if (!stored) return null;
    const session = JSON.parse(stored) as AuthenticatedSession;
    if (!session.accessToken || new Date(session.expiresAt).getTime() <= Date.now()) {
      window.sessionStorage.removeItem('pesneer.session');
      window.localStorage.removeItem('pesneer.session');
      return null;
    }
    return session;
  } catch {
    window.sessionStorage.removeItem('pesneer.session');
    window.localStorage.removeItem('pesneer.session');
    return null;
  }
}
