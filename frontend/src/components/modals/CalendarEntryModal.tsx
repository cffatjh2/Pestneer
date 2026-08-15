import { useState, type FormEvent } from 'react';
import { CalendarClock, Check, StickyNote, Trash2, X } from 'lucide-react';
import type { EmployeeRecord } from '../../services/employeeApi';
import type { CalendarEntryRecord, SaveCalendarEntryInput } from '../../services/calendarApi';

type CalendarEntryModalProps = {
  employees: EmployeeRecord[];
  selectedDate: string;
  entry?: CalendarEntryRecord | null;
  onClose: () => void;
  onSubmit: (input: SaveCalendarEntryInput) => Promise<void>;
  onDelete?: () => Promise<void>;
};

export default function CalendarEntryModal({ employees, selectedDate, entry, onClose, onSubmit, onDelete }: CalendarEntryModalProps) {
  const [kind, setKind] = useState<'Task' | 'Note'>(entry?.kind === 'Note' ? 'Note' : 'Task');
  const [isAllDay, setIsAllDay] = useState(entry?.isAllDay ?? false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const entryDate = entry ? toDateInput(new Date(entry.scheduledAt)) : selectedDate;
  const entryTime = entry && !entry.isAllDay ? toTimeInput(new Date(entry.scheduledAt)) : '09:00';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setIsSaving(true);
    setError(null);
    try {
      await onSubmit({
        kind,
        title: String(data.get('title') ?? ''),
        description: String(data.get('description') ?? '') || undefined,
        date: String(data.get('date')),
        time: isAllDay ? undefined : String(data.get('time')),
        isAllDay,
        assignedEmployeeAccountId: kind === 'Task' ? String(data.get('assignedEmployeeAccountId') ?? '') || undefined : undefined,
        priority: String(data.get('priority')) as SaveCalendarEntryInput['priority'],
        status: String(data.get('status')) as SaveCalendarEntryInput['status'],
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Takvim kaydı kaydedilemedi.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || !window.confirm('Bu takvim kaydını silmek istediğinize emin misiniz?')) return;
    setIsSaving(true);
    setError(null);
    try { await onDelete(); } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Takvim kaydı silinemedi.');
      setIsSaving(false);
    }
  };

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="calendar-entry-title">
      <div className="modal calendar-entry-modal">
        <div className="modal-header">
          <div className="employee-modal-heading"><span>{kind === 'Task' ? <CalendarClock size={20} /> : <StickyNote size={20} />}</span><div><p className="eyebrow">TAKVİM PLANLAMA</p><h2 id="calendar-entry-title">{entry ? 'Kaydı Düzenle' : 'Yeni Not / Görev'}</h2><p>Günlük planı oluşturun ve gerekiyorsa personele atayın.</p></div></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Kapat"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="calendar-kind-switch"><button type="button" className={kind === 'Task' ? 'active' : ''} onClick={() => setKind('Task')}><CalendarClock size={16} /> Görev</button><button type="button" className={kind === 'Note' ? 'active' : ''} onClick={() => setKind('Note')}><StickyNote size={16} /> Not</button></div>
          <div className="form-grid calendar-entry-form">
            <label className="form-field-wide">Başlık<input name="title" defaultValue={entry?.title} minLength={2} maxLength={180} required /></label>
            <label>Tarih<input name="date" type="date" defaultValue={entryDate} required /></label>
            <label>Saat<span className="calendar-time-field"><input name="time" type="time" defaultValue={entryTime} disabled={isAllDay} required={!isAllDay} /><button type="button" className={isAllDay ? 'active' : ''} onClick={() => setIsAllDay((value) => !value)}>Tüm gün</button></span></label>
            {kind === 'Task' && <label>Atanacak personel<select name="assignedEmployeeAccountId" defaultValue={entry?.assignedEmployeeAccountId ?? ''}><option value="">Atama bekliyor</option>{employees.filter((employee) => employee.isActive).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>}
            <label>Öncelik<select name="priority" defaultValue={entry?.priority ?? 'Normal'}><option value="Low">Düşük</option><option value="Normal">Normal</option><option value="High">Yüksek</option></select></label>
            <label>Durum<select name="status" defaultValue={entry?.status ?? 'Planned'}><option value="Planned">Planlandı</option><option value="Completed">Tamamlandı</option></select></label>
            <label className="form-field-wide">Açıklama<textarea name="description" defaultValue={entry?.description} maxLength={2000} rows={4} placeholder="Detay, kontrol listesi veya hatırlatma ekleyin…" /></label>
          </div>
          {error && <div className="modal-form-error" role="alert">{error}</div>}
          <div className="modal-actions calendar-modal-actions">{entry && onDelete && <button type="button" className="calendar-delete-button" disabled={isSaving} onClick={() => void handleDelete()}><Trash2 size={16} /> Sil</button>}<button type="button" className="secondary-button" onClick={onClose}>Vazgeç</button><button type="submit" className="primary-button" disabled={isSaving}>{isSaving ? 'Kaydediliyor…' : 'Kaydet'} <Check size={17} /></button></div>
        </form>
      </div>
    </div>
  );
}

function toDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toTimeInput(value: Date) {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}
