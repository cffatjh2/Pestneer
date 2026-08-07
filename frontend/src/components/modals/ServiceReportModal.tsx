import { useState } from 'react';
import { Check, FileCheck2, Plus, Save, Trash2, X } from 'lucide-react';
import type { WorkOrder } from '../../types';
import type { ReportProductInput, ReportStationInput, ServiceReportRecord, UpsertServiceReportInput } from '../../services/serviceReportApi';
import { pesticideCatalog } from '../../data/pesticideCatalog';
import SignaturePad from './SignaturePad';

type Props = {
  order: WorkOrder; existing?: ServiceReportRecord; companyName: string; operatorName: string;
  readOnly?: boolean; onClose: () => void; onSave: (input: UpsertServiceReportInput) => Promise<void>;
};

type FormState = Omit<UpsertServiceReportInput, 'finalize' | 'stations' | 'products' | 'areaSquareMeters'> & { areaSquareMeters: string };

const blankStation = (): ReportStationInput => ({ deviceNumber: '', area: '', deviceType: 'EFT', targetPest: '', caughtCount: 0, hasActivity: false, plateChanged: false, deviceStatus: 'Active', notes: '' });
const blankProduct = (): ReportProductInput => ({ productName: '', licenseNumber: '', applicationMethod: '', dilutionRate: '', activeIngredient: '', antidote: '', packingQuantity: '', amountUsed: 0, unit: 'ml' });

export default function ServiceReportModal({ order, existing, companyName, operatorName, readOnly = false, onClose, onSave }: Props) {
  const [form, setForm] = useState<FormState>(() => createInitialForm(order, existing, companyName));
  const [stations, setStations] = useState<ReportStationInput[]>(existing?.stations.map(stripStationId) ?? [blankStation()]);
  const [products, setProducts] = useState<ReportProductInput[]>(existing?.products.map(stripProductId) ?? [blankProduct()]);
  const [signatureTarget, setSignatureTarget] = useState<'manager' | 'customer' | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const updateStation = (index: number, patch: Partial<ReportStationInput>) => setStations((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const updateProduct = (index: number, patch: Partial<ReportProductInput>) => setProducts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));

  const submit = async (finalize: boolean) => {
    setSaving(true); setError(null);
    try {
      await onSave({
        ...form,
        areaSquareMeters: form.areaSquareMeters ? Number(form.areaSquareMeters) : undefined,
        finalize,
        stations: stations.filter((item) => item.deviceNumber.trim() || item.area.trim()),
        products: products.filter((item) => item.productName.trim()),
      });
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Rapor kaydedilemedi.'); }
    finally { setSaving(false); }
  };

  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Saha hizmet raporu">
    <div className="modal service-report-modal">
      <div className="modal-header"><div><p className="eyebrow">SAHA HİZMET RAPORU · {order.id}</p><h2>{existing ? 'Raporu düzenle' : 'Yeni uygulama raporu'}</h2><p>{order.client} · {order.branch} · Operatör: {operatorName}</p></div><button className="icon-button" onClick={onClose}><X size={20} /></button></div>
      <div className="report-form-status"><FileCheck2 size={18} /><div><strong>{existing?.status === 'Finalized' ? 'Onaylanmış rapor' : 'Taslak çalışma'}</strong><span>EK-1 uygulama bilgileri ile trend istasyon verileri aynı raporda tutulur.</span></div></div>

      <section className="report-form-section"><header><span>1</span><div><strong>Firma ve uygulama bilgileri</strong><small>Resmi EK-1 alanları</small></div></header><div className="form-grid report-form-grid">
        <Field label="Uygulayıcı firma" value={form.firmName} onChange={(value) => setField('firmName', value)} disabled={readOnly} />
        <Field label="Mesul müdür" value={form.responsibleManager ?? ''} onChange={(value) => setField('responsibleManager', value)} disabled={readOnly} />
        <Field label="Firma adresi" value={form.firmAddress ?? ''} onChange={(value) => setField('firmAddress', value)} disabled={readOnly} wide />
        <Field label="Firma telefonu" value={form.firmPhone ?? ''} onChange={(value) => setField('firmPhone', value)} disabled={readOnly} />
        <Field label="İzin tarih / sayısı" value={form.permissionNumber ?? ''} onChange={(value) => setField('permissionNumber', value)} disabled={readOnly} />
        <Field label="Ekip sorumlusu" value={form.teamManager ?? ''} onChange={(value) => setField('teamManager', value)} disabled={readOnly} />
        <Field label="Firma web adresi" value={form.firmWeb ?? ''} onChange={(value) => setField('firmWeb', value)} disabled={readOnly} />
        <Field label="Hedef zararlı" value={form.targetPests ?? ''} onChange={(value) => setField('targetPests', value)} disabled={readOnly} placeholder="Hamamböceği, kemirgen, karasinek..." />
        <Field label="Alan (m²)" value={form.areaSquareMeters} onChange={(value) => setField('areaSquareMeters', value)} disabled={readOnly} type="number" />
        <Field label="Mahal türü" value={form.residenceType ?? ''} onChange={(value) => setField('residenceType', value)} disabled={readOnly} placeholder="İşyeri, üretim alanı, depo..." />
        <Field label="İş türü" value={form.workType ?? ''} onChange={(value) => setField('workType', value)} disabled={readOnly} placeholder="Periyodik kontrol / uygulama" />
        <TextField label="Sarf malzemeleri" value={form.consumables ?? ''} onChange={(value) => setField('consumables', value)} disabled={readOnly} />
        <TextField label="Güvenlik önlemleri" value={form.safetyMeasures ?? ''} onChange={(value) => setField('safetyMeasures', value)} disabled={readOnly} />
      </div></section>

      <section className="report-form-section"><header><span>2</span><div><strong>İstasyon ve aktivite kontrolü</strong><small>EFT, canlı yakalama ve kemirgen istasyonları</small></div>{!readOnly && <button onClick={() => setStations((current) => [...current, blankStation()])}><Plus size={15} /> İstasyon ekle</button>}</header><div className="report-entry-table-wrap"><table className="report-entry-table stations"><thead><tr><th>No</th><th>Alan</th><th>Tür</th><th>Hedef zararlı</th><th>Yakalanan</th><th>Aktivite</th><th>Plaka</th><th>Durum</th><th /></tr></thead><tbody>{stations.map((station, index) => <tr key={index}>
        <td><input value={station.deviceNumber} disabled={readOnly} onChange={(event) => updateStation(index, { deviceNumber: event.target.value })} placeholder="EFT-01" /></td><td><input value={station.area} disabled={readOnly} onChange={(event) => updateStation(index, { area: event.target.value })} placeholder="Mutfak" /></td>
        <td><select value={station.deviceType} disabled={readOnly} onChange={(event) => updateStation(index, { deviceType: event.target.value })}><option value="EFT">EFT</option><option value="LiveCapture">Canlı yakalama</option><option value="Rodent">Kemirgen</option><option value="InsectMonitor">Haşere monitörü</option><option value="Other">Diğer</option></select></td>
        <td><input value={station.targetPest ?? ''} disabled={readOnly} onChange={(event) => updateStation(index, { targetPest: event.target.value })} placeholder="Karasinek" /></td><td><input type="number" min="0" value={station.caughtCount} disabled={readOnly} onChange={(event) => updateStation(index, { caughtCount: Number(event.target.value), hasActivity: Number(event.target.value) > 0 || station.hasActivity })} /></td>
        <td><input type="checkbox" checked={station.hasActivity} disabled={readOnly} onChange={(event) => updateStation(index, { hasActivity: event.target.checked })} /></td><td><input type="checkbox" checked={station.plateChanged} disabled={readOnly} onChange={(event) => updateStation(index, { plateChanged: event.target.checked })} /></td>
        <td><select value={station.deviceStatus} disabled={readOnly} onChange={(event) => updateStation(index, { deviceStatus: event.target.value })}><option value="Active">Aktif</option><option value="Damaged">Hasarlı</option><option value="Missing">Kayıp</option><option value="Replaced">Değiştirildi</option><option value="Passive">Pasif</option></select></td><td>{!readOnly && stations.length > 1 && <button className="report-row-remove" onClick={() => setStations((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={15} /></button>}</td>
      </tr>)}</tbody></table></div></section>

      <section className="report-form-section"><header><span>3</span><div><strong>Kullanılan biyosidal ürünler</strong><small>Ürün, ruhsat, etken madde ve sarf miktarı</small></div>{!readOnly && <button onClick={() => setProducts((current) => [...current, blankProduct()])}><Plus size={15} /> Ürün ekle</button>}</header><div className="report-product-list">{products.map((product, index) => <article key={index}><div className="form-grid report-form-grid">
        <label className="form-field-wide">Ürün adı<input list={`report-products-${index}`} value={product.productName} disabled={readOnly} placeholder="Listeden seçin veya ürün adını yazın" onChange={(event) => updateProduct(index, { productName: event.target.value })} /><datalist id={`report-products-${index}`}>{pesticideCatalog.map((item) => <option key={item} value={item} />)}</datalist></label>
        <Field label="Ruhsat bilgisi" value={product.licenseNumber ?? ''} onChange={(value) => updateProduct(index, { licenseNumber: value })} disabled={readOnly} />
        <Field label="Uygulama yöntemi" value={product.applicationMethod ?? ''} onChange={(value) => updateProduct(index, { applicationMethod: value })} disabled={readOnly} />
        <Field label="Etken madde" value={product.activeIngredient ?? ''} onChange={(value) => updateProduct(index, { activeIngredient: value })} disabled={readOnly} />
        <Field label="Seyreltme oranı" value={product.dilutionRate ?? ''} onChange={(value) => updateProduct(index, { dilutionRate: value })} disabled={readOnly} />
        <Field label="Kullanılan miktar" value={String(product.amountUsed)} onChange={(value) => updateProduct(index, { amountUsed: Number(value) })} disabled={readOnly} type="number" />
        <Field label="Birim" value={product.unit} onChange={(value) => updateProduct(index, { unit: value })} disabled={readOnly} />
      </div>{!readOnly && products.length > 1 && <button className="report-product-remove" onClick={() => setProducts((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /> Ürünü kaldır</button>}</article>)}</div></section>

      <section className="report-form-section"><header><span>4</span><div><strong>Sonuç ve öneriler</strong><small>Saha bulguları ve düzeltici faaliyet</small></div></header><div className="form-grid report-form-grid">
        <TextField label="Yapılan uygulama özeti" value={form.applicationSummary ?? ''} onChange={(value) => setField('applicationSummary', value)} disabled={readOnly} wide />
        <TextField label="Saha bulguları" value={form.findings ?? ''} onChange={(value) => setField('findings', value)} disabled={readOnly} />
        <TextField label="Düzeltici faaliyetler" value={form.correctiveActions ?? ''} onChange={(value) => setField('correctiveActions', value)} disabled={readOnly} />
        <TextField label="Öneriler" value={form.recommendations ?? ''} onChange={(value) => setField('recommendations', value)} disabled={readOnly} wide />
      </div></section>

      <section className="report-form-section"><header><span>5</span><div><strong>Dijital onay</strong><small>Uygulayıcı ve müşteri yetkilisi imzası</small></div></header><div className="report-signature-grid">
        <SignatureCard label="Uygulayıcı / ekip sorumlusu" value={form.managerSignatureData} disabled={readOnly} onClick={() => setSignatureTarget('manager')} />
        <div className="report-customer-sign"><Field label="Müşteri yetkilisi" value={form.customerRepresentativeName ?? ''} onChange={(value) => setField('customerRepresentativeName', value)} disabled={readOnly} /><SignatureCard label="Müşteri yetkilisi imzası" value={form.customerSignatureData} disabled={readOnly} onClick={() => setSignatureTarget('customer')} /></div>
      </div></section>

      {error && <div className="modal-form-error">{error}</div>}
      <div className="modal-actions service-report-actions"><button className="secondary-button" onClick={onClose}>Kapat</button>{!readOnly && <><button className="secondary-button" disabled={saving} onClick={() => void submit(false)}><Save size={16} /> Taslak Kaydet</button><button className="primary-button" disabled={saving} onClick={() => void submit(true)}><Check size={17} /> Raporu Onayla</button></>}</div>
    </div>
    {signatureTarget && <SignaturePad onClose={() => setSignatureTarget(null)} onSave={(image) => { setField(signatureTarget === 'manager' ? 'managerSignatureData' : 'customerSignatureData', image); setSignatureTarget(null); }} />}
  </div>;
}

function Field({ label, value, onChange, disabled, wide = false, type = 'text', placeholder }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; wide?: boolean; type?: string; placeholder?: string }) {
  return <label className={wide ? 'form-field-wide' : ''}>{label}<input type={type} min={type === 'number' ? '0' : undefined} value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}
function TextField({ label, value, onChange, disabled, wide = false }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; wide?: boolean }) { return <label className={wide ? 'form-field-wide' : ''}>{label}<textarea value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>; }
function SignatureCard({ label, value, disabled, onClick }: { label: string; value?: string; disabled?: boolean; onClick: () => void }) { return <button className={`report-signature-card ${value ? 'signed' : ''}`} disabled={disabled} onClick={onClick}>{value ? <img src={value} alt={`${label} imzası`} /> : <Plus size={21} />}<span>{value ? 'İmza kaydedildi' : label}</span></button>; }

function createInitialForm(order: WorkOrder, report: ServiceReportRecord | undefined, companyName: string): FormState {
  return {
    firmName: report?.firmName ?? companyName, firmAddress: report?.firmAddress ?? '', firmPhone: report?.firmPhone ?? '', firmWeb: report?.firmWeb ?? '',
    responsibleManager: report?.responsibleManager ?? '', permissionNumber: report?.permissionNumber ?? '', teamManager: report?.teamManager ?? '',
    targetPests: report?.targetPests ?? '', residenceType: report?.residenceType ?? 'İşyeri', areaSquareMeters: report?.areaSquareMeters?.toString() ?? '',
    workType: report?.workType ?? order.service, consumables: report?.consumables ?? '', safetyMeasures: report?.safetyMeasures ?? 'Uygulama alanı bilgilendirildi, gerekli kişisel koruyucu donanım kullanıldı.',
    applicationSummary: report?.applicationSummary ?? order.completionNote ?? '', findings: report?.findings ?? '', correctiveActions: report?.correctiveActions ?? '',
    recommendations: report?.recommendations ?? order.recommendation ?? '', customerRepresentativeName: report?.customerRepresentativeName ?? '',
    managerSignatureData: report?.managerSignatureData ?? '', customerSignatureData: report?.customerSignatureData ?? '',
  };
}
function stripStationId({ id: _, ...station }: ServiceReportRecord['stations'][number]): ReportStationInput { return station; }
function stripProductId({ id: _, ...product }: ServiceReportRecord['products'][number]): ReportProductInput { return product; }
