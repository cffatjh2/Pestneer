import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type { SitePlanRecord } from '../services/sitePlanApi';
import type { ReportStationInput } from '../services/serviceReportApi';

const PREFIX = 'PESTNEER-STATION';

export type StationQrPayload = {
  version: 1;
  sitePlanId: string;
  elementId: string;
  customerId: string;
  branchId?: string;
  deviceNumber: string;
};

export type StationLabelPlanInfo = {
  id: string;
  customerId: string;
  branchId?: string;
  customerName: string;
  branchName: string;
  areaName?: string;
};

export function createStationQrValue(plan: StationLabelPlanInfo, station: ReportStationInput) {
  if (station.qrCode?.trim()) return station.qrCode.trim();
  return [PREFIX, '1', plan.id, station.sitePlanElementId ?? station.deviceNumber, plan.customerId, plan.branchId ?? '', station.deviceNumber].map(encodeURIComponent).join('|');
}

export function normalizeStationQrValue(value?: string) {
  return value?.trim().toLocaleUpperCase('tr-TR') ?? '';
}

export function parseStationQrValue(value: string): StationQrPayload | null {
  const parts = value.trim().split('|').map(decodeURIComponent);
  if (parts.length !== 7 || parts[0] !== PREFIX || parts[1] !== '1') return null;
  return { version: 1, sitePlanId: parts[2], elementId: parts[3], customerId: parts[4], branchId: parts[5] || undefined, deviceNumber: parts[6] };
}

function toCleanPdfText(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/Ş/g, 'S')
    .replace(/ş/g, 's')
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'g')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'c')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'u')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[–—]/g, '-')
    .trim();
}

export type StationLabelBranding = {
  companyName?: string;
  logoUrl?: string | null;
};

async function fetchImageAsDataUrl(url?: string | null): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:image/')) return url;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function downloadStationLabelPdf(plan: StationLabelPlanInfo, stations: ReportStationInput[], branding?: StationLabelBranding | string) {
  const labeled = stations.filter((station) => station.deviceNumber && station.deviceNumber.trim());
  if (labeled.length === 0) throw new Error('QR etiketi oluşturulacak istasyon bulunamadı.');

  const brandingObj: StationLabelBranding = typeof branding === 'string' ? { companyName: branding } : (branding ?? {});
  const resolvedCompanyName = brandingObj.companyName?.trim() || 'Pestneer';
  const logoDataUrl = await fetchImageAsDataUrl(brandingObj.logoUrl);

  const document = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const marginX = 10;
  const marginY = 10;
  const gapX = 6;
  const gapY = 5;
  const columns = 2; // 2 sütun
  const rows = 5;    // 5 satır (Sayfa başı 10 büyük & okunaklı profesyonel etiket)
  const width = (210 - marginX * 2 - gapX * (columns - 1)) / columns; // ~92mm
  const height = (297 - marginY * 2 - gapY * (rows - 1)) / rows;     // ~51.4mm

  for (let index = 0; index < labeled.length; index += 1) {
    if (index > 0 && index % (columns * rows) === 0) document.addPage();
    const pageIndex = index % (columns * rows);
    const column = pageIndex % columns;
    const row = Math.floor(pageIndex / columns);
    const x = marginX + column * (width + gapX);
    const y = marginY + row * (height + gapY);
    const station = labeled[index];

    const qrValue = createStationQrValue(plan, station);
    const qr = await QRCode.toDataURL(qrValue, { margin: 0, width: 360, errorCorrectionLevel: 'M' });

    // 1. Ana Kart Arka Planı & Çerçeve
    document.setFillColor(255, 255, 255);
    document.setDrawColor(203, 213, 225);
    document.setLineWidth(0.35);
    document.roundedRect(x, y, width, height, 3, 3, 'FD');

    // 2. Üst Başlık Şeridi (Koyu Lacivert Header)
    const headerHeight = 7.8;
    document.setFillColor(15, 41, 66);
    document.roundedRect(x, y, width, headerHeight, 3, 3, 'F');
    document.rect(x, y + 4, width, headerHeight - 4, 'F'); // Alt köşeleri düzleştir

    document.setTextColor(255, 255, 255);
    document.setFont('helvetica', 'bold');
    document.setFontSize(7.2);
    document.text('PEST KONTROL IZLEME VE DENETIM NOKTASI', x + 3.5, y + 5.2);

    document.setTextColor(251, 191, 36); // Amber standardı
    document.setFontSize(6.2);
    document.text('BRCGS / AIB / ISO 22000', x + width - 3.5, y + 5.2, { align: 'right' });

    // 3. QR Kod Konteyneri (Sol Taraf - Büyük ve Net Taranabilir)
    const qrSize = 31;
    const qrX = x + 3.5;
    const qrY = y + headerHeight + 2;

    document.setFillColor(248, 250, 252);
    document.setDrawColor(226, 232, 240);
    document.setLineWidth(0.25);
    document.roundedRect(qrX - 1, qrY - 1, qrSize + 2, qrSize + 2, 2, 2, 'FD');
    document.addImage(qr, 'PNG', qrX, qrY, qrSize, qrSize);

    // 4. Sağ Bilgi Alanı
    const contentX = x + qrSize + 6.5;
    const contentW = width - (qrSize + 10);

    // İstasyon Numarası Rozeti (Büyük ve Çok Belirgin)
    const badgeHeight = 9.2;
    document.setFillColor(239, 246, 255);
    document.setDrawColor(191, 219, 254);
    document.setLineWidth(0.25);
    document.roundedRect(contentX, qrY - 1, contentW, badgeHeight, 1.8, 1.8, 'FD');

    document.setTextColor(29, 78, 216);
    document.setFont('helvetica', 'bold');
    document.setFontSize(13.5);
    document.text(toCleanPdfText(station.deviceNumber), contentX + contentW / 2, qrY + 5.8, { align: 'center' });

    // Şirket Logosu veya Şirket Adı
    const displayCompanyName = toCleanPdfText(resolvedCompanyName);
    let companyY = qrY + badgeHeight + 3.5;

    if (logoDataUrl) {
      try {
        document.addImage(logoDataUrl, 'PNG', contentX, companyY - 1.5, 18, 5.5);
        document.setFont('helvetica', 'bold');
        document.setFontSize(6.8);
        document.setTextColor(15, 23, 42);
        document.text(displayCompanyName, contentX + 19.5, companyY + 2.5, { maxWidth: contentW - 20 });
      } catch {
        document.setFont('helvetica', 'bold');
        document.setFontSize(7.5);
        document.setTextColor(15, 23, 42);
        document.text(displayCompanyName, contentX, companyY + 1.5, { maxWidth: contentW });
      }
    } else {
      document.setFont('helvetica', 'bold');
      document.setFontSize(7.8);
      document.setTextColor(15, 23, 42);
      document.text(displayCompanyName, contentX, companyY + 1.5, { maxWidth: contentW });
    }

    // Müşteri ve Şube Bilgisi
    const infoY = companyY + 6.5;
    document.setFont('helvetica', 'bold');
    document.setFontSize(6.5);
    document.setTextColor(51, 65, 85);
    document.text('Musteri:', contentX, infoY);
    document.setFont('helvetica', 'normal');
    document.text(toCleanPdfText(plan.customerName), contentX + 11, infoY, { maxWidth: contentW - 11 });

    const branchY = infoY + 4;
    document.setFont('helvetica', 'bold');
    document.setFontSize(6.5);
    document.text('Sube:', contentX, branchY);
    document.setFont('helvetica', 'normal');
    document.text(toCleanPdfText(plan.branchName), contentX + 8, branchY, { maxWidth: contentW - 8 });

    // Bulunduğu Alan / Bölüm
    const areaY = branchY + 4.2;
    document.setFont('helvetica', 'bold');
    document.setFontSize(6.5);
    document.setTextColor(2, 132, 199);
    const areaText = `Alan: ${toCleanPdfText(station.area || plan.areaName || 'Genel Tesis')}`;
    document.text(areaText, contentX, areaY, { maxWidth: contentW });

    // 5. Alt Bilgi Şeridi (Footer)
    const footerY = y + height - 5.5;
    document.setFillColor(248, 250, 252);
    document.rect(x, footerY, width, 5.5, 'F');
    document.roundedRect(x, footerY + 2, width, 3.5, 3, 3, 'F');

    document.setDrawColor(226, 232, 240);
    document.setLineWidth(0.25);
    document.line(x, footerY, x + width, footerY);

    document.setFont('helvetica', 'normal');
    document.setFontSize(5.5);
    document.setTextColor(100, 116, 139);
    document.text('Pestneer Dijital Izleme Sistemi', x + 3.5, y + height - 1.8);

    const displayCode = station.qrCode ? station.qrCode.slice(0, 18) : `PST-${station.deviceNumber}`;
    document.text(toCleanPdfText(displayCode), x + width - 3.5, y + height - 1.8, { align: 'right' });
  }

  document.save(`${sanitize(plan.customerName)}_${sanitize(plan.branchName)}_QR_Etiketleri.pdf`);
}

export async function downloadSitePlanStationLabels(plan: SitePlanRecord, branding?: StationLabelBranding | string) {
  const equipmentMap = new Map(plan.canvas.equipmentTypes.map((item) => [item.id, item]));
  const stationElements = plan.canvas.elements.filter((item) => item.type === 'station');
  if (stationElements.length === 0) {
    throw new Error('Bu krokide henüz tanımlanmış istasyon noktası bulunamadı.');
  }

  const stations: ReportStationInput[] = stationElements.map((item) => ({
    deviceNumber: item.stationNumber?.trim() || `${equipmentMap.get(item.equipmentTypeId ?? '')?.code ?? 'ST'}-01`,
    area: item.text?.trim() || plan.areaName || 'Genel Tesis Alanı',
    deviceType: equipmentMap.get(item.equipmentTypeId ?? '')?.code ?? 'B',
    sitePlanId: plan.id,
    sitePlanElementId: item.id,
    qrCode: item.qrCode?.trim() || undefined,
    targetPest: '',
    caughtCount: 0,
    hasActivity: false,
    plateChanged: false,
    deviceStatus: 'Unchecked',
  }));

  await downloadStationLabelPdf(plan, stations, branding);
}

function sanitize(value: string) {
  return toCleanPdfText(value).replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}
