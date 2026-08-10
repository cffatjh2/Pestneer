import { useState, useRef, useEffect } from 'react';
import { X, ShieldAlert, Download, Upload, CheckCircle2, RefreshCw } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { uploadQualityDocument } from '../../services/qualityApi';
import { getCompanyBranding, getCompanyLogoObjectUrl } from '../../services/brandingApi';
import type { CustomerRecord } from '../../services/workOrderApi';

export default function FieldInspectionModal({
  customers,
  accessToken,
  onClose,
  onComplete
}: {
  customers: CustomerRecord[];
  accessToken: string;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [companyName, setCompanyName] = useState('Pestneer');
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    getCompanyBranding(accessToken)
      .then(async (branding) => {
        setCompanyName(branding.companyName);
        if (branding.hasLogo) {
          const url = await getCompanyLogoObjectUrl(accessToken);
          setCompanyLogoUrl(url);
        }
      })
      .catch(console.error);
  }, [accessToken]);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [branchId, setBranchId] = useState('');
  const customer = customers.find((c) => c.id === customerId);

  // Form State
  const [outdoorArea, setOutdoorArea] = useState('');
  const [indoorArea, setIndoorArea] = useState('');
  const [baitStationCount, setBaitStationCount] = useState('');
  const [liveTrapCount, setLiveTrapCount] = useState('');
  const [flyCatchers, setFlyCatchers] = useState('');
  const [averageServiceTime, setAverageServiceTime] = useState('');
  const [frequentProblems, setFrequentProblems] = useState('');
  const [desiredServiceCount, setDesiredServiceCount] = useState('');
  const [desiredServiceDays, setDesiredServiceDays] = useState('');
  const [extraServices, setExtraServices] = useState('');
  const [requestedTechnicianCount, setRequestedTechnicianCount] = useState('');
  const [branchCount, setBranchCount] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [signatureName, setSignatureName] = useState('');

  const [saving, setSaving] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const printRef = useRef<HTMLDivElement>(null);

  const generatePdf = async () => {
    if (!printRef.current) return;
    setGeneratingPdf(true);
    setError(null);
    try {
      const canvas = await html2canvas(printRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      
      const blob = pdf.output('blob');
      setPdfBlob(blob);
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
    } catch (err) {
      setError('PDF oluşturulurken bir hata meydana geldi.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  const getFileName = () => {
    const safeName = (customer?.legalName ?? 'Firma').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const branchName = branchId ? customer?.branches.find(b => b.id === branchId)?.name : 'Merkez';
    const safeBranch = (branchName ?? '').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    return `Saha_Inceleme_${safeName}_${safeBranch}.pdf`;
  };

  const handleDownload = () => {
    if (!pdfPreviewUrl) return;
    const link = document.createElement('a');
    link.href = pdfPreviewUrl;
    link.download = getFileName();
    link.click();
  };

  const handlePreview = () => {
    if (!pdfPreviewUrl) return;
    window.open(pdfPreviewUrl, '_blank', 'noopener,noreferrer');
  };

  const handleUpload = async () => {
    if (!pdfBlob) return;
    setSaving(true);
    setError(null);
    try {
      const file = new File([pdfBlob], getFileName(), { type: 'application/pdf' });
      await uploadQualityDocument(accessToken, {
        file,
        category: 'Saha İnceleme',
        title: `Saha İnceleme - ${customer?.legalName ?? 'Firma'}`,
        customerId,
        branchId: branchId || undefined
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF yüklenemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-layer" style={{ zIndex: 1000, overflowY: 'auto', padding: '20px 0' }}>
      <div className="modal commercial-modal" style={{ maxWidth: '800px' }}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">TEKLİF ÖNCESİ</p>
            <h2>Saha İnceleme Formu</h2>
            <p>Sahada tespit edilen durumları girin, PDF oluşturun ve sisteme kaydedin.</p>
          </div>
          <button className="icon-button" onClick={onClose}><X /></button>
        </div>

        {error && <div className="modal-form-error" style={{ margin: '0 24px' }}>{error}</div>}

        {!pdfBlob ? (
          <div style={{ padding: '0 24px 24px', display: 'grid', gap: '16px' }}>
            <div className="form-grid">
              <label>Müşteri
                <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setBranchId(''); }} required>
                  {customers.map((item) => <option value={item.id} key={item.id}>{item.legalName}</option>)}
                </select>
              </label>
              <label>Şube
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">Merkez / Genel</option>
                  {customer?.branches.filter((item) => item.isActive).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                </select>
              </label>
              
              <label>Açık alan m² bilgisi<input value={outdoorArea} onChange={e => setOutdoorArea(e.target.value)} /></label>
              <label>Kapalı alan m² bilgisi<input value={indoorArea} onChange={e => setIndoorArea(e.target.value)} /></label>
              
              <label>Kaç adet yemli istasyon kullanılır?<input value={baitStationCount} onChange={e => setBaitStationCount(e.target.value)} type="number" min="0" /></label>
              <label>Kaç adet canlı yakalama kullanılır?<input value={liveTrapCount} onChange={e => setLiveTrapCount(e.target.value)} type="number" min="0" /></label>
              
              <label>Sinek cihazları var mı? (Varsa türleri)<input value={flyCatchers} onChange={e => setFlyCatchers(e.target.value)} /></label>
              <label>Serviste geçirilecek ortalama zaman<input value={averageServiceTime} onChange={e => setAverageServiceTime(e.target.value)} placeholder="Örn: 2 saat" /></label>
              
              <label className="form-field-wide">İşletmede sık yaşanan problemler neler?<textarea value={frequentProblems} onChange={e => setFrequentProblems(e.target.value)} rows={2} /></label>
              
              <label>Yılda almak istediği hizmet sayısı<input value={desiredServiceCount} onChange={e => setDesiredServiceCount(e.target.value)} type="number" min="0" /></label>
              <label>Hangi günler hizmet almak ister?<input value={desiredServiceDays} onChange={e => setDesiredServiceDays(e.target.value)} /></label>
              
              <label className="form-field-wide">Almak istediği ekstra hizmetler var mı?<textarea value={extraServices} onChange={e => setExtraServices(e.target.value)} rows={2} /></label>
              
              <label>Talep ettiği teknisyen sayısı<input value={requestedTechnicianCount} onChange={e => setRequestedTechnicianCount(e.target.value)} type="number" min="0" /></label>
              <label>Şube veya bina sayısı<input value={branchCount} onChange={e => setBranchCount(e.target.value)} type="number" min="0" /></label>
              
              <label>İlgili Kişi İsim<input value={contactName} onChange={e => setContactName(e.target.value)} /></label>
              <label>İlgili Kişi Telefon<input value={contactPhone} onChange={e => setContactPhone(e.target.value)} /></label>
              <label>İlgili Kişi Mail<input value={contactEmail} onChange={e => setContactEmail(e.target.value)} /></label>
              <label>Onaylayan (İmza Yerine)<input value={signatureName} onChange={e => setSignatureName(e.target.value)} placeholder="İsim Soyisim" /></label>
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={onClose}>İptal</button>
              <button type="button" className="primary-button" onClick={generatePdf} disabled={generatingPdf}>
                {generatingPdf ? 'Oluşturuluyor...' : 'PDF Oluştur'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '24px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <CheckCircle2 size={32} color="#10b981" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>PDF Başarıyla Oluşturuldu</h3>
                  <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#64748b' }}>Form belgesi hazır, yönetici belgelerine kaydedebilirsiniz.</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="secondary-button" onClick={handlePreview}>
                  <ShieldAlert size={16} /> İncele
                </button>
                <button type="button" className="secondary-button" onClick={handleDownload}>
                  <Download size={16} /> İndir
                </button>
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => { setPdfBlob(null); setPdfPreviewUrl(null); }} disabled={saving}>Geri Dön / Düzenle</button>
              <button type="button" className="primary-button" onClick={handleUpload} disabled={saving}>
                {saving ? <><RefreshCw className="spin-icon" size={16} /> Yükleniyor...</> : <><Upload size={16} /> Kaydet (Yönetici Belgeleri)</>}
              </button>
            </div>
          </div>
        )}

        {/* Hidden PDF Template for html2canvas */}
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <div ref={printRef} style={{ width: '800px', padding: '40px', background: '#fff', color: '#000', fontFamily: 'sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #1e293b', paddingBottom: '20px', marginBottom: '30px' }}>
              {companyLogoUrl ? (
                <img src={companyLogoUrl} alt="Logo" style={{ maxHeight: '60px', maxWidth: '200px', objectFit: 'contain' }} />
              ) : (
                <h1 style={{ margin: 0, fontSize: '24px', color: '#1e293b' }}>{companyName}</h1>
              )}
              <div style={{ textAlign: 'right' }}>
                <h2 style={{ margin: 0, fontSize: '20px', color: '#1e293b' }}>TEKLİF ÖNCESİ SAHA İNCELEME</h2>
                <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#64748b' }}>Tarih: {new Date().toLocaleDateString('tr-TR')}</p>
              </div>
            </div>

            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '5px' }}>MÜŞTERİ BİLGİLERİ</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '14px' }}>
                <div><strong>Firma Adı:</strong> {customer?.legalName}</div>
                <div><strong>Şube:</strong> {branchId ? customer?.branches.find(b => b.id === branchId)?.name : 'Merkez / Genel'}</div>
              </div>
            </div>

            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '5px' }}>SAHA İNCELEME DETAYLARI</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <tbody>
                  {[
                    ['Açık alan m² bilgisi', outdoorArea],
                    ['Kapalı alan m² bilgisi', indoorArea],
                    ['Kaç adet yemli istasyon kullanılır?', baitStationCount],
                    ['Kaç adet canlı yakalama kullanılır?', liveTrapCount],
                    ['Sinek cihazları var mı? Varsa türleri', flyCatchers],
                    ['Serviste geçirilecek ortalama zaman', averageServiceTime],
                    ['İşletmede sık yaşanan problemler neler?', frequentProblems],
                    ['Yılda almak istediği hizmet sayısı', desiredServiceCount],
                    ['Hangi günler hizmet almak ister?', desiredServiceDays],
                    ['Almak istediği ekstra hizmetler var mı?', extraServices],
                    ['Talep ettiği teknisyen sayısı', requestedTechnicianCount],
                    ['Şube veya bina sayısı', branchCount],
                  ].map(([label, value], i) => (
                    <tr key={i}>
                      <td style={{ padding: '8px', border: '1px solid #cbd5e1', fontWeight: 'bold', width: '40%', background: '#f8fafc' }}>{label}</td>
                      <td style={{ padding: '8px', border: '1px solid #cbd5e1', width: '60%' }}>{value || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ marginBottom: '30px' }}>
              <h3 style={{ margin: '0 0 10px', fontSize: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '5px' }}>İLGİLİ KİŞİ BİLGİLERİ</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1', fontWeight: 'bold', width: '40%', background: '#f8fafc' }}>İsim</td>
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1', width: '60%' }}>{contactName || '-'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1', fontWeight: 'bold', width: '40%', background: '#f8fafc' }}>Telefon</td>
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1', width: '60%' }}>{contactPhone || '-'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1', fontWeight: 'bold', width: '40%', background: '#f8fafc' }}>Mail</td>
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1', width: '60%' }}>{contactEmail || '-'}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1', fontWeight: 'bold', width: '40%', background: '#f8fafc' }}>Onay / İmza</td>
                    <td style={{ padding: '8px', border: '1px solid #cbd5e1', width: '60%', fontStyle: 'italic' }}>{signatureName || '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div style={{ marginTop: '50px', textAlign: 'center', fontSize: '12px', color: '#94a3b8' }}>
              Bu belge sistem üzerinden dijital olarak oluşturulmuştur.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
