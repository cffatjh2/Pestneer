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

export async function downloadStationLabelPdf(plan: StationLabelPlanInfo, stations: ReportStationInput[], companyName: string) {
  const labeled = stations.filter((station) => station.deviceNumber.trim());
  if (labeled.length === 0) throw new Error('QR etiketi oluşturulacak kroki istasyonu bulunamadı.');
  const document = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margin = 10;
  const gap = 3;
  const columns = 3;
  const rows = 7;
  const width = (210 - margin * 2 - gap * (columns - 1)) / columns;
  const height = (297 - margin * 2 - gap * (rows - 1)) / rows;

  for (let index = 0; index < labeled.length; index += 1) {
    if (index > 0 && index % (columns * rows) === 0) document.addPage();
    const pageIndex = index % (columns * rows);
    const column = pageIndex % columns;
    const row = Math.floor(pageIndex / columns);
    const x = margin + column * (width + gap);
    const y = margin + row * (height + gap);
    const station = labeled[index];
    const qr = await QRCode.toDataURL(createStationQrValue(plan, station), { margin: 1, width: 320, errorCorrectionLevel: 'M' });

    document.setDrawColor(198, 211, 225);
    document.roundedRect(x, y, width, height, 2, 2);
    document.addImage(qr, 'PNG', x + 3, y + 3, 27, 27);
    document.setTextColor(16, 42, 67);
    document.setFont('helvetica', 'bold');
    document.setFontSize(12);
    document.text(station.deviceNumber, x + 33, y + 9, { maxWidth: width - 36 });
    document.setFont('helvetica', 'normal');
    document.setFontSize(6.8);
    document.text(companyName, x + 33, y + 15, { maxWidth: width - 36 });
    document.text(`${plan.customerName} / ${plan.branchName}`, x + 33, y + 20, { maxWidth: width - 36 });
    document.setTextColor(72, 98, 124);
    document.text(station.area || plan.areaName || 'Genel Alan', x + 33, y + 27, { maxWidth: width - 36 });
    document.setFontSize(5.5);
    document.text('Dijital QR istasyon kimliği', x + 3, y + height - 2.5);
  }

  document.save(`${sanitize(plan.customerName)}_${sanitize(plan.branchName)}_QR_Etiketleri.pdf`);
}

export async function downloadSitePlanStationLabels(plan: SitePlanRecord, companyName = 'Pestneer İlaçlama') {
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
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
}
