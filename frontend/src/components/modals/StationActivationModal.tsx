import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Ban, Check, CheckCircle2, FileDown, Plus, Save, Trash2, Wrench, X } from 'lucide-react';
import type { WorkOrder } from '../../types';
import { getServiceReportCatalog, type ReportStationInput, type ServiceReportCatalog } from '../../services/serviceReportApi';
import { getSitePlans } from '../../services/sitePlanApi';
import {
  downloadStationActivationPdf,
  getStationActivationByWorkOrder,
  saveStationActivation,
  type StationActivationRecord,
} from '../../services/stationActivationApi';

type Props = {
  accessToken: string;
  order: WorkOrder;
  onClose: () => void;
  onSaved?: (record: StationActivationRecord) => void;
};

const blankStation = (): ReportStationInput => ({
  deviceNumber: '', area: '', deviceType: 'B', targetPest: '', caughtCount: 0,
  hasActivity: false, plateChanged: false, deviceStatus: 'Unchecked', activityType: '',
  inaccessibilityReason: '', notes: '',
});

const fallbackCatalog: ServiceReportCatalog = {
  pestTypes: ['Ev faresi', 'Tarla faresi', 'Norveç sıçanı', 'Çatı sıçanı', 'Alman hamamböceği', 'Doğu hamamböceği', 'Amerikan hamamböceği', 'Karasinek', 'Sirke sineği', 'Lağım sineği', 'Sivrisinek', 'Güve', 'Karınca'],
  activityTypes: ['Sighting', 'Capture', 'Droppings', 'Gnawing', 'Track', 'Nest', 'Other'],
  equipmentTypes: ['M - Dış alan kemirgen istasyonu', 'C - İç alan canlı yakalama istasyonu', 'E - Sinek cihazı', 'G - Güvenlik monitörü', 'B - Böcek monitörü'],
  inaccessibilityReasons: ['Alan kilitliydi', 'Üretim devam ediyordu', 'Müşteri erişime izin vermedi', 'İstasyonun önü kapalıydı', 'İş güvenliği nedeniyle erişilemedi', 'İstasyon yerinde bulunamadı'],
  residenceTypes: [], workTypes: [], safetyMeasures: [], applicationMethods: [], productUnits: [], quickCounts: [1,2,3,4,5,6,7,8,9,10],
};

const activityLabels: Record<string, string> = {
  Sighting: 'Canlı gözlem', Capture: 'Yakalama', Droppings: 'Dışkı / iz', Gnawing: 'Kemirme bulgusu',
  Track: 'Ayak izi / geçiş', Nest: 'Yuva / üreme alanı', Other: 'Diğer bulgu',
};

export default function StationActivationModal({ accessToken, order, onClose, onSaved }: Props) {
  const [record, setRecord] = useState<StationActivationRecord | null>(null);
  const [stations, setStations] = useState<ReportStationInput[]>([]);
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ServiceReportCatalog>(fallbackCatalog);
  const readOnly = record?.status === 'Finalized';

  useEffect(() => {
    let active = true;
    Promise.all([getStationActivationByWorkOrder(accessToken, order.recordId), getSitePlans(accessToken), getServiceReportCatalog(accessToken)])
      .then(([existing, plans, loadedCatalog]) => {
        if (!active) return;
        setCatalog(loadedCatalog);
        setRecord(existing); setNotes(existing?.notes ?? '');
        if (existing?.stations.length) { setStations(existing.stations); return; }
        const plan = plans.find((item) => item.customerId === order.customerId && (order.branchId ? item.branchId === order.branchId : !item.branchId));
        const equipment = new Map(plan?.canvas.equipmentTypes.map((item) => [item.id, item]) ?? []);
        const planned = plan?.canvas.elements.filter((item) => item.type === 'station').map((item) => ({
          ...blankStation(), sitePlanId: plan.id, sitePlanElementId: item.id, qrCode: item.qrCode,
          deviceNumber: item.stationNumber ?? '', area: item.text ?? plan.areaName,
          deviceType: equipment.get(item.equipmentTypeId ?? '')?.code ?? 'B',
        })) ?? [];
        setStations(planned.length ? planned : [blankStation()]);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Aktivasyon listesi açılamadı.'))
      .finally(() => setLoading(false));
    return () => { active = false; };
  }, [accessToken, order.branchId, order.customerId, order.recordId]);

  const current = stations[selected];
  const completed = stations.filter((item) => item.deviceStatus !== 'Unchecked').length;
  const summary = useMemo(() => ({
    activity: stations.filter((item) => item.deviceStatus === 'Activity').length,
    damaged: stations.filter((item) => item.deviceStatus === 'Damaged').length,
    inaccessible: stations.filter((item) => item.deviceStatus === 'Inaccessible').length,
  }), [stations]);
  const update = (patch: Partial<ReportStationInput>) => setStations((items) => items.map((item, index) => index === selected ? { ...item, ...patch } : item));
  const choose = (status: string) => update(current?.deviceStatus === status
    ? { deviceStatus: 'Unchecked', hasActivity: false, caughtCount: 0 }
    : { deviceStatus: status, hasActivity: status === 'Activity', caughtCount: status === 'Activity' ? current?.caughtCount ?? 0 : 0 });

  const validate = (finalize: boolean) => {
    if (!stations.length) return 'En az bir istasyon ekleyin.';
    for (const station of stations) {
      if (!station.deviceNumber.trim() || !station.area.trim()) return 'Her istasyon için numara ve konum girin.';
      if (finalize && station.deviceStatus === 'Unchecked') return `${station.deviceNumber} için kontrol sonucu seçin.`;
      if (station.deviceStatus === 'Inaccessible' && !station.inaccessibilityReason?.trim()) return `${station.deviceNumber} için ulaşılamama nedenini yazın.`;
      if (station.deviceStatus === 'Activity' && !station.targetPest?.trim()) return `${station.deviceNumber} için zararlı türünü seçin.`;
      if (station.deviceStatus === 'Activity' && station.caughtCount < 1) return `${station.deviceNumber} için aktivite adedini seçin.`;
    }
    return null;
  };
  const save = async (finalize: boolean) => {
    const message = validate(finalize); if (message) return setError(message);
    setSaving(true); setError(null);
    try {
      const saved = await saveStationActivation(accessToken, order.recordId, { notes, finalize, stations });
      setRecord(saved); onSaved?.(saved); if (finalize) onClose();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Aktivasyon listesi kaydedilemedi.'); }
    finally { setSaving(false); }
  };
  const download = async () => {
    if (!record) return;
    try { await downloadStationActivationPdf(accessToken, record); }
    catch (downloadError) { setError(downloadError instanceof Error ? downloadError.message : 'PDF indirilemedi.'); }
  };

  return <div className="modal-layer"><div className="modal station-activation-modal">
    <div className="modal-header"><div><p className="eyebrow">BAĞIMSIZ İSTASYON MODÜLÜ · {order.id}</p><h2>İstasyon aktivasyon listesi</h2><p>{order.client} · {order.branch} · EK-1 uygulama formundan bağımsız çalışır.</p></div><button className="icon-button" onClick={onClose}><X /></button></div>
    {loading ? <div className="inspection-loading">İstasyon listesi hazırlanıyor…</div> : <>
      <section className="activation-summary"><div><strong>{completed}/{stations.length}</strong><span>Kontrol edilen</span></div><span><Activity /> {summary.activity} aktivite</span><span><Wrench /> {summary.damaged} hasarlı</span><span><Ban /> {summary.inaccessible} ulaşılamadı</span></section>
      <div className="activation-workspace"><aside>{stations.map((station, index) => <button type="button" key={`${station.sitePlanElementId ?? 'manual'}-${index}`} className={`${index === selected ? 'active' : ''} status-${station.deviceStatus.toLowerCase()}`} onClick={() => setSelected(index)}><strong>{station.deviceNumber || `Yeni ${index + 1}`}</strong><small>{station.area || 'Konum girilmedi'}</small><em>{statusLabel(station.deviceStatus)}</em></button>)}{!readOnly && <button type="button" className="activation-add" onClick={() => { setStations((items) => [...items, blankStation()]); setSelected(stations.length); }}><Plus /> İstasyon ekle</button>}</aside>
        {current && <main><div className="activation-fields"><label>İstasyon numarası<input value={current.deviceNumber} disabled={readOnly} onChange={(event) => update({ deviceNumber: event.target.value.toUpperCase() })} placeholder="M 01" /></label><label>Konum / alan<input value={current.area} disabled={readOnly} onChange={(event) => update({ area: event.target.value })} placeholder="Üretim çıkışı" /></label><CatalogSelect label="Ekipman türü" value={equipmentCatalogValue(current.deviceType, catalog.equipmentTypes)} options={catalog.equipmentTypes} disabled={readOnly} onChange={(value) => update({ deviceType: value.startsWith('Diğer: ') ? value : value.split(' - ')[0] })} /></div>
          <div className="inspection-status-grid"><Status active={current.deviceStatus === 'Activity'} icon={<Activity />} label="Aktivite var" disabled={readOnly} onClick={() => choose('Activity')} /><Status active={current.deviceStatus === 'NoActivity'} icon={<CheckCircle2 />} label="Aktivite yok" disabled={readOnly} onClick={() => choose('NoActivity')} /><Status active={current.deviceStatus === 'Damaged'} icon={<Wrench />} label="Kırık / hasarlı" disabled={readOnly} onClick={() => choose('Damaged')} /><Status active={current.deviceStatus === 'Inaccessible'} icon={<Ban />} label="Ulaşılamadı" disabled={readOnly} onClick={() => choose('Inaccessible')} /></div>
          {current.deviceStatus === 'Activity' && <div className="activation-activity-panel"><div className="activation-fields"><CatalogSelect label="Zararlı türü" value={current.targetPest ?? ''} options={catalog.pestTypes} disabled={readOnly} onChange={(value) => update({ targetPest: value })} /><CatalogSelect label="Aktivite bulgusu" value={current.activityType ?? ''} options={catalog.activityTypes} labels={activityLabels} disabled={readOnly} onChange={(value) => update({ activityType: value })} /></div><div className="activation-count-field"><strong>Görülen / yakalanan adet</strong><div className="activation-quick-counts">{catalog.quickCounts.map((count) => <button type="button" key={count} disabled={readOnly} className={current.caughtCount === count ? 'active' : ''} onClick={() => update({ caughtCount: current.caughtCount === count ? 0 : count })}>{count}</button>)}<button type="button" disabled={readOnly} className={current.caughtCount > 10 ? 'active' : ''} onClick={() => update({ caughtCount: current.caughtCount > 10 ? 0 : 11 })}>10+</button></div>{current.caughtCount > 10 && <input type="number" min="11" value={current.caughtCount} disabled={readOnly} onChange={(event) => update({ caughtCount: Number(event.target.value) })} aria-label="Özel aktivite adedi" />}</div></div>}
          {current.deviceStatus === 'Inaccessible' && <CatalogSelect className="activation-wide" label="Ulaşılamama nedeni" value={current.inaccessibilityReason ?? ''} options={catalog.inaccessibilityReasons} disabled={readOnly} onChange={(value) => update({ inaccessibilityReason: value })} />}
          {current.deviceStatus !== 'Unchecked' && <label className="activation-wide">İstasyon açıklaması<textarea value={current.notes ?? ''} disabled={readOnly} onChange={(event) => update({ notes: event.target.value })} placeholder="Yapılan işlem, değişim veya saha notu…" /></label>}
          {!readOnly && stations.length > 1 && <button type="button" className="activation-remove" onClick={() => { setStations((items) => items.filter((_, index) => index !== selected)); setSelected(Math.max(0, selected - 1)); }}><Trash2 /> İstasyonu kaldır</button>}</main>}
      </div>
      <label className="activation-general-note">Aktivasyon genel notu<textarea value={notes} disabled={readOnly} onChange={(event) => setNotes(event.target.value)} placeholder="Tur özeti, değişiklikler ve takip notları…" /></label>
      {error && <div className="modal-form-error"><AlertTriangle />{error}</div>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Kapat</button>{record?.status === 'Finalized' && <button type="button" className="secondary-button" onClick={() => void download()}><FileDown /> PDF</button>}{!readOnly && <><button type="button" className="secondary-button" disabled={saving} onClick={() => void save(false)}><Save /> Taslak Kaydet</button><button type="button" className="primary-button" disabled={saving} onClick={() => void save(true)}><Check /> Aktivasyonu Onayla</button></>}</div>
    </>}
  </div></div>;
}

function Status({ active, icon, label, disabled, onClick }: { active: boolean; icon: React.ReactNode; label: string; disabled: boolean; onClick: () => void }) {
  return <button type="button" className={active ? 'active' : ''} disabled={disabled} onClick={onClick}>{icon}<span>{label}</span></button>;
}
function statusLabel(value: string) {
  return ({ Unchecked: 'Kontrol bekliyor', NoActivity: 'Aktivite yok', Activity: 'Aktivite var', Damaged: 'Kırık / hasarlı', Inaccessible: 'Ulaşılamadı' } as Record<string, string>)[value] ?? value;
}

function CatalogSelect({ label, value, options, labels, disabled, className, onChange }: { label: string; value: string; options: string[]; labels?: Record<string, string>; disabled: boolean; className?: string; onChange: (value: string) => void }) {
  const isOther = value.startsWith('Diğer: ');
  const known = options.includes(value);
  return <label className={className}>{label}<select value={isOther || (!known && value) ? '__other__' : value} disabled={disabled} onChange={(event) => onChange(event.target.value === '__other__' ? 'Diğer: ' : event.target.value)}><option value="">Seçiniz</option>{options.map((option) => <option key={option} value={option}>{labels?.[option] ?? option}</option>)}<option value="__other__">Diğer</option></select>{(isOther || (!known && value)) && <input value={isOther ? value.slice(7) : value} disabled={disabled} onChange={(event) => onChange(`Diğer: ${event.target.value}`)} placeholder="Manuel açıklama" />}</label>;
}

function equipmentCatalogValue(value: string, options: string[]) {
  return options.find((option) => option.startsWith(`${value} - `)) ?? value;
}
