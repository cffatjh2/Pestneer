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

export async function downloadStationLabelPdf(plan: StationLabelPlanInfo, stations: ReportStationInput[], companyName = 'Pestneer') {
  const labeled = stations.filter((station) => station.deviceNumber && station.deviceNumber.trim());
  if (labeled.length === 0) throw new Error('QR etiketi oluşturulacak istasyon bulunamadı.');

  const document = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const marginX = 8;
  const marginY = 8;
  const gapX = 3.5;
  const gapY = 3.5;
  const columns = 3;
  const rows = 7;
  const width = (210 - marginX * 2 - gapX * (columns - 1)) / columns; // ~62.3mm
  const height = (297 - marginY * 2 - gapY * (rows - 1)) / rows;     // ~36.8mm

  for (let index = 0; index < labeled.length; index += 1) {
    if (index > 0 && index % (columns * rows) === 0) document.addPage();
    const pageIndex = index % (columns * rows);
    const column = pageIndex % columns;
    const row = Math.floor(pageIndex / columns);
    const x = marginX + column * (width + gapX);
    const y = marginY + row * (height + gapY);
    const station = labeled[index];

    const qrValue = createStationQrValue(plan, station);
    const qr = await QRCode.toDataURL(qrValue, { margin: 0, width: 280, errorCorrectionLevel: 'M' });

    // 1. Ana Kart Arka Planı & Çerçeve
    document.setFillColor(255, 255, 255);
    document.setDrawColor(203, 213, 225);
    document.setLineWidth(0.3);
    document.roundedRect(x, y, width, height, 2.5, 2.5, 'FD');

    // 2. Üst Başlık Şeridi (Lacivert Header)
    document.setFillColor(15, 41, 66);
    document.roundedRect(x, y, width, 6.5, 2.5, 2.5, 'F');
    document.rect(x, y + 3.5, width, 3, 'F'); // Alt köşeleri düzleştir

    document.setTextColor(255, 255, 255);
    document.setFont('helvetica', 'bold');
    document.setFontSize(6.2);
    document.text('PEST KONTROL IZLEME NOKTASI', x + 3, y + 4.5);

    document.setTextColor(251, 191, 36); // Amber vurgusu
    document.setFontSize(5.2);
    document.text('BRCGS / ISO', x + width - 3, y + 4.5, { align: 'right' });

    // 3. QR Kod Konteyneri (Sol Taraf)
    const qrSize = 22;
    const qrX = x + 3;
    const qrY = y + 8;

    document.setFillColor(248, 250, 252);
    document.setDrawColor(226, 232, 240);
    document.setLineWidth(0.2);
    document.roundedRect(qrX - 0.8, qrY - 0.8, qrSize + 1.6, qrSize + 1.6, 1.2, 1.2, 'FD');
    document.addImage(qr, 'PNG', qrX, qrY, qrSize, qrSize);

    // 4. Sağ Bilgi Alanı
    const contentX = x + qrSize + 5;
    const contentW = width - (qrSize + 7.5);

    // İstasyon Numarası Rozeti (Mavi Badge)
    document.setFillColor(239, 246, 255);
    document.setDrawColor(191, 219, 254);
    document.setLineWidth(0.2);
    document.roundedRect(contentX, y + 7.8, contentW, 6.8, 1.2, 1.2, 'FD');

    document.setTextColor(29, 78, 216);
    document.setFont('helvetica', 'bold');
    document.setFontSize(10.5);
    document.text(toCleanPdfText(station.deviceNumber), contentX + contentW / 2, y + 12.6, { align: 'center' });

    // Firma Adı
    document.setFont('helvetica', 'bold');
    document.setFontSize(6);
    document.setTextColor(15, 23, 42);
    const cleanCompany = toCleanPdfText(companyName || 'Pestneer');
    document.text(cleanCompany, contentX, y + 17.5, { maxWidth: contentW });

    // Müşteri / Şube Bilgisi
    document.setFont('helvetica', 'normal');
    document.setFontSize(5.2);
    document.setTextColor(71, 85, 105);
    const clientBranch = `${toCleanPdfText(plan.customerName)} / ${toCleanPdfText(plan.branchName)}`;
    document.text(clientBranch, contentX, y + 21.2, { maxWidth: contentW });

    // Bulunduğu Alan / Bölüm
    document.setFont('helvetica', 'bold');
    document.setFontSize(5);
    document.setTextColor(2, 132, 199);
    const areaText = `Alan: ${toCleanPdfText(station.area || plan.areaName || 'Genel Tesis')}`;
    document.text(areaText, contentX, y + 25.5, { maxWidth: contentW });

    // 5. Alt Bilgi Şeridi (Footer)
    const footerY = y + height - 4.5;
    document.setFillColor(248, 250, 252);
    document.rect(x, footerY, width, 4.5, 'F');
    document.roundedRect(x, footerY + 1.5, width, 3, 2.5, 2.5, 'F');

    document.setDrawColor(226, 232, 240);
    document.setLineWidth(0.2);
    document.line(x, footerY, x + width, footerY);

    document.setFont('helvetica', 'normal');
    document.setFontSize(4.6);
    document.setTextColor(100, 116, 139);
    document.text('Pestneer Dijital Sistem', x + 3, y + height - 1.4);

    const displayCode = station.qrCode ? station.qrCode.slice(0, 16) : `PST-${station.deviceNumber}`;
    document.text(toCleanPdfText(displayCode), x + width - 3, y + height - 1.4, { align: 'right' });
  }

  document.save(`${sanitize(plan.customerName)}_${sanitize(plan.branchName)}_QR_Etiketleri.pdf`);
}

export async function downloadSitePlanStationLabels(plan: SitePlanRecord, companyName = 'Pestneer') {
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

  await downloadStationLabelPdf(plan, stations, companyName);
}

function sanitize(value: string) {
  return toCleanPdfText(value).replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}
