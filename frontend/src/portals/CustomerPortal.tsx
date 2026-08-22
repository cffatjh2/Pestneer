import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Building2, CalendarDays, CheckCircle2, Clock3, Download, FileCheck2, FileText, MapPin, Plus, Printer, RefreshCw, Share2, ShieldAlert, Store, X } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import type { AuthenticatedSession } from '../auth/types';
import ServiceReportPrintSheet from '../components/report/ServiceReportPrintSheet';
import { getCustomerServiceReportSummaries, getServiceReportDetail, getServiceReportPdfUrl, ReportSessionExpiredError, type ServiceReportRecord, type ServiceReportSummary } from '../services/serviceReportApi';
import { addCustomerRequestMessage, approveCustomerRequestClosure, createEmergencyRequest, CustomerPortalSessionExpiredError, getCustomerCommercialSummary, getCustomerPortalSummary, type CreateEmergencyRequestInput, type CustomerCommercialSummary, type CustomerPortalSummary, type EmergencyRequestRecord } from '../services/customerPortalApi';
import WeatherRiskPanel from '../components/weather/WeatherRiskPanel';
import { getCustomerWeatherRisks, WeatherRiskSessionExpiredError, type WeatherRiskOverview } from '../services/weatherRiskApi';
import PortalHeader from './PortalHeader';
import PortalFooter from '../components/layout/PortalFooter';
import QualityCenter from '../components/quality/QualityCenter';
import CustomerCommercialCenter from './CustomerCommercialCenter';
import CorrectiveActionCenter from '../components/compliance/CorrectiveActionCenter';
import HealthWasteCenter from '../components/compliance/HealthWasteCenter';
import { PasswordChangeCard } from '../components/security/PasswordSecurityCards';
import { downloadBlob, shareProtectedDocument } from '../utils/shareUtils';
import { apiFetch } from '../services/apiBase';
import { getCustomerStationActivationSummaries, getStationActivationDetail, type StationActivationRecord, type StationActivationSummary } from '../services/stationActivationApi';

type Tab = 'overview' | 'services' | 'stations' | 'commercial' | 'health' | 'weather' | 'reports' | 'documents' | 'actions' | 'requests' | 'account';

export default function CustomerPortal({ session, onLogout }: { session: AuthenticatedSession; onLogout: () => void }) {
  const [summary, setSummary] = useState<CustomerPortalSummary | null>(null); const [reports, setReports] = useState<ServiceReportSummary[]>([]);
  const [weatherRisk, setWeatherRisk] = useState<WeatherRiskOverview | null>(null);
  const [commercial, setCommercial] = useState<CustomerCommercialSummary | null>(null);
  const [stationActivations, setStationActivations] = useState<StationActivationSummary[]>([]);
  const [stationActivationDetails, setStationActivationDetails] = useState<Record<string, StationActivationRecord>>({});
  const [stationDetailsLoading, setStationDetailsLoading] = useState(false);
  const [stationDetailsLoaded, setStationDetailsLoaded] = useState(false);
  const [stationDetailsError, setStationDetailsError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview'); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [requestOpen, setRequestOpen] = useState(false); const [preview, setPreview] = useState<ServiceReportRecord | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [reportActionError, setReportActionError] = useState<string | null>(null);
  const stationHydrationKey = useRef('');
  const printRef = useRef<HTMLDivElement>(null); const print = useReactToPrint({ contentRef: printRef, documentTitle: preview ? `${preview.reportNumber}_${preview.branchName}` : 'Pestneer_Hizmet_Raporu' });
  const downloadReport = async (report: Pick<ServiceReportSummary, 'id' | 'reportNumber'>) => { const response = await apiFetch(getServiceReportPdfUrl(report.id), { headers: { Authorization: `Bearer ${session.accessToken}` } }); if (!response.ok) throw new Error('Hizmet raporu indirilemedi.'); downloadBlob(await response.blob(), `${report.reportNumber}.pdf`); };
  const shareReport = async (report: Pick<ServiceReportSummary, 'id' | 'reportNumber'>) => { await shareProtectedDocument(session.accessToken, getServiceReportPdfUrl(report.id), `${report.reportNumber}.pdf`, `${report.reportNumber} Hizmet Raporu`); };
  const openReport = async (report: ServiceReportSummary) => {
    setPreviewLoadingId(report.id);
    setReportActionError(null);
    try {
      setPreview(await getServiceReportDetail(session.accessToken, report));
    } catch (detailError) {
      if (detailError instanceof ReportSessionExpiredError) return onLogout();
      setReportActionError(detailError instanceof Error ? detailError.message : 'Rapor detayı yüklenemedi.');
    } finally {
      setPreviewLoadingId(null);
    }
  };
  const load = async (forceWeather = false) => { setLoading(true); setError(null); try { const [portal, reportItems, risk, commercialItems, activations] = await Promise.all([getCustomerPortalSummary(session.accessToken), getCustomerServiceReportSummaries(session.accessToken), getCustomerWeatherRisks(session.accessToken, forceWeather), getCustomerCommercialSummary(session.accessToken), getCustomerStationActivationSummaries(session.accessToken)]); setSummary(portal); setReports(reportItems); setWeatherRisk(risk); setCommercial(commercialItems); setStationActivations(activations); setStationActivationDetails({}); setStationDetailsLoaded(false); setStationDetailsError(null); stationHydrationKey.current = ''; } catch (loadError) { if (loadError instanceof CustomerPortalSessionExpiredError || loadError instanceof WeatherRiskSessionExpiredError || loadError instanceof ReportSessionExpiredError) return onLogout(); setError(loadError instanceof Error ? loadError.message : 'Müşteri verileri yüklenemedi.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, [session.accessToken]);
  useEffect(() => {
    if (tab !== 'stations' || stationActivations.length === 0 || stationDetailsLoaded) return;
    const key = stationActivations.map((item) => item.id).join(',');
    if (stationHydrationKey.current === key) return;
    stationHydrationKey.current = key;
    let cancelled = false;
    setStationDetailsLoading(true);
    setStationDetailsError(null);

    void (async () => {
      const details: Record<string, StationActivationRecord> = {};
      let failed = 0;
      for (let index = 0; index < stationActivations.length; index += 4) {
        const batch = stationActivations.slice(index, index + 4);
        const results = await Promise.allSettled(batch.map((item) => getStationActivationDetail(session.accessToken, item)));
        if (cancelled) return;
        results.forEach((result, resultIndex) => {
          if (result.status === 'fulfilled') details[batch[resultIndex].id] = result.value;
          else failed += 1;
        });
      }
      if (cancelled) return;
      setStationActivationDetails(details);
      setStationDetailsLoaded(true);
      if (failed > 0) setStationDetailsError(`${failed} aktivasyonun istasyon detayı alınamadı; özet bilgiler gösterilmeye devam ediyor.`);
    })().finally(() => { if (!cancelled) setStationDetailsLoading(false); });

    return () => { cancelled = true; stationHydrationKey.current = ''; };
  }, [session.accessToken, stationActivations, stationDetailsLoaded, tab]);
  const openRequests = summary?.emergencyRequests.filter((item) => !['Completed', 'Cancelled'].includes(item.status)).length ?? 0;
  const allServices = useMemo(() => [...(summary?.upcomingWorkOrders ?? []), ...(summary?.completedWorkOrders ?? [])].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)), [summary]);
  const sortedReports = useMemo(() => {
    return [...reports].sort((a, b) => {
      const timeA = new Date(a.scheduledAt || a.updatedAt || 0).getTime();
      const timeB = new Date(b.scheduledAt || b.updatedAt || 0).getTime();
      return timeB - timeA;
    });
  }, [reports]);
  const submitRequest = async (input: CreateEmergencyRequestInput) => { const created = await createEmergencyRequest(session.accessToken, input); setSummary((current) => current ? { ...current, emergencyRequests: [created, ...current.emergencyRequests] } : current); setRequestOpen(false); setTab('requests'); };
  const updateRequest = (updated: EmergencyRequestRecord) => setSummary((current) => current ? { ...current, emergencyRequests: current.emergencyRequests.map((item) => item.id === updated.id ? updated : item) } : current);

  return <div className="role-portal customer-portal"><PortalHeader session={session} onLogout={onLogout} context="MÜŞTERİ PORTALI" />
    <main className="role-portal-main customer-portal-main">
      <div className="role-welcome"><div><p>MÜŞTERİ OPERASYONLARI</p><h1>{summary?.customerName ?? 'Hizmetleriniz tek ekranda'}</h1><span>{summary?.scope === 'Branch' ? 'Yalnızca yetkili olduğunuz şubenin hizmetleri gösteriliyor.' : 'Şubelerinizi, uygulama raporlarını ve yaklaşan kontrolleri güvenle takip edin.'}</span></div><button onClick={() => setRequestOpen(true)}><ShieldAlert size={18} />Talep oluştur</button></div>
      <nav className="customer-portal-tabs">{([['overview','Genel Bakış'],['services','Hizmetler'],['stations',`İstasyon İzleme${stationActivations.length ? ` (${stationActivations.reduce((sum, a) => sum + a.totalStations, 0)})` : ''}`],['commercial',`Teklif & Sözleşme${commercial?.pendingProposalCount ? ` (${commercial.pendingProposalCount})` : ''}`],['health','Şube Sağlık Skoru'],['weather',`Hava & Risk${weatherRisk?.highRiskLocations ? ` (${weatherRisk.highRiskLocations})` : ''}`],['reports','Raporlar'],['documents','Belgeler & Analizler'],['actions','Düzeltici Faaliyetler'],['requests',`Talep & Şikâyet${openRequests ? ` (${openRequests})` : ''}`],['account','Hesabım']] as [Tab,string][]).map(([value,label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>)}<button className="customer-refresh" onClick={() => void load()} aria-label="Yenile"><RefreshCw size={16} /></button></nav>
      {reportActionError && <div className="field-operation-error"><AlertTriangle size={16} /><span>{reportActionError} Özet liste kullanılmaya devam ediyor.</span></div>}
      {loading ? <PortalState icon={<RefreshCw className="spin-icon" />} text="Müşteri portalı hazırlanıyor…" /> : error || !summary ? <PortalState icon={<AlertTriangle />} text={error ?? 'Müşteri kaydı bulunamadı.'} action={() => void load()} /> : <>
        {tab === 'overview' && <><div className="customer-kpis"><Kpi label="Yetkili şube" value={summary.branches.length} detail={summary.scope === 'Branch' ? 'Şube kapsamlı hesap' : 'Çatı müşteri hesabı'} icon={<Building2 />} /><Kpi label="Yaklaşan hizmet" value={summary.upcomingWorkOrders.length} detail="Planlanan ve sahadaki" icon={<CalendarDays />} /><Kpi label="İmzalı rapor" value={reports.length} detail="Yayınlanan hizmet raporu" icon={<FileCheck2 />} /><Kpi label="Açık çağrı" value={openRequests} detail="Takip edilen talep" icon={<ShieldAlert />} /></div>
          <div className="customer-layout"><section className="role-surface upcoming-service"><div className="role-section-title"><div><p>YAKLAŞAN HİZMET</p><h2>Bir sonraki uygulama</h2></div></div>{summary.upcomingWorkOrders[0] ? <ServiceCard item={summary.upcomingWorkOrders[0]} /> : <Empty icon={<CalendarDays />} text="Planlanmış yaklaşan hizmet bulunmuyor." />}</section>
          <section className="role-surface recent-documents"><div className="role-section-title"><div><p>BELGELER</p><h2>Son hizmet raporları</h2></div><button onClick={() => setTab('reports')}>Tüm raporlar</button></div>{sortedReports.slice(0, 3).map((report) => <button className="document-row customer-document-button" key={report.id} disabled={previewLoadingId === report.id} onClick={() => void openReport(report)}><span><FileText size={18} /></span><div><strong>{report.branchName}</strong><small>{formatReportDate(report.scheduledAt)} · {report.reportNumber}</small></div><Printer size={17} /></button>)}{reports.length === 0 && <Empty icon={<FileText />} text="Henüz yayınlanmış rapor yok." />}</section></div></>}
        {tab === 'services' && <section className="role-surface customer-list-surface"><div className="role-section-title"><div><p>HİZMET GEÇMİŞİ</p><h2>Planlanan ve tamamlanan işler</h2></div></div><div className="customer-service-list">{allServices.map((item) => <ServiceCard key={item.id} item={item} />)}{allServices.length === 0 && <Empty icon={<CalendarDays />} text="Hizmet kaydı bulunmuyor." />}</div></section>}
        {tab === 'stations' && <section className="role-surface customer-list-surface">
          <div className="role-section-title"><div><p>İSTASYON İZLEME</p><h2>Sahada tanımlı istasyonlar ve kontrol durumları</h2></div></div>
          {stationDetailsError && <div className="field-operation-error"><AlertTriangle size={16} /><span>{stationDetailsError}</span></div>}
          {stationActivations.length > 0 ? <div className="customer-station-activations">{stationActivations.map((activation) => {
            const detail = stationActivationDetails[activation.id];
            return <article key={activation.id} className="customer-station-card"><header><div><strong>{activation.branchName}</strong><small>{activation.workOrderNumber} · {activation.operatorName} · {formatDate(activation.scheduledAt)}</small></div><em>{activation.status === 'Finalized' ? 'Onaylandı' : 'Taslak'}</em></header><div className="customer-station-stats"><span><strong>{activation.totalStations}</strong> toplam</span><span className="activity"><strong>{activation.activeStations}</strong> aktivite</span><span className="damaged"><strong>{activation.damagedStations}</strong> hasarlı</span><span className="inaccessible"><strong>{activation.inaccessibleStations}</strong> ulaşılamadı</span></div>{detail ? <><div className="customer-station-list">{detail.stations.map((station, i) => <div key={i} className={`customer-station-row status-${station.deviceStatus.toLowerCase()}`}><strong>{station.deviceNumber}</strong><span>{station.area}</span><em>{stationStatusLabel(station.deviceStatus)}</em></div>)}</div>{detail.notes && <p className="customer-station-note">{detail.notes}</p>}</> : <p className="customer-station-note">{stationDetailsLoading ? 'İstasyon detayları yükleniyor…' : 'İstasyon özeti gösteriliyor; detay şu anda alınamadı.'}</p>}</article>;
          })}</div> : <Empty icon={<FileCheck2 />} text="Henüz sahada istasyon tanımı yapılmamış." />}
        </section>}
        {tab === 'commercial' && commercial && <CustomerCommercialCenter data={commercial} token={session.accessToken} onChanged={(proposal) => setCommercial((current) => current ? { ...current, pendingProposalCount: current.pendingProposalCount - 1, proposals: current.proposals.map((item) => item.id === proposal.id ? proposal : item) } : current)} />}
        {tab === 'health' && <section className="role-surface customer-health-surface"><HealthWasteCenter accessToken={session.accessToken} mode="customer" onSessionExpired={onLogout} /></section>}
        {tab === 'weather' && <WeatherRiskPanel overview={weatherRisk} loading={loading} error={error} onRefresh={() => void load(true)} />}
        {tab === 'reports' && (
          <section className="role-surface customer-list-surface">
            <div className="role-section-title">
              <div>
                <p>RESMİ BELGELER</p>
                <h2>İmzalı hizmet raporları ({sortedReports.length})</h2>
              </div>
            </div>
            <div className="customer-report-grid">
              {sortedReports.map((report) => (
                <article key={report.id} className="customer-report-card">
                  <div className="customer-report-card-top">
                    <div className="customer-report-date-block">
                      <CalendarDays size={18} className="customer-report-date-icon" />
                      <div>
                        <strong className="customer-report-main-date">{formatReportDate(report.scheduledAt)}</strong>
                        <small className="customer-report-sub-day">{formatReportDayOfWeek(report.scheduledAt)}</small>
                      </div>
                    </div>
                    <span className="customer-report-code-badge">{report.reportNumber}</span>
                  </div>

                  <div className="customer-report-meta-row">
                    <div className="customer-report-branch-info">
                      <MapPin size={14} color="#64748b" />
                      <span>{report.branchName || 'Merkez Şube'}</span>
                    </div>
                    <div className="customer-report-stats-strip">
                      <span><strong>{report.totalStations}</strong> İstasyon</span>
                      <span>·</span>
                      <span className={report.activityRate > 0 ? 'activity-alert' : 'activity-clean'}>
                        %{report.activityRate} Aktivite
                      </span>
                    </div>
                  </div>

                  <div className="customer-report-actions">
                    <button type="button" disabled={previewLoadingId === report.id} onClick={() => void openReport(report)}>
                      <Printer size={15} /> {previewLoadingId === report.id ? 'Yükleniyor…' : 'Görüntüle'}
                    </button>
                    <button type="button" onClick={() => void downloadReport(report)}>
                      <Download size={15} /> PDF
                    </button>
                    <button type="button" onClick={() => void shareReport(report)}>
                      <Share2 size={15} /> Paylaş
                    </button>
                  </div>
                </article>
              ))}
              {sortedReports.length === 0 && <Empty icon={<FileText />} text="Henüz yayınlanmış rapor yok." />}
            </div>
          </section>
        )}
        {tab === 'documents' && <QualityCenter accessToken={session.accessToken} mode="customer" onSessionExpired={onLogout} />}
        {tab === 'actions' && <CorrectiveActionCenter accessToken={session.accessToken} mode="customer" onSessionExpired={onLogout} />}
        {tab === 'requests' && <section className="role-surface customer-list-surface"><div className="role-section-title"><div><p>TALEP & ŞİKÂYET MERKEZİ</p><h2>Talepler, mesajlar ve kapanış onayı</h2></div><button className="role-primary-button" onClick={() => setRequestOpen(true)}><Plus size={16} /> Yeni talep</button></div><div className="emergency-request-list">{summary.emergencyRequests.map((item) => <CustomerRequestCard key={item.id} item={item} token={session.accessToken} onUpdated={updateRequest} />)}{summary.emergencyRequests.length === 0 && <Empty icon={<ShieldAlert />} text="Henüz talep bulunmuyor." />}</div></section>}
        {tab === 'account' && <div className="portal-account-page"><PasswordChangeCard accessToken={session.accessToken} onSessionExpired={onLogout} /></div>}
      </>}
      <PortalFooter />
    </main>
    {requestOpen && summary && <EmergencyRequestModal summary={summary} onClose={() => setRequestOpen(false)} onSubmit={submitRequest} />}
    {preview && <div className="modal-layer report-preview-layer"><div className="report-preview-dialog"><div className="report-preview-toolbar"><div><strong>{preview.reportNumber}</strong><span>{preview.customerName} · {preview.branchName}</span></div><button onClick={() => void downloadReport(preview)}><Download size={16} /> PDF İndir</button><button onClick={() => void shareReport(preview)}><Share2 size={16} /> Paylaş</button><button onClick={print}><Printer size={16} /> Yazdır</button><button className="icon-button" onClick={() => setPreview(null)}><X size={19} /></button></div><div className="report-print-canvas"><div ref={printRef}><ServiceReportPrintSheet report={preview} accessToken={session.accessToken} /></div></div></div></div>}
  </div>;
}

function EmergencyRequestModal({ summary, onClose, onSubmit }: { summary: CustomerPortalSummary; onClose: () => void; onSubmit: (input: CreateEmergencyRequestInput) => Promise<void> }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const [dueAt, setDueAt] = useState('');
  const [dateMode, setDateMode] = useState<'today'|'tomorrow'|'custom'>('custom');

  const setShortcut = (days: number, mode: 'today'|'tomorrow') => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(12, 0, 0, 0);
    const tzoffset = d.getTimezoneOffset() * 60000;
    const localISOTime = new Date(d.getTime() - tzoffset).toISOString().slice(0,16);
    setDueAt(localISOTime);
    setDateMode(mode);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); const requestType = String(data.get('requestType')) as CreateEmergencyRequestInput['requestType']; setSaving(true); setError(null); try { await onSubmit({ branchId: String(data.get('branchId') || '') || undefined, requestType, subject: String(data.get('subject')), serviceType: requestType === 'EmergencyCall' ? String(data.get('serviceType')) as CreateEmergencyRequestInput['serviceType'] : 'Standard', priority: String(data.get('priority')) as CreateEmergencyRequestInput['priority'], contactPhone: String(data.get('contactPhone') || '') || undefined, dueAt: String(data.get('dueAt') || '') ? new Date(String(data.get('dueAt'))).toISOString() : undefined, requestedAppointmentAt: String(data.get('requestedAppointmentAt') || '') ? new Date(String(data.get('requestedAppointmentAt'))).toISOString() : undefined, description: String(data.get('description')) }); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Talep oluşturulamadı.'); } finally { setSaving(false); } };
  return <div className="modal-layer"><div className="modal emergency-request-modal"><div className="modal-header"><div><p className="eyebrow">TALEP & ŞİKÂYET MERKEZİ</p><h2>Yeni müşteri talebi</h2><p>Talebiniz öncelik, termin, sorumlu ve mesaj geçmişiyle izlenir.</p></div><button className="icon-button" onClick={onClose}><X /></button></div><form onSubmit={submit}><div className="form-grid"><label>Şube<select name="branchId"><option value="">Merkez / Genel</option>{summary.branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name}</option>)}</select></label><label>Talep türü<select name="requestType"><option value="EmergencyCall">Acil çağrı</option><option value="Complaint">Şikâyet</option><option value="NewBranch">Yeni şube talebi</option><option value="AppointmentChange">Randevu değişikliği</option><option value="DocumentRequest">Belge talebi</option><option value="StructuralCompletion">Yapısal faaliyet tamamlandı</option></select></label><label className="form-field-wide">Konu<input name="subject" required minLength={3} placeholder="Talebi kısa ve anlaşılır biçimde özetleyin" /></label><label>Öncelik<select name="priority"><option value="Normal">Normal</option><option value="Urgent">Acil</option><option value="Critical">Kritik</option><option value="Low">Düşük</option></select></label><label>Acil çağrı ücret türü<select name="serviceType"><option value="EmergencyFree">Ücretsiz acil çağrı</option><option value="EmergencyPaid">Ücretli acil çağrı</option></select></label><label>İstenen termin<div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}><button type="button" onClick={() => setShortcut(0, 'today')} className={dateMode === 'today' ? 'primary-button' : 'secondary-button'} style={{ flex: 1, padding: '7px 0', minHeight: '34px', fontSize: '10px' }}>Bugün</button><button type="button" onClick={() => setShortcut(1, 'tomorrow')} className={dateMode === 'tomorrow' ? 'primary-button' : 'secondary-button'} style={{ flex: 1, padding: '7px 0', minHeight: '34px', fontSize: '10px' }}>Yarın</button><button type="button" onClick={() => setDateMode('custom')} className={dateMode === 'custom' ? 'primary-button' : 'secondary-button'} style={{ flex: 1, padding: '7px 0', minHeight: '34px', fontSize: '10px' }}>Farklı Tarih</button></div>{dateMode === 'custom' && <input name="dueAt" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />}{dateMode !== 'custom' && <input type="hidden" name="dueAt" value={dueAt} />}</label><label>Yeni randevu tarihi<input name="requestedAppointmentAt" type="datetime-local" /></label><label>İletişim telefonu<input name="contactPhone" type="tel" /></label><label className="form-field-wide">Açıklama<textarea name="description" required minLength={10} maxLength={2000} rows={5} placeholder="Talebinizi, ilgili alanı ve beklediğiniz sonucu açıklayın." /></label></div>{error && <div className="modal-form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Vazgeç</button><button className="primary-button" disabled={saving}><ShieldAlert size={16} /> {saving ? 'Gönderiliyor…' : 'Talebi Gönder'}</button></div></form></div></div>;
}

function CustomerRequestCard({ item, token, onUpdated }: { item: EmergencyRequestRecord; token: string; onUpdated: (item: EmergencyRequestRecord) => void }) { const [open,setOpen]=useState(false); const [message,setMessage]=useState(''); return <article className={`priority-${item.priority.toLowerCase()} customer-request-card`}><button className="customer-request-summary" onClick={()=>setOpen((value)=>!value)}><div><span>{item.number} · {requestTypeLabel(item.requestType)}</span><strong>{item.subject}</strong><small>{item.branchName} · {formatDateTime(item.requestedAt)} · {priorityLabel(item.priority)}</small></div><div><em>{statusLabel(item.status)}</em><span>Atanan: {item.employeeName}</span></div></button>{open&&<div className="customer-request-detail"><p>{item.description}</p>{item.dueAt&&<small>Termin: {formatDateTime(item.dueAt)}</small>}<div className="customer-request-thread">{item.history.map((history,index)=><div key={`${history.occurredAt}-${index}`}><strong>{history.changedBy}</strong><span>{history.note||statusLabel(history.status)}</span><small>{formatDateTime(history.occurredAt)}</small></div>)}</div><form onSubmit={async(event)=>{event.preventDefault();if(!message.trim())return;onUpdated(await addCustomerRequestMessage(token,item.id,message));setMessage('');}}><input value={message} onChange={(event)=>setMessage(event.target.value)} placeholder="Mesaj yazın…"/><button>Gönder</button></form>{item.closureApprovalStatus==='Pending'&&<div className="closure-approval"><strong>İşlem kapanış onayınızı bekliyor.</strong><button onClick={async()=>onUpdated(await approveCustomerRequestClosure(token,item.id,true))}>Onayla ve kapat</button><button onClick={async()=>onUpdated(await approveCustomerRequestClosure(token,item.id,false,'İşlem tamamlanmadı.'))}>Reddet</button></div>}</div>}</article> }
function requestTypeLabel(value:string){return ({EmergencyCall:'Acil çağrı',Complaint:'Şikâyet',NewBranch:'Yeni şube',AppointmentChange:'Randevu değişikliği',DocumentRequest:'Belge talebi',StructuralCompletion:'Yapısal faaliyet'}as Record<string,string>)[value]??value}

function ServiceCard({ item }: { item: CustomerPortalSummary['upcomingWorkOrders'][number] }) { return <article className="customer-service-card"><span className={`service-status status-${item.status.toLowerCase()}`}>{statusLabel(item.status)}</span><div><strong>{item.branchName}</strong><small>{item.serviceType} · {item.employeeName}</small></div><div className="service-meta"><span><Clock3 size={15} />{formatDateTime(item.scheduledAt)} · plan {item.durationMinutes} dk.</span>{item.customerDurationMinutes ? <span><CheckCircle2 size={15} />Müşteride geçirilen süre: {formatMinutes(item.customerDurationMinutes)}{item.totalLaborMinutes > item.customerDurationMinutes ? ` · ekip emeği ${formatMinutes(item.totalLaborMinutes)}` : ''}</span> : null}</div>{item.completionNote && <p><CheckCircle2 size={15} />{item.completionNote}</p>}</article>; }
function Kpi({ label, value, detail, icon }: { label: string; value: number; detail: string; icon: React.ReactNode }) { return <article><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>{icon}</article>; }
function Empty({ icon, text }: { icon: React.ReactNode; text: string }) { return <div className="customer-empty">{icon}<span>{text}</span></div>; }
function PortalState({ icon, text, action }: { icon: React.ReactNode; text: string; action?: () => void }) { return <div className="role-surface customer-portal-state">{icon}<strong>{text}</strong>{action && <button onClick={action}>Tekrar dene</button>}</div>; }
function formatDate(value: string) { return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(value)); }
function formatDateTime(value: string) { return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function formatReportDate(value?: string | null) {
  if (!value) return 'Tarih belirtilmedi';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
  } catch {
    return value;
  }
}
function formatReportDayOfWeek(value?: string | null) {
  if (!value) return '';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('tr-TR', { weekday: 'long' }).format(d);
  } catch {
    return '';
  }
}
function formatMinutes(minutes: number) { return minutes < 60 ? `${minutes} dk.` : `${Math.floor(minutes / 60)} sa. ${minutes % 60} dk.`; }
function formatDuration(start: string, end: string) { const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)); return minutes < 60 ? `${minutes} dk.` : `${Math.floor(minutes / 60)} sa. ${minutes % 60} dk.`; }
function statusLabel(value: string) { return ({ New: 'Yeni', Acknowledged: 'Kabul edildi', Planned: 'Planlandı', Completed: 'Tamamlandı', Cancelled: 'İptal', InProgress: 'İşlemde', AwaitingCustomerApproval: 'Onayınız bekleniyor' } as Record<string,string>)[value] ?? value; }
function priorityLabel(value: string) { return ({ Low: 'Düşük', Normal: 'Normal', Urgent: 'Acil', Critical: 'Kritik' } as Record<string,string>)[value] ?? value; }
function stationStatusLabel(value: string) { return ({ Unchecked: 'Kontrol bekliyor', NoActivity: 'Aktivite yok', Activity: 'Aktivite var', Damaged: 'Kırık / hasarlı', Inaccessible: 'Ulaşılamadı' } as Record<string,string>)[value] ?? value; }
