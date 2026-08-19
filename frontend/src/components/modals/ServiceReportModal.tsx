import { useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { AlertTriangle, Ban, Barcode, Bug, Camera, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Cloud, FileCheck2, ImagePlus, MapPinned, PackageCheck, Plus, QrCode, Save, ScanLine, Search, Sparkles, Trash2, Undo2, WandSparkles, Wrench, X, Zap } from 'lucide-react';
import type { WorkOrder } from '../../types';
import { getPreviousServiceReport, getServiceReportCatalog, ReportConflictError, type ReportPhotoUpload, type ReportProductInput, type ReportStationInput, type ServiceReportCatalog, type ServiceReportRecord, type UpsertServiceReportInput } from '../../services/serviceReportApi';
import { getStationActivationByWorkOrder } from '../../services/stationActivationApi';
import { getSitePlans, type SitePlanElement, type SitePlanRecord } from '../../services/sitePlanApi';
import type { VehicleStockCheck } from '../../services/fieldOperationsApi';
import { getLocalReportDraft, removeLocalReportDraft, saveLocalReportDraft, toOfflinePhotos } from '../../services/offlineFieldStore';
import { downloadStationLabelPdf, matchStationByCode, normalizeStationQrValue, parseStationQrValue } from '../../utils/stationQr';
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
  const [autoAggregatedNotice, setAutoAggregatedNotice] = useState<string | null>(null);
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
  const [pairingStationIndex, setPairingStationIndex] = useState<number | null>(null);
  const [unassignedCodeModal, setUnassignedCodeModal] = useState<{ scannedCode: string; targetIndex: number } | null>(null);
  const [undoState, setUndoState] = useState<{ stations: ReportStationInput[]; message: string } | null>(null);
  const [referenceReport, setReferenceReport] = useState<ServiceReportRecord | undefined>(previousReport);
  const [catalog, setCatalog] = useState<ServiceReportCatalog>(fallbackReportCatalog);

  useEffect(() => {
    let active = true;
    Promise.all([
      getPreviousServiceReport(accessToken, order.recordId),
      getServiceReportCatalog(accessToken),
      getStationActivationByWorkOrder(accessToken, order.recordId).catch(() => null),
    ])
      .then(([report, loadedCatalog, stationActivation]) => {
        if (!active) return;
        if (report) setReferenceReport(report);
        setCatalog(loadedCatalog);

        // Auto aggregate products & consumables applied in station activations
        if (stationActivation?.stations?.length) {
          const productMap = new Map<string, { vehicleStockItemId?: string; productName: string; unit: string; totalAmount: number; isConsumable?: boolean }>();
          let appliedStationCount = 0;

          for (const s of stationActivation.stations) {
            let hasAnyUsage = false;

            // 1. Biocide application
            if (s.appliedProductName && s.appliedAmount && s.appliedAmount > 0) {
              hasAnyUsage = true;
              const unit = s.appliedUnit || 'Gram';
              const key = `BIOCIDE:${s.appliedProductName.trim().toUpperCase()}|${unit.toUpperCase()}`;
              const cur = productMap.get(key);
              if (cur) {
                cur.totalAmount += Number(s.appliedAmount);
                if (!cur.vehicleStockItemId && s.appliedVehicleStockItemId) cur.vehicleStockItemId = s.appliedVehicleStockItemId;
              } else {
                productMap.set(key, {
                  vehicleStockItemId: s.appliedVehicleStockItemId,
                  productName: s.appliedProductName.trim(),
                  unit,
                  totalAmount: Number(s.appliedAmount),
                  isConsumable: false,
                });
              }
            }

            // 2. Consumable & replacement part
            if (s.replacementProductName && s.replacementQuantity && s.replacementQuantity > 0) {
              hasAnyUsage = true;
              const unit = s.replacementUnit || 'Adet';
              const key = `CONSUMABLE:${s.replacementProductName.trim().toUpperCase()}|${unit.toUpperCase()}`;
              const cur = productMap.get(key);
              if (cur) {
                cur.totalAmount += Number(s.replacementQuantity);
                if (!cur.vehicleStockItemId && s.replacementVehicleStockItemId) cur.vehicleStockItemId = s.replacementVehicleStockItemId;
              } else {
                productMap.set(key, {
                  vehicleStockItemId: s.replacementVehicleStockItemId,
                  productName: s.replacementProductName.trim(),
                  unit,
                  totalAmount: Number(s.replacementQuantity),
                  isConsumable: true,
                });
              }
            } else if (s.stickyPlateChanged) {
              hasAnyUsage = true;
              const key = 'CONSUMABLE:FARE & SIÇAN YAPIŞKANLI LEVHA (PLAKA)|ADET';
              const cur = productMap.get(key);
              if (cur) {
                cur.totalAmount += 1;
              } else {
                productMap.set(key, {
                  productName: 'Fare & Sıçan Yapışkanlı Levha (Plaka)',
                  unit: 'Adet',
                  totalAmount: 1,
                  isConsumable: true,
                });
              }
            } else if (s.stationReplaced) {
              hasAnyUsage = true;
              const key = 'CONSUMABLE:KEMIRGEN YEMLEME İSTASYONU GÖVDESI|ADET';
              const cur = productMap.get(key);
              if (cur) {
                cur.totalAmount += 1;
              } else {
                productMap.set(key, {
                  productName: 'Kemirgen Yemleme İstasyonu Gövdesi',
                  unit: 'Adet',
                  totalAmount: 1,
                  isConsumable: true,
                });
              }
            }

            if (hasAnyUsage) appliedStationCount++;
          }

          if (productMap.size > 0) {
            const aggregated: ReportProductInput[] = Array.from(productMap.values()).map((p) => {
              const stockMatch = vehicleStockItems.find(
                (item) =>
                  (p.vehicleStockItemId && (item.vehicleStockItemId === p.vehicleStockItemId || item.id === p.vehicleStockItemId)) ||
                  item.productName.toLocaleUpperCase('tr-TR') === p.productName.toLocaleUpperCase('tr-TR')
              );
              return {
                vehicleStockItemId: stockMatch?.vehicleStockItemId || stockMatch?.id || p.vehicleStockItemId,
                productName: p.productName,
                amountUsed: p.totalAmount,
                unit: p.unit,
                licenseNumber: stockMatch?.licenseNumber || '',
                licenseDocumentId: stockMatch?.licenseDocumentId,
                applicationMethod: p.isConsumable
                  ? 'Sarf Malzeme / Parça Değişimi'
                  : p.unit === 'Gram'
                  ? 'Yemleme / İstasyon İçi'
                  : p.unit === 'Mililitre'
                  ? 'Püskürtme / Rezidüel'
                  : 'İstasyon İçi Yerleşim',
                activeIngredient: p.isConsumable ? 'Sarf Malzemesi' : '',
                antidote: p.isConsumable
                  ? 'Gerektirmez'
                  : p.productName.toLowerCase().includes('brodifacoum') || p.productName.toLowerCase().includes('bromadiolone') || p.productName.toLowerCase().includes('difenacoum')
                  ? 'K1 Vitamini (Fitomenadion)'
                  : 'Semptomatik tedavi',
                dilutionRate: '',
                packingQuantity: '',
              };
            });

            // Build consumable summary string for EK-1
            const consumableItems = Array.from(productMap.values()).filter((p) => p.isConsumable);
            const consumableSummary = consumableItems.map((c) => `${c.totalAmount} ${c.unit} ${c.productName}`).join(', ');

            // Only auto-populate if existing report has no products or default blank product
            if (!existing?.products?.length || (existing.products.length === 1 && !existing.products[0].productName)) {
              setProducts(aggregated);
              if (consumableSummary) {
                setForm((prev) => ({ ...prev, consumables: prev.consumables || consumableSummary }));
              }
              const biocideCount = Array.from(productMap.values()).filter((p) => !p.isConsumable).length;
              const consumableCount = consumableItems.length;
              setAutoAggregatedNotice(
                `✨ İstasyon kontrollerinden ${biocideCount > 0 ? `${biocideCount} çeşit Biyosidal İlaç` : ''}${biocideCount > 0 && consumableCount > 0 ? ' ve ' : ''}${consumableCount > 0 ? `${consumableCount} çeşit Sarf Malzemesi` : ''} (${appliedStationCount} istasyondan) otomatik toplandı ve araç stoğunuza bağlandı.`
              );
            }
          }
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [accessToken, order.recordId, existing?.products, vehicleStockItems]);

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
    const trimmed = value.trim();
    if (!trimmed) return;

    if (pairingStationIndex !== null && pairingStationIndex >= 0 && pairingStationIndex < stations.length) {
      const targetStation = stations[pairingStationIndex];
      const updated = [...stations];
      updated[pairingStationIndex] = { ...targetStation, qrCode: trimmed };
      setStations(updated);
      setStationIndex(pairingStationIndex);
      setScannerOpen(false);
      setPairingStationIndex(null);
      setError(null);
      return;
    }

    const match = matchStationByCode(stations, trimmed, { customerId: order.customerId, branchId: order.branchId });
    if (match) {
      setScannerOpen(false);
      setStationIndex(match.matchIndex);
      setError(stations[match.matchIndex].deviceStatus !== 'Unchecked' ? `${stations[match.matchIndex].deviceNumber} daha önce kontrol edildi. Kaydı gözden geçiriyorsunuz.` : null);
      return;
    }

    setScannerOpen(false);
    setUnassignedCodeModal({
      scannedCode: trimmed,
      targetIndex: stationIndex >= 0 && stationIndex < stations.length ? stationIndex : 0,
    });
  };

  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Saha hizmet raporu"><div className="modal service-report-modal station-report-modal">
    <div className="modal-header"><div><p className="eyebrow">EK-1 BİYOSİDAL UYGULAMA FORMU · {order.id}</p><h2>{existing ? 'EK-1 formunu düzenle' : 'EK-1 uygulama formu'}</h2><p>{order.client} · {order.branch} · Uygulayıcı: {operatorName}</p></div><button className="icon-button" onClick={onClose}><X size={20} /></button></div>

    <nav className="field-report-steps field-report-single-step"><button className="active"><span>1</span><div><strong>Uygulama & onay</strong><small>Ürün, saha sonucu ve iş bitimi imzası</small></div></button><div className={`local-draft-state ${localSaveState}`}><Cloud size={15} /><span>{readOnly ? 'Sunucu kaydı' : localSaveState === 'saving' ? 'Cihaza kaydediliyor…' : 'Cihaza kaydoldu'}</span></div></nav>

    <ReportDetails catalog={catalog} form={form} setField={setField} products={products} updateProduct={updateProduct} setProducts={setProducts} stations={existing?.stations.length ? stations : []} vehicleStockItems={vehicleStockItems} readOnly={readOnly} setSignatureTarget={setSignatureTarget} autoAggregatedNotice={autoAggregatedNotice} onAddManualStock={onAddManualStock ? () => { setProducts((current) => [...current, blankProduct()]); setManualStockTarget(products.length); } : undefined} />

    {stage === 'report' && <><PhotoCapture photos={photos} existingPhotos={existing?.photos ?? []} readOnly={readOnly} onChange={setPhotos} /><div className="report-form-status"><FileCheck2 size={18} /><div><strong>{existing?.status === 'Finalized' ? 'Onaylanmış EK-1 formu' : 'EK-1 formu onaya hazır'}</strong><span>İstasyon tüketimleri otomatik toplanmıştır; ürün ve sarf düşümleri araç stoğundan kaydedilir.</span></div></div>{error && <div className="modal-form-error">{error}</div>}<div className="modal-actions service-report-actions"><button className="secondary-button" onClick={onClose}>Kapat</button>{!readOnly && <><button className="secondary-button" disabled={saving} onClick={() => void submit(false)}><Save size={16} /> Taslak Kaydet</button><button className="primary-button" disabled={saving} onClick={() => void submit(true)}><Check size={17} /> EK-1 Formunu Onayla</button></>}</div></>}
  </div>{signatureTarget && <SignaturePad onClose={() => setSignatureTarget(null)} onSave={(image) => { setField(signatureTarget === 'manager' ? 'managerSignatureData' : 'customerSignatureData', image); setSignatureTarget(null); }} />}{manualStockTarget !== null && onAddManualStock && <ManualStockModal onClose={() => setManualStockTarget(null)} onSave={async (input) => { const item = await onAddManualStock(input); updateProduct(manualStockTarget, { vehicleStockItemId: item.vehicleStockItemId, productName: item.productName, unit: usageUnits(item.unit)[0], licenseNumber: item.licenseNumber, licenseDocumentId: item.licenseDocumentId }); setManualStockTarget(null); }} />}{scannerOpen && <QrScannerModal onClose={() => setScannerOpen(false)} onScan={handleQrScan} />}{unassignedCodeModal && (
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
              setStationIndex(idx);
              setUnassignedCodeModal(null);
            }}
          >
            İstasyonla Eşleştir & Aç
          </button>
        </div>
      </div>
    </div>
  )}{conflict && <div className="nested-modal-layer"><div className="report-conflict-dialog"><AlertTriangle size={30} /><h3>İki farklı rapor sürümü bulundu</h3><p>Sunucudaki rapor {formatDraftTime(conflict.updatedAt)} tarihinde güncellendi. Bu cihazdaki taslakla üzerine yazabilir veya güncel sunucu sürümünü kullanabilirsiniz.</p><div><button className="secondary-button" onClick={() => { setForm(createInitialForm(order, conflict, companyName)); setStations(conflict.stations.map(stripStationId)); setProducts(conflict.products.map(stripProductId)); setBaseUpdatedAt(conflict.updatedAt); setConflict(null); }}>Sunucudakini kullan</button><button className="primary-button" onClick={() => { setConflict(null); void submit(conflictFinalize, true); }}>Bu cihazdaki sürümü gönder</button></div></div></div>}</div>;
}

function ReportDetails({ catalog, form, setField, products, updateProduct, setProducts, stations, vehicleStockItems, readOnly, setSignatureTarget, autoAggregatedNotice, onAddManualStock }: { catalog: ServiceReportCatalog; form: FormState; setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void; products: ReportProductInput[]; updateProduct: (index: number, patch: Partial<ReportProductInput>) => void; setProducts: Dispatch<SetStateAction<ReportProductInput[]>>; stations: ReportStationInput[]; vehicleStockItems: VehicleStockCheck['items']; readOnly: boolean; setSignatureTarget: (value: 'manager' | 'customer') => void; autoAggregatedNotice?: string | null; onAddManualStock?: () => void }) {
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
        <Field label="Kullanılan sarf malzemeleri (İstasyonlardan otomatik aktarılır)" value={form.consumables ?? ''} onChange={(value) => setField('consumables', value)} disabled={readOnly} placeholder="Örn: 12 Adet Fare & Sıçan Yapışkanlı Levha, 2 Adet UV Lamba" wide />
      </div>
    </section>

    {stations.length > 0 && <section className="report-form-section legacy-station-summary"><header><span>3</span><div><strong>Önceki birleşik kaydın istasyon özeti</strong><small>Bu bölüm yalnız eski raporların geriye dönük görüntülenmesi için korunur</small></div></header><div className="report-entry-table-wrap"><table className="report-entry-table"><thead><tr><th>No</th><th>Alan</th><th>Durum</th><th>Zararlı</th><th>Adet</th><th>Ürün / Sarf</th></tr></thead><tbody>{stations.map((station) => <tr key={`${station.sitePlanElementId}-${station.deviceNumber}`}><td><strong>{station.deviceNumber}</strong></td><td>{station.area}</td><td>{statusLabel(station.deviceStatus)}</td><td>{station.targetPest || '—'}</td><td>{station.caughtCount || '—'}</td><td>{station.appliedProductName ? `${station.appliedProductName} · ${station.appliedAmount} ${station.appliedUnit}` : station.replacementProductName ? `${station.replacementProductName} · ${station.replacementQuantity} ${station.replacementUnit}` : '—'}</td></tr>)}</tbody></table></div></section>}

    <section className="report-form-section">
      <header>
        <span>{stations.length > 0 ? '4' : '3'}</span>
        <div>
          <strong>Ürün ve sarf tüketimleri</strong>
          <small>İstasyonlardan otomatik toplanır; rapor onayında araç stoğundan düşer</small>
        </div>
        {!readOnly && <div className="report-stock-actions"><button onClick={() => setProducts((current) => [...current, blankProduct()])}><Plus size={15} /> Manuel ürün ekle</button>{onAddManualStock && <button onClick={onAddManualStock}><PackageCheck size={15} /> Sarf ekle</button>}</div>}
      </header>
      {autoAggregatedNotice && (
        <div style={{ margin: '0 24px 16px', padding: '12px 16px', background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: '10px', color: '#065f46', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600 }}>
          <Sparkles size={18} color="#059669" style={{ flexShrink: 0 }} />
          <span>{autoAggregatedNotice}</span>
        </div>
      )}
      <div className="report-product-list">
        {products.map((product, index) => <article key={index}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {product.unit === 'Adet' ? (
                <span style={{ fontSize: '11px', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>📦 Sarf Malzemesi / Parça</span>
              ) : (
                <span style={{ fontSize: '11px', background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>🧪 Biyosidal İlaç / Kimyasal</span>
              )}
              {product.productName && <strong style={{ fontSize: '13px', color: '#0f172a' }}>{product.productName}</strong>}
            </div>
            {!readOnly && products.length > 1 && (
              <button type="button" className="report-product-remove" style={{ margin: 0 }} onClick={() => setProducts((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                <Trash2 size={14} /> Kaldır
              </button>
            )}
          </div>
          <div className="report-product-grid">
            <StockSelect label="Araç stoğundan ürün / sarf" value={product.vehicleStockItemId} stockItems={vehicleStockItems} disabled={readOnly} onChange={(stock) => updateProduct(index, { vehicleStockItemId: stock?.vehicleStockItemId, productName: stock?.productName ?? '', unit: stock ? usageUnits(stock.unit)[0] : (product.unit || 'Adet'), licenseNumber: stock?.licenseNumber ?? '', licenseDocumentId: stock?.licenseDocumentId })} />
            <Field label="Ruhsat / ürün bilgisi" value={product.licenseNumber ?? ''} onChange={(value) => updateProduct(index, { licenseNumber: value, licenseDocumentId: undefined })} disabled={readOnly || Boolean(product.licenseDocumentId)} placeholder={product.vehicleStockItemId ? 'Ürüne bağlı ruhsat bulunamadı' : 'Sarf malzemesi için gerekmez'} />
            <CatalogSelectField label="Kullanım yeri / yöntemi" options={catalog.applicationMethods} value={product.applicationMethod ?? ''} disabled={readOnly} onChange={(value) => updateProduct(index, { applicationMethod: value })} />
            <Field label="Etken madde / sarf türü" value={product.activeIngredient ?? ''} onChange={(value) => updateProduct(index, { activeIngredient: value })} disabled={readOnly} placeholder="Etken madde" />
            <Field label="Kullanılan miktar" value={String(product.amountUsed || '')} onChange={(value) => updateProduct(index, { amountUsed: Number(value) })} disabled={readOnly} type="number" />
            <label className="report-control">Birim<select value={product.unit} disabled={readOnly || !product.vehicleStockItemId} onChange={(event) => updateProduct(index, { unit: event.target.value })}>{usageUnits(vehicleStockItems.find((item) => item.vehicleStockItemId === product.vehicleStockItemId)?.unit || product.unit).map((unit) => <option key={unit}>{unit}</option>)}</select></label>
          </div>
          {product.licenseDocumentId && <small className="report-license-linked"><FileCheck2 size={14} /> Ürüne bağlı güncel ruhsat EK-1 formuna otomatik eklendi.</small>}
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
