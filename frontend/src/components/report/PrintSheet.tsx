import type { ServiceReport } from '../../types';

interface PrintSheetProps {
  report: ServiceReport;
  managerSignature?: string | null;
  operatorSignature?: string | null;
}

export default function PrintSheet({
  report,
  managerSignature,
  operatorSignature,
}: PrintSheetProps) {
  return (
    <article className="print-sheet">
      {/* ── Başlık ─────────────────────────────────────────────── */}
      <header className="form-header">
        <div className="ministry">
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/d/d7/Ministry_of_Health_%28Turkey%29_Logo.svg"
            alt="T.C. Sağlık Bakanlığı Logo"
            style={{ width: '40px', height: '40px', objectFit: 'contain' }}
          />
          <span>
            T.C. Sağlık Bakanlığı
            <br />
            <small>RG-4/7/2019-30821</small>
          </span>
        </div>

        <div className="form-title">
          <strong>
            EK-1 Biyosidal Ürün Uygulama İşlem
            <br />
            Formu - Service Form
          </strong>
        </div>

        <div className="firm-logo-area">
          <div className="firm-name">
            <strong>{report.firmName}</strong>
            <span>zararlı mücadelesi</span>
          </div>
        </div>
      </header>

      {/* ── İletişim ───────────────────────────────────────────── */}
      <div className="form-contact">
        <span>
          <strong>İletişim - Contact:</strong> {report.contactPhone}
        </span>
        <span>
          <strong>Tarih - Date:</strong> {report.date}
        </span>
      </div>

      {/* ── Bölüm 1: Uygulama Yapan Firma ─────────────────────── */}
      <section className="form-section">
        <h3>
          <span>●</span>
          Uygulama Yapana Ait Bilgiler - Information of the Pest Management Firm
        </h3>
        <FormRow
          label="Uygulamayı Yapan Firma Adı - Firm Name"
          value={report.firmName || '—'}
        />
        <FormRow
          label="Açık Adresi - Address"
          value={report.firmAddress || '—'}
        />
        <FormRow
          label="Mesul Müdür - Manager"
          value={report.responsibleManager || '—'}
        />
        <FormRow
          label="Uygulayıcı - Operator"
          value={report.operator}
        />
        <FormRow
          label="Müdürlük İzin Tarih ve Sayısı - Permission Number"
          value={report.permissionNumber || '—'}
        />
        <FormRow
          label="Ekip Sorumlusu - Team Manager"
          value={report.teamManager || '—'}
        />
      </section>

      {/* ── Bölüm 2: Uygulama Yapılan Yer ─────────────────────── */}
      <section className="form-section">
        <h3>
          <span>●</span>
          Uygulama Yapılan Yer Hakkında Bilgiler - Information of Firm
        </h3>
        <FormRow
          label="Uygulama Yapılan Yerin Açık Adresi - Address"
          value={report.applicationAddress}
        />
        <FormRow
          label="Uygulama Yapılan Hedef Zararlı Türü/Adı - Target Pest"
          value={report.targetPest}
        />
        <FormRow
          label="Uygulama Tarihi, Başlangıç ve Bitiş Saati - Application Date"
          value={`${report.applicationDate} ${report.applicationStartTime} - ${report.applicationEndTime}`}
        />
        <FormRow
          label="Mesken/İşyeri - Residence/Workplace"
          value={report.residenceType}
        />
        <FormRow
          label="Uygulama Yapılan Yerin Alanı - Area"
          value={report.area}
        />
        <FormRow
          label="Uygulama İş Türü - Work Type"
          value={report.workType}
        />
        <FormRow
          label="Kullanılan Sarf Malzemeler - Consumables"
          value={report.consumables}
        />
        <FormRow
          label="Alınan Güvenlik Önlemleri, Yapılan Öneri ve Uyarılar - Suggestions And Warnings"
          value={report.safetyMeasures}
        />
      </section>

      {/* ── Bölüm 3: Biyosidal Ürünler (çoklu) ────────────────── */}
      <section className="form-section">
        <h3>
          <span>●</span>
          Kullanılan Biyosidal Ürüne Ait Bilgiler - Biocidal Product
        </h3>

        {report.products.map((product, index) => (
          <div key={index}>
            {report.products.length > 1 && (
              <>
                {index > 0 && <hr className="product-separator" />}
                <div className="product-header">
                  <span>Ürün {index + 1}</span>
                  <span>{product.amountUsed}</span>
                </div>
              </>
            )}
            <FormRow
              label="Ürünün Ticari Adı, Ruhsat Tarih ve Sayısı - Detail of Biocidal Product"
              value={`${product.amountUsed} · ${product.tradeName} / ${product.licenseInfo}`}
            />
            <FormRow
              label="Ürünün Uygulama Şekli - Method of Application"
              value={`• ${product.applicationMethod}`}
            />
            <FormRow
              label="Ürünün Dilüsyon Oranı - Dilution Rate"
              value={`• ${product.dilutionRate}`}
            />
            <FormRow
              label="Ürünün Aktif Maddesi - Active Ingredient"
              value={`• ${product.activeIngredient}`}
            />
            <FormRow
              label="Ürünün Antidotu - Antidote"
              value={`• ${product.antidote}`}
            />
            <FormRow
              label="Ürünün Ambalajının Miktarı (kg/litre) - Packing Quantity"
              value={`• ${product.packingQuantity}`}
            />
          </div>
        ))}
      </section>

      {/* ── İmzalar ────────────────────────────────────────────── */}
      <div className="form-signatures">
        <SignatureField
          title={report.teamManager || '—'}
          subtitle="Ekip Sorumlusu - Manager"
          image={managerSignature}
        />
        <SignatureField
          title={report.operator}
          subtitle="Uygulama Yapılan Yerin Sorumlusu - Operator"
          image={operatorSignature}
        />
      </div>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="form-footer">
        <div className="form-footer-warning">
          Zehirlenme durumlarında Ulusal Zehir Danışma Merkezi (UZEM) 114 VE Acil
          Sağlık Hizmetleri 112 nolu telefonu arayın.
          <br />
          In case of poisoning, call the National Poison Information Center (UZEM)
          114 and Emergency Medical Services 112.
        </div>

        <div className="form-footer-verify">
          <div>
            Bu belgenin doğruluğu{' '}
            <strong>{report.verificationUrl}</strong> adresinden aşağıdaki
            kod ile veya mobil cihazlarınızın QR okuma özelliği ile yandaki
            karekod okutularak kontrol edilebilir.
            <br />
            <span className="verify-code">{report.verificationCode}</span>
          </div>
          <div className="qr-placeholder">
            <i /><i /><i /><i /><i /><i /><i /><i /><i />
          </div>
        </div>
      </footer>
    </article>
  );
}

/* ── Alt bileşenler ────────────────────────────────────────────── */
function FormRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="form-row">
      <strong>{label}</strong>
      <span>{value}</span>
    </div>
  );
}

function SignatureField({
  title,
  subtitle,
  image,
}: {
  title: string;
  subtitle: string;
  image?: string | null;
}) {
  return (
    <div className="form-signature">
      <div className="signature-image">
        {image ? (
          <img src={image} alt={`${title} imzası`} />
        ) : (
          <span>İmza</span>
        )}
      </div>
      <strong>{title}</strong>
      <small>{subtitle}</small>
    </div>
  );
}
