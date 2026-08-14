import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Camera, ChevronDown, ChevronUp, ClipboardCheck, Clock3, Eye, FileWarning, Plus, RefreshCw, Share2, ShieldCheck, Upload, X } from 'lucide-react';
import type { EmployeeRecord } from '../../services/employeeApi';
import { getQualityLocations, type QualityLocation } from '../../services/qualityApi';
import { approveCorrectiveAction, createCorrectiveAction, downloadCorrectiveActionEvidence, getCorrectiveActions, shareCorrectiveActionEvidence, updateCorrectiveAction, uploadCorrectiveActionEvidence, CorrectiveActionSessionExpiredError, type CorrectiveAction, type CreateCorrectiveActionInput, type UpdateCorrectiveActionInput } from '../../services/correctiveActionApi';

type Props = { accessToken: string; mode: 'staff' | 'customer'; employees?: EmployeeRecord[]; onSessionExpired: () => void; standalone?: boolean };
type StatusFilter = 'All' | CorrectiveAction['status'];
const statusLabels: Record<CorrectiveAction['status'], string> = { Open: 'Açık', InProgress: 'Çalışılıyor', AwaitingCustomer: 'Müşteri bekleniyor', Completed: 'Tamamlandı', Verified: 'Doğrulandı', Rejected: 'Reddedildi', Cancelled: 'İptal' };
const partyLabels = { Customer: 'Müşteri', Company: 'İlaçlama firması', Joint: 'Ortak sorumluluk' };
const priorityLabels = { Low: 'Düşük', Normal: 'Normal', High: 'Yüksek', Critical: 'Kritik' };

export default function CorrectiveActionCenter({ accessToken, mode, employees = [], onSessionExpired, standalone = false }: Props) {
  const [items, setItems] = useState<CorrectiveAction[]>([]); const [locations, setLocations] = useState<QualityLocation[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('All'); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null); const [editing, setEditing] = useState<CorrectiveAction | 'new' | null>(null);
  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [list, locs] = await Promise.all([getCorrectiveActions(accessToken), mode === 'staff' ? getQualityLocations(accessToken) : Promise.resolve([])]);
      setItems(list); setLocations(locs);
    } catch (loadError) {
      if (loadError instanceof CorrectiveActionSessionExpiredError) return onSessionExpired();
      setError(loadError instanceof Error ? loadError.message : 'Düzeltici faaliyetler yüklenemedi.');
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [accessToken, mode]);

  const openCount = items.filter((item) => item.status === 'Open' || item.status === 'InProgress').length;
  const overdueCount = items.filter((item) => item.isOverdue).length;
  const recurringCount = items.filter((item) => item.recurrenceCount > 1).length;
  const approvedCount = items.filter((item) => item.customerApprovalStatus === 'Approved').length;
  const visible = items.filter((item) => filter === 'All' ? true : item.status === filter);

  const upload = async (item: CorrectiveAction, file: File, stage: 'Before' | 'After') => {
    try {
      const evidence = await uploadCorrectiveActionEvidence(accessToken, item.id, file, stage, undefined, mode === 'customer');
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, evidence: [...entry.evidence, evidence] } : entry));
    } catch (uploadError) {
      if (uploadError instanceof CorrectiveActionSessionExpiredError) return onSessionExpired();
      setError(uploadError instanceof Error ? uploadError.message : 'Kanıt yüklenemedi.');
    }
  };
  const approve = async (item: CorrectiveAction, approved: boolean) => {
    try {
      const updated = await approveCorrectiveAction(accessToken, item.id, approved);
      setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry));
    } catch (approveError) {
      if (approveError instanceof CorrectiveActionSessionExpiredError) return onSessionExpired();
      setError(approveError instanceof Error ? approveError.message : 'Onay işlemi tamamlanamadı.');
    }
  };

  return <section className={`compliance-center ${standalone ? 'page' : 'embedded'}`}>
    <div className="compliance-heading"><div><p className="eyebrow">DÜZELTİCİ VE ÖNLEYİCİ FAALİYET (DÖF / CAPA)</p><h2>Bulgu ve uygunsuzluk takibi</h2><p>Saha raporu, denetim veya müşteri talebinden otomatik ya da manuel açılan aksiyonları kapatın ve doğrulayın.</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCw size={16} />Yenile</button></div>
    <div className="compliance-kpis"><article><span className="blue"><ClipboardCheck /></span><div><small>Açık faaliyet</small><strong>{openCount}</strong></div></article><article><span className="red"><Clock3 /></span><div><small>Geciken</small><strong>{overdueCount}</strong></div></article><article><span className="orange"><FileWarning /></span><div><small>Tekrarlayan</small><strong>{recurringCount}</strong></div></article><article><span className="green"><ShieldCheck /></span><div><small>Müşteri onaylı</small><strong>{approvedCount}</strong></div></article></div>
    <div className="compliance-toolbar"><div>{(['All', 'Open', 'InProgress', 'AwaitingCustomer', 'Completed', 'Verified'] as StatusFilter[]).map((value) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value === 'All' ? 'Tümü' : statusLabels[value]}</button>)}</div>{mode === 'staff' && !standalone && <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={17} />Yeni faaliyet</button>}</div>
    {error && <div className="quality-error"><AlertTriangle size={17} />{error}<button onClick={() => void load()}>Tekrar dene</button></div>}
    {loading ? <div className="surface compliance-state"><RefreshCw className="spin-icon" /><strong>Faaliyet kayıtları hazırlanıyor…</strong></div> :
      visible.length === 0 ? <div className="surface compliance-state"><ClipboardCheck /><strong>Bu filtrede faaliyet bulunmuyor</strong><span>{mode === 'staff' ? 'Manuel faaliyet açabilir veya saha raporlarından otomatik oluşmasını sağlayabilirsiniz.' : 'Size atanmış açık bir faaliyet bulunmuyor.'}</span></div> :
      <div className="compliance-grid">{visible.map((item) => <article className={'surface compliance-card ' + (item.isOverdue ? 'overdue' : '')} key={item.id}>
        <header><div><span className={'priority priority-' + item.priority.toLowerCase()}>{priorityLabels[item.priority]}</span><small>{item.number} · {sourceLabel(item.sourceType)}</small></div><span className={'action-status status-' + item.status.toLowerCase()}>{item.isOverdue ? 'Gecikti' : statusLabels[item.status]}</span></header>
        <h3>{item.title}</h3><p className="compliance-location">{item.customerName} · {item.branchName}</p>
        <div className="compliance-meta"><span><Clock3 />Termin {formatDate(item.dueDate)}</span><span>{partyLabels[item.responsibleParty]}</span>{item.recurrenceCount > 1 && <b>{item.recurrenceCount}. tekrar</b>}</div><p className="compliance-problem">{item.problem}</p>
        <div className="compliance-progress"><span>Önce {item.evidence.filter((e) => e.stage === 'Before').length}</span><i /><span>Sonra {item.evidence.filter((e) => e.stage === 'After').length}</span><i /><span className={'approval-' + item.customerApprovalStatus.toLowerCase()}>{approvalLabel(item.customerApprovalStatus)}</span></div>
        {expanded === item.id && <div className="compliance-details"><Detail label="Kök neden" value={item.rootCause} /><Detail label="Önerilen faaliyet" value={item.proposedAction} /><Detail label="Atanan personel" value={item.assignedAccountName} />{item.evidence.length > 0 && <div className="evidence-list">{item.evidence.map((evidence) => <div key={evidence.id} style={{ display: 'inline-flex', gap: '4px' }}><button onClick={() => void downloadCorrectiveActionEvidence(accessToken, evidence)} title="Görüntüle / İndir"><Eye size={14} />{evidence.stage === 'Before' ? 'Öncesi' : evidence.stage === 'After' ? 'Sonrası' : 'Ek'} · {evidence.fileName}</button><button onClick={() => void shareCorrectiveActionEvidence(accessToken, evidence)} title="Paylaş"><Share2 size={14} /></button></div>)}</div>}{item.history.length > 0 && <div className="compliance-history">{item.history.slice(0, 4).map((history) => <div key={history.id}><i /><span><strong>{statusLabels[history.toStatus as CorrectiveAction['status']] ?? history.toStatus}</strong><small>{history.changedBy} · {formatDateTime(history.occurredAt)}</small>{history.note && <em>{history.note}</em>}</span></div>)}</div>}</div>}
        <footer><button onClick={() => setExpanded(expanded === item.id ? null : item.id)}>{expanded === item.id ? <ChevronUp /> : <ChevronDown />}{expanded === item.id ? 'Daralt' : 'Detay'}</button><EvidenceInput icon={<Camera />} label="Öncesi" onFile={(file) => void upload(item, file, 'Before')} /><EvidenceInput icon={<Upload />} label="Sonrası" onFile={(file) => void upload(item, file, 'After')} />{mode === 'staff' ? <button className="edit-action" onClick={() => setEditing(item)}>Yönet</button> : item.status === 'Completed' && item.customerApprovalStatus === 'Pending' ? <><button className="approve-action" onClick={() => void approve(item, true)}>Onayla</button><button className="reject-action" onClick={() => void approve(item, false)}>İade et</button></> : null}</footer>
      </article>)}</div>}
    {editing && mode === 'staff' && <CorrectiveActionModal item={editing === 'new' ? undefined : editing} locations={locations} employees={employees} onClose={() => setEditing(null)} onSave={async (input) => {
      try { const saved = editing === 'new' ? await createCorrectiveAction(accessToken, input as CreateCorrectiveActionInput) : await updateCorrectiveAction(accessToken, editing.id, input as UpdateCorrectiveActionInput); setItems((current) => editing === 'new' ? [saved, ...current] : current.map((item) => item.id === saved.id ? saved : item)); setEditing(null); }
      catch (saveError) { if (saveError instanceof CorrectiveActionSessionExpiredError) return onSessionExpired(); throw saveError; }
    }} />}
  </section>;
}

function EvidenceInput({ icon, label, onFile }: { icon: React.ReactNode; label: string; onFile: (file: File) => void }) { return <label>{icon}{label}<input type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.currentTarget.value = ''; }} /></label>; }

function CorrectiveActionModal({ item, locations, employees, onClose, onSave }: { item?: CorrectiveAction; locations: QualityLocation[]; employees: EmployeeRecord[]; onClose: () => void; onSave: (input: CreateCorrectiveActionInput | UpdateCorrectiveActionInput) => Promise<void> }) {
  const currentLocation = item ? locations.find((location) => location.customerId === item.customerId && location.branchId === item.branchId) : locations[0];
  const [locationKey, setLocationKey] = useState(currentLocation ? locationValue(currentLocation) : ''); const [title, setTitle] = useState(item?.title ?? ''); const [category, setCategory] = useState(item?.category ?? 'Yapısal Uygunsuzluk');
  const [problem, setProblem] = useState(item?.problem ?? ''); const [rootCause, setRootCause] = useState(item?.rootCause ?? ''); const [proposedAction, setProposedAction] = useState(item?.proposedAction ?? '');
  const [party, setParty] = useState<CorrectiveAction['responsibleParty']>(item?.responsibleParty ?? 'Joint'); const [assigned, setAssigned] = useState(item?.assignedAccountId ?? '');
  const [priority, setPriority] = useState<CorrectiveAction['priority']>(item?.priority ?? 'Normal'); const [status, setStatus] = useState<CorrectiveAction['status']>(item?.status ?? 'Open');
  const [dueDate, setDueDate] = useState(item?.dueDate ?? addDays(7)); const [note, setNote] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(null); try { const location = locations.find((entry) => locationValue(entry) === locationKey); if (!item && !location) throw new Error('Müşteri ve şube seçin.'); const common = { title, problem, rootCause: rootCause || undefined, proposedAction, responsibleParty: party, assignedAccountId: assigned || undefined, priority, dueDate, note: note || undefined }; await onSave(item ? { ...common, status } : { ...common, customerId: location!.customerId, branchId: location!.branchId, category }); } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Faaliyet kaydedilemedi.'); setSaving(false); } };
  return <div className="modal-layer"><div className="modal corrective-action-modal"><div className="modal-header"><div className="quality-modal-icon"><ClipboardCheck /></div><div><p className="eyebrow">KALİTE & UYUM</p><h2>{item ? item.number : 'Yeni düzeltici faaliyet'}</h2><span>Kök neden ve kalıcı çözümü denetlenebilir biçimde kaydedin.</span></div><button className="icon-button" onClick={onClose}><X /></button></div><form onSubmit={submit}><div className="modal-body"><div className="form-grid">
    {!item && <><label className="span-2">Müşteri / Şube<select required value={locationKey} onChange={(e) => setLocationKey(e.target.value)}><option value="">Seçin</option>{locations.map((location) => <option key={locationValue(location)} value={locationValue(location)}>{location.customerName} · {location.branchName}</option>)}</select></label><label>Kategori<select value={category} onChange={(e) => setCategory(e.target.value)}><option>Yapısal Uygunsuzluk</option><option>İstasyon Hasarı</option><option>Ürün / Doz</option><option>Hijyen</option><option>Dokümantasyon</option><option>Saha Bulgusu</option></select></label></>}
    <label className={item ? 'span-2' : ''}>Başlık<input required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} /></label><label className="span-2">Sorun / uygunsuzluk<textarea required rows={3} value={problem} onChange={(e) => setProblem(e.target.value)} /></label><label className="span-2">Kök neden<textarea rows={3} placeholder="5 Neden, süreç, insan, ekipman veya çevre kaynaklı nedeni yazın." value={rootCause} onChange={(e) => setRootCause(e.target.value)} /></label><label className="span-2">Önerilen kalıcı faaliyet<textarea required rows={3} value={proposedAction} onChange={(e) => setProposedAction(e.target.value)} /></label>
    <label>Sorumlu taraf<select value={party} onChange={(e) => setParty(e.target.value as CorrectiveAction['responsibleParty'])}><option value="Customer">Müşteri</option><option value="Company">İlaçlama firması</option><option value="Joint">Ortak sorumluluk</option></select></label><label>Atanan personel<select value={assigned} onChange={(e) => setAssigned(e.target.value)}><option value="">Atama yok</option>{employees.filter((employee) => employee.isActive).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label>Öncelik<select value={priority} onChange={(e) => setPriority(e.target.value as CorrectiveAction['priority'])}><option value="Low">Düşük</option><option value="Normal">Normal</option><option value="High">Yüksek</option><option value="Critical">Kritik</option></select></label><label>Termin<input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
    {item && <label>Durum<select value={status} onChange={(e) => setStatus(e.target.value as CorrectiveAction['status'])}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}<label className="span-2">İşlem notu<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Durum değişikliği veya doğrulama notu" /></label>
  </div>{error && <div className="form-error">{error}</div>}</div><div className="modal-actions"><button type="button" className="btn btn-outline" onClick={onClose}>Vazgeç</button><button className="btn btn-primary" disabled={saving}>{saving ? 'Kaydediliyor…' : item ? 'Faaliyeti güncelle' : 'Faaliyeti aç'}</button></div></form></div></div>;
}

const Detail = ({ label, value }: { label: string; value?: string }) => value ? <div><small>{label}</small><p>{value}</p></div> : null;
const locationValue = (location: QualityLocation) => `${location.customerId}:${location.branchId ?? 'general'}`;
const addDays = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return date.toISOString().slice(0, 10); };
const formatDate = (value: string) => new Intl.DateTimeFormat('tr-TR').format(new Date(`${value}T00:00:00`));
const formatDateTime = (value: string) => new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
const sourceLabel = (value: string) => ({ ServiceReport: 'Saha raporu', RiskAnalysis: 'Risk analizi', Manual: 'Manuel kayıt' }[value] ?? value);
const approvalLabel = (value: CorrectiveAction['customerApprovalStatus']) => value === 'Approved' ? 'Müşteri onayladı' : value === 'Rejected' ? 'Müşteri iade etti' : 'Onay bekliyor';
