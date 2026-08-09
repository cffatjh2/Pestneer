import { useEffect, useRef, useState } from 'react';
import { Building2, CheckCircle2, FileBadge2, ImagePlus, RefreshCw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { CompanyBrandingSessionExpiredError, deleteCompanyLogo, getCompanyBranding, getCompanyLogoObjectUrl, uploadCompanyLogo, type CompanyBranding } from '../services/brandingApi';

export default function Settings({ accessToken, companyName, onSessionExpired, onNotify }: { accessToken: string; companyName: string; onSessionExpired: () => void; onNotify: (message: string) => void }) {
  const [branding, setBranding] = useState<CompanyBranding | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const value = await getCompanyBranding(accessToken);
      setBranding(value);
      if (logoUrl) URL.revokeObjectURL(logoUrl);
      setLogoUrl(value.hasLogo ? await getCompanyLogoObjectUrl(accessToken) : null);
    } catch (loadError) {
      if (loadError instanceof CompanyBrandingSessionExpiredError) return onSessionExpired();
      setError(loadError instanceof Error ? loadError.message : 'Firma markası yüklenemedi.');
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); return () => { if (logoUrl) URL.revokeObjectURL(logoUrl); }; }, [accessToken]);

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

  return <section className="page settings-page"><div className="page-header"><div><p className="eyebrow">FİRMA AYARLARI</p><h1>Kurumsal Kimlik</h1><span>Resmi saha raporları, trend ve risk analizleri ile krokilerde kullanılacak firma markasını yönetin.</span></div></div>
    {error && <div className="field-operation-error"><span>{error}</span></div>}
    <div className="settings-brand-grid"><section className="settings-brand-card"><header><span><Building2 size={21} /></span><div><strong>Firma logosu</strong><small>{branding?.companyName ?? companyName}</small></div></header>{loading ? <div className="settings-logo-loading"><RefreshCw className="spin-icon" /><span>Logo yükleniyor…</span></div> : <div className={`settings-logo-preview ${logoUrl ? 'has-logo' : ''}`}>{logoUrl ? <img src={logoUrl} alt={`${companyName} logosu`} /> : <><ImagePlus size={38} /><strong>Henüz firma logosu yüklenmedi</strong><span>Belge başlıklarında firma adı metin olarak kullanılacak.</span></>}</div>}<input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void upload(event.target.files?.[0])} /><div className="settings-logo-actions"><button className="primary-button" disabled={saving} onClick={() => inputRef.current?.click()}><Upload size={16} /> {logoUrl ? 'Logoyu Değiştir' : 'Logo Yükle'}</button>{logoUrl && <button className="secondary-button danger" disabled={saving} onClick={() => void remove()}><Trash2 size={16} /> Kaldır</button>}</div><p>Şeffaf arka planlı PNG önerilir. En fazla 4 MB; PNG, JPG veya WEBP.</p></section>
      <section className="settings-document-card"><header><span><FileBadge2 size={21} /></span><div><strong>Belge uygulaması</strong><small>Kurumsal logo otomatik yerleştirilir</small></div></header><ul><li><CheckCircle2 size={17} /> EK-1 biyosidal uygulama raporları</li><li><CheckCircle2 size={17} /> Trend analizleri ve risk değerlendirmeleri</li><li><CheckCircle2 size={17} /> A4 ekipman yerleşim planları ve krokiler</li><li><ShieldCheck size={17} /> Pestneer logosu resmi müşteri belgelerinde kullanılmaz</li></ul><div className="settings-document-note"><ImagePlus size={21} /><div><strong>Sol üst başlık alanı</strong><span>Yüklediğiniz logo oranı korunarak belgeye yerleştirilir. Logo yoksa firma unvanı gösterilir.</span></div></div></section></div>
  </section>;
}
