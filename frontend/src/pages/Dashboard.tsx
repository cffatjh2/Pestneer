import {
  Activity,
  Archive,
  ArrowUpRight,
  Check,
  ChevronRight,
  ClipboardList,
  MoreHorizontal,
  Plus,
} from 'lucide-react';
import type { WorkOrder } from '../types';
import StatusBadge from '../components/common/StatusBadge';

interface DashboardProps {
  workOrders: WorkOrder[];
  onCreate: () => void;
  onReport: () => void;
}

export default function Dashboard({ workOrders, onCreate, onReport }: DashboardProps) {
  const activeCount = workOrders.filter(w => w.status === 'Sahada').length;
  const completedCount = workOrders.filter(w => w.status === 'Tamamlandı').length;
  const totalCount = workOrders.length;

  return (
    <section className="page dashboard-page">
      {/* ── Heading ───────────────────────────────────────────── */}
      <div className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow">GÜNLÜK OPERASYON ÖZETİ</p>
          <h1>
            Hoş geldiniz <span>👋</span>
          </h1>
          <p>
            {totalCount > 0 ? (
              <>Operasyonların kontrol altında. Bugün <strong>{totalCount} planlı hizmet</strong> bulunuyor.</>
            ) : (
              <>Henüz planlanmış iş emri yok. Yeni bir iş emri oluşturarak başlayabilirsiniz.</>
            )}
          </p>
        </div>
        <button className="primary-button" onClick={onCreate}>
          <Plus size={19} />
          Yeni iş emri
        </button>
      </div>

      {/* ── Metrics ───────────────────────────────────────────── */}
      <div className="metric-grid">
        <Metric icon={<ClipboardList size={21} />} label="Bugünkü iş emri" value={totalCount.toString()} change="Güncel durum" tone="blue" />
        <Metric icon={<Activity size={21} />} label="Devam eden operasyon" value={activeCount.toString()} change="Anlık saha durumu" tone="purple" />
        <Metric icon={<Check size={21} />} label="Tamamlanan hizmet" value={completedCount.toString()} change="Güncel toplam" tone="green" />
        <Metric icon={<Archive size={21} />} label="Bekleyen rapor" value="0" change="İmza bekleyen" tone="orange" />
      </div>

      {/* ── Layout ────────────────────────────────────────────── */}
      <div className="dashboard-layout">
        <div className="dashboard-main-column">
          {/* Schedule */}
          <section className="surface schedule-surface">
            <div className="section-heading">
              <div>
                <p className="eyebrow">BUGÜNÜN PLANI</p>
                <h2>Saha takvimi</h2>
              </div>
            </div>

            <div className="timeline">
              {workOrders.length > 0 ? (
                workOrders.map((wo) => (
                  <TimelineItem
                    key={wo.id}
                    time={wo.time.split(' - ')[0]}
                    title={`${wo.client} · ${wo.branch}`}
                    meta={`${wo.service} · ${wo.technician}`}
                    state={wo.status === 'Tamamlandı' ? 'completed' : wo.status === 'Sahada' ? 'active' : 'upcoming'}
                    action={onReport}
                  />
                ))
              ) : (
                <div style={{ padding: '24px 0', color: '#94a3b8', fontSize: '13px', textAlign: 'center' }}>
                  Bugün için henüz planlanan bir saha görevi bulunmuyor.
                </div>
              )}
            </div>
          </section>

          {/* Work Orders Table */}
          <section className="surface work-table-surface">
            <div className="section-heading">
              <div>
                <p className="eyebrow">OPERASYONLAR</p>
                <h2>Son iş emirleri</h2>
              </div>
            </div>
            <WorkOrderTable workOrders={workOrders.slice(0, 5)} onOpenReport={onReport} />
          </section>
        </div>

        {/* Side Column */}
        <aside className="dashboard-side-column">
          {/* Progress */}
          <section className="surface progress-surface">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">HAFTALIK İLERLEME</p>
                <h2>Operasyon performansı</h2>
              </div>
            </div>
            <div className="progress-content">
              <div className="progress-ring">
                <div>
                  <strong>{totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}%</strong>
                  <span>Tamamlandı</span>
                </div>
              </div>
              <div className="progress-legend">
                <div><i className="legend-blue" /><span>Planlanan</span><strong>{totalCount}</strong></div>
                <div><i className="legend-green" /><span>Tamamlanan</span><strong>{completedCount}</strong></div>
                <div><i className="legend-gray" /><span>Bekleyen</span><strong>{totalCount - completedCount}</strong></div>
              </div>
            </div>
            <div className="insight-card">
              <div className="insight-icon"><ArrowUpRight size={18} /></div>
              <p>Saha ekibiniz aktif ve yeni görevlere hazır.</p>
            </div>
          </section>

          {/* Attention */}
          <section className="surface attention-surface">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">DİKKAT GEREKTİRENLER</p>
                <h2>Takip listesi</h2>
              </div>
              <span className="count-pill">0</span>
            </div>
            <div className="attention-list">
              <div style={{ padding: '16px 0', color: '#94a3b8', fontSize: '12px', textAlign: 'center' }}>
                Tüm operasyon ve stoklar güncel durumda.
              </div>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

/* ── Alt bileşenler ──────────────────────────────────────────── */
function Metric({ icon, label, value, change, tone }: { icon: React.ReactNode; label: string; value: string; change: string; tone: string }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{change}</small>
      </div>
    </article>
  );
}

function TimelineItem({ time, title, meta, state, action }: { time: string; title: string; meta: string; state: 'completed' | 'active' | 'upcoming'; action?: () => void }) {
  return (
    <div className={`timeline-item ${state}`}>
      <div className="timeline-time">{time}</div>
      <div className="timeline-track"><i /></div>
      <div className="timeline-detail">
        <div>
          <strong>{title}</strong>
          <span>{meta}</span>
        </div>
        {state === 'completed' && <span className="status status-completed"><Check size={13} />Tamamlandı</span>}
        {state === 'active' && <button className="status status-active" onClick={action}>Raporu aç <ChevronRight size={14} /></button>}
        {state === 'upcoming' && <span className="status status-planned">Planlandı</span>}
      </div>
    </div>
  );
}

function WorkOrderTable({ workOrders, onOpenReport }: { workOrders: WorkOrder[]; onOpenReport: () => void }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>İş emri</th>
            <th>Müşteri / Şube</th>
            <th>Hizmet</th>
            <th>Saha personeli</th>
            <th>Durum</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {workOrders.length > 0 ? (
            workOrders.map((wo) => (
              <tr key={wo.id}>
                <td><strong>{wo.id}</strong><span>{wo.time}</span></td>
                <td><strong>{wo.client}</strong><span>{wo.branch}</span></td>
                <td>{wo.service}</td>
                <td>
                  <div className="person-cell">
                    <div className="avatar avatar-small avatar-green">
                      {wo.technician.split(' ').map(n => n[0]).join('') || '?'}
                    </div>
                    {wo.technician}
                  </div>
                </td>
                <td><StatusBadge value={wo.status} /></td>
                <td>
                  <button className="row-action" aria-label="İş emri seçenekleri" onClick={onOpenReport}>
                    <MoreHorizontal size={19} />
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                Henüz kaydedilmiş bir iş emri bulunmuyor.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
