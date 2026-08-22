import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Ban, Barcode, BrainCircuit, Car, Check, CheckCircle2, ChevronDown, FileDown, FilePlus2, Filter, Hash, Info, Layers, PackageCheck, Pencil, Plus, QrCode, Save, ScanLine, Search, Sparkles, Trash2, Wrench, X } from 'lucide-react';
import type { WorkOrder } from '../../types';
import { getServiceReportCatalog, type ReportPestObservationInput, type ReportStationInput, type ServiceReportCatalog } from '../../services/serviceReportApi';
import { getMatchingSitePlanDetail, type SitePlanRecord } from '../../services/sitePlanApi';
import { getLatestVehicleStock, type VehicleStockCheck } from '../../services/fieldOperationsApi';
import {
  downloadStationActivationPdf,
  getStationActivationByWorkOrder,
  saveStationActivation,
  type StationActivationRecord,
} from '../../services/stationActivationApi';
import QrScannerModal from './QrScannerModal';
import { downloadStationLabelPdf, matchStationByCode, normalizeStationQrValue, parseStationQrValue } from '../../utils/stationQr';
import { getCompanyBranding, getCompanyLogoObjectUrl } from '../../services/brandingApi';

const PestneerVisionAnalyzer = lazy(() => import('../vision/PestneerVisionAnalyzer'));

type Props = {
  accessToken: string;
  order: WorkOrder;
  onClose: () => void;
  onSaved?: (record: StationActivationRecord) => void;
  onOpenReport?: () => void;
};

/* ── Türkiye Sağlık Bakanlığı Onaylı Gerçek Biyosidal Kataloğu (Kimyasallar / İlaçlar) ── */
export const defaultBiocideOptions = [
  { name: 'Brodifacoum %0.005 Mum Blok Yem', unit: 'Gram', defaultAmount: 20, category: 'Kemirgen Yemi' },
  { name: 'Bromadiolone %0.005 Pasta Yem', unit: 'Gram', defaultAmount: 15, category: 'Kemirgen Yemi' },
  { name: 'Difenacoum %0.005 Pelet Yem', unit: 'Gram', defaultAmount: 20, category: 'Kemirgen Yemi' },
  { name: 'Flocoumafen %0.005 Mum Blok (Storm)', unit: 'Gram', defaultAmount: 20, category: 'Kemirgen Yemi' },
  { name: 'Maxforce IC %2.15 Hamamböceği Jeli', unit: 'Gram', defaultAmount: 5, category: 'Jel İlaç' },
  { name: 'Goliath Jel %0.05 Hamamböceği Jeli', unit: 'Gram', defaultAmount: 5, category: 'Jel İlaç' },
  { name: 'Advion Cockroach Jel', unit: 'Gram', defaultAmount: 5, category: 'Jel İlaç' },
  { name: 'K-Othrine SC 25 Sıvı İnsektisit', unit: 'Mililitre', defaultAmount: 50, category: 'Sıvı İnsektisit' },
  { name: 'Chrysamed Forte Konsantre İnsektisit', unit: 'Mililitre', defaultAmount: 50, category: 'Sıvı İnsektisit' },
  { name: 'Icon 10 CS Mikrokapsül İnsektisit', unit: 'Mililitre', defaultAmount: 50, category: 'Sıvı İnsektisit' },
];

/* ── Standart Sarf Malzemeleri ve Ekipman Değişim Kataloğu ── */
export const defaultConsumableOptions = [
  { name: 'Fare & Sıçan Yapışkanlı Levha (Plaka)', unit: 'Adet', category: 'Yapışkan Levha' },
  { name: 'EFK Sinek Cihazı UV Yapışkan Levhası', unit: 'Adet', category: 'Yapışkan Levha' },
  { name: 'Hamamböceği Monitör Yapışkan Kapanı', unit: 'Adet', category: 'Monitör Kapan' },
  { name: '15W UV-A Floresan Sinek Lambası', unit: 'Adet', category: 'UV Lamba' },
  { name: '36W UV-A Parçalanmaz Sinek Lambası', unit: 'Adet', category: 'UV Lamba' },
  { name: 'Kemirgen Yemleme İstasyonu Gövdesi', unit: 'Adet', category: 'İstasyon Gövdesi' },
  { name: 'Mekanik Canlı Yakalama Kapanı', unit: 'Adet', category: 'Kapan Ekipman' },
];

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

export default function StationActivationModal({ accessToken, order, onClose, onSaved, onOpenReport }: Props) {
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
  const [visionOpen, setVisionOpen] = useState(false);
  const [vehicleStock, setVehicleStock] = useState<VehicleStockCheck | null>(null);
  const readOnly = record?.status === 'Finalized' && !isEditing;

  const handleVisionApply = (observations: ReportPestObservationInput[], summary: { total: number; dominantPest: string }) => {
    const autoNotes = `PestneerVision AI Sayımı: ${observations.map((o) => `${o.approvedCount} ${o.pestName}`).join(', ')}`;
    update({
      deviceStatus: 'Activity',
      hasActivity: true,
      activityType: 'Capture',
      targetPest: observations[0]?.pestName ?? summary.dominantPest,
      caughtCount: summary.total,
      notes: current?.notes ? `${current.notes} · ${autoNotes}` : autoNotes,
      stickyPlateChanged: true,
    });
    setVisionOpen(false);
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      getStationActivationByWorkOrder(accessToken, order.recordId),
      getMatchingSitePlanDetail(accessToken, order.customerId, order.branchId),
      getServiceReportCatalog(accessToken),
      getLatestVehicleStock(accessToken).catch(() => null),
    ])
      .then(([existing, plan, loadedCatalog, stock]) => {
        if (!active) return;
        setCatalog(loadedCatalog);
        if (stock) setVehicleStock(stock);
        setRecord(existing); setNotes(existing?.notes ?? '');
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

  const [pairingStationIndex, setPairingStationIndex] = useState<number | null>(null);
  const [unassignedCodeModal, setUnassignedCodeModal] = useState<{ scannedCode: string; targetIndex: number } | null>(null);

  const handleQrScan = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    // Explicit pairing of a specific station
    if (pairingStationIndex !== null && pairingStationIndex >= 0 && pairingStationIndex < stations.length) {
      const targetStation = stations[pairingStationIndex];
      const updated = [...stations];
      updated[pairingStationIndex] = { ...targetStation, qrCode: trimmed };
      setStations(updated);
      setSelected(pairingStationIndex);
      setScannerOpen(false);
      setPairingStationIndex(null);
      setQrNotice(`✅ ${targetStation.deviceNumber || `İstasyon ${pairingStationIndex + 1}`} barkod/QR ile başarıyla eşleştirildi! (Kod: ${trimmed})`);
      setError(null);
      return;
    }

    // Try universal matching
    const match = matchStationByCode(stations, trimmed, { customerId: order.customerId, branchId: order.branchId });
    if (match) {
      setScannerOpen(false);
      setSelected(match.matchIndex);
      setFilter('all');
      setSearchQuery('');
      setQrNotice(`🎯 ${stations[match.matchIndex].deviceNumber} okutuldu ve açıldı.`);
      setError(null);
      return;
    }

    // Unassigned barcode / QR: open pairing confirmation dialog
    setScannerOpen(false);
    setUnassignedCodeModal({
      scannedCode: trimmed,
      targetIndex: selected >= 0 && selected < stations.length ? selected : 0,
    });
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

  const biocideStock = useMemo(() => {
    return (vehicleStock?.items || []).filter((item) =>
      item.unit === 'Gram' ||
      item.unit === 'Mililitre' ||
      item.unit === 'Litre' ||
      item.unit === 'Kilogram' ||
      item.productName.toLowerCase().includes('yem') ||
      item.productName.toLowerCase().includes('jel') ||
      item.productName.toLowerCase().includes('blok') ||
      item.productName.toLowerCase().includes('pasta') ||
      item.productName.toLowerCase().includes('sc') ||
      item.productName.toLowerCase().includes('ec') ||
      item.productName.toLowerCase().includes('ilaç') ||
      item.productName.toLowerCase().includes('insektisit') ||
      item.productName.toLowerCase().includes('rodentisit')
    );
  }, [vehicleStock]);

  const consumableStock = useMemo(() => {
    return (vehicleStock?.items || []).filter((item) =>
      item.unit === 'Adet' ||
      item.productName.toLowerCase().includes('plaka') ||
      item.productName.toLowerCase().includes('yapışkan') ||
      item.productName.toLowerCase().includes('levha') ||
      item.productName.toLowerCase().includes('lamba') ||
      item.productName.toLowerCase().includes('istasyon') ||
      item.productName.toLowerCase().includes('kapan') ||
      item.productName.toLowerCase().includes('tüp') ||
      item.productName.toLowerCase().includes('ekipman')
    );
  }, [vehicleStock]);

  const appliedStockItem = useMemo(() => {
    if (!current?.appliedProductName && !current?.appliedVehicleStockItemId) return null;
    return (vehicleStock?.items || []).find((item) =>
      (current.appliedVehicleStockItemId && (item.vehicleStockItemId === current.appliedVehicleStockItemId || item.id === current.appliedVehicleStockItemId)) ||
      (current.appliedProductName && item.productName.toLocaleUpperCase('tr-TR') === current.appliedProductName.toLocaleUpperCase('tr-TR'))
    ) || null;
  }, [current?.appliedProductName, current?.appliedVehicleStockItemId, vehicleStock]);

  const replacementStockItem = useMemo(() => {
    if (!current?.replacementProductName && !current?.replacementVehicleStockItemId) return null;
    return (vehicleStock?.items || []).find((item) =>
      (current.replacementVehicleStockItemId && (item.vehicleStockItemId === current.replacementVehicleStockItemId || item.id === current.replacementVehicleStockItemId)) ||
      (current.replacementProductName && item.productName.toLocaleUpperCase('tr-TR') === current.replacementProductName.toLocaleUpperCase('tr-TR'))
    ) || null;
  }, [current?.replacementProductName, current?.replacementVehicleStockItemId, vehicleStock]);

  const update = (patch: Partial<ReportStationInput>) => setStations((items) => items.map((item, index) => index === selected ? { ...item, ...patch } : item));
  const choose = (status: string) => update(current?.deviceStatus === status
    ? { deviceStatus: 'Unchecked', hasActivity: false, caughtCount: 0 }
    : { deviceStatus: status, hasActivity: status === 'Activity', caughtCount: status === 'Activity' ? current?.caughtCount ?? 0 : 0 });

  const applyQuickBiocide = (preferredName: string, amount: number, unit: string, keyword: string) => {
    const stockMatch = (vehicleStock?.items || []).find((item) =>
      item.productName.toLowerCase().includes(keyword.toLowerCase()) ||
      item.productName.toLowerCase().includes(preferredName.toLowerCase())
    );
    const finalName = stockMatch ? stockMatch.productName : preferredName;
    const finalUnit = stockMatch ? stockMatch.unit : unit;
    const finalStockId = stockMatch?.vehicleStockItemId || stockMatch?.id;

    update({
      appliedProductName: finalName,
      appliedVehicleStockItemId: finalStockId,
      appliedAmount: amount,
      appliedUnit: finalUnit,
      baitGelCompleted: true,
    });
  };

  const applyQuickConsumable = (preferredName: string, quantity: number, unit: string, keyword: string) => {
    const stockMatch = (vehicleStock?.items || []).find((item) =>
      item.productName.toLowerCase().includes(keyword.toLowerCase()) ||
      item.productName.toLowerCase().includes(preferredName.toLowerCase())
    );
    const finalName = stockMatch ? stockMatch.productName : preferredName;
    const finalUnit = stockMatch ? stockMatch.unit : unit;
    const finalStockId = stockMatch?.vehicleStockItemId || stockMatch?.id;

    update({
      replacementProductName: finalName,
      replacementVehicleStockItemId: finalStockId,
      replacementQuantity: quantity,
      replacementUnit: finalUnit,
      stickyPlateChanged: keyword.includes('plaka') || keyword.includes('yapışkan') || preferredName.includes('Plaka') || preferredName.includes('Yapışkan'),
      stationReplaced: keyword.includes('istasyon') || keyword.includes('gövde') || preferredName.includes('İstasyon'),
    });
  };

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
  const save = async (finalize: boolean, openReportAfter = false) => {
    const message = validate(finalize); if (message) return setError(message);
    setSaving(true); setError(null);
    try {
      const saved = await saveStationActivation(accessToken, order.recordId, { notes, finalize, stations });
      setRecord(saved);
      onSaved?.(saved);
      if (openReportAfter && onOpenReport) {
        onOpenReport();
      } else if (finalize) {
        if (onOpenReport) {
          onOpenReport();
        } else {
          onClose();
        }
      }
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

      {vehicleStock && (
        <div className="activation-vehicle-stock-bar">
          <div className="activation-vehicle-stock-info">
            <Car size={16} color="#059669" />
            <span><strong>Mevcut Araç Deponuz:</strong> {biocideStock.length} çeşit Biyosidal İlaç & {consumableStock.length} çeşit Sarf Malzemesi hazır</span>
          </div>
          <span className="activation-vehicle-stock-hint">
            ⚡ İstasyonlarda seçilen ürünler iş bitiminde EK-1 üzerinden araç stoğundan otomatik düşülecektir.
          </span>
        </div>
      )}

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
          <div className="activation-station-top-bar">
            <div className="activation-fields" style={{ flex: 1, marginBottom: 0 }}>
              <label>İstasyon numarası<input value={current.deviceNumber} disabled={readOnly} onChange={(event) => update({ deviceNumber: event.target.value.toUpperCase() })} /></label>
              <label>Konum / alan<input value={current.area} disabled={readOnly} onChange={(event) => update({ area: event.target.value })} /></label>
              <CatalogSelect label="Ekipman türü" value={equipmentCatalogValue(current.deviceType, catalog.equipmentTypes)} options={catalog.equipmentTypes} disabled={readOnly} onChange={(value) => update({ deviceType: value.startsWith('Diğer: ') ? value : value.split(' - ')[0] })} />
            </div>
            <button
              type="button"
              className="activation-vision-btn"
              disabled={readOnly}
              onClick={() => setVisionOpen(true)}
              title="Fotoğraftan yapay zeka ile otomatik böcek ve sinek say"
            >
              <BrainCircuit size={16} /> 📷 Pestneer Vision ile Say (AI)
            </button>
          </div>

          {/* ── Barkod & QR Kod Tanımlama Şeridi ── */}
          <div className="activation-barcode-bar">
            <div className="activation-barcode-info">
              <Barcode size={17} color={current.qrCode ? '#2563eb' : '#64748b'} />
              <span>Tanımlı Barkod / QR:</span>
              {current.qrCode ? (
                <span className="activation-barcode-badge">{current.qrCode}</span>
              ) : (
                <span className="activation-barcode-empty">Henüz kod tanımlanmadı</span>
              )}
            </div>
            {!readOnly && (
              <div className="activation-barcode-actions">
                <button
                  type="button"
                  className="secondary-button"
                  style={{ minHeight: '32px', padding: '0 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => {
                    setPairingStationIndex(selected);
                    setScannerOpen(true);
                  }}
                  title="Fiziksel barkod veya QR kodu okutarak bu istasyonla eşleştir"
                >
                  <ScanLine size={14} /> {current.qrCode ? 'Kodu Değiştir' : 'Barkod / QR Eşle'}
                </button>
                {current.qrCode && (
                  <button
                    type="button"
                    className="icon-button"
                    style={{ width: '32px', height: '32px' }}
                    onClick={() => update({ qrCode: undefined })}
                    title="Tanımlı barkodu kaldır"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            )}
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
                  <input
                    type="checkbox"
                    checked={!!current[item.key]}
                    disabled={readOnly}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      const patch: Partial<ReportStationInput> = { [item.key]: checked };
                      if (checked) {
                        if (item.key === 'stickyPlateChanged' && !current.replacementProductName) {
                          patch.replacementProductName = 'Fare & Sıçan Yapışkanlı Levha (Plaka)';
                          patch.replacementQuantity = 1;
                          patch.replacementUnit = 'Adet';
                        } else if (item.key === 'stationReplaced' && !current.replacementProductName) {
                          patch.replacementProductName = 'Kemirgen Yemleme İstasyonu Gövdesi';
                          patch.replacementQuantity = 1;
                          patch.replacementUnit = 'Adet';
                        } else if (item.key === 'baitGelCompleted' && !current.appliedProductName) {
                          patch.appliedProductName = 'Brodifacoum %0.005 Mum Blok Yem';
                          patch.appliedAmount = 20;
                          patch.appliedUnit = 'Gram';
                        }
                      }
                      update(patch);
                    }}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>}

          {/* ── 1. Biyosidal / İlaç & Yem Uygulaması (Kimyasallar) ── */}
          {current.deviceStatus !== 'Unchecked' && (
            <div className="activation-sub-panel">
              <div className="activation-sub-panel-header">
                <div className="activation-sub-panel-title">
                  <PackageCheck size={16} color="#059669" />
                  <span>1. İlaç / Yem & Biyosidal Uygulaması</span>
                </div>
                {current.appliedProductName && (
                  <button
                    type="button"
                    className="activation-clear-btn"
                    disabled={readOnly}
                    onClick={() => update({
                      appliedProductName: undefined,
                      appliedAmount: 0,
                      appliedUnit: undefined,
                      appliedVehicleStockItemId: undefined,
                      baitGelCompleted: false,
                    })}
                  >
                    Temizle
                  </button>
                )}
              </div>

              <div className="activation-sub-panel-grid">
                <label>
                  <span>Biyosidal Ürün / Yem / İlaç</span>
                  <select
                    value={current.appliedProductName || ''}
                    disabled={readOnly}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        update({
                          appliedProductName: undefined,
                          appliedAmount: 0,
                          appliedUnit: undefined,
                          appliedVehicleStockItemId: undefined,
                        });
                        return;
                      }
                      const stockMatch = vehicleStock?.items?.find((item) => item.productName === val || item.vehicleStockItemId === val || item.id === val);
                      const catalogMatch = defaultBiocideOptions.find((item) => item.name === val);
                      const unit = stockMatch ? stockMatch.unit : catalogMatch ? catalogMatch.unit : 'Gram';
                      const defaultAmt = current.appliedAmount && current.appliedAmount > 0
                        ? current.appliedAmount
                        : catalogMatch?.defaultAmount ?? (unit === 'Gram' ? 20 : unit === 'Mililitre' ? 50 : 1);

                      update({
                        appliedProductName: stockMatch ? stockMatch.productName : val,
                        appliedVehicleStockItemId: stockMatch?.vehicleStockItemId || stockMatch?.id,
                        appliedUnit: unit,
                        appliedAmount: defaultAmt,
                        baitGelCompleted: true,
                      });
                    }}
                  >
                    <option value="">İlaç / yem uygulanmadı</option>
                    {biocideStock.length > 0 && (
                      <optgroup label="🚗 Araç Stoğundaki Biyosidaller (Öncelikli & Otomatik Düşüm)">
                        {biocideStock.map((item) => (
                          <option key={item.id || item.vehicleStockItemId} value={item.productName}>
                            🚗 [Araç Stoğu] {item.productName} · Kalan: {item.quantity} {item.unit}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="🏷️ Sağlık Bakanlığı Onaylı Standart Biyosidal Kataloğu">
                      {defaultBiocideOptions.map((opt) => (
                        <option key={opt.name} value={opt.name}>
                          {opt.name} · {opt.category} ({opt.unit})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>

                <label>
                  <span>Uygulanan Miktar</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={current.appliedAmount || ''}
                    disabled={readOnly || !current.appliedProductName}
                    placeholder="0"
                    onChange={(e) => update({ appliedAmount: Number(e.target.value) || 0 })}
                  />
                </label>

                <label>
                  <span>Birim</span>
                  <select
                    value={current.appliedUnit || 'Gram'}
                    disabled={readOnly || !current.appliedProductName}
                    onChange={(e) => update({ appliedUnit: e.target.value })}
                  >
                    <option value="Gram">Gram (gr)</option>
                    <option value="Mililitre">Mililitre (ml)</option>
                    <option value="Litre">Litre (lt)</option>
                    <option value="Kilogram">Kilogram (kg)</option>
                  </select>
                </label>
              </div>

              {appliedStockItem ? (
                <div className="activation-stock-status-pill in-stock">
                  <PackageCheck size={14} color="#059669" />
                  <span>Araç Stoğuna Bağlı: <strong>{appliedStockItem.quantity} {appliedStockItem.unit}</strong> mevcut</span>
                  {current.appliedAmount && current.appliedAmount > 0 ? (
                    <span className={appliedStockItem.quantity < current.appliedAmount ? 'stock-alert' : 'stock-after'}>
                      {appliedStockItem.quantity < current.appliedAmount
                        ? `⚠️ Yetersiz Stok! (Eksik: ${Number((current.appliedAmount - appliedStockItem.quantity).toFixed(2))} ${appliedStockItem.unit})`
                        : `(Uygulama sonrası kalan: ${Number((appliedStockItem.quantity - current.appliedAmount).toFixed(2))} ${appliedStockItem.unit})`
                      }
                    </span>
                  ) : null}
                </div>
              ) : current.appliedProductName ? (
                <div className="activation-stock-status-pill catalog-notice">
                  <Info size={14} color="#64748b" />
                  <span>Standart Katalog Ürünü (Araç stoğunda bulunamadı)</span>
                </div>
              ) : null}

              {!readOnly && (
                <div className="activation-quick-chips">
                  <span className="activation-quick-chips-label">Hızlı Doz:</span>
                  <button type="button" onClick={() => applyQuickBiocide('Brodifacoum %0.005 Mum Blok Yem', 20, 'Gram', 'blok')}>
                    +20 gr Blok Yem
                  </button>
                  <button type="button" onClick={() => applyQuickBiocide('Bromadiolone %0.005 Pasta Yem', 15, 'Gram', 'pasta')}>
                    +15 gr Pasta Yem
                  </button>
                  <button type="button" onClick={() => applyQuickBiocide('Maxforce IC %2.15 Hamamböceği Jeli', 5, 'Gram', 'jel')}>
                    +5 gr Jel
                  </button>
                  <button type="button" onClick={() => applyQuickBiocide('K-Othrine SC 25 Sıvı İnsektisit', 50, 'Mililitre', 'sc')}>
                    +50 ml Sıvı
                  </button>
                  <button type="button" onClick={() => applyQuickBiocide('Chrysamed Forte Konsantre İnsektisit', 100, 'Mililitre', 'konsantre')}>
                    +100 ml
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── 2. Sarf Malzemesi & Parça Değişimi (Yapışkan Plaka / UV Lamba / Cihaz) ── */}
          {current.deviceStatus !== 'Unchecked' && (
            <div className="activation-sub-panel">
              <div className="activation-sub-panel-header">
                <div className="activation-sub-panel-title">
                  <PackageCheck size={16} color="#0284c7" />
                  <span>2. Sarf Malzemesi & Parça Değişimi</span>
                </div>
                {current.replacementProductName && (
                  <button
                    type="button"
                    className="activation-clear-btn"
                    disabled={readOnly}
                    onClick={() => update({
                      replacementProductName: undefined,
                      replacementQuantity: 0,
                      replacementUnit: undefined,
                      replacementVehicleStockItemId: undefined,
                      stickyPlateChanged: false,
                      stationReplaced: false,
                    })}
                  >
                    Temizle
                  </button>
                )}
              </div>

              <div className="activation-sub-panel-grid">
                <label>
                  <span>Kullanılan Sarf / Değişen Parça</span>
                  <select
                    value={current.replacementProductName || ''}
                    disabled={readOnly}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        update({
                          replacementProductName: undefined,
                          replacementQuantity: 0,
                          replacementUnit: undefined,
                          replacementVehicleStockItemId: undefined,
                          stickyPlateChanged: false,
                          stationReplaced: false,
                        });
                        return;
                      }
                      const stockMatch = vehicleStock?.items?.find((item) => item.productName === val || item.vehicleStockItemId === val || item.id === val);
                      const catalogMatch = defaultConsumableOptions.find((item) => item.name === val);
                      const prodName = stockMatch ? stockMatch.productName : val;
                      update({
                        replacementProductName: prodName,
                        replacementVehicleStockItemId: stockMatch?.vehicleStockItemId || stockMatch?.id,
                        replacementUnit: stockMatch?.unit || catalogMatch?.unit || 'Adet',
                        replacementQuantity: current.replacementQuantity && current.replacementQuantity > 0 ? current.replacementQuantity : 1,
                        stickyPlateChanged: prodName.includes('Plaka') || prodName.includes('Yapışkan') || prodName.includes('Levha') ? true : current.stickyPlateChanged,
                        stationReplaced: prodName.includes('İstasyon') || prodName.includes('Kapan') ? true : current.stationReplaced,
                      });
                    }}
                  >
                    <option value="">Sarf malzeme / parça değişimi yapılmadı</option>
                    {consumableStock.length > 0 && (
                      <optgroup label="🚗 Araç Stoğundaki Sarf Malzemeleri (Öncelikli & Otomatik Düşüm)">
                        {consumableStock.map((item) => (
                          <option key={item.id || item.vehicleStockItemId} value={item.productName}>
                            🚗 [Araç Stoğu] {item.productName} · Kalan: {item.quantity} {item.unit}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="📦 Standart Sarf & Ekipman Kataloğu">
                      {defaultConsumableOptions.map((opt) => (
                        <option key={opt.name} value={opt.name}>
                          {opt.name} · {opt.category} ({opt.unit})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>

                <label>
                  <span>Değişen Adet</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={current.replacementQuantity || ''}
                    disabled={readOnly || !current.replacementProductName}
                    placeholder="1"
                    onChange={(e) => update({ replacementQuantity: Number(e.target.value) || 0 })}
                  />
                </label>

                <label>
                  <span>Birim</span>
                  <input
                    value={current.replacementUnit || 'Adet'}
                    disabled
                  />
                </label>
              </div>

              {replacementStockItem ? (
                <div className="activation-stock-status-pill in-stock">
                  <PackageCheck size={14} color="#0284c7" />
                  <span>Araç Stoğuna Bağlı: <strong>{replacementStockItem.quantity} {replacementStockItem.unit}</strong> mevcut</span>
                  {current.replacementQuantity && current.replacementQuantity > 0 ? (
                    <span className={replacementStockItem.quantity < current.replacementQuantity ? 'stock-alert' : 'stock-after'}>
                      {replacementStockItem.quantity < current.replacementQuantity
                        ? `⚠️ Yetersiz Stok! (Eksik: ${Number((current.replacementQuantity - replacementStockItem.quantity).toFixed(2))} ${replacementStockItem.unit})`
                        : `(Değişim sonrası kalan: ${Number((replacementStockItem.quantity - current.replacementQuantity).toFixed(2))} ${replacementStockItem.unit})`
                      }
                    </span>
                  ) : null}
                </div>
              ) : current.replacementProductName ? (
                <div className="activation-stock-status-pill catalog-notice">
                  <Info size={14} color="#64748b" />
                  <span>Standart Sarf Kataloğu (Araç stoğunda bulunamadı)</span>
                </div>
              ) : null}

              {!readOnly && (
                <div className="activation-quick-chips">
                  <span className="activation-quick-chips-label">Hızlı Sarf:</span>
                  <button type="button" onClick={() => applyQuickConsumable('Fare & Sıçan Yapışkanlı Levha (Plaka)', 1, 'Adet', 'plaka')}>
                    +1 Fare Yapışkanı
                  </button>
                  <button type="button" onClick={() => applyQuickConsumable('EFK Sinek Cihazı UV Yapışkan Levhası', 1, 'Adet', 'sinek')}>
                    +1 Sinek Yapışkanı
                  </button>
                  <button type="button" onClick={() => applyQuickConsumable('Hamamböceği Monitör Yapışkan Kapanı', 1, 'Adet', 'kapan')}>
                    +1 Böcek Monitör
                  </button>
                  <button type="button" onClick={() => applyQuickConsumable('15W UV-A Floresan Sinek Lambası', 1, 'Adet', 'lamba')}>
                    +1 UV Lamba
                  </button>
                  <button type="button" onClick={() => applyQuickConsumable('Kemirgen Yemleme İstasyonu Gövdesi', 1, 'Adet', 'istasyon')}>
                    +1 İstasyon Gövdesi
                  </button>
                </div>
              )}
            </div>
          )}

          {current.deviceStatus === 'Activity' && <div className="activation-activity-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <strong style={{ fontSize: '13px', color: '#047857' }}>Aktivite ve Zararlı Detayları</strong>
              <button
                type="button"
                className="activation-vision-mini-btn"
                disabled={readOnly}
                onClick={() => setVisionOpen(true)}
              >
                <BrainCircuit size={14} /> 📷 Fotoğraf Çek & AI ile Say
              </button>
            </div>
            <div className="activation-fields">
              <CatalogSelect label="Zararlı türü" value={current.targetPest ?? ''} options={catalog.pestTypes} disabled={readOnly} onChange={(value) => update({ targetPest: value })} />
              <CatalogSelect label="Aktivite bulgusu" value={current.activityType ?? ''} options={catalog.activityTypes} labels={activityLabels} disabled={readOnly} onChange={(value) => update({ activityType: value })} />
              <CountSelect label="Görülen / yakalanan adet (+ / −)" value={current.caughtCount || 0} disabled={readOnly} onChange={(count) => update({ caughtCount: count })} />
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
            <button type="button" className="primary-button" disabled={saving} onClick={() => void save(true, true)}>
              <FilePlus2 size={16} /> {isEditing ? 'Güncellemeleri Kaydet & EK-1 Formuna Geç' : 'Aktivasyonu Onayla & EK-1 Formuna Geç'}
            </button>
          </>
        )}
      </div>
    </>}

    {/* ── Toplu İstasyon Ekleme Modal ── */}
    {bulkOpen && <BulkAddModal equipmentTypes={catalog.equipmentTypes} onClose={() => setBulkOpen(false)} onAdd={addBulkStations} />}

    {/* ── Toplu Durum Atama ── */}
    {bulkStatusOpen && <BulkStatusModal count={multiSelect.size} onClose={() => setBulkStatusOpen(false)} onApply={applyBulkStatus} />}

    {/* ── Canlı QR & Barkod Tarayıcı Modal ── */}
    {scannerOpen && <QrScannerModal onClose={() => setScannerOpen(false)} onScan={handleQrScan} />}

    {/* ── İlk Kez Tanımlanan Barkod / QR Eşleştirme Modalı ── */}
    {unassignedCodeModal && (
      <div className="nested-modal-layer" role="dialog" aria-modal="true" style={{ zIndex: 1200 }}>
        <div className="surface" style={{ width: '440px', maxWidth: '95vw', padding: '24px', borderRadius: '16px', background: '#fff', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', border: '1px solid #cbd5e1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
            <div style={{ background: '#ecfdf5', color: '#059669', padding: '10px', borderRadius: '12px', display: 'flex' }}>
              <Barcode size={26} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>Yeni Barkod / QR Algılandı</h3>
              <small style={{ color: '#64748b' }}>Bu kod henüz bir istasyonla eşleştirilmemiş.</small>
            </div>
          </div>

          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', marginBottom: '16px' }}>
            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Okutulan Kod</span>
            <div style={{ fontSize: '15px', fontWeight: 700, color: '#0284c7', fontFamily: 'monospace', wordBreak: 'break-all', marginTop: '3px' }}>
              {unassignedCodeModal.scannedCode}
            </div>
          </div>

          <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '18px' }}>
            Bu barkodu hangi istasyona tanımlamak istiyorsunuz?
            <select
              value={unassignedCodeModal.targetIndex}
              onChange={(e) => setUnassignedCodeModal({ ...unassignedCodeModal, targetIndex: Number(e.target.value) })}
              style={{ width: '100%', marginTop: '6px', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', background: '#fff' }}
            >
              {stations.map((st, idx) => (
                <option key={idx} value={idx}>
                  {st.deviceNumber || `İstasyon ${idx + 1}`} ({st.area || 'Genel Alan'}) {st.qrCode ? `[Mevcut: ${st.qrCode.slice(0, 10)}...]` : '[Henüz Kodsuz]'}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" className="secondary-button" onClick={() => setUnassignedCodeModal(null)}>
              İptal
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                const idx = unassignedCodeModal.targetIndex;
                const updated = [...stations];
                updated[idx] = { ...updated[idx], qrCode: unassignedCodeModal.scannedCode };
                setStations(updated);
                setSelected(idx);
                setQrNotice(`✅ ${updated[idx].deviceNumber || `İstasyon ${idx + 1}`} ile ${unassignedCodeModal.scannedCode} başarıyla eşleştirildi! Artık her okutulduğunda bu istasyon açılacaktır.`);
                setUnassignedCodeModal(null);
              }}
            >
              İstasyonla Eşleştir & Aç
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Pestneer Vision Yapay Zeka Sayım Modal ── */}
    {visionOpen && (
      <div className="nested-modal-layer">
        <div className="modal vision-analyzer-modal">
          <div className="modal-header">
            <div>
              <p className="eyebrow">PESTNEER VISION · YAPAY ZEKA ZARARLI SAYIMI</p>
              <h2>İstasyon {current?.deviceNumber || ''} — Yapışkan Kart Analizi</h2>
              <p>Fotoğrafı yükleyin, sayılan zararlıları + / − butonlarıyla veya yazarak düzenleyip istasyona aktarın.</p>
            </div>
            <button type="button" className="icon-button" onClick={() => setVisionOpen(false)}><X /></button>
          </div>
          <div className="vision-modal-inner" style={{ padding: '0 24px 20px', maxHeight: '78vh', overflowY: 'auto' }}>
            <Suspense fallback={<div className="empty-state">Yapay zekâ analiz aracı yükleniyor…</div>}>
              <PestneerVisionAnalyzer
                accessToken={accessToken}
                disabled={readOnly}
                onApply={handleVisionApply}
              />
            </Suspense>
          </div>
          <div className="modal-actions" style={{ padding: '14px 24px' }}>
            <button type="button" className="secondary-button" onClick={() => setVisionOpen(false)}>Vazgeç / Kapat</button>
          </div>
        </div>
      </div>
    )}
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

function CountSelect({
  label,
  value,
  disabled,
  className,
  onChange,
}: {
  label: string;
  value: number;
  disabled: boolean;
  className?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className={`activation-count-stepper-wrap ${className || ''}`}>
      <label>{label}</label>
      <div className="activation-count-stepper">
        <button
          type="button"
          className="stepper-btn minus"
          disabled={disabled || value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          title="1 Azalt"
        >
          −
        </button>
        <input
          type="number"
          min="0"
          max="99999"
          value={value === 0 ? '' : value}
          placeholder="0"
          disabled={disabled}
          onChange={(e) => {
            const val = e.target.value === '' ? 0 : Math.max(0, parseInt(e.target.value, 10) || 0);
            onChange(val);
          }}
        />
        <button
          type="button"
          className="stepper-btn plus"
          disabled={disabled}
          onClick={() => onChange(value + 1)}
          title="1 Artır"
        >
          +
        </button>
      </div>
    </div>
  );
}

function equipmentCatalogValue(value: string, options: string[]) {
  return options.find((option) => option.startsWith(`${value} - `)) ?? value;
}
