import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Copy, Download, DoorOpen, Eye, Grid3X3, LayoutTemplate, Map, Minus, MousePointer2, Plus, QrCode, Redo2, RotateCcw, Save, Shapes, Share2, Square, Trash2, Type, Undo2, X } from 'lucide-react';
import type { QualityLocation } from '../../services/qualityApi';
import {
  createSitePlan, downloadSitePlan, getSitePlans, shareSitePlan, SitePlanSessionExpiredError, updateSitePlan,
  type SaveSitePlanInput, type SitePlanCanvas, type SitePlanElement, type SitePlanEquipmentShape,
  type SitePlanEquipmentType, type SitePlanRecord,
} from '../../services/sitePlanApi';
import QrScannerModal from '../modals/QrScannerModal';
import './sitePlanCenter.css';

type Props = {
  accessToken: string;
  mode: 'staff' | 'customer';
  locations: QualityLocation[];
  onSessionExpired: () => void;
  onCount?: (count: number) => void;
  onSaved?: () => void | Promise<void>;
};

const defaultEquipmentTypes: SitePlanEquipmentType[] = [
  { id: 'outside-rodent', code: 'R', name: 'Dış Alan Yemli İstasyon', color: '#2563EB', shape: 'square' },
  { id: 'inside-live-trap', code: 'C', name: 'İç Alan Canlı Yakalama İstasyonu', color: '#F59E0B', shape: 'circle' },
  { id: 'fly-device', code: 'E', name: 'Elektrikli Sinek Yakalama Cihazı', color: '#DC2626', shape: 'star' },
  { id: 'moth-monitor', code: 'G', name: 'Güve Monitörü', color: '#7C3AED', shape: 'hexagon' },
  { id: 'insect-monitor', code: 'B', name: 'Böcek Monitörü', color: '#10A37F', shape: 'diamond' },
];

const emptyCanvas = (): SitePlanCanvas => ({ width: 1200, height: 720, equipmentTypes: defaultEquipmentTypes.map((item) => ({ ...item })), elements: [] });
const uid = () => crypto.randomUUID();

export default function SitePlanCenter({ accessToken, mode, locations, onSessionExpired, onCount, onSaved }: Props) {
  const [plans, setPlans] = useState<SitePlanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SitePlanRecord | 'new' | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const items = await getSitePlans(accessToken);
      setPlans(items); onCount?.(items.length);
    } catch (loadError) {
      if (loadError instanceof SitePlanSessionExpiredError) return onSessionExpired();
      setError(messageOf(loadError));
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [accessToken]);

  const download = async (plan: SitePlanRecord, open = false) => {
    try { await downloadSitePlan(accessToken, plan, open); }
    catch (downloadError) {
      if (downloadError instanceof SitePlanSessionExpiredError) return onSessionExpired();
      setError(messageOf(downloadError));
    }
  };

  const share = async (plan: SitePlanRecord) => {
    try { await shareSitePlan(accessToken, plan); }
    catch (shareError) {
      if (shareError instanceof SitePlanSessionExpiredError) return onSessionExpired();
      setError(messageOf(shareError));
    }
  };

  const save = async (input: SaveSitePlanInput) => {
    try {
      const saved = editing === 'new' ? await createSitePlan(accessToken, input) : await updateSitePlan(accessToken, editing!.id, input);
      setPlans((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      onCount?.(editing === 'new' ? plans.length + 1 : plans.length);
      void onSaved?.();
      setEditing(null);
    } catch (saveError) {
      if (saveError instanceof SitePlanSessionExpiredError) onSessionExpired();
      throw saveError;
    }
  };

  return <div className="site-plan-module">
    <div className="quality-module-heading site-plan-heading"><div><p className="eyebrow">DENETİME HAZIR DİJİTAL KROKİ</p><h2>Ekipman yerleşim planları</h2><p>Numaralı izleme noktalarını A4 yatay planda çizin, revizyonlayın ve müşterinizle PDF olarak paylaşın.</p></div>{mode === 'staff' && <button className="primary-button" onClick={() => setEditing('new')}><Plus size={17} /> Yeni Kroki Oluştur</button>}</div>
    {error && <div className="site-plan-error">{error}<button onClick={() => setError(null)}>Kapat</button></div>}
    {loading ? <div className="surface site-plan-empty"><RotateCcw className="spin-icon" /><strong>Yerleşim planları yükleniyor…</strong></div> : plans.length === 0 ? <div className="surface site-plan-empty"><Map /><strong>Henüz yerleşim planı yok</strong><span>{mode === 'staff' ? 'İlk A4 krokinizi oluşturarak istasyonları numaralandırın.' : 'Firmanız tarafından yayımlanan planlar burada görünür.'}</span></div> : <div className="site-plan-grid">{plans.map((plan) => <article className="surface site-plan-card" key={plan.id}><div className="site-plan-card-preview"><MiniPlan canvas={plan.canvas} /></div><div className="site-plan-card-body"><span>{plan.number} · R{String(plan.revision).padStart(2, '0')}</span><h3>{plan.title}</h3><p>{plan.customerName} · {plan.branchName}</p><div><small>{plan.areaName}</small><small>{stationCount(plan.canvas)} ekipman noktası</small></div></div><footer><span>{formatDate(plan.updatedAt)} · {plan.createdBy}</span><div><button title="PDF görüntüle" onClick={() => void download(plan, true)}><Eye size={16} /></button><button title="PDF indir" onClick={() => void download(plan)}><Download size={16} /></button><button title="Paylaş" onClick={() => void share(plan)}><Share2 size={16} /></button>{mode === 'staff' && <button title="Planı düzenle" onClick={() => setEditing(plan)}><MousePointer2 size={16} /></button>}</div></footer></article>)}</div>}
    {editing && <SitePlanEditor locations={locations} plan={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSave={save} />}
  </div>;
}

function SitePlanEditor({ locations, plan, onClose, onSave }: { locations: QualityLocation[]; plan?: SitePlanRecord; onClose: () => void; onSave: (input: SaveSitePlanInput) => Promise<void> }) {
  const initialCanvas = plan ? structuredClone(plan.canvas) : emptyCanvas();
  const [elements, setElements] = useState<SitePlanElement[]>(initialCanvas.elements);
  const [equipmentTypes, setEquipmentTypes] = useState<SitePlanEquipmentType[]>(initialCanvas.equipmentTypes);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeEquipmentId, setActiveEquipmentId] = useState(initialCanvas.equipmentTypes[0]?.id ?? '');
  const [locationKey, setLocationKey] = useState(plan ? `${plan.customerId}|${plan.branchId ?? ''}` : locationValue(locations[0]));
  const [title, setTitle] = useState(plan?.title ?? 'Zararlı Mücadelesi Ekipman Yerleşim Planı');
  const [areaName, setAreaName] = useState(plan?.areaName ?? 'İç ve Dış Alan');
  const [fieldGuide, setFieldGuide] = useState(plan?.fieldGuide ?? 'BRCGS / Saha Kılavuzu');
  const [revisionNote, setRevisionNote] = useState('');
  const [zoom, setZoom] = useState(() => window.matchMedia('(max-width: 760px)').matches ? 0.28 : 0.72);
  const [snap, setSnap] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customType, setCustomType] = useState({ code: '', name: '', color: '#0EA5E9', shape: 'square' as SitePlanEquipmentShape });
  const [mobilePanel, setMobilePanel] = useState<'canvas' | 'tools' | 'inspector'>('canvas');
  const [mobileMetaOpen, setMobileMetaOpen] = useState(false);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const undoStack = useRef<SitePlanElement[][]>([]);
  const redoStack = useRef<SitePlanElement[][]>([]);
  const drag = useRef<{ id: string; offsetX: number; offsetY: number; before: SitePlanElement[] } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const selected = elements.find((item) => item.id === selectedId);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  const apply = (next: SitePlanElement[]) => {
    undoStack.current.push(structuredClone(elements));
    redoStack.current = [];
    setElements(next);
  };
  const undo = () => { const previous = undoStack.current.pop(); if (!previous) return; redoStack.current.push(structuredClone(elements)); setElements(previous); setSelectedId(null); };
  const redo = () => { const next = redoStack.current.pop(); if (!next) return; undoStack.current.push(structuredClone(elements)); setElements(next); setSelectedId(null); };
  const addElement = (type: SitePlanElement['type'], width = 240, height = 130) => {
    const base = { id: uid(), type, x: 380, y: 270, width, height, rotation: 0, strokeWidth: 3, stroke: '#102A43', fill: '#FFFFFF' } as SitePlanElement;
    if (type === 'line') Object.assign(base, { width: 260, height: 0, fill: undefined });
    if (type === 'door') Object.assign(base, { width: 90, height: 90, fill: undefined });
    if (type === 'text') Object.assign(base, { width: 220, height: 24, text: 'Alan etiketi', fill: '#102A43', stroke: undefined });
    apply([...elements, base]); setSelectedId(base.id); setMobilePanel('canvas');
  };
  const addStation = (equipmentTypeId = activeEquipmentId) => {
    const equipment = equipmentTypes.find((item) => item.id === equipmentTypeId);
    if (!equipment) return;
    const nextSequence = elements.filter((item) => item.type === 'station' && item.equipmentTypeId === equipmentTypeId).length + 1;
    const station: SitePlanElement = { id: uid(), type: 'station', x: 560, y: 330, width: 34, height: 34, rotation: 0, strokeWidth: 2, equipmentTypeId, stationNumber: `${equipment.code}${String(nextSequence).padStart(2, '0')}`, qrCode: newStationQrCode() };
    apply([...elements, station]); setSelectedId(station.id); setMobilePanel('canvas');
  };
  const updateSelected = (patch: Partial<SitePlanElement>) => { if (!selectedId) return; apply(elements.map((item) => item.id === selectedId ? { ...item, ...patch } : item)); };
  const removeSelected = () => { if (!selectedId) return; apply(elements.filter((item) => item.id !== selectedId)); setSelectedId(null); };
  const duplicateSelected = () => { if (!selected) return; const copy = { ...selected, id: uid(), x: selected.x + 24, y: selected.y + 24, ...(selected.type === 'station' ? { qrCode: newStationQrCode() } : {}) }; apply([...elements, copy]); setSelectedId(copy.id); };
  const pairQrCode = (value: string) => {
    if (!selectedId) return;
    const qrCode = value.trim();
    if (qrCode.length < 3) return setError('QR kimliği en az 3 karakter olmalıdır.');
    if (elements.some((item) => item.id !== selectedId && item.qrCode?.trim().toLocaleUpperCase('tr-TR') === qrCode.toLocaleUpperCase('tr-TR'))) return setError('Bu QR kimliği başka bir istasyonla eşleştirilmiş.');
    updateSelected({ qrCode });
    setQrScannerOpen(false);
    setError(null);
  };
  const point = (event: ReactPointerEvent<SVGSVGElement>) => {
    const bounds = svgRef.current!.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * 1200 / bounds.width, y: (event.clientY - bounds.top) * 720 / bounds.height };
  };
  const startDrag = (event: ReactPointerEvent<SVGGElement>, item: SitePlanElement) => {
    event.stopPropagation(); setSelectedId(item.id);
    const location = point(event as unknown as ReactPointerEvent<SVGSVGElement>);
    drag.current = { id: item.id, offsetX: location.x - item.x, offsetY: location.y - item.y, before: structuredClone(elements) };
    svgRef.current?.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const location = point(event); const grid = snap ? 10 : 1;
    const x = Math.round((location.x - drag.current.offsetX) / grid) * grid;
    const y = Math.round((location.y - drag.current.offsetY) / grid) * grid;
    setElements((current) => current.map((item) => item.id === drag.current?.id ? { ...item, x: clamp(x, -100, 1300), y: clamp(y, -100, 820) } : item));
  };
  const endDrag = () => { if (!drag.current) return; undoStack.current.push(drag.current.before); redoStack.current = []; drag.current = null; };

  const addCustomType = (event: FormEvent) => {
    event.preventDefault();
    const code = customType.code.trim().toUpperCase(); const name = customType.name.trim();
    if (!/^[A-Z0-9]{1,4}$/.test(code) || name.length < 2) return setError('Özel ekipman için 1-4 karakter kod ve açıklayıcı bir ad girin.');
    if (equipmentTypes.some((item) => item.code === code)) return setError('Bu ekipman kodu zaten kullanılıyor.');
    const created = { ...customType, id: uid(), code, name };
    setEquipmentTypes((current) => [...current, created]); setActiveEquipmentId(created.id); setCustomOpen(false); setError(null);
  };
  const submit = async () => {
    const location = locations.find((item) => locationValue(item) === locationKey);
    if (!location) return setError('Müşteri veya şube seçin. Bu personel için atanmış bir konum bulunmuyorsa önce iş ataması yapın.');
    if (elements.length === 0) return setError('Krokiye en az bir alan, çizgi veya ekipman noktası ekleyin.');
    const qrCodes = elements.filter((item) => item.type === 'station' && item.qrCode?.trim()).map((item) => item.qrCode!.trim().toLocaleUpperCase('tr-TR'));
    if (new Set(qrCodes).size !== qrCodes.length) return setError('Her QR kimliği yalnızca bir istasyonla eşleştirilebilir. Tekrarlanan kodu düzeltin.');
    setSaving(true); setError(null);
    try { await onSave({ customerId: location.customerId, branchId: location.branchId, title, areaName, fieldGuide, revisionNote, canvas: { width: 1200, height: 720, equipmentTypes, elements } }); }
    catch (saveError) { setError(messageOf(saveError)); }
    finally { setSaving(false); }
  };

  return <div className="site-plan-editor-layer"><div className="site-plan-editor-shell">
    <header><div><span className="site-plan-editor-icon"><Map /></span><div><p className="eyebrow">DİJİTAL KROKİ STÜDYOSU</p><h2>{plan ? 'Yerleşim planını düzenle' : 'Yeni ekipman yerleşim planı'}</h2><p>A4 yatay çıktı · otomatik lejant · revizyon kontrollü PDF</p></div></div><button className="icon-button" onClick={onClose}><X /></button></header>
    <button className="site-plan-mobile-meta-toggle" onClick={() => setMobileMetaOpen((current) => !current)} aria-expanded={mobileMetaOpen}><Map size={17} /> Belge ve müşteri bilgileri <span>{mobileMetaOpen ? 'Gizle' : 'Düzenle'}</span></button>
    <div className={`site-plan-meta ${mobileMetaOpen ? 'mobile-open' : ''}`}><label>Müşteri / Şube<select value={locationKey} onChange={(event) => setLocationKey(event.target.value)}><option value="">Seçin</option>{locations.map((item) => <option key={locationValue(item)} value={locationValue(item)}>{item.customerName} · {item.branchName}</option>)}</select></label><label>Belge başlığı<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Alan / Kat<input value={areaName} onChange={(event) => setAreaName(event.target.value)} /></label><label>Standart / Kılavuz<input value={fieldGuide} onChange={(event) => setFieldGuide(event.target.value)} /></label></div>
    <nav className="site-plan-mobile-tabs" aria-label="Kroki düzenleme bölümleri"><button className={mobilePanel === 'canvas' ? 'active' : ''} onClick={() => setMobilePanel('canvas')}><Map /> Çizim</button><button className={mobilePanel === 'tools' ? 'active' : ''} onClick={() => setMobilePanel('tools')}><Shapes /> Araçlar</button><button className={mobilePanel === 'inspector' ? 'active' : ''} onClick={() => setMobilePanel('inspector')}><MousePointer2 /> Özellikler{selected && <i />}</button></nav>
    <div className="site-plan-workspace">
      <aside className={`site-plan-tools ${mobilePanel === 'tools' ? 'mobile-panel-active' : ''}`}><h3><Shapes /> Çizim araçları</h3><div className="site-plan-tool-grid"><button onClick={() => addElement('rect', 140, 140)}><Square />Kare</button><button onClick={() => addElement('rect', 280, 160)}><LayoutTemplate />Dikdörtgen / Oda</button><button onClick={() => addElement('line')}><Minus />Çizgi</button><button onClick={() => addElement('door')}><DoorOpen />Kapı</button><button onClick={() => addElement('text')}><Type />Metin</button></div><h3><Grid3X3 /> Ekipman noktaları</h3><div className="equipment-palette">{equipmentTypes.map((item) => <button key={item.id} className={activeEquipmentId === item.id ? 'active' : ''} onClick={() => { setActiveEquipmentId(item.id); addStation(item.id); }}><EquipmentSymbol item={item} /><span><b>{item.code}</b>{item.name}</span><Plus /></button>)}</div><button className="add-custom-equipment" onClick={() => setCustomOpen((current) => !current)}><Plus /> Manuel ekipman tanımla</button>{customOpen && <form className="custom-equipment-form" onSubmit={addCustomType}><input maxLength={4} placeholder="Kod" value={customType.code} onChange={(event) => setCustomType({ ...customType, code: event.target.value })} /><input placeholder="Ekipman adı" value={customType.name} onChange={(event) => setCustomType({ ...customType, name: event.target.value })} /><select value={customType.shape} onChange={(event) => setCustomType({ ...customType, shape: event.target.value as SitePlanEquipmentShape })}><option value="square">Kare</option><option value="circle">Daire</option><option value="diamond">Baklava</option><option value="star">Yıldız</option><option value="hexagon">Altıgen</option></select><input type="color" value={customType.color} onChange={(event) => setCustomType({ ...customType, color: event.target.value })} /><button>Tanımla</button></form>}</aside>
      <main className={`site-plan-stage ${mobilePanel === 'canvas' ? 'mobile-panel-active' : ''}`}><div className="site-plan-toolbar"><div><button disabled={!undoStack.current.length} onClick={undo} title="Geri al"><Undo2 /></button><button disabled={!redoStack.current.length} onClick={redo} title="Yinele"><Redo2 /></button><button disabled={!selected} onClick={duplicateSelected} title="Çoğalt"><Copy /></button><button disabled={!selected} onClick={removeSelected} title="Sil"><Trash2 /></button></div><div><button className={snap ? 'active' : ''} onClick={() => setSnap((current) => !current)}><Grid3X3 /> Izgaraya yapış</button><select aria-label="Kroki yakınlaştırma" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}><option value="0.28">Sığdır</option><option value="0.4">%40</option><option value="0.55">%55</option><option value="0.72">%72</option><option value="0.9">%90</option><option value="1">%100</option></select></div></div><div className="site-plan-canvas-scroll"><div className="site-plan-paper" style={{ width: 1200 * zoom, height: 720 * zoom }}><svg ref={svgRef} viewBox="0 0 1200 720" onPointerDown={() => setSelectedId(null)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>{snap && <defs><pattern id="site-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#E2E8F0" strokeWidth="1" /></pattern></defs>}<rect width="1200" height="720" fill={snap ? 'url(#site-grid)' : '#FFFFFF'} />{elements.map((item) => <CanvasElement key={item.id} item={item} equipmentTypes={equipmentTypes} selected={item.id === selectedId} onPointerDown={startDrag} />)}</svg></div></div><p className="site-plan-touch-hint">Boş alanda kaydırın, öğeyi basılı tutup sürükleyin.</p></main>
      <aside className={`site-plan-inspector ${mobilePanel === 'inspector' ? 'mobile-panel-active' : ''}`}><h3><MousePointer2 /> Özellikler</h3>{selected ? <ElementInspector element={selected} equipmentTypes={equipmentTypes} onChange={updateSelected} onDelete={removeSelected} onQrPair={() => setQrScannerOpen(true)} /> : <div className="inspector-empty"><MousePointer2 /><strong>Bir öğe seçin</strong><span>Konum, ölçü, metin ve numarayı buradan düzenleyin.</span></div>}<div className="site-plan-summary"><h4>Plan özeti</h4>{equipmentTypes.map((type) => <div key={type.id}><span><i style={{ background: type.color }} />{type.code} · {type.name}</span><b>{elements.filter((item) => item.type === 'station' && item.equipmentTypeId === type.id).length}</b></div>)}</div></aside>
    </div>
    <footer className="site-plan-editor-footer"><div><label>Revizyon notu<input value={revisionNote} onChange={(event) => setRevisionNote(event.target.value)} /></label>{error && <span>{error}</span>}</div><button className="secondary-button" onClick={onClose}>Vazgeç</button><button className="primary-button" onClick={() => void submit()} disabled={saving}><Save size={17} />{saving ? 'PDF hazırlanıyor…' : plan ? `R${String(plan.revision + 1).padStart(2, '0')} olarak yayımla` : 'Planı yayımla'}</button></footer>
  </div>{qrScannerOpen && <QrScannerModal onClose={() => setQrScannerOpen(false)} onScan={pairQrCode} />}</div>;
}

function ElementInspector({ element, equipmentTypes, onChange, onDelete, onQrPair }: { element: SitePlanElement; equipmentTypes: SitePlanEquipmentType[]; onChange: (patch: Partial<SitePlanElement>) => void; onDelete: () => void; onQrPair: () => void }) {
  const number = (key: keyof SitePlanElement, label: string) => <label>{label}<input type="number" value={Number(element[key] ?? 0) || ''} onChange={(event) => onChange({ [key]: Number(event.target.value) })} /></label>;
  return <div className="element-inspector"><span className="selected-kind">{elementLabel(element.type)}</span><div className="inspector-grid">{number('x', 'X')}{number('y', 'Y')}{element.type !== 'text' && number('width', element.type === 'line' ? 'X uzunluğu' : 'Genişlik')}{element.type !== 'text' && number('height', element.type === 'line' ? 'Y uzunluğu' : 'Yükseklik')}</div>{element.type === 'rect' && <label>Alan adı<input value={element.text ?? ''} onChange={(event) => onChange({ text: event.target.value })} /></label>}{element.type === 'text' && <label>Metin<input value={element.text ?? ''} onChange={(event) => onChange({ text: event.target.value })} /></label>}{element.type === 'station' && <><label>Ekipman türü<select value={element.equipmentTypeId} onChange={(event) => onChange({ equipmentTypeId: event.target.value })}>{equipmentTypes.map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</select></label><label>İstasyon numarası<input value={element.stationNumber ?? ''} onChange={(event) => onChange({ stationNumber: event.target.value.toUpperCase() })} /></label><label>QR kimliği<input maxLength={160} value={element.qrCode ?? ''} onChange={(event) => onChange({ qrCode: event.target.value })} placeholder="Etiketteki kodu yazın veya okutun" /></label><div className="station-qr-actions"><button onClick={() => onChange({ qrCode: newStationQrCode() })}><RotateCcw /> Otomatik üret</button><button onClick={onQrPair}><QrCode /> QR okut ve eşleştir</button></div><small className="station-qr-help">Bu kimlik yalnızca bu istasyona ait olmalıdır. Mevcut etiketinizi okutarak da eşleştirebilirsiniz.</small></>}{element.type !== 'station' && <><label>Çizgi rengi<input type="color" value={element.stroke ?? '#102A43'} onChange={(event) => onChange({ stroke: event.target.value })} /></label>{element.type === 'rect' && <label>Dolgu rengi<input type="color" value={element.fill ?? '#FFFFFF'} onChange={(event) => onChange({ fill: event.target.value })} /></label>}</>}<button className="inspector-delete" onClick={onDelete}><Trash2 /> Seçili öğeyi sil</button></div>;
}

function CanvasElement({ item, equipmentTypes, selected, onPointerDown }: { item: SitePlanElement; equipmentTypes: SitePlanEquipmentType[]; selected: boolean; onPointerDown: (event: ReactPointerEvent<SVGGElement>, item: SitePlanElement) => void }) {
  const equipment = equipmentTypes.find((type) => type.id === item.equipmentTypeId);
  const transform = item.rotation ? `rotate(${item.rotation} ${item.x + item.width / 2} ${item.y + item.height / 2})` : undefined;
  const hitX = Math.min(item.x, item.x + item.width) - 14;
  const hitY = Math.min(item.y, item.y + item.height) - 14;
  const hitWidth = Math.max(44, Math.abs(item.width) + 28);
  const hitHeight = Math.max(44, Math.abs(item.height) + 28);
  return <g className="canvas-element" transform={transform} onPointerDown={(event) => onPointerDown(event, item)}><rect className="canvas-hit-area" x={hitX} y={hitY} width={hitWidth} height={hitHeight} />{item.type === 'rect' && <><rect x={item.x} y={item.y} width={item.width} height={item.height} rx="3" fill={item.fill ?? '#FFFFFF'} stroke={item.stroke ?? '#102A43'} strokeWidth={item.strokeWidth} />{item.text && <text x={item.x + item.width / 2} y={item.y + item.height / 2} textAnchor="middle" dominantBaseline="middle">{item.text}</text>}</>}{item.type === 'line' && <line x1={item.x} y1={item.y} x2={item.x + item.width} y2={item.y + item.height} stroke={item.stroke ?? '#102A43'} strokeWidth={item.strokeWidth} strokeLinecap="round" />}{item.type === 'door' && <><line x1={item.x} y1={item.y} x2={item.x + item.width} y2={item.y} stroke={item.stroke ?? '#102A43'} strokeWidth={item.strokeWidth} /><path d={`M ${item.x} ${item.y} A ${Math.abs(item.width)} ${Math.abs(item.height)} 0 0 1 ${item.x + item.width} ${item.y + item.height}`} fill="none" stroke="#94A3B8" strokeWidth="2" strokeDasharray="5 4" /></>}{item.type === 'text' && <text x={item.x} y={item.y} fontSize={clamp(item.height, 12, 48)} fontWeight="700" fill={item.fill ?? '#102A43'}>{item.text ?? 'Alan etiketi'}</text>}{item.type === 'station' && equipment && <><g transform={`translate(${item.x} ${item.y})`}><EquipmentShapeSvg shape={equipment.shape} color={equipment.color} width={item.width} height={item.height} /><text x={item.width / 2} y={item.height / 2} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={Math.max(10, item.height * .34)} fontWeight="800">{equipment.code}</text></g><text x={item.x + item.width + 5} y={item.y + item.height / 2} dominantBaseline="middle" fontSize="13" fontWeight="800">{item.stationNumber}</text></>}{selected && <rect className="selection-box" x={Math.min(item.x, item.x + item.width) - 7} y={Math.min(item.y, item.y + item.height) - 7} width={Math.abs(item.width) + 14} height={Math.abs(item.height) + 14} />}</g>;
}

function EquipmentSymbol({ item }: { item: SitePlanEquipmentType }) { return <svg viewBox="0 0 40 40"><EquipmentShapeSvg shape={item.shape} color={item.color} width={40} height={40} /><text x="20" y="20" textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="13" fontWeight="800">{item.code}</text></svg>; }
function EquipmentShapeSvg({ shape, color, width, height }: { shape: SitePlanEquipmentShape; color: string; width: number; height: number }) {
  if (shape === 'circle') return <ellipse cx={width / 2} cy={height / 2} rx={width / 2} ry={height / 2} fill={color} stroke="#fff" strokeWidth="2" />;
  if (shape === 'diamond') return <polygon points={`${width / 2},0 ${width},${height / 2} ${width / 2},${height} 0,${height / 2}`} fill={color} stroke="#fff" strokeWidth="2" />;
  if (shape === 'star') return <polygon points={starPoints(width, height)} fill={color} stroke="#fff" strokeWidth="2" />;
  if (shape === 'hexagon') return <polygon points={`${width * .25},0 ${width * .75},0 ${width},${height / 2} ${width * .75},${height} ${width * .25},${height} 0,${height / 2}`} fill={color} stroke="#fff" strokeWidth="2" />;
  return <rect width={width} height={height} rx="4" fill={color} stroke="#fff" strokeWidth="2" />;
}
function MiniPlan({ canvas }: { canvas: SitePlanCanvas }) { return <svg viewBox="0 0 1200 720"><rect width="1200" height="720" fill="#fff" />{canvas.elements.slice(0, 160).map((item) => <CanvasElement key={item.id} item={item} equipmentTypes={canvas.equipmentTypes} selected={false} onPointerDown={() => undefined} />)}</svg>; }
function starPoints(width: number, height: number) { return Array.from({ length: 10 }, (_, index) => { const angle = -Math.PI / 2 + index * Math.PI / 5; const radius = index % 2 === 0 ? .5 : .22; return `${width / 2 + Math.cos(angle) * width * radius},${height / 2 + Math.sin(angle) * height * radius}`; }).join(' '); }
function locationValue(location?: QualityLocation) { return location ? `${location.customerId}|${location.branchId ?? ''}` : ''; }
function newStationQrCode() { return `PST-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`; }
function stationCount(canvas: SitePlanCanvas) { return canvas.elements.filter((item) => item.type === 'station').length; }
function elementLabel(type: SitePlanElement['type']) { return ({ rect: 'Alan / Dikdörtgen', line: 'Çizgi', door: 'Kapı', text: 'Metin', station: 'Ekipman noktası' })[type]; }
function clamp(value: number, minimum: number, maximum: number) { return Math.min(maximum, Math.max(minimum, value)); }
function formatDate(value: string) { return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)); }
function messageOf(error: unknown) { return error instanceof Error ? error.message : 'İşlem tamamlanamadı.'; }
