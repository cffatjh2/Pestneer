import { utils, writeFile } from 'xlsx';
import type { ServiceReportAnalytics, ServiceReportRecord } from '../services/serviceReportApi';

export function exportServiceReportExcel(report: ServiceReportRecord) {
  const summary = utils.aoa_to_sheet([
    ['PESTNEER SAHA HİZMET RAPORU'],
    ['Rapor No', report.reportNumber], ['İş Emri', report.workOrderNumber], ['Durum', report.status === 'Finalized' ? 'Onaylandı' : 'Taslak'],
    ['Müşteri', report.customerName], ['Şube', report.branchName], ['Adres', report.branchAddress], ['Uygulayıcı', report.operatorName],
    ['Uygulama Tarihi', formatDate(report.scheduledAt)], ['Hedef Zararlı', report.targetPests ?? ''], ['Uygulama Özeti', report.applicationSummary ?? ''],
    ['Bulgular', report.findings ?? ''], ['Düzeltici Faaliyet', report.correctiveActions ?? ''], ['Öneriler', report.recommendations ?? ''],
    ['Toplam İstasyon', report.totalStations], ['Aktivite Görülen', report.activeStations], ['Aktivite Oranı', report.activityRate / 100],
    ['Toplam Yakalanan', report.totalCaught], ['Risk Seviyesi', riskLabel(report.riskLevel)], ['Risk Puanı', report.riskScore], ['Doğrulama Kodu', report.verificationCode],
  ]);
  summary['!cols'] = [{ wch: 24 }, { wch: 78 }]; summary['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  const activityCell = summary['B17']; if (activityCell) activityCell.z = '0.0%';

  const stations = utils.json_to_sheet(report.stations.map((item) => ({
    'İstasyon No': item.deviceNumber, 'Alan': item.area, 'Cihaz Türü': deviceLabel(item.deviceType), 'Hedef Zararlı': item.targetPest ?? '',
    'Yakalanan Adet': item.caughtCount, 'Aktivite': item.hasActivity ? 'Var' : 'Yok', 'Plaka Değişimi': item.plateChanged ? 'Evet' : 'Hayır',
    'Cihaz Durumu': deviceStatusLabel(item.deviceStatus), 'Not': item.notes ?? '',
  })));
  stations['!cols'] = [{ wch: 16 }, { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 36 }];

  const products = utils.json_to_sheet(report.products.map((item) => ({
    'Ürün Adı': item.productName, 'Ruhsat': item.licenseNumber ?? '', 'Uygulama Yöntemi': item.applicationMethod ?? '', 'Seyreltme': item.dilutionRate ?? '',
    'Etken Madde': item.activeIngredient ?? '', 'Antidot': item.antidote ?? '', 'Ambalaj': item.packingQuantity ?? '', 'Kullanılan Miktar': item.amountUsed, 'Birim': item.unit,
  })));
  products['!cols'] = [{ wch: 42 }, { wch: 18 }, { wch: 22 }, { wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 10 }];

  const workbook = utils.book_new(); utils.book_append_sheet(workbook, summary, 'Rapor Özeti'); utils.book_append_sheet(workbook, stations, 'İstasyon Trendleri'); utils.book_append_sheet(workbook, products, 'Biyosidal Ürünler');
  writeFile(workbook, `${safeName(report.reportNumber)}_${safeName(report.branchName)}.xlsx`, { compression: true });
}

export function exportTrendExcel(analytics: ServiceReportAnalytics, reports: ServiceReportRecord[]) {
  const trend = utils.json_to_sheet(analytics.periods.map((item) => ({ Dönem: item.period, 'Rapor Adedi': item.reportCount, 'Toplam İstasyon': item.totalStations, 'Aktif İstasyon': item.activeStations, 'Plaka Değişimi': item.plateChanges, 'Yakalanan': item.totalCaught, 'Aktivite Oranı (%)': item.activityRate, 'Risk Puanı': item.riskScore, 'Risk Seviyesi': riskLabel(item.riskLevel) })));
  trend['!cols'] = [{ wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 16 }];
  const pests = utils.json_to_sheet(analytics.pestTotals.map((item) => ({ 'Zararlı Türü': item.pest, 'Toplam Yakalanan': item.totalCaught })));
  pests['!cols'] = [{ wch: 30 }, { wch: 20 }];
  const details = utils.json_to_sheet(reports.map((item) => ({ 'Rapor No': item.reportNumber, Müşteri: item.customerName, Şube: item.branchName, Tarih: formatDate(item.scheduledAt), Operatör: item.operatorName, İstasyon: item.totalStations, Aktivite: item.activeStations, Yakalanan: item.totalCaught, 'Risk Seviyesi': riskLabel(item.riskLevel) })));
  details['!cols'] = [{ wch: 20 }, { wch: 28 }, { wch: 28 }, { wch: 16 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }];
  const workbook = utils.book_new(); utils.book_append_sheet(workbook, trend, 'Aylık Trend'); utils.book_append_sheet(workbook, pests, 'Zararlı Dağılımı'); utils.book_append_sheet(workbook, details, 'Raporlar');
  writeFile(workbook, `Pestneer_Trend_Risk_${analytics.from}_${analytics.to}.xlsx`, { compression: true });
}

export function exportMonthlyBiocideExcel(
  monthLabel: string,
  biocides: { productName: string; licenseNumber: string; activeIngredient: string; applicationMethod: string; totalAmount: number; unit: string; applicationCount: number; targetPests: Set<string> }[],
  consumables: { productName: string; applicationMethod: string; totalAmount: number; unit: string; applicationCount: number; customers: Set<string> }[],
  customerRows: { customerName: string; branchName: string; workOrderNumber: string; scheduledAt: string; productName: string; amount: number; unit: string; targetPests: string; operatorName: string }[],
  companyName: string
) {
  const summarySheet = utils.aoa_to_sheet([
    ['PESTNEER AYLIK BİYOSİDAL VE SARF TÜKETİM RAPORU'],
    ['Firma Unvanı', companyName],
    ['Rapor Dönemi', monthLabel],
    ['Rapor Tarihi', new Date().toLocaleDateString('tr-TR')],
    ['Toplam Biyosidal Çeşidi', biocides.length],
    ['Toplam Sarf Çeşidi', consumables.length],
    ['Toplam Tüketim Satırı', customerRows.length],
  ]);
  summarySheet['!cols'] = [{ wch: 28 }, { wch: 60 }];
  summarySheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];

  const biocidesSheet = utils.json_to_sheet(biocides.map((item, idx) => ({
    'No': idx + 1,
    'Biyosidal Ürün Ticari Adı': item.productName,
    'Ruhsat No': item.licenseNumber,
    'Aktif Madde': item.activeIngredient,
    'Uygulama Yöntemi': item.applicationMethod,
    'Aylık Tüketim': item.totalAmount,
    'Birim': item.unit,
    'Uygulama Sayısı': item.applicationCount,
    'Hedef Zararlılar': Array.from(item.targetPests).join(', '),
  })));
  biocidesSheet['!cols'] = [{ wch: 6 }, { wch: 38 }, { wch: 18 }, { wch: 24 }, { wch: 24 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 32 }];

  const consumablesSheet = utils.json_to_sheet(consumables.map((item, idx) => ({
    'No': idx + 1,
    'Sarf / Ekipman Adı': item.productName,
    'Kullanım Alanı': item.applicationMethod,
    'Aylık Tüketim': item.totalAmount,
    'Birim': item.unit,
    'Hizmet Verilen Müşteri Sayısı': item.customers.size,
    'İş Emri Sayısı': item.applicationCount,
  })));
  consumablesSheet['!cols'] = [{ wch: 6 }, { wch: 38 }, { wch: 24 }, { wch: 16 }, { wch: 10 }, { wch: 26 }, { wch: 16 }];

  const detailsSheet = utils.json_to_sheet(customerRows.map((row) => ({
    'Tarih': formatDate(row.scheduledAt),
    'Müşteri Adı': row.customerName,
    'Şube': row.branchName,
    'İş Emri No': row.workOrderNumber,
    'Kullanılan Ürün / Sarf': row.productName,
    'Miktar': row.amount,
    'Birim': row.unit,
    'Hedef Zararlı': row.targetPests,
    'Uygulayıcı Personel': row.operatorName,
  })));
  detailsSheet['!cols'] = [{ wch: 14 }, { wch: 30 }, { wch: 24 }, { wch: 18 }, { wch: 36 }, { wch: 12 }, { wch: 10 }, { wch: 24 }, { wch: 24 }];

  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, summarySheet, 'Özet');
  utils.book_append_sheet(workbook, biocidesSheet, 'Biyosidal İcmali');
  utils.book_append_sheet(workbook, consumablesSheet, 'Sarf Malzemeleri');
  utils.book_append_sheet(workbook, detailsSheet, 'Müşteri Detayları');
  writeFile(workbook, `Pestneer_Aylik_Biyosidal_Tuketim_${safeName(monthLabel)}.xlsx`, { compression: true });
}

const riskLabel = (value: string) => ({ Low: 'Düşük', Medium: 'Orta', High: 'Yüksek' }[value] ?? value);
const deviceLabel = (value: string) => ({ EFT: 'Elektrikli sinek tutucu', LiveCapture: 'Canlı yakalama', Rodent: 'Kemirgen istasyonu', InsectMonitor: 'Haşere monitörü', Other: 'Diğer' }[value] ?? value);
const deviceStatusLabel = (value: string) => ({ Active: 'Aktif', Damaged: 'Hasarlı', Missing: 'Kayıp', Replaced: 'Değiştirildi', Passive: 'Pasif' }[value] ?? value);
const formatDate = (value: string) => new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
const safeName = (value: string) => value.replace(/[^a-zA-Z0-9ğüşöçıİĞÜŞÖÇ_-]+/g, '_');
