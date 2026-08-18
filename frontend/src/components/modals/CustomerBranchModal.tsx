import { useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import {
  Building2,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  MapPin,
  Plus,
  Table2,
  UploadCloud,
  X,
} from 'lucide-react';
import type { CreateBranchInput, CreateCustomerInput, CustomerRecord } from '../../services/workOrderApi';
import { downloadBranchTemplate, parseBranchWorkbook } from '../../utils/branchExcel';

type CustomerBranchModalProps = {
  customers: CustomerRecord[];
  onClose: () => void;
  onSubmit: (customerId: string | null, customer: CreateCustomerInput | null, branches: CreateBranchInput[]) => Promise<void>;
};

type ManualBranchDraft = {
  name: string; code: string; address: string; city: string; district: string; contactName: string;
  phoneNumber: string; email: string; latitude: string; longitude: string; mapUrl: string;
  portalContactName: string; portalEmail: string; portalPassword: string;
};

const emptyManualBranch: ManualBranchDraft = {
  name: '', code: '', address: '', city: '', district: '', contactName: '', phoneNumber: '', email: '',
  latitude: '', longitude: '', mapUrl: '', portalContactName: '', portalEmail: '', portalPassword: '',
};

export default function CustomerBranchModal({ customers, onClose, onSubmit }: CustomerBranchModalProps) {
  const [mode, setMode] = useState<'existing' | 'new'>(customers.length > 0 ? 'existing' : 'new');
  const [newCustomerStructure, setNewCustomerStructure] = useState<'single' | 'multi'>('single');
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [importMode, setImportMode] = useState<'manual' | 'excel' | 'text'>('manual');
  const [manualBranch, setManualBranch] = useState<ManualBranchDraft>(emptyManualBranch);
  const [branchText, setBranchText] = useState('');
  const [excelBranches, setExcelBranches] = useState<CreateBranchInput[]>([]);
  const [excelFileName, setExcelFileName] = useState('');
  const [excelError, setExcelError] = useState<string | null>(null);
  const [isReadingExcel, setIsReadingExcel] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textBranches = useMemo(() => parseBranches(branchText), [branchText]);
  const manualBranches = useMemo(() => toManualBranches(manualBranch), [manualBranch]);
  const parsedBranches = importMode === 'manual' ? manualBranches : importMode === 'excel' ? excelBranches : textBranches;

  const loadExcelFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setExcelError('Dosya boyutu 5 MB sınırını aşamaz.');
      setExcelBranches([]);
      return;
    }

    setIsReadingExcel(true);
    setExcelError(null);
    setError(null);
    try {
      const branches = await parseBranchWorkbook(file);
      setExcelBranches(branches);
      setExcelFileName(file.name);
    } catch (readError) {
      setExcelBranches([]);
      setExcelFileName(file.name);
      setExcelError(readError instanceof Error ? readError.message : 'Excel dosyası okunamadı.');
    } finally {
      setIsReadingExcel(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void loadExcelFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void loadExcelFile(event.dataTransfer.files?.[0]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const singleLocation = mode === 'new' && newCustomerStructure === 'single';
    const hasIncompleteManualBranch = !singleLocation && importMode === 'manual' && Object.values(manualBranch).some((value) => value.trim()) && manualBranches.length === 0;
    if (hasIncompleteManualBranch) {
      setError('Şube adı ve açık adres alanlarını tamamlayın.');
      return;
    }
    if (mode === 'existing' && parsedBranches.length === 0) {
      setError(importMode === 'manual' ? 'Şube adı ve açık adres alanlarını tamamlayın.' : importMode === 'excel' ? 'Geçerli bir Excel dosyası yükleyin.' : 'En az bir şube satırı girin.');
      return;
    }
    const customer: CreateCustomerInput | null = mode === 'new' ? {
      legalName: String(formData.get('legalName')),
      code: String(formData.get('code') || '') || undefined,
      contactName: String(formData.get('contactName') || '') || undefined,
      phoneNumber: String(formData.get('phoneNumber') || '') || undefined,
      email: String(formData.get('email') || '') || undefined,
      address: String(formData.get('address') || '') || undefined,
      city: String(formData.get('city') || '') || undefined,
      district: String(formData.get('district') || '') || undefined,
      latitude: optionalNumber(formData.get('latitude')),
      longitude: optionalNumber(formData.get('longitude')),
      mapUrl: String(formData.get('mapUrl') || '') || undefined,
      portalContactName: String(formData.get('portalContactName') || '') || undefined,
      portalEmail: String(formData.get('portalEmail') || '') || undefined,
      portalPassword: String(formData.get('portalPassword') || '') || undefined,
    } : null;
    const branchesToSave: CreateBranchInput[] = singleLocation && customer ? [{
      name: 'Merkez',
      code: customer.code ? `${customer.code}-MRK` : undefined,
      address: customer.address ?? '',
      city: customer.city,
      district: customer.district,
      contactName: customer.contactName,
      phoneNumber: customer.phoneNumber,
      email: customer.email,
      latitude: customer.latitude,
      longitude: customer.longitude,
      mapUrl: customer.mapUrl,
    }] : parsedBranches;
    if (singleLocation && !customer?.address?.trim()) {
      setError('Tek lokasyonlu müşteri için açık adresi girin. Bu adres Merkez lokasyonu olarak kaydedilecek.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(mode === 'existing' ? customerId : null, customer, branchesToSave);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Müşteri ve şubeler kaydedilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Müşteri ve şube yönetimi">
      <div className="modal customer-branch-modal">
        <div className="modal-header"><div><p className="eyebrow">MÜŞTERİ PORTFÖYÜ</p><h2>Müşteri ve şube ekle</h2><p>Çatı firma ile lokasyonların iletişim ve konum bilgilerini ayrı yönetin.</p></div><button className="icon-button" onClick={onClose} aria-label="Kapat"><X size={20} /></button></div>
        <form onSubmit={handleSubmit} autoComplete="off" data-lpignore="true" data-form-type="other">
          <div className="customer-mode-switch"><button type="button" className={mode === 'new' ? 'active' : ''} onClick={() => setMode('new')}><Building2 size={15} /> Yeni çatı müşteri</button><button type="button" className={mode === 'existing' ? 'active' : ''} onClick={() => setMode('existing')} disabled={customers.length === 0}><Plus size={15} /> Mevcut müşteriye şube</button></div>

          {mode === 'new' && <div className="customer-structure-switch" role="radiogroup" aria-label="Müşteri lokasyon yapısı"><button type="button" role="radio" aria-checked={newCustomerStructure === 'single'} className={newCustomerStructure === 'single' ? 'active' : ''} onClick={() => { setNewCustomerStructure('single'); setError(null); }}><MapPin size={18} /><span><strong>Tek lokasyon</strong><small>Fabrika, depo veya tek işletme</small></span><CheckCircle2 size={17} /></button><button type="button" role="radio" aria-checked={newCustomerStructure === 'multi'} className={newCustomerStructure === 'multi' ? 'active' : ''} onClick={() => { setNewCustomerStructure('multi'); setError(null); }}><Building2 size={18} /><span><strong>Şubeli yapı</strong><small>Bir çatı altında birden çok lokasyon</small></span><CheckCircle2 size={17} /></button></div>}

          {mode === 'existing' ? <label className="standalone-field">Müşteri<select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.legalName} · {customer.branches.length} şube</option>)}</select></label> : <section className="customer-data-section">
            <div className="modal-subheading"><Building2 size={18} /><div><strong>{newCustomerStructure === 'single' ? 'Müşteri ve tek lokasyon bilgileri' : 'Çatı müşteri bilgileri'}</strong><span>{newCustomerStructure === 'single' ? 'Bu bilgiler otomatik olarak Merkez lokasyonuna da bağlanır.' : 'Merkez iletişim ve fatura/operasyon konumu'}</span></div></div>
            <div className="form-grid customer-data-grid">
              <label>Müşteri / marka adı<input name="legalName" required autoComplete="off" /></label><label>Müşteri kodu<input name="code" placeholder="Otomatik oluşturulur" autoComplete="off" /></label>
              <label>Merkez yetkilisi<input name="contactName" placeholder="Ad Soyad" autoComplete="off" /></label><label>Merkez telefonu<input name="phoneNumber" type="tel" autoComplete="off" /></label>
              <label>Merkez e-postası<input name="email" type="email" autoComplete="new-password" data-lpignore="true" placeholder="musteri@firma.com" /></label><label>İl / İlçe<span className="inline-field-pair"><input name="city" placeholder="İl" autoComplete="off" /><input name="district" placeholder="İlçe" autoComplete="off" /></span></label>
              <label className="form-field-wide">Merkez adresi<input name="address" required={newCustomerStructure === 'single'} placeholder="Açık adres" autoComplete="off" /></label>
              <label className="form-field-wide">Google Haritalar bağlantısı<input name="mapUrl" type="url" autoComplete="off" /></label>
              <label>Enlem<input name="latitude" type="number" step="0.000001" autoComplete="off" /></label><label>Boylam<input name="longitude" type="number" step="0.000001" autoComplete="off" /></label>
            </div>
            <div className="customer-portal-account-block">
              <div className="modal-subheading"><CheckCircle2 size={18} /><div><strong>Çatı müşteri portal hesabı</strong><span>Bu hesap müşteri altındaki tüm şubeleri, işleri ve raporları görür.</span></div></div>
              <div className="form-grid customer-data-grid">
                <label>Hesap yetkilisi<input name="portalContactName" placeholder="Ad Soyad" autoComplete="off" /></label>
                <label>Giriş e-postası<input name="portalEmail" type="email" autoComplete="new-password" data-lpignore="true" placeholder="portal@musteri.com" /></label>
                <label>Geçici şifre<input name="portalPassword" type="password" minLength={6} placeholder="En az 6 karakter" autoComplete="new-password" data-lpignore="true" /></label>
                <div className="portal-account-note">E-posta ve şifre birlikte girildiğinde müşteri hesabı anında açılır.</div>
              </div>
            </div>
          </section>}

          {mode === 'new' && newCustomerStructure === 'single' && <div className="single-location-summary"><MapPin size={20} /><div><strong>Merkez lokasyonu otomatik oluşturulacak</strong><span>Yukarıdaki adres, yetkili, telefon, e-posta ve harita bilgileri tek operasyon noktası olarak kullanılacak. Daha sonra yeni şubeler ekleyebilirsiniz.</span></div></div>}

          {(mode === 'existing' || newCustomerStructure === 'multi') && <section className="bulk-branch-section">
            <div className="modal-subheading"><FileSpreadsheet size={18} /><div><strong>Şubeleri içe aktar</strong><span>{mode === 'new' ? 'İsterseniz müşteriyi şubesiz kaydedebilir veya ' : ''}Excel dosyasıyla ya da metin listesiyle 250 lokasyona kadar ekleyin.</span></div><em>{parsedBranches.length} şube</em></div>
            <div className="branch-import-switch" role="tablist" aria-label="Şube ekleme yöntemi">
              <button type="button" className={importMode === 'manual' ? 'active' : ''} onClick={() => { setImportMode('manual'); setError(null); }}><Plus size={15} /> Tek şube</button>
              <button type="button" className={importMode === 'excel' ? 'active' : ''} onClick={() => { setImportMode('excel'); setError(null); }}><FileSpreadsheet size={15} /> Excel dosyası</button>
              <button type="button" className={importMode === 'text' ? 'active' : ''} onClick={() => { setImportMode('text'); setError(null); }}><Table2 size={15} /> Metinle ekle</button>
            </div>

            {importMode === 'manual' ? <div className="manual-branch-form">
              <div className="form-grid customer-data-grid">
                <label>Şube adı<input value={manualBranch.name} onChange={(event) => setManualBranch({ ...manualBranch, name: event.target.value })} autoComplete="off" /></label>
                <label>Şube kodu<input value={manualBranch.code} onChange={(event) => setManualBranch({ ...manualBranch, code: event.target.value })} placeholder="Otomatik oluşturulur" autoComplete="off" /></label>
                <label>Şube yetkilisi<input value={manualBranch.contactName} onChange={(event) => setManualBranch({ ...manualBranch, contactName: event.target.value })} placeholder="Ad Soyad" autoComplete="off" /></label>
                <label>Telefon<input type="tel" value={manualBranch.phoneNumber} onChange={(event) => setManualBranch({ ...manualBranch, phoneNumber: event.target.value })} autoComplete="off" /></label>
                <label>E-posta<input type="email" value={manualBranch.email} onChange={(event) => setManualBranch({ ...manualBranch, email: event.target.value })} autoComplete="new-password" data-lpignore="true" /></label>
                <label>İl / İlçe<span className="inline-field-pair"><input value={manualBranch.city} onChange={(event) => setManualBranch({ ...manualBranch, city: event.target.value })} placeholder="İl" autoComplete="off" /><input value={manualBranch.district} onChange={(event) => setManualBranch({ ...manualBranch, district: event.target.value })} placeholder="İlçe" autoComplete="off" /></span></label>
                <label className="form-field-wide">Açık adres<input value={manualBranch.address} onChange={(event) => setManualBranch({ ...manualBranch, address: event.target.value })} placeholder="Mahalle, cadde, bina ve kat bilgisi" autoComplete="off" /></label>
                <label className="form-field-wide">Google Haritalar bağlantısı<input type="url" value={manualBranch.mapUrl} onChange={(event) => setManualBranch({ ...manualBranch, mapUrl: event.target.value })} autoComplete="off" /></label>
                <label>Enlem<input type="number" step="0.000001" value={manualBranch.latitude} onChange={(event) => setManualBranch({ ...manualBranch, latitude: event.target.value })} autoComplete="off" /></label>
                <label>Boylam<input type="number" step="0.000001" value={manualBranch.longitude} onChange={(event) => setManualBranch({ ...manualBranch, longitude: event.target.value })} autoComplete="off" /></label>
              </div>
              <div className="branch-portal-fields"><strong>Şube müşteri portalı <small>Opsiyonel</small></strong><div className="form-grid customer-data-grid"><label>Portal yetkilisi<input value={manualBranch.portalContactName} onChange={(event) => setManualBranch({ ...manualBranch, portalContactName: event.target.value })} placeholder="Ad Soyad" autoComplete="off" /></label><label>Giriş e-postası<input type="email" value={manualBranch.portalEmail} onChange={(event) => setManualBranch({ ...manualBranch, portalEmail: event.target.value })} autoComplete="new-password" data-lpignore="true" /></label><label>Geçici şifre<input type="password" minLength={6} value={manualBranch.portalPassword} onChange={(event) => setManualBranch({ ...manualBranch, portalPassword: event.target.value })} placeholder="En az 6 karakter" autoComplete="new-password" data-lpignore="true" /></label><div className="portal-account-note">E-posta ve şifre birlikte girildiğinde yalnızca bu şubeyi gören müşteri hesabı açılır.</div></div></div>
            </div> : importMode === 'excel' ? <>
              <div
                className={`excel-upload-zone ${isDragging ? 'dragging' : ''} ${excelBranches.length > 0 ? 'ready' : ''}`}
                onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
                <span className="excel-upload-icon">{excelBranches.length > 0 ? <CheckCircle2 size={25} /> : <UploadCloud size={25} />}</span>
                <div><strong>{isReadingExcel ? 'Dosya okunuyor…' : excelBranches.length > 0 ? excelFileName : 'Excel dosyasını buraya bırakın'}</strong><span>{excelBranches.length > 0 ? `${excelBranches.length} geçerli şube içe aktarılmaya hazır.` : 'XLSX, XLS veya CSV · en fazla 5 MB'}</span></div>
                <button type="button" className="secondary-button" disabled={isReadingExcel} onClick={() => fileInputRef.current?.click()}>{excelBranches.length > 0 ? 'Dosyayı değiştir' : 'Dosya seç'}</button>
              </div>
              <div className="excel-import-toolbar">
                <span>İlk satır sütun başlıkları olmalıdır.</span>
                <button type="button" onClick={downloadBranchTemplate}><Download size={15} /> Excel şablonunu indir</button>
              </div>
              {excelError && <div className="excel-import-error" role="alert">{excelError}</div>}
              {excelBranches.length > 0 && <div className="excel-preview">
                <div className="excel-preview-heading"><strong>Aktarım önizlemesi</strong><span>İlk {Math.min(5, excelBranches.length)} kayıt gösteriliyor</span></div>
                <div className="excel-preview-table-wrap"><table><thead><tr><th>Şube</th><th>Konum</th><th>Yetkili</th><th>İletişim</th></tr></thead><tbody>{excelBranches.slice(0, 5).map((branch, index) => <tr key={`${branch.code ?? branch.name}-${index}`}><td><strong>{branch.name}</strong>{branch.code && <small>{branch.code}</small>}</td><td>{[branch.district, branch.city].filter(Boolean).join(' / ') || '—'}<small>{branch.address}</small></td><td>{branch.contactName || '—'}</td><td>{branch.phoneNumber || branch.email || '—'}{branch.phoneNumber && branch.email && <small>{branch.email}</small>}</td></tr>)}</tbody></table></div>
              </div>}
            </> : <>
              <textarea value={branchText} onChange={(event) => setBranchText(event.target.value)} rows={7} placeholder="Her satıra bir şube kaydı yapıştırın" />
              <div className="bulk-format-note"><MapPin size={15} /><span>Zorunlu alanlar: <strong>Şube adı</strong> ve <strong>açık adres</strong>. Kullanılmayan sütunları boş bırakabilirsiniz; ayırıcı olarak <strong>|</strong> kullanın.</span></div>
            </>}
          </section>}

          {error && <div className="modal-form-error" role="alert">{error}</div>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Vazgeç</button><button type="submit" className="primary-button" disabled={isSubmitting || isReadingExcel || (mode === 'existing' && parsedBranches.length === 0)}>{isSubmitting ? 'Kaydediliyor…' : mode === 'new' && newCustomerStructure === 'single' ? 'Müşteri ve Merkez Lokasyonu Kaydet' : parsedBranches.length > 0 ? `${parsedBranches.length} Şubeyi Kaydet` : mode === 'existing' ? 'Şube Bilgilerini Tamamlayın' : 'Çatı Müşteriyi Kaydet'} <Plus size={17} /></button></div>
        </form>
      </div>
    </div>
  );
}

function parseBranches(value: string): CreateBranchInput[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [name = '', city = '', district = '', address = '', contactName = '', phoneNumber = '', email = '', latitude = '', longitude = '', mapUrl = '', portalContactName = '', portalEmail = '', portalPassword = ''] = line.split('|').map((part) => part.trim());
    return { name, city: city || undefined, district: district || undefined, address, contactName: contactName || undefined, phoneNumber: phoneNumber || undefined, email: email || undefined, latitude: optionalNumber(latitude), longitude: optionalNumber(longitude), mapUrl: mapUrl || undefined, portalContactName: portalContactName || undefined, portalEmail: portalEmail || undefined, portalPassword: portalPassword || undefined };
  }).filter((branch) => branch.name.length > 0 && branch.address.length > 0).slice(0, 250);
}

function toManualBranches(branch: ManualBranchDraft): CreateBranchInput[] {
  const name = branch.name.trim();
  const address = branch.address.trim();
  if (!name || !address) return [];
  return [{
    name,
    address,
    code: optionalText(branch.code),
    city: optionalText(branch.city),
    district: optionalText(branch.district),
    contactName: optionalText(branch.contactName),
    phoneNumber: optionalText(branch.phoneNumber),
    email: optionalText(branch.email),
    latitude: optionalNumber(branch.latitude),
    longitude: optionalNumber(branch.longitude),
    mapUrl: optionalText(branch.mapUrl),
    portalContactName: optionalText(branch.portalContactName),
    portalEmail: optionalText(branch.portalEmail),
    portalPassword: optionalText(branch.portalPassword),
  }];
}

function optionalText(value: string) {
  const text = value.trim();
  return text || undefined;
}

function optionalNumber(value: FormDataEntryValue | string | null) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!text) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}
