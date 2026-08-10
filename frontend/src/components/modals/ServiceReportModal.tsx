import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { AlertTriangle, Ban, Bug, Camera, Check, CheckCircle2, ChevronLeft, ChevronRight, Cloud, FileCheck2, ImagePlus, MapPinned, PackageCheck, Plus, QrCode, Save, Trash2, Undo2, WandSparkles, Wrench, X, Zap } from 'lucide-react';
import type { WorkOrder } from '../../types';
import { ReportConflictError, type ReportPhotoUpload, type ReportProductInput, type ReportStationInput, type ServiceReportRecord, type UpsertServiceReportInput } from '../../services/serviceReportApi';
import { getSitePlans, type SitePlanElement, type SitePlanRecord } from '../../services/sitePlanApi';
import type { VehicleStockCheck } from '../../services/fieldOperationsApi';
import { getLocalReportDraft, removeLocalReportDraft, saveLocalReportDraft, toOfflinePhotos } from '../../services/offlineFieldStore';
import { downloadStationLabelPdf, normalizeStationQrValue, parseStationQrValue } from '../../utils/stationQr';
import SignaturePad from './SignaturePad';
import QrScannerModal from './QrScannerModal';

type Props = {
  accessToken: string; order: WorkOrder; existing?: ServiceReportRecord; companyName: string; operatorName: string;
  previousReport?: ServiceReportRecord;
  vehicleStockItems?: VehicleStockCheck['items']; readOnly?: boolean; onClose: () => void;
  onSave: (input: UpsertServiceReportInput, photos: ReportPhotoUpload[]) => Promise<void>;
  onAddManualStock?: (input: { productName: string; quantity: number; unit: string }) => Promise<VehicleStockCheck['items'][number]>;
};

type FormState = Omit<UpsertServiceReportInput, 'finalize' | 'stations' | 'products' | 'areaSquareMeters' | 'baseUpdatedAt' | 'forceOverwrite'> & { areaSquareMeters: string };
type Stage = 'inspection' | 'report';

const blankStation = (): ReportStationInput => ({ deviceNumber: '', area: '', deviceType: 'B', targetPest: '', caughtCount: 0, hasActivity: false, plateChanged: false, deviceStatus: 'Unchecked', activityType: '', inaccessibilityReason: '', appliedAmount: 0, replacementQuantity: 0, notes: '' });
const blankProduct = (): ReportProductInput => ({ productName: '', licenseNumber: '', applicationMethod: '', dilutionRate: '', activeIngredient: '', antidote: '', packingQuantity: '', amountUsed: 0, unit: 'Mililitre' });

export default function ServiceReportModal({ accessToken, order, existing, previousReport, companyName, operatorName, vehicleStockItems = [], readOnly = false, onClose, onSave, onAddManualStock }: Props) {
  const [form, setForm] = useState<FormState>(() => createInitialForm(order, existing, companyName));
  const [stations, setStations] = useState<ReportStationInput[]>(existing?.stations.map(stripStationId) ?? []);
  const [products, setProducts] = useState<ReportProductInput[]>(existing?.products.map(stripProductId) ?? [blankProduct()]);
  const [sitePlan, setSitePlan] = useState<SitePlanRecord | null>(null);
  const [planLoading, setPlanLoading] = useState(!existing?.stations.length);
  const [planWarning, setPlanWarning] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('inspection');
  const [stationIndex, setStationIndex] = useState(0);
  const [signatureTarget, setSignatureTarget] = useState<'manager' | 'customer' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<ReportPhotoUpload[]>([]);
  const [manualStockTarget, setManualStockTarget] = useState<number | null>(null);
  const [draftReady, setDraftReady] = useState(readOnly);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [localSaveState, setLocalSaveState] = useState<'saved' | 'saving'>('saved');
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(existing?.updatedAt);
  const [conflict, setConflict] = useState<ServiceReportRecord | null>(null);
  const [conflictFinalize, setConflictFinalize] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [undoState, setUndoState] = useState<{ stations: ReportStationInput[]; message: string } | null>(null);

  useEffect(() => {
    if (!draftReady) return;
    let active = true;
    getSitePlans(accessToken).then((plans) => {
      if (!active) return;
      const matched = plans.find((plan) => plan.customerId === order.customerId && (order.branchId ? plan.branchId === order.branchId : !plan.branchId));
      if (matched) {
        setSitePlan(matched);
        if (existing?.stations.length || restoredDraft) setStations((current) => attachStationQrCodes(current, matched));
        else {
          const planned = stationsFromPlan(matched);
          const manualPrevious = (previousReport?.stations ?? []).filter((item) => !item.sitePlanElementId)
            .map((item) => resetStationForVisit(stripStationId(item)));
          setStations([...planned, ...manualPrevious]);
        }
      } else {
        if (!existing?.stations.length) setStations(previousReport?.stations.length ? previousReport.stations.map((item) => resetStationForVisit(stripStationId(item))) : [blankStation()]);
        setPlanWarning(previousReport?.stations.length ? 'Önceki ziyarette kurulan kalıcı istasyon listesi yüklendi. Yeni istasyonları opsiyonel olarak ekleyebilirsiniz.' : 'Bu şubedeki ilk ziyarette istasyon kurulum listesini oluşturun. Kaydettiğiniz istasyonlar sonraki ziyaretlerde otomatik açılır.');
      }
    }).catch(() => {
      if (!active) return;
      if (!existing?.stations.length) setStations([blankStation()]);
      setPlanWarning('Kroki bilgisi alınamadı. İstasyonları manuel ekleyebilirsiniz.');
    }).finally(() => { if (active) setPlanLoading(false); });
    return () => { active = false; };
  }, [accessToken, draftReady, existing?.stations.length, order.branchId, order.customerId, previousReport, restoredDraft]);

  useEffect(() => {
    if (readOnly) return;
    let active = true;
    getLocalReportDraft(order.recordId).then((draft) => {
      if (!active || !draft) return;
      setRestoredDraft(true);
      setForm({ ...draft.input, areaSquareMeters: draft.input.areaSquareMeters?.toString() ?? '' });
      setStations(draft.input.stations);
      setProducts(draft.input.products.length ? draft.input.products : [blankProduct()]);
      setPhotos(draft.photos.map((photo) => ({ file: new File([photo.blob], photo.name, { type: photo.type, lastModified: photo.lastModified }), location: photo.location ?? '', status: photo.status ?? 'Genel saha görünümü', description: photo.description ?? '' })));
      setStage(draft.stage);
      setStationIndex(Math.min(draft.stationIndex, Math.max(0, draft.input.stations.length - 1)));
      setBaseUpdatedAt(draft.input.baseUpdatedAt ?? existing?.updatedAt);
      setPlanLoading(false);
    }).finally(() => { if (active) setDraftReady(true); });
    return () => { active = false; };
  }, [existing?.updatedAt, order.recordId, readOnly]);

  useEffect(() => {
    if (readOnly || !draftReady || planLoading) return;
    setLocalSaveState('saving');
    const timer = window.setTimeout(() => {
      const input = buildInput(false);
      toOfflinePhotos(photos).then((offlinePhotos) => saveLocalReportDraft({ workOrderId: order.recordId, input, photos: offlinePhotos, stage, stationIndex, updatedAt: new Date().toISOString() }))
        .then(() => setLocalSaveState('saved')).catch(() => setLocalSaveState('saved'));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [form, stations, products, photos, stage, stationIndex, readOnly, draftReady, planLoading, baseUpdatedAt]);

  const currentStation = stations[stationIndex];
  const checkedCount = stations.filter((item) => item.deviceStatus !== 'Unchecked').length;
  const inspectionComplete = stations.length > 0 && checkedCount === stations.length;
  const progress = stations.length ? Math.round(checkedCount / stations.length * 100) : 0;
  const groupedStatus = useMemo(() => ({
    activity: stations.filter((item) => item.deviceStatus === 'Activity').length,
    damaged: stations.filter((item) => item.deviceStatus === 'Damaged').length,
    inaccessible: stations.filter((item) => item.deviceStatus === 'Inaccessible').length,
  }), [stations]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const updateStation = (index: number, patch: Partial<ReportStationInput>) => setStations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const updateProduct = (index: number, patch: Partial<ReportProductInput>) => setProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));

  const buildInput = (finalize: boolean, forceOverwrite = false): UpsertServiceReportInput => {
    const usedProducts = products.filter((item) => item.productName.trim());
    return { ...form, consumables: (usedProducts.length ? usedProducts.map((item) => `${item.productName}: ${item.amountUsed || 0} ${item.unit}`).join('; ') : form.consumables)?.slice(0, 1000), areaSquareMeters: form.areaSquareMeters ? Number(form.areaSquareMeters) : undefined, baseUpdatedAt, forceOverwrite, finalize, stations: stations.filter((item) => item.deviceNumber.trim() || item.area.trim()), products: usedProducts };
  };

  const submit = async (finalize: boolean, forceOverwrite = false) => {
    if (finalize && (!form.customerRepresentativeName?.trim() || !form.managerSignatureData || !form.customerSignatureData)) {
      setStage('report'); setError('Servisi bitirmek için müşteri yetkilisi adı ile uygulayıcı ve müşteri imzalarını tamamlayın.'); return;
    }
    setSaving(true); setError(null);
    try {
      await onSave(buildInput(finalize, forceOverwrite), photos);
      await removeLocalReportDraft(order.recordId);
    } catch (saveError) {
      if (saveError instanceof ReportConflictError) { setConflictFinalize(finalize); setConflict(saveError.current); }
      else setError(saveError instanceof Error ? saveError.message : 'Rapor kaydedilemedi.');
    }
    finally { setSaving(false); }
  };

  const rememberForUndo = (message: string) => {
    setUndoState({ stations: stations.map((item) => ({ ...item })), message });
    window.setTimeout(() => setUndoState((current) => current?.message === message ? null : current), 10_000);
  };

  const markAllNoActivity = () => {
    rememberForUndo('Tüm istasyonlar “Aktivite yok” olarak işaretlendi.');
    setStations((current) => current.map((station) => ({ ...station, deviceStatus: 'NoActivity', hasActivity: false, caughtCount: 0, activityType: '', targetPest: '', appliedVehicleStockItemId: undefined, appliedProductName: undefined, appliedAmount: 0, appliedUnit: undefined })));
  };

  const copyPreviousVisit = () => {
    if (!previousReport) return setError('Bu şube için önceki saha raporu bulunamadı.');
    rememberForUndo('Önceki ziyaret verileri getirildi.');
    setStations((current) => current.map((station) => {
      const previous = previousReport.stations.find((item) => item.sitePlanElementId && item.sitePlanElementId === station.sitePlanElementId) ?? previousReport.stations.find((item) => item.deviceNumber === station.deviceNumber);
      return previous ? { ...station, ...stripStationId(previous), sitePlanId: station.sitePlanId, sitePlanElementId: station.sitePlanElementId } : station;
    }));
  };

  const selectStationStatus = (value: string) => {
    if (!currentStation) return;
    if (currentStation.deviceStatus === value) {
      updateStation(stationIndex, clearStationStatus());
      setError(null);
      return;
    }
    const previous = previousReport?.stations.find((item) => item.sitePlanElementId === currentStation?.sitePlanElementId || item.deviceNumber === currentStation?.deviceNumber);
    const suggestedStock = previous?.appliedProductName ? vehicleStockItems.find((item) => item.productName === previous.appliedProductName) : undefined;
    updateStation(stationIndex, value === 'Activity' ? {
      ...clearStationStatus(), deviceStatus: value, hasActivity: true,
      appliedVehicleStockItemId: suggestedStock?.vehicleStockItemId,
      appliedProductName: suggestedStock?.productName,
      appliedAmount: previous?.appliedAmount ?? 0,
      appliedUnit: previous?.appliedUnit ?? (suggestedStock ? usageUnits(suggestedStock.unit)[0] : undefined),
    } : { ...clearStationStatus(), deviceStatus: value });
  };

  const handleQrScan = (value: string) => {
    const normalized = normalizeStationQrValue(value);
    const pairedIndex = stations.findIndex((station) => station.qrCode && normalizeStationQrValue(station.qrCode) === normalized);
    if (pairedIndex >= 0) {
      setScannerOpen(false);
      setStationIndex(pairedIndex);
      setError(stations[pairedIndex].deviceStatus !== 'Unchecked' ? `${stations[pairedIndex].deviceNumber} daha önce kontrol edildi. Kaydı gözden geçiriyorsunuz.` : null);
      return;
    }
    const payload = parseStationQrValue(value);
    if (!payload) return setError('QR kodu bu müşteri/şubenin güncel krokisindeki bir istasyonla eşleştirilmemiş.');
    if (payload.customerId !== order.customerId || (payload.branchId ?? '') !== (order.branchId ?? '')) return setError('Bu QR kod farklı bir müşteri veya şubeye ait.');
    const index = stations.findIndex((station) => station.sitePlanId === payload.sitePlanId && station.sitePlanElementId === payload.elementId);
    if (index < 0) return setError('QR kodundaki istasyon güncel kroki listesinde bulunamadı. Kroki revizyonunu kontrol edin.');
    setScannerOpen(false);
    setStationIndex(index);
    setError(stations[index].deviceStatus !== 'Unchecked' ? `${stations[index].deviceNumber} daha önce kontrol edildi. Kaydı gözden geçiriyorsunuz.` : null);
  };

  const nextStation = () => {
    const message = validateStation(currentStation);
    if (message) return setError(message);
    setError(null);
    if (stationIndex < stations.length - 1) setStationIndex((value) => value + 1);
  };

  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Saha hizmet raporu"><div className="modal service-report-modal station-report-modal">
    <div className="modal-header"><div><p className="eyebrow">SAHA HİZMET RAPORU · {order.id}</p><h2>{stage === 'inspection' ? 'İstasyon aktivasyon listesi' : existing ? 'Raporu düzenle' : 'Uygulama raporu'}</h2><p>{order.client} · {order.branch} · Operatör: {operatorName}</p></div><button className="icon-button" onClick={onClose}><X size={20} /></button></div>

    <nav className="field-report-steps"><button className={stage === 'inspection' ? 'active' : ''} onClick={() => setStage('inspection')}><span>1</span><div><strong>İstasyon kontrolü</strong><small>{checkedCount}/{stations.length || 0} nokta tamamlandı</small></div></button><button className={stage === 'report' ? 'active' : ''} onClick={() => inspectionComplete || readOnly ? setStage('report') : setError('Önce tüm istasyonların kontrol sonucunu girin.')}><span>2</span><div><strong>Rapor & imza</strong><small>Uygulama, ürün ve onay</small></div></button><div className={`local-draft-state ${localSaveState}`}><Cloud size={15} /><span>{readOnly ? 'Sunucu kaydı' : localSaveState === 'saving' ? 'Cihaza kaydediliyor…' : 'Cihaza kaydoldu'}</span></div></nav>

    {stage === 'inspection' ? <div className="station-inspection-stage">
      {!readOnly && <div className="fast-field-toolbar"><div><Zap size={18} /><span><strong>Hızlı saha modu</strong><small>Toplu başlangıç yapın, yalnızca istisnaları değiştirin.</small></span></div><button onClick={markAllNoActivity}><CheckCircle2 size={16} /> Tümünü aktivite yok yap</button><button disabled={!previousReport} onClick={copyPreviousVisit}><WandSparkles size={16} /> Önceki ziyaretten getir</button><button onClick={() => setScannerOpen(true)}><QrCode size={16} /> QR okut</button>{sitePlan && <button onClick={() => void downloadStationLabelPdf(sitePlan, stations, companyName).catch((downloadError) => setError(downloadError instanceof Error ? downloadError.message : 'QR etiketleri oluşturulamadı.'))}><QrCode size={16} /> Etiket PDF</button>}</div>}
      <div className="inspection-overview"><div><strong>{progress}%</strong><span>Kontrol ilerlemesi</span></div><div className="inspection-progress"><i style={{ width: `${progress}%` }} /></div><div className="inspection-metrics"><span><Bug /> {groupedStatus.activity} aktivite</span><span><Wrench /> {groupedStatus.damaged} kırık</span><span><Ban /> {groupedStatus.inaccessible} ulaşılamadı</span></div></div>
      {sitePlan && <div className="inspection-plan-note"><MapPinned /><div><strong>{sitePlan.title} · R{String(sitePlan.revision).padStart(2, '0')}</strong><span>{sitePlan.areaName} krokisindeki {stations.length} ekipman noktası otomatik yüklendi.</span></div></div>}
      {sitePlan && <StationRouteMap plan={sitePlan} stations={stations} activeIndex={stationIndex} previousReport={previousReport} onSelect={setStationIndex} />}
      {planWarning && <div className="inspection-warning"><AlertTriangle /><span>{planWarning}</span></div>}
      {!previousReport && !sitePlan && <div className="inspection-plan-note first-install"><MapPinned /><div><strong>İlk ziyaret · istasyon kurulumu</strong><span>Numara, konum ve ekipman kodunu girin. Bu liste şubeye bağlı kalır ve sonraki işlerde otomatik yüklenir.</span></div></div>}
      {planLoading ? <div className="inspection-loading">Kroki ve istasyon listesi hazırlanıyor…</div> : <div className="inspection-layout">
        <aside className="inspection-station-list">{stations.map((station, index) => <button className={`${index === stationIndex ? 'active' : ''} status-${station.deviceStatus.toLowerCase()}`} key={`${station.sitePlanElementId ?? 'manual'}-${index}`} onClick={() => setStationIndex(index)}><span>{station.deviceNumber || `Yeni ${index + 1}`}</span><small>{station.area || 'Alan girilmedi'}</small><em>{statusLabel(station.deviceStatus)}</em></button>)}{!readOnly && <button className="inspection-add-station" onClick={() => { setStations((items) => [...items, blankStation()]); setStationIndex(stations.length); }}><Plus /> Manuel istasyon ekle</button>}</aside>
        {currentStation && <main className="inspection-card"><header><div><p>{currentStation.deviceType} EKİPMAN NOKTASI</p><h3>{currentStation.deviceNumber || 'Yeni istasyon'}</h3><span>{currentStation.area || 'Alan bilgisi bekleniyor'}</span></div><b>{stationIndex + 1}/{stations.length}</b></header>
          {!currentStation.sitePlanElementId && <div className="inspection-manual-fields"><Field label="İstasyon numarası" value={currentStation.deviceNumber} onChange={(value) => updateStation(stationIndex, { deviceNumber: value.toUpperCase() })} disabled={readOnly} placeholder="M 01" /><Field label="Konum / alan" value={currentStation.area} onChange={(value) => updateStation(stationIndex, { area: value })} disabled={readOnly} placeholder="Fabrika üretim çıkışı" /><Field label="Ekipman kodu" value={currentStation.deviceType} onChange={(value) => updateStation(stationIndex, { deviceType: value.toUpperCase() })} disabled={readOnly} placeholder="M" /></div>}
          <div className="inspection-status-grid"><StatusButton icon={<Bug />} label="Aktivite var" value="Activity" station={currentStation} disabled={readOnly} onSelect={selectStationStatus} /><StatusButton icon={<CheckCircle2 />} label="Aktivite yok" value="NoActivity" station={currentStation} disabled={readOnly} onSelect={selectStationStatus} /><StatusButton icon={<Wrench />} label="Kırık / hasarlı" value="Damaged" station={currentStation} disabled={readOnly} onSelect={selectStationStatus} /><StatusButton icon={<Ban />} label="Ulaşılamadı" value="Inaccessible" station={currentStation} disabled={readOnly} onSelect={selectStationStatus} /></div>
          {currentStation.deviceStatus === 'Activity' && <ActivityFields station={currentStation} stockItems={vehicleStockItems} disabled={readOnly} onChange={(patch) => updateStation(stationIndex, patch)} />}
          {currentStation.deviceStatus === 'Damaged' && <DamageFields station={currentStation} stockItems={vehicleStockItems} disabled={readOnly} onChange={(patch) => updateStation(stationIndex, patch)} />}
          {currentStation.deviceStatus === 'Inaccessible' && <label className="inspection-wide-field">Ulaşılamama nedeni<textarea value={currentStation.inaccessibilityReason ?? ''} disabled={readOnly} onChange={(event) => updateStation(stationIndex, { inaccessibilityReason: event.target.value })} placeholder="Kapalı alan, üretim devam ediyor, ekipmanın önü kapalı…" /></label>}
          {currentStation.deviceStatus !== 'Unchecked' && <label className="inspection-wide-field">Saha açıklaması<textarea value={currentStation.notes ?? ''} disabled={readOnly} onChange={(event) => updateStation(stationIndex, { notes: event.target.value })} placeholder="İstasyon ve çevresiyle ilgili ek açıklama…" /></label>}
          <footer><button className="secondary-button" disabled={stationIndex === 0} onClick={() => { setError(null); setStationIndex((value) => Math.max(0, value - 1)); }}><ChevronLeft /> Önceki</button>{stationIndex < stations.length - 1 ? <button className="primary-button" onClick={nextStation}>Kaydet ve ilerle <ChevronRight /></button> : <button className="primary-button" disabled={!inspectionComplete && !readOnly} onClick={() => { const message = validateStation(currentStation); if (message) return setError(message); setError(null); setStage('report'); }}>Rapor bilgilerine geç <ChevronRight /></button>}</footer>
        </main>}
      </div>}
      {undoState && <div className="inspection-undo"><span>{undoState.message}</span><button onClick={() => { setStations(undoState.stations); setUndoState(null); }}><Undo2 size={15} /> Geri al <small>10 sn</small></button></div>}
      {error && <div className="modal-form-error">{error}</div>}
      {!readOnly && <div className="inspection-draft-actions"><button className="secondary-button" disabled={saving || planLoading} onClick={() => void submit(false)}><Save size={16} /> Kontrolü taslak kaydet</button></div>}
    </div> : <ReportDetails form={form} setField={setField} products={products} updateProduct={updateProduct} setProducts={setProducts} stations={stations} vehicleStockItems={vehicleStockItems} readOnly={readOnly} setSignatureTarget={setSignatureTarget} onAddManualStock={onAddManualStock ? () => { setProducts((current) => [...current, blankProduct()]); setManualStockTarget(products.length); } : undefined} />}

    {stage === 'report' && <><PhotoCapture photos={photos} existingPhotos={existing?.photos ?? []} readOnly={readOnly} onChange={setPhotos} /><div className="report-form-status"><FileCheck2 size={18} /><div><strong>{existing?.status === 'Finalized' ? 'Onaylanmış rapor' : 'Rapor onaya hazır'}</strong><span>{stations.length} istasyon · {groupedStatus.activity} aktivite · ürün ve sarf tüketimleri araç stoğundan düşülecek.</span></div></div>{error && <div className="modal-form-error">{error}</div>}<div className="modal-actions service-report-actions"><button className="secondary-button" onClick={() => setStage('inspection')}><ChevronLeft /> İstasyonlara dön</button><button className="secondary-button" onClick={onClose}>Kapat</button>{!readOnly && <><button className="secondary-button" disabled={saving} onClick={() => void submit(false)}><Save size={16} /> Taslak Kaydet</button><button className="primary-button" disabled={saving || !inspectionComplete} onClick={() => void submit(true)}><Check size={17} /> Raporu Onayla</button></>}</div></>}
  </div>{signatureTarget && <SignaturePad onClose={() => setSignatureTarget(null)} onSave={(image) => { setField(signatureTarget === 'manager' ? 'managerSignatureData' : 'customerSignatureData', image); setSignatureTarget(null); }} />}{manualStockTarget !== null && onAddManualStock && <ManualStockModal onClose={() => setManualStockTarget(null)} onSave={async (input) => { const item = await onAddManualStock(input); updateProduct(manualStockTarget, { vehicleStockItemId: item.vehicleStockItemId, productName: item.productName, unit: usageUnits(item.unit)[0] }); setManualStockTarget(null); }} />}{scannerOpen && <QrScannerModal onClose={() => setScannerOpen(false)} onScan={handleQrScan} />}{conflict && <div className="nested-modal-layer"><div className="report-conflict-dialog"><AlertTriangle size={30} /><h3>İki farklı rapor sürümü bulundu</h3><p>Sunucudaki rapor {formatDraftTime(conflict.updatedAt)} tarihinde güncellendi. Bu cihazdaki taslakla üzerine yazabilir veya güncel sunucu sürümünü kullanabilirsiniz.</p><div><button className="secondary-button" onClick={() => { setForm(createInitialForm(order, conflict, companyName)); setStations(conflict.stations.map(stripStationId)); setProducts(conflict.products.map(stripProductId)); setBaseUpdatedAt(conflict.updatedAt); setConflict(null); }}>Sunucudakini kullan</button><button className="primary-button" onClick={() => { setConflict(null); void submit(conflictFinalize, true); }}>Bu cihazdaki sürümü gönder</button></div></div></div>}</div>;
}

function StationRouteMap({ plan, stations, activeIndex, previousReport, onSelect }: { plan: SitePlanRecord; stations: ReportStationInput[]; activeIndex: number; previousReport?: ServiceReportRecord; onSelect: (index: number) => void }) {
  const elements = new Map(plan.canvas.elements.filter((item) => item.type === 'station').map((item) => [item.id, item]));
  const points = stations.map((station, index) => {
    const element = station.sitePlanElementId ? elements.get(station.sitePlanElementId) : undefined;
    return element ? { index, x: element.x + element.width / 2, y: element.y + element.height / 2, station } : null;
  }).filter((item): item is NonNullable<typeof item> => item !== null);
  const currentIds = new Set(stations.map((item) => item.sitePlanElementId).filter(Boolean));
  const previousIds = new Set(previousReport?.stations.map((item) => item.sitePlanElementId).filter(Boolean) ?? []);
  const added = previousReport ? [...currentIds].filter((id) => !previousIds.has(id)).length : 0;
  const removed = previousReport ? [...previousIds].filter((id) => !currentIds.has(id)).length : 0;
  return <section className="station-route-map"><header><div><strong>Kontrol sırası ve kroki noktaları</strong><small>Noktaya dokunarak doğrudan istasyonu açabilirsiniz.</small></div>{previousReport && <span className={added || removed ? 'changed' : ''}>{added ? `+${added} yeni` : ''}{added && removed ? ' · ' : ''}{removed ? `-${removed} kaldırılan` : added === 0 ? 'Kroki değişikliği yok' : ''}</span>}</header><div><svg viewBox={`0 0 ${plan.canvas.width} ${plan.canvas.height}`} role="img" aria-label="İstasyon kontrol sırası">{points.length > 1 && <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#78a9d5" strokeWidth="7" strokeDasharray="18 14" strokeLinecap="round" />}{points.map((point) => <g key={point.station.sitePlanElementId} className={`route-point status-${point.station.deviceStatus.toLowerCase()} ${point.index === activeIndex ? 'active' : ''}`} onClick={() => onSelect(point.index)} role="button"><circle cx={point.x} cy={point.y} r={point.index === activeIndex ? 28 : 22} /><text x={point.x} y={point.y + 5} textAnchor="middle">{point.index + 1}</text></g>)}</svg></div></section>;
}

function ReportDetails({ form, setField, products, updateProduct, setProducts, stations, vehicleStockItems, readOnly, setSignatureTarget, onAddManualStock }: { form: FormState; setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void; products: ReportProductInput[]; updateProduct: (index: number, patch: Partial<ReportProductInput>) => void; setProducts: Dispatch<SetStateAction<ReportProductInput[]>>; stations: ReportStationInput[]; vehicleStockItems: VehicleStockCheck['items']; readOnly: boolean; setSignatureTarget: (value: 'manager' | 'customer') => void; onAddManualStock?: () => void }) {
  return <div className="service-report-details"><section className="report-form-section"><header><span>1</span><div><strong>Firma ve uygulama bilgileri</strong><small>Resmi EK-1 alanları</small></div></header><div className="form-grid report-form-grid"><Field label="Uygulayıcı firma" value={form.firmName} onChange={(value) => setField('firmName', value)} disabled={readOnly} /><Field label="Mesul müdür" value={form.responsibleManager ?? ''} onChange={(value) => setField('responsibleManager', value)} disabled={readOnly} /><Field label="Firma adresi" value={form.firmAddress ?? ''} onChange={(value) => setField('firmAddress', value)} disabled={readOnly} wide /><Field label="Firma telefonu" value={form.firmPhone ?? ''} onChange={(value) => setField('firmPhone', value)} disabled={readOnly} /><Field label="İzin tarih / sayısı" value={form.permissionNumber ?? ''} onChange={(value) => setField('permissionNumber', value)} disabled={readOnly} /><Field label="Ekip sorumlusu" value={form.teamManager ?? ''} onChange={(value) => setField('teamManager', value)} disabled={readOnly} /><Field label="Hedef zararlı" value={form.targetPests ?? ''} onChange={(value) => setField('targetPests', value)} disabled={readOnly} placeholder="Hamamböceği, kemirgen, karasinek…" /><Field label="Alan (m²)" value={form.areaSquareMeters} onChange={(value) => setField('areaSquareMeters', value)} disabled={readOnly} type="number" /><Field label="Mahal türü" value={form.residenceType ?? ''} onChange={(value) => setField('residenceType', value)} disabled={readOnly} /><WorkTypeMultiSelect value={form.workType ?? ''} disabled={readOnly} onChange={(value) => setField('workType', value)} /><TextField label="Güvenlik önlemleri" value={form.safetyMeasures ?? ''} onChange={(value) => setField('safetyMeasures', value)} disabled={readOnly} wide /></div></section>
    <section className="report-form-section"><header><span>2</span><div><strong>İstasyon kontrol özeti</strong><small>Krokiden alınan saha sonuçları</small></div></header><div className="report-entry-table-wrap"><table className="report-entry-table"><thead><tr><th>No</th><th>Alan</th><th>Durum</th><th>Zararlı</th><th>Adet</th><th>Ürün / Sarf</th></tr></thead><tbody>{stations.map((station) => <tr key={`${station.sitePlanElementId}-${station.deviceNumber}`}><td><strong>{station.deviceNumber}</strong></td><td>{station.area}</td><td>{statusLabel(station.deviceStatus)}</td><td>{station.targetPest || '—'}</td><td>{station.caughtCount || '—'}</td><td>{station.appliedProductName ? `${station.appliedProductName} · ${station.appliedAmount} ${station.appliedUnit}` : station.replacementProductName ? `${station.replacementProductName} · ${station.replacementQuantity} ${station.replacementUnit}` : '—'}</td></tr>)}</tbody></table></div></section>
    <section className="report-form-section"><header><span>3</span><div><strong>Ürün ve sarf tüketimleri</strong><small>Araç stoğundan seçilir; rapor onayında stoktan otomatik düşer</small></div>{!readOnly && <div className="report-stock-actions"><button onClick={() => setProducts((current) => [...current, blankProduct()])}><Plus size={15} /> Stoktan seç</button>{onAddManualStock && <button onClick={onAddManualStock}><PackageCheck size={15} /> Manuel sarf ekle</button>}</div>}</header><div className="report-product-list">{products.map((product, index) => <article key={index}><div className="form-grid report-form-grid"><StockSelect label="Araç stoğundan ürün / sarf" value={product.vehicleStockItemId} stockItems={vehicleStockItems} disabled={readOnly} onChange={(stock) => updateProduct(index, { vehicleStockItemId: stock?.vehicleStockItemId, productName: stock?.productName ?? '', unit: stock ? usageUnits(stock.unit)[0] : 'Adet' })} /><Field label="Ruhsat / ürün bilgisi" value={product.licenseNumber ?? ''} onChange={(value) => updateProduct(index, { licenseNumber: value })} disabled={readOnly} /><Field label="Kullanım yeri / yöntemi" value={product.applicationMethod ?? ''} onChange={(value) => updateProduct(index, { applicationMethod: value })} disabled={readOnly} /><Field label="Etken madde / sarf türü" value={product.activeIngredient ?? ''} onChange={(value) => updateProduct(index, { activeIngredient: value })} disabled={readOnly} /><Field label="Kullanılan miktar" value={String(product.amountUsed || '')} onChange={(value) => updateProduct(index, { amountUsed: Number(value) })} disabled={readOnly} type="number" /><label>Birim<select value={product.unit} disabled={readOnly || !product.vehicleStockItemId} onChange={(event) => updateProduct(index, { unit: event.target.value })}>{usageUnits(vehicleStockItems.find((item) => item.vehicleStockItemId === product.vehicleStockItemId)?.unit).map((unit) => <option key={unit}>{unit}</option>)}</select></label></div>{!readOnly && products.length > 1 && <button className="report-product-remove" onClick={() => setProducts((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /> Kalemi kaldır</button>}</article>)}</div></section>
    <section className="report-form-section"><header><span>4</span><div><strong>Sonuç ve öneriler</strong><small>Saha bulguları ve düzeltici faaliyet</small></div></header><div className="form-grid report-form-grid"><TextField label="Yapılan uygulama özeti" value={form.applicationSummary ?? ''} onChange={(value) => setField('applicationSummary', value)} disabled={readOnly} wide /><TextField label="Saha bulguları" value={form.findings ?? ''} onChange={(value) => setField('findings', value)} disabled={readOnly} /><TextField label="Düzeltici faaliyetler" value={form.correctiveActions ?? ''} onChange={(value) => setField('correctiveActions', value)} disabled={readOnly} /><TextField label="Öneriler" value={form.recommendations ?? ''} onChange={(value) => setField('recommendations', value)} disabled={readOnly} wide /></div></section>
    <section className="report-form-section final-signature-section"><header><span>5</span><div><strong>İş bitimi dijital onayı</strong><small>İmzalar tüm istasyonlar tamamlandıktan sonra yalnızca bir kez alınır</small></div></header><div className="report-signature-grid"><SignatureCard label="Uygulayıcı / ekip sorumlusu" value={form.managerSignatureData} disabled={readOnly} onClick={() => setSignatureTarget('manager')} /><div className="report-customer-sign"><Field label="Müşteri yetkilisi" value={form.customerRepresentativeName ?? ''} onChange={(value) => setField('customerRepresentativeName', value)} disabled={readOnly} /><SignatureCard label="Müşteri yetkilisi imzası" value={form.customerSignatureData} disabled={readOnly} onClick={() => setSignatureTarget('customer')} /></div></div><EmailRecipientsField value={form.additionalEmailRecipients ?? []} disabled={readOnly} onChange={(value) => setField('additionalEmailRecipients', value)} /></section></div>;
}

function EmailRecipientsField({ value, disabled, onChange }: { value: string[]; disabled: boolean; onChange: (value: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const items = draft.split(/[;,\s]+/).map((item) => item.trim().toLowerCase()).filter(Boolean);
    const valid = items.filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item));
    if (valid.length) onChange(Array.from(new Set([...value, ...valid])).slice(0, 10));
    setDraft('');
  };
  return <div className="report-email-recipients"><div><strong>Rapor e-posta dağıtımı</strong><small>PDF; ilaçlama firması, çatı müşteri ve şube e-postasına otomatik gönderilir. İsterseniz ek alıcı ekleyin.</small></div>{value.length > 0 && <div className="report-email-chips">{value.map((email) => <button type="button" disabled={disabled} key={email} onClick={() => onChange(value.filter((item) => item !== email))}>{email}{!disabled && <X size={13} />}</button>)}</div>}{!disabled && <div className="report-email-add"><input type="email" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} placeholder="Opsiyonel ek e-posta" /><button type="button" onClick={add} disabled={!draft.trim()}><Plus size={15} /> Ekle</button></div>}</div>;
}

function WorkTypeMultiSelect({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  const selected = value.split(/[,;]+/).map((item) => item.trim()).filter(Boolean);
  const toggle = (item: string) => onChange((selected.includes(item) ? selected.filter((value) => value !== item) : [...selected, item]).join(', '));
  return <fieldset className="work-type-multi form-field-wide" disabled={disabled}><legend>İş türü <small>Birden fazla seçilebilir</small></legend><div>{workTypeOptions.map((item) => <button type="button" aria-pressed={selected.includes(item)} className={selected.includes(item) ? 'active' : ''} key={item} onClick={() => toggle(item)}><Check size={14} />{item}</button>)}</div></fieldset>;
}

function PhotoCapture({ photos, existingPhotos, readOnly, onChange }: { photos: ReportPhotoUpload[]; existingPhotos: ServiceReportRecord['photos']; readOnly: boolean; onChange: Dispatch<SetStateAction<ReportPhotoUpload[]>> }) {
  const update = (index: number, patch: Partial<Omit<ReportPhotoUpload, 'file'>>) => onChange((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  return <section className="field-photo-capture"><div><span><Camera size={18} /></span><div><strong>Saha fotoğrafları</strong><small>Her fotoğrafa yer, durum ve açıklama ekleyin. Kayıtlar çevrimdışı da korunur.</small></div></div>{!readOnly && <label><ImagePlus size={16} /> Fotoğraf ekle<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={(event) => { const files = Array.from(event.target.files ?? []).slice(0, Math.max(0, 8 - photos.length)); onChange((current) => [...current, ...files.map((file) => ({ file, location: '', status: 'Genel saha görünümü', description: '' }))]); event.currentTarget.value = ''; }} /></label>}<div className="field-photo-details">{photos.map((photo, index) => <article key={`${photo.file.name}-${photo.file.lastModified}-${index}`}><header><span><ImagePlus size={15} />{photo.file.name}</span><button type="button" aria-label="Fotoğrafı kaldır" onClick={() => onChange((current) => current.filter((_, itemIndex) => itemIndex !== index))}><X size={15} /></button></header><div><label>Yer / bölüm<input maxLength={240} value={photo.location} onChange={(event) => update(index, { location: event.target.value })} placeholder="Örn. Mutfak, depo, M-01 çevresi" /></label><label>Durum<select value={photo.status} onChange={(event) => update(index, { status: event.target.value })}>{photoStatusOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label className="photo-description">Açıklama<textarea maxLength={1000} value={photo.description} onChange={(event) => update(index, { description: event.target.value })} placeholder="Görülen durum, yapılan işlem veya öneriyi yazın…" /></label></div></article>)}{existingPhotos.map((photo) => <article className="uploaded" key={photo.id}><header><span><CheckCircle2 size={15} />{photo.fileName}</span><em>Gönderildi</em></header><div><p><b>Yer:</b> {photo.location || 'Belirtilmedi'}</p><p><b>Durum:</b> {photo.status || 'Genel saha görünümü'}</p><p><b>Açıklama:</b> {photo.description || '—'}</p></div></article>)}{photos.length === 0 && existingPhotos.length === 0 && <em>Yeni fotoğraf seçilmedi.</em>}</div></section>;
}

function ManualStockModal({ onClose, onSave }: { onClose: () => void; onSave: (input: { productName: string; quantity: number; unit: string }) => Promise<void> }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); setSaving(true); setError(null); try { await onSave({ productName: String(data.get('productName')).trim(), quantity: Number(data.get('quantity')), unit: String(data.get('unit')) }); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Sarf malzemesi araç stoğuna eklenemedi.'); setSaving(false); } };
  return <div className="nested-modal-layer"><div className="manual-stock-modal"><header><div><PackageCheck /><span><strong>Manuel sarf malzemesi</strong><small>Kalem araç stoğuna eklenir ve bu raporda seçilir.</small></span></div><button type="button" onClick={onClose}><X /></button></header><form onSubmit={submit}><label>Ürün / sarf adı<input name="productName" required minLength={2} maxLength={160} placeholder="Yapışkan plaka, yem istasyonu…" /></label><div><label>Miktar<input name="quantity" type="number" required min="0.001" step="0.001" defaultValue="1" /></label><label>Birim<select name="unit" defaultValue="Adet"><option>Adet</option><option>Litre</option><option>Kilogram</option></select></label></div>{error && <div className="modal-form-error">{error}</div>}<footer><button type="button" className="secondary-button" onClick={onClose}>Vazgeç</button><button className="primary-button" disabled={saving}>{saving ? 'Ekleniyor…' : 'Stoğa ekle ve seç'}</button></footer></form></div></div>;
}

function ActivityFields({ station, stockItems, disabled, onChange }: { station: ReportStationInput; stockItems: VehicleStockCheck['items']; disabled: boolean; onChange: (patch: Partial<ReportStationInput>) => void }) {
  return <section className="inspection-conditional"><h4><Bug /> Aktivite ayrıntıları</h4><div className="form-grid"><label>Aktivite türü<select value={station.activityType ?? ''} disabled={disabled} onChange={(event) => onChange({ activityType: event.target.value })}><option value="">Seçin</option>{activityTypes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label><label>Zararlı türü<input list="field-pest-types" value={station.targetPest ?? ''} disabled={disabled} onChange={(event) => onChange({ targetPest: event.target.value })} placeholder="Ev faresi, sıçan…" /><datalist id="field-pest-types">{pestTypes.map((item) => <option value={item} key={item} />)}</datalist></label><Field label="Görülen / yakalanan adet" value={String(station.caughtCount || '')} onChange={(value) => onChange({ caughtCount: Number(value), hasActivity: Number(value) > 0 })} disabled={disabled} type="number" /><StockSelect label="Kullanılan ürün" value={station.appliedVehicleStockItemId} stockItems={stockItems} disabled={disabled} onChange={(stock) => onChange({ appliedVehicleStockItemId: stock?.vehicleStockItemId, appliedProductName: stock?.productName, appliedUnit: stock ? usageUnits(stock.unit)[0] : undefined })} /><Field label="Kullanılan miktar" value={String(station.appliedAmount || '')} onChange={(value) => onChange({ appliedAmount: Number(value) })} disabled={disabled} type="number" /><label>Birim<select value={station.appliedUnit ?? ''} disabled={disabled || !station.appliedVehicleStockItemId} onChange={(event) => onChange({ appliedUnit: event.target.value })}>{usageUnits(stockItems.find((item) => item.vehicleStockItemId === station.appliedVehicleStockItemId)?.unit).map((unit) => <option key={unit}>{unit}</option>)}</select></label></div></section>;
}

function DamageFields({ station, stockItems, disabled, onChange }: { station: ReportStationInput; stockItems: VehicleStockCheck['items']; disabled: boolean; onChange: (patch: Partial<ReportStationInput>) => void }) {
  const replacing = (station.replacementQuantity ?? 0) > 0;
  return <section className="inspection-conditional damaged"><h4><Wrench /> Hasarlı ekipman işlemi</h4><label className="inspection-check"><input type="checkbox" checked={replacing} disabled={disabled} onChange={(event) => onChange(event.target.checked ? { replacementQuantity: 1, replacementUnit: 'Adet' } : { replacementQuantity: 0, replacementVehicleStockItemId: undefined, replacementProductName: undefined, replacementUnit: undefined })} /> Yeni istasyon / ekipman yerleştirildi</label>{replacing && <div className="form-grid"><StockSelect label="Yerleştirilen ekipman" value={station.replacementVehicleStockItemId} stockItems={stockItems} disabled={disabled} onChange={(stock) => onChange({ replacementVehicleStockItemId: stock?.vehicleStockItemId, replacementProductName: stock?.productName, replacementUnit: stock ? usageUnits(stock.unit)[0] : 'Adet' })} /><Field label="Miktar" value={String(station.replacementQuantity || '')} onChange={(value) => onChange({ replacementQuantity: Number(value) })} disabled={disabled} type="number" /><label>Birim<select value={station.replacementUnit ?? 'Adet'} disabled={disabled} onChange={(event) => onChange({ replacementUnit: event.target.value })}>{usageUnits(stockItems.find((item) => item.vehicleStockItemId === station.replacementVehicleStockItemId)?.unit ?? 'Adet').map((unit) => <option key={unit}>{unit}</option>)}</select></label></div>}</section>;
}

function StockSelect({ label, value, stockItems, disabled, onChange }: { label: string; value?: string; stockItems: VehicleStockCheck['items']; disabled: boolean; onChange: (item?: VehicleStockCheck['items'][number]) => void }) {
  return <label className="form-field-wide">{label}<select value={value ?? ''} disabled={disabled} onChange={(event) => onChange(stockItems.find((item) => item.vehicleStockItemId === event.target.value))}><option value="">Araç ürünü seçin</option>{stockItems.filter((item) => item.vehicleStockItemId && (item.quantity > 0 || item.vehicleStockItemId === value)).map((item) => <option value={item.vehicleStockItemId} key={item.vehicleStockItemId}>{item.productName} · {item.quantity} {item.unit}</option>)}</select></label>;
}

function StatusButton({ icon, label, value, station, disabled, onSelect }: { icon: React.ReactNode; label: string; value: string; station: ReportStationInput; disabled: boolean; onSelect: (value: string) => void }) { const active = station.deviceStatus === value; return <button type="button" aria-pressed={active} aria-label={`${label}${active ? ', seçimi kaldırmak için tekrar dokunun' : ''}`} className={active ? 'active' : ''} disabled={disabled} onClick={() => onSelect(value)}>{icon}<span>{label}</span>{active && <small>Tekrar dokun: kaldır</small>}</button>; }
function Field({ label, value, onChange, disabled, wide = false, type = 'text', placeholder }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; wide?: boolean; type?: string; placeholder?: string }) { return <label className={wide ? 'form-field-wide' : ''}>{label}<input type={type} min={type === 'number' ? '0' : undefined} value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>; }
function TextField({ label, value, onChange, disabled, wide = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; wide?: boolean }) { return <label className={wide ? 'form-field-wide' : ''}>{label}<textarea value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>; }
function SignatureCard({ label, value, disabled, onClick }: { label: string; value?: string; disabled?: boolean; onClick: () => void }) { return <button className={`report-signature-card ${value ? 'signed' : ''}`} disabled={disabled} onClick={onClick}>{value ? <img src={value} alt={`${label} imzası`} /> : <Plus size={21} />}<span>{value ? 'İmza kaydedildi' : label}</span></button>; }

function stationsFromPlan(plan: SitePlanRecord): ReportStationInput[] {
  const rectangles = plan.canvas.elements.filter((item) => item.type === 'rect');
  return plan.canvas.elements.filter((item) => item.type === 'station').map((item, index) => {
    const equipment = plan.canvas.equipmentTypes.find((type) => type.id === item.equipmentTypeId);
    return { ...blankStation(), sitePlanId: plan.id, sitePlanElementId: item.id, qrCode: item.qrCode, deviceNumber: item.stationNumber?.trim() || `${equipment?.code ?? 'N'} ${String(index + 1).padStart(2, '0')}`, area: containingArea(item, rectangles) ?? plan.areaName, deviceType: equipment?.code ?? 'Other' };
  });
}
function attachStationQrCodes(stations: ReportStationInput[], plan: SitePlanRecord) { const qrCodes = new Map(plan.canvas.elements.filter((item) => item.type === 'station').map((item) => [item.id, item.qrCode])); return stations.map((station) => ({ ...station, qrCode: station.qrCode ?? (station.sitePlanElementId ? qrCodes.get(station.sitePlanElementId) : undefined) })); }
function containingArea(station: SitePlanElement, rectangles: SitePlanElement[]) { const x = station.x + station.width / 2; const y = station.y + station.height / 2; return rectangles.filter((item) => x >= Math.min(item.x, item.x + item.width) && x <= Math.max(item.x, item.x + item.width) && y >= Math.min(item.y, item.y + item.height) && y <= Math.max(item.y, item.y + item.height) && item.text?.trim()).sort((a, b) => Math.abs(a.width * a.height) - Math.abs(b.width * b.height))[0]?.text?.trim(); }
function validateStation(station?: ReportStationInput) { if (!station) return 'Kontrol edilecek istasyon bulunamadı.'; if (!station.deviceNumber.trim() || !station.area.trim()) return 'İstasyon numarası ve konumunu girin.'; if (station.deviceStatus === 'Unchecked') return `${station.deviceNumber} için kontrol sonucunu seçin.`; if (station.deviceStatus === 'Inaccessible' && !station.inaccessibilityReason?.trim()) return `${station.deviceNumber} için ulaşılamama nedenini yazın.`; if (station.deviceStatus === 'Activity' && (!station.activityType || !station.targetPest?.trim() || station.caughtCount < 1)) return `${station.deviceNumber} için aktivite türünü, zararlıyı ve adedi girin.`; if (station.deviceStatus === 'Activity' && (!station.appliedVehicleStockItemId || !station.appliedAmount || !station.appliedUnit)) return `${station.deviceNumber} için kullanılan araç ürününü ve miktarı girin.`; if ((station.replacementQuantity ?? 0) > 0 && !station.replacementVehicleStockItemId) return `${station.deviceNumber} için yerleştirilen yeni ekipmanı seçin.`; return null; }
function createInitialForm(order: WorkOrder, report: ServiceReportRecord | undefined, companyName: string): FormState { return { firmName: report?.firmName ?? companyName, firmAddress: report?.firmAddress ?? '', firmPhone: report?.firmPhone ?? '', firmWeb: report?.firmWeb ?? '', responsibleManager: report?.responsibleManager ?? '', permissionNumber: report?.permissionNumber ?? '', teamManager: report?.teamManager ?? '', targetPests: report?.targetPests ?? '', residenceType: report?.residenceType ?? 'İşyeri', areaSquareMeters: report?.areaSquareMeters?.toString() ?? '', workType: report?.workType ?? order.service, consumables: report?.consumables ?? '', safetyMeasures: report?.safetyMeasures ?? 'Uygulama alanı bilgilendirildi, gerekli kişisel koruyucu donanım kullanıldı.', applicationSummary: report?.applicationSummary ?? order.completionNote ?? '', findings: report?.findings ?? '', correctiveActions: report?.correctiveActions ?? '', recommendations: report?.recommendations ?? order.recommendation ?? '', customerRepresentativeName: report?.customerRepresentativeName ?? '', managerSignatureData: report?.managerSignatureData ?? '', customerSignatureData: report?.customerSignatureData ?? '', additionalEmailRecipients: report?.additionalEmailRecipients ?? [] }; }
function stripStationId({ id: _, ...station }: ServiceReportRecord['stations'][number]): ReportStationInput { return station; }
function stripProductId({ id: _, ...product }: ServiceReportRecord['products'][number]): ReportProductInput { return product; }
function resetStationForVisit(station: ReportStationInput): ReportStationInput { return { ...station, ...clearStationStatus(), notes: '', plateChanged: false }; }
function usageUnits(stockUnit?: string) { if (stockUnit === 'Litre') return ['Mililitre', 'Litre']; if (stockUnit === 'Kilogram') return ['Gram', 'Kilogram']; return [stockUnit ?? 'Adet']; }
function clearStationStatus(): Partial<ReportStationInput> { return { deviceStatus: 'Unchecked', hasActivity: false, caughtCount: 0, activityType: '', targetPest: '', appliedVehicleStockItemId: undefined, appliedProductName: undefined, appliedAmount: 0, appliedUnit: undefined, replacementVehicleStockItemId: undefined, replacementProductName: undefined, replacementQuantity: 0, replacementUnit: undefined, inaccessibilityReason: '' }; }
function statusLabel(value: string) { return ({ Unchecked: 'Kontrol bekliyor', NoActivity: 'Aktivite yok', Activity: 'Aktivite var', Damaged: 'Kırık / hasarlı', Inaccessible: 'Ulaşılamadı', Missing: 'Kayıp', Replaced: 'Değiştirildi', Passive: 'Pasif', Active: 'Aktif' } as Record<string, string>)[value] ?? value; }
function formatDraftTime(value: string) { return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
const activityTypes = [{ value: 'Sighting', label: 'Canlı gözlem' }, { value: 'Capture', label: 'Yakalama' }, { value: 'Droppings', label: 'Dışkı / iz' }, { value: 'Gnawing', label: 'Kemirme bulgusu' }, { value: 'Track', label: 'Ayak izi / geçiş' }, { value: 'Nest', label: 'Yuva / üreme alanı' }, { value: 'Other', label: 'Diğer' }];
const pestTypes = ['Ev faresi', 'Tarla faresi', 'Norveç sıçanı', 'Çatı sıçanı', 'Alman hamamböceği', 'Doğu hamamböceği', 'Amerikan hamamböceği', 'Karasinek', 'Sirke sineği', 'Lağım sineği', 'Güve', 'Un biti', 'Testere dişli böcek', 'Karınca', 'Gümüşçün'];
const workTypeOptions = ['Kemirgen kontrolü', 'Sinek cihazı kontrolü', 'Uçan haşere kontrolü', 'Hamamböceği ve yürüyen haşere kontrolü', 'Böcek monitörü kontrolü', 'Depolanmış ürün zararlıları kontrolü', 'Larva ve drenaj kontrolü', 'Genel biyosidal uygulama', 'Dezenfeksiyon', 'Acil çağrı / noktasal müdahale', 'Yapısal risk ve hijyen kontrolü'];
const photoStatusOptions = ['Genel saha görünümü', 'Uygulama öncesi', 'Uygulama sonrası', 'Uygunsuzluk', 'İstasyon / ekipman', 'Erişim sorunu', 'Düzeltici faaliyet', 'Müşteri bildirimi'];
