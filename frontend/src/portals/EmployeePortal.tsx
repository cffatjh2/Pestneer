import { useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  FolderArchive,
  KeyRound,
  LogOut,
  PackageCheck,
  PackagePlus,
  Play,
  RefreshCw,
  TimerReset,
} from 'lucide-react';
import type { AuthenticatedSession } from '../auth/types';
import type { WorkOrder } from '../types';
import VehicleStockModal from '../components/modals/VehicleStockModal';
import TaskDetailModal from '../components/modals/TaskDetailModal';
import StationActivationModal from '../components/modals/StationActivationModal';
import ServiceReportModal from '../components/modals/ServiceReportModal';
import PortalHeader from './PortalHeader';
import PortalFooter from '../components/layout/PortalFooter';
import EmployeeWorkOrdersPanel from './EmployeeWorkOrdersPanel';
import {
  createVehicleStockCheck,
  endBreak,
  FieldSessionExpiredError,
  finishShift,
  getLatestVehicleStock,
  getTodayAttendance,
  getVehicleStockCatalog,
  startBreak,
  startShift,
  type AttendanceRecord,
  type VehicleStockCheck,
  type VehicleStockItemInput,
} from '../services/fieldOperationsApi';
import { CalendarSessionExpiredError, getCalendarEntries, type CalendarEntryRecord } from '../services/calendarApi';
import { getEmployeeWorkOrders, WorkOrderSessionExpiredError } from '../services/workOrderApi';
import {
  getEmployeeServiceReports,
  ReportConflictError,
  ReportNetworkError,
  ReportSessionExpiredError,
  saveServiceReport,
  uploadServiceReportPhotos,
  type ReportPhotoUpload,
  type ServiceReportRecord,
  type UpsertServiceReportInput,
} from '../services/serviceReportApi';
import QualityCenter from '../components/quality/QualityCenter';
import { PasswordChangeCard } from '../components/security/PasswordSecurityCards';

export default function EmployeePortal({ session, onLogout }: { session: AuthenticatedSession; onLogout: () => void }) {
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [latestStock, setLatestStock] = useState<VehicleStockCheck | null>(null);
  const [catalog, setCatalog] = useState<string[]>([]);
  const [assignedTasks, setAssignedTasks] = useState<CalendarEntryRecord[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [reports, setReports] = useState<ServiceReportRecord[]>([]);
  const [activeTab, setActiveTab] = useState<'operations' | 'workOrders' | 'tasks' | 'quality' | 'account'>('operations');
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now());

  // Quick modals accessible from task details
  const [taskActivationOrder, setTaskActivationOrder] = useState<WorkOrder | null>(null);
  const [taskReportingOrder, setTaskReportingOrder] = useState<WorkOrder | null>(null);

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const today = new Date();
      const from = addDays(today, -180);
      const to = addDays(today, 180);
      const [attendanceResult, stockResult, catalogResult, taskResult, ordersResult, reportsResult] = await Promise.all([
        getTodayAttendance(session.accessToken),
        getLatestVehicleStock(session.accessToken),
        getVehicleStockCatalog(session.accessToken),
        getCalendarEntries(session.accessToken, toDateKey(from), toDateKey(to)),
        getEmployeeWorkOrders(session.accessToken).catch(() => []),
        getEmployeeServiceReports(session.accessToken).catch(() => []),
      ]);
      setAttendance(attendanceResult);
      setLatestStock(stockResult);
      setCatalog(catalogResult);
      setAssignedTasks(taskResult);
      setOrders(ordersResult);
      setReports(reportsResult);
    } catch (loadError) {
      if (
        loadError instanceof FieldSessionExpiredError ||
        loadError instanceof CalendarSessionExpiredError ||
        loadError instanceof WorkOrderSessionExpiredError ||
        loadError instanceof ReportSessionExpiredError
      ) {
        return onLogout();
      }
      setError(loadError instanceof Error ? loadError.message : 'Saha operasyon bilgileri yüklenemedi.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [session.accessToken]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const workedMinutes = useMemo(() => {
    if (!attendance) return 0;
    const live =
      attendance.status === 'working'
        ? Math.max(0, Math.floor((clock - new Date(attendance.calculatedAt).getTime()) / 60_000))
        : 0;
    return attendance.workedMinutes + live;
  }, [attendance, clock]);

  const runAttendanceAction = async (action: () => Promise<AttendanceRecord>) => {
    setIsActionLoading(true);
    setError(null);
    try {
      setAttendance(await action());
      setClock(Date.now());
    } catch (actionError) {
      if (actionError instanceof FieldSessionExpiredError) return onLogout();
      setError(actionError instanceof Error ? actionError.message : 'Mesai işlemi tamamlanamadı.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const saveStock = async (items: VehicleStockItemInput[]) => {
    const check = await createVehicleStockCheck(session.accessToken, items);
    setLatestStock(check);
    setCatalog((current) =>
      Array.from(new Set([...current, ...items.map((item) => item.productName)])).sort((a, b) => a.localeCompare(b, 'tr'))
    );
    setIsStockModalOpen(false);
  };

  const handleSaveTaskReport = async (input: UpsertServiceReportInput, photos: ReportPhotoUpload[]) => {
    if (!taskReportingOrder) return;
    try {
      const saved = await saveServiceReport(session.accessToken, taskReportingOrder.recordId, input);
      if (photos.length > 0) {
        await uploadServiceReportPhotos(session.accessToken, taskReportingOrder.recordId, photos);
      }
      setReports((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setTaskReportingOrder(null);
      await load();
    } catch (saveError) {
      if (saveError instanceof ReportSessionExpiredError) return onLogout();
      throw saveError;
    }
  };

  const reportByOrder = useMemo(() => new Map(reports.map((item) => [item.workOrderId, item])), [reports]);

  const status = attendance?.status ?? 'notStarted';
  const firstName = session.user.name.split(' ')[0];

  return (
    <div className="role-portal employee-operations-portal">
      <PortalHeader session={session} onLogout={onLogout} context="SAHA OPERASYONLARI" />
      <main className="role-portal-main">
        <div className="role-welcome">
          <div>
            <p>{formatLongDate(new Date())}</p>
            <h1>Merhaba, {firstName}</h1>
            <span>Mesaini, iş programını ve araç hazırlığını gerçek zamanlı yönet.</span>
          </div>
          <button disabled={!latestStock} onClick={() => setIsStockModalOpen(true)}>
            <PackagePlus size={18} />
            {latestStock ? 'Araç stok kontrolü' : 'Araç ataması bekleniyor'}
          </button>
        </div>

        <nav className="employee-portal-tabs">
          <button className={activeTab === 'operations' ? 'active' : ''} onClick={() => setActiveTab('operations')}>
            <BriefcaseBusiness size={17} /> Günlük Operasyon
          </button>
          <button className={activeTab === 'workOrders' ? 'active' : ''} onClick={() => setActiveTab('workOrders')}>
            <CheckCircle2 size={17} /> İş Emirlerim
          </button>
          <button className={activeTab === 'tasks' ? 'active' : ''} onClick={() => setActiveTab('tasks')}>
            <CalendarClock size={17} /> Görevlerim <span>{assignedTasks.length}</span>
          </button>
          <button className={activeTab === 'quality' ? 'active' : ''} onClick={() => setActiveTab('quality')}>
            <FolderArchive size={17} /> Analiz & Belgeler
          </button>
          <button className={activeTab === 'account' ? 'active' : ''} onClick={() => setActiveTab('account')}>
            <KeyRound size={17} /> Hesabım
          </button>
        </nav>

        {error && (
          <div className="field-operation-error">
            <span>{error}</span>
            <button onClick={() => void load()}>
              <RefreshCw size={15} /> Yenile
            </button>
          </div>
        )}

        {activeTab === 'workOrders' ? (
          <EmployeeWorkOrdersPanel
            accessToken={session.accessToken}
            accountId={session.user.id}
            companyName={session.company.name}
            operatorName={session.user.name}
            isShiftActive={status === 'working'}
            onStartShift={() => runAttendanceAction(() => startShift(session.accessToken))}
            onNavigateToOperations={() => setActiveTab('operations')}
            onSessionExpired={onLogout}
          />
        ) : activeTab === 'tasks' ? (
          <Tasks
            tasks={assignedTasks}
            orders={orders}
            reports={reports}
            loading={isLoading}
            accessToken={session.accessToken}
            isShiftActive={status === 'working'}
            onNavigateToWorkOrders={() => setActiveTab('workOrders')}
            onOpenStations={(order) => setTaskActivationOrder(order)}
            onOpenReport={(order) => setTaskReportingOrder(order)}
          />
        ) : activeTab === 'quality' ? (
          <QualityCenter accessToken={session.accessToken} mode="staff" onSessionExpired={onLogout} />
        ) : activeTab === 'account' ? (
          <div className="portal-account-page">
            <PasswordChangeCard accessToken={session.accessToken} onSessionExpired={onLogout} />
          </div>
        ) : isLoading ? (
          <Loading />
        ) : !attendance ? (
          <Loading failed />
        ) : (
          <>
            <div className="employee-kpis field-kpis">
              <article>
                <span>
                  <Clock3 size={20} />
                </span>
                <div>
                  <small>Net çalışma</small>
                  <strong>{formatDuration(workedMinutes)}</strong>
                </div>
              </article>
              <article>
                <span className="orange">
                  <Coffee size={20} />
                </span>
                <div>
                  <small>Toplam mola</small>
                  <strong>{formatDuration(attendance.breakMinutes)}</strong>
                </div>
              </article>
              <article>
                <span className="green">
                  <PackageCheck size={20} />
                </span>
                <div>
                  <small>Araç stok durumu</small>
                  <strong>{latestStock ? `${latestStock.items.length} ürün` : 'Bekliyor'}</strong>
                </div>
              </article>
            </div>

            <div className="field-operations-grid">
              <section className={`role-surface shift-control-card shift-${status}`}>
                <div className="shift-card-heading">
                  <div>
                    <p>MESAİ TAKİBİ</p>
                    <h2>{statusLabels[status].title}</h2>
                    <span>{statusLabels[status].description}</span>
                  </div>
                  <div className="shift-live-time">{formatDuration(workedMinutes)}</div>
                </div>
                <div className="shift-times">
                  <div>
                    <span>Başlangıç</span>
                    <strong>{formatTime(attendance.startedAt)}</strong>
                  </div>
                  <div>
                    <span>Mola</span>
                    <strong>{formatDuration(attendance.breakMinutes)}</strong>
                  </div>
                  <div>
                    <span>Bitiş</span>
                    <strong>{formatTime(attendance.endedAt)}</strong>
                  </div>
                </div>
                <div className="shift-actions">
                  {status === 'notStarted' && (
                    <button
                      className="shift-start"
                      disabled={isActionLoading}
                      onClick={() => void runAttendanceAction(() => startShift(session.accessToken))}
                    >
                      <Play size={17} /> İşe Başladım
                    </button>
                  )}
                  {status === 'working' && (
                    <>
                      <button
                        className="shift-break"
                        disabled={isActionLoading}
                        onClick={() => void runAttendanceAction(() => startBreak(session.accessToken))}
                      >
                        <Coffee size={17} /> Öğle Molası
                      </button>
                      <button
                        className="shift-finish"
                        disabled={isActionLoading}
                        onClick={() => void runAttendanceAction(() => finishShift(session.accessToken))}
                      >
                        <LogOut size={17} /> Mesaiyi Bitir
                      </button>
                    </>
                  )}
                  {status === 'onBreak' && (
                    <>
                      <button
                        className="shift-start"
                        disabled={isActionLoading}
                        onClick={() => void runAttendanceAction(() => endBreak(session.accessToken))}
                      >
                        <TimerReset size={17} /> İşe Devam Et
                      </button>
                      <button
                        className="shift-finish"
                        disabled={isActionLoading}
                        onClick={() => void runAttendanceAction(() => finishShift(session.accessToken))}
                      >
                        <LogOut size={17} /> Mesaiyi Bitir
                      </button>
                    </>
                  )}
                  {status === 'completed' && (
                    <div className="shift-completed">
                      <CheckCircle2 size={18} /> Bugünkü mesai kaydı tamamlandı.
                    </div>
                  )}
                </div>
              </section>

              <section className="role-surface vehicle-stock-card">
                <div className="role-section-title">
                  <div>
                    <p>ARAÇ HAZIRLIĞI</p>
                    <h2>İlaç & Malzeme Kontrolü</h2>
                  </div>
                  {latestStock && <span>{latestStock.items.length} ürün</span>}
                </div>
                {latestStock ? (
                  <>
                    <div className="latest-stock-meta">
                      <PackageCheck size={22} />
                      <div>
                        <strong>
                          {latestStock.plate} · {latestStock.vehicleDescription}
                        </strong>
                        <span>Son kontrol: {formatDateTime(latestStock.checkedAt)}</span>
                      </div>
                    </div>
                    <div className="latest-stock-list">
                      {latestStock.items.slice(0, 5).map((item) => (
                        <div key={item.id}>
                          <span>{item.productName}</span>
                          <strong>
                            {item.quantity} {item.unit}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="stock-first-check">
                    <PackagePlus size={31} />
                    <strong>Aktif araç ataması bulunmuyor</strong>
                    <span>
                      Firma sahibi araç tanımlayıp sizi sorumlu personel olarak atadığında stoklar burada görünür.
                    </span>
                  </div>
                )}
                <button
                  className="role-primary-button"
                  disabled={!latestStock}
                  onClick={() => setIsStockModalOpen(true)}
                >
                  {latestStock ? 'Sayımı Güncelle' : 'Araç Ataması Bekleniyor'} <PackagePlus size={17} />
                </button>
              </section>
            </div>
          </>
        )}
        <PortalFooter />
      </main>

      {isStockModalOpen && (
        <VehicleStockModal
          catalog={catalog}
          initialItems={latestStock?.items}
          onClose={() => setIsStockModalOpen(false)}
          onSubmit={saveStock}
        />
      )}

      {taskActivationOrder && (
        <StationActivationModal
          accessToken={session.accessToken}
          order={taskActivationOrder}
          onClose={() => setTaskActivationOrder(null)}
        />
      )}

      {taskReportingOrder && (
        <ServiceReportModal
          accessToken={session.accessToken}
          order={taskReportingOrder}
          existing={reportByOrder.get(taskReportingOrder.recordId)}
          companyName={session.company.name}
          operatorName={session.user.name}
          vehicleStockItems={latestStock?.items}
          readOnly={reportByOrder.get(taskReportingOrder.recordId)?.status === 'Finalized'}
          onClose={() => setTaskReportingOrder(null)}
          onSave={handleSaveTaskReport}
        />
      )}
    </div>
  );
}

function Tasks({
  tasks,
  orders,
  reports,
  loading,
  accessToken,
  isShiftActive = true,
  onNavigateToWorkOrders,
  onOpenStations,
  onOpenReport,
}: {
  tasks: CalendarEntryRecord[];
  orders: WorkOrder[];
  reports: ServiceReportRecord[];
  loading: boolean;
  accessToken: string;
  isShiftActive?: boolean;
  onNavigateToWorkOrders: () => void;
  onOpenStations?: (order: WorkOrder) => void;
  onOpenReport?: (order: WorkOrder) => void;
}) {
  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
  const [selectedTask, setSelectedTask] = useState<CalendarEntryRecord | null>(null);

  const visibleDays = Array.from({ length: 7 }, (_, index) => addDays(selectedDate, index - 3));
  const dayTasks = tasks
    .filter((task) => sameDay(new Date(task.scheduledAt), selectedDate))
    .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt));

  const reportByOrder = useMemo(() => new Map(reports.map((item) => [item.workOrderId, item])), [reports]);

  const selectedOrder = useMemo(() => {
    if (!selectedTask) return null;
    return (
      orders.find(
        (order) =>
          (selectedTask.workOrderId && order.recordId === selectedTask.workOrderId) ||
          (selectedTask.workOrderNumber && order.id === selectedTask.workOrderNumber)
      ) || null
    );
  }, [selectedTask, orders]);

  const selectedReport = useMemo(() => {
    if (!selectedOrder) return null;
    return reportByOrder.get(selectedOrder.recordId) || null;
  }, [selectedOrder, reportByOrder]);

  return (
    <section className="role-surface employee-tasks-page">
      <div className="role-section-title">
        <div>
          <p>GÖREV & İŞ EMRİ TAKVİMİ</p>
          <h2>Günlük Programım</h2>
        </div>
        <span>{dayTasks.length} kayıt</span>
      </div>

      <div className="employee-day-calendar">
        <div className="employee-day-navigation">
          <button onClick={() => setSelectedDate((date) => addDays(date, -1))}>
            <ChevronLeft size={18} />
          </button>
          <button className="today" onClick={() => setSelectedDate(startOfDay(new Date()))}>
            Bugün
          </button>
          <strong>
            {new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' }).format(
              selectedDate
            )}
          </strong>
          <button onClick={() => setSelectedDate((date) => addDays(date, 1))}>
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="employee-day-strip">
          {visibleDays.map((date) => (
            <button
              key={toDateKey(date)}
              className={sameDay(date, selectedDate) ? 'active' : ''}
              onClick={() => setSelectedDate(date)}
            >
              <span>{new Intl.DateTimeFormat('tr-TR', { weekday: 'short' }).format(date)}</span>
              <strong>{date.getDate()}</strong>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : dayTasks.length ? (
        <div className="employee-task-list employee-task-list-full">
          {dayTasks.map((task) => {
            const isWorkOrder = task.sourceType === 'WorkOrder' || task.kind === 'WorkOrder';
            const matchedOrder = orders.find(
              (o) =>
                (task.workOrderId && o.recordId === task.workOrderId) ||
                (task.workOrderNumber && o.id === task.workOrderNumber)
            );

            return (
              <article
                key={task.id}
                className={`employee-task-card ${task.status === 'Completed' ? 'completed' : ''} ${
                  isWorkOrder ? 'work-order' : ''
                }`}
                onClick={() => setSelectedTask(task)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedTask(task);
                  }
                }}
              >
                <span className="task-card-icon">
                  {task.status === 'Completed' ? (
                    <CheckCircle2 size={18} />
                  ) : isWorkOrder ? (
                    <BriefcaseBusiness size={18} />
                  ) : (
                    <CalendarClock size={18} />
                  )}
                </span>
                <div className="task-card-body">
                  <div className="task-card-title-row">
                    <strong>{task.title}</strong>
                    <span
                      className={`task-badge ${
                        task.status === 'Completed'
                          ? 'completed'
                          : isWorkOrder
                          ? 'work-order'
                          : 'planned'
                      }`}
                    >
                      {task.status === 'Completed'
                        ? 'Tamamlandı'
                        : isWorkOrder
                        ? matchedOrder?.status ?? 'İş Emri'
                        : 'Planlandı'}
                    </span>
                  </div>
                  <small>
                    {formatTaskDate(task)}
                    {task.kind === 'WorkOrder' && task.workOrderNumber ? ` · ${task.workOrderNumber}` : ''}
                    {task.serviceType ? ` · ${task.serviceType}` : ''}
                    {task.description ? ` · ${task.description}` : ''}
                  </small>
                </div>
                <ChevronRight size={18} className="task-card-arrow" />
              </article>
            );
          })}
        </div>
      ) : (
        <div className="field-empty-work">
          <BriefcaseBusiness size={22} />
          <div>
            <strong>Bu gün için görev bulunmuyor</strong>
            <span>Atanan iş emirleri ve görevler seçilen tarihte burada görünür.</span>
          </div>
        </div>
      )}

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          order={selectedOrder}
          report={selectedReport}
          accessToken={accessToken}
          isShiftActive={isShiftActive}
          onClose={() => setSelectedTask(null)}
          onOpenWorkOrderInPanel={(order) => {
            setSelectedTask(null);
            onNavigateToWorkOrders();
          }}
          onOpenStations={
            onOpenStations
              ? (order) => {
                  setSelectedTask(null);
                  onOpenStations(order);
                }
              : undefined
          }
          onOpenReport={
            onOpenReport
              ? (order) => {
                  setSelectedTask(null);
                  onOpenReport(order);
                }
              : undefined
          }
        />
      )}
    </section>
  );
}

function Loading({ failed = false }: { failed?: boolean }) {
  return (
    <div className="role-surface field-loading">
      {!failed && <RefreshCw className="spin-icon" size={28} />}
      <strong>{failed ? 'Operasyon bilgileri alınamadı.' : 'Operasyon bilgileri yükleniyor…'}</strong>
    </div>
  );
}

const statusLabels = {
  notStarted: { title: 'Mesai henüz başlamadı', description: 'Çalışmaya başladığında kaydını tek dokunuşla aç.' },
  working: { title: 'Mesai aktif', description: 'Net çalışma süren gerçek zamanlı hesaplanıyor.' },
  onBreak: { title: 'Mola aktif', description: 'Mola süresi çalışma süresinden otomatik düşülür.' },
  completed: { title: 'Mesai tamamlandı', description: 'Bugünkü net çalışma süren kaydedildi.' },
} as const;

function formatDuration(minutes: number) {
  return `${Math.floor(minutes / 60)}s ${minutes % 60}dk`;
}

function formatTime(value?: string) {
  return value
    ? new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
    : '—';
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatLongDate(value: Date) {
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    weekday: 'long',
  })
    .format(value)
    .toLocaleUpperCase('tr-TR');
}

function formatTaskDate(task: CalendarEntryRecord) {
  const value = new Date(task.scheduledAt);
  return `${new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', weekday: 'short' }).format(value)} · ${
    task.isAllDay
      ? 'Tüm gün'
      : new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(value)
  }`;
}

function toDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(
    2,
    '0'
  )}`;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return startOfDay(date);
}

function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
