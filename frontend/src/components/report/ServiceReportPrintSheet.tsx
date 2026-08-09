import type { ServiceReportRecord } from '../../services/serviceReportApi';
import { useEffect, useState, type ReactNode } from 'react';
import { getCompanyBranding, getCompanyLogoObjectUrl } from '../../services/brandingApi';

export default function ServiceReportPrintSheet({ report, accessToken }: { report: ServiceReportRecord; accessToken: string }) {
  const [photoUrls, setPhotoUrls] = useState<{ id: string; fileName: string; url: string }[]>([]);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false; const objectUrls: string[] = [];
    Promise.all(report.photos.map(async (photo) => { const response = await fetch(photo.url, { headers: { Authorization: `Bearer ${accessToken}` } }); if (!response.ok) return null; const url = URL.createObjectURL(await response.blob()); objectUrls.push(url); return { id: photo.id, fileName: photo.fileName, url }; })).then((items) => { if (!disposed) setPhotoUrls(items.filter((item): item is { id: string; fileName: string; url: string } => item !== null)); });
    return () => { disposed = true; objectUrls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [accessToken, report.id]);
  useEffect(() => {
    let disposed = false; let objectUrl: string | null = null;
    getCompanyBranding(accessToken).then(async (branding) => {
      if (!branding.hasLogo) return;
      objectUrl = await getCompanyLogoObjectUrl(accessToken);
      if (!disposed) setCompanyLogoUrl(objectUrl);
    }).catch(() => undefined);
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [accessToken]);
  return <article className="official-report-sheet">
    <header><div className={`official-report-brand ${companyLogoUrl ? 'has-logo' : 'no-logo'}`}>{companyLogoUrl && <img src={companyLogoUrl} alt={`${report.firmName} logosu`} />}<div><strong>{report.firmName}</strong><span>Zararlı Mücadelesi Hizmet Belgesi</span></div></div><div><h1>EK-1 BİYOSİDAL ÜRÜN UYGULAMA İŞLEM FORMU</h1><p>Service Form · Saha Trend ve Risk Eki</p></div><div className="official-report-number"><span>Rapor No</span><strong>{report.reportNumber}</strong><small>{report.status === 'Finalized' ? 'ONAYLANDI' : 'TASLAK'}</small></div></header>
    <section className="official-report-meta"><div><span>İş Emri</span><strong>{report.workOrderNumber}</strong></div><div><span>Uygulama Tarihi</span><strong>{formatDate(report.scheduledAt)}</strong></div><div><span>Başlama / Bitiş</span><strong>{formatTime(report.startedAt)} / {formatTime(report.completedAt)}</strong></div><div><span>Doğrulama</span><strong>{report.verificationCode.slice(0, 13).toUpperCase()}</strong></div></section>

    <ReportSection title="1. Uygulamayı Yapan Firmaya Ait Bilgiler"><dl className="official-report-grid"><Item label="Firma" value={report.firmName} /><Item label="Adres" value={report.firmAddress} /><Item label="Telefon / Web" value={[report.firmPhone, report.firmWeb].filter(Boolean).join(' · ')} /><Item label="Mesul Müdür" value={report.responsibleManager} /><Item label="Uygulayıcı" value={report.operatorName} /><Item label="İzin Tarih / Sayısı" value={report.permissionNumber} /><Item label="Ekip Sorumlusu" value={report.teamManager} /></dl></ReportSection>
    <ReportSection title="2. Uygulama Yapılan Yere Ait Bilgiler"><dl className="official-report-grid"><Item label="Müşteri / Şube" value={`${report.customerName} · ${report.branchName}`} /><Item label="Uygulama Adresi" value={report.branchAddress} /><Item label="Hedef Zararlı" value={report.targetPests} /><Item label="Mahal / Alan" value={`${report.residenceType ?? '—'} · ${report.areaSquareMeters ? `${report.areaSquareMeters} m²` : '—'}`} /><Item label="İş Türü" value={report.workType} /><Item label="Sarf Malzemeleri" value={report.consumables} /><Item label="Güvenlik Önlemleri" value={report.safetyMeasures} /></dl></ReportSection>

    <ReportSection title="3. Kullanılan Biyosidal Ürünler"><table><thead><tr><th>Ürün</th><th>Ruhsat</th><th>Yöntem</th><th>Etken Madde</th><th>Seyreltme</th><th>Miktar</th></tr></thead><tbody>{report.products.length ? report.products.map((item) => <tr key={item.id}><td>{item.productName}</td><td>{item.licenseNumber || '—'}</td><td>{item.applicationMethod || '—'}</td><td>{item.activeIngredient || '—'}</td><td>{item.dilutionRate || '—'}</td><td>{item.amountUsed} {item.unit}</td></tr>) : <tr><td colSpan={6}>Ürün kaydı bulunmuyor.</td></tr>}</tbody></table></ReportSection>
    <ReportSection title="4. İstasyon Kontrolü ve Trend Verileri"><div className="official-risk-strip"><div><span>Toplam istasyon</span><strong>{report.totalStations}</strong></div><div><span>Aktivite görülen</span><strong>{report.activeStations}</strong></div><div><span>Aktivite oranı</span><strong>%{formatNumber(report.activityRate)}</strong></div><div><span>Toplam yakalanan</span><strong>{report.totalCaught}</strong></div><div className={`risk-${report.riskLevel.toLowerCase()}`}><span>Risk seviyesi</span><strong>{riskLabel(report.riskLevel)} · {report.riskScore}</strong></div></div><table><thead><tr><th>No</th><th>Alan</th><th>Tür</th><th>Zararlı</th><th>Adet</th><th>Aktivite</th><th>Plaka</th><th>Durum</th></tr></thead><tbody>{report.stations.length ? report.stations.map((item) => <tr key={item.id}><td>{item.deviceNumber}</td><td>{item.area}</td><td>{deviceLabel(item.deviceType)}</td><td>{item.targetPest || '—'}</td><td>{item.caughtCount}</td><td>{item.hasActivity ? 'Var' : 'Yok'}</td><td>{item.plateChanged ? 'Değişti' : '—'}</td><td>{statusLabel(item.deviceStatus)}</td></tr>) : <tr><td colSpan={8}>İstasyon kaydı bulunmuyor.</td></tr>}</tbody></table></ReportSection>

    <ReportSection title="5. Uygulama Sonucu ve Düzeltici Faaliyet"><div className="official-report-notes"><Item label="Uygulama Özeti" value={report.applicationSummary} /><Item label="Saha Bulguları" value={report.findings} /><Item label="Düzeltici Faaliyet" value={report.correctiveActions} /><Item label="Öneriler" value={report.recommendations} /></div></ReportSection>
    {report.photos.length > 0 && <ReportSection title="6. Fotoğraf Ekleri">{photoUrls.length ? <div className="official-photo-grid">{photoUrls.map((photo) => <figure key={photo.id}><img src={photo.url} alt={photo.fileName} /><figcaption>{photo.fileName}</figcaption></figure>)}</div> : <p className="official-photo-note">Bu rapora bağlı {report.photos.length} saha fotoğrafı güvenli sistem kaydında saklanmaktadır: {report.photos.map((item) => item.fileName).join(', ')}</p>}</ReportSection>}
    <section className="official-signatures"><Signature label="Uygulayıcı / Ekip Sorumlusu" name={report.operatorName} value={report.managerSignatureData} /><Signature label="Müşteri Yetkilisi" name={report.customerRepresentativeName} value={report.customerSignatureData} /></section>
    <footer><strong>Ulusal Zehir Danışma Merkezi: 114 · Acil Çağrı: 112</strong><span>Bu belge doğrulama koduyla izlenebilir elektronik saha raporudur.</span></footer>
  </article>;
}

function ReportSection({ title, children }: { title: string; children: ReactNode }) { return <section className="official-report-section"><h2>{title}</h2>{children}</section>; }
function Item({ label, value }: { label: string; value?: string | null }) { return <div><dt>{label}</dt><dd>{value || '—'}</dd></div>; }
function Signature({ label, name, value }: { label: string; name?: string; value?: string }) { return <div><span>{label}</span>{value ? <img src={value} alt={`${label} imzası`} /> : <div className="official-signature-empty">İmza bekleniyor</div>}<strong>{name || '—'}</strong></div>; }
const formatDate = (value: string) => new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium' }).format(new Date(value));
const formatTime = (value?: string) => value ? new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const formatNumber = (value: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(value);
const riskLabel = (value: string) => ({ Low: 'Düşük', Medium: 'Orta', High: 'Yüksek' }[value] ?? value);
const deviceLabel = (value: string) => ({ EFT: 'EFT', LiveCapture: 'Canlı Yakalama', Rodent: 'Kemirgen', InsectMonitor: 'Haşere Monitörü', Other: 'Diğer' }[value] ?? value);
const statusLabel = (value: string) => ({ Active: 'Aktif', Damaged: 'Hasarlı', Missing: 'Kayıp', Replaced: 'Değiştirildi', Passive: 'Pasif' }[value] ?? value);
