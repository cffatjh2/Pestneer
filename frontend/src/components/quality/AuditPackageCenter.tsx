import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Archive, CheckCircle2, Download, Eye, FileCheck2, FileSearch, PackageCheck, RefreshCw, ShieldCheck } from 'lucide-react';
import type { QualityLocation } from '../../services/qualityApi';
import {
  AuditPackageSessionExpiredError, createAuditPackage, downloadAuditPackage, getAuditPackages, previewAuditPackage,
  type AuditPackage, type AuditPackageFilter, type AuditPreflight,
} from '../../services/auditPackageApi';

type Props = {
  accessToken: string;
  mode: 'staff' | 'customer';
  locations: QualityLocation[];
  onSessionExpired: () => void;
  onCount?: (count: number) => void;
};

const profiles = ['BRCGS', 'IFS', 'FSSC 22000', 'ISO 22000', 'EN 16636', 'Kurumsal'];

export default function AuditPackageCenter({ accessToken, mode, locations, onSessionExpired, onCount }: Props) {
  const [packages, setPackages] = useState<AuditPackage[]>([]);
  const [preflight, setPreflight] = useState<AuditPreflight | null>(null);
  const [locationKey, setLocationKey] = useState('');
  const [periodEnd, setPeriodEnd] = useState(dateKey(new Date()));
  const [periodStart, setPeriodStart] = useState(monthStart(3));
  const [profile, setProfile] = useState('BRCGS');
  const [includeWaste, setIncludeWaste] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const items = await getAuditPackages(accessToken);
      setPackages(items); onCount?.(items.length);
    } catch (loadError) { handleError(loadError, onSessionExpired, setError); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [accessToken]);
  useEffect(() => { if (!locationKey && locations[0]) setLocationKey(locationValue(locations[0])); }, [locations, locationKey]);

  const input = useMemo<AuditPackageFilter | null>(() => {
    const location = locations.find((item) => locationValue(item) === locationKey);
    return location ? { customerId: location.customerId, branchId: location.branchId, periodStart, periodEnd, auditProfile: profile, includeOptionalWaste: includeWaste } : null;
  }, [locations, locationKey, periodStart, periodEnd, profile, includeWaste]);

  const resetPreview = () => { setPreflight(null); setAcknowledged(false); setError(null); };
  const check = async (event: FormEvent) => {
    event.preventDefault();
    if (!input) return setError('Müşteri veya şube seçin.');
    setChecking(true); setError(null);
    try { setPreflight(await previewAuditPackage(accessToken, input)); }
    catch (checkError) { handleError(checkError, onSessionExpired, setError); }
    finally { setChecking(false); }
  };
  const create = async () => {
    if (!input || !preflight) return;
    setCreating(true); setError(null);
    try {
      const created = await createAuditPackage(accessToken, { ...input, acknowledgeWarnings: preflight.blockingIssueCount === 0 || acknowledged });
      setPackages((current) => [created, ...current]); onCount?.(packages.length + 1); setPreflight(null); setAcknowledged(false);
    } catch (createError) { handleError(createError, onSessionExpired, setError); }
    finally { setCreating(false); }
  };
  const download = async (item: AuditPackage, type: 'pdf' | 'zip', open = false) => {
    try {
      await downloadAuditPackage(accessToken, type === 'pdf' ? item.pdfDownloadUrl : item.zipDownloadUrl, `${item.number}.${type}`, open);
    } catch (downloadError) { handleError(downloadError, onSessionExpired, setError); }
  };

  return <div className="audit-center">
    <div className="quality-module-heading"><div><p className="eyebrow">TEK TIK DENETİM DOSYASI</p><h2>Denetim kanıt paketleri</h2><p>Müşteri, şube, dönem ve standardı seçin; eksikleri önceden görün, firma logolu PDF ve kaynak kanıtları içeren ZIP paketini arşivleyin.</p></div>{mode === 'customer' && <button className="secondary-button" onClick={() => void load()}><RefreshCw size={16} /> Yenile</button>}</div>
    {error && <div className="quality-error"><AlertTriangle size={17} />{error}<button onClick={() => setError(null)}>Kapat</button></div>}
    {mode === 'staff' && <form className="surface audit-builder" onSubmit={check}>
      <header><span><FileSearch /></span><div><strong>Kapsam ve standart seçimi</strong><small>Üretimden önce dokuz kanıt grubu otomatik kontrol edilir.</small></div></header>
      <div className="audit-filter-grid">
        <label>Müşteri / Şube<select value={locationKey} onChange={(event) => { setLocationKey(event.target.value); resetPreview(); }} required><option value="">Seçin</option>{locations.map((item) => <option key={locationValue(item)} value={locationValue(item)}>{item.customerName} · {item.branchName}</option>)}</select></label>
        <label>Denetim profili<select value={profile} onChange={(event) => { setProfile(event.target.value); resetPreview(); }}>{profiles.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Başlangıç<input type="date" value={periodStart} onChange={(event) => { setPeriodStart(event.target.value); resetPreview(); }} required /></label>
        <label>Bitiş<input type="date" value={periodEnd} onChange={(event) => { setPeriodEnd(event.target.value); resetPreview(); }} required /></label>
      </div>
      <div className="audit-builder-footer"><label className="audit-check"><input type="checkbox" checked={includeWaste} onChange={(event) => { setIncludeWaste(event.target.checked); resetPreview(); }} /><span><b>Atık ve bertaraf kayıtlarını dahil et</b><small>Opsiyoneldir; seçilmediğinde paket hazırlık puanını etkilemez.</small></span></label><button className="primary-button" disabled={checking || !input}>{checking ? <RefreshCw className="spin-icon" size={17} /> : <FileSearch size={17} />}{checking ? 'Kontrol ediliyor…' : 'Ön kontrolü çalıştır'}</button></div>
    </form>}
    {preflight && <PreflightPanel value={preflight} acknowledged={acknowledged} onAcknowledged={setAcknowledged} creating={creating} onCreate={() => void create()} />}
    <section className="audit-package-list">
      <div className="audit-list-heading"><div><Archive /><span><strong>Oluşturulan paketler</strong><small>PDF özet dosyası ve kaynak kanıt ZIP'i değiştirilemez biçimde saklanır.</small></span></div><b>{packages.length} paket</b></div>
      {loading ? <div className="surface quality-loading"><RefreshCw className="spin-icon" /><strong>Denetim paketleri yükleniyor…</strong></div> : packages.length === 0 ? <div className="surface quality-empty"><PackageCheck /><strong>Henüz denetim dosyası yok</strong><span>{mode === 'staff' ? 'İlk ön kontrolü çalıştırarak profesyonel kanıt paketini oluşturun.' : 'Firmanız tarafından yayımlanan denetim paketleri burada görünür.'}</span></div> : <div className="audit-package-grid">{packages.map((item) => <article className="surface audit-package-card" key={item.id}>
        <header><span className={item.readinessScore >= 85 ? 'ready' : 'finding'}><ShieldCheck /></span><div><small>{item.number}</small><strong>{item.title}</strong><p>{item.auditProfile} · {formatRange(item.periodStart, item.periodEnd)}</p></div><b>%{item.readinessScore}<small>hazırlık</small></b></header>
        <dl><div><dt>Konum</dt><dd>{item.customerName}<small>{item.branchName}</small></dd></div><div><dt>Kanıt</dt><dd>{item.itemCount} dosya</dd></div><div><dt>Oluşturan</dt><dd>{item.createdBy}<small>{formatDate(item.createdAt)}</small></dd></div></dl>
        <footer><span title={item.zipSha256}>SHA-256 · {item.zipSha256.slice(0, 12)}…</span><div><button onClick={() => void download(item, 'pdf', true)}><Eye size={15} /> PDF</button><button onClick={() => void download(item, 'zip')}><Download size={15} /> ZIP</button></div></footer>
      </article>)}</div>}
    </section>
  </div>;
}

function PreflightPanel({ value, acknowledged, onAcknowledged, creating, onCreate }: { value: AuditPreflight; acknowledged: boolean; onAcknowledged: (value: boolean) => void; creating: boolean; onCreate: () => void }) {
  const canCreate = value.blockingIssueCount === 0 || acknowledged;
  return <section className="surface audit-preflight">
    <header><div className={value.ready ? 'ready' : 'finding'}><strong>%{value.readinessScore}</strong><small>paket hazırlığı</small></div><span><b>{value.ready ? 'Denetim paketi oluşturulabilir' : 'Kritik eksikler tespit edildi'}</b><small>{value.evidenceCount} kanıt · {value.blockingIssueCount} kritik eksik · {value.warningCount} uyarı · yaklaşık {formatSize(value.estimatedSizeBytes)}</small></span><CheckCircle2 /></header>
    <div className="audit-section-grid">{value.sections.map((section) => <article className={section.status.toLowerCase()} key={section.code}><FileCheck2 /><span><strong>{section.label}</strong><small>{section.status === 'Optional' ? 'Opsiyonel' : section.status === 'Finding' ? `${section.itemCount} kanıt · bulgu var` : `${section.itemCount} kanıt`}</small></span>{section.status === 'Complete' ? <CheckCircle2 /> : <AlertTriangle />}</article>)}</div>
    {value.issues.length > 0 && <div className="audit-issue-list">{value.issues.map((issue) => <article className={issue.severity === 'Blocking' ? 'blocking' : 'warning'} key={issue.code}><AlertTriangle /><span><strong>{issue.title}</strong><small>{issue.detail}</small>{issue.suggestedAction && <em>Öneri: {issue.suggestedAction}</em>}</span></article>)}</div>}
    <footer>{value.blockingIssueCount > 0 ? <label className="audit-check"><input type="checkbox" checked={acknowledged} onChange={(event) => onAcknowledged(event.target.checked)} /><span><b>Eksikleri gördüm, mevcut kanıtlarla paket oluştur</b><small>Eksikler PDF ön kontrol bölümünde açıkça gösterilecektir.</small></span></label> : <span className="audit-ready-note"><CheckCircle2 /> Ön kontrol tamamlandı; paket arşivlenmeye hazır.</span>}<button type="button" className="primary-button" disabled={!canCreate || creating} onClick={onCreate}>{creating ? <RefreshCw className="spin-icon" size={17} /> : <PackageCheck size={17} />}{creating ? 'PDF ve ZIP hazırlanıyor…' : 'Denetim paketini oluştur'}</button></footer>
  </section>;
}

function locationValue(location: QualityLocation) { return `${location.customerId}|${location.branchId ?? ''}`; }
function dateKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
function monthStart(months: number) { const value = new Date(); value.setDate(1); value.setMonth(value.getMonth() - Math.max(0, months - 1)); return dateKey(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)); }
function formatRange(start: string, end: string) { return `${formatDate(`${start}T12:00:00`)} – ${formatDate(`${end}T12:00:00`)}`; }
function formatSize(value: number) { return value >= 1_048_576 ? `${(value / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1024))} KB`; }
function handleError(error: unknown, onSessionExpired: () => void, setError: (value: string | null) => void) { if (error instanceof AuditPackageSessionExpiredError) return onSessionExpired(); setError(error instanceof Error ? error.message : 'İşlem tamamlanamadı.'); }
