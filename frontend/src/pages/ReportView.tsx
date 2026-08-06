import { useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Download, Printer, Share2 } from 'lucide-react';
import { useReactToPrint } from 'react-to-print';
import PrintSheet from '../components/report/PrintSheet';
import SignaturePad from '../components/modals/SignaturePad';
import type { ServiceReport } from '../types';

interface ReportViewProps {
  report: ServiceReport;
  onBack: () => void;
}

export default function ReportView({ report, onBack }: ReportViewProps) {
  const componentRef = useRef<HTMLDivElement>(null);

  // React-to-print hook for triggering print dialog
  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: `EK1_Rapor_${report.reportId}`,
  });

  const [activeStep, setActiveStep] = useState(3);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [operatorSignature, setOperatorSignature] = useState<string | null>(report.operatorSignature ?? null);

  return (
    <div className="report-page">
      <div className="page-heading" style={{ margin: '32px 32px 24px', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="icon-button" onClick={onBack} aria-label="Geri dön">
            <ArrowLeft size={20} />
          </button>
          <div>
            <p className="eyebrow">İŞ EMRİ DETAYI</p>
            <h1 style={{ fontSize: '24px', margin: 0 }}>{report.reportId} nolu İş Emri</h1>
          </div>
        </div>

        <div className="heading-actions">
          <button className="secondary-button" onClick={handlePrint}>
            <Printer size={17} />
            Yazdır
          </button>
          <button className="secondary-button">
            <Share2 size={17} />
            Paylaş
          </button>
          <button className="primary-button" onClick={handlePrint}>
            <Download size={19} />
            PDF Olarak İndir
          </button>
        </div>
      </div>

      <div className="report-workspace" style={{ padding: '0 32px 32px' }}>

        {/* Sol Menü / Durum */}
        <aside className="report-sidebar">
          <div className="report-case">
            <span className="case-label">MÜŞTERİ BİLGİSİ</span>
            <strong>{report.applicationAddress.split(' - ')[0]}</strong>
            <p>{report.applicationAddress.split(' - ')[1] || ''}</p>
            <div style={{ marginTop: '16px' }}>
              <span className="case-label">OPERATÖR</span>
              <p style={{ marginTop: '4px', fontWeight: 600, color: '#1e40af' }}>{report.operator}</p>
            </div>
          </div>

          <div className="report-steps">
            <div className="report-step done">
              <i><CheckCircle2 size={14} /></i>
              <div>
                <strong>İş emri oluşturuldu</strong>
                <small>06 Ağu 2026, 09:12</small>
              </div>
            </div>
            <div className="report-step done">
              <i><CheckCircle2 size={14} /></i>
              <div>
                <strong>Sahaya varıldı</strong>
                <small>06 Ağu 2026, 14:47</small>
              </div>
            </div>
            <div className="report-step active">
              <i>3</i>
              <div>
                <strong>Form ve İmza Onayı</strong>
                <small>Bekleniyor</small>
              </div>
            </div>
          </div>

          <div className="signature-cta">
            <strong>Operatör İmzası Eksik</strong>
            <span>Raporun tamamlanabilmesi için uygulama yapan personelin imzası gerekmektedir.</span>
            <button onClick={() => setShowSignaturePad(true)}>
              İmzayı at <ArrowLeft style={{ transform: 'rotate(135deg)', width: 14, marginLeft: 2 }} />
            </button>
          </div>
        </aside>

        {/* Sağ Alan / Rapor Önizleme */}
        <main className="report-canvas">
          <div className="report-canvas-toolbar">
            <span>
              <CheckCircle2 size={16} color="#10b981" />
              Sistem tarafından otomatik dolduruldu
            </span>
            <div className="zoom-label">A4 Belge Önizlemesi (EK-1)</div>
          </div>

          <div style={{ padding: '32px 0 64px', background: '#e2e8f0', minHeight: '800px', display: 'flex', justifyContent: 'center' }}>
            {/* The PrintSheet is wrapped in a ref so it can be targeted by react-to-print */}
            <div ref={componentRef} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
              <PrintSheet
                report={report}
                managerSignature={report.managerSignature}
                operatorSignature={operatorSignature}
              />
            </div>
          </div>
        </main>
      </div>

      {showSignaturePad && (
        <SignaturePad
          onClose={() => setShowSignaturePad(false)}
          onSave={(img) => {
            setOperatorSignature(img);
            setShowSignaturePad(false);
          }}
        />
      )}
    </div>
  );
}
