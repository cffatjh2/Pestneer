import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Ban, Check, CheckCircle2, ChevronDown, FileDown, Filter, Hash, Pencil, Plus, QrCode, Save, ScanLine, Search, Trash2, Wrench, X } from 'lucide-react';
import type { WorkOrder } from '../../types';
import { getServiceReportCatalog, type ReportStationInput, type ServiceReportCatalog } from '../../services/serviceReportApi';
import { getSitePlans, type SitePlanRecord } from '../../services/sitePlanApi';
import {
  downloadStationActivationPdf,
  getStationActivationByWorkOrder,
  saveStationActivation,
  type StationActivationRecord,
} from '../../services/stationActivationApi';
import QrScannerModal from './QrScannerModal';
import { downloadStationLabelPdf, normalizeStationQrValue, parseStationQrValue } from '../../utils/stationQr';
import { getCompanyBranding, getCompanyLogoObjectUrl } from '../../services/brandingApi';

type Props = {
  accessToken: string;
  order: WorkOrder;
  onClose: () => void;
  onSaved?: (record: StationActivationRecord) => void;
};

/* ── checklist tanımı ── */
const checklistItems: { key: keyof ReportStationInput; label: string }[] = [
  { key: 'baitGelCompleted', label: 'Yem / jel tamamlandı' },
  { key: 'stickyPlateChanged', label: 'Yapışkan plaka değiştirildi' },
  { key: 'stationCleaned', label: 'İstasyon temizlendi' },
  { key: 'stationRelocated', label: 'İstasyon yeri değiştirildi' },
  { key: 'stationReplaced', label: 'İstasyon değiştirildi (yeni cihaz)' },
  { key: 'lockCheckDone', label: 'Kapak / kilit kontrolü' },
  { key: 'labelRenewed', label: 'QR / Barkod etiketi yenilendi' },
];

const blankStation = (): ReportStationInput => ({
  deviceNumber: '', area: '', deviceType: 'B', targetPest: '', caughtCount: 0,
  hasActivity: false, plateChanged: false, deviceStatus: 'Unchecked', activityType: '',
  inaccessibilityReason: '', notes: '',
  baitGelCompleted: false, stickyPlateChanged: false, stationCleaned: false,
  stationRelocated: false, stationReplaced: false, lockCheckDone: false, labelRenewed: false,
});

const fallbackCatalog: ServiceReportCatalog = {
  pestTypes: ['Ev faresi', 'Tarla faresi', 'Norveç sıçanı', 'Çatı sıçanı', 'Alman hamamböceği', 'Doğu hamamböceği', 'Amerikan hamamböceği', 'Karasinek', 'Sirke sineği', 'Lağım sineği', 'Sivrisinek', 'Güve', 'Karınca'],
  activityTypes: ['Sighting', 'Capture', 'Droppings', 'Gnawing', 'Track', 'Nest', 'Other'],
  equipmentTypes: ['R - Dış alan yemli istasyon', 'C - İç alan canlı yakalama istasyonu', 'E - Sinek cihazı', 'G - Güve monitörü', 'B - Böcek monitörü'],
  inaccessibilityReasons: ['Alan kilitliydi', 'Üretim devam ediyordu', 'Müşteri erişime izin vermedi', 'İstasyonun önü kapalıydı', 'İş güvenliği nedeniyle erişilemedi', 'İstasyon yerinde bulunamadı'],
  residenceTypes: [], workTypes: [], safetyMeasures: [], applicationMethods: [], productUnits: [], quickCounts: [1,2,3,4,5,6,7,8,9,10],
};

const activityLabels: Record<string, string> = {
  Sighting: 'Canlı gözlem', Capture: 'Yakalama', Droppings: 'Dışkı / iz', Gnawing: 'Kemirme bulgusu',
  Track: 'Ayak izi / geçiş', Nest: 'Yuva / üreme alanı', Other: 'Diğer bulgu',
};

type StatusFilter = 'all' | 'Unchecked' | 'NoActivity' | 'Activity' | 'Damaged' | 'Inaccessible';

export default function StationActivationModal({ accessToken, order, onClose, onSaved }: Props) {
  const [record, setRecord] = useState<StationActivationRecord | null>(null);
  const [stations, setStations] = useState<ReportStationInput[]>([]);
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ServiceReportCatalog>(fallbackCatalog);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [multiSelect, setMultiSelect] = useState<Set<number>>(new Set());
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [sitePlan, setSitePlan] = useState<SitePlanRecord | null>(null);
  const [qrNotice, setQrNotice] = useState<string | null>(null);
  const readOnly = record?.status === 'Finalized' && !isEditing;

  useEffect(() => {
    let active = true;
    Promise.all([getStationActivationByWorkOrder(accessToken, order.recordId), getSitePlans(accessToken), getServiceReportCatalog(accessToken)])
      .then(([existing, plans, loadedCatalog]) => {
        if (!active) return;
        setCatalog(loadedCatalog);
        setRecord(existing); setNotes(existing?.notes ?? '');
        const plan = plans.find((item) => item.customerId === order.customerId && (order.branchId ? item.branchId === order.branchId : !item.branchId));
        setSitePlan(plan || null);
        if (existing?.stations.length) { setStations(existing.stations); return; }
        const equipment = new Map(plan?.canvas.equipmentTypes.map((item) => [item.id, item]) ?? []);
        const planned = plan?.canvas.elements.filter((item) => item.type === 'station').map((item) => ({
          ...blankStation(), sitePlanId: plan.id, sitePlanElementId: item.id, qrCode: item.qrCode,
          deviceNumber: item.stationNumber ?? '', area: item.text ?? plan.areaName,
          deviceType: equipment.get(item.equipmentTypeId ?? '')?.code ?? 'B',
        })) ?? [];
        setStations(planned.length ? planned : [blankStation()]);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Aktivasyon listesi açılamadı.'))
      .finally(() => setLoading(false));
    return () => { active = false; };
  }, [accessToken, order.branchId, order.customerId, order.recordId]);

  const handleQrScan = (value: string) => {
    const normalized = normalizeStationQrValue(value);
    const pairedIndex = stations.findIndex((station) => station.qrCode && normalizeStationQrValue(station.qrCode) === normalized);
    if (pairedIndex >= 0) {
      setScannerOpen(false);
      setSelected(pairedIndex);
      setFilter('all');
      setSearchQuery('');
      setQrNotice(`İstasyon ${stations[pairedIndex].deviceNumber} QR ile seçildi.`);
      setError(null);
      return;
    }
    const payload = parseStationQrValue(value);
    if (payload) {
      if (payload.customerId !== order.customerId || (payload.branchId ?? '') !== (order.branchId ?? '')) {
        setError('Okutulan QR kod farklı bir müşteriye veya şubeye ait.');
        return;
      }
      const index = stations.findIndex((station) =>
        (station.sitePlanId === payload.sitePlanId && station.sitePlanElementId === payload.elementId) ||
        station.deviceNumber.toUpperCase() === payload.deviceNumber.toUpperCase()
      );
      if (index >= 0) {
        setScannerOpen(false);
        setSelected(index);
        setFilter('all');
        setSearchQuery('');
        setQrNotice(`İstasyon ${stations[index].deviceNumber} QR ile seçildi.`);
        setError(null);
        return;
      }
    }
    const directNumIndex = stations.findIndex((s) => s.deviceNumber && value.toUpperCase().includes(s.deviceNumber.toUpperCase()));
    if (directNumIndex >= 0) {
      setScannerOpen(false);
      setSelected(directNumIndex);
      setFilter('all');
      setSearchQuery('');
      setQrNotice(`İstasyon ${stations[directNumIndex].deviceNumber} seçildi.`);
      setError(null);
      return;
    }
    setError('QR kodu bu listedeki hiçbir istasyonla eşleştirilemedi.');
  };

  const handleDownloadQrLabels = async () => {
    try {
      let companyName = 'Pestneer';
      let logoUrl: string | null = null;
      try {
        const branding = await getCompanyBranding(accessToken);
        if (branding.companyName) companyName = branding.companyName;
        if (branding.hasLogo) {
          logoUrl = await getCompanyLogoObjectUrl(accessToken);
        }
      } catch {
        // fallback
      }
      const planToUse = sitePlan || {
        id: order.recordId,
        customerId: order.customerId,
        customerName: order.client,
        branchId: order.branchId,
        branchName: order.branch,
        areaName: 'Tüm Tesis',
      };
      await downloadStationLabelPdf(planToUse, stations, { companyName, logoUrl });
    } catch (qrErr) {
      setError(qrErr instanceof Error ? qrErr.message : 'QR etiketleri oluşturulamadı.');
    }
  };

  /* ── filtrelenmiş liste ── */
  const filteredIndices = useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase();
    return stations
      .map((station, index) => ({ station, index }))
      .filter(({ station }) => {
        if (filter !== 'all' && station.deviceStatus !== filter) return false;
        if (lowerQuery && !station.deviceNumber.toLowerCase().includes(lowerQuery) && !station.area.toLowerCase().includes(lowerQuery)) return false;
        return true;
      })
      .map(({ index }) => index);
  }, [stations, filter, searchQuery]);

  const current = stations[selected];
  const completed = stations.filter((item) => item.deviceStatus !== 'Unchecked').length;
  const summary = useMemo(() => ({
    activity: stations.filter((item) => item.deviceStatus === 'Activity').length,
    damaged: stations.filter((item) => item.deviceStatus === 'Damaged').length,
    inaccessible: stations.filter((item) => item.deviceStatus === 'Inaccessible').length,
  }), [stations]);
  const update = (patch: Partial<ReportStationInput>) => setStations((items) => items.map((item, index) => index === selected ? { ...item, ...patch } : item));
  const choose = (status: string) => update(current?.deviceStatus === status
    ? { deviceStatus: 'Unchecked', hasActivity: false, caughtCount: 0 }
    : { deviceStatus: status, hasActivity: status === 'Activity', caughtCount: status === 'Activity' ? current?.caughtCount ?? 0 : 0 });

  /* ── toplu istasyon ekleme ── */
  const addBulkStations = (prefix: string, start: number, end: number, area: string, deviceType: string) => {
    const newStations: ReportStationInput[] = [];
    for (let i = start; i <= end; i++) {
      const num = `${prefix}${String(i).padStart(3, '0')}`;
      newStations.push({ ...blankStation(), deviceNumber: num, area, deviceType });
    }
    setStations((items) => [...items, ...newStations]);
    setSelected(stations.length); // select first of newly added
    setBulkOpen(false);
    setError(null);
  };

  /* ── toplu durum atama ── */
  const applyBulkStatus = (status: string) => {
    setStations((items) => items.map((item, index) =>
      multiSelect.has(index) ? { ...item, deviceStatus: status, hasActivity: status === 'Activity' } : item
    ));
    setMultiSelect(new Set());
    setBulkStatusOpen(false);
  };

  const toggleMultiSelect = (index: number) => {
    setMultiSelect((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  };

  const validate = (finalize: boolean) => {
    if (!stations.length) return 'En az bir istasyon ekleyin.';
    for (const station of stations) {
      if (!station.deviceNumber.trim() || !station.area.trim()) return 'Her istasyon için numara ve konum girin.';
      if (finalize && station.deviceStatus === 'Unchecked') return `${station.deviceNumber} için kontrol sonucu seçin.`;
      if (station.deviceStatus === 'Inaccessible' && !station.inaccessibilityReason?.trim()) return `${station.deviceNumber} için ulaşılamama nedenini yazın.`;
      if (station.deviceStatus === 'Activity' && !station.targetPest?.trim()) return `${station.deviceNumber} için zararlı türünü seçin.`;
      if (station.deviceStatus === 'Activity' && station.caughtCount < 1) return `${station.deviceNumber} için aktivite adedini seçin.`;
    }
    return null;
  };
  const save = async (finalize: boolean) => {
    const message = validate(finalize); if (message) return setError(message);
    setSaving(true); setError(null);
    try {
      const saved = await saveStationActivation(accessToken, order.recordId, { notes, finalize, stations });
      setRecord(saved); onSaved?.(saved); if (finalize) onClose();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Aktivasyon listesi kaydedilemedi.'); }
    finally { setSaving(false); }
  };
  const download = async () => {
    if (!record) return;
    try { await downloadStationActivationPdf(accessToken, record); }
    catch (downloadError) { setError(downloadError instanceof Error ? downloadError.message : 'PDF indirilemedi.'); }
  };

  const filterOptions: { value: StatusFilter; label: string; count: number }[] = [
    { value: 'all', label: 'Tümü', count: stations.length },
    { value: 'Unchecked', label: 'Bekleyen', count: stations.filter((s) => s.deviceStatus === 'Unchecked').length },
    { value: 'NoActivity', label: 'Aktivite yok', count: stations.filter((s) => s.deviceStatus === 'NoActivity').length },
    { value: 'Activity', label: 'Aktivite var', count: summary.activity },
    { value: 'Damaged', label: 'Hasarlı', count: summary.damaged },
    { value: 'Inaccessible', label: 'Ulaşılamadı', count: summary.inaccessible },
  ];

  return <div className="modal-layer"><div className="modal station-activation-modal">
    <div className="modal-header"><div><p className="eyebrow">BAĞIMSIZ İSTASYON MODÜLÜ · {order.id}</p><h2>İstasyon aktivasyon listesi</h2><p>{order.client} · {order.branch} · EK-1 uygulama formundan bağımsız çalışır.</p></div><button className="icon-button" onClick={onClose}><X /></button></div>
    {loading ? <div className="inspection-loading">İstasyon listesi hazırlanıyor…</div> : <>
      <section className="activation-summary"><div><strong>{completed}/{stations.length}</strong><span>Kontrol edilen</span></div><span><Activity /> {summary.activity} aktivite</span><span><Wrench /> {summary.damaged} hasarlı</span><span><Ban /> {summary.inaccessible} ulaşılamadı</span></section>

      {/* ── Filtre bar ── */}
      <div className="activation-filter-bar">
        <div className="activation-search"><Search size={16} /><input placeholder="İstasyon ara (YM-01, alan...)…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
        <div className="activation-qr-buttons">
          <button type="button" className="activation-btn-qr-scan" onClick={() => setScannerOpen(true)} title="Kamerayla İstasyon QR / Barkodunu Okut">
            <ScanLine size={16} />
            <strong>QR Kod Okut</strong>
          </button>
          <button type="button" className="activation-btn-qr-print" onClick={() => void handleDownloadQrLabels()} title="Bu Şubenin Tüm İstasyonları İçin A4 Yapışkanlı QR Etiketi İndir (PDF)">
            <QrCode size={15} />
            <span>QR Etiketleri İndir</span>
          </button>
        </div>
        <div className="activation-filter-chips">
          {filterOptions.map((opt) => <button key={opt.value} type="button" className={filter === opt.value ? 'active' : ''} onClick={() => setFilter(opt.value)}>{opt.label} <span>{opt.count}</span></button>)}
        </div>
        {!readOnly && <div className="activation-toolbar-actions">
          <button type="button" onClick={() => setBulkOpen(true)}><Hash size={15} /> Toplu Ekle</button>
          {multiSelect.size > 0 && <button type="button" onClick={() => setBulkStatusOpen(true)}><Filter size={15} /> Seçilenlere durum ata ({multiSelect.size})</button>}
        </div>}
      </div>

      {qrNotice && <div className="activation-qr-notice"><ScanLine size={16} /><span>{qrNotice}</span><button type="button" onClick={() => setQrNotice(null)}>Tamam</button></div>}

      <div className="activation-workspace"><aside>
        {filteredIndices.map((index) => {
          const station = stations[index];
          return <button type="button" key={`${station.sitePlanElementId ?? 'manual'}-${index}`}
            className={`${index === selected ? 'active' : ''} status-${station.deviceStatus.toLowerCase()} ${multiSelect.has(index) ? 'multi-selected' : ''}`}
            onClick={() => { if (multiSelect.size > 0) toggleMultiSelect(index); else setSelected(index); }}
            onContextMenu={(e) => { e.preventDefault(); if (!readOnly) toggleMultiSelect(index); }}
          >
            {!readOnly && multiSelect.size > 0 && <input type="checkbox" className="activation-multi-checkbox" checked={multiSelect.has(index)} onChange={() => toggleMultiSelect(index)} onClick={(e) => e.stopPropagation()} />}
            <strong>{station.deviceNumber || `Yeni ${index + 1}`}</strong>
            <small>{station.area || 'Konum girilmedi'}</small>
            <em>{statusLabel(station.deviceStatus)}</em>
          </button>;
        })}
        {filteredIndices.length === 0 && <div className="activation-empty-filter">Filtre sonucu istasyon bulunamadı.</div>}
        {!readOnly && <button type="button" className="activation-add" onClick={() => { setStations((items) => [...items, blankStation()]); setSelected(stations.length); }}><Plus /> İstasyon ekle</button>}
      </aside>
        {current && <main>
          <div className="activation-fields">
            <label>İstasyon numarası<input value={current.deviceNumber} disabled={readOnly} onChange={(event) => update({ deviceNumber: event.target.value.toUpperCase() })} /></label>
            <label>Konum / alan<input value={current.area} disabled={readOnly} onChange={(event) => update({ area: event.target.value })} /></label>
            <CatalogSelect label="Ekipman türü" value={equipmentCatalogValue(current.deviceType, catalog.equipmentTypes)} options={catalog.equipmentTypes} disabled={readOnly} onChange={(value) => update({ deviceType: value.startsWith('Diğer: ') ? value : value.split(' - ')[0] })} />
          </div>
          <div className="inspection-status-grid">
            <Status active={current.deviceStatus === 'Activity'} icon={<Activity />} label="Aktivite var" disabled={readOnly} onClick={() => choose('Activity')} />
            <Status active={current.deviceStatus === 'NoActivity'} icon={<CheckCircle2 />} label="Aktivite yok" disabled={readOnly} onClick={() => choose('NoActivity')} />
            <Status active={current.deviceStatus === 'Damaged'} icon={<Wrench />} label="Kırık / hasarlı" disabled={readOnly} onClick={() => choose('Damaged')} />
            <Status active={current.deviceStatus === 'Inaccessible'} icon={<Ban />} label="Ulaşılamadı" disabled={readOnly} onClick={() => choose('Inaccessible')} />
          </div>

          {/* ── Checklist İşlemler ── */}
          {current.deviceStatus !== 'Unchecked' && <div className="activation-checklist-panel">
            <strong className="activation-checklist-title">Yapılan İşlemler</strong>
            <div className="activation-checklist-grid">
              {checklistItems.map((item) => (
                <label key={item.key} className={`activation-check-item ${current[item.key] ? 'checked' : ''}`}>
                  <input type="checkbox" checked={!!current[item.key]} disabled={readOnly}
                    onChange={(e) => update({ [item.key]: e.target.checked } as Partial<ReportStationInput>)} />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>}

          {current.deviceStatus === 'Activity' && <div className="activation-activity-panel">
            <div className="activation-fields">
              <CatalogSelect label="Zararlı türü" value={current.targetPest ?? ''} options={catalog.pestTypes} disabled={readOnly} onChange={(value) => update({ targetPest: value })} />
              <CatalogSelect label="Aktivite bulgusu" value={current.activityType ?? ''} options={catalog.activityTypes} labels={activityLabels} disabled={readOnly} onChange={(value) => update({ activityType: value })} />
              <CountSelect label="Görülen / yakalanan adet" value={current.caughtCount || 0} disabled={readOnly} onChange={(count) => update({ caughtCount: count })} />
            </div>
          </div>}
          {current.deviceStatus === 'Inaccessible' && <CatalogSelect className="activation-wide" label="Ulaşılamama nedeni" value={current.inaccessibilityReason ?? ''} options={catalog.inaccessibilityReasons} disabled={readOnly} onChange={(value) => update({ inaccessibilityReason: value })} />}
          {current.deviceStatus !== 'Unchecked' && <label className="activation-wide">İstasyon açıklaması<textarea value={current.notes ?? ''} disabled={readOnly} onChange={(event) => update({ notes: event.target.value })} placeholder="Yapılan işlem, değişim veya saha notu…" /></label>}
          {!readOnly && stations.length > 1 && <button type="button" className="activation-remove" onClick={() => { setStations((items) => items.filter((_, index) => index !== selected)); setSelected(Math.max(0, selected - 1)); }}><Trash2 /> İstasyonu kaldır</button>}
        </main>}
      </div>
      <label className="activation-general-note">Aktivasyon genel notu<textarea value={notes} disabled={readOnly} onChange={(event) => setNotes(event.target.value)} placeholder="Tur özeti, değişiklikler ve takip notları…" /></label>
      {error && <div className="modal-form-error"><AlertTriangle />{error}</div>}
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Kapat</button>
        {record?.status === 'Finalized' && !isEditing && (
          <>
            <button type="button" className="secondary-button" onClick={() => void download()}><FileDown /> PDF</button>
            <button type="button" className="primary-button" onClick={() => setIsEditing(true)}><Pencil /> İstasyonları Düzenle</button>
          </>
        )}
        {(!record || record.status !== 'Finalized' || isEditing) && (
          <>
            <button type="button" className="secondary-button" disabled={saving} onClick={() => void save(false)}><Save /> Taslak Kaydet</button>
            <button type="button" className="primary-button" disabled={saving} onClick={() => void save(true)}><Check /> {isEditing ? 'Güncellemeleri Onayla' : 'Aktivasyonu Onayla'}</button>
          </>
        )}
      </div>
    </>}

    {/* ── Toplu İstasyon Ekleme Modal ── */}
    {bulkOpen && <BulkAddModal equipmentTypes={catalog.equipmentTypes} onClose={() => setBulkOpen(false)} onAdd={addBulkStations} />}

    {/* ── Toplu Durum Atama ── */}
    {bulkStatusOpen && <BulkStatusModal count={multiSelect.size} onClose={() => setBulkStatusOpen(false)} onApply={applyBulkStatus} />}

    {/* ── Canlı QR Tarayıcı Modal ── */}
    {scannerOpen && <QrScannerModal onClose={() => setScannerOpen(false)} onScan={handleQrScan} />}
  </div></div>;
}

/* ── Toplu İstasyon Ekleme ── */
function BulkAddModal({ equipmentTypes, onClose, onAdd }: { equipmentTypes: string[]; onClose: () => void; onAdd: (prefix: string, start: number, end: number, area: string, deviceType: string) => void }) {
  const [prefix, setPrefix] = useState('M-');
  const [start, setStart] = useState(1);
  const [end, setEnd] = useState(50);
  const [area, setArea] = useState('');
  const [deviceType, setDeviceType] = useState(equipmentTypes[0] ?? 'B');
  const [error, setError] = useState<string | null>(null);
  const count = Math.max(0, end - start + 1);

  const submit = () => {
    if (!prefix.trim()) return setError('Prefix girin (örn. M-, C-, E-).');
    if (start < 1 || end < start) return setError('Geçerli bir numara aralığı girin.');
    if (count > 500) return setError('Tek seferde en fazla 500 istasyon eklenebilir.');
    if (!area.trim()) return setError('Konum / alan bilgisi girin.');
    onAdd(prefix.trim(), start, end, area.trim(), deviceType.split(' - ')[0]);
  };

  return <div className="nested-modal-layer"><div className="modal bulk-add-modal">
    <div className="modal-header"><div><p className="eyebrow">TOPLU İSTASYON EKLEME</p><h2>Numara aralığı ile istasyon oluştur</h2><p>Prefix ve numara aralığı belirleyerek birden fazla istasyonu tek seferde ekleyin.</p></div><button className="icon-button" onClick={onClose}><X /></button></div>
    <div className="bulk-add-form">
      <div className="form-grid">
        <label>Prefix (ön ek)<input value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} placeholder="M-" /></label>
        <label>Başlangıç numarası<input type="number" min="1" value={start} onChange={(e) => setStart(Number(e.target.value))} /></label>
        <label>Bitiş numarası<input type="number" min="1" value={end} onChange={(e) => setEnd(Number(e.target.value))} /></label>
        <label>Konum / alan<input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Dış cephe, Depo, Üretim alanı…" /></label>
        <label>Ekipman türü<select value={deviceType} onChange={(e) => setDeviceType(e.target.value)}>{equipmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
      </div>
      <div className="bulk-add-preview">
        <strong>{count} istasyon oluşturulacak</strong>
        <span>{count > 0 ? `${prefix}${String(start).padStart(3, '0')} → ${prefix}${String(end).padStart(3, '0')}` : 'Aralık belirleyin'}</span>
      </div>
      {error && <div className="modal-form-error"><AlertTriangle />{error}</div>}
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Vazgeç</button>
        <button type="button" className="primary-button" onClick={submit}><Plus /> {count} İstasyon Ekle</button>
      </div>
    </div>
  </div></div>;
}

/* ── Toplu Durum Atama ── */
function BulkStatusModal({ count, onClose, onApply }: { count: number; onClose: () => void; onApply: (status: string) => void }) {
  const [status, setStatus] = useState('NoActivity');
  return <div className="nested-modal-layer"><div className="modal bulk-status-modal">
    <div className="modal-header"><div><p className="eyebrow">TOPLU DURUM ATAMA</p><h2>Seçili {count} istasyona durum uygula</h2></div><button className="icon-button" onClick={onClose}><X /></button></div>
    <div className="bulk-status-options">
      <button type="button" className={status === 'NoActivity' ? 'active' : ''} onClick={() => setStatus('NoActivity')}><CheckCircle2 /> Aktivite yok</button>
      <button type="button" className={status === 'Activity' ? 'active' : ''} onClick={() => setStatus('Activity')}><Activity /> Aktivite var</button>
      <button type="button" className={status === 'Damaged' ? 'active' : ''} onClick={() => setStatus('Damaged')}><Wrench /> Kırık / hasarlı</button>
      <button type="button" className={status === 'Inaccessible' ? 'active' : ''} onClick={() => setStatus('Inaccessible')}><Ban /> Ulaşılamadı</button>
    </div>
    <div className="modal-actions">
      <button type="button" className="secondary-button" onClick={onClose}>Vazgeç</button>
      <button type="button" className="primary-button" onClick={() => onApply(status)}><Check /> {count} İstasyona Uygula</button>
    </div>
  </div></div>;
}

function Status({ active, icon, label, disabled, onClick }: { active: boolean; icon: React.ReactNode; label: string; disabled: boolean; onClick: () => void }) {
  return <button type="button" className={active ? 'active' : ''} disabled={disabled} onClick={onClick}>{icon}<span>{label}</span></button>;
}
function statusLabel(value: string) {
  return ({ Unchecked: 'Kontrol bekliyor', NoActivity: 'Aktivite yok', Activity: 'Aktivite var', Damaged: 'Kırık / hasarlı', Inaccessible: 'Ulaşılamadı' } as Record<string, string>)[value] ?? value;
}

function CatalogSelect({ label, value, options, labels, disabled, className, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; disabled: boolean; className?: string; onChange: (value: string) => void }) {
  const isOtherPrefix = value.startsWith('Diğer: ') || value.startsWith('Diğer:');
  const isExactOther = value === 'Diğer' || value === '__other__';
  const known = options.includes(value);
  const isOther = isOtherPrefix || isExactOther || (!known && Boolean(value));
  const otherText = isOtherPrefix ? value.replace(/^Diğer:\s*/, '') : (isExactOther ? '' : (!known && value ? value : ''));

  return (
    <label className={className}>
      {label}
      <select
        value={isOther ? '__other__' : value}
        disabled={disabled}
        onChange={(event) => {
          const val = event.target.value;
          if (val === '__other__') {
            onChange(otherText.trim() ? `Diğer: ${otherText.trim()}` : 'Diğer');
          } else {
            onChange(val);
          }
        }}
      >
        <option value="">Seçiniz</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? option}
          </option>
        ))}
        <option value="__other__">Diğer</option>
      </select>
      {isOther && (
        <input
          value={otherText}
          disabled={disabled}
          onChange={(event) => {
            const text = event.target.value;
            onChange(text.trim() ? `Diğer: ${text}` : 'Diğer');
          }}
          placeholder="Manuel açıklama (opsiyonel)"
        />
      )}
    </label>
  );
}

function CountSelect({ label, value, disabled, className, onChange }: { label: string; value: number; disabled: boolean; className?: string; onChange: (value: number) => void }) {
  const isCustom = value > 10;
  return (
    <label className={className}>
      {label}
      <select
        value={value === 0 ? '' : isCustom ? '__custom__' : String(value)}
        disabled={disabled}
        onChange={(event) => {
          const val = event.target.value;
          if (val === '') onChange(0);
          else if (val === '__custom__') onChange(value > 10 ? value : 11);
          else onChange(Number(val));
        }}
      >
        <option value="">Seçiniz (1 - 10 Adet)</option>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
          <option key={num} value={num}>
            {num} Adet
          </option>
        ))}
        <option value="__custom__">10+ (Özel Adet)</option>
      </select>
    </label>
  );
}

function equipmentCatalogValue(value: string, options: string[]) {
  return options.find((option) => option.startsWith(`${value} - `)) ?? value;
}
