import { useEffect, useState } from 'react';
import { BarChart3, CheckCircle2, Clock3, Coffee, PackageCheck, RefreshCw, Users } from 'lucide-react';
import { FieldSessionExpiredError, getWorkforceAnalytics, type WorkforceAnalytics } from '../services/fieldOperationsApi';

export default function ReportsAnalytics({ accessToken, onSessionExpired }: { accessToken: string; onSessionExpired: () => void }) {
  const [analytics, setAnalytics] = useState<WorkforceAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');

  const load = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setAnalytics(await getWorkforceAnalytics(accessToken));
    } catch (loadError) {
      if (loadError instanceof FieldSessionExpiredError) return onSessionExpired();
      setError(loadError instanceof Error ? loadError.message : 'Analiz verileri yüklenemedi.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void load(); }, [accessToken]);

  return (
    <section className="page analytics-page">
      <div className="page-heading"><div><p className="eyebrow">İNSAN KAYNAKLARI & OPERASYON</p><h1>Rapor & Analizler</h1><p>Personel mesai sürelerini, mola durumlarını ve araç stok kontrollerini takip edin.</p></div><button className="secondary-button" onClick={() => void load()}><RefreshCw size={16} />Verileri Yenile</button></div>

      {isLoading ? <div className="surface analytics-loading"><RefreshCw className="spin-icon" size={28} />Analizler hazırlanıyor…</div> : error ? <div className="surface analytics-loading analytics-error">{error}<button className="secondary-button" onClick={() => void load()}>Tekrar Dene</button></div> : analytics && <>
        <div className="analytics-kpis">
          <article className="surface"><span><Users size={20} /></span><div><small>Aktif personel</small><strong>{analytics.activeEmployees}</strong></div></article>
          <article className="surface"><span className="green"><Clock3 size={20} /></span><div><small>Şu an mesaide</small><strong>{analytics.workingEmployees}</strong></div></article>
          <article className="surface"><span className="purple"><CheckCircle2 size={20} /></span><div><small>Mesaiyi bitiren</small><strong>{analytics.completedEmployees}</strong></div></article>
          <article className="surface"><span className="orange"><BarChart3 size={20} /></span><div><small>{periodLabels[period]}</small><strong>{formatDuration(period === 'day' ? analytics.totalWorkedMinutes : period === 'week' ? analytics.weekWorkedMinutes : analytics.monthWorkedMinutes)}</strong></div></article>
        </div>

        <div className="surface workforce-table-card">
          <div className="analytics-section-heading"><div><p className="eyebrow">PERSONEL ÇALIŞMA RAPORU</p><h2>{formatDate(analytics.date)}</h2></div><div className="analytics-period-switch"><button className={period === 'day' ? 'active' : ''} onClick={() => setPeriod('day')}>Günlük</button><button className={period === 'week' ? 'active' : ''} onClick={() => setPeriod('week')}>Son 7 Gün</button><button className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')}>Aylık</button></div></div>
          {analytics.employees.length === 0 ? <div className="analytics-empty"><Users size={31} /><strong>Henüz personel bulunmuyor</strong><span>Ekip bölümünden çalışan hesabı oluşturabilirsiniz.</span></div> : <div className="workforce-table-wrap"><table className="workforce-table"><thead><tr><th>Personel</th><th>Durum</th><th>Başlangıç</th><th>Mola</th><th>Bugün</th><th>Son 7 Gün</th><th>Bu Ay</th><th>Araç Kontrolü</th></tr></thead><tbody>{analytics.employees.map((employee) => <tr key={employee.employeeId}><td><strong>{employee.name}</strong><span>{employee.email}</span></td><td><span className={`analytics-status status-${employee.status}`}>{statusLabels[employee.status]}</span></td><td>{formatTime(employee.startedAt)}</td><td><span className="table-icon-value"><Coffee size={14} />{formatDuration(employee.todayBreakMinutes)}</span></td><td className={period === 'day' ? 'period-highlight' : ''}><strong>{formatDuration(employee.todayWorkedMinutes)}</strong></td><td className={period === 'week' ? 'period-highlight' : ''}>{formatDuration(employee.weekWorkedMinutes)}</td><td className={period === 'month' ? 'period-highlight' : ''}>{formatDuration(employee.monthWorkedMinutes)}</td><td>{employee.lastStockCheckAt ? <span className="table-icon-value stock-ok-text"><PackageCheck size={14} />{formatDateTime(employee.lastStockCheckAt)}</span> : '—'}</td></tr>)}</tbody></table></div>}
        </div>
      </>}
    </section>
  );
}

const statusLabels = {
  notStarted: 'Başlamadı',
  working: 'Mesaide',
  onBreak: 'Molada',
  completed: 'Tamamlandı',
  inactive: 'Pasif',
};

const periodLabels = {
  day: 'Bugün toplam çalışma',
  week: 'Son 7 gün toplam çalışma',
  month: 'Bu ay toplam çalışma',
};

function formatDuration(minutes: number) {
  return `${Math.floor(minutes / 60)}s ${minutes % 60}dk`;
}

function formatTime(value?: string) {
  return value ? new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`));
}
