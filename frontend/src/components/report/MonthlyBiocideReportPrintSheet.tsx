import { useEffect, useState, useMemo } from 'react';
import type { ServiceReportRecord } from '../../services/serviceReportApi';
import type { StationActivationRecord } from '../../services/stationActivationApi';
import { getCompanyBranding, getCompanyLogoObjectUrl } from '../../services/brandingApi';
import { getStoredCompanyEk1Defaults, type CompanyEk1Defaults } from '../../services/companySettingsStorage';

export interface BiocideReportItem {
  productName: string;
  category: 'Biyosidal' | 'Sarf' | 'Diğer';
  licenseNumber: string;
  activeIngredient: string;
  applicationMethod: string;
  totalAmount: number;
  unit: string;
  applicationCount: number;
  customers: Set<string>;
  targetPests: Set<string>;
}

export interface CustomerConsumptionRow {
  customerName: string;
  branchName: string;
  workOrderNumber: string;
  scheduledAt: string;
  productName: string;
  amount: number;
  unit: string;
  targetPests: string;
  operatorName: string;
}

type Props = {
  accessToken: string;
  companyName: string;
  monthKey: string; // YYYY-MM
  reports: ServiceReportRecord[];
  activations: StationActivationRecord[];
  selectedCustomerId?: string;
  selectedBranchId?: string;
};

export default function MonthlyBiocideReportPrintSheet({
  accessToken,
  companyName,
  monthKey,
  reports,
  activations,
  selectedCustomerId,
  selectedBranchId,
}: Props) {
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [ek1Defaults, setEk1Defaults] = useState<CompanyEk1Defaults | null>(null);

  useEffect(() => {
    let disposed = false;
    let objectUrl: string | null = null;
    getCompanyBranding(accessToken)
      .then(async (branding) => {
        if (!branding.hasLogo) return;
        objectUrl = await getCompanyLogoObjectUrl(accessToken);
        if (!disposed) setCompanyLogoUrl(objectUrl);
      })
      .catch(() => undefined);

    const defaults = getStoredCompanyEk1Defaults(companyName);
    if (defaults) setEk1Defaults(defaults);

    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [accessToken, companyName]);

  // Date boundaries for the month
  const [yearStr, monthStr] = monthKey.split('-');
  const year = parseInt(yearStr, 10) || new Date().getFullYear();
  const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);

  const monthStartDate = new Date(Date.UTC(year, month - 1, 1));
  const monthEndDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const monthName = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(monthStartDate);
  const dateRangeStr = `${String(monthStartDate.getDate()).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year} - ${String(monthEndDate.getDate()).padStart(2, '0')}.${String(month).padStart(2, '0')}.${year}`;

  // Filter reports matching the month and customer/branch
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      const d = new Date(r.scheduledAt || r.updatedAt);
      if (d < monthStartDate || d > monthEndDate) return false;
      if (selectedCustomerId && r.customerId !== selectedCustomerId) return false;
      if (selectedBranchId && r.branchId !== selectedBranchId) return false;
      return true;
    });
  }, [reports, monthStartDate, monthEndDate, selectedCustomerId, selectedBranchId]);

  // Aggregate biocide and consumable items
  const { biocideItems, consumableItems, customerRows, totalSolidGrams, totalLiquidMl, totalConsumablePcs } = useMemo(() => {
    const biocideMap = new Map<string, BiocideReportItem>();
    const consumableMap = new Map<string, BiocideReportItem>();
    const rows: CustomerConsumptionRow[] = [];

    let solidGrams = 0;
    let liquidMl = 0;
    let consumablePcs = 0;

    for (const report of filteredReports) {
      for (const prod of report.products) {
        if (!prod.amountUsed || prod.amountUsed <= 0) continue;

        const isConsumable =
          prod.unit === 'Adet' ||
          prod.productName.toLowerCase().includes('plaka') ||
          prod.productName.toLowerCase().includes('levha') ||
          prod.productName.toLowerCase().includes('tuzak') ||
          prod.productName.toLowerCase().includes('kapan') ||
          prod.productName.toLowerCase().includes('monitör');

        const map = isConsumable ? consumableMap : biocideMap;
        const key = `${prod.productName.trim().toUpperCase()}|${prod.unit.toUpperCase()}`;

        const existing = map.get(key);
        if (existing) {
          existing.totalAmount += prod.amountUsed;
          existing.applicationCount += 1;
          existing.customers.add(report.customerName);
          if (report.targetPests) existing.targetPests.add(report.targetPests);
        } else {
          map.set(key, {
            productName: prod.productName.trim(),
            category: isConsumable ? 'Sarf' : 'Biyosidal',
            licenseNumber: prod.licenseNumber || '—',
            activeIngredient: prod.activeIngredient || '—',
            applicationMethod: prod.applicationMethod || (isConsumable ? 'İstasyon İçi' : 'Yemleme / Püskürtme'),
            totalAmount: prod.amountUsed,
            unit: prod.unit,
            applicationCount: 1,
            customers: new Set([report.customerName]),
            targetPests: new Set(report.targetPests ? [report.targetPests] : []),
          });
        }

        // Totals
        if (isConsumable) {
          consumablePcs += prod.amountUsed;
        } else if (prod.unit.toLowerCase().includes('gr') || prod.unit === 'Gram') {
          solidGrams += prod.amountUsed;
        } else if (prod.unit.toLowerCase().includes('kg') || prod.unit === 'Kilogram') {
          solidGrams += prod.amountUsed * 1000;
        } else if (prod.unit.toLowerCase().includes('ml') || prod.unit === 'Mililitre') {
          liquidMl += prod.amountUsed;
        } else if (prod.unit.toLowerCase().includes('lt') || prod.unit === 'Litre') {
          liquidMl += prod.amountUsed * 1000;
        }

        rows.push({
          customerName: report.customerName,
          branchName: report.branchName,
          workOrderNumber: report.workOrderNumber,
          scheduledAt: report.scheduledAt,
          productName: prod.productName,
          amount: prod.amountUsed,
          unit: prod.unit,
          targetPests: report.targetPests || '—',
          operatorName: report.operatorName || '—',
        });
      }
    }

    return {
      biocideItems: Array.from(biocideMap.values()).sort((a, b) => b.totalAmount - a.totalAmount),
      consumableItems: Array.from(consumableMap.values()).sort((a, b) => b.totalAmount - a.totalAmount),
      customerRows: rows.sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()),
      totalSolidGrams: solidGrams,
      totalLiquidMl: liquidMl,
      totalConsumablePcs: consumablePcs,
    };
  }, [filteredReports]);

  const firmName = ek1Defaults?.firmName || companyName;
  const responsibleManager = ek1Defaults?.responsibleManager || 'Mesul Müdür';
  const permissionNumber = ek1Defaults?.permissionNumber || '—';

  return (
    <article className="official-report-sheet biocide-monthly-report-sheet">
      {/* Header */}
      <header>
        <div className={`official-report-brand ${companyLogoUrl ? 'has-logo' : 'no-logo'}`}>
          {companyLogoUrl && <img src={companyLogoUrl} alt={`${firmName} logosu`} />}
          <div>
            <strong>{firmName}</strong>
            <span>Zararlı Mücadelesi ve Biyosidal Uygulama Hizmetleri</span>
          </div>
        </div>
        <div>
          <h1>AYLIK BİYOSİDAL ÜRÜN VE SARF TÜKETİM RAPORU</h1>
          <p>T.C. Sağlık Bakanlığı Biyosidal İcmal & Denetim Formu</p>
        </div>
        <div className="official-report-number">
          <span>Rapor Dönemi</span>
          <strong>{monthName.toUpperCase()}</strong>
          <small>{filteredReports.length} UYGULAMA</small>
        </div>
      </header>

      {/* Meta Bar */}
      <section className="official-report-meta">
        <div>
          <span>Uygulayıcı Firma</span>
          <strong>{firmName}</strong>
        </div>
        <div>
          <span>İzin Belge No</span>
          <strong>{permissionNumber}</strong>
        </div>
        <div>
          <span>Mesul Müdür</span>
          <strong>{responsibleManager}</strong>
        </div>
        <div>
          <span>Tarih Aralığı</span>
          <strong>{dateRangeStr}</strong>
        </div>
      </section>

      {/* Summary KPI Grid */}
      <section className="official-report-section">
        <h2>1. Dönem Tüketim ve Faaliyet Özeti</h2>
        <div className="biocide-kpi-grid">
          <div className="biocide-kpi-card">
            <span>Katı / Yem Biyosidal</span>
            <strong>{totalSolidGrams >= 1000 ? `${(totalSolidGrams / 1000).toFixed(2)} kg` : `${totalSolidGrams} gr`}</strong>
          </div>
          <div className="biocide-kpi-card">
            <span>Sıvı / Jel İnsektisit</span>
            <strong>{totalLiquidMl >= 1000 ? `${(totalLiquidMl / 1000).toFixed(2)} lt` : `${totalLiquidMl} ml`}</strong>
          </div>
          <div className="biocide-kpi-card">
            <span>Sarf & Yapışkan Plaka</span>
            <strong>{totalConsumablePcs} Adet</strong>
          </div>
          <div className="biocide-kpi-card">
            <span>Toplam Saha Servisi</span>
            <strong>{filteredReports.length} İş Emri</strong>
          </div>
        </div>
      </section>

      {/* Section 2: Biocidal Products Table */}
      <section className="official-report-section">
        <h2>2. Kullanılan Biyosidal Ürünler İcmali</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: '6%', textAlign: 'center' }}>No</th>
                <th style={{ width: '26%' }}>Biyosidal Ürün Ticari Adı</th>
                <th style={{ width: '14%' }}>Ruhsat No</th>
                <th style={{ width: '16%' }}>Aktif Madde</th>
                <th style={{ width: '14%' }}>Uygulama Yöntemi</th>
                <th style={{ width: '14%' }}>Aylık Tüketim</th>
                <th style={{ width: '10%', textAlign: 'center' }}>İş Emri</th>
              </tr>
            </thead>
            <tbody>
              {biocideItems.length ? (
                biocideItems.map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ textAlign: 'center' }}><strong>{idx + 1}</strong></td>
                    <td><strong>{item.productName}</strong></td>
                    <td>{item.licenseNumber}</td>
                    <td>{item.activeIngredient}</td>
                    <td>{item.applicationMethod}</td>
                    <td><strong>{item.totalAmount} {item.unit}</strong></td>
                    <td style={{ textAlign: 'center' }}>{item.applicationCount}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '12px', color: '#64748b' }}>
                    Bu dönemde kayıtlı biyosidal ürün tüketimi bulunmamaktadır.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3: Consumables Table */}
      <section className="official-report-section">
        <h2>3. Kullanılan Sarf Malzemeleri & İstasyon Ekipmanları</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: '6%', textAlign: 'center' }}>No</th>
                <th style={{ width: '30%' }}>Sarf Malzemesi / Ekipman Adı</th>
                <th style={{ width: '20%' }}>Kullanım Alanı</th>
                <th style={{ width: '20%' }}>Toplam Miktar</th>
                <th style={{ width: '14%' }}>Müşteri Sayısı</th>
                <th style={{ width: '10%', textAlign: 'center' }}>İş Emri</th>
              </tr>
            </thead>
            <tbody>
              {consumableItems.length ? (
                consumableItems.map((item, idx) => (
                  <tr key={idx}>
                    <td style={{ textAlign: 'center' }}><strong>{idx + 1}</strong></td>
                    <td><strong>{item.productName}</strong></td>
                    <td>{item.applicationMethod}</td>
                    <td><strong>{item.totalAmount} {item.unit}</strong></td>
                    <td>{item.customers.size} Müşteri</td>
                    <td style={{ textAlign: 'center' }}>{item.applicationCount}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '12px', color: '#64748b' }}>
                    Bu dönemde kayıtlı sarf malzemesi tüketimi bulunmamaktadır.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 4: Customer Distribution */}
      {customerRows.length > 0 && (
        <section className="official-report-section">
          <h2>4. Müşteri ve İş Emri Bazlı Tüketim Dağılımı (İlk 15 Kayıt)</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '12%' }}>Tarih</th>
                  <th style={{ width: '24%' }}>Müşteri / Şube</th>
                  <th style={{ width: '14%' }}>İş Emri</th>
                  <th style={{ width: '20%' }}>Kullanılan Ürün / Sarf</th>
                  <th style={{ width: '12%' }}>Miktar</th>
                  <th style={{ width: '18%' }}>Hedef Zararlı</th>
                </tr>
              </thead>
              <tbody>
                {customerRows.slice(0, 15).map((row, idx) => (
                  <tr key={idx}>
                    <td>{formatDate(row.scheduledAt)}</td>
                    <td><strong>{row.customerName}</strong><br /><small style={{ color: '#64748b' }}>{row.branchName}</small></td>
                    <td><span style={{ fontSize: '8px', color: '#0369a1', fontWeight: 700 }}>{row.workOrderNumber}</span></td>
                    <td><strong>{row.productName}</strong></td>
                    <td><strong>{row.amount} {row.unit}</strong></td>
                    <td><small style={{ fontSize: '8px' }}>{row.targetPests}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {customerRows.length > 15 && (
            <p style={{ fontSize: '8px', color: '#64748b', margin: '4px 0 0 0', textAlign: 'right' }}>
              * Toplam {customerRows.length} tüketim kaydı bulunmaktadır. Tüm liste Excel dökümünde yer almaktadır.
            </p>
          )}
        </section>
      )}

      {/* Signatures */}
      <section className="official-signatures">
        <div>
          <span>Mesul Müdür / Şirket Yetkilisi</span>
          <div className="official-signature-box">
            Kaşe & İmza
          </div>
          <strong>{responsibleManager}</strong>
        </div>
        <div>
          <span>Ekip Sorumlusu / Operasyon Yöneticisi</span>
          <div className="official-signature-box">
            İmza
          </div>
          <strong>{ek1Defaults?.teamManager || 'Operasyon Sorumlusu'}</strong>
        </div>
      </section>

      {/* Footer */}
      <footer>
        <strong>Ulusal Zehir Danışma Merkezi: 114 · Acil Çağrı: 112</strong>
        <span>
          Bu belge T.C. Sağlık Bakanlığı Biyosidal Ürünlerin Kullanım Usul ve Esasları Yönetmeliği uyarınca dijital sistem kayıtlarından üretilmiştir.
        </span>
      </footer>
    </article>
  );
}

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  try {
    const str = String(value).trim();
    if (!str) return '—';
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  } catch {
    return String(value);
  }
};
