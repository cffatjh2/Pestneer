import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CalendarPlus, CheckCircle2, Clock3, Cloud, CloudOff, FileCheck2, FilePlus2, MapPin, Play, RefreshCw, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { WorkOrder } from '../types';
import WorkOrderModal from '../components/modals/WorkOrderModal';
import WorkOrderCompletionModal from '../components/modals/WorkOrderCompletionModal';
import ServiceReportModal from '../components/modals/ServiceReportModal';
import VisitActionModal, { type VisitAction } from '../components/modals/VisitActionModal';
import { changeEmployeeVisitState, completeEmployeeWorkOrder, getEmployeePlanningOptions, getEmployeeWorkOrders, selfScheduleWorkOrders, startEmployeeWorkOrder, WorkOrderSessionExpiredError, type CreateWorkOrdersInput, type EmployeePlanningOptions } from '../services/workOrderApi';
import { getEmployeeServiceReports, ReportConflictError, ReportNetworkError, ReportSessionExpiredError, saveServiceReport, uploadServiceReportPhotos, type ReportPhotoUpload, type ServiceReportRecord, type UpsertServiceReportInput } from '../services/serviceReportApi';
import { CustomerPortalSessionExpiredError, getEmployeeEmergencyRequests, updateEmployeeEmergencyRequest, type EmergencyRequestRecord } from '../services/customerPortalApi';
import { createVehicleStockCheck, FieldSessionExpiredError, getLatestVehicleStock, type VehicleStockCheck } from '../services/fieldOperationsApi';
import { cacheFieldWorkspace, getCachedFieldWorkspace, listQueuedReports, onFieldSyncChange, queueReportSubmission, removeLocalReportDraft, removeQueuedReport, toFiles, updateQueuedReport, type QueuedReportSubmission } from '../services/offlineFieldStore';

type Props = { accessToken: string; accountId: string; companyName: string; operatorName: string; onSessionExpired: () => void };

export default function EmployeeWorkOrdersPanel({ accessToken, accountId, companyName, operatorName, onSessionExpired }: Props) {
  const [orders, setOrders] = useState<WorkOrder[]>([]); const [reports, setReports] = useState<ServiceReportRecord[]>([]); const [options, setOptions] = useState<EmployeePlanningOptions>({ canSelfSchedule: false, customers: [] });
  const [emergencyRequests, setEmergencyRequests] = useState<EmergencyRequestRecord[]>([]);
  const [vehicleStock, setVehicleStock] = useState<VehicleStockCheck | null>(null);
  const [queuedReports, setQueuedReports] = useState<QueuedReportSubmission[]>([]);
  const [offlineMode, setOfflineMode] = useState(!navigator.onLine);
  const syncingRef = useRef(false);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [selfModal, setSelfModal] = useState(false); const [completing, setCompleting] = useState<WorkOrder | null>(null); const [reporting, setReporting] = useState<WorkOrder | null>(null); const [visitActionOrder, setVisitActionOrder] = useState<WorkOrder | null>(null);
  const reportByOrder = useMemo(() => new Map(reports.map((item) => [item.workOrderId, item])), [reports]);

  const load = async () => { setLoading(true); setError(null); try { const [items, planning, reportItems, emergencyItems, stock] = await Promise.all([getEmployeeWorkOrders(accessToken), getEmployeePlanningOptions(accessToken), getEmployeeServiceReports(accessToken), getEmployeeEmergencyRequests(accessToken), getLatestVehicleStock(accessToken)]); setOrders(items); setOptions(planning); setReports(reportItems); setEmergencyRequests(emergencyItems); setVehicleStock(stock); await cacheFieldWorkspace(accountId, { orders: items, planning, reports: reportItems, vehicleStock: stock }); setOfflineMode(false); } catch (loadError) { if (loadError instanceof WorkOrderSessionExpiredError || loadError instanceof ReportSessionExpiredError || loadError instanceof CustomerPortalSessionExpiredError || loadError instanceof FieldSessionExpiredError) return onSessionExpired(); const cached = await getCachedFieldWorkspace(accountId); if (cached) { setOrders(cached.orders); setOptions(cached.planning); setReports(cached.reports); setVehicleStock(cached.vehicleStock); setOfflineMode(true); setError('İnternet bağlantısı yok. Son eşitlenen saha programı açıldı.'); } else setError(loadError instanceof Error ? loadError.message : 'İş emirleri yüklenemedi.'); } finally { setLoading(false); } };
  const refreshQueue = useCallback(async () => setQueuedReports((await listQueuedReports()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))), []);
  const syncQueue = useCallback(async () => {
    if (!navigator.onLine || syncingRef.current) return;
    syncingRef.current = true;
    try {
      const queue = await listQueuedReports();
      for (const item of queue.filter((value) => value.status !== 'conflict')) {
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
  useEffect(() => { void load(); void refreshQueue(); const syncChanged = onFieldSyncChange(() => void refreshQueue()); const online = () => { setOfflineMode(false); void syncQueue(); }; const offline = () => setOfflineMode(true); window.addEventListener('online', online); window.addEventListener('offline', offline); const timer = window.setInterval(() => void syncQueue(), 30_000); return () => { syncChanged(); window.removeEventListener('online', online); window.removeEventListener('offline', offline); window.clearInterval(timer); }; }, [accessToken, syncQueue, refreshQueue]);
  const replace = (updated: WorkOrder) => setOrders((current) => current.map((item) => item.recordId === updated.recordId ? updated : item));
  const start = async (order: WorkOrder) => { try { const updated = await startEmployeeWorkOrder(accessToken, order.recordId); replace(updated); setReporting(updated); } catch (actionError) { if (actionError instanceof WorkOrderSessionExpiredError) return onSessionExpired(); if (!navigator.onLine) { const local = { ...order, technicalStatus: 'InProgress', status: 'Sahada' as const, startedAt: new Date().toISOString() }; replace(local); setReporting(local); setOfflineMode(true); return; } setError(actionError instanceof Error ? actionError.message : 'İş başlatılamadı.'); } };
  const complete = async (note: string, recommendation: string, photos: File[]) => { if (!completing) return; replace(await completeEmployeeWorkOrder(accessToken, completing.recordId, note, recommendation, photos)); setCompleting(null); };
  const changeVisit = async (action: VisitAction, reason?: string) => { if (!visitActionOrder) return; replace(await changeEmployeeVisitState(accessToken, visitActionOrder.recordId, action, reason)); setVisitActionOrder(null); };
  const selfSchedule = async (input: CreateWorkOrdersInput) => { const created = await selfScheduleWorkOrders(accessToken, input); setOrders((current) => [...current, ...created].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))); setSelfModal(false); };
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

  return <section className="role-surface employee-work-orders-page"><div className="role-section-title"><div><p>SAHA PROGRAMI</p><h2>İş Emirlerim</h2></div><div className="employee-work-actions">{options.canSelfSchedule && <button onClick={() => setSelfModal(true)}><CalendarPlus size={16} /> Kendime İş Planla</button>}<button className="icon-button" onClick={() => void load()}><RefreshCw size={16} /></button></div></div>
    {(offlineMode || queuedReports.length > 0) && <section className={`field-sync-banner ${offlineMode ? 'offline' : 'online'}`}><div>{offlineMode ? <CloudOff size={20} /> : <Cloud size={20} />}<span><strong>{offlineMode ? 'Çevrimdışı saha modu' : 'Senkronizasyon bekliyor'}</strong><small>{offlineMode ? 'Kayıtlar bu cihazda korunur; internet geldiğinde otomatik gönderilir.' : `${queuedReports.length} kayıt sunucuya gönderilecek.`}</small></span></div><button disabled={offlineMode} onClick={() => void syncQueue()}><RefreshCw size={15} /> Şimdi eşitle</button></section>}
    {queuedReports.filter((item) => item.status === 'conflict').map((item) => <section className="field-sync-conflict" key={item.id}><AlertCircle size={19} /><div><strong>Aynı rapor başka bir cihazda değiştirildi</strong><span>Sunucudaki kayıt ile bu cihazdaki taslak farklı. Hangi sürümün korunacağını seçin.</span></div><button onClick={() => void resolveConflict(item, false)}>Sunucudakini kullan</button><button className="danger" onClick={() => void resolveConflict(item, true)}>Bu cihazdakini koru</button></section>)}
    {options.canSelfSchedule && <div className="self-schedule-permission"><Sparkles size={17} /><span>Firma sahibi, kendi iş programınızı oluşturma yetkisini etkinleştirdi.</span></div>}{error && <div className="field-operation-error"><AlertCircle size={16} /><span>{error}</span></div>}
    {emergencyRequests.some((item) => !['Completed','Cancelled'].includes(item.status)) && <div className="employee-emergency-strip"><AlertCircle size={19} /><div><strong>Size atanan acil müşteri çağrıları</strong>{emergencyRequests.filter((item) => !['Completed','Cancelled'].includes(item.status)).map((item) => <article key={item.id}><span>{item.number} · {item.customerName} / {item.branchName}</span><p>{item.description}</p>{item.status === 'New' ? <button onClick={() => void acknowledgeEmergency(item)}>Çağrıyı kabul et</button> : <em>Çağrı kabul edildi</em>}</article>)}</div></div>}
    {loading ? <div className="field-loading"><RefreshCw className="spin-icon" size={26} /><span>İş emirleri yükleniyor…</span></div> : orders.length === 0 ? <div className="field-empty-work"><CalendarPlus size={24} /><div><strong>Atanmış iş emri bulunmuyor</strong><span>Yeni bir iş atandığında müşteri, şube, konum ve zaman bilgileri burada görünür.</span></div></div> : <div className="employee-work-list">{orders.map((order) => { const report = reportByOrder.get(order.recordId); const hasActiveSession = order.visitSessions.some((session) => session.employeeAccountId === accountId && session.status === 'Active'); const activeTeam = order.visitSessions.filter((session) => session.status === 'Active'); return <article key={order.recordId} className={`employee-work-card work-${order.technicalStatus.toLowerCase()}`}><div className="employee-work-card-top"><div><span>{order.id}</span><strong>{order.client}</strong><small>{order.branch}</small></div><em>{order.status}</em></div><div className="employee-work-meta"><span><Clock3 size={15} />{order.date} · {order.time}</span><a href={order.branchMapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.branchAddress)}`} target="_blank" rel="noreferrer"><MapPin size={15} />{order.branchAddress}</a></div><div className="employee-work-service"><strong>{order.service}</strong><span>{visitLabel(order.visitType)}</span></div>{order.notes && <p>{order.notes}</p>}{order.completionNote && <div className="employee-completion-note"><CheckCircle2 size={16} /><span>{order.completionNote}</span></div>}
      {report && <div className={`employee-report-state ${report.status.toLowerCase()}`}><FileCheck2 size={16} /><span>{report.status === 'Finalized' ? `Rapor onaylandı · ${report.totalStations} istasyon · ${riskLabel(report.riskLevel)} risk` : 'Saha raporu taslak olarak kaydedildi'}</span></div>}
      {order.assignments.length > 1 && <div className="employee-work-team"><strong>Saha ekibi</strong><span>{order.assignments.map((item) => item.employeeName).join(' · ')}</span></div>}{activeTeam.length > 0 && <div className="employee-work-team is-live"><strong>Aktif ekip</strong><span>{activeTeam.map((item) => item.employeeName).join(' · ')}</span></div>}{order.customerDurationMinutes && <div className="employee-work-team"><strong>Müşteride süre</strong><span>{formatDuration(order.customerDurationMinutes)} · toplam ekip emeği {formatDuration(order.totalLaborMinutes)}</span></div>}
      <div className="employee-work-card-actions">{['Planned','Paused'].includes(order.technicalStatus) && <><button className="role-primary-button" onClick={() => void start(order)}><Play size={16} /> {order.technicalStatus === 'Paused' ? 'Ziyarete Devam Et' : 'İlaçlamayı Başlat'}</button><button className="employee-report-button" onClick={() => setVisitActionOrder(order)}><SlidersHorizontal size={16} /> Ziyaret işlemleri</button></>}{order.technicalStatus === 'InProgress' && !hasActiveSession && <><button className="role-primary-button" onClick={() => void start(order)}><Play size={16} /> Devam Eden Ziyarete Katıl</button><button className="employee-report-button" onClick={() => setVisitActionOrder(order)}><SlidersHorizontal size={16} /> Ziyaret işlemleri</button></>}{order.technicalStatus === 'InProgress' && hasActiveSession && <><button className="role-primary-button" onClick={() => setReporting(order)}><FilePlus2 size={16} /> {report ? 'Raporu aç / bitir' : 'Saha raporu / bitir'}</button><button className="employee-report-button" onClick={() => setVisitActionOrder(order)}><SlidersHorizontal size={16} /> Ziyaret işlemleri</button></>}{order.technicalStatus === 'Completed' && <><span className="work-completed-label"><CheckCircle2 size={16} /> Tamamlandı</span><button className="employee-report-button" onClick={() => setReporting(order)}><FileCheck2 size={16} /> {report ? 'Raporu görüntüle' : 'Rapor oluştur'}</button></>}</div></article>; })}</div>}
    {selfModal && <WorkOrderModal customers={options.customers} selfSchedule onClose={() => setSelfModal(false)} onCreate={selfSchedule} />}{completing && <WorkOrderCompletionModal order={completing} onClose={() => setCompleting(null)} onSubmit={complete} />}
    {reporting && <ServiceReportModal accessToken={accessToken} order={reporting} existing={reportByOrder.get(reporting.recordId)} previousReport={previousReport} companyName={companyName} operatorName={operatorName} vehicleStockItems={vehicleStock?.items} readOnly={reportByOrder.get(reporting.recordId)?.status === 'Finalized'} onClose={() => setReporting(null)} onSave={saveReport} onAddManualStock={addManualStock} />}
    {visitActionOrder && <VisitActionModal onClose={() => setVisitActionOrder(null)} onSubmit={changeVisit} />}
  </section>;
}
function visitLabel(value: string) { return ({ Routine: 'Rutin hizmet', Extra: 'Ekstra hizmet', EmergencyPaid: 'Ücretli acil çağrı', EmergencyFree: 'Ücretsiz acil çağrı' } as Record<string, string>)[value] ?? value; }
function riskLabel(value: string) { return ({ Low: 'Düşük', Medium: 'Orta', High: 'Yüksek' } as Record<string, string>)[value] ?? value; }
function formatDuration(minutes: number) { const hours = Math.floor(minutes / 60); const rest = minutes % 60; return hours ? `${hours} sa ${rest} dk` : `${rest} dk`; }
