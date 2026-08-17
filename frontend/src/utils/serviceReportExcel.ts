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

const riskLabel = (value: string) => ({ Low: 'Düşük', Medium: 'Orta', High: 'Yüksek' }[value] ?? value);
const deviceLabel = (value: string) => ({ EFT: 'Elektrikli sinek tutucu', LiveCapture: 'Canlı yakalama', Rodent: 'Kemirgen istasyonu', InsectMonitor: 'Haşere monitörü', Other: 'Diğer' }[value] ?? value);
const deviceStatusLabel = (value: string) => ({ Active: 'Aktif', Damaged: 'Hasarlı', Missing: 'Kayıp', Replaced: 'Değiştirildi', Passive: 'Pasif' }[value] ?? value);
const formatDate = (value: string) => new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
const safeName = (value: string) => value.replace(/[^a-zA-Z0-9ğüşöçıİĞÜŞÖÇ_-]+/g, '_');
