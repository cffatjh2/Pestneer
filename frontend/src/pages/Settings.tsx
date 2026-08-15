import { useEffect, useRef, useState } from 'react';
import { BrainCircuit, Building2, CheckCircle2, FileBadge2, FileCheck2, ImagePlus, Mail, RefreshCw, RotateCw, Save, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { CompanyBrandingSessionExpiredError, deleteCompanyLogo, getCompanyBranding, getCompanyLogoObjectUrl, retryReportEmails, testReportEmail, updateReportNotificationEmail, uploadCompanyLogo, type CompanyBranding } from '../services/brandingApi';
import { getVisionSettings, updateVisionSettings, type VisionSettings } from '../services/pestneerVisionApi';
import { getStoredCompanyEk1Defaults, saveStoredCompanyEk1Defaults, type CompanyEk1Defaults } from '../services/companySettingsStorage';
import { CompanyAccountResetCard, PasswordChangeCard } from '../components/security/PasswordSecurityCards';

export default function Settings({ accessToken, companyName, onSessionExpired, onNotify }: { accessToken: string; companyName: string; onSessionExpired: () => void; onNotify: (message: string) => void }) {
  const [branding, setBranding] = useState<CompanyBranding | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vision, setVision] = useState<VisionSettings | null>(null);
  const [notificationEmail, setNotificationEmail] = useState('');
  const [ek1Defaults, setEk1Defaults] = useState<CompanyEk1Defaults>(() => getStoredCompanyEk1Defaults(companyName));
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const value = await getCompanyBranding(accessToken);
      setBranding(value);
      setNotificationEmail(value.reportNotificationEmail ?? '');
      if (logoUrl) URL.revokeObjectURL(logoUrl);
      setLogoUrl(value.hasLogo ? await getCompanyLogoObjectUrl(accessToken) : null);
      setEk1Defaults(getStoredCompanyEk1Defaults(companyName));
    } catch (loadError) {
      if (loadError instanceof CompanyBrandingSessionExpiredError) return onSessionExpired();
      setError(loadError instanceof Error ? loadError.message : 'Firma markası yüklenemedi.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); return () => { if (logoUrl) URL.revokeObjectURL(logoUrl); }; }, [accessToken]);
  useEffect(() => { getVisionSettings(accessToken).then(setVision).catch(() => setError('PestneerVision ayarları yüklenemedi.')); }, [accessToken]);

  const saveEk1Defaults = () => {
    saveStoredCompanyEk1Defaults(ek1Defaults, companyName);
    onNotify('Resmi EK-1 firma ve sorumlu varsayılanları kaydedildi. Yeni formlarda otomatik doldurulacak.');
  };

  const saveVision = async (next: VisionSettings) => {
    setSaving(true); setError(null);
    try { const saved = await updateVisionSettings(accessToken, { enabled: next.enabled, reviewRequired: next.reviewRequired, preferredModel: next.preferredModel }); setVision(saved); onNotify('PestneerVision ayarları kaydedildi.'); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'PestneerVision ayarları kaydedilemedi.'); }
    finally { setSaving(false); }
  };

  const upload = async (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return setError('PNG, JPG veya WEBP biçiminde bir logo seçin.');
    if (file.size > 4 * 1024 * 1024) return setError('Logo en fazla 4 MB olabilir.');
    setSaving(true); setError(null);
    try { await uploadCompanyLogo(accessToken, file); await load(); onNotify('Firma logosu belgelere uygulanmak üzere kaydedildi.'); }
    catch (uploadError) { if (uploadError instanceof CompanyBrandingSessionExpiredError) return onSessionExpired(); setError(uploadError instanceof Error ? uploadError.message : 'Logo yüklenemedi.'); }
    finally { setSaving(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  const remove = async () => {
    setSaving(true); setError(null);
    try { await deleteCompanyLogo(accessToken); await load(); onNotify('Firma logosu kaldırıldı.'); }
    catch (removeError) { if (removeError instanceof CompanyBrandingSessionExpiredError) return onSessionExpired(); setError(removeError instanceof Error ? removeError.message : 'Logo kaldırılamadı.'); }
    finally { setSaving(false); }
  };

  const saveNotificationEmail = async () => {
    setSaving(true); setError(null);
    try {
      const result = await updateReportNotificationEmail(accessToken, notificationEmail);
      setBranding((current) => current ? { ...current, reportNotificationEmail: result.reportNotificationEmail } : current);
      setNotificationEmail(result.reportNotificationEmail ?? '');
      onNotify('Rapor bildirim e-postası kaydedildi.');
    } catch (saveError) {
      if (saveError instanceof CompanyBrandingSessionExpiredError) return onSessionExpired();
      setError(saveError instanceof Error ? saveError.message : 'Bildirim e-postası kaydedilemedi.');
    } finally { setSaving(false); }
  };

  const retryEmails = async () => {
    setSaving(true); setError(null);
    try { const result = await retryReportEmails(accessToken); onNotify(`${result.sent} e-posta gönderildi, ${result.reset} başarısız kayıt yeniden kuyruğa alındı.`); }
    catch (retryError) { setError(retryError instanceof Error ? retryError.message : 'E-posta gönderimi yeniden başlatılamadı.'); }
    finally { setSaving(false); }
  };

  const sendTestEmail = async () => {
    setSaving(true); setError(null);
    try {
      const result = await testReportEmail(accessToken, notificationEmail);
      onNotify(`Test e-postası ${result.recipient} adresine ${result.provider} ile gönderildi.`);
    } catch (testError) {
      if (testError instanceof CompanyBrandingSessionExpiredError) return onSessionExpired();
      setError(testError instanceof Error ? testError.message : 'Test e-postası gönderilemedi.');
    } finally { setSaving(false); }
  };

  return <section className="page settings-page"><div className="page-header"><div><p className="eyebrow">FİRMA AYARLARI</p><h1>Kurumsal Kimlik & Form Ayarları</h1><span>Resmi saha raporları, EK-1 formları ve bildirimlerde kullanılacak firma bilgilerini yönetin.</span></div></div>
    {error && <div className="field-operation-error"><span>{error}</span></div>}
    <div className="settings-brand-grid"><section className="settings-brand-card"><header><span><Building2 size={21} /></span><div><strong>Firma logosu</strong><small>{branding?.companyName ?? companyName}</small></div></header>{loading ? <div className="settings-logo-loading"><RefreshCw className="spin-icon" /><span>Logo yükleniyor…</span></div> : <div className={`settings-logo-preview ${logoUrl ? 'has-logo' : ''}`}>{logoUrl ? <img src={logoUrl} alt={`${companyName} logosu`} /> : <><ImagePlus size={38} /><strong>Henüz firma logosu yüklenmedi</strong><span>Belge başlıklarında firma adı metin olarak kullanılacak.</span></>}</div>}<input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void upload(event.target.files?.[0])} /><div className="settings-logo-actions"><button className="primary-button" disabled={saving} onClick={() => inputRef.current?.click()}><Upload size={16} /> {logoUrl ? 'Logoyu Değiştir' : 'Logo Yükle'}</button>{logoUrl && <button className="secondary-button danger" disabled={saving} onClick={() => void remove()}><Trash2 size={16} /> Kaldır</button>}</div><p>Şeffaf arka planlı PNG önerilir. En fazla 4 MB; PNG, JPG veya WEBP.</p></section>
      <section className="settings-document-card"><header><span><FileBadge2 size={21} /></span><div><strong>Belge uygulaması</strong><small>Kurumsal logo otomatik yerleştirilir</small></div></header><ul><li><CheckCircle2 size={17} /> EK-1 biyosidal uygulama raporları</li><li><CheckCircle2 size={17} /> Trend analizleri ve risk değerlendirmeleri</li><li><CheckCircle2 size={17} /> A4 ekipman yerleşim planları ve krokiler</li><li><ShieldCheck size={17} /> Pestneer logosu resmi müşteri belgelerinde kullanılmaz</li></ul><div className="settings-document-note"><ImagePlus size={21} /><div><strong>Sol üst başlık alanı</strong><span>Yüklediğiniz logo oranı korunarak belgeye yerleştirilir. Logo yoksa firma unvanı gösterilir.</span></div></div></section></div>

    <section className="settings-ek1-card">
      <header>
        <span><FileCheck2 size={21} /></span>
        <div>
          <strong>Resmi EK-1 Formu Varsayılan Bilgileri</strong>
          <small>Her yeni EK-1 formu açıldığında firma adresi, mesul müdür, ekip sorumlusu ve telefon otomatik dolu gelir.</small>
        </div>
      </header>
      <div className="settings-ek1-grid">
        <label>
          Mesul Müdür
          <input
            type="text"
            value={ek1Defaults.responsibleManager ?? ''}
            onChange={(e) => setEk1Defaults(prev => ({ ...prev, responsibleManager: e.target.value }))}
            placeholder="Örn: Fatih Alpaslan"
          />
        </label>
        <label>
          Ekip Sorumlusu
          <input
            type="text"
            value={ek1Defaults.teamManager ?? ''}
            onChange={(e) => setEk1Defaults(prev => ({ ...prev, teamManager: e.target.value }))}
            placeholder="Örn: Fatih Alpaslan"
          />
        </label>
        <label className="settings-ek1-span-2">
          Firma Adresi
          <input
            type="text"
            value={ek1Defaults.firmAddress ?? ''}
            onChange={(e) => setEk1Defaults(prev => ({ ...prev, firmAddress: e.target.value }))}
            placeholder="Örn: Organize Sanayi Bölgesi 4. Cadde No:12"
          />
        </label>
        <label>
          Firma Telefonu
          <input
            type="text"
            value={ek1Defaults.firmPhone ?? ''}
            onChange={(e) => setEk1Defaults(prev => ({ ...prev, firmPhone: e.target.value }))}
            placeholder="Örn: 0212 555 0000"
          />
        </label>
        <label>
          İzin Tarih / Sayısı
          <input
            type="text"
            value={ek1Defaults.permissionNumber ?? ''}
            onChange={(e) => setEk1Defaults(prev => ({ ...prev, permissionNumber: e.target.value }))}
            placeholder="Örn: 2024/158"
          />
        </label>
      </div>
      <div className="settings-ek1-footer">
        <button type="button" className="primary-button" onClick={saveEk1Defaults}>
          <Save size={16} /> Varsayılan EK-1 Bilgilerini Kaydet
        </button>
      </div>
    </section>

    <section className="settings-email-card"><header><span><Mail /></span><div><strong>Otomatik rapor e-postaları</strong><small>Onaylanan PDF raporları firma, çatı müşteri ve şube alıcılarına gönderilir.</small></div><em className={branding?.emailDeliveryConfigured ? 'ready' : 'missing'}>{branding?.emailDeliveryConfigured ? `${branding.emailDeliveryProvider ?? 'E-posta'} hazır` : 'Sunucu ayarı eksik'}</em></header><div className="settings-email-controls"><label>İlaçlama firması bildirim e-postası<input type="email" value={notificationEmail} onChange={(event) => setNotificationEmail(event.target.value)} placeholder="rapor@firmaniz.com" /></label><button className="primary-button" disabled={saving || notificationEmail === (branding?.reportNotificationEmail ?? '')} onClick={() => void saveNotificationEmail()}><Mail size={16} /> Kaydet</button><button className="secondary-button" disabled={saving || !branding?.emailDeliveryConfigured || !notificationEmail.trim()} onClick={() => void sendTestEmail()}><Mail size={16} /> Test gönder</button><button className="secondary-button" disabled={saving || !branding?.emailDeliveryConfigured} onClick={() => void retryEmails()}><RotateCw size={16} /> Başarısızları yeniden gönder</button></div>{branding?.emailDeliveryConfigurationError && <p className="settings-email-error">{branding.emailDeliveryConfigurationError}</p>}<p>Çatı müşteri ve şube e-postaları müşteri kartlarından alınır. EK-1 formundaki opsiyonel alıcılar da dağıtıma eklenir.</p></section>
    {vision && <section className="settings-vision-card"><header><span><BrainCircuit /></span><div><strong>PestneerVision</strong><small>Yapışkan kart ve sinek cihazı fotoğraflarını tarayıcıda analiz eder.</small></div><label className="settings-switch"><input type="checkbox" checked={vision.enabled} disabled={saving} onChange={(event) => void saveVision({ ...vision, enabled: event.target.checked })} /><span /></label></header><div className="settings-vision-grid"><label>Model tercihi<select value={vision.preferredModel} disabled={saving || !vision.enabled} onChange={(event) => void saveVision({ ...vision, preferredModel: event.target.value as VisionSettings['preferredModel'] })}><option value="Auto">Otomatik — cihaza göre</option><option value="pVision">pVision — en hızlı</option><option value="pLens">pLens — daha ayrıntılı</option></select></label><label className="settings-vision-review"><input type="checkbox" checked={vision.reviewRequired} disabled={saving || !vision.enabled} onChange={(event) => void saveVision({ ...vision, reviewRequired: event.target.checked })} /><span><strong>Personel kontrolü zorunlu</strong><small>Sonuçlar + / − ile kontrol edilmeden rapora işlenmez.</small></span></label></div><p>{vision.disclaimer}</p></section>}
    <div className="account-security-grid"><PasswordChangeCard accessToken={accessToken} onSessionExpired={onSessionExpired} onNotify={onNotify} /><CompanyAccountResetCard accessToken={accessToken} onSessionExpired={onSessionExpired} onNotify={onNotify} /></div>
  </section>;
}
