import { read, utils, writeFile } from 'xlsx';
import type { CreateBranchInput } from '../services/workOrderApi';

const MAX_BRANCH_COUNT = 250;

const headerAliases = {
  name: ['sube adi', 'sube', 'lokasyon adi', 'lokasyon'],
  code: ['sube kodu', 'kod'],
  city: ['il', 'sehir'],
  district: ['ilce'],
  address: ['acik adres', 'adres'],
  contactName: ['yetkili', 'yetkili adi', 'ilgili', 'ilgili kisi'],
  phoneNumber: ['telefon', 'telefon numarasi', 'gsm'],
  email: ['e posta', 'eposta', 'email', 'mail'],
  latitude: ['enlem', 'latitude', 'lat'],
  longitude: ['boylam', 'longitude', 'lng', 'lon'],
  mapUrl: ['google haritalar', 'google maps', 'harita linki', 'harita baglantisi', 'konum linki'],
  portalContactName: ['portal yetkilisi', 'hesap yetkilisi'],
  portalEmail: ['portal e posta', 'portal eposta', 'giris e posta', 'giris email'],
  portalPassword: ['gecici sifre', 'portal sifresi', 'giris sifresi'],
} satisfies Record<keyof CreateBranchInput, string[]>;

export async function parseBranchWorkbook(file: File): Promise<CreateBranchInput[]> {
  const workbook = read(await file.arrayBuffer(), { cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('Excel dosyasında okunabilir bir sayfa bulunamadı.');

  const rows = utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheetName], {
    header: 1,
    defval: '',
    blankrows: false,
    raw: false,
  });

  return parseBranchRows(rows);
}

export function parseBranchRows(rows: unknown[][]): CreateBranchInput[] {
  if (rows.length < 2) throw new Error('Dosyada başlık satırı ve en az bir şube bulunmalıdır.');

  const headers = rows[0].map((value) => normalizeHeader(toText(value)));
  const indexes = Object.fromEntries(
    Object.entries(headerAliases).map(([field, aliases]) => [
      field,
      headers.findIndex((header) => aliases.includes(header)),
    ]),
  ) as Record<keyof CreateBranchInput, number>;

  if (indexes.name < 0 || indexes.address < 0) {
    throw new Error('Excel başlıklarında “Şube Adı” ve “Açık Adres” sütunları bulunmalıdır.');
  }

  const dataRows = rows.slice(1).filter((row) => row.some((value) => toText(value).length > 0));
  if (dataRows.length === 0) throw new Error('Excel dosyasında şube satırı bulunamadı.');
  if (dataRows.length > MAX_BRANCH_COUNT) throw new Error(`Tek seferde en fazla ${MAX_BRANCH_COUNT} şube ekleyebilirsiniz.`);

  return dataRows.map((row, index) => {
    const name = getCell(row, indexes.name);
    const address = getCell(row, indexes.address);
    const excelRow = index + 2;

    if (!name) throw new Error(`${excelRow}. satırda şube adı eksik.`);
    if (!address) throw new Error(`${excelRow}. satırda açık adres eksik.`);

    return {
      name,
      code: optionalCell(row, indexes.code),
      city: optionalCell(row, indexes.city),
      district: optionalCell(row, indexes.district),
      address,
      contactName: optionalCell(row, indexes.contactName),
      phoneNumber: optionalCell(row, indexes.phoneNumber),
      email: optionalCell(row, indexes.email),
      latitude: optionalCoordinate(row, indexes.latitude, excelRow, 'enlem'),
      longitude: optionalCoordinate(row, indexes.longitude, excelRow, 'boylam'),
      mapUrl: optionalCell(row, indexes.mapUrl),
      portalContactName: optionalCell(row, indexes.portalContactName),
      portalEmail: optionalCell(row, indexes.portalEmail),
      portalPassword: optionalCell(row, indexes.portalPassword),
    };
  });
}

export function downloadBranchTemplate() {
  const worksheet = utils.aoa_to_sheet([
    ['Şube Adı', 'Şube Kodu', 'İl', 'İlçe', 'Açık Adres', 'Yetkili', 'Telefon', 'E-posta', 'Enlem', 'Boylam', 'Google Haritalar', 'Portal Yetkilisi', 'Portal E-posta', 'Geçici Şifre'],
  ]);
  worksheet['!cols'] = [
    { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 42 },
    { wch: 22 }, { wch: 18 }, { wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 38 }, { wch: 22 }, { wch: 30 }, { wch: 18 },
  ];

  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, 'Şubeler');
  writeFile(workbook, 'Pestneer_Sube_Aktarim_Sablonu.xlsx', { compression: true });
}

function optionalCoordinate(row: unknown[], index: number, rowNumber: number, label: string) {
  const value = optionalCell(row, index);
  if (!value) return undefined;
  const number = Number(value.replace(',', '.'));
  if (!Number.isFinite(number)) throw new Error(`${rowNumber}. satırdaki ${label} değeri geçerli bir sayı değil.`);
  return number;
}

function optionalCell(row: unknown[], index: number) {
  const value = getCell(row, index);
  return value || undefined;
}

function getCell(row: unknown[], index: number) {
  return index < 0 ? '' : toText(row[index]);
}

function toText(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeHeader(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ç/g, 'c')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
