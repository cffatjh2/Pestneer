import { useState, useRef, useEffect } from 'react';
import { X, ShieldAlert, Download, Upload, CheckCircle2, RefreshCw } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { uploadQualityDocument } from '../../services/qualityApi';
import { getCompanyBranding, getCompanyLogoObjectUrl } from '../../services/brandingApi';
import type { CustomerRecord } from '../../services/workOrderApi';
import type { EmployeeRecord } from '../../services/employeeApi';
import SignaturePad from './SignaturePad';

export default function SalesFormModal({
  customers,
  employees,
  accessToken,
  onClose,
  onComplete
}: {
  customers: CustomerRecord[];
  employees: EmployeeRecord[];
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
  const [sellingTechnicianIds, setSellingTechnicianIds] = useState<string[]>([]);
  const [productType, setProductType] = useState('');
  const [productQuantity, setProductQuantity] = useState('1');
  const [authorizedName, setAuthorizedName] = useState('');
  const [signatureData, setSignatureData] = useState<string | null>(null);

  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const printRef = useRef<HTMLDivElement>(null);

  const toggleTechnician = (id: string) => {
    setSellingTechnicianIds((prev) => 
      prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]
    );
  };

  const getSellingTechniciansText = () => {
    return sellingTechnicianIds
      .map(id => employees.find(e => e.id === id)?.name)
      .filter(Boolean)
      .join(', ');
  };

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
    return `Satis_Formu_${safeName}.pdf`;
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
        category: 'SalesForms',
        title: `Satış Formu - ${customer?.legalName ?? 'Firma'}`,
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
      <div className="modal commercial-modal" style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">TİCARİ YÖNETİM</p>
            <h2>Satış Formu</h2>
            <p>Satışı yapılan ürünleri belgelendirin ve yetkili imzası alın.</p>
          </div>
          <button className="icon-button" onClick={onClose}><X /></button>
        </div>

        {error && <div className="modal-form-error" style={{ margin: '0 24px' }}>{error}</div>}

        {!pdfBlob ? (
          <div style={{ padding: '0 24px 24px', display: 'grid', gap: '16px' }}>
            <div className="form-grid">
              <label>Firma Adı
                <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setBranchId(''); }} required>
                  {customers.map((item) => <option value={item.id} key={item.id}>{item.legalName}</option>)}
                </select>
              </label>
              <label>Şube Adı
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">Merkez / Genel</option>
                  {customer?.branches.filter((item) => item.isActive).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                </select>
              </label>

              <label className="form-field-wide">Satış Yapan Teknisyenler
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                  {employees.filter(e => e.isActive).map(emp => (
                    <label key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: sellingTechnicianIds.includes(emp.id) ? '#dbeafe' : '#f1f5f9', padding: '6px 12px', borderRadius: '16px', cursor: 'pointer', border: '1px solid transparent', borderColor: sellingTechnicianIds.includes(emp.id) ? '#bfdbfe' : '#e2e8f0' }}>
                      <input type="checkbox" checked={sellingTechnicianIds.includes(emp.id)} onChange={() => toggleTechnician(emp.id)} style={{ display: 'none' }} />
                      <span style={{ fontSize: '14px', color: sellingTechnicianIds.includes(emp.id) ? '#1e40af' : '#475569' }}>{emp.name}</span>
                    </label>
                  ))}
                </div>
              </label>

              <label>Ürün Türü<input value={productType} onChange={e => setProductType(e.target.value)} placeholder="Örn: EFT CİHAZI TAVAN TİPİ" /></label>
              <label>Ürün Adet<input value={productQuantity} onChange={e => setProductQuantity(e.target.value)} type="number" min="1" /></label>
              
              <label className="form-field-wide">Yetkili İsim Soyisim<input value={authorizedName} onChange={e => setAuthorizedName(e.target.value)} /></label>

              <label className="form-field-wide">İmza
                {signatureData ? (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px', textAlign: 'center', background: '#f8fafc', position: 'relative' }}>
                    <img src={signatureData} alt="İmza" style={{ maxHeight: '100px', objectFit: 'contain' }} />
                    <button type="button" onClick={() => setSignatureData(null)} style={{ position: 'absolute', top: '8px', right: '8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px', cursor: 'pointer' }}><X size={14}/></button>
                  </div>
                ) : (
                  <button type="button" className="secondary-button" onClick={() => setShowSignaturePad(true)} style={{ width: '100%', justifyContent: 'center', padding: '24px', borderStyle: 'dashed' }}>
                    + İmza Ekle
                  </button>
                )}
              </label>
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={onClose}>Vazgeç</button>
              <button type="button" className="primary-button" onClick={generatePdf} disabled={generatingPdf || !signatureData}>
                {generatingPdf ? 'Oluşturuluyor...' : 'Kaydet ve İleri'}
              </button>
            </div>
            {!signatureData && <div className="modal-form-error" style={{ textAlign: 'center', marginTop: '-8px' }}>PDF oluşturmak için imza gereklidir.</div>}
          </div>
        ) : (
          <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '24px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <CheckCircle2 size={32} color="#10b981" />
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>Form Başarıyla Oluşturuldu</h3>
                  <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#64748b' }}>Yönetici belgelerine kaydedebilirsiniz.</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="secondary-button" onClick={handlePreview}>
                  <ShieldAlert size={16} /> Önizle
                </button>
                <button type="button" className="secondary-button" onClick={handleDownload}>
                  <Download size={16} /> İndir
                </button>
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => { setPdfBlob(null); setPdfPreviewUrl(null); }} disabled={saving}>Geri Dön / Düzenle</button>
              <button type="button" className="primary-button" onClick={handleUpload} disabled={saving}>
                {saving ? <><RefreshCw className="spin-icon" size={16} /> Yükleniyor...</> : <><Upload size={16} /> Sistemi Kaydet</>}
              </button>
            </div>
          </div>
        )}

        {/* Signature Pad Overlap */}
        {showSignaturePad && (
          <SignaturePad
            onClose={() => setShowSignaturePad(false)}
            onSave={(img) => {
              setSignatureData(img);
              setShowSignaturePad(false);
            }}
          />
        )}

        {/* Hidden PDF Template for html2canvas */}
        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <div ref={printRef} style={{ width: '800px', padding: '40px', background: '#fff', color: '#000', fontFamily: 'sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '4px solid #0f766e', paddingBottom: '20px', marginBottom: '30px' }}>
              {companyLogoUrl ? (
                <img src={companyLogoUrl} alt="Logo" style={{ maxHeight: '70px', maxWidth: '250px', objectFit: 'contain' }} />
              ) : (
                <h1 style={{ margin: 0, fontSize: '28px', color: '#0f766e', fontWeight: '900' }}>{companyName}</h1>
              )}
              <div style={{ textAlign: 'right' }}>
                <h2 style={{ margin: 0, fontSize: '24px', color: '#0f766e', letterSpacing: '1px' }}>SATIŞI YAPILAN ÜRÜNLER</h2>
                <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#475569' }}>Tarih: {new Date().toLocaleDateString('tr-TR')} {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute:'2-digit' })}</p>
              </div>
            </div>

            <div style={{ background: '#f0fdfa', borderRadius: '12px', padding: '30px', border: '1px solid #ccfbf1' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 15px', fontSize: '16px' }}>
                <tbody>
                  <tr>
                    <td style={{ width: '35%', color: '#0f766e', fontWeight: 'bold', textTransform: 'uppercase' }}>FİRMA ADI:</td>
                    <td style={{ width: '65%', color: '#1e293b', fontWeight: '500', borderBottom: '1px solid #cbd5e1' }}>{customer?.legalName}</td>
                  </tr>
                  <tr>
                    <td style={{ color: '#0f766e', fontWeight: 'bold', textTransform: 'uppercase' }}>ŞUBE ADI:</td>
                    <td style={{ color: '#1e293b', fontWeight: '500', borderBottom: '1px solid #cbd5e1' }}>{branchId ? customer?.branches.find(b => b.id === branchId)?.name : 'Genel Merkez'}</td>
                  </tr>
                  <tr>
                    <td style={{ color: '#0f766e', fontWeight: 'bold', textTransform: 'uppercase' }}>SATIŞ YAPAN TEKNİSYENLER:</td>
                    <td style={{ color: '#1e293b', fontWeight: '500', borderBottom: '1px solid #cbd5e1' }}>{getSellingTechniciansText() || '-'}</td>
                  </tr>
                  <tr>
                    <td style={{ color: '#0f766e', fontWeight: 'bold', textTransform: 'uppercase' }}>ÜRÜN TÜRÜ:</td>
                    <td style={{ color: '#1e293b', fontWeight: '500', borderBottom: '1px solid #cbd5e1' }}>{productType || '-'}</td>
                  </tr>
                  <tr>
                    <td style={{ color: '#0f766e', fontWeight: 'bold', textTransform: 'uppercase' }}>ÜRÜN ADET:</td>
                    <td style={{ color: '#1e293b', fontWeight: '500', borderBottom: '1px solid #cbd5e1' }}>{productQuantity || '-'}</td>
                  </tr>
                  <tr>
                    <td style={{ color: '#0f766e', fontWeight: 'bold', textTransform: 'uppercase' }}>YETKİLİ İSİM SOYİSİM:</td>
                    <td style={{ color: '#1e293b', fontWeight: '500', borderBottom: '1px solid #cbd5e1' }}>{authorizedName || '-'}</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ marginTop: '50px', display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ width: '300px', textAlign: 'center' }}>
                  <div style={{ color: '#0f766e', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '10px' }}>MÜŞTERİ İMZA</div>
                  <div style={{ height: '150px', background: '#fff', border: '2px dashed #94a3b8', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {signatureData ? (
                      <img src={signatureData} alt="İmza" style={{ maxHeight: '130px', maxWidth: '280px', objectFit: 'contain' }} />
                    ) : (
                      <span style={{ color: '#cbd5e1' }}>İmza Yok</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ marginTop: '50px', textAlign: 'center', fontSize: '13px', color: '#94a3b8' }}>
              Bu belge sistem üzerinden dijital imza ile kayıt altına alınmıştır.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
