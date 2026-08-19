import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, BarChart3, Boxes, CheckCircle2, ClipboardCheck, Clock3, Download, FilePlus2, FileSpreadsheet, FileText, FilterX, FlaskConical, Gauge, PackageCheck, Printer, RefreshCw, Search, Share2, ShieldAlert, Users, X } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { WorkOrder } from '../types';
import ServiceReportModal from '../components/modals/ServiceReportModal';
import StationActivationModal from '../components/modals/StationActivationModal';
import ServiceReportPrintSheet from '../components/report/ServiceReportPrintSheet';
import MonthlyBiocideReportPrintSheet from '../components/report/MonthlyBiocideReportPrintSheet';
import { FieldSessionExpiredError, getWorkforceAnalytics, type WorkforceAnalytics } from '../services/fieldOperationsApi';
import { getCompanyServiceReports, getServiceReportAnalytics, ReportSessionExpiredError, saveServiceReport, uploadServiceReportPhotos, type ReportPhotoUpload, type ServiceReportAnalytics, type ServiceReportRecord, type UpsertServiceReportInput } from '../services/serviceReportApi';
import { exportMonthlyBiocideExcel, exportServiceReportExcel, exportTrendExcel } from '../utils/serviceReportExcel';
import { getVehicles, type VehicleRecord } from '../services/inventoryApi';
import { getStationActivations, type StationActivationRecord } from '../services/stationActivationApi';
import { shareOrDownloadFile } from '../utils/shareUtils';

type Props = { accessToken: string; companyName: string; userName: string; workOrders: WorkOrder[]; onSessionExpired: () => void };
type Tab = 'reports' | 'activations' | 'biocides' | 'trends' | 'workforce';

export default function ReportsAnalytics({ accessToken, companyName, userName, workOrders, onSessionExpired }: Props) {
  const [tab, setTab] = useState<Tab>('reports');
  const [reports, setReports] = useState<ServiceReportRecord[]>([]); const [analytics, setAnalytics] = useState<ServiceReportAnalytics | null>(null); const [workforce, setWorkforce] = useState<WorkforceAnalytics | null>(null);
  const [activations, setActivations] = useState<StationActivationRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const [editing, setEditing] = useState<{ order: WorkOrder; report?: ServiceReportRecord } | null>(null); const [preview, setPreview] = useState<ServiceReportRecord | null>(null);
  const [activationOrder, setActivationOrder] = useState<WorkOrder | null>(null);
  const [biocidePrintMonth, setBiocidePrintMonth] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState(''); const [branchId, setBranchId] = useState(''); const [from, setFrom] = useState(defaultFrom()); const [to, setTo] = useState(dateKey(new Date()));
  const [isDownloadingBiocidePdf, setIsDownloadingBiocidePdf] = useState(false);
  const printRef = useRef<HTMLDivElement>(null); const print = useReactToPrint({ contentRef: printRef, documentTitle: preview ? `${preview.reportNumber}_${preview.branchName}` : 'Pestneer_Saha_Raporu' });
  const biocidePrintRef = useRef<HTMLDivElement>(null); const biocidePrint = useReactToPrint({ contentRef: biocidePrintRef, documentTitle: biocidePrintMonth ? `Pestneer_Aylik_Biyosidal_Tuketim_${biocidePrintMonth}` : 'Pestneer_Aylik_Biyosidal_Raporu' });

  const downloadBiocidePdf = async () => {
    if (!biocidePrintRef.current) return;
    setIsDownloadingBiocidePdf(true);
    try {
      const element = biocidePrintRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = pdfHeight;
      let position = 0;
      const pageHeight = pdf.internal.pageSize.getHeight();

      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`Pestneer_Aylik_Biyosidal_Tuketim_${biocidePrintMonth || 'Raporu'}.pdf`);
    } catch (err) {
      console.error('Biocide PDF download error:', err);
      biocidePrint();
    } finally {
      setIsDownloadingBiocidePdf(false);
    }
  };

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const query = new URLSearchParams({ from, to }); if (customerId) query.set('customerId', customerId); if (branchId) query.set('branchId', branchId);
      const [reportItems, activationItems, reportAnalytics, workforceAnalytics, vehicleItems] = await Promise.all([getCompanyServiceReports(accessToken), getStationActivations(accessToken), getServiceReportAnalytics(accessToken, query.toString()), getWorkforceAnalytics(accessToken), getVehicles(accessToken)]);
      setReports(reportItems); setActivations(activationItems); setAnalytics(reportAnalytics); setWorkforce(workforceAnalytics); setVehicles(vehicleItems);
    } catch (loadError) {
      if (loadError instanceof ReportSessionExpiredError || loadError instanceof FieldSessionExpiredError) return onSessionExpired();
      setError(loadError instanceof Error ? loadError.message : 'Rapor verileri yüklenemedi.');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [accessToken, customerId, branchId, from, to]);

  const customers = useMemo(() => Array.from(new Map(workOrders.map((item) => [item.customerId, { id: item.customerId, name: item.client }])).values()), [workOrders]);
  const branches = useMemo(() => Array.from(new Map(workOrders.filter((item) => !customerId || item.customerId === customerId).filter((item) => item.branchId).map((item) => [item.branchId!, { id: item.branchId!, name: item.branch }])).values()), [workOrders, customerId]);
  const reportByOrder = useMemo(() => new Map(reports.map((item) => [item.workOrderId, item])), [reports]);
  const activationByOrder = useMemo(() => new Map(activations.map((item) => [item.workOrderId, item])), [activations]);
  const reportableOrders = workOrders.filter((item) => item.technicalStatus === 'InProgress' || item.technicalStatus === 'Completed');
  const save = async (input: UpsertServiceReportInput, photos: ReportPhotoUpload[]) => { if (!editing) return; const saved = await saveServiceReport(accessToken, editing.order.recordId, input); await uploadServiceReportPhotos(accessToken, editing.order.recordId, photos); setReports((current) => [saved, ...current.filter((item) => item.id !== saved.id)]); setEditing(null); await load(); };

  return <section className="page analytics-page phase3-reports-page">
    <div className="page-heading"><div><p className="eyebrow">SAHA KALİTE & UYUM</p><h1>Rapor & Analizler</h1><p>Uygulama raporlarını, saha trendlerini ve personel performansını tek merkezden yönetin.</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCw size={16} />Verileri Yenile</button></div>
    <nav className="report-module-tabs">
      <button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}><FileText size={17} /> EK-1 Raporları</button>
      <button className={tab === 'activations' ? 'active' : ''} onClick={() => setTab('activations')}><ClipboardCheck size={17} /> Aktivasyon Listeleri</button>
      <button className={tab === 'biocides' ? 'active' : ''} onClick={() => setTab('biocides')}><PackageCheck size={17} /> Biyosidal & Sarf Raporu</button>
      <button className={tab === 'trends' ? 'active' : ''} onClick={() => setTab('trends')}><BarChart3 size={17} /> Trend Analizi</button>
      <button className={tab === 'workforce' ? 'active' : ''} onClick={() => setTab('workforce')}><Users size={17} /> Personel Analizi</button>
    </nav>
    {loading ? <div className="surface analytics-loading"><RefreshCw className="spin-icon" size={28} />Analizler hazırlanıyor…</div> : error ? <div className="surface analytics-loading analytics-error">{error}<button className="secondary-button" onClick={() => void load()}>Tekrar Dene</button></div> : <>
      {tab === 'reports' && <ReportsTab orders={reportableOrders} reportByOrder={reportByOrder} onEdit={(order, report) => setEditing({ order, report })} onPreview={setPreview} />}
      {tab === 'activations' && <ActivationsTab orders={reportableOrders} activationByOrder={activationByOrder} onOpen={setActivationOrder} />}
      {tab === 'biocides' && <BiocidesTab reports={reports} activations={activations} customers={customers} companyName={companyName} onPrint={(m) => setBiocidePrintMonth(m)} />}
      {tab === 'trends' && analytics && <TrendsTab analytics={analytics} reports={reports} customers={customers} branches={branches} customerId={customerId} branchId={branchId} from={from} to={to} onCustomer={(value) => { setCustomerId(value); setBranchId(''); }} onBranch={setBranchId} onFrom={setFrom} onTo={setTo} />}
      {tab === 'workforce' && workforce && <WorkforceTab analytics={workforce} />}
    </>}
    {editing && <ServiceReportModal accessToken={accessToken} order={editing.order} existing={editing.report} companyName={companyName} operatorName={editing.order.technician || userName} vehicleStockItems={(vehicles.find((item) => item.assignedEmployeeAccountId === editing.order.employeeAccountId)?.stockItems ?? []).map((item) => ({ id: item.id, vehicleStockItemId: item.id, inventoryItemId: item.inventoryItemId, productName: item.productName, quantity: item.quantity, unit: item.unit, isManual: item.isManual, licenseNumber: item.licenseNumber, licenseDocumentId: item.licenseDocumentId }))} onClose={() => setEditing(null)} onSave={save} />}
    {activationOrder && <StationActivationModal accessToken={accessToken} order={activationOrder} onClose={() => setActivationOrder(null)} onSaved={(saved) => setActivations((current) => [saved, ...current.filter((item) => item.id !== saved.id)])} />}
    {preview && <div className="modal-layer report-preview-layer"><div className="report-preview-dialog"><div className="report-preview-toolbar"><div><strong>{preview.reportNumber}</strong><span>{preview.customerName} · {preview.branchName}</span></div><button onClick={() => exportServiceReportExcel(preview)}><FileSpreadsheet size={16} /> Excel</button><button onClick={print}><Printer size={16} /> PDF / Yazdır</button><button onClick={() => void shareOrDownloadFile({ title: `${preview.reportNumber} - EK-1 Hizmet Raporu`, text: `${preview.customerName} · ${preview.branchName} - ${preview.reportNumber} nolu EK-1 Hizmet Raporu`, url: window.location.href })}><Share2 size={16} /> Paylaş</button><button className="icon-button" onClick={() => setPreview(null)}><X size={19} /></button></div><div className="report-print-canvas"><div ref={printRef}><ServiceReportPrintSheet report={preview} accessToken={accessToken} /></div></div></div></div>}
    {biocidePrintMonth && (
      <div className="modal-layer report-preview-layer">
        <div className="report-preview-dialog" style={{ maxWidth: '860px' }}>
          <div className="report-preview-toolbar">
            <div>
              <strong>Aylık Biyosidal ve Sarf Tüketim Raporu</strong>
              <span>{biocidePrintMonth} Dönemi Resmi T.C. Sağlık Bakanlığı İcmali</span>
            </div>
            <button
              type="button"
              className="primary-button"
              disabled={isDownloadingBiocidePdf}
              onClick={() => void downloadBiocidePdf()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#0284c7', borderColor: '#0284c7', color: '#fff', padding: '0 12px', minHeight: '36px', borderRadius: '6px', fontWeight: 700, fontSize: '11px', cursor: 'pointer' }}
            >
              <Download size={16} /> {isDownloadingBiocidePdf ? 'PDF Hazırlanıyor…' : 'PDF İndir'}
            </button>
            <button type="button" onClick={biocidePrint} title="Yazdır">
              <Printer size={16} /> Yazdır
            </button>
            <button
              type="button"
              onClick={() => void shareOrDownloadFile({
                title: 'Aylık Biyosidal Tüketim Raporu',
                text: `${companyName} - ${biocidePrintMonth} Aylık Biyosidal ve Sarf Tüketim Raporu`,
                url: window.location.href,
              })}
              title="Paylaş"
            >
              <Share2 size={16} /> Paylaş
            </button>
            <button className="icon-button" onClick={() => setBiocidePrintMonth(null)}><X size={19} /></button>
          </div>
          <div className="report-print-canvas">
            <div ref={biocidePrintRef}>
              <MonthlyBiocideReportPrintSheet accessToken={accessToken} companyName={companyName} monthKey={biocidePrintMonth} reports={reports} activations={activations} />
            </div>
          </div>
        </div>
      </div>
    )}
  </section>;
}

function ActivationsTab({ orders, activationByOrder, onOpen }: { orders: WorkOrder[]; activationByOrder: Map<string, StationActivationRecord>; onOpen: (order: WorkOrder) => void }) {
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'missing' | 'draft' | 'finalized'>('all');
  const [techFilter, setTechFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const customers = useMemo(() => Array.from(new Map(orders.map((o) => [o.customerId || o.client, { id: o.customerId || o.client, name: o.client }])).values()).sort((a, b) => a.name.localeCompare(b.name, 'tr')), [orders]);
  const branches = useMemo(() => Array.from(new Map(orders.filter((o) => !customerFilter || o.customerId === customerFilter || o.client === customerFilter).filter((o) => o.branch).map((o) => [o.branchId || o.branch, { id: o.branchId || o.branch, name: o.branch }])).values()).sort((a, b) => a.name.localeCompare(b.name, 'tr')), [orders, customerFilter]);
  const technicians = useMemo(() => Array.from(new Set(orders.map((o) => o.technician).filter(Boolean))).sort() as string[], [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const act = activationByOrder.get(order.recordId);
      const status = act?.status === 'Finalized' ? 'finalized' : act ? 'draft' : 'missing';

      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (customerFilter && order.customerId !== customerFilter && order.client !== customerFilter) return false;
      if (branchFilter && order.branchId !== branchFilter && order.branch !== branchFilter) return false;
      if (techFilter && order.technician !== techFilter) return false;
      if (dateFrom && order.date < dateFrom) return false;
      if (dateTo && order.date > dateTo) return false;

      if (search.trim()) {
        const q = search.trim().toLocaleLowerCase('tr-TR');
        const text = `${order.client} ${order.branch} ${order.id} ${order.technician ?? ''}`.toLocaleLowerCase('tr-TR');
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [orders, activationByOrder, statusFilter, customerFilter, branchFilter, techFilter, dateFrom, dateTo, search]);

  const hasFilters = Boolean(search || customerFilter || branchFilter || statusFilter !== 'all' || techFilter || dateFrom || dateTo);
  const clearFilters = () => { setSearch(''); setCustomerFilter(''); setBranchFilter(''); setStatusFilter('all'); setTechFilter(''); setDateFrom(''); setDateTo(''); };

  return <div className="surface field-report-list">
    <div className="analytics-section-heading">
      <div>
        <p className="eyebrow">İSTASYON BAZLI SAHA KONTROLÜ</p>
        <h2>Bağımsız aktivasyon listeleri</h2>
        <p>İstasyon bulunan işlerde kullanılır; EK-1 biyosidal uygulama raporundan tamamen bağımsızdır.</p>
      </div>
      <span>{filteredOrders.length} / {orders.length} iş emri</span>
    </div>

    {/* Filter Toolbar */}
    <div className="surface document-filter-panel" style={{ margin: '0 0 18px 0' }}>
      <label className="document-search">
        <span>Arama</span>
        <i><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Müşteri, şube, iş emri veya personel…" /></i>
      </label>
      <label>
        Müşteri
        <select value={customerFilter} onChange={(e) => { setCustomerFilter(e.target.value); setBranchFilter(''); }}>
          <option value="">Tüm Müşteriler</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>
        Şube
        <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
          <option value="">Tüm Şubeler</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label>
        Liste Durumu
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
          <option value="all">Tüm Durumlar</option>
          <option value="missing">Liste Bekliyor</option>
          <option value="draft">Taslak</option>
          <option value="finalized">Onaylandı</option>
        </select>
      </label>
      <label>
        Personel
        <select value={techFilter} onChange={(e) => setTechFilter(e.target.value)}>
          <option value="">Tüm Personel</option>
          {technicians.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label>
        Başlangıç
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
      </label>
      <label>
        Bitiş
        <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} />
      </label>
      <div className="document-filter-summary">
        <span><strong>{filteredOrders.length}</strong> / {orders.length} kayıt</span>
        <button type="button" disabled={!hasFilters} onClick={clearFilters}><FilterX size={15} /> Temizle</button>
      </div>
    </div>

    {filteredOrders.length === 0 ? (
      <div className="analytics-empty"><ClipboardCheck size={31} /><strong>Filtrelere uygun aktivasyon işi bulunamadı</strong><span>Filtreleri temizleyerek tüm işleri listeleyebilirsiniz.</span></div>
    ) : (
      <div className="field-report-grid">
        {filteredOrders.map((order) => {
          const activation = activationByOrder.get(order.recordId);
          return <article key={order.recordId}>
            <div className="field-report-heading">
              <span className={`report-state ${activation?.status.toLowerCase() ?? 'missing'}`}>{activation?.status === 'Finalized' ? 'Onaylandı' : activation ? 'Taslak' : 'Liste yok'}</span>
              <small>{order.id}</small>
            </div>
            <h3>{order.client}</h3>
            <p>{order.branch}</p>
            <dl>
              <div><dt>Personel</dt><dd>{order.technician}</dd></div>
              <div><dt>Tarih</dt><dd>{order.date}</dd></div>
              {activation && <><div><dt>Kontrol</dt><dd>{activation.totalStations} istasyon</dd></div><div><dt>Aktivite</dt><dd>{activation.activeStations} istasyon</dd></div></>}
            </dl>
            <div className="field-report-actions">
              <button className="primary-button" onClick={() => onOpen(order)}><ClipboardCheck size={15} /> {activation ? 'Listeyi aç' : 'Aktivasyon oluştur'}</button>
            </div>
          </article>;
        })}
      </div>
    )}
  </div>;
}

function ReportsTab({ orders, reportByOrder, onEdit, onPreview }: { orders: WorkOrder[]; reportByOrder: Map<string, ServiceReportRecord>; onEdit: (order: WorkOrder, report?: ServiceReportRecord) => void; onPreview: (report: ServiceReportRecord) => void }) {
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'missing' | 'draft' | 'finalized'>('all');
  const [techFilter, setTechFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const customers = useMemo(() => Array.from(new Map(orders.map((o) => [o.customerId || o.client, { id: o.customerId || o.client, name: o.client }])).values()).sort((a, b) => a.name.localeCompare(b.name, 'tr')), [orders]);
  const branches = useMemo(() => Array.from(new Map(orders.filter((o) => !customerFilter || o.customerId === customerFilter || o.client === customerFilter).filter((o) => o.branch).map((o) => [o.branchId || o.branch, { id: o.branchId || o.branch, name: o.branch }])).values()).sort((a, b) => a.name.localeCompare(b.name, 'tr')), [orders, customerFilter]);
  const technicians = useMemo(() => Array.from(new Set(orders.map((o) => o.technician).filter(Boolean))).sort() as string[], [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const report = reportByOrder.get(order.recordId);
      const status = report?.status === 'Finalized' ? 'finalized' : report ? 'draft' : 'missing';

      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (customerFilter && order.customerId !== customerFilter && order.client !== customerFilter) return false;
      if (branchFilter && order.branchId !== branchFilter && order.branch !== branchFilter) return false;
      if (techFilter && order.technician !== techFilter) return false;
      if (dateFrom && order.date < dateFrom) return false;
      if (dateTo && order.date > dateTo) return false;

      if (search.trim()) {
        const q = search.trim().toLocaleLowerCase('tr-TR');
        const text = `${order.client} ${order.branch} ${order.id} ${order.technician ?? ''} ${report?.reportNumber ?? ''}`.toLocaleLowerCase('tr-TR');
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [orders, reportByOrder, statusFilter, customerFilter, branchFilter, techFilter, dateFrom, dateTo, search]);

  const hasFilters = Boolean(search || customerFilter || branchFilter || statusFilter !== 'all' || techFilter || dateFrom || dateTo);
  const clearFilters = () => { setSearch(''); setCustomerFilter(''); setBranchFilter(''); setStatusFilter('all'); setTechFilter(''); setDateFrom(''); setDateTo(''); };

  return <div className="surface field-report-list">
    <div className="analytics-section-heading">
      <div>
        <p className="eyebrow">UYGULAMA KAYITLARI</p>
        <h2>Saha hizmet raporları (EK-1)</h2>
        <p>Biyosidal uygulama raporlarını müşteri, şube, durum veya tarihe göre filtreleyin.</p>
      </div>
      <span>{filteredOrders.length} / {orders.length} raporlanabilir iş</span>
    </div>

    {/* Filter Toolbar */}
    <div className="surface document-filter-panel" style={{ margin: '0 0 18px 0' }}>
      <label className="document-search">
        <span>Arama</span>
        <i><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Müşteri, şube, iş emri, rapor no…" /></i>
      </label>
      <label>
        Müşteri
        <select value={customerFilter} onChange={(e) => { setCustomerFilter(e.target.value); setBranchFilter(''); }}>
          <option value="">Tüm Müşteriler</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>
        Şube
        <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
          <option value="">Tüm Şubeler</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <label>
        Rapor Durumu
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
          <option value="all">Tüm Durumlar</option>
          <option value="missing">Rapor Bekliyor</option>
          <option value="draft">Taslak</option>
          <option value="finalized">Onaylandı</option>
        </select>
      </label>
      <label>
        Uygulayıcı
        <select value={techFilter} onChange={(e) => setTechFilter(e.target.value)}>
          <option value="">Tüm Personel</option>
          {technicians.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label>
        Başlangıç
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
      </label>
      <label>
        Bitiş
        <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} />
      </label>
      <div className="document-filter-summary">
        <span><strong>{filteredOrders.length}</strong> / {orders.length} kayıt</span>
        <button type="button" disabled={!hasFilters} onClick={clearFilters}><FilterX size={15} /> Temizle</button>
      </div>
    </div>

    {filteredOrders.length === 0 ? (
      <div className="analytics-empty"><FileText size={31} /><strong>Filtrelere uygun saha hizmet raporu bulunamadı</strong><span>Filtreleri temizleyerek tüm işleri listeleyebilirsiniz.</span></div>
    ) : (
      <div className="field-report-grid">
        {filteredOrders.map((order) => {
          const report = reportByOrder.get(order.recordId);
          return <article key={order.recordId}>
            <div className="field-report-heading">
              <span className={`report-state ${report?.status.toLowerCase() ?? 'missing'}`}>{report?.status === 'Finalized' ? 'Onaylandı' : report ? 'Taslak' : 'Rapor bekliyor'}</span>
              <small>{order.id}</small>
            </div>
            <h3>{order.client}</h3>
            <p>{order.branch}</p>
            <dl>
              <div><dt>Uygulayıcı</dt><dd>{order.technician}</dd></div>
              <div><dt>Tarih</dt><dd>{order.date}</dd></div>
              {report && <><div><dt>İstasyon</dt><dd>{report.activeStations}/{report.totalStations} aktif</dd></div><div><dt>Risk</dt><dd><span className={`risk-chip risk-${report.riskLevel.toLowerCase()}`}>{riskLabel(report.riskLevel)}</span></dd></div></>}
            </dl>
            <div className="field-report-actions">
              {report && <button onClick={() => onPreview(report)}><FileText size={15} /> Görüntüle</button>}
              <button className="primary-button" onClick={() => onEdit(order, report)}>{report ? <FileText size={15} /> : <FilePlus2 size={15} />}{report ? 'Düzenle' : 'Rapor oluştur'}</button>
            </div>
          </article>;
        })}
      </div>
    )}
  </div>;
}

function TrendsTab({ analytics, reports, customers, branches, customerId, branchId, from, to, onCustomer, onBranch, onFrom, onTo }: { analytics: ServiceReportAnalytics; reports: ServiceReportRecord[]; customers: { id: string; name: string }[]; branches: { id: string; name: string }[]; customerId: string; branchId: string; from: string; to: string; onCustomer: (value: string) => void; onBranch: (value: string) => void; onFrom: (value: string) => void; onTo: (value: string) => void }) {
  const [granularity, setGranularity] = useState<'month' | 'quarter' | 'year'>('month');
  const periods = granularity === 'month' ? analytics.periods : granularity === 'quarter' ? aggregateQuarters(analytics.periods) : aggregateYears(analytics.periods);
  const maxCaught = Math.max(1, ...periods.map((item) => item.totalCaught));

  const setDays = (days: number) => {
    const end = new Date(`${to || dateKey(new Date())}T12:00:00`);
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    onFrom(dateKey(start));
  };

  const setMonths = (months: number) => {
    const end = new Date(`${to || dateKey(new Date())}T12:00:00`);
    const start = new Date(end);
    start.setMonth(start.getMonth() - months);
    start.setDate(start.getDate() + 1);
    onFrom(dateKey(start));
  };

  return <>
    <div className="surface report-filter-bar" style={{ flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
      <label>Müşteri<select value={customerId} onChange={(event) => onCustomer(event.target.value)}><option value="">Tüm müşteriler</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Şube<select value={branchId} onChange={(event) => onBranch(event.target.value)}><option value="">Tüm şubeler</option>{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Başlangıç<input type="date" value={from} onChange={(event) => onFrom(event.target.value)} /></label>
      <label>Bitiş<input type="date" value={to} onChange={(event) => onTo(event.target.value)} /></label>
      <div className="period-presets" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 6px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--gray-500)' }}>Hızlı dönem:</span>
        <button type="button" onClick={() => setDays(7)}>1 haftalık</button>
        <button type="button" onClick={() => setMonths(1)}>1 aylık</button>
        <button type="button" onClick={() => setMonths(2)}>2 aylık</button>
        <button type="button" onClick={() => setMonths(3)}>3 aylık</button>
        <button type="button" onClick={() => setMonths(6)}>6 aylık</button>
        <button type="button" onClick={() => setMonths(12)}>1 yıllık</button>
      </div>
      <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
        <button className="secondary-button" onClick={() => exportTrendExcel(analytics, reports)}><Download size={16} /> Excel dışa aktar</button>
        <button className="secondary-button" onClick={() => void shareOrDownloadFile({ title: 'Trend & Risk Analizi', text: `${analytics.from} - ${analytics.to} Trend ve Risk Analizi Raporu`, url: window.location.href })}><Share2 size={16} /> Paylaş</button>
      </div>
    </div>
    <div className="analytics-kpis report-risk-kpis"><article className="surface"><span><FileText size={20} /></span><div><small>Onaylı rapor</small><strong>{analytics.reportCount}</strong></div></article><article className="surface"><span className="green"><Activity size={20} /></span><div><small>Aktivite oranı</small><strong>%{formatNumber(analytics.activityRate)}</strong></div></article><article className="surface"><span className="orange"><Gauge size={20} /></span><div><small>Toplam yakalanan</small><strong>{analytics.totalCaught}</strong></div></article><article className="surface"><span className="purple"><BarChart3 size={20} /></span><div><small>Plaka değişimi</small><strong>{analytics.periods.reduce((sum, item) => sum + item.plateChanges, 0)}</strong></div></article></div>
    <div className="trend-layout"><section className="surface trend-chart-card"><div className="analytics-section-heading"><div><p className="eyebrow">DÖNEMSEL KARŞILAŞTIRMA</p><h2>Yakalanan zararlı & aktivite</h2></div><div className="analytics-period-switch"><button className={granularity === 'month' ? 'active' : ''} onClick={() => setGranularity('month')}>Aylık</button><button className={granularity === 'quarter' ? 'active' : ''} onClick={() => setGranularity('quarter')}>Çeyreklik</button><button className={granularity === 'year' ? 'active' : ''} onClick={() => setGranularity('year')}>Yıllık</button></div></div>{periods.length ? <div className="trend-bars">{periods.map((item) => <div key={item.period}><div className="trend-bar-track"><span style={{ height: `${Math.max(8, item.totalCaught / maxCaught * 100)}%` }}><b>{item.totalCaught}</b></span></div><strong>{granularity === 'month' ? formatPeriod(item.period) : item.period}</strong><small>%{formatNumber(item.activityRate)} aktivite</small></div>)}</div> : <EmptyTrend />}</section><section className="surface pest-distribution"><div className="analytics-section-heading"><div><p className="eyebrow">ZARARLI DAĞILIMI</p><h2>Tür bazlı toplam</h2></div></div>{analytics.pestTotals.length ? analytics.pestTotals.map((item) => <div key={item.pest}><span>{item.pest}</span><div><i style={{ width: `${Math.max(5, item.totalCaught / Math.max(1, analytics.totalCaught) * 100)}%` }} /></div><strong>{item.totalCaught}</strong></div>) : <EmptyTrend />}</section></div>
  </>;
}

function WorkforceTab({ analytics }: { analytics: WorkforceAnalytics }) { return <><div className="analytics-kpis"><article className="surface"><span><Users size={20} /></span><div><small>Aktif personel</small><strong>{analytics.activeEmployees}</strong></div></article><article className="surface"><span className="green"><Clock3 size={20} /></span><div><small>Şu an mesaide</small><strong>{analytics.workingEmployees}</strong></div></article><article className="surface"><span className="purple"><CheckCircle2 size={20} /></span><div><small>Mesaiyi bitiren</small><strong>{analytics.completedEmployees}</strong></div></article><article className="surface"><span className="orange"><BarChart3 size={20} /></span><div><small>Bugün toplam çalışma</small><strong>{formatDuration(analytics.totalWorkedMinutes)}</strong></div></article></div><div className="surface workforce-table-card"><div className="analytics-section-heading"><div><p className="eyebrow">PERSONEL ÇALIŞMA RAPORU</p><h2>{formatDate(analytics.date)}</h2></div></div><div className="workforce-table-wrap"><table className="workforce-table"><thead><tr><th>Personel</th><th>Durum</th><th>Başlangıç</th><th>Bugün</th><th>Son 7 gün</th><th>Bu ay</th><th>Araç kontrolü</th></tr></thead><tbody>{analytics.employees.map((employee) => <tr key={employee.employeeId}><td><strong>{employee.name}</strong><span>{employee.email}</span></td><td><span className={`analytics-status status-${employee.status}`}>{statusLabels[employee.status]}</span></td><td>{formatTime(employee.startedAt)}</td><td><strong>{formatDuration(employee.todayWorkedMinutes)}</strong></td><td>{formatDuration(employee.weekWorkedMinutes)}</td><td>{formatDuration(employee.monthWorkedMinutes)}</td><td>{employee.lastStockCheckAt ? formatDateTime(employee.lastStockCheckAt) : '—'}</td></tr>)}</tbody></table></div></div></>; }

function BiocidesTab({
  reports,
  activations,
  customers,
  companyName,
  onPrint,
}: {
  reports: ServiceReportRecord[];
  activations: StationActivationRecord[];
  customers: { id: string; name: string }[];
  companyName: string;
  onPrint: (monthKey: string) => void;
}) {
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const [monthKey, setMonthKey] = useState<string>(currentMonth);
  const [customerFilter, setCustomerFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'biocide' | 'consumable'>('all');
  const [search, setSearch] = useState('');

  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);
  const monthStartDate = new Date(Date.UTC(year, month - 1, 1));
  const monthEndDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const monthReports = useMemo(() => {
    return reports.filter((r) => {
      const d = new Date(r.scheduledAt || r.updatedAt);
      if (d < monthStartDate || d > monthEndDate) return false;
      if (customerFilter && r.customerId !== customerFilter) return false;
      return true;
    });
  }, [reports, monthStartDate, monthEndDate, customerFilter]);

  const { biocideItems, consumableItems, customerRows, totalSolidGrams, totalLiquidMl, totalConsumablePcs } = useMemo(() => {
    const biocideMap = new Map<string, any>();
    const consumableMap = new Map<string, any>();
    const rows: any[] = [];

    let solidGrams = 0;
    let liquidMl = 0;
    let consumablePcs = 0;

    for (const report of monthReports) {
      for (const prod of report.products) {
        if (!prod.amountUsed || prod.amountUsed <= 0) continue;

        const isConsumable =
          prod.unit === 'Adet' ||
          prod.productName.toLowerCase().includes('plaka') ||
          prod.productName.toLowerCase().includes('levha') ||
          prod.productName.toLowerCase().includes('tuzak') ||
          prod.productName.toLowerCase().includes('kapan') ||
          prod.productName.toLowerCase().includes('monitör');

        const map = isConsumable ? consumableMap : biocideMap;
        const key = `${prod.productName.trim().toUpperCase()}|${prod.unit.toUpperCase()}`;

        const existing = map.get(key);
        if (existing) {
          existing.totalAmount += prod.amountUsed;
          existing.applicationCount += 1;
          existing.customers.add(report.customerName);
          if (report.targetPests) existing.targetPests.add(report.targetPests);
        } else {
          map.set(key, {
            productName: prod.productName.trim(),
            category: isConsumable ? 'Sarf' : 'Biyosidal',
            licenseNumber: prod.licenseNumber || '—',
            activeIngredient: prod.activeIngredient || '—',
            applicationMethod: prod.applicationMethod || (isConsumable ? 'İstasyon İçi' : 'Yemleme / Püskürtme'),
            totalAmount: prod.amountUsed,
            unit: prod.unit,
            applicationCount: 1,
            customers: new Set([report.customerName]),
            targetPests: new Set(report.targetPests ? [report.targetPests] : []),
          });
        }

        if (isConsumable) {
          consumablePcs += prod.amountUsed;
        } else if (prod.unit.toLowerCase().includes('gr') || prod.unit === 'Gram') {
          solidGrams += prod.amountUsed;
        } else if (prod.unit.toLowerCase().includes('kg') || prod.unit === 'Kilogram') {
          solidGrams += prod.amountUsed * 1000;
        } else if (prod.unit.toLowerCase().includes('ml') || prod.unit === 'Mililitre') {
          liquidMl += prod.amountUsed;
        } else if (prod.unit.toLowerCase().includes('lt') || prod.unit === 'Litre') {
          liquidMl += prod.amountUsed * 1000;
        }

        rows.push({
          customerName: report.customerName,
          branchName: report.branchName,
          workOrderNumber: report.workOrderNumber,
          scheduledAt: report.scheduledAt,
          productName: prod.productName,
          amount: prod.amountUsed,
          unit: prod.unit,
          targetPests: report.targetPests || '—',
          operatorName: report.operatorName || '—',
        });
      }
    }

    return {
      biocideItems: Array.from(biocideMap.values()).sort((a, b) => b.totalAmount - a.totalAmount),
      consumableItems: Array.from(consumableMap.values()).sort((a, b) => b.totalAmount - a.totalAmount),
      customerRows: rows.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()),
      totalSolidGrams: solidGrams,
      totalLiquidMl: liquidMl,
      totalConsumablePcs: consumablePcs,
    };
  }, [monthReports]);

  const filteredBiocides = useMemo(() => {
    if (!search.trim()) return biocideItems;
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return biocideItems.filter((i) => i.productName.toLocaleLowerCase('tr-TR').includes(q) || i.activeIngredient.toLocaleLowerCase('tr-TR').includes(q));
  }, [biocideItems, search]);

  const filteredConsumables = useMemo(() => {
    if (!search.trim()) return consumableItems;
    const q = search.trim().toLocaleLowerCase('tr-TR');
    return consumableItems.filter((i) => i.productName.toLocaleLowerCase('tr-TR').includes(q));
  }, [consumableItems, search]);

  const monthLabel = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(monthStartDate);

  return (
    <>
      <div className="surface report-filter-bar" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px' }}>
        <label>
          Rapor Ayı
          <input
            type="month"
            value={monthKey}
            onChange={(e) => setMonthKey(e.target.value)}
          />
        </label>
        <label>
          Müşteri Filtresi
          <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)}>
            <option value="">Tüm Müşteriler</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label>
          Ürün Türü
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as any)}>
            <option value="all">Tüm Ürün & Sarflar</option>
            <option value="biocide">Sadece Biyosidal İlaçlar</option>
            <option value="consumable">Sadece Sarf Malzemeleri</option>
          </select>
        </label>
        <label className="document-search" style={{ flex: 1, minWidth: '160px' }}>
          <span>Arama</span>
          <i>
            <Search size={16} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ürün, etken madde veya ruhsat…" />
          </i>
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="primary-button" onClick={() => onPrint(monthKey)}>
            <Printer size={16} /> PDF / Yazdır
          </button>
          <button
            className="secondary-button"
            onClick={() => exportMonthlyBiocideExcel(monthLabel, biocideItems, consumableItems, customerRows, companyName)}
            disabled={!biocideItems.length && !consumableItems.length}
          >
            <FileSpreadsheet size={16} /> Excel İndir
          </button>
        </div>
      </div>

      <div className="analytics-kpis report-risk-kpis">
        <article className="surface">
          <span className="purple"><FlaskConical size={20} /></span>
          <div>
            <small>Katı / Yem Biyosidal</small>
            <strong>{totalSolidGrams >= 1000 ? `${(totalSolidGrams / 1000).toFixed(2)} kg` : `${totalSolidGrams} gr`}</strong>
          </div>
        </article>
        <article className="surface">
          <span className="blue-orbit"><FlaskConical size={20} /></span>
          <div>
            <small>Sıvı / Jel İnsektisit</small>
            <strong>{totalLiquidMl >= 1000 ? `${(totalLiquidMl / 1000).toFixed(2)} lt` : `${totalLiquidMl} ml`}</strong>
          </div>
        </article>
        <article className="surface">
          <span className="orange"><Boxes size={20} /></span>
          <div>
            <small>Sarf & Plaka Değişimi</small>
            <strong>{totalConsumablePcs} Adet</strong>
          </div>
        </article>
        <article className="surface">
          <span className="green"><FileText size={20} /></span>
          <div>
            <small>{monthLabel} Saha Servisi</small>
            <strong>{monthReports.length} İş Emri</strong>
          </div>
        </article>
      </div>

      {(categoryFilter === 'all' || categoryFilter === 'biocide') && (
        <section className="surface full-table-surface" style={{ marginBottom: '24px' }}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">SAĞLIK BAKANLIĞI RUHSATLI İLAÇLAR</p>
              <h2>Biyosidal Ürün Tüketim İcmali ({filteredBiocides.length} Kalem)</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Ürün Adı</th>
                  <th>Ruhsat No</th>
                  <th>Aktif Madde</th>
                  <th>Uygulama Yöntemi</th>
                  <th>Aylık Tüketim</th>
                  <th>Uygulama Adedi</th>
                  <th>Hedef Zararlılar</th>
                </tr>
              </thead>
              <tbody>
                {filteredBiocides.length ? (
                  filteredBiocides.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        <strong>{item.productName}</strong>
                      </td>
                      <td>{item.licenseNumber}</td>
                      <td>{item.activeIngredient}</td>
                      <td>{item.applicationMethod}</td>
                      <td><strong>{item.totalAmount} {item.unit}</strong></td>
                      <td>{item.applicationCount} İş Emri</td>
                      <td>{Array.from(item.targetPests).join(', ') || '—'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="stock-table-empty">
                      Seçilen ayda kayıtlı biyosidal ilaç tüketimi bulunmuyor.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(categoryFilter === 'all' || categoryFilter === 'consumable') && (
        <section className="surface full-table-surface" style={{ marginBottom: '24px' }}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">İSTASYON & EKİPMAN MATERYALLERİ</p>
              <h2>Sarf Malzemeleri Tüketim İcmali ({filteredConsumables.length} Kalem)</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sarf Malzemesi</th>
                  <th>Kullanım Alanı / Şekli</th>
                  <th>Toplam Tüketilen / Değiştirilen</th>
                  <th>Hizmet Verilen Müşteri Sayısı</th>
                  <th>Uygulama Adedi</th>
                </tr>
              </thead>
              <tbody>
                {filteredConsumables.length ? (
                  filteredConsumables.map((item, idx) => (
                    <tr key={idx}>
                      <td>
                        <strong>{item.productName}</strong>
                      </td>
                      <td>{item.applicationMethod}</td>
                      <td><strong>{item.totalAmount} {item.unit}</strong></td>
                      <td>{item.customers.size} Müşteri</td>
                      <td>{item.applicationCount} İş Emri</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="stock-table-empty">
                      Seçilen ayda kayıtlı sarf malzemesi tüketimi bulunmuyor.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {customerRows.length > 0 && (
        <section className="surface full-table-surface">
          <div className="section-heading">
            <div>
              <p className="eyebrow">MÜŞTERİ BAZLI DETAYLAR</p>
              <h2>Saha Tüketim Hareketleri Günlüğü</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Müşteri / Şube</th>
                  <th>İş Emri</th>
                  <th>Kullanılan Ürün / Sarf</th>
                  <th>Miktar</th>
                  <th>Hedef Zararlı</th>
                  <th>Teknisyen</th>
                </tr>
              </thead>
              <tbody>
                {customerRows.slice(0, 30).map((row, idx) => (
                  <tr key={idx}>
                    <td>{formatDate(row.scheduledAt)}</td>
                    <td><strong>{row.customerName}</strong> · {row.branchName}</td>
                    <td>{row.workOrderNumber}</td>
                    <td>{row.productName}</td>
                    <td><strong>{row.amount} {row.unit}</strong></td>
                    <td>{row.targetPests}</td>
                    <td>{row.operatorName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {customerRows.length > 30 && (
              <p style={{ padding: '12px', color: '#64748b', fontSize: '12px', textAlign: 'center', margin: 0 }}>
                * Toplam {customerRows.length} tüketim hareketinin ilk 30 kaydı gösterilmektedir. Tüm döküm için Excel veya PDF raporu alabilirsiniz.
              </p>
            )}
          </div>
        </section>
      )}
    </>
  );
}

function EmptyTrend() { return <div className="analytics-empty"><BarChart3 size={28} /><strong>Seçilen dönemde veri yok</strong><span>Onaylanan saha raporları burada karşılaştırılır.</span></div>; }

const statusLabels = { notStarted: 'Başlamadı', working: 'Mesaide', onBreak: 'Molada', completed: 'Tamamlandı', inactive: 'Pasif' };
const riskLabel = (value: string) => ({ Low: 'Düşük', Medium: 'Orta', High: 'Yüksek' }[value] ?? value);
const formatNumber = (value: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(value);
const formatDuration = (minutes: number) => `${Math.floor(minutes / 60)}s ${minutes % 60}dk`;
const formatTime = (value?: string | null) => {
  if (!value) return '—';
  try {
    const d = new Date(value);
    return isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    return '—';
  }
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  try {
    const d = new Date(value);
    return isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    return '—';
  }
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  try {
    const str = String(value).trim();
    if (!str) return '—';
    const d = str.includes('T') ? new Date(str) : new Date(`${str}T12:00:00`);
    if (isNaN(d.getTime())) {
      const fb = new Date(str);
      return isNaN(fb.getTime()) ? str : new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }).format(fb);
    }
    return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }).format(d);
  } catch {
    return String(value);
  }
};

const formatPeriod = (value?: string | null) => {
  if (!value) return '—';
  try {
    const str = String(value).trim();
    if (!str) return '—';
    const d = str.includes('T') ? new Date(str) : new Date(`${str}-01T12:00:00`);
    if (isNaN(d.getTime())) {
      const fb = new Date(str);
      return isNaN(fb.getTime()) ? str : new Intl.DateTimeFormat('tr-TR', { month: 'short', year: '2-digit' }).format(fb);
    }
    return new Intl.DateTimeFormat('tr-TR', { month: 'short', year: '2-digit' }).format(d);
  } catch {
    return String(value);
  }
};
const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
function defaultFrom() { const value = new Date(); value.setMonth(value.getMonth() - 5, 1); return dateKey(value); }
function aggregateQuarters(periods: ServiceReportAnalytics['periods']): ServiceReportAnalytics['periods'] {
  const groups = new Map<string, ServiceReportAnalytics['periods']>();
  periods.forEach((item) => { const [year, month] = item.period.split('-').map(Number); const key = `${year} Q${Math.ceil(month / 3)}`; groups.set(key, [...(groups.get(key) ?? []), item]); });
  return Array.from(groups, ([period, items]) => { const totalStations = items.reduce((sum, item) => sum + item.totalStations, 0); const activeStations = items.reduce((sum, item) => sum + item.activeStations, 0); const totalCaught = items.reduce((sum, item) => sum + item.totalCaught, 0); const riskScore = Math.min(100, Math.round((totalStations ? activeStations / totalStations * 50 : 0) + Math.min(50, totalCaught))); return { period, reportCount: items.reduce((sum, item) => sum + item.reportCount, 0), totalStations, activeStations, plateChanges: items.reduce((sum, item) => sum + item.plateChanges, 0), totalCaught, activityRate: totalStations ? activeStations / totalStations * 100 : 0, riskScore, riskLevel: riskScore >= 70 || totalCaught >= 30 ? 'High' : riskScore >= 40 || totalCaught >= 20 ? 'Medium' : 'Low' }; });
}

function aggregateYears(periods: ServiceReportAnalytics['periods']): ServiceReportAnalytics['periods'] {
  const groups = new Map<string, ServiceReportAnalytics['periods']>();
  periods.forEach((item) => {
    const [year] = item.period.split('-');
    const key = `${year} Yılı`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });
  return Array.from(groups, ([period, items]) => {
    const totalStations = items.reduce((sum, item) => sum + item.totalStations, 0);
    const activeStations = items.reduce((sum, item) => sum + item.activeStations, 0);
    const totalCaught = items.reduce((sum, item) => sum + item.totalCaught, 0);
    const riskScore = Math.min(100, Math.round((totalStations ? activeStations / totalStations * 50 : 0) + Math.min(50, totalCaught)));
    return {
      period,
      reportCount: items.reduce((sum, item) => sum + item.reportCount, 0),
      totalStations,
      activeStations,
      plateChanges: items.reduce((sum, item) => sum + item.plateChanges, 0),
      totalCaught,
      activityRate: totalStations ? activeStations / totalStations * 100 : 0,
      riskScore,
      riskLevel: riskScore >= 70 || totalCaught >= 30 ? 'High' : riskScore >= 40 || totalCaught >= 20 ? 'Medium' : 'Low'
    };
  });
}
