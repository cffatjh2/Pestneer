import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, Clock3, Plus, RefreshCw, UserRound, X } from 'lucide-react';
import CalendarEntryModal from '../components/modals/CalendarEntryModal';
import type { EmployeeRecord } from '../services/employeeApi';
import {
  CalendarSessionExpiredError,
  createCalendarEntry,
  deleteCalendarEntry,
  getCalendarEntries,
  updateCalendarEntry,
  type CalendarEntryRecord,
  type SaveCalendarEntryInput,
} from '../services/calendarApi';

type CalendarProps = {
  accessToken: string;
  employees: EmployeeRecord[];
  onSessionExpired: () => void;
  onNotify: (message: string) => void;
};

type CalendarView = 'day' | 'month';

export default function Calendar({ accessToken, employees, onSessionExpired, onNotify }: CalendarProps) {
  const [focusDate, setFocusDate] = useState(startOfDay(new Date()));
  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
  const [view, setView] = useState<CalendarView>('month');
  const [entries, setEntries] = useState<CalendarEntryRecord[]>([]);
  const [editingEntry, setEditingEntry] = useState<CalendarEntryRecord | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dayEventsModalDate, setDayEventsModalDate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const range = useMemo(() => getVisibleRange(focusDate, view), [focusDate, view]);

  const loadEntries = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setEntries(await getCalendarEntries(accessToken, toDateKey(range.from), toDateKey(range.to)));
    } catch (loadError) {
      if (loadError instanceof CalendarSessionExpiredError) return onSessionExpired();
      setError(loadError instanceof Error ? loadError.message : 'Takvim kayıtları yüklenemedi.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadEntries(); }, [accessToken, range.from.getTime(), range.to.getTime()]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const openCreate = (date = selectedDate) => {
    setSelectedDate(startOfDay(date));
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const saveEntry = async (input: SaveCalendarEntryInput) => {
    try {
      if (editingEntry) {
        const updated = await updateCalendarEntry(accessToken, editingEntry.id, input);
        setEntries((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        onNotify('Takvim kaydı güncellendi.');
      } else {
        const created = await createCalendarEntry(accessToken, input);
        setEntries((current) => [...current, created]);
        onNotify('Yeni kayıt takvime eklendi.');
      }
      setIsModalOpen(false);
      setEditingEntry(null);
    } catch (saveError) {
      if (saveError instanceof CalendarSessionExpiredError) return onSessionExpired();
      throw saveError;
    }
  };

  const removeEntry = async () => {
    if (!editingEntry) return;
    try {
      await deleteCalendarEntry(accessToken, editingEntry.id);
      setEntries((current) => current.filter((item) => item.id !== editingEntry.id));
      setIsModalOpen(false);
      setEditingEntry(null);
      onNotify('Takvim kaydı silindi.');
    } catch (deleteError) {
      if (deleteError instanceof CalendarSessionExpiredError) return onSessionExpired();
      throw deleteError;
    }
  };

  const navigate = (direction: -1 | 1) => {
    if (view === 'day') {
      const next = addDays(focusDate, direction);
      setFocusDate(next);
      setSelectedDate(next);
      return;
    }
    const next = new Date(focusDate);
    next.setMonth(next.getMonth() + direction);
    setFocusDate(next);
  };

  const openEntry = (entry: CalendarEntryRecord) => {
    setEditingEntry(entry);
    setSelectedDate(startOfDay(new Date(entry.scheduledAt)));
    setIsModalOpen(true);
  };

  return (
    <section className="page calendar-page">
      <div className="page-heading">
        <div><p className="eyebrow">OPERASYON TAKVİMİ</p><h1>Takvim & Görevler</h1><p>Günlük notları kaydedin, görevleri planlayın ve personele atayın.</p></div>
        <div className="calendar-heading-actions"><div className="system-clock"><Clock3 size={18} /><div><strong>{formatTime(now)}</strong><span>{formatFullDate(now)}</span></div></div><button className="primary-button" onClick={() => openCreate()}><Plus size={19} /> Yeni not / görev</button></div>
      </div>

      {error && <div className="calendar-error"><span>{error}</span><button onClick={() => void loadEntries()}><RefreshCw size={15} /> Yenile</button></div>}

      <section className="surface calendar-surface">
        <div className="calendar-toolbar">
          <div><button className="icon-button" onClick={() => navigate(-1)} aria-label="Önceki dönem"><ChevronLeft size={20} /></button><button className="icon-button" onClick={() => navigate(1)} aria-label="Sonraki dönem"><ChevronRight size={20} /></button><button className="calendar-today-button" onClick={() => { const today = startOfDay(new Date()); setFocusDate(today); setSelectedDate(today); }}>Bugün</button><strong>{formatPeriodTitle(focusDate, view)}</strong></div>
          <div>{(['day', 'month'] as const).map((item) => <button key={item} className={`calendar-view ${view === item ? 'active' : ''}`} onClick={() => setView(item)}>{viewLabels[item]}</button>)}</div>
        </div>

        {isLoading ? <div className="calendar-loading"><RefreshCw className="spin-icon" size={24} /> Takvim yükleniyor…</div> : view === 'month'
          ? <MonthView focusDate={focusDate} entries={entries} selectedDate={selectedDate} onSelectDate={(date) => { setSelectedDate(date); setFocusDate(date); }} onOpenDayModal={(date) => setDayEventsModalDate(date)} onCreate={openCreate} onOpenEntry={openEntry} />
          : <DayView date={focusDate} entries={entries} onCreate={openCreate} onOpenEntry={openEntry} />}
      </section>

      {isModalOpen && <CalendarEntryModal employees={employees} selectedDate={toDateKey(selectedDate)} entry={editingEntry} onClose={() => { setIsModalOpen(false); setEditingEntry(null); }} onSubmit={saveEntry} onDelete={editingEntry ? removeEntry : undefined} />}

      {dayEventsModalDate && (
        <DayEventsModal
          date={dayEventsModalDate}
          entries={entries}
          onClose={() => setDayEventsModalDate(null)}
          onCreate={openCreate}
          onOpenEntry={openEntry}
        />
      )}
    </section>
  );
}

function MonthView({ focusDate, entries, selectedDate, onSelectDate, onOpenDayModal, onCreate, onOpenEntry }: { focusDate: Date; entries: CalendarEntryRecord[]; selectedDate: Date; onSelectDate: (date: Date) => void; onOpenDayModal: (date: Date) => void; onCreate: (date: Date) => void; onOpenEntry: (entry: CalendarEntryRecord) => void }) {
  const first = new Date(focusDate.getFullYear(), focusDate.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  return <div className="calendar-grid">{weekdays.map((day) => <div key={day} className="calendar-weekday">{day}</div>)}{days.map((date) => {
    const dayEntries = entriesForDate(entries, date);
    const isCurrentMonth = date.getMonth() === focusDate.getMonth();
    return (
      <div
        key={toDateKey(date)}
        className={`calendar-day ${isToday(date) ? 'today' : ''} ${!isCurrentMonth ? 'muted' : ''} ${sameDay(date, selectedDate) ? 'selected' : ''}`}
        onClick={() => {
          onSelectDate(date);
          if (dayEntries.length > 0) {
            onOpenDayModal(date);
          }
        }}
      >
        <div className="calendar-day-header">
          <strong>{date.getDate()}</strong>
          <button onClick={(event) => { event.stopPropagation(); onCreate(date); }} aria-label={`${formatFullDate(date)} için kayıt ekle`}><Plus size={13} /></button>
        </div>
        <div className="calendar-day-events">
          {dayEntries.slice(0, 3).map((entry) => <CalendarEvent key={entry.id} entry={entry} onClick={onOpenEntry} />)}
          {dayEntries.length > 3 && (
            <button
              type="button"
              className="calendar-more"
              onClick={(event) => {
                event.stopPropagation();
                onSelectDate(date);
                onOpenDayModal(date);
              }}
            >
              +{dayEntries.length - 3} kayıt
            </button>
          )}
        </div>
      </div>
    );
  })}</div>;
}

function DayView({ date, entries, onCreate, onOpenEntry }: { date: Date; entries: CalendarEntryRecord[]; onCreate: (date: Date) => void; onOpenEntry: (entry: CalendarEntryRecord) => void }) {
  const dayEntries = entriesForDate(entries, date);
  return <div className="calendar-day-view"><div className="day-view-heading"><div><CalendarDays size={22} /><div><strong>{formatFullDate(date)}</strong><span>{dayEntries.length} kayıt planlandı</span></div></div><button className="secondary-button" onClick={() => onCreate(date)}><Plus size={16} /> Bu güne ekle</button></div>{dayEntries.length > 0 ? <div className="day-agenda-list">{dayEntries.map((entry) => <CalendarAgendaItem key={entry.id} entry={entry} onClick={onOpenEntry} />)}</div> : <div className="calendar-empty-day"><CalendarDays size={30} /><strong>Bu gün için kayıt yok</strong><span>Not ekleyebilir veya personele görev atayabilirsiniz.</span></div>}</div>;
}

function DayEventsModal({
  date,
  entries,
  onClose,
  onCreate,
  onOpenEntry,
}: {
  date: Date;
  entries: CalendarEntryRecord[];
  onClose: () => void;
  onCreate: (date: Date) => void;
  onOpenEntry: (entry: CalendarEntryRecord) => void;
}) {
  const dayEntries = entriesForDate(entries, date);
  return (
    <div className="modal-layer" style={{ zIndex: 1100 }}>
      <div className="modal calendar-day-events-modal" style={{ maxWidth: '580px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
              <CalendarDays size={22} />
            </div>
            <div>
              <p className="eyebrow" style={{ color: '#2563eb', fontWeight: 800 }}>GÜNLÜK İŞ & GÖREV LİSTESİ</p>
              <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>{formatFullDate(date)}</h2>
              <p style={{ fontSize: '12.5px', color: '#64748b', margin: '2px 0 0 0' }}>Bu tarihe planlanmış <strong>{dayEntries.length} kayıt</strong> bulunmaktadır.</p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose}><X size={20} /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {dayEntries.length === 0 ? (
            <div className="calendar-empty-day" style={{ padding: '30px', textAlign: 'center' }}>
              <CalendarDays size={32} color="#94a3b8" />
              <strong style={{ display: 'block', marginTop: '10px', color: '#334155' }}>Bu gün için kayıt yok</strong>
              <span style={{ fontSize: '12px', color: '#64748b' }}>Yeni bir iş emri veya not ekleyebilirsiniz.</span>
            </div>
          ) : (
            dayEntries.map((entry) => (
              <div
                key={entry.id}
                onClick={() => { onClose(); onOpenEntry(entry); }}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  background: '#f8fafc',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  transition: 'all 0.15s ease',
                }}
                className="day-event-card"
              >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 10px', borderRadius: '8px', background: '#fff', border: '1px solid #cbd5e1', minWidth: '68px', textAlign: 'center' }}>
                  <Clock size={13} color="#64748b" />
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#1e293b' }}>
                    {entry.isAllDay ? 'Tüm gün' : formatEntryTime(new Date(entry.scheduledAt))}
                  </span>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <strong style={{ fontSize: '14px', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {entry.title}
                    </strong>
                    {entry.priority === 'High' && <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626' }}>Acil</span>}
                  </div>
                  <small style={{ display: 'block', fontSize: '12px', color: '#64748b' }}>
                    {entry.kind === 'WorkOrder'
                      ? `${entry.workOrderNumber ?? ''} · ${entry.serviceType ?? 'Saha Hizmeti'} · ${entry.assignedEmployeeName || 'Atama bekliyor'}`
                      : entry.kind === 'Task'
                      ? `${entry.assignedEmployeeName || 'Personele atanmadı'} · Görev`
                      : 'Kişisel Not'}
                    {entry.description ? ` · ${entry.description}` : ''}
                  </small>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', background: entry.status === 'Completed' ? '#dcfce7' : '#e0e7ff', color: entry.status === 'Completed' ? '#166534' : '#3730a3' }}>
                    {entry.status === 'Completed' ? 'Tamamlandı' : 'Planlandı'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="modal-actions" style={{ padding: '12px 16px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
          <button type="button" className="secondary-button" onClick={onClose}>Kapat</button>
          <button type="button" className="primary-button" onClick={() => { onClose(); onCreate(date); }}>
            <Plus size={16} /> Bu Güne Yeni Kayıt Ekle
          </button>
        </div>
      </div>
    </div>
  );
}

function CalendarEvent({ entry, onClick }: { entry: CalendarEntryRecord; onClick: (entry: CalendarEntryRecord) => void }) {
  return <button className={`calendar-event event-${entry.priority.toLowerCase()} source-${entry.sourceType.toLowerCase()} ${entry.status === 'Completed' ? 'completed' : ''}`} onClick={(event) => { event.stopPropagation(); onClick(entry); }} title={entry.title}><b>{entry.isAllDay ? 'Tüm gün' : formatEntryTime(new Date(entry.scheduledAt))}</b> {entry.title}</button>;
}

function CalendarAgendaItem({ entry, onClick }: { entry: CalendarEntryRecord; onClick: (entry: CalendarEntryRecord) => void }) {
  return <button className={`calendar-agenda-item priority-${entry.priority.toLowerCase()} source-${entry.sourceType.toLowerCase()} ${entry.status === 'Completed' ? 'completed' : ''}`} onClick={() => onClick(entry)}><span className="agenda-time">{entry.isAllDay ? 'Tüm gün' : formatEntryTime(new Date(entry.scheduledAt))}</span><div><strong>{entry.title}</strong><small>{entry.kind === 'WorkOrder' ? `${entry.workOrderNumber} · ${entry.serviceType ?? 'Saha hizmeti'} · ${entry.assignedEmployeeName || 'Atama bekliyor'}` : entry.kind === 'Task' ? entry.assignedEmployeeName || 'Atama bekliyor' : 'Kişisel not'}{entry.description ? ` · ${entry.description}` : ''}</small></div>{entry.status === 'Completed' ? <CheckCircle2 size={17} /> : entry.assignedEmployeeName ? <UserRound size={17} /> : <CalendarDays size={17} />}</button>;
}

const weekdays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const viewLabels = { day: 'Gün', month: 'Ay' };

function getVisibleRange(date: Date, view: CalendarView) {
  if (view === 'day') return { from: startOfDay(date), to: startOfDay(date) };
  const from = startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1));
  return { from, to: addDays(from, 41) };
}

function entriesForDate(entries: CalendarEntryRecord[], date: Date) { return entries.filter((entry) => sameDay(new Date(entry.scheduledAt), date)).sort(sortEntries); }
function sortEntries(left: CalendarEntryRecord, right: CalendarEntryRecord) { return new Date(left.scheduledAt).getTime() - new Date(right.scheduledAt).getTime(); }
function startOfDay(value: Date) { return new Date(value.getFullYear(), value.getMonth(), value.getDate()); }
function startOfWeek(value: Date) { const date = startOfDay(value); const day = (date.getDay() + 6) % 7; date.setDate(date.getDate() - day); return date; }
function addDays(value: Date, days: number) { const date = new Date(value); date.setDate(date.getDate() + days); return date; }
function sameDay(left: Date, right: Date) { return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate(); }
function isToday(value: Date) { return sameDay(value, new Date()); }
function toDateKey(value: Date) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
function formatTime(value: Date) { return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(value); }
function formatEntryTime(value: Date) { return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(value); }
function formatFullDate(value: Date) { return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' }).format(value); }
function formatPeriodTitle(value: Date, view: CalendarView) { return view === 'month' ? new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(value) : formatFullDate(value); }
