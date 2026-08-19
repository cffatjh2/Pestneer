import { useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { AlertTriangle, Ban, Bug, Camera, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Cloud, FileCheck2, ImagePlus, MapPinned, PackageCheck, Plus, QrCode, Save, Search, Trash2, Undo2, WandSparkles, Wrench, X, Zap } from 'lucide-react';
import type { WorkOrder } from '../../types';
import { getPreviousServiceReport, getServiceReportCatalog, ReportConflictError, type ReportPhotoUpload, type ReportProductInput, type ReportStationInput, type ServiceReportCatalog, type ServiceReportRecord, type UpsertServiceReportInput } from '../../services/serviceReportApi';
import { getSitePlans, type SitePlanElement, type SitePlanRecord } from '../../services/sitePlanApi';
import type { VehicleStockCheck } from '../../services/fieldOperationsApi';
import { getLocalReportDraft, removeLocalReportDraft, saveLocalReportDraft, toOfflinePhotos } from '../../services/offlineFieldStore';
import { downloadStationLabelPdf, normalizeStationQrValue, parseStationQrValue } from '../../utils/stationQr';
import { getStoredCompanyEk1Defaults } from '../../services/companySettingsStorage';
import SignaturePad from './SignaturePad';
import QrScannerModal from './QrScannerModal';
import PestneerVisionAnalyzer from '../vision/PestneerVisionAnalyzer';
import { compressImages } from '../../utils/imageCompression';

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
  const [planLoading, setPlanLoading] = useState(false);
  const [planWarning, setPlanWarning] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('report');
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
  const [referenceReport, setReferenceReport] = useState<ServiceReportRecord | undefined>(previousReport);
  const [catalog, setCatalog] = useState<ServiceReportCatalog>(fallbackReportCatalog);

  useEffect(() => {
    let active = true;
    Promise.all([getPreviousServiceReport(accessToken, order.recordId), getServiceReportCatalog(accessToken)])
      .then(([report, loadedCatalog]) => { if (!active) return; if (report) setReferenceReport(report); setCatalog(loadedCatalog); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [accessToken, order.recordId]);

  useEffect(() => {
    setPlanLoading(false);
    setPlanWarning(null);
    setSitePlan(null);
    if (!existing?.stations.length) setStations([]);
  }, [existing?.stations.length, order.recordId]);

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
      setStage('report');
      setStationIndex(0);
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
    return { ...form, consumables: (usedProducts.length ? usedProducts.map((item) => `${item.productName}: ${item.amountUsed || 0} ${item.unit}`).join('; ') : form.consumables)?.slice(0, 1000), areaSquareMeters: form.areaSquareMeters ? Number(form.areaSquareMeters) : undefined, baseUpdatedAt, forceOverwrite, finalize, stations: existing?.stations.length ? stations.filter((item) => item.deviceNumber.trim() || item.area.trim()) : [], products: usedProducts };
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
    if (!referenceReport) return setError('Bu şube için önceki saha raporu bulunamadı.');
    rememberForUndo('Önceki ziyaret verileri getirildi.');
    setStations((current) => current.map((station) => {
      const previous = referenceReport.stations.find((item) => item.sitePlanElementId && item.sitePlanElementId === station.sitePlanElementId) ?? referenceReport.stations.find((item) => item.deviceNumber === station.deviceNumber);
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
    const previous = referenceReport?.stations.find((item) => item.sitePlanElementId === currentStation?.sitePlanElementId || item.deviceNumber === currentStation?.deviceNumber);
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

  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Saha hizmet raporu"><div className="modal service-report-modal station-report-modal">
    <div className="modal-header"><div><p className="eyebrow">EK-1 BİYOSİDAL UYGULAMA FORMU · {order.id}</p><h2>{existing ? 'EK-1 formunu düzenle' : 'EK-1 uygulama formu'}</h2><p>{order.client} · {order.branch} · Uygulayıcı: {operatorName}</p></div><button className="icon-button" onClick={onClose}><X size={20} /></button></div>

    <nav className="field-report-steps field-report-single-step"><button className="active"><span>1</span><div><strong>Uygulama & onay</strong><small>Ürün, saha sonucu ve iş bitimi imzası</small></div></button><div className={`local-draft-state ${localSaveState}`}><Cloud size={15} /><span>{readOnly ? 'Sunucu kaydı' : localSaveState === 'saving' ? 'Cihaza kaydediliyor…' : 'Cihaza kaydoldu'}</span></div></nav>

    <ReportDetails catalog={catalog} form={form} setField={setField} products={products} updateProduct={updateProduct} setProducts={setProducts} stations={existing?.stations.length ? stations : []} vehicleStockItems={vehicleStockItems} readOnly={readOnly} setSignatureTarget={setSignatureTarget} onAddManualStock={onAddManualStock ? () => { setProducts((current) => [...current, blankProduct()]); setManualStockTarget(products.length); } : undefined} />

    {stage === 'report' && <><PhotoCapture photos={photos} existingPhotos={existing?.photos ?? []} readOnly={readOnly} onChange={setPhotos} /><div className="report-form-status"><FileCheck2 size={18} /><div><strong>{existing?.status === 'Finalized' ? 'Onaylanmış EK-1 formu' : 'EK-1 formu onaya hazır'}</strong><span>İstasyon aktivasyonundan bağımsızdır; ürün ve sarf tüketimleri araç stoğundan düşer.</span></div></div>{error && <div className="modal-form-error">{error}</div>}<div className="modal-actions service-report-actions"><button className="secondary-button" onClick={onClose}>Kapat</button>{!readOnly && <><button className="secondary-button" disabled={saving} onClick={() => void submit(false)}><Save size={16} /> Taslak Kaydet</button><button className="primary-button" disabled={saving} onClick={() => void submit(true)}><Check size={17} /> EK-1 Formunu Onayla</button></>}</div></>}
  </div>{signatureTarget && <SignaturePad onClose={() => setSignatureTarget(null)} onSave={(image) => { setField(signatureTarget === 'manager' ? 'managerSignatureData' : 'customerSignatureData', image); setSignatureTarget(null); }} />}{manualStockTarget !== null && onAddManualStock && <ManualStockModal onClose={() => setManualStockTarget(null)} onSave={async (input) => { const item = await onAddManualStock(input); updateProduct(manualStockTarget, { vehicleStockItemId: item.vehicleStockItemId, productName: item.productName, unit: usageUnits(item.unit)[0], licenseNumber: item.licenseNumber, licenseDocumentId: item.licenseDocumentId }); setManualStockTarget(null); }} />}{scannerOpen && <QrScannerModal onClose={() => setScannerOpen(false)} onScan={handleQrScan} />}{conflict && <div className="nested-modal-layer"><div className="report-conflict-dialog"><AlertTriangle size={30} /><h3>İki farklı rapor sürümü bulundu</h3><p>Sunucudaki rapor {formatDraftTime(conflict.updatedAt)} tarihinde güncellendi. Bu cihazdaki taslakla üzerine yazabilir veya güncel sunucu sürümünü kullanabilirsiniz.</p><div><button className="secondary-button" onClick={() => { setForm(createInitialForm(order, conflict, companyName)); setStations(conflict.stations.map(stripStationId)); setProducts(conflict.products.map(stripProductId)); setBaseUpdatedAt(conflict.updatedAt); setConflict(null); }}>Sunucudakini kullan</button><button className="primary-button" onClick={() => { setConflict(null); void submit(conflictFinalize, true); }}>Bu cihazdaki sürümü gönder</button></div></div></div>}</div>;
}

function ReportDetails({ catalog, form, setField, products, updateProduct, setProducts, stations, vehicleStockItems, readOnly, setSignatureTarget, onAddManualStock }: { catalog: ServiceReportCatalog; form: FormState; setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void; products: ReportProductInput[]; updateProduct: (index: number, patch: Partial<ReportProductInput>) => void; setProducts: Dispatch<SetStateAction<ReportProductInput[]>>; stations: ReportStationInput[]; vehicleStockItems: VehicleStockCheck['items']; readOnly: boolean; setSignatureTarget: (value: 'manager' | 'customer') => void; onAddManualStock?: () => void }) {
  return <div className="service-report-details">
    <section className="report-form-section">
      <header>
        <span>1</span>
        <div>
          <strong>Firma ve yetkili bilgileri</strong>
          <small>Resmi EK-1 resmi alanları (Ayarlardan otomatik yüklenir)</small>
        </div>
      </header>
      <div className="report-form-grid">
        <Field label="Uygulayıcı firma" value={form.firmName} onChange={(value) => setField('firmName', value)} disabled={readOnly} />
        <Field label="Mesul müdür" value={form.responsibleManager ?? ''} onChange={(value) => setField('responsibleManager', value)} disabled={readOnly} />
        <Field label="Ekip sorumlusu" value={form.teamManager ?? ''} onChange={(value) => setField('teamManager', value)} disabled={readOnly} />
        <Field label="İzin tarih / sayısı" value={form.permissionNumber ?? ''} onChange={(value) => setField('permissionNumber', value)} disabled={readOnly} />
        <Field label="Firma adresi" value={form.firmAddress ?? ''} onChange={(value) => setField('firmAddress', value)} disabled={readOnly} wide />
        <Field label="Firma telefonu" value={form.firmPhone ?? ''} onChange={(value) => setField('firmPhone', value)} disabled={readOnly} />
        <Field label="Web sitesi" value={form.firmWeb ?? ''} onChange={(value) => setField('firmWeb', value)} disabled={readOnly} />
      </div>
    </section>

    <section className="report-form-section">
      <header>
        <span>2</span>
        <div>
          <strong>Uygulama ve hedef zararlı parametreleri</strong>
          <small>Hedef zararlılar, mahal türü, alan ve iş kapsamı</small>
        </div>
      </header>
      <div className="report-form-grid">
        <DropdownMultiSelect label="Hedef zararlı" placeholder="Hedef zararlıları seçin..." options={catalog.pestTypes} value={form.targetPests ?? ''} disabled={readOnly} onChange={(value) => setField('targetPests', value)} wide />
        <CatalogSelectField label="Mahal türü" options={catalog.residenceTypes} value={form.residenceType ?? ''} disabled={readOnly} onChange={(value) => setField('residenceType', value)} />
        <Field label="Alan (m²)" value={form.areaSquareMeters} onChange={(value) => setField('areaSquareMeters', value)} disabled={readOnly} type="number" />
        <DropdownMultiSelect label="İş türü" placeholder="Uygulanan iş türlerini seçin..." options={catalog.workTypes} value={form.workType ?? ''} disabled={readOnly} onChange={(value) => setField('workType', value)} wide />
        <DropdownMultiSelect label="Güvenlik önlemleri" placeholder="Alınan güvenlik önlemlerini seçin..." options={catalog.safetyMeasures} value={form.safetyMeasures ?? ''} disabled={readOnly} onChange={(value) => setField('safetyMeasures', value)} wide />
      </div>
    </section>

    {stations.length > 0 && <section className="report-form-section legacy-station-summary"><header><span>3</span><div><strong>Önceki birleşik kaydın istasyon özeti</strong><small>Bu bölüm yalnız eski raporların geriye dönük görüntülenmesi için korunur</small></div></header><div className="report-entry-table-wrap"><table className="report-entry-table"><thead><tr><th>No</th><th>Alan</th><th>Durum</th><th>Zararlı</th><th>Adet</th><th>Ürün / Sarf</th></tr></thead><tbody>{stations.map((station) => <tr key={`${station.sitePlanElementId}-${station.deviceNumber}`}><td><strong>{station.deviceNumber}</strong></td><td>{station.area}</td><td>{statusLabel(station.deviceStatus)}</td><td>{station.targetPest || '—'}</td><td>{station.caughtCount || '—'}</td><td>{station.appliedProductName ? `${station.appliedProductName} · ${station.appliedAmount} ${station.appliedUnit}` : station.replacementProductName ? `${station.replacementProductName} · ${station.replacementQuantity} ${station.replacementUnit}` : '—'}</td></tr>)}</tbody></table></div></section>}

    <section className="report-form-section">
      <header>
        <span>{stations.length > 0 ? '4' : '3'}</span>
        <div>
          <strong>Ürün ve sarf tüketimleri</strong>
          <small>Araç stoğundan seçilir; rapor onayında stoktan otomatik düşer</small>
        </div>
        {!readOnly && <div className="report-stock-actions"><button onClick={() => setProducts((current) => [...current, blankProduct()])}><Plus size={15} /> Stoktan ürün ekle</button>{onAddManualStock && <button onClick={onAddManualStock}><PackageCheck size={15} /> Manuel sarf ekle</button>}</div>}
      </header>
      <div className="report-product-list">
        {products.map((product, index) => <article key={index}>
          <div className="report-product-grid">
            <StockSelect label="Araç stoğundan ürün / sarf" value={product.vehicleStockItemId} stockItems={vehicleStockItems} disabled={readOnly} onChange={(stock) => updateProduct(index, { vehicleStockItemId: stock?.vehicleStockItemId, productName: stock?.productName ?? '', unit: stock ? usageUnits(stock.unit)[0] : 'Adet', licenseNumber: stock?.licenseNumber ?? '', licenseDocumentId: stock?.licenseDocumentId })} />
            <Field label="Ruhsat / ürün bilgisi" value={product.licenseNumber ?? ''} onChange={(value) => updateProduct(index, { licenseNumber: value, licenseDocumentId: undefined })} disabled={readOnly || Boolean(product.licenseDocumentId)} placeholder={product.vehicleStockItemId ? 'Ürüne bağlı ruhsat bulunamadı' : 'Sarf malzemesi için gerekmez'} />
            <CatalogSelectField label="Kullanım yeri / yöntemi" options={catalog.applicationMethods} value={product.applicationMethod ?? ''} disabled={readOnly} onChange={(value) => updateProduct(index, { applicationMethod: value })} />
            <Field label="Etken madde / sarf türü" value={product.activeIngredient ?? ''} onChange={(value) => updateProduct(index, { activeIngredient: value })} disabled={readOnly} placeholder="Etken madde" />
            <Field label="Kullanılan miktar" value={String(product.amountUsed || '')} onChange={(value) => updateProduct(index, { amountUsed: Number(value) })} disabled={readOnly} type="number" />
            <label className="report-control">Birim<select value={product.unit} disabled={readOnly || !product.vehicleStockItemId} onChange={(event) => updateProduct(index, { unit: event.target.value })}>{usageUnits(vehicleStockItems.find((item) => item.vehicleStockItemId === product.vehicleStockItemId)?.unit).map((unit) => <option key={unit}>{unit}</option>)}</select></label>
          </div>
          {product.licenseDocumentId && <small className="report-license-linked"><FileCheck2 size={14} /> Ürüne bağlı güncel ruhsat EK-1 formuna otomatik eklendi.</small>}
          {!readOnly && products.length > 1 && <button type="button" className="report-product-remove" onClick={() => setProducts((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /> Kalemi kaldır</button>}
        </article>)}
      </div>
    </section>

    <section className="report-form-section">
      <header>
        <span>{stations.length > 0 ? '5' : '4'}</span>
        <div>
          <strong>Sonuç ve öneriler</strong>
          <small>Saha bulguları, yapılan uygulama ve düzeltici faaliyetler</small>
        </div>
      </header>
      <div className="report-form-grid report-results-grid">
        <TextField label="Yapılan uygulama özeti" value={form.applicationSummary ?? ''} onChange={(value) => setField('applicationSummary', value)} disabled={readOnly} wide />
        <TextField label="Saha bulguları" value={form.findings ?? ''} onChange={(value) => setField('findings', value)} disabled={readOnly} />
        <TextField label="Düzeltici faaliyetler" value={form.correctiveActions ?? ''} onChange={(value) => setField('correctiveActions', value)} disabled={readOnly} />
        <TextField label="Öneriler" value={form.recommendations ?? ''} onChange={(value) => setField('recommendations', value)} disabled={readOnly} full />
      </div>
    </section>

    <section className="report-form-section final-signature-section">
      <header>
        <span>{stations.length > 0 ? '6' : '5'}</span>
        <div>
          <strong>İş bitimi dijital onayı</strong>
          <small>İmzalar tüm istasyonlar tamamlandıktan sonra yalnızca bir kez alınır</small>
        </div>
      </header>
      <div className="report-signature-grid">
        <SignatureCard label="Uygulayıcı / ekip sorumlusu" value={form.managerSignatureData} disabled={readOnly} onClick={() => setSignatureTarget('manager')} />
        <div className="report-customer-sign">
          <Field label="Müşteri yetkilisi" value={form.customerRepresentativeName ?? ''} onChange={(value) => setField('customerRepresentativeName', value)} disabled={readOnly} />
          <SignatureCard label="Müşteri yetkilisi imzası" value={form.customerSignatureData} disabled={readOnly} onClick={() => setSignatureTarget('customer')} />
        </div>
      </div>
      <EmailRecipientsField value={form.additionalEmailRecipients ?? []} disabled={readOnly} onChange={(value) => setField('additionalEmailRecipients', value)} />
    </section>
  </div>;
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

function DropdownMultiSelect({
  label,
  options,
  value,
  disabled,
  onChange,
  wide = false,
  placeholder = 'Seçiniz...',
}: {
  label: string;
  options: string[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  wide?: boolean;
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const raw = useMemo(() => value.split(/[,;]+/).map((item) => item.trim()).filter(Boolean), [value]);
  const selected = useMemo(() => raw.filter((item) => options.includes(item)), [raw, options]);
  const otherEntry = raw.find((item) => item === 'Diğer:' || item.startsWith('Diğer: '));
  const otherValue = otherEntry?.replace(/^Diğer:\s*/, '') ?? raw.find((item) => !options.includes(item)) ?? '';
  const otherSelected = Boolean(otherEntry || otherValue);

  const emit = (known: string[], other = otherValue, keepOther = otherSelected) => {
    const parts = [...known];
    if (keepOther && other.trim()) {
      parts.push(`Diğer: ${other.trim()}`);
    } else if (keepOther) {
      parts.push('Diğer: ');
    }
    onChange(parts.join(', '));
  };

  const toggle = (item: string) => {
    if (selected.includes(item)) {
      emit(selected.filter((entry) => entry !== item), otherValue, otherSelected);
    } else {
      emit([...selected, item], otherValue, otherSelected);
    }
  };

  const removeTag = (item: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (item.startsWith('Diğer:') || (!options.includes(item) && item === otherValue)) {
      emit(selected, '', false);
    } else {
      emit(selected.filter((entry) => entry !== item), otherValue, otherSelected);
    }
  };

  const selectAll = () => {
    emit(Array.from(new Set([...selected, ...filteredOptions])), otherValue, otherSelected);
  };

  const clearAll = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onChange('');
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const query = search.toLowerCase();
    return options.filter((opt) => opt.toLowerCase().includes(query));
  }, [options, search]);

  const totalSelectedCount = selected.length + (otherSelected ? 1 : 0);

  return (
    <div className={`dropdown-multi-select-wrap ${wide ? 'form-field-wide' : ''}`} ref={containerRef}>
      <div className="dropdown-multi-label">
        <span>{label}</span>
        {totalSelectedCount > 0 && <span className="dropdown-multi-badge">{totalSelectedCount} seçildi</span>}
      </div>

      <div
        className={`dropdown-multi-trigger ${isOpen ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="dropdown-multi-trigger-content">
          {totalSelectedCount === 0 ? (
            <span className="dropdown-multi-placeholder">{placeholder}</span>
          ) : (
            <span className="dropdown-multi-summary">
              {totalSelectedCount === 1
                ? otherSelected && !selected.length
                  ? `Diğer: ${otherValue || 'Belirtilmedi'}`
                  : selected[0]
                : `${totalSelectedCount} seçenek seçildi (${selected.slice(0, 2).join(', ')}${selected.length > 2 ? '...' : otherSelected ? ', Diğer' : ''})`}
            </span>
          )}
        </div>

        <div className="dropdown-multi-trigger-actions">
          {totalSelectedCount > 0 && !disabled && (
            <button
              type="button"
              className="dropdown-multi-clear-btn"
              title="Seçimleri Temizle"
              onClick={clearAll}
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown className={`dropdown-multi-chevron ${isOpen ? 'open' : ''}`} size={16} />
        </div>
      </div>

      {totalSelectedCount > 0 && (
        <div className="dropdown-multi-chips">
          {selected.map((item) => (
            <span key={item} className="dropdown-multi-chip">
              {item}
              {!disabled && (
                <button type="button" onClick={(e) => removeTag(item, e)} title={`${item} kaldır`}>
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
          {otherSelected && (
            <span className="dropdown-multi-chip other">
              Diğer: {otherValue || 'Belirtilmedi'}
              {!disabled && (
                <button type="button" onClick={(e) => removeTag('Diğer', e)} title="Diğer kaldır">
                  <X size={12} />
                </button>
              )}
            </span>
          )}
        </div>
      )}

      {isOpen && !disabled && (
        <div className="dropdown-multi-popover" role="listbox">
          <div className="dropdown-multi-popover-header">
            <div className="dropdown-multi-search-box">
              <Search size={14} className="dropdown-multi-search-icon" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Listede filtrele..."
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
              {search && (
                <button
                  type="button"
                  className="dropdown-multi-search-clear"
                  onClick={() => setSearch('')}
                >
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="dropdown-multi-actions-bar">
              <button type="button" className="dropdown-action-btn" onClick={selectAll}>
                Tümünü Seç
              </button>
              <button type="button" className="dropdown-action-btn" onClick={() => clearAll()}>
                Temizle
              </button>
            </div>
          </div>

          <div className="dropdown-multi-options-list">
            {filteredOptions.length === 0 && !search.toLowerCase().includes('diğer') ? (
              <div className="dropdown-multi-empty">Eşleşen seçenek bulunamadı</div>
            ) : (
              filteredOptions.map((item) => {
                const isChecked = selected.includes(item);
                return (
                  <div
                    key={item}
                    className={`dropdown-multi-option ${isChecked ? 'selected' : ''}`}
                    onClick={() => toggle(item)}
                    role="option"
                    aria-selected={isChecked}
                  >
                    <span className={`dropdown-multi-checkbox ${isChecked ? 'checked' : ''}`}>
                      {isChecked && <Check size={13} />}
                    </span>
                    <span className="dropdown-multi-option-text">{item}</span>
                  </div>
                );
              })
            )}

            <div
              className={`dropdown-multi-option other-option ${otherSelected ? 'selected' : ''}`}
              onClick={() => emit(selected, otherValue, !otherSelected)}
              role="option"
              aria-selected={otherSelected}
            >
              <span className={`dropdown-multi-checkbox ${otherSelected ? 'checked' : ''}`}>
                {otherSelected && <Check size={13} />}
              </span>
              <span className="dropdown-multi-option-text">Diğer (Özel Belirtin)</span>
            </div>

            {otherSelected && (
              <div className="dropdown-multi-other-input-wrap" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  value={otherValue}
                  onChange={(e) => emit(selected, e.target.value, true)}
                  placeholder={`${label} için özel değer yazın...`}
                  autoFocus
                />
              </div>
            )}
          </div>

          <div className="dropdown-multi-popover-footer">
            <span className="dropdown-multi-footer-count">{totalSelectedCount} seçildi</span>
            <button
              type="button"
              className="primary-button compact"
              onClick={() => setIsOpen(false)}
            >
              Tamam
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CatalogSelectField({ label, options, value, disabled, onChange }: { label: string; options: string[]; value: string; disabled: boolean; onChange: (value: string) => void }) {
  const isOtherPrefix = value.startsWith('Diğer: ') || value.startsWith('Diğer:');
  const isExactOther = value === 'Diğer' || value === '__other__';
  const known = options.includes(value);
  const isOther = isOtherPrefix || isExactOther || (!known && Boolean(value));
  const otherText = isOtherPrefix ? value.replace(/^Diğer:\s*/, '') : (isExactOther ? '' : (!known && value ? value : ''));

  return (
    <label className="report-control">
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
        {options.map((item) => (
          <option key={item} value={item}>{item}</option>
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
          placeholder="Manuel değer (opsiyonel)"
        />
      )}
    </label>
  );
}

function PhotoCapture({ photos, existingPhotos, readOnly, onChange }: { photos: ReportPhotoUpload[]; existingPhotos: ServiceReportRecord['photos']; readOnly: boolean; onChange: Dispatch<SetStateAction<ReportPhotoUpload[]>> }) {
  const update = (index: number, patch: Partial<Omit<ReportPhotoUpload, 'file'>>) => onChange((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  return (
    <section className="field-photo-capture">
      <div>
        <span><Camera size={18} /></span>
        <div>
          <strong>Saha fotoğrafları</strong>
          <small>Her fotoğrafa yer, durum ve açıklama ekleyin. Kayıtlar otomatik optimize edilir ve çevrimdışı da korunur.</small>
        </div>
      </div>
      {!readOnly && (
        <label>
          <ImagePlus size={16} /> Fotoğraf ekle
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            multiple
            onChange={async (event) => {
              const rawFiles = Array.from(event.target.files ?? []).slice(0, Math.max(0, 8 - photos.length));
              event.currentTarget.value = '';
              if (rawFiles.length === 0) return;
              const compressed = await compressImages(rawFiles, { maxDimension: 1600, quality: 0.82 });
              onChange((current) => [
                ...current,
                ...compressed.map((file) => ({ file, location: '', status: 'Genel saha görünümü', description: '' })),
              ]);
            }}
          />
        </label>
      )}
      <div className="field-photo-details">
        {photos.map((photo, index) => (
          <article key={`${photo.file.name}-${photo.file.lastModified}-${index}`}>
            <header>
              <span><ImagePlus size={15} />{photo.file.name}</span>
              <button type="button" aria-label="Fotoğrafı kaldır" onClick={() => onChange((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                <X size={15} />
              </button>
            </header>
            <div>
              <label>Yer / bölüm<input maxLength={240} value={photo.location} onChange={(event) => update(index, { location: event.target.value })} placeholder="Yer veya bölümü yazın" /></label>
              <label>Durum<select value={photo.status} onChange={(event) => update(index, { status: event.target.value })}>{photoStatusOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="photo-description">Açıklama<textarea maxLength={1000} value={photo.description} onChange={(event) => update(index, { description: event.target.value })} placeholder="Görülen durum, yapılan işlem veya öneriyi yazın…" /></label>
            </div>
          </article>
        ))}
        {existingPhotos.map((photo) => (
          <article className="uploaded" key={photo.id}>
            <header>
              <span><CheckCircle2 size={15} />{photo.fileName}</span>
              <em>Gönderildi</em>
            </header>
            <div>
              <p><b>Yer:</b> {photo.location || 'Belirtilmedi'}</p>
              <p><b>Durum:</b> {photo.status || 'Genel saha görünümü'}</p>
              <p><b>Açıklama:</b> {photo.description || '—'}</p>
            </div>
          </article>
        ))}
        {photos.length === 0 && existingPhotos.length === 0 && <em>Yeni fotoğraf seçilmedi.</em>}
      </div>
    </section>
  );
}

function ManualStockModal({ onClose, onSave }: { onClose: () => void; onSave: (input: { productName: string; quantity: number; unit: string }) => Promise<void> }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); setSaving(true); setError(null); try { await onSave({ productName: String(data.get('productName')).trim(), quantity: Number(data.get('quantity')), unit: String(data.get('unit')) }); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Sarf malzemesi araç stoğuna eklenemedi.'); setSaving(false); } };
  return <div className="nested-modal-layer"><div className="manual-stock-modal"><header><div><PackageCheck /><span><strong>Manuel sarf malzemesi</strong><small>Kalem araç stoğuna eklenir ve bu raporda seçilir.</small></span></div><button type="button" onClick={onClose}><X /></button></header><form onSubmit={submit}><label>Ürün / sarf adı<input name="productName" required minLength={2} maxLength={160} placeholder="Ürün veya sarf adını yazın" /></label><div><label>Miktar<input name="quantity" type="number" required min="0.001" step="0.001" defaultValue="1" /></label><label>Birim<select name="unit" defaultValue="Adet"><option>Adet</option><option>Litre</option><option>Kilogram</option></select></label></div>{error && <div className="modal-form-error">{error}</div>}<footer><button type="button" className="secondary-button" onClick={onClose}>Vazgeç</button><button className="primary-button" disabled={saving}>{saving ? 'Ekleniyor…' : 'Stoğa ekle ve seç'}</button></footer></form></div></div>;
}

function StockSelect({ label, value, stockItems, disabled, onChange }: { label: string; value?: string; stockItems: VehicleStockCheck['items']; disabled: boolean; onChange: (item?: VehicleStockCheck['items'][number]) => void }) {
  return <label className="report-control form-field-wide">{label}<select value={value ?? ''} disabled={disabled} onChange={(event) => onChange(stockItems.find((item) => item.vehicleStockItemId === event.target.value))}><option value="">Araç ürünü seçin</option>{stockItems.filter((item) => item.vehicleStockItemId && (item.quantity > 0 || item.vehicleStockItemId === value)).map((item) => <option value={item.vehicleStockItemId} key={item.vehicleStockItemId}>{item.productName} · {item.quantity} {item.unit}</option>)}</select></label>;
}

function Field({ label, value, onChange, disabled, wide = false, type = 'text', placeholder }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; wide?: boolean; type?: string; placeholder?: string }) { return <label className={`report-control${wide ? ' form-field-wide' : ''}`}>{label}<input type={type} min={type === 'number' ? '0' : undefined} value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>; }
function TextField({ label, value, onChange, disabled, wide = false, full = false, placeholder }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; wide?: boolean; full?: boolean; placeholder?: string }) { return <label className={`report-control${wide ? ' form-field-wide' : ''}${full ? ' form-field-full' : ''}`}>{label}<textarea value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>; }
function SignatureCard({ label, value, disabled, onClick }: { label: string; value?: string; disabled?: boolean; onClick: () => void }) { return <button className={`report-signature-card ${value ? 'signed' : ''}`} disabled={disabled} onClick={onClick}>{value ? <img src={value} alt={`${label} imzası`} /> : <Plus size={21} />}<span>{value ? 'İmza kaydedildi' : label}</span></button>; }

function createInitialForm(order: WorkOrder, report: ServiceReportRecord | undefined, companyName: string): FormState {
  const defaults = getStoredCompanyEk1Defaults(companyName);
  return {
    firmName: report?.firmName || defaults.firmName || companyName,
    firmAddress: report?.firmAddress || defaults.firmAddress || '',
    firmPhone: report?.firmPhone || defaults.firmPhone || '',
    firmWeb: report?.firmWeb || defaults.firmWeb || '',
    responsibleManager: report?.responsibleManager || defaults.responsibleManager || '',
    permissionNumber: report?.permissionNumber || defaults.permissionNumber || '',
    teamManager: report?.teamManager || defaults.teamManager || order.technician || '',
    targetPests: normalizeCatalogList(report?.targetPests ?? '', pestTypes),
    residenceType: normalizeCatalogValue(report?.residenceType ?? 'İşyeri', residenceTypeOptions),
    areaSquareMeters: report?.areaSquareMeters?.toString() ?? '',
    workType: normalizeCatalogList(report?.workType ?? order.service, workTypeOptions),
    consumables: report?.consumables ?? '',
    safetyMeasures: normalizeCatalogList(report?.safetyMeasures ?? 'Uygulama alanı bilgilendirildi, Kişisel koruyucu donanım kullanıldı', safetyMeasureOptions),
    applicationSummary: report?.applicationSummary ?? order.completionNote ?? '',
    findings: report?.findings ?? '',
    correctiveActions: report?.correctiveActions ?? '',
    recommendations: report?.recommendations ?? order.recommendation ?? '',
    customerRepresentativeName: report?.customerRepresentativeName ?? '',
    managerSignatureData: report?.managerSignatureData ?? '',
    customerSignatureData: report?.customerSignatureData ?? '',
    additionalEmailRecipients: report?.additionalEmailRecipients ?? [],
  };
}

function stripStationId({ id: _, ...station }: ServiceReportRecord['stations'][number]): ReportStationInput { return station; }
function stripProductId({ id: _, ...product }: ServiceReportRecord['products'][number]): ReportProductInput { return product; }
function usageUnits(stockUnit?: string) { if (stockUnit === 'Litre') return ['Mililitre', 'Litre']; if (stockUnit === 'Kilogram') return ['Gram', 'Kilogram']; return [stockUnit ?? 'Adet']; }
function clearStationStatus(): Partial<ReportStationInput> { return { deviceStatus: 'Unchecked', hasActivity: false, caughtCount: 0, activityType: '', targetPest: '', pestObservations: [], appliedVehicleStockItemId: undefined, appliedProductName: undefined, appliedAmount: 0, appliedUnit: undefined, replacementVehicleStockItemId: undefined, replacementProductName: undefined, replacementQuantity: 0, replacementUnit: undefined, inaccessibilityReason: '' }; }
function statusLabel(value: string) { return ({ Unchecked: 'Kontrol bekliyor', NoActivity: 'Aktivite yok', Activity: 'Aktivite var', Damaged: 'Kırık / hasarlı', Inaccessible: 'Ulaşılamadı', Missing: 'Kayıp', Replaced: 'Değiştirildi', Passive: 'Pasif', Active: 'Aktif' } as Record<string, string>)[value] ?? value; }
function formatDraftTime(value: string) { return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
const pestTypes = ['Ev faresi', 'Tarla faresi', 'Norveç sıçanı', 'Çatı sıçanı', 'Alman hamamböceği', 'Doğu hamamböceği', 'Amerikan hamamböceği', 'Karasinek', 'Sirke sineği', 'Lağım sineği', 'Sivrisinek', 'Güve', 'Un biti', 'Testere dişli böcek', 'Karınca', 'Gümüşçün'];
const workTypeOptions = ['Kemirgen kontrolü', 'Sinek cihazı kontrolü', 'Uçan haşere kontrolü', 'Hamamböceği ve yürüyen haşere kontrolü', 'Böcek monitörü kontrolü', 'Depolanmış ürün zararlıları kontrolü', 'Larva ve drenaj kontrolü', 'Genel biyosidal uygulama', 'Dezenfeksiyon', 'Acil çağrı / noktasal müdahale', 'Yapısal risk ve hijyen kontrolü'];
const residenceTypeOptions = ['İşyeri', 'Gıda üretim tesisi', 'Depo / lojistik', 'Restoran / kafe', 'Otel / konaklama', 'Sağlık tesisi', 'Eğitim kurumu', 'Konut / site', 'Açık alan'];
const safetyMeasureOptions = ['Uygulama alanı bilgilendirildi', 'Kişisel koruyucu donanım kullanıldı', 'Gıda ve temas yüzeyleri koruma altına alındı', 'Uygulama alanı sınırlandırıldı', 'Uyarı levhası yerleştirildi', 'Havalandırma sağlandı', 'Elektrik / ekipman güvenliği kontrol edildi'];
const fallbackReportCatalog: ServiceReportCatalog = { pestTypes, activityTypes: ['Sighting', 'Capture', 'Droppings', 'Gnawing', 'Track', 'Nest', 'Other'], equipmentTypes: [], inaccessibilityReasons: [], residenceTypes: residenceTypeOptions, workTypes: workTypeOptions, safetyMeasures: safetyMeasureOptions, applicationMethods: ['Püskürtme', 'Jel uygulama', 'Yemleme', 'ULV / sisleme', 'Larvasit uygulama', 'Toz uygulama', 'İstasyon içine uygulama', 'Yapışkan plaka değişimi'], productUnits: ['Litre', 'Mililitre', 'Kilogram', 'Gram', 'Adet', 'Tüp', 'Kutu', 'Paket'], quickCounts: [1,2,3,4,5,6,7,8,9,10] };
function normalizeCatalogValue(value: string, options: string[]) { const trimmed = value.trim(); return !trimmed || options.includes(trimmed) || trimmed.startsWith('Diğer: ') ? trimmed : `Diğer: ${trimmed}`; }
function normalizeCatalogList(value: string, options: string[]) { return value.split(/[,;]+/).map((item) => normalizeCatalogValue(item, options)).filter(Boolean).join(', '); }
const photoStatusOptions = ['Genel saha görünümü', 'Uygulama öncesi', 'Uygulama sonrası', 'Uygunsuzluk', 'İstasyon / ekipman', 'Erişim sorunu', 'Düzeltici faaliyet', 'Müşteri bildirimi'];
