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

// Code 128 Barcode Generator (Pure JS canvas renderer)
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", // 0-9
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", // 10-19
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", // 20-29
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", // 30-39
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", // 40-49
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", // 50-59
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", // 60-69
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", // 70-79
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", // 80-89
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", // 90-99
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112" // 100-106 (104=StartB, 106=Stop)
];

export function generateBarcode128DataUrl(text: string, options?: { height?: number; scale?: number }): string {
  const height = options?.height ?? 50;
  const scale = options?.scale ?? 2;
  const cleanText = text.trim();
  if (!cleanText) return '';

  const codes: number[] = [104]; // Start Code B
  let checksum = 104;

  for (let i = 0; i < cleanText.length; i++) {
    const code = cleanText.charCodeAt(i) - 32;
    if (code >= 0 && code <= 95) {
      codes.push(code);
      checksum += code * (i + 1);
    }
  }

  codes.push(checksum % 103);
  codes.push(106); // Stop Code

  let pattern = '';
  for (const c of codes) {
    pattern += CODE128_PATTERNS[c] || '';
  }

  let totalModules = 0;
  for (let i = 0; i < pattern.length; i++) {
    totalModules += parseInt(pattern[i], 10);
  }

  const quietZone = 8;
  const canvasWidth = (totalModules + quietZone * 2) * scale;
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasWidth, height);

  ctx.fillStyle = '#000000';
  let currentX = quietZone * scale;
  let isBar = true;

  for (let i = 0; i < pattern.length; i++) {
    const width = parseInt(pattern[i], 10) * scale;
    if (isBar) {
      ctx.fillRect(currentX, 0, width, height);
    }
    currentX += width;
    isBar = !isBar;
  }

  return canvas.toDataURL('image/png');
}

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

/**
 * Universal Station Matching for Barcode & QR Code:
 * Matches by exact qrCode, normalized code, payload, or device number.
 */
export function matchStationByCode(
  stations: ReportStationInput[],
  scannedCode: string,
  context?: { customerId?: string; branchId?: string }
): { matchIndex: number; matchType: 'exactQr' | 'payload' | 'deviceNumber' | 'contains' } | null {
  const normalized = normalizeStationQrValue(scannedCode);
  if (!normalized) return null;

  // 1. Direct match on station.qrCode (Case insensitive)
  const exactIndex = stations.findIndex((s) => s.qrCode && normalizeStationQrValue(s.qrCode) === normalized);
  if (exactIndex >= 0) return { matchIndex: exactIndex, matchType: 'exactQr' };

  // 2. Parsed Pestneer QR Payload
  const payload = parseStationQrValue(scannedCode);
  if (payload) {
    if (context?.customerId && payload.customerId !== context.customerId) {
      return null;
    }
    const payloadIndex = stations.findIndex((s) =>
      (s.sitePlanId === payload.sitePlanId && s.sitePlanElementId === payload.elementId) ||
      s.deviceNumber.toUpperCase() === payload.deviceNumber.toUpperCase()
    );
    if (payloadIndex >= 0) return { matchIndex: payloadIndex, matchType: 'payload' };
  }

  // 3. Exact match on deviceNumber (e.g. barcode was "YM-03" or "03")
  const deviceNumIndex = stations.findIndex((s) => s.deviceNumber && normalizeStationQrValue(s.deviceNumber) === normalized);
  if (deviceNumIndex >= 0) return { matchIndex: deviceNumIndex, matchType: 'deviceNumber' };

  // 4. Substring / clean numeric match (e.g. barcode text contains "YM-03")
  const subIndex = stations.findIndex((s) => s.deviceNumber && normalized.includes(normalizeStationQrValue(s.deviceNumber)));
  if (subIndex >= 0) return { matchIndex: subIndex, matchType: 'contains' };

  return null;
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

async function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number; aspect: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width || 1;
      const h = img.naturalHeight || img.height || 1;
      resolve({ width: w, height: h, aspect: w / h });
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export async function downloadStationLabelPdf(plan: StationLabelPlanInfo, stations: ReportStationInput[], branding?: StationLabelBranding | string) {
  const labeled = stations.filter((station) => station.deviceNumber && station.deviceNumber.trim());
  if (labeled.length === 0) throw new Error('Etiket oluşturulacak istasyon bulunamadı.');

  const brandingObj: StationLabelBranding = typeof branding === 'string' ? { companyName: branding } : (branding ?? {});
  const resolvedCompanyName = brandingObj.companyName?.trim() || 'Pestneer';
  const logoDataUrl = await fetchImageAsDataUrl(brandingObj.logoUrl);
  const logoDims = logoDataUrl ? await getImageDimensions(logoDataUrl) : null;

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

    // Barcode Code128 representation (using deviceNumber or qrCode)
    const barcodeText = station.qrCode?.trim() || station.deviceNumber.trim();
    const barcodeImg = generateBarcode128DataUrl(barcodeText, { height: 40, scale: 2 });

    // 1. Ana Kart Arka Planı & Çerçeve
    document.setFillColor(255, 255, 255);
    document.setDrawColor(203, 213, 225);
    document.setLineWidth(0.35);
    document.roundedRect(x, y, width, height, 3, 3, 'FD');

    // 2. Üst Başlık Şeridi (Koyu Lacivert Header)
    const headerHeight = 7.8;
    document.setFillColor(15, 41, 66);
    document.roundedRect(x, y, width, headerHeight, 3, 3, 'F');
    document.rect(x, y + 4, width, headerHeight - 4, 'F');

    document.setTextColor(255, 255, 255);
    document.setFont('helvetica', 'bold');
    document.setFontSize(7.2);
    document.text('PEST KONTROL IZLEME VE DENETIM NOKTASI', x + 3.5, y + 5.2);

    document.setTextColor(251, 191, 36);
    document.setFontSize(6.2);
    document.text('BRCGS / AIB / ISO 22000', x + width - 3.5, y + 5.2, { align: 'right' });

    // 3. QR Kod Konteyneri (Sol Taraf)
    const qrSize = 28;
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

    // İstasyon Numarası Rozeti
    const badgeHeight = 8.5;
    document.setFillColor(239, 246, 255);
    document.setDrawColor(191, 219, 254);
    document.setLineWidth(0.25);
    document.roundedRect(contentX, qrY - 1, contentW, badgeHeight, 1.8, 1.8, 'FD');

    document.setTextColor(29, 78, 216);
    document.setFont('helvetica', 'bold');
    document.setFontSize(12.5);
    document.text(toCleanPdfText(station.deviceNumber), contentX + contentW / 2, qrY + 5.4, { align: 'center' });

    // Şirket Adı & Logo
    const displayCompanyName = toCleanPdfText(resolvedCompanyName);
    const companyY = qrY + badgeHeight + 2.8;

    if (logoDataUrl && logoDims) {
      try {
        const maxLogoW = 16;
        const maxLogoH = 6;
        let renderedLogoW = maxLogoW;
        let renderedLogoH = maxLogoH;

        if (logoDims.aspect >= maxLogoW / maxLogoH) {
          renderedLogoW = maxLogoW;
          renderedLogoH = Math.max(2, Math.min(maxLogoH, maxLogoW / logoDims.aspect));
        } else {
          renderedLogoH = maxLogoH;
          renderedLogoW = Math.max(2, Math.min(maxLogoW, maxLogoH * logoDims.aspect));
        }

        const logoOffsetY = (maxLogoH - renderedLogoH) / 2;
        document.addImage(logoDataUrl, 'PNG', contentX, companyY - 1.2 + logoOffsetY, renderedLogoW, renderedLogoH);

        document.setFont('helvetica', 'bold');
        document.setFontSize(6.8);
        document.setTextColor(15, 23, 42);
        const textOffsetX = renderedLogoW + 2;
        document.text(displayCompanyName, contentX + textOffsetX, companyY + 2.4, { maxWidth: contentW - textOffsetX });
      } catch {
        document.setFont('helvetica', 'bold');
        document.setFontSize(7.2);
        document.setTextColor(15, 23, 42);
        document.text(displayCompanyName, contentX, companyY + 1.2, { maxWidth: contentW });
      }
    } else {
      document.setFont('helvetica', 'bold');
      document.setFontSize(7.2);
      document.setTextColor(15, 23, 42);
      document.text(displayCompanyName, contentX, companyY + 1.2, { maxWidth: contentW });
    }

    // Müşteri ve Şube
    const infoY = companyY + 5.5;
    document.setFont('helvetica', 'bold');
    document.setFontSize(6.2);
    document.setTextColor(51, 65, 85);
    document.text('Musteri:', contentX, infoY);
    document.setFont('helvetica', 'normal');
    document.text(toCleanPdfText(plan.customerName), contentX + 10, infoY, { maxWidth: contentW - 10 });

    const branchY = infoY + 3.6;
    document.setFont('helvetica', 'bold');
    document.setFontSize(6.2);
    document.text('Sube:', contentX, branchY);
    document.setFont('helvetica', 'normal');
    document.text(toCleanPdfText(plan.branchName), contentX + 7.5, branchY, { maxWidth: contentW - 7.5 });

    // 1D Barkod Çizimi (Sağ alt / QR yanı)
    const barcodeY = branchY + 3.8;
    if (barcodeImg) {
      try {
        document.addImage(barcodeImg, 'PNG', contentX, barcodeY, contentW, 5.5);
      } catch {}
    }

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
    document.text('Pestneer Barkod / QR Izleme', x + 3.5, y + height - 1.8);

    const displayCode = station.qrCode ? station.qrCode.slice(0, 22) : `BAR-${station.deviceNumber}`;
    document.text(toCleanPdfText(displayCode), x + width - 3.5, y + height - 1.8, { align: 'right' });
  }

  document.save(`${sanitize(plan.customerName)}_${sanitize(plan.branchName)}_Barkod_QR_Etiketleri.pdf`);
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
