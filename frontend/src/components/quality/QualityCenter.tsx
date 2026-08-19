import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BadgeCheck, BarChart3, BrainCircuit, Building2, Camera, Download, Eye, FileArchive, FileSpreadsheet, FileText, FilterX, FolderArchive, Map as MapIcon, MapPin, PackageCheck, Plus, RefreshCw, Search, Share2, ShieldAlert, Trash2, Upload, X } from 'lucide-react';
import SitePlanCenter from '../sitePlans/SitePlanCenter';
import AuditPackageCenter from './AuditPackageCenter';
import DocumentScannerModal from '../scanner/DocumentScannerModal';
import { getInventory, type InventoryItem } from '../../services/inventoryApi';
import { getSitePlans, type SitePlanRecord } from '../../services/sitePlanApi';
import { shareProtectedDocument } from '../../utils/shareUtils';
import {
  archiveQualityDocument, createRiskAnalysis, createTrendAnalysis, deleteQualityDocument, downloadQualityDocument, getQualityAnalyses, getQualityDocuments, getQualityLocations,
  QualitySessionExpiredError, unarchiveQualityDocument, uploadQualityDocument, type CreateRiskAnalysisInput, type CreateTrendAnalysisInput,
  type QualityAnalysis, type QualityDocument, type QualityLocation, type RiskAnswer, type RiskMatrixRow,
} from '../../services/qualityApi';
import { compressImage } from '../../utils/imageCompression';

type CenterTab = 'trend' | 'risk' | 'plans' | 'audit' | 'licenses' | 'safety' | 'documents' | 'archive';
type Props = { accessToken: string; mode: 'staff' | 'customer'; onSessionExpired: () => void; standalone?: boolean; initialTab?: CenterTab; canManageLicenses?: boolean };

export default function QualityCenter({ accessToken, mode, onSessionExpired, standalone = false, initialTab = 'trend', canManageLicenses = false }: Props) {
  const [tab, setTab] = useState<CenterTab>(initialTab); const [locations, setLocations] = useState<QualityLocation[]>([]);
  const [analyses, setAnalyses] = useState<QualityAnalysis[]>([]); const [documents, setDocuments] = useState<QualityDocument[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [trendOpen, setTrendOpen] = useState(false); const [riskOpen, setRiskOpen] = useState(false); const [uploadOpen, setUploadOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [riskSitePlanItem, setRiskSitePlanItem] = useState<QualityAnalysis | null>(null);
  const [uploadCategory, setUploadCategory] = useState('Other');
  const [scannerCategory, setScannerCategory] = useState('Licenses');
  const [category, setCategory] = useState('');
  const [selectedLocationKey, setSelectedLocationKey] = useState('');
  const [sitePlanCount, setSitePlanCount] = useState(0);
  const [auditPackageCount, setAuditPackageCount] = useState(0);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [deletingDoc, setDeletingDoc] = useState<QualityDocument | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [analysisItems, documentItems, locationItems, inventory] = await Promise.all([
        getQualityAnalyses(accessToken), getQualityDocuments(accessToken), mode === 'staff' ? getQualityLocations(accessToken) : Promise.resolve([]),
        canManageLicenses ? getInventory(accessToken) : Promise.resolve([]),
      ]);
      setAnalyses(analysisItems); setDocuments(documentItems); setLocations(locationItems); setInventoryItems(inventory);
    } catch (loadError) {
      if (loadError instanceof QualitySessionExpiredError) return onSessionExpired();
      setError(loadError instanceof Error ? loadError.message : 'Analiz ve belgeler yüklenemedi.');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [accessToken]);

  const [selCustomerId, selBranchId] = selectedLocationKey ? selectedLocationKey.split('|') : ['', ''];

  const scopedAnalyses = useMemo(() => {
    if (!selectedLocationKey) return analyses;
    return analyses.filter((item) => item.customerId === selCustomerId && (!selBranchId || item.branchId === selBranchId));
  }, [analyses, selectedLocationKey, selCustomerId, selBranchId]);

  const scopedDocuments = useMemo(() => {
    if (!selectedLocationKey) return documents;
    return documents.filter((item) => !item.customerId || (item.customerId === selCustomerId && (!selBranchId || item.branchId === selBranchId)));
  }, [documents, selectedLocationKey, selCustomerId, selBranchId]);

  const trends = scopedAnalyses.filter((item) => item.analysisType === 'Trend');
  const risks = scopedAnalyses.filter((item) => item.analysisType === 'Risk');
  const activeDocuments = scopedDocuments.filter((item) => item.category !== 'Archived');
  const archivedDocuments = scopedDocuments.filter((item) => item.category === 'Archived');
  const filteredDocuments = category ? (category === 'Archived' ? archivedDocuments : scopedDocuments.filter((item) => item.category === category)) : activeDocuments;
  const licenseDocuments = scopedDocuments.filter((item) => item.category === 'Licenses');
  const safetyDocuments = scopedDocuments.filter((item) => item.category === 'SafetyDataSheets');

  const handleTrend = async (input: CreateTrendAnalysisInput) => { const created = await createTrendAnalysis(accessToken, input); setAnalyses((current) => [created, ...current]); await refreshDocuments(accessToken, setDocuments); setTrendOpen(false); };
  const handleRisk = async (input: CreateRiskAnalysisInput) => { const created = await createRiskAnalysis(accessToken, input); setAnalyses((current) => [created, ...current]); await refreshDocuments(accessToken, setDocuments); setRiskOpen(false); };
  const handleUpload = async (input: Parameters<typeof uploadQualityDocument>[1]) => { const created = await uploadQualityDocument(accessToken, input); setDocuments((current) => [created, ...current]); setUploadOpen(false); setScannerOpen(false); };
  const download = async (document: QualityDocument, open = false) => { try { await downloadQualityDocument(accessToken, document, open); } catch (downloadError) { if (downloadError instanceof QualitySessionExpiredError) return onSessionExpired(); setError(downloadError instanceof Error ? downloadError.message : 'Belge indirilemedi.'); } };
  const share = async (document: QualityDocument) => { try { await shareProtectedDocument(accessToken, document.downloadUrl, document.fileName, document.title); } catch (shareError) { setError(shareError instanceof Error ? shareError.message : 'Belge paylaşılamadı.'); } };
  
  const handleArchiveDoc = async (doc: QualityDocument) => {
    try {
      const updated = await archiveQualityDocument(accessToken, doc.id);
      setDocuments((current) => current.map((d) => d.id === doc.id ? updated : d));
    } catch (e) {
      setError(messageOf(e));
    }
  };

  const handleUnarchiveDoc = async (doc: QualityDocument) => {
    try {
      const updated = await unarchiveQualityDocument(accessToken, doc.id);
      setDocuments((current) => current.map((d) => d.id === doc.id ? updated : d));
    } catch (e) {
      setError(messageOf(e));
    }
  };

  const handleDeleteDoc = (doc: QualityDocument) => {
    setDeletingDoc(doc);
  };

  const confirmDeleteDoc = async () => {
    if (!deletingDoc) return;
    setDeletingBusy(true);
    try {
      await deleteQualityDocument(accessToken, deletingDoc.id);
      setDocuments((current) => current.filter((d) => d.id !== deletingDoc.id));
      setDeletingDoc(null);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setDeletingBusy(false);
    }
  };

  const documentByAnalysis = useMemo(() => new Map(documents.filter((item) => item.analysisId).map((item) => [item.analysisId!, item])), [documents]);

  return <section className={`quality-center ${standalone ? 'page quality-center-page' : 'quality-center-embedded'}`}>
    {standalone && <div className="page-heading"><div><p className="eyebrow">KALİTE, UYUM & İZLENEBİLİRLİK</p><h1>Belgeler & Analizler</h1><p>Trendleri, konuma bağlı riskleri ve kurumsal belgeleri düzenli bir arşivde yönetin.</p></div><div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>{mode === 'staff' && <button type="button" className="primary-button" onClick={() => { setScannerCategory('General'); setScannerOpen(true); }} style={{ background: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)', color: '#ffffff', border: 'none', boxShadow: '0 4px 14px rgba(13, 148, 136, 0.35)' }}><Camera size={16} /> Belge Tara (A4)</button>}<button className="secondary-button" onClick={() => void load()}><RefreshCw size={16} /> Yenile</button></div></div>}

    {mode === 'staff' && locations.length > 0 && (
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '0 0 16px 0', padding: '12px 18px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
        <Building2 size={18} color="#0d9488" />
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>Müşteri & Şube Filtresi:</span>
        <select
          value={selectedLocationKey}
          onChange={(e) => setSelectedLocationKey(e.target.value)}
          style={{ flex: 1, maxWidth: '380px', height: '36px', borderRadius: '8px', border: '1px solid #cbd5e1', padding: '0 10px', fontSize: '13px', fontWeight: 600, background: '#fff' }}
        >
          <option value="">Tüm Müşteriler & Belgeler (Tümü)</option>
          {locations.map((loc) => {
            const val = `${loc.customerId}|${loc.branchId ?? ''}`;
            return (
              <option key={val} value={val}>
                {loc.customerName} {loc.branchName ? `· ${loc.branchName}` : ''}
              </option>
            );
          })}
        </select>
        {selectedLocationKey && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => setSelectedLocationKey('')}
            style={{ height: '36px', padding: '0 12px', fontSize: '12px' }}
          >
            Filtreyi Temizle
          </button>
        )}
      </div>
    )}

    <nav className="quality-tabs">
      <button className={tab === 'trend' ? 'active' : ''} onClick={() => setTab('trend')}><BarChart3 size={18} /><span>Trend Analizleri</span><b>{trends.length}</b></button>
      <button className={tab === 'risk' ? 'active' : ''} onClick={() => setTab('risk')}><BrainCircuit size={18} /><span>Risk Analizleri</span><b>{risks.length}</b></button>
      <button className={tab === 'plans' ? 'active' : ''} onClick={() => setTab('plans')}><MapIcon size={18} /><span>Kroki & Yerleşim</span><b>{sitePlanCount}</b></button>
      <button className={tab === 'audit' ? 'active' : ''} onClick={() => setTab('audit')}><PackageCheck size={18} /><span>Denetim Dosyaları</span><b>{auditPackageCount}</b></button>
      <button className={tab === 'licenses' ? 'active' : ''} onClick={() => setTab('licenses')}><BadgeCheck size={18} /><span>Ruhsatlar</span><b>{licenseDocuments.length}</b></button>
      <button className={tab === 'safety' ? 'active' : ''} onClick={() => setTab('safety')}><ShieldAlert size={18} /><span>MSDS / GBF</span><b>{safetyDocuments.length}</b></button>
      <button className={tab === 'documents' ? 'active' : ''} onClick={() => setTab('documents')}><FolderArchive size={18} /><span>Belge Arşivi</span><b>{activeDocuments.length}</b></button>
      <button className={tab === 'archive' ? 'active' : ''} onClick={() => setTab('archive')}><FileArchive size={18} /><span>Arşiv</span><b>{archivedDocuments.length}</b></button>
    </nav>
    {error && <div className="quality-error"><ShieldAlert size={17} />{error}<button onClick={() => setError(null)}>Kapat</button></div>}
    {loading ? <div className="surface quality-loading"><RefreshCw className="spin-icon" /><strong>Kalite kayıtları hazırlanıyor…</strong></div> : <>
      {tab === 'trend' && <AnalysisList type="Trend" items={trends} staff={mode === 'staff'} onScan={() => { setScannerCategory('TrendAnalyses'); setScannerOpen(true); }} onCreate={() => setTrendOpen(true)} documents={documentByAnalysis} onDownload={download} onShare={share} />}
      {tab === 'risk' && <AnalysisList type="Risk" items={risks} staff={mode === 'staff'} onScan={() => { setScannerCategory('RiskAnalyses'); setScannerOpen(true); }} onCreate={() => setRiskOpen(true)} documents={documentByAnalysis} onDownload={download} onShare={share} onOpenRiskMap={setRiskSitePlanItem} />}
      {tab === 'plans' && <SitePlanCenter accessToken={accessToken} mode={mode} locations={locations} onSessionExpired={onSessionExpired} onCount={setSitePlanCount} onSaved={() => refreshDocuments(accessToken, setDocuments)} />}
      {tab === 'audit' && <AuditPackageCenter accessToken={accessToken} mode={mode} locations={locations} onSessionExpired={onSessionExpired} onCount={setAuditPackageCount} />}
      {tab === 'licenses' && <DocumentLibrary items={licenseDocuments} category="Licenses" onCategory={() => undefined} staff={canManageLicenses} onScan={() => { setScannerCategory('Licenses'); setScannerOpen(true); }} onUpload={() => { setUploadCategory('Licenses'); setUploadOpen(true); }} onDownload={download} onShare={share} onArchive={handleArchiveDoc} onUnarchive={handleUnarchiveDoc} onDelete={handleDeleteDoc} fixed title="Ürün ruhsatları" description="Her ruhsatı stoktaki ürüne bağlayın; araç stoğu ve EK-1 formu ruhsat numarasını otomatik kullansın." uploadLabel="Ruhsat Yükle" />}
      {tab === 'safety' && <DocumentLibrary items={safetyDocuments} category="SafetyDataSheets" onCategory={() => undefined} staff={canManageLicenses} onScan={() => { setScannerCategory('SafetyDataSheets'); setScannerOpen(true); }} onUpload={() => { setUploadCategory('SafetyDataSheets'); setUploadOpen(true); }} onDownload={download} onShare={share} onArchive={handleArchiveDoc} onUnarchive={handleUnarchiveDoc} onDelete={handleDeleteDoc} fixed title="MSDS / Güvenlik Bilgi Formları" description="MSDS, SDS ve Türkçe GBF belgelerini stok ürünüyle eşleştirin; kullanılan ürüne ait belgeler müşteriye ve denetim paketine otomatik yansısın." uploadLabel="MSDS / GBF Yükle" />}
      {tab === 'documents' && <DocumentLibrary items={filteredDocuments} category={category} onCategory={setCategory} staff={mode === 'staff'} onScan={() => { setScannerCategory(category || 'General'); setScannerOpen(true); }} onUpload={() => { setUploadCategory('Other'); setUploadOpen(true); }} onDownload={download} onShare={share} onArchive={handleArchiveDoc} onUnarchive={handleUnarchiveDoc} onDelete={handleDeleteDoc} />}
      {tab === 'archive' && <DocumentLibrary items={archivedDocuments} category="Archived" onCategory={() => undefined} staff={mode === 'staff'} onDownload={download} onShare={share} onArchive={handleArchiveDoc} onUnarchive={handleUnarchiveDoc} onDelete={handleDeleteDoc} title="Belge Arşivi" description="Arşivlenen tüm kurumsal belgeler burada saklanır. Dilediğiniz zaman tek tıkla arşivden çıkarabilirsiniz." />}
    </>}
    {trendOpen && <TrendAnalysisModal locations={locations} onClose={() => setTrendOpen(false)} onSubmit={handleTrend} />}
    {riskOpen && <RiskAnalysisModal accessToken={accessToken} locations={locations} onClose={() => setRiskOpen(false)} onSubmit={handleRisk} />}
    {uploadOpen && <DocumentUploadModal locations={locations} inventoryItems={inventoryItems} defaultCategory={uploadCategory} onClose={() => setUploadOpen(false)} onSubmit={handleUpload} />}
    {scannerOpen && <DocumentScannerModal locations={locations} inventoryItems={inventoryItems} defaultCategory={scannerCategory} onClose={() => setScannerOpen(false)} onSubmit={handleUpload} />}
    {riskSitePlanItem && <RiskSitePlanModal analysis={riskSitePlanItem} document={documentByAnalysis.get(riskSitePlanItem.id)} onClose={() => setRiskSitePlanItem(null)} onDownload={download} onShare={share} />}

    {deletingDoc && (
      <div className="modal-layer" style={{ zIndex: 1100 }}>
        <div className="modal" style={{ maxWidth: '440px' }}>
          <div className="modal-header">
            <div>
              <p className="eyebrow" style={{ color: '#dc2626' }}>BELGE SİLME ONAYI</p>
              <h2>Belgeyi Sil</h2>
            </div>
            <button className="icon-button" onClick={() => setDeletingDoc(null)}><X /></button>
          </div>
          <div style={{ padding: '16px 0', fontSize: '13.5px', color: '#334155', lineHeight: 1.5 }}>
            <p><strong>"{deletingDoc.title}"</strong> ({deletingDoc.fileName}) belgesini kalıcı olarak silmek istediğinize emin misiniz?</p>
            <p style={{ marginTop: '8px', fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>⚠️ Bu işlem geri alınamaz ve belge sunucudan tamamen silinir.</p>
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => setDeletingDoc(null)}>Vazgeç</button>
            <button type="button" className="primary-button" style={{ background: '#dc2626', borderColor: '#b91c1c' }} disabled={deletingBusy} onClick={() => void confirmDeleteDoc()}>
              {deletingBusy ? 'Siliniyor…' : 'Evet, Kalıcı Olarak Sil'}
            </button>
          </div>
        </div>
      </div>
    )}
  </section>;
}

function AnalysisList({ type, items, staff, onScan, onCreate, documents, onDownload, onShare, onOpenRiskMap }: { type: 'Trend' | 'Risk'; items: QualityAnalysis[]; staff: boolean; onScan?: () => void; onCreate: () => void; documents: Map<string, QualityDocument>; onDownload: (document: QualityDocument, open?: boolean) => void; onShare: (document: QualityDocument) => void; onOpenRiskMap?: (item: QualityAnalysis) => void }) {
  const trend = type === 'Trend';
  return <div className="quality-module"><div className="quality-module-heading"><div><p className="eyebrow">{trend ? 'SAHA VERİSİNDEN OTOMATİK' : 'KONUM + SAHA DEĞERLENDİRMESİ'}</p><h2>{trend ? 'Canlı yakalama ve aktivite trendleri' : 'AI destekli risk değerlendirmeleri'}</h2><p>{trend ? 'Personelin saha raporlarına girdiği istasyon, aktivite ve zararlı gözlemleri seçilen dönemde karşılaştırılır.' : 'Yapısal kontrol formu, lokasyon ve güncel hava verisi birlikte değerlendirilerek açıklanabilir öneriler üretilir.'}</p></div>{staff && <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>{onScan && <button type="button" className="secondary-button" onClick={onScan} title="Kamera ile A4 Belge Tara"><Camera size={16} /> Belge Tara (A4)</button>}<button className="primary-button" onClick={onCreate}><Plus size={17} /> {trend ? 'Trend Analizi Oluştur' : 'Risk Analizi Oluştur'}</button></div>}</div>
    {items.length === 0 ? <div className="surface quality-empty">{trend ? <BarChart3 /> : <BrainCircuit />}<strong>Henüz {trend ? 'trend' : 'risk'} analizi oluşturulmadı</strong><span>{staff ? 'Dijital formu doldurduğunuzda kayıt müşteriye ve belge arşivine otomatik düşer.' : 'Yayınlanan analizler burada görüntülenir.'}</span></div> : <div className="quality-analysis-grid">{items.map((item) => { const document = documents.get(item.id); return <article className="surface quality-analysis-card" key={item.id}><div className="quality-card-top"><span className={`quality-kind ${trend ? 'trend' : 'risk'}`}>{trend ? <BarChart3 /> : <ShieldAlert />}</span><div><small>{item.number}</small><strong>{item.title}</strong><p>{item.customerName} · {item.branchName}</p></div><span className={`quality-score quality-${riskTone(item)}`}><b>{item.score ?? '—'}</b><small>{trend ? item.payload.trendDirection ?? 'Aktivite' : riskLabel(item.level)}</small></span></div><div className="quality-card-metrics">{trend ? <><Metric label="Rapor" value={item.payload.reportCount ?? 0} /><Metric label="İstasyon" value={item.payload.totalStations ?? 0} /><Metric label="Aktif" value={item.payload.activeStations ?? 0} /><Metric label="Yakalama" value={item.payload.totalCaught ?? 0} /></> : <><Metric label="Yapısal" value={`${item.payload.structuralRiskScore ?? 0}/100`} /><Metric label="Matris" value={`${item.payload.matrixRiskScore ?? 0}/100`} /><Metric label="Hava" value={`${item.payload.weatherRiskScore ?? 0}/100`} /><Metric label="Seviye" value={riskLabel(item.level)} /></>}</div><p className="quality-summary">{item.summary}</p><div className="quality-card-footer"><span>{formatDateRange(item.periodStart, item.periodEnd)} · {item.createdBy}</span><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>{item.analysisType === 'Risk' && item.payload.sitePlan && <button type="button" className="quality-risk-map-btn" onClick={() => onOpenRiskMap?.(item)} title="Kroki Bazlı Risk Haritasını Görüntüle"><MapIcon size={14} /> Kroki Risk Haritası</button>}{document && <><button onClick={() => onDownload(document, true)} title="Görüntüle"><Eye size={15} /> Görüntüle</button><button onClick={() => onDownload(document)} title="İndir"><Download size={15} /> İndir</button><button onClick={() => onShare(document)} title="Paylaş"><Share2 size={15} /> Paylaş</button></>}</div></div></article>; })}</div>}
  </div>;
}

function DocumentLibrary({ items, category, onCategory, staff, onScan, onUpload, onDownload, onShare, onArchive, onUnarchive, onDelete, fixed = false, title = 'Belgeler', description = 'Oluşturulan analizler ve yüklenen PDF, Word, Excel, metin veya görsel dosyaları tek yerde saklanır.', uploadLabel = 'Belge Yükle' }: { items: QualityDocument[]; category: string; onCategory: (value: string) => void; staff: boolean; onScan?: () => void; onUpload?: () => void; onDownload: (document: QualityDocument, open?: boolean) => void; onShare: (document: QualityDocument) => void; onArchive?: (document: QualityDocument) => void; onUnarchive?: (document: QualityDocument) => void; onDelete?: (document: QualityDocument) => void; fixed?: boolean; title?: string; description?: string; uploadLabel?: string }) {
  const [search, setSearch] = useState(''); const [scope, setScope] = useState(''); const [fileType, setFileType] = useState(''); const [dateFrom, setDateFrom] = useState(''); const [dateTo, setDateTo] = useState('');
  const scopes = useMemo(() => Array.from(new Map(items.map((item) => fixed
    ? [item.inventoryItemId ?? item.productName, { value: item.inventoryItemId ?? item.productName ?? '', label: item.productName ?? 'Ürün bağlantısı yok' }]
    : [`${item.customerId ?? ''}|${item.branchId ?? ''}`, { value: `${item.customerId ?? ''}|${item.branchId ?? ''}`, label: `${item.customerName} · ${item.branchName}` }])).values()).filter((item) => item.value).sort((a, b) => a.label.localeCompare(b.label, 'tr')), [items, fixed]);
  const visibleItems = useMemo(() => items.filter((item) => {
    const text = `${item.title} ${item.fileName} ${item.description ?? ''} ${item.customerName} ${item.branchName} ${item.productName ?? ''} ${item.licenseNumber ?? ''} ${item.createdBy} ${categoryLabel(item.category)}`.toLocaleLowerCase('tr-TR');
    const itemScope = fixed ? item.inventoryItemId ?? item.productName ?? '' : `${item.customerId ?? ''}|${item.branchId ?? ''}`;
    const itemDate = dateKey(new Date(item.createdAt));
    return (!search.trim() || text.includes(search.trim().toLocaleLowerCase('tr-TR'))) && (!scope || itemScope === scope) && (!fileType || documentFileType(item) === fileType) && (!dateFrom || itemDate >= dateFrom) && (!dateTo || itemDate <= dateTo);
  }), [items, search, scope, fileType, dateFrom, dateTo, fixed]);
  const hasFilters = Boolean(search || scope || fileType || dateFrom || dateTo || (!fixed && category));
  const clearFilters = () => { setSearch(''); setScope(''); setFileType(''); setDateFrom(''); setDateTo(''); if (!fixed) onCategory(''); };
  return <div className="quality-module"><div className="quality-module-heading"><div><p className="eyebrow">KATEGORİK DİJİTAL ARŞİV</p><h2>{title}</h2><p>{description}</p></div>{staff && <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>{onScan && <button type="button" className="secondary-button" onClick={onScan} title="Kamera ile A4 Belge Tara"><Camera size={17} /> Belge Tara (A4)</button>}{onUpload && <button className="primary-button" onClick={onUpload}><Upload size={17} /> {uploadLabel}</button>}</div>}</div><div className="surface document-library"><div className="document-filter-panel"><label className="document-search"><span>Belge ara</span><i><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Başlık, dosya, ürün veya müşteri…" /></i></label>{!fixed && <label>Kategori<select value={category} onChange={(event) => onCategory(event.target.value)}><option value="">Tüm kategoriler</option>{documentCategories.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>}<label>{fixed ? 'Stok ürünü' : 'Müşteri / Şube'}<select value={scope} onChange={(event) => setScope(event.target.value)}><option value="">Tümü</option>{scopes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label>Dosya türü<select value={fileType} onChange={(event) => setFileType(event.target.value)}><option value="">Tüm türler</option><option value="pdf">PDF</option><option value="office">Word / Excel</option><option value="image">Görsel</option><option value="text">Metin / Diğer</option></select></label><label>Başlangıç<input type="date" value={dateFrom} onChange={(event) => { const next = event.target.value; setDateFrom(next); if (dateTo && dateTo < next) setDateTo(next); }} /></label><label>Bitiş<input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} /></label><div className="document-filter-summary"><span><strong>{visibleItems.length}</strong> / {items.length} belge</span><button type="button" disabled={!hasFilters} onClick={clearFilters}><FilterX size={15} /> Temizle</button></div></div>{visibleItems.length === 0 ? <div className="quality-empty"><FileArchive /><strong>{items.length ? 'Filtrelere uygun belge bulunamadı' : 'Bu kategoride belge yok'}</strong><span>{items.length ? 'Filtreleri temizleyin veya farklı ölçütlerle tekrar deneyin.' : fixed ? 'İlk belgeyi yükleyip stok ürünüyle eşleştirin.' : 'Yeni analizler ve yüklenen dosyalar burada sıralanır.'}</span></div> : <div className="document-table"><div className="document-table-head"><span>Belge</span><span>Kategori</span><span>{fixed ? 'Bağlı ürün / Belge no' : 'Müşteri / Şube'}</span><span>Oluşturan</span><span>Tarih</span><span /></div>{visibleItems.map((item) => <article key={item.id}><span className="document-name"><i>{documentIcon(item)}</i><span><strong>{item.title}</strong><small>{item.fileName}{item.sizeBytes ? ` · ${formatSize(item.sizeBytes)}` : ' · Dijital form'}</small></span></span><span className="document-category">{categoryLabel(item.category)}</span><span>{fixed ? item.productName ?? 'Ürün bağlantısı yok' : item.customerName}<small>{fixed ? item.licenseNumber ?? (item.category === 'SafetyDataSheets' ? 'MSDS / GBF' : 'Ruhsat numarası yok') : item.branchName}</small></span><span>{item.createdBy}</span><span>{formatDate(item.createdAt)}</span><span className="document-actions">{item.contentType === 'application/pdf' && <button title="Görüntüle" onClick={() => onDownload(item, true)}><Eye size={16} /></button>}<button title="İndir" onClick={() => onDownload(item)}><Download size={16} /></button><button title="Paylaş" onClick={() => onShare(item)}><Share2 size={16} /></button>{staff && <>{item.category === 'Archived' ? <button type="button" title="Arşivden Çıkar" onClick={() => onUnarchive?.(item)} style={{ color: '#0d9488' }}><RefreshCw size={15} /></button> : <button type="button" title="Arşivle" onClick={() => onArchive?.(item)} style={{ color: '#d97706' }}><FileArchive size={15} /></button>}<button type="button" title="Kalıcı Olarak Sil" onClick={() => onDelete?.(item)} style={{ color: '#dc2626' }}><Trash2 size={15} /></button></>}</span></article>)}</div>}</div></div>;
}

function TrendAnalysisModal({ locations, onClose, onSubmit }: { locations: QualityLocation[]; onClose: () => void; onSubmit: (input: CreateTrendAnalysisInput) => Promise<void> }) {
  const [locationKey, setLocationKey] = useState(locationValue(locations[0]));
  const [periodEnd, setPeriodEnd] = useState(dateKey(new Date()));
  const [periodStart, setPeriodStart] = useState(() => {
    const end = new Date();
    const s = new Date(end);
    s.setMonth(s.getMonth() - 3);
    s.setDate(s.getDate() + 1);
    return dateKey(s);
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setDays = (days: number) => {
    const end = new Date(`${periodEnd}T12:00:00`);
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));
    setPeriodStart(dateKey(start));
  };

  const setMonths = (months: number) => {
    const end = new Date(`${periodEnd}T12:00:00`);
    const start = new Date(end);
    start.setMonth(start.getMonth() - months);
    start.setDate(start.getDate() + 1);
    setPeriodStart(dateKey(start));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const location = findLocation(locations, locationKey);
    if (!location) return setError('Müşteri veya şube seçin.');
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        customerId: location.customerId,
        branchId: location.branchId,
        periodStart,
        periodEnd,
        title: optional(data, 'title'),
        findings: optional(data, 'findings'),
        recommendations: optional(data, 'recommendations')
      });
    } catch (submitError) {
      setError(messageOf(submitError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-layer">
      <div className="modal quality-form-modal">
        <ModalTitle
          icon={<BarChart3 />}
          eyebrow="TREND ANALİZİ"
          title="Canlı yakalama & aktivite trendi"
          description="Onaylı saha raporlarındaki istasyon hareketleri seçilen tarih aralığında otomatik karşılaştırılır."
          onClose={onClose}
        />
        <form onSubmit={submit}>
          <div className="quality-form-note">
            <FileSpreadsheet />
            <div>
              <strong>Otomatik veri kaynağı</strong>
              <span>Toplam istasyon, aktivite görülen istasyon, plaka değişimi, yakalama sayısı ve zararlı türleri saha formlarından alınır.</span>
            </div>
          </div>
          <div className="form-grid">
            <LocationSelect locations={locations} value={locationKey} onChange={setLocationKey} />
            <label>Analiz başlığı<input name="title" placeholder="Örn: 2026 Trend Değerlendirmesi" /></label>
            <label>Başlangıç<input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} required /></label>
            <label>Bitiş<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} required /></label>
            <div className="form-field-wide period-presets" style={{ flexWrap: 'wrap', gap: '6px' }}>
              <span>Hızlı dönem</span>
              <button type="button" onClick={() => setDays(7)}>1 haftalık</button>
              <button type="button" onClick={() => setMonths(1)}>1 aylık</button>
              <button type="button" onClick={() => setMonths(2)}>2 aylık</button>
              <button type="button" onClick={() => setMonths(3)}>3 aylık</button>
              <button type="button" onClick={() => setMonths(6)}>6 aylık</button>
              <button type="button" onClick={() => setMonths(12)}>1 yıllık</button>
            </div>
            <label className="form-field-wide">Saha bulguları<textarea name="findings" rows={3} placeholder="Dönemi etkileyen operasyonel değişiklikler, tadilat, mevsimsel koşullar…" /></label>
            <label className="form-field-wide">Sonuç ve öneriler<textarea name="recommendations" rows={3} placeholder="İstasyon yerleşimi, takip sıklığı veya düzeltici faaliyet önerileri…" /></label>
          </div>
          {error && <div className="modal-form-error">{error}</div>}
          <ModalActions saving={saving} onClose={onClose} label="Trend Analizini Yayınla" />
        </form>
      </div>
    </div>
  );
}

function RiskAnalysisModal({ accessToken, locations, onClose, onSubmit }: { accessToken: string; locations: QualityLocation[]; onClose: () => void; onSubmit: (input: CreateRiskAnalysisInput) => Promise<void> }) {
  const [locationKey, setLocationKey] = useState(locationValue(locations[0])); const [scores, setScores] = useState<Record<string, number>>(Object.fromEntries(riskQuestions.map((item) => [item.code, 0]))); const [notes, setNotes] = useState<Record<string, string>>({}); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const [matrix, setMatrix] = useState<RiskMatrixRow[]>([{ location: '', pestCategory: 'Kemirgen', severity: 1, likelihood: 1, note: '' }]);
  const [sitePlans, setSitePlans] = useState<SitePlanRecord[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');

  useEffect(() => {
    const location = findLocation(locations, locationKey);
    if (location) {
      getSitePlans(accessToken).then((allPlans) => {
        const filtered = allPlans.filter((p) => p.customerId === location.customerId && (!location.branchId || !p.branchId || p.branchId === location.branchId));
        setSitePlans(filtered);
        setSelectedPlanId('');
      }).catch(() => setSitePlans([]));
    } else {
      setSitePlans([]);
    }
  }, [accessToken, locations, locationKey]);

  const activePlan = sitePlans.find((p) => p.id === selectedPlanId) || sitePlans[0];
  const locationSuggestions = useMemo(() => {
    if (!activePlan?.canvas?.elements) return [];
    const list: string[] = [];
    for (const el of activePlan.canvas.elements) {
      if (el.stationNumber) list.push(el.stationNumber);
      if (el.text) list.push(el.text);
    }
    return Array.from(new Set(list)).filter(Boolean);
  }, [activePlan]);

  const estimated = Math.round(Object.values(scores).reduce((sum, value) => sum + value, 0) / (riskQuestions.length * 4) * 100);
  const updateMatrix = (index: number, patch: Partial<RiskMatrixRow>) => setMatrix((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const location = findLocation(locations, locationKey);
    if (!location) return setError('Müşteri veya şube seçin.');
    const data = new FormData(event.currentTarget);
    const riskMatrix = matrix.filter((item) => item.location.trim());
    if (riskMatrix.some((item) => !item.pestCategory.trim())) return setError('Risk matrisindeki zararlı kategorisini seçin.');
    const answers: RiskAnswer[] = riskQuestions.map((item) => ({ ...item, score: scores[item.code], note: notes[item.code] || undefined }));
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        customerId: location.customerId,
        branchId: location.branchId,
        assessmentDate: String(data.get('assessmentDate')),
        title: optional(data, 'title'),
        findings: optional(data, 'findings'),
        correctiveActions: optional(data, 'correctiveActions'),
        recommendations: optional(data, 'recommendations'),
        sectorType: optional(data, 'sectorType'),
        currentFrequency: optional(data, 'currentFrequency'),
        riskMatrix,
        answers,
        sitePlanId: selectedPlanId || undefined,
      });
    } catch (submitError) {
      setError(messageOf(submitError));
    } finally {
      setSaving(false);
    }
  };

  return <div className="modal-layer"><div className="modal quality-form-modal risk-form-modal"><ModalTitle icon={<BrainCircuit />} eyebrow="DETAYLI RİSK ANALİZİ" title="Haşere yönetimi risk değerlendirmesi" description="Dört bölümlü saha formu, yerleşim krokisi, risk matrisi ve güncel hava verisi tek bir raporda birleştirilir." onClose={onClose} /><form onSubmit={submit}><div className="risk-score-guide"><div><strong>{estimated}/100</strong><span>Form ön değerlendirmesi</span></div><p><b>0:</b> Uygun / risk yok <b>1:</b> Düşük <b>2:</b> Orta <b>3:</b> Yüksek <b>4:</b> Kritik uygunsuzluk</p></div><div className="risk-form-section-title"><span>1</span><div><strong>Tesis ve değerlendirme bilgileri</strong><small>Referans dosyadaki sektör, kroki ve uygulama sıklığı bölümü</small></div></div><div className="form-grid risk-header-fields"><LocationSelect locations={locations} value={locationKey} onChange={setLocationKey} /><label>Değerlendirme tarihi<input name="assessmentDate" type="date" defaultValue={dateKey(new Date())} required /></label><label>Sektör<select name="sectorType" defaultValue="Food"><option value="Food">Gıda üretimi / hizmeti</option><option value="NonFood">Gıda dışı işletme</option></select></label><label>Mevcut kontrol sıklığı<input name="currentFrequency" /></label>{sitePlans.length > 0 && <label>Kroki / Yerleşim Planı (Mekânsal Harita)<select value={selectedPlanId} onChange={(event) => setSelectedPlanId(event.target.value)}><option value="">En Son Güncel Kroki (Otomatik)</option>{sitePlans.map((p) => <option key={p.id} value={p.id}>{p.title} ({p.number} R{p.revision})</option>)}</select></label>}<label className="form-field-wide">Belge başlığı<input name="title" /></label></div><div className="risk-form-section-title"><span>2</span><div><strong>Yapısal ve operasyonel kontrol formu</strong><small>Dış çevre, yalıtım, hijyen, depolama ve izlenebilirlik</small></div></div><div className="risk-question-list">{riskCategories.map((category) => <section key={category}><h3>{category}</h3>{riskQuestions.filter((item) => item.category === category).map((item) => <article key={item.code}><span className="risk-question-code">{item.code}</span><div><strong>{item.question}</strong><small>{item.recommendation}</small><input value={notes[item.code] ?? ''} onChange={(event) => setNotes((current) => ({ ...current, [item.code]: event.target.value }))} placeholder="Saha notu / uygunsuzluk açıklaması" /></div><select value={scores[item.code]} onChange={(event) => setScores((current) => ({ ...current, [item.code]: Number(event.target.value) }))}>{[0,1,2,3,4].map((score) => <option value={score} key={score}>{score}</option>)}</select></article>)}</section>)}</div><div className="risk-form-section-title"><span>3</span><div><strong>Lokasyon bazlı zararlı risk matrisi</strong><small>Şiddet × olasılık; kroki istasyon numaralarıyla eşleşir</small></div><button type="button" onClick={() => setMatrix((rows) => [...rows, { location: '', pestCategory: 'Kemirgen', severity: 1, likelihood: 1, note: '' }])}><Plus /> Satır ekle</button></div><div className="risk-matrix-editor"><div className="risk-matrix-head"><span>Lokasyon / İstasyon</span><span>Zararlı grubu</span><span>Şiddet</span><span>Olasılık</span><span>Boyut</span><span>Açıklama</span><span /></div>{matrix.map((row, index) => <div className="risk-matrix-row" key={index}><input list="risk-location-suggestions" value={row.location} onChange={(event) => updateMatrix(index, { location: event.target.value })} placeholder="İstasyon no veya alan…" /><select value={row.pestCategory} onChange={(event) => updateMatrix(index, { pestCategory: event.target.value })}>{riskPestCategories.map((item) => <option key={item}>{item}</option>)}</select><select value={row.severity} onChange={(event) => updateMatrix(index, { severity: Number(event.target.value) })}>{[1,2,3].map((value) => <option key={value}>{value}</option>)}</select><select value={row.likelihood} onChange={(event) => updateMatrix(index, { likelihood: Number(event.target.value) })}>{[1,2,3].map((value) => <option key={value}>{value}</option>)}</select><strong className={`matrix-score matrix-${matrixTone(row.severity * row.likelihood)}`}>{row.severity * row.likelihood}</strong><input value={row.note ?? ''} onChange={(event) => updateMatrix(index, { note: event.target.value })} placeholder="Risk kaynağı / bulgu" /><button type="button" disabled={matrix.length === 1} onClick={() => setMatrix((rows) => rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 /></button></div>)}</div><datalist id="risk-location-suggestions">{locationSuggestions.map((s) => <option key={s} value={s} />)}</datalist><div className="risk-form-section-title"><span>4</span><div><strong>Sonuç, faaliyet ve uzman görüşü</strong><small>PDF raporunun yönetim özeti</small></div></div><div className="form-grid risk-footer-fields"><label className="form-field-wide">Genel bulgular<textarea name="findings" rows={3} placeholder="Gözlenen zararlı izleri, giriş noktaları ve çevresel koşullar…" /></label><label className="form-field-wide">Düzeltici faaliyetler<textarea name="correctiveActions" rows={3} placeholder="Kapatılacak açıklıklar, temizlik, drenaj, atık veya istasyon aksiyonları…" /></label><label className="form-field-wide">Uzman önerisi<textarea name="recommendations" rows={3} placeholder="Mesul müdür veya saha sorumlusunun ek önerileri…" /></label></div>{error && <div className="modal-form-error">{error}</div>}<ModalActions saving={saving} onClose={onClose} label="Risk Analizini Yayınla" /></form></div></div>;
}

function RiskSitePlanModal({ analysis, document, onClose, onDownload, onShare }: { analysis: QualityAnalysis; document?: QualityDocument; onClose: () => void; onDownload: (doc: QualityDocument, open?: boolean) => void; onShare: (doc: QualityDocument) => void }) {
  const sitePlan = analysis.payload.sitePlan;
  if (!sitePlan) return null;
  const hotspots = sitePlan.hotspots ?? [];
  const canvas = sitePlan.canvas;

  return (
    <div className="modal-layer">
      <div className="modal risk-plan-modal">
        <header className="risk-plan-modal-header">
          <div>
            <p className="eyebrow">MEKÂNSAL RİSK &amp; ALAN YOĞUNLUK PLANI</p>
            <h2>{analysis.title}</h2>
            <p>{analysis.customerName} · {analysis.branchName} · {sitePlan.title} ({sitePlan.number} R{sitePlan.revision})</p>
          </div>
          <button className="icon-button" onClick={onClose}><X size={19} /></button>
        </header>

        <div className="risk-plan-modal-body">
          <div className="risk-plan-canvas-wrap">
            <svg viewBox={`0 0 ${canvas.width} ${canvas.height}`}>
              <rect width="100%" height="100%" fill="#FFFFFF" />
              {canvas.backgroundImage && (
                <image
                  href={canvas.backgroundImage}
                  x={canvas.backgroundX ?? 0}
                  y={canvas.backgroundY ?? 0}
                  width={canvas.backgroundWidth ?? canvas.width}
                  height={canvas.backgroundHeight ?? canvas.height}
                  opacity={canvas.backgroundOpacity ?? 1}
                  preserveAspectRatio="xMidYMid meet"
                />
              )}
              <defs>
                <filter id="viewer-glow-red" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#DC2626" floodOpacity=".85" />
                </filter>
                <filter id="viewer-glow-yellow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#F59E0B" floodOpacity=".85" />
                </filter>
              </defs>

              {canvas.elements.map((el) => {
                const eq = canvas.equipmentTypes.find((t) => t.id === el.equipmentTypeId);
                return (
                  <g key={el.id} transform={el.rotation ? `rotate(${el.rotation} ${el.x + el.width / 2} ${el.y + el.height / 2})` : undefined}>
                    {el.type === 'rect' && (
                      <>
                        <rect x={el.x} y={el.y} width={el.width} height={el.height} rx="2" fill={el.fill ?? '#FFFFFF'} stroke={el.stroke ?? '#102A43'} strokeWidth={el.strokeWidth} />
                        {el.text && <text x={el.x + el.width / 2} y={el.y + el.height / 2 + 5} textAnchor="middle" fill="#102A43" fontSize="14" fontWeight="700">{el.text}</text>}
                      </>
                    )}
                    {el.type === 'image' && el.imageUrl && (
                      <image href={el.imageUrl} x={el.x} y={el.y} width={el.width} height={el.height} opacity={el.opacity ?? 1} preserveAspectRatio="none" />
                    )}
                    {el.type === 'line' && (
                      <line x1={el.x} y1={el.y} x2={el.x + el.width} y2={el.y + el.height} stroke={el.stroke ?? '#102A43'} strokeWidth={el.strokeWidth} strokeLinecap="round" />
                    )}
                    {el.type === 'door' && (
                      <>
                        <line x1={el.x} y1={el.y} x2={el.x + el.width} y2={el.y} stroke={el.stroke ?? '#102A43'} strokeWidth={el.strokeWidth} />
                        <path d={`M ${el.x} ${el.y} A ${Math.abs(el.width)} ${Math.abs(el.height)} 0 0 1 ${el.x + el.width} ${el.y + el.height}`} fill="none" stroke="#94A3B8" strokeWidth="2" strokeDasharray="5 4" />
                      </>
                    )}
                    {el.type === 'text' && (
                      <text x={el.x} y={el.y + 20} fill="#102A43" fontSize={Math.max(12, el.height)} fontWeight="700">{el.text ?? 'Alan etiketi'}</text>
                    )}
                    {el.type === 'station' && eq && (
                      <>
                        <g transform={`translate(${el.x} ${el.y})`}>
                          <rect width={el.width} height={el.height} rx="4" fill={eq.color} stroke="#FFFFFF" strokeWidth="2" />
                          <text x={el.width / 2} y={el.height / 2 + 4} textAnchor="middle" fill="#FFFFFF" fontSize="12" fontWeight="800">{eq.code}</text>
                        </g>
                        <text x={el.x + el.width + 4} y={el.y + el.height / 2 + 4} fill="#102A43" fontSize="12" fontWeight="700">{el.stationNumber}</text>
                      </>
                    )}
                  </g>
                );
              })}

              {hotspots.map((spot, idx) => {
                if (spot.x == null || spot.y == null) return null;
                const color = spot.score >= 6 ? '#DC2626' : spot.score >= 3 ? '#F59E0B' : '#10B981';
                const filter = spot.score >= 6 ? 'url(#viewer-glow-red)' : spot.score >= 3 ? 'url(#viewer-glow-yellow)' : undefined;
                const sw = spot.width ?? 36;
                const sh = spot.height ?? 36;
                return (
                  <g key={idx}>
                    <rect x={spot.x - 8} y={spot.y - 8} width={sw + 16} height={sh + 16} rx="10" fill={color} fillOpacity="0.25" stroke={color} strokeWidth="2.5" strokeDasharray="4 3" filter={filter} />
                    <g transform={`translate(${spot.x + sw - 6} ${spot.y - 12})`}>
                      <rect width="44" height="17" rx="8.5" fill={color} stroke="#FFFFFF" strokeWidth="1.5" />
                      <text x="22" y="12" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="800">R:{spot.score}</text>
                    </g>
                  </g>
                );
              })}

              <g transform="translate(930, 18)">
                <rect width="252" height="66" rx="8" fill="#FFFFFF" fillOpacity="0.94" stroke="#CBD5E1" strokeWidth="1.2" />
                <text x="12" y="18" fill="#0F172A" fontSize="10" fontWeight="800">RİSK &amp; AKTİVİTE LEJANTI</text>
                <circle cx="20" cy="35" r="5" fill="#DC2626" />
                <text x="32" y="38" fill="#1E293B" fontSize="8.5" fontWeight="700">Kritik / Yüksek (6-9)</text>
                <circle cx="20" cy="51" r="5" fill="#F59E0B" />
                <text x="32" y="54" fill="#1E293B" fontSize="8.5" fontWeight="700">Orta Risk (3-4)</text>
                <circle cx="148" cy="51" r="5" fill="#10B981" />
                <text x="160" y="54" fill="#1E293B" fontSize="8.5" fontWeight="700">Düşük (1-2)</text>
              </g>
            </svg>
          </div>

          {hotspots.length > 0 && (
            <div className="risk-plan-hotspot-table">
              <table>
                <thead>
                  <tr>
                    <th>Lokasyon / İstasyon</th>
                    <th>Zararlı Grubu</th>
                    <th>Risk Skoru</th>
                    <th>Risk Seviyesi</th>
                    <th>Saha Notu &amp; Aksiyon</th>
                  </tr>
                </thead>
                <tbody>
                  {hotspots.map((spot, i) => (
                    <tr key={i} className={spot.score >= 6 ? 'risk-row-high' : spot.score >= 3 ? 'risk-row-medium' : ''}>
                      <td><strong>{spot.location}</strong></td>
                      <td>{spot.pestCategory}</td>
                      <td><span className={`risk-plan-badge ${spot.score >= 6 ? 'high' : spot.score >= 3 ? 'medium' : 'low'}`}>{spot.score}/9</span></td>
                      <td>{spot.score >= 6 ? 'Kritik / Yüksek' : spot.score >= 3 ? 'Orta' : 'Düşük'}</td>
                      <td>{spot.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <footer className="risk-plan-modal-footer">
          {document && (
            <>
              <button type="button" className="secondary-button" onClick={() => onDownload(document, true)}><Eye size={15} /> PDF Görüntüle</button>
              <button type="button" className="secondary-button" onClick={() => onDownload(document)}><Download size={15} /> PDF İndir</button>
              <button type="button" className="secondary-button" onClick={() => onShare(document)}><Share2 size={15} /> Paylaş</button>
            </>
          )}
          <button type="button" className="primary-button" onClick={onClose}>Kapat</button>
        </footer>
      </div>
    </div>
  );
}

function DocumentUploadModal({ locations, inventoryItems, defaultCategory, onClose, onSubmit }: { locations: QualityLocation[]; inventoryItems: InventoryItem[]; defaultCategory: string; onClose: () => void; onSubmit: (input: Parameters<typeof uploadQualityDocument>[1]) => Promise<void> }) {
  const [locationKey, setLocationKey] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const isLicense = defaultCategory === 'Licenses';
  const isSafetyDataSheet = defaultCategory === 'SafetyDataSheets'; const isProductDocument = isLicense || isSafetyDataSheet;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    let file = data.get('file');
    if (!(file instanceof File) || !file.size) return setError('Yüklenecek dosyayı seçin.');
    const location = findLocation(locations, locationKey);
    const inventoryItemId = optional(data, 'inventoryItemId');
    const licenseNumber = optional(data, 'licenseNumber');
    if (isProductDocument && !inventoryItemId) return setError('Belgenin bağlı olduğu stok ürününü seçin.');
    if (isLicense && !licenseNumber) return setError('Ruhsat numarasını girin.');
    setSaving(true);
    setError(null);
    try {
      if (file.type.startsWith('image/')) {
        file = await compressImage(file, { maxDimension: 1600, quality: 0.82 });
      }
      await onSubmit({
        file,
        category: isProductDocument ? defaultCategory : String(data.get('category')),
        title: optional(data, 'title'),
        description: optional(data, 'description'),
        customerId: isProductDocument ? undefined : location?.customerId,
        branchId: isProductDocument ? undefined : location?.branchId,
        inventoryItemId,
        licenseNumber,
      });
    } catch (submitError) {
      setError(messageOf(submitError));
    } finally {
      setSaving(false);
    }
  };
  return <div className="modal-layer"><div className="modal document-upload-modal"><ModalTitle icon={<Upload />} eyebrow="BELGE ARŞİVİ" title={isLicense ? 'Yeni ürün ruhsatı yükle' : isSafetyDataSheet ? 'Yeni MSDS / GBF yükle' : 'Yeni belge yükle'} description={isLicense ? 'Ruhsatı stok ürününe bağlayın; EK-1 seçimi sırasında otomatik kullanılsın.' : isSafetyDataSheet ? 'Güvenlik bilgi formunu stok ürünüyle eşleştirin; ilgili müşteri ve denetim dosyasında otomatik gösterilsin.' : 'Belgeyi müşteri ve şube bazında arşivleyin.'} onClose={onClose} /><form onSubmit={submit}><div className="form-grid"><label>Kategori<select name="category" defaultValue={defaultCategory} disabled={isProductDocument}>{documentCategories.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>{isProductDocument ? <><label>Bağlı stok ürünü<select name="inventoryItemId" required><option value="">Ürün seçin</option>{inventoryItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.quantity} {item.unit}</option>)}</select></label>{isLicense && <label className="form-field-wide">Ruhsat numarası<input name="licenseNumber" required placeholder="Bakanlık ruhsat / izin numarası" /></label>}</> : <label>Müşteri / Şube<select value={locationKey} onChange={(event) => setLocationKey(event.target.value)}><option value="">Firma içi belge</option>{locationOptions(locations)}</select></label>}<label className="form-field-wide">Belge başlığı<input name="title" placeholder="Dosya adı boş bırakılırsa başlık olarak kullanılır" /></label><label className="form-field-wide quality-file-input"><span>Dosya</span><input name="file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp" required /><small>En fazla 15 MB</small></label><label className="form-field-wide">Açıklama<textarea name="description" rows={3} placeholder={isSafetyDataSheet ? 'Revizyon tarihi, üretici, dil veya geçerlilik notu…' : 'Belgenin kapsamı, geçerlilik dönemi veya ilgili notlar…'} /></label></div>{error && <div className="modal-form-error">{error}</div>}<ModalActions saving={saving} onClose={onClose} label={isLicense ? 'Ruhsatı Ürüne Bağla' : isSafetyDataSheet ? 'MSDS / GBF Belgesini Bağla' : 'Belgeyi Arşivle'} /></form></div></div>;
}

function ModalTitle({ icon, eyebrow, title, description, onClose }: { icon: React.ReactNode; eyebrow: string; title: string; description: string; onClose: () => void }) { return <div className="modal-header"><span className="quality-modal-icon">{icon}</span><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></div><button className="icon-button" onClick={onClose}><X /></button></div>; }
function ModalActions({ saving, onClose, label }: { saving: boolean; onClose: () => void; label: string }) { return <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Vazgeç</button><button className="primary-button" disabled={saving}>{saving ? 'Hazırlanıyor…' : label}</button></div>; }
function LocationSelect({ locations, value, onChange }: { locations: QualityLocation[]; value: string; onChange: (value: string) => void }) { return <label>Müşteri / Şube<select value={value} onChange={(event) => onChange(event.target.value)} required><option value="">Seçin</option>{locationOptions(locations)}</select></label>; }
function locationOptions(locations: QualityLocation[]) { return locations.map((item) => <option key={locationValue(item)} value={locationValue(item)}>{item.customerName} · {item.branchName}</option>); }
function locationValue(location?: QualityLocation) { return location ? `${location.customerId}|${location.branchId ?? ''}` : ''; }
function findLocation(locations: QualityLocation[], value: string) { return locations.find((item) => locationValue(item) === value); }
function Metric({ label, value }: { label: string; value: string | number }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function documentIcon(item: QualityDocument) { return item.contentType.includes('spreadsheet') || item.fileName.endsWith('.xlsx') ? <FileSpreadsheet /> : <FileText />; }
function documentFileType(item: QualityDocument) { const name = item.fileName.toLocaleLowerCase('tr-TR'); if (item.contentType === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'; if (/\.(docx?|xlsx?|csv)$/.test(name)) return 'office'; if (item.contentType.startsWith('image/')) return 'image'; return 'text'; }
function riskTone(item: QualityAnalysis) { if (item.analysisType === 'Trend') return item.payload.trendDirection === 'Artış' ? 'medium' : 'low'; return item.level?.toLowerCase() ?? 'low'; }
function riskLabel(value?: string) { return value === 'High' ? 'Yüksek' : value === 'Medium' ? 'Orta' : value === 'Low' ? 'Düşük' : value ?? '—'; }
function categoryLabel(value: string) { return documentCategories.find((item) => item.value === value)?.label ?? value; }
function formatSize(value: number) { return value >= 1_048_576 ? `${(value / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1024))} KB`; }
function formatDate(value: string) { return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)); }
function formatDateRange(start: string, end: string) { return start === end ? formatDate(`${start}T12:00:00`) : `${formatDate(`${start}T12:00:00`)} – ${formatDate(`${end}T12:00:00`)}`; }
function dateKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
function monthStart(months: number, end = new Date()) { const value = new Date(end); value.setDate(1); value.setMonth(value.getMonth() - Math.max(0, months - 1)); return dateKey(value); }
function optional(data: FormData, key: string) { const value = String(data.get(key) ?? '').trim(); return value || undefined; }
function messageOf(error: unknown) { return error instanceof Error ? error.message : 'İşlem tamamlanamadı.'; }
function matrixTone(score: number) { return score >= 6 ? 'high' : score >= 3 ? 'medium' : 'low'; }
async function refreshDocuments(token: string, setter: (items: QualityDocument[]) => void) { setter(await getQualityDocuments(token)); }

const documentCategories = [
  { value: 'TrendAnalyses', label: 'Trend Analizleri' }, { value: 'RiskAnalyses', label: 'Risk Analizleri' },
  { value: 'SitePlans', label: 'Ekipman Yerleşim Planları' },
  { value: 'StationActivations', label: 'İstasyon Aktivasyon Listeleri' },
  { value: 'AuditPackages', label: 'Denetim Dosyaları' },
  { value: 'FieldInspections', label: 'Saha İncelemeleri' },
  { value: 'ServiceReports', label: 'Saha Hizmet Raporları' }, { value: 'CommercialProposals', label: 'Teklifler' }, { value: 'Contracts', label: 'Sözleşmeler' },
  { value: 'SalesForms', label: 'Satış Formları' },
  { value: 'Certificates', label: 'İzin & Sertifikalar' }, { value: 'Licenses', label: 'Ürün Ruhsatları' }, { value: 'SafetyDataSheets', label: 'MSDS / Güvenlik Bilgi Formları' }, { value: 'Photos', label: 'Fotoğraflar' },
  { value: 'General', label: 'Genel Belgeler' }, { value: 'Archived', label: '📁 Arşivlenmiş Belgeler' }, { value: 'Other', label: 'Diğer' },
];
const riskPestCategories = ['Kemirgen', 'Uçan haşere', 'Yürüyen haşere', 'Depolanmış ürün zararlısı', 'Kuş', 'Sokak hayvanları', 'Diğer'];
const riskCategories = ['Dış alan & çevre koşulları', 'Yalıtım standartları', 'Hijyen standartları', 'İç alan & depolama sınırları', 'İzleme & kayıt sistemi'];
const riskQuestions: Omit<RiskAnswer, 'score' | 'note'>[] = [
  { code: 'D01', category: riskCategories[0], question: 'Tesis yoğun yerleşim veya şehir merkezinde bulunuyor mu?', recommendation: 'Çevresel baskıyı ve komşu kaynakları dönemsel olarak kaydedin.' },
  { code: 'D02', category: riskCategories[0], question: 'Tesis ana yol, yükleme trafiği veya yüksek hareketlilik hattında mı?', recommendation: 'Giriş ve mal kabul noktalarında izleme yoğunluğunu artırın.' },
  { code: 'D03', category: riskCategories[0], question: 'Tesis sınırları fiziksel olarak ayrılmış ve kontrol edilebilir mi?', recommendation: 'Sınır hattını kapatın ve dış alan istasyonlarını düzenli kontrol edin.' },
  { code: 'D04', category: riskCategories[0], question: 'Ortak kullanım alanı veya komşu işletme kaynaklı bulaşma baskısı var mı?', recommendation: 'Ortak alan sorumluluklarını ve bildirim mekanizmasını yazılı tanımlayın.' },
  { code: 'D05', category: riskCategories[0], question: 'Dış alan duvar, çit ve kapıları zararlı girişini sınırlandırıyor mu?', recommendation: 'Boşlukları giderin; duvar ve çit sürekliliğini sağlayın.' },
  { code: 'D06', category: riskCategories[0], question: 'Bitişik tarla, hayvancılık alanı veya yoğun bitki örtüsü bulunuyor mu?', recommendation: 'Dış çevre kontrol bandı ve kemirgen izleme sıklığını artırın.' },
  { code: 'D07', category: riskCategories[0], question: 'Yakında dere, kanal, gölet veya sürekli su kaynağı bulunuyor mu?', recommendation: 'Uçan haşere ve kemirgen kaynaklarını mevsimsel olarak değerlendirin.' },
  { code: 'D08', category: riskCategories[0], question: 'Zemin, bitki örtüsü ve malzeme yığınları zararlı barınmasına elverişli mi?', recommendation: 'Cephe çevresinde temiz ve gözlenebilir kontrol bandı oluşturun.' },
  { code: 'D09', category: riskCategories[0], question: 'Drenaj, rögar ve yağmur suyu tahliyesi birikintiyi önlüyor mu?', recommendation: 'Durgun suyu kaldırın; rögar kapak ve ızgaralarını onarın.' },
  { code: 'D10', category: riskCategories[0], question: 'Atık alanı kapalı, yıkanabilir ve düzenli boşaltılıyor mu?', recommendation: 'Atık kaplarını kapalı tutun ve sızıntıları günlük giderin.' },
  { code: 'D11', category: riskCategories[0], question: 'Ağaç, çim ve yabani ot bakımı cephe çevresinde yeterli mi?', recommendation: 'Bitki temasını kesin; bakım kayıtlarını programa bağlayın.' },
  { code: 'D12', category: riskCategories[0], question: 'Kuş yuvası, tüneme veya yoğun kuş aktivitesi bulunuyor mu?', recommendation: 'Yasal ve fiziksel kuş caydırma önlemlerini değerlendirin.' },
  { code: 'D13', category: riskCategories[0], question: 'Giriş, saçak ve mal kabul alanları kuş tünemesine uygun mu?', recommendation: 'Saçak ve çıkıntılarda uygun fiziksel önlem uygulayın.' },
  { code: 'D14', category: riskCategories[0], question: 'Havalandırma ve dış cephe noktaları gerektiğinde erişilip kontrol edilebilir mi?', recommendation: 'Kontrol kapakları ve güvenli erişim planı oluşturun.' },
  { code: 'Y01', category: riskCategories[1], question: 'Dış duvarlarda yarık, çatlak veya açık geçiş bulunuyor mu?', recommendation: 'Açıklıkları kemirgene dayanıklı malzemeyle kapatın.' },
  { code: 'Y02', category: riskCategories[1], question: 'İç duvar, zemin, fayans ve birleşim yüzeyleri bütün mü?', recommendation: 'Kırık yüzeyleri onarın ve temizlenebilirliği sağlayın.' },
  { code: 'Y03', category: riskCategories[1], question: 'Kanalizasyon ve atık su hatlarında geri giriş önlemleri yeterli mi?', recommendation: 'Kapak, sifon ve geri tepme önlemlerini doğrulayın.' },
  { code: 'Y04', category: riskCategories[1], question: 'Kapı altı ve yanlarında zararlı geçişine izin veren açıklık var mı?', recommendation: 'Kapı fırçası ve otomatik kapanma sistemlerini tamamlayın.' },
  { code: 'Y05', category: riskCategories[1], question: 'Asma tavan, kablo kanalı ve havalandırma boşlukları korunuyor mu?', recommendation: 'Servis geçişlerini kapatın ve erişilebilir kontrol noktaları oluşturun.' },
  { code: 'Y06', category: riskCategories[1], question: 'Dışa açılan kapı ve pencerelerde uçan zararlı önlemleri yeterli mi?', recommendation: 'Sineklik, hava perdesi veya PVC perde etkinliğini doğrulayın.' },
  { code: 'H01', category: riskCategories[2], question: 'Üretim ve depolama alanları programlı ve doğrulanmış şekilde temizleniyor mu?', recommendation: 'Kritik alanlar için vardiya sonu doğrulama kaydı uygulayın.' },
  { code: 'H02', category: riskCategories[2], question: 'İade, şahit numune ve karantina alanları tanımlı ve korunaklı mı?', recommendation: 'Alanları ayırın; ambalaj bütünlüğü ve temizlik kontrolü yapın.' },
  { code: 'H03', category: riskCategories[2], question: 'Raf ve palet araları temizlik ve kontrol için erişilebilir mi?', recommendation: 'Erişim koridorlarını açık tutun ve temizlik sıklığını kaydedin.' },
  { code: 'H04', category: riskCategories[2], question: 'Dış alanda işletme kaynaklı hijyen yetersizliği bulunuyor mu?', recommendation: 'Kaynağı ortadan kaldırın ve sorumlu–termin bilgisiyle faaliyet açın.' },
  { code: 'İ01', category: riskCategories[3], question: 'Raflar ve paletler duvardan kontrol yapılabilecek mesafede mi?', recommendation: 'Depolamayı duvar ve zeminden ayırın.' },
  { code: 'İ02', category: riskCategories[3], question: 'Üretim atığı, hasarlı ürün ve hurda kontrollü alanlarda mı tutuluyor?', recommendation: 'Riskli materyali üretim ve depodan fiziksel olarak ayırın.' },
  { code: 'İ03', category: riskCategories[3], question: 'Kullanılmayan ekipman düzenli, temiz ve denetlenebilir biçimde depolanıyor mu?', recommendation: 'Atıl ekipmanı kaldırın veya tanımlı alanda kayıtlı tutun.' },
  { code: 'İ04', category: riskCategories[3], question: 'Tüm ürün ve malzemeler zeminden yükseltilmiş mi?', recommendation: 'Paletli ve temizlenebilir depolama standardını uygulayın.' },
  { code: 'K01', category: riskCategories[4], question: 'İstasyon planı güncel, numaralı ve saha ile birebir uyumlu mu?', recommendation: 'Krokiyi revize edin; her noktayı benzersiz kodla eşleştirin.' },
  { code: 'K02', category: riskCategories[4], question: 'İstasyonlar sağlam, erişilebilir ve hedef zararlı için uygun konumda mı?', recommendation: 'Hasarlı ve ulaşılamayan noktalar için düzeltici faaliyet açın.' },
  { code: 'K03', category: riskCategories[4], question: 'Aktivite, yakalama, ürün sarfı ve ekipman değişimleri nokta bazında kayıtlı mı?', recommendation: 'Her istasyon sonucunu sayısal veri ve açıklamayla kaydedin.' },
  { code: 'K04', category: riskCategories[4], question: 'Bulgular, öneriler ve kapanış kanıtları izlenebilir mi?', recommendation: 'Fotoğraf, imza ve faaliyet kapanışını ilgili iş emrine bağlayın.' },
];
