import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CalendarPlus, CheckCircle2, Clock3, Cloud, CloudOff, FileCheck2, FilePlus2, MapPin, Play, RefreshCw, Route, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { WorkOrder } from '../types';
import WorkOrderModal from '../components/modals/WorkOrderModal';
import WorkOrderCompletionModal from '../components/modals/WorkOrderCompletionModal';
import ServiceReportModal from '../components/modals/ServiceReportModal';
import StationActivationModal from '../components/modals/StationActivationModal';
import VisitActionModal, { type VisitAction } from '../components/modals/VisitActionModal';
import RouteOptimizer from '../components/workorders/RouteOptimizer';
import { changeEmployeeVisitState, completeEmployeeWorkOrder, getEmployeePlanningOptions, getEmployeeWorkOrders, selfScheduleWorkOrders, startEmployeeWorkOrder, WorkOrderSessionExpiredError, type CreateWorkOrdersInput, type EmployeePlanningOptions } from '../services/workOrderApi';
import { getEmployeeServiceReports, ReportConflictError, ReportNetworkError, ReportSessionExpiredError, saveServiceReport, uploadServiceReportPhotos, type ReportPhotoUpload, type ServiceReportRecord, type UpsertServiceReportInput } from '../services/serviceReportApi';
import { CustomerPortalSessionExpiredError, getEmployeeEmergencyRequests, updateEmployeeEmergencyRequest, type EmergencyRequestRecord } from '../services/customerPortalApi';
import { createVehicleStockCheck, FieldSessionExpiredError, getLatestVehicleStock, type VehicleStockCheck } from '../services/fieldOperationsApi';
import { cacheFieldWorkspace, getCachedFieldWorkspace, listQueuedFieldActions, listQueuedReports, onFieldSyncChange, queueFieldAction, queueReportSubmission, removeLocalReportDraft, removeQueuedFieldAction, removeQueuedReport, toFiles, updateQueuedFieldAction, updateQueuedReport, type QueuedFieldAction, type QueuedReportSubmission } from '../services/offlineFieldStore';

type Props = {
  accessToken: string;
  accountId: string;
  companyName: string;
  operatorName: string;
  isShiftActive?: boolean;
  onStartShift?: () => Promise<void>;
  onNavigateToOperations?: () => void;
  onSessionExpired: () => void;
};

export default function EmployeeWorkOrdersPanel({ accessToken, accountId, companyName, operatorName, isShiftActive = true, onStartShift, onNavigateToOperations, onSessionExpired }: Props) {
  const [orders, setOrders] = useState<WorkOrder[]>([]); const [reports, setReports] = useState<ServiceReportRecord[]>([]); const [options, setOptions] = useState<EmployeePlanningOptions>({ canSelfSchedule: false, customers: [] });
  const [emergencyRequests, setEmergencyRequests] = useState<EmergencyRequestRecord[]>([]);
  const [vehicleStock, setVehicleStock] = useState<VehicleStockCheck | null>(null);
  const [queuedReports, setQueuedReports] = useState<QueuedReportSubmission[]>([]);
  const [queuedActions, setQueuedActions] = useState<QueuedFieldAction[]>([]);
  const [offlineMode, setOfflineMode] = useState(!navigator.onLine);
  const syncingRef = useRef(false);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [selfModal, setSelfModal] = useState(false); const [routeOpen, setRouteOpen] = useState(false); const [completing, setCompleting] = useState<WorkOrder | null>(null); const [reporting, setReporting] = useState<WorkOrder | null>(null); const [activationOrder, setActivationOrder] = useState<WorkOrder | null>(null); const [visitActionOrder, setVisitActionOrder] = useState<WorkOrder | null>(null);
  const reportByOrder = useMemo(() => new Map(reports.map((item) => [item.workOrderId, item])), [reports]);

  const load = async () => { setLoading(true); setError(null); try { const [items, planning, reportItems, emergencyItems, stock] = await Promise.all([getEmployeeWorkOrders(accessToken), getEmployeePlanningOptions(accessToken), getEmployeeServiceReports(accessToken), getEmployeeEmergencyRequests(accessToken), getLatestVehicleStock(accessToken)]); setOrders(items); setOptions(planning); setReports(reportItems); setEmergencyRequests(emergencyItems); setVehicleStock(stock); await cacheFieldWorkspace(accountId, { orders: items, planning, reports: reportItems, vehicleStock: stock }); setOfflineMode(false); } catch (loadError) { if (loadError instanceof WorkOrderSessionExpiredError || loadError instanceof ReportSessionExpiredError || loadError instanceof CustomerPortalSessionExpiredError || loadError instanceof FieldSessionExpiredError) return onSessionExpired(); const cached = await getCachedFieldWorkspace(accountId); if (cached) { setOrders(cached.orders); setOptions(cached.planning); setReports(cached.reports); setVehicleStock(cached.vehicleStock); setOfflineMode(true); setError('İnternet bağlantısı yok. Son eşitlenen saha programı açıldı.'); } else setError(loadError instanceof Error ? loadError.message : 'İş emirleri yüklenemedi.'); } finally { setLoading(false); } };
  const refreshQueue = useCallback(async () => {
    const [reportsQueue, actionsQueue] = await Promise.all([listQueuedReports(), listQueuedFieldActions()]);
    setQueuedReports(reportsQueue.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    setQueuedActions(actionsQueue.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }, []);
  const syncQueue = useCallback(async () => {
    if (!navigator.onLine || syncingRef.current) return;
    syncingRef.current = true;
    try {
      const actions = await listQueuedFieldActions();
      for (const item of actions) {
        await updateQueuedFieldAction({ ...item, status: 'syncing', attempts: item.attempts + 1, error: undefined });
        try {
          const updated = item.kind === 'Start'
            ? await startEmployeeWorkOrder(accessToken, item.workOrderId)
            : await changeEmployeeVisitState(accessToken, item.workOrderId, item.action!, item.reason);
          replace(updated);
          await removeQueuedFieldAction(item.id);
        } catch (syncError) {
          if (syncError instanceof WorkOrderSessionExpiredError) return onSessionExpired();
          await updateQueuedFieldAction({ ...item, status: 'failed', attempts: item.attempts + 1, error: syncError instanceof Error ? syncError.message : 'İşlem gönderilemedi.' });
          break;
        }
      }
      const queue = await listQueuedReports();
      for (const item of queue.filter((value) => value.status !== 'conflict' && value.status !== 'evidence-missing')) {
        await updateQueuedReport({ ...item, status: 'syncing', attempts: item.attempts + 1, error: undefined });
        try {
          const saved = item.reportSaved ?? await saveServiceReport(accessToken, item.workOrderId, item.input);
          await uploadServiceReportPhotos(accessToken, item.workOrderId, toFiles(item.photos));
          await removeQueuedReport(item.id);
          await removeLocalReportDraft(item.workOrderId);
          setReports((current) => [saved, ...current.filter((report) => report.id !== saved.id)]);
        } catch (syncError) {
          if (syncError instanceof ReportSessionExpiredError) return onSessionExpired();
          if (syncError instanceof ReportConflictError) await updateQueuedReport({ ...item, status: 'conflict', attempts: item.attempts + 1, error: syncError.message, serverReport: syncError.current });
          else await updateQueuedReport({ ...item, status: 'failed', attempts: item.attempts + 1, error: syncError instanceof Error ? syncError.message : 'Gönderim başarısız.' });
        }
      }
    } finally { syncingRef.current = false; await refreshQueue(); }
  }, [accessToken, onSessionExpired, refreshQueue]);
  useEffect(() => { void load(); void refreshQueue(); const syncChanged = onFieldSyncChange(() => void refreshQueue()); const online = () => { setOfflineMode(false); void syncQueue(); }; const offline = () => setOfflineMode(true); const serviceWorkerMessage = (event: MessageEvent) => { if (event.data === 'PESTNEER_SYNC') void syncQueue(); }; window.addEventListener('online', online); window.addEventListener('offline', offline); navigator.serviceWorker?.addEventListener('message', serviceWorkerMessage); const timer = window.setInterval(() => void syncQueue(), 30_000); return () => { syncChanged(); window.removeEventListener('online', online); window.removeEventListener('offline', offline); navigator.serviceWorker?.removeEventListener('message', serviceWorkerMessage); window.clearInterval(timer); }; }, [accessToken, syncQueue, refreshQueue]);
  const replace = (updated: WorkOrder) => setOrders((current) => current.map((item) => item.recordId === updated.recordId ? updated : item));
  const start = async (order: WorkOrder) => {
    if (!isShiftActive) {
      setError('İşlemlere ve müşteri ziyaretine başlayabilmek için lütfen önce mesainizi başlatın (İşe Başladım).');
      return;
    }
    try {
      const updated = await startEmployeeWorkOrder(accessToken, order.recordId);
      replace(updated);
    } catch (actionError) {
      if (actionError instanceof WorkOrderSessionExpiredError) return onSessionExpired();
      if (!navigator.onLine || actionError instanceof TypeError) {
        await queueFieldAction({ workOrderId: order.recordId, kind: 'Start' });
        const local = { ...order, technicalStatus: 'InProgress', status: 'Sahada' as const, startedAt: new Date().toISOString() };
        replace(local);
        setOfflineMode(true);
        await refreshQueue();
        return;
      }
      setError(actionError instanceof Error ? actionError.message : 'İş başlatılamadı.');
    }
  };
  const complete = async (note: string, recommendation: string, photos: File[]) => { if (!completing) return; replace(await completeEmployeeWorkOrder(accessToken, completing.recordId, note, recommendation, photos)); setCompleting(null); };
  const changeVisit = async (action: VisitAction, reason?: string) => { if (!visitActionOrder) return; const order = visitActionOrder; try { replace(await changeEmployeeVisitState(accessToken, order.recordId, action, reason)); } catch (actionError) { if (actionError instanceof WorkOrderSessionExpiredError) return onSessionExpired(); if (!navigator.onLine || actionError instanceof TypeError) { await queueFieldAction({ workOrderId: order.recordId, kind: 'VisitState', action, reason }); replace(applyLocalVisitState(order, action)); setOfflineMode(true); await refreshQueue(); } else throw actionError; } finally { setVisitActionOrder(null); } };
  const selfSchedule = async (input: CreateWorkOrdersInput) => {
    if (!isShiftActive) {
      setError('İş planlamak için önce mesainizi başlatmanız gerekmektedir.');
      return;
    }
    const created = await selfScheduleWorkOrders(accessToken, input);
    setOrders((current) => [...current, ...created].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)));
    setSelfModal(false);
  };
  const saveReport = async (input: UpsertServiceReportInput, photos: ReportPhotoUpload[]) => { if (!reporting) return; try { const saved = await saveServiceReport(accessToken, reporting.recordId, input); try { await uploadServiceReportPhotos(accessToken, reporting.recordId, photos); } catch (photoError) { if (photoError instanceof ReportNetworkError) await queueReportSubmission(reporting.recordId, { ...input, baseUpdatedAt: saved.updatedAt }, photos, saved); else throw photoError; } setReports((current) => [saved, ...current.filter((item) => item.id !== saved.id)]); setVehicleStock(await getLatestVehicleStock(accessToken)); setReporting(null); if (input.finalize) await load(); } catch (saveError) { if (saveError instanceof ReportNetworkError || !navigator.onLine) { await queueReportSubmission(reporting.recordId, input, photos); setOfflineMode(true); setReporting(null); await refreshQueue(); return; } throw saveError; } };
  const addManualStock = async (input: { productName: string; quantity: number; unit: string }) => {
    const normalizedName = input.productName.toLocaleUpperCase('tr-TR');
    const currentItems = vehicleStock?.items ?? [];
    const matching = currentItems.find((item) => item.productName.toLocaleUpperCase('tr-TR') === normalizedName && item.unit === input.unit);
    const items = currentItems.map((item) => ({ vehicleStockItemId: item.vehicleStockItemId, productName: item.productName, quantity: matching?.id === item.id ? item.quantity + input.quantity : item.quantity, unit: item.unit, isManual: item.isManual }));
    if (!matching) items.push({ vehicleStockItemId: undefined, productName: input.productName, quantity: input.quantity, unit: input.unit, isManual: true });
    const updated = await createVehicleStockCheck(accessToken, items);
    setVehicleStock(updated);
    const created = updated.items.find((item) => item.productName.toLocaleUpperCase('tr-TR') === normalizedName && item.unit === input.unit);
    if (!created) throw new Error('Eklenen sarf malzemesi araç stoğunda bulunamadı.');
    return created;
  };
  const acknowledgeEmergency = async (item: EmergencyRequestRecord) => { try { const updated = await updateEmployeeEmergencyRequest(accessToken, item.id, { status: 'Acknowledged', note: 'Atanan personel çağrıyı gördü ve kabul etti.' }); setEmergencyRequests((current) => current.map((value) => value.id === updated.id ? updated : value)); } catch (actionError) { if (actionError instanceof CustomerPortalSessionExpiredError) return onSessionExpired(); setError(actionError instanceof Error ? actionError.message : 'Acil çağrı güncellenemedi.'); } };
  const resolveConflict = async (item: QueuedReportSubmission, keepLocal: boolean) => {
    if (!keepLocal) {
      await removeQueuedReport(item.id);
      await removeLocalReportDraft(item.workOrderId);
      await refreshQueue();
      await load();
      return;
    }
    await updateQueuedReport({ ...item, status: 'pending', input: { ...item.input, baseUpdatedAt: item.serverReport?.updatedAt, forceOverwrite: true }, serverReport: undefined, error: undefined });
    await refreshQueue();
    await syncQueue();
  };
  const previousReport = reporting ? reports
    .filter((item) => item.workOrderId !== reporting.recordId && item.customerId === reporting.customerId && (item.branchId ?? '') === (reporting.branchId ?? ''))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] : undefined;

  return <section className="role-surface employee-work-orders-page"><div className="role-section-title"><div><p>SAHA PROGRAMI</p><h2>İş Emirlerim</h2></div><div className="employee-work-actions"><button onClick={() => setRouteOpen(true)}><Route size={16} /> Günün Rotası</button>{options.canSelfSchedule && <button disabled={!isShiftActive} onClick={() => isShiftActive ? setSelfModal(true) : setError('İş planlamak için önce mesainizi başlatmanız gerekmektedir.')}><CalendarPlus size={16} /> Kendime İş Planla</button>}<button className="icon-button" onClick={() => void load()}><RefreshCw size={16} /></button></div></div>
    {!isShiftActive && (
      <section className="field-shift-warning">
        <div>
          <Clock3 size={20} />
          <span>
            <strong>Mesainiz Henüz Başlatılmadı</strong>
            <small>Müşteri ziyareti ve ilaçlama işlemlerine başlayabilmek için önce mesainizi açmalısınız.</small>
          </span>
        </div>
        {onStartShift ? (
          <button onClick={() => void onStartShift()}>
            <Play size={15} /> İşe Başladım (Mesaiyi Başlat)
          </button>
        ) : onNavigateToOperations ? (
          <button onClick={onNavigateToOperations}>
            <Play size={15} /> Günlük Operasyona Git
          </button>
        ) : null}
      </section>
    )}
    {(offlineMode || queuedReports.length > 0 || queuedActions.length > 0) && <section className={`field-sync-banner ${offlineMode ? 'offline' : 'online'}`}><div>{offlineMode ? <CloudOff size={20} /> : <Cloud size={20} />}<span><strong>{offlineMode ? 'Çevrimdışı saha modu · Cihaza kaydoldu' : 'Senkronizasyon bekliyor'}</strong><small>{offlineMode ? `${queuedReports.length + queuedActions.length} işlem bu cihazda güvende; internet geldiğinde otomatik gönderilir.` : `${queuedReports.length + queuedActions.length} kayıt sunucuya gönderilecek.`}</small></span></div><button disabled={offlineMode} onClick={() => void syncQueue()}><RefreshCw size={15} /> Şimdi eşitle</button></section>}
    {queuedReports.filter((item) => item.status === 'evidence-missing').map((item) => <section className="field-sync-conflict" key={item.id}><AlertCircle size={19} /><div><strong>Çevrimdışı fotoğraf kanıtı eksik</strong><span>{item.error ?? 'Kayıt güvenlik için otomatik gönderilmedi. Raporu açıp fotoğrafları yeniden ekleyin.'}</span></div><button className="danger" onClick={() => void removeQueuedReport(item.id).then(refreshQueue)}>Eksik kuyruğu kaldır</button></section>)}
    {queuedReports.filter((item) => item.status === 'conflict').map((item) => <section className="field-sync-conflict" key={item.id}><AlertCircle size={19} /><div><strong>Aynı rapor başka bir cihazda değiştirildi</strong><span>Sunucudaki kayıt ile bu cihazdaki taslak farklı. Hangi sürümün korunacağını seçin.</span></div><button onClick={() => void resolveConflict(item, false)}>Sunucudakini kullan</button><button className="danger" onClick={() => void resolveConflict(item, true)}>Bu cihazdakini koru</button></section>)}
    {options.canSelfSchedule && <div className="self-schedule-permission"><Sparkles size={17} /><span>Firma sahibi, kendi iş programınızı oluşturma yetkisini etkinleştirdi.</span></div>}{error && <div className="field-operation-error"><AlertCircle size={16} /><span>{error}</span></div>}
    {emergencyRequests.some((item) => !['Completed','Cancelled'].includes(item.status)) && <div className="employee-emergency-strip"><AlertCircle size={19} /><div><strong>Size atanan acil müşteri çağrıları</strong>{emergencyRequests.filter((item) => !['Completed','Cancelled'].includes(item.status)).map((item) => <article key={item.id}><span>{item.number} · {item.customerName} / {item.branchName}</span><p>{item.description}</p>{item.status === 'New' ? <button onClick={() => void acknowledgeEmergency(item)}>Çağrıyı kabul et</button> : <em>Çağrı kabul edildi</em>}</article>)}</div></div>}
    {loading ? <div className="field-loading"><RefreshCw className="spin-icon" size={26} /><span>İş emirleri yükleniyor…</span></div> : orders.length === 0 ? <div className="field-empty-work"><CalendarPlus size={24} /><div><strong>Atanmış iş emri bulunmuyor</strong><span>Yeni bir iş atandığında müşteri, şube, konum ve zaman bilgileri burada görünür.</span></div></div> : <div className="employee-work-list">{orders.map((order) => { const report = reportByOrder.get(order.recordId); const hasActiveSession = order.visitSessions.some((session) => session.employeeAccountId === accountId && session.status === 'Active'); const hasCompletedPart = order.visitSessions.some((session) => session.employeeAccountId === accountId && session.status === 'Completed'); const activeTeam = order.visitSessions.filter((session) => session.status === 'Active'); return <article key={order.recordId} className={`employee-work-card work-${order.technicalStatus.toLowerCase()}`}><div className="employee-work-card-top"><div><span>{order.id}</span><strong>{order.client}</strong><small>{order.branch}</small></div><em>{order.status}</em></div><div className="employee-work-meta"><span><Clock3 size={15} />{order.date} · {order.time}</span><a href={order.branchMapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.branchAddress)}`} target="_blank" rel="noreferrer"><MapPin size={15} />{order.branchAddress}</a></div><div className="employee-work-service"><strong>{order.service}</strong><span>{visitLabel(order.visitType)}</span></div>{order.notes && <p>{order.notes}</p>}{order.completionNote && <div className="employee-completion-note"><CheckCircle2 size={16} /><span>{order.completionNote}</span></div>}
      {report && <div className={`employee-report-state ${report.status.toLowerCase()}`}><FileCheck2 size={16} /><span>{report.status === 'Finalized' ? `Rapor onaylandı · ${report.totalStations} istasyon · ${riskLabel(report.riskLevel)} risk` : 'Saha raporu taslak olarak kaydedildi'}</span></div>}
      {order.assignments.length > 1 && <div className="employee-work-team"><strong>Saha ekibi</strong><span>{order.assignments.map((item) => item.employeeName).join(' · ')}</span></div>}{activeTeam.length > 0 && <div className="employee-work-team is-live"><strong>Aktif ekip</strong><span>{activeTeam.map((item) => item.employeeName).join(' · ')}</span></div>}{order.customerDurationMinutes && <div className="employee-work-team"><strong>Müşteride süre</strong><span>{formatDuration(order.customerDurationMinutes)} · toplam ekip emeği {formatDuration(order.totalLaborMinutes)}</span></div>}
      <div className="employee-work-card-actions">
        {order.technicalStatus === 'Planned' && (
          <div className="employee-action-buttons is-full">
            <button
              type="button"
              className="emp-btn emp-btn-primary"
              disabled={!isShiftActive}
              title={!isShiftActive ? 'İşlemlere başlamak için önce mesainizi başlatmalısınız.' : 'İlaçlamayı Başlat'}
              onClick={() => void start(order)}
            >
              <Play size={16} /> İşe Başla (İlaçlamayı Başlat)
            </button>
          </div>
        )}
        {order.technicalStatus === 'Paused' && (
          <div className="employee-action-buttons">
            <button
              type="button"
              className="emp-btn emp-btn-primary"
              disabled={!isShiftActive}
              onClick={() => void start(order)}
            >
              <Play size={16} /> Ziyarete Devam Et
            </button>
            <button
              type="button"
              className="emp-btn emp-btn-secondary"
              onClick={() => setVisitActionOrder(order)}
            >
              <SlidersHorizontal size={16} /> Ziyaret İşlemleri
            </button>
          </div>
        )}
        {order.technicalStatus === 'InProgress' && hasCompletedPart && !hasActiveSession && (
          <div className="employee-action-buttons">
            <span className="work-completed-label"><CheckCircle2 size={15} /> Saha Payınız Tamamlandı</span>
            <button
              type="button"
              className="emp-btn emp-btn-secondary"
              onClick={() => setActivationOrder(order)}
            >
              <FileCheck2 size={16} /> İstasyon Monitörleri
            </button>
            <button
              type="button"
              className="emp-btn emp-btn-secondary"
              onClick={() => setReporting(order)}
            >
              <FilePlus2 size={16} /> EK-1 Formunu Aç
            </button>
          </div>
        )}
        {order.technicalStatus === 'InProgress' && !hasActiveSession && !hasCompletedPart && (
          <div className="employee-action-buttons">
            <button
              type="button"
              className="emp-btn emp-btn-primary"
              disabled={!isShiftActive}
              onClick={() => void start(order)}
            >
              <Play size={16} /> Devam Eden Ziyarete Katıl
            </button>
            <button
              type="button"
              className="emp-btn emp-btn-secondary"
              onClick={() => setVisitActionOrder(order)}
            >
              <SlidersHorizontal size={16} /> Ziyaret İşlemleri
            </button>
          </div>
        )}
        {order.technicalStatus === 'InProgress' && hasActiveSession && (
          <div className="employee-action-buttons">
            <button
              type="button"
              className="emp-btn emp-btn-primary"
              onClick={() => setActivationOrder(order)}
            >
              <FileCheck2 size={16} /> İstasyon Monitörleri
            </button>
            <button
              type="button"
              className="emp-btn emp-btn-secondary"
              onClick={() => setReporting(order)}
            >
              <FilePlus2 size={16} /> {report ? 'EK-1 Formunu Aç' : 'EK-1 Formu Oluştur'}
            </button>
            <button
              type="button"
              className="emp-btn emp-btn-secondary"
              onClick={() => setVisitActionOrder(order)}
            >
              <SlidersHorizontal size={16} /> Ziyaret İşlemleri
            </button>
          </div>
        )}
        {order.technicalStatus === 'Completed' && (
          <div className="employee-action-buttons">
            <span className="work-completed-label"><CheckCircle2 size={15} /> Tamamlandı</span>
            <button
              type="button"
              className="emp-btn emp-btn-secondary"
              onClick={() => setActivationOrder(order)}
            >
              <FileCheck2 size={16} /> İstasyon Monitörleri
            </button>
            <button
              type="button"
              className="emp-btn emp-btn-secondary"
              onClick={() => setReporting(order)}
            >
              <FilePlus2 size={16} /> {report ? 'EK-1 Formunu Görüntüle' : 'EK-1 Formu Oluştur'}
            </button>
          </div>
        )}
      </div></article>; })}</div>}
    {selfModal && <WorkOrderModal customers={options.customers} selfSchedule onClose={() => setSelfModal(false)} onCreate={selfSchedule} />}{completing && <WorkOrderCompletionModal order={completing} onClose={() => setCompleting(null)} onSubmit={complete} />}
    {reporting && <ServiceReportModal accessToken={accessToken} order={reporting} existing={reportByOrder.get(reporting.recordId)} previousReport={previousReport} companyName={companyName} operatorName={operatorName} vehicleStockItems={vehicleStock?.items} readOnly={reportByOrder.get(reporting.recordId)?.status === 'Finalized'} onClose={() => setReporting(null)} onSave={saveReport} onAddManualStock={addManualStock} />}
    {activationOrder && (
      <StationActivationModal
        accessToken={accessToken}
        order={activationOrder}
        onClose={() => setActivationOrder(null)}
        onOpenReport={() => {
          const target = activationOrder;
          setActivationOrder(null);
          setReporting(target);
        }}
      />
    )}
    {visitActionOrder && <VisitActionModal onClose={() => setVisitActionOrder(null)} onSubmit={changeVisit} />}
    {routeOpen && <RouteOptimizer orders={orders} onClose={() => setRouteOpen(false)} />}
  </section>;
}
function visitLabel(value: string) { return ({ Routine: 'Rutin hizmet', Extra: 'Ekstra hizmet', EmergencyPaid: 'Ücretli acil çağrı', EmergencyFree: 'Ücretsiz acil çağrı' } as Record<string, string>)[value] ?? value; }
function riskLabel(value: string) { return ({ Low: 'Düşük', Medium: 'Orta', High: 'Yüksek' } as Record<string, string>)[value] ?? value; }
function formatDuration(minutes: number) { const hours = Math.floor(minutes / 60); const rest = minutes % 60; return hours ? `${hours} sa ${rest} dk` : `${rest} dk`; }
function applyLocalVisitState(order: WorkOrder, action: VisitAction): WorkOrder {
  if (action === 'Pause') return { ...order, technicalStatus: 'Paused', status: 'Planlandı' };
  if (action === 'Skip') return { ...order, technicalStatus: 'Skipped', status: 'İptal' };
  if (action === 'Cancel') return { ...order, technicalStatus: 'Cancelled', status: 'İptal' };
  return order;
}
