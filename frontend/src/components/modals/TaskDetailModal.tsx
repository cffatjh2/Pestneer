import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  FileCheck2,
  FileText,
  Lightbulb,
  MapPin,
  Share2,
  StickyNote,
  UserRound,
  X,
} from 'lucide-react';
import type { WorkOrder, WorkOrderPhoto } from '../../types';
import type { CalendarEntryRecord } from '../../services/calendarApi';
import type { ServiceReportRecord } from '../../services/serviceReportApi';
import { shareOrDownloadFile } from '../../utils/shareUtils';
import { apiFetch } from '../../services/apiBase';

type Props = {
  task: CalendarEntryRecord;
  order?: WorkOrder | null;
  report?: ServiceReportRecord | null;
  accessToken: string;
  isShiftActive?: boolean;
  onClose: () => void;
  onOpenWorkOrderInPanel?: (order: WorkOrder) => void;
  onOpenStations?: (order: WorkOrder) => void;
  onOpenReport?: (order: WorkOrder) => void;
};

export default function TaskDetailModal({
  task,
  order,
  report,
  accessToken,
  isShiftActive = true,
  onClose,
  onOpenWorkOrderInPanel,
  onOpenStations,
  onOpenReport,
}: Props) {
  const isWorkOrder = task.sourceType === 'WorkOrder' || task.kind === 'WorkOrder' || !!order;

  const handleShare = async () => {
    if (order) {
      await shareOrDownloadFile({
        title: `${order.id} - ${order.client}`,
        text: `${order.id} · ${order.client} (${order.branch}) - ${order.service} | Tarih: ${order.date} ${order.time}`,
        url: window.location.href,
      });
    } else {
      await shareOrDownloadFile({
        title: task.title,
        text: `${task.title} | Tarih: ${formatTaskDate(task)}${task.description ? `\n${task.description}` : ''}`,
        url: window.location.href,
      });
    }
  };

  const mapQuery = order?.branchAddress || task.branchName || task.customerName || '';
  const mapUrl = order?.branchMapUrl || (mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : undefined);

  const isOrderPlanned = order?.technicalStatus === 'Planned';
  const orderDate = order?.date ? new Date(order.date) : null;
  const isScheduledToday = orderDate ? isSameDate(orderDate, new Date()) : false;
  const isRoutine = !!(order?.recurrenceType && order.recurrenceType !== 'Once');
  const canStartWork = !isOrderPlanned || isRoutine || isScheduledToday;

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Görev ve İş Emri Detayı">
      <div className="modal work-order-detail-modal task-detail-modal">
        {/* Header */}
        <div className="modal-header">
          <div>
            <p className="eyebrow">
              {isWorkOrder
                ? order?.id || task.workOrderNumber || 'İŞ EMRİ DETAYI'
                : task.kind === 'Note'
                ? 'NOT DETAYI'
                : 'GÖREV DETAYI'}
            </p>
            <h2>
              {order ? `${order.client} · ${order.branch}` : task.title}
            </h2>
            <p>
              {isWorkOrder
                ? `${order?.service || task.serviceType || 'Operasyon'} planı, saha verileri ve görev detayları.`
                : 'Görev talimatları ve planlama bilgisi.'}
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Kapat">
            <X size={20} />
          </button>
        </div>

        {/* Summary Row */}
        <div className="work-detail-summary">
          <span>
            <Clock3 size={16} />
            {order ? `${order.date} · ${order.time}` : formatTaskDate(task)}
          </span>
          <span>
            <UserRound size={16} />
            {order?.assignments?.length
              ? order.assignments.map((item) => item.employeeName).join(', ')
              : task.assignedEmployeeName || 'Atama bekliyor'}
          </span>
          {(order?.branchAddress || task.branchName) && (
            <span>
              <MapPin size={16} />
              {order?.branchAddress || task.branchName}
            </span>
          )}
          {order?.customerDurationMinutes ? (
            <span>
              <Clock3 size={16} />
              Müşteride {formatMinutes(order.customerDurationMinutes)} · ekip emeği {formatMinutes(order.totalLaborMinutes)}
            </span>
          ) : null}
          {!isWorkOrder && (
            <span className={`task-priority-pill priority-${task.priority.toLowerCase()}`}>
              <AlertTriangle size={15} />
              Öncelik: {priorityLabel(task.priority)}
            </span>
          )}
        </div>

        {/* Main Content Grid */}
        {isWorkOrder ? (
          <>
            <div className="work-detail-grid">
              <section>
                <h3>
                  <FileText size={17} /> Operasyon özeti
                </h3>
                <dl>
                  <div>
                    <dt>Hizmet</dt>
                    <dd>{order?.service || task.serviceType || 'Genel İlaçlama'}</dd>
                  </div>
                  <div>
                    <dt>İş türü</dt>
                    <dd>{visitLabel(order?.visitType || 'Routine')}</dd>
                  </div>
                  <div>
                    <dt>Tekrar</dt>
                    <dd>{recurrenceLabel(order?.recurrenceType || 'Once')}</dd>
                  </div>
                  <div>
                    <dt>Durum</dt>
                    <dd>
                      <span className={`status-tag status-${(order?.status || task.status).toLowerCase()}`}>
                        {order?.status || (task.status === 'Completed' ? 'Tamamlandı' : 'Planlandı')}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Notlar</dt>
                    <dd>{order?.notes || task.description || '—'}</dd>
                  </div>
                </dl>
              </section>

              <section>
                <h3>
                  <CheckCircle2 size={17} /> Saha durumu & Kapanış
                </h3>
                {report && (
                  <div className={`employee-report-state ${report.status.toLowerCase()}`} style={{ marginBottom: '12px' }}>
                    <FileCheck2 size={16} />
                    <span>
                      {report.status === 'Finalized'
                        ? `Rapor onaylandı · ${report.totalStations} istasyon · ${riskLabel(report.riskLevel)} risk`
                        : 'Saha raporu taslak olarak kaydedildi'}
                    </span>
                  </div>
                )}
                <p>
                  {order?.completionNote ||
                    (order?.technicalStatus === 'Completed' || task.status === 'Completed'
                      ? 'Operasyon başarıyla tamamlandı.'
                      : 'Henüz saha kapanış açıklaması girilmedi.')}
                </p>
                {order?.recommendation && (
                  <div className="work-recommendation">
                    <Lightbulb size={17} />
                    <span>{order.recommendation}</span>
                  </div>
                )}
              </section>
            </div>

            {/* Photos */}
            {order && order.photos && order.photos.length > 0 && (
              <section className="work-photo-section">
                <h3>
                  <Camera size={17} /> Saha fotoğrafları ({order.photos.length})
                </h3>
                <div>
                  {order.photos.map((photo) => (
                    <AuthorizedPhoto key={photo.id} photo={photo} token={accessToken} />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <div className="task-detail-simple-content">
            <section style={{ padding: '16px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)' }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 12px', fontSize: 'var(--text-sm)' }}>
                <StickyNote size={17} /> Açıklama & Talimatlar
              </h3>
              <p style={{ color: 'var(--gray-700)', fontSize: 'var(--text-sm)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                {task.description || 'Bu görev için ek bir açıklama girilmemiş.'}
              </p>
            </section>
          </div>
        )}

        {isWorkOrder && order && order.technicalStatus === 'Planned' && !canStartWork && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              margin: '14px 0 6px',
              padding: '12px 14px',
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '10px',
              color: '#92400e',
              fontSize: '12px',
              lineHeight: '1.5',
            }}
          >
            <AlertTriangle size={18} style={{ flex: '0 0 auto', color: '#d97706' }} />
            <span>
              <strong>Tek Seferlik İş Emri:</strong> Bu iş yalnızca planlandığı tarihte ({order.date}) başlatılabilir. Rutin (haftalık/aylık) iş emirleri ise saha esnekliği gereği farklı günlerde de başlatılabilir.
            </span>
          </div>
        )}

        {/* Modal Actions */}
        <div className="modal-actions">
          {mapUrl && (
            <a href={mapUrl} target="_blank" rel="noreferrer" className="secondary-button">
              <MapPin size={16} /> Haritada Aç
            </a>
          )}
          <button type="button" className="secondary-button" onClick={() => void handleShare()}>
            <Share2 size={16} /> Paylaş
          </button>
          {order && onOpenStations && order.technicalStatus !== 'Planned' && (
            <button type="button" className="secondary-button" onClick={() => onOpenStations(order)}>
              <ClipboardCheck size={16} /> İstasyon Monitörleri
            </button>
          )}
          {order && onOpenReport && order.technicalStatus !== 'Planned' && (
            <button type="button" className="secondary-button" onClick={() => onOpenReport(order)}>
              <FileCheck2 size={16} /> {report ? 'EK-1 Formu Görüntüle' : 'EK-1 Formu Oluştur'}
            </button>
          )}
          {order && onOpenWorkOrderInPanel && (
            <button
              type="button"
              className="primary-button"
              disabled={order.technicalStatus === 'Planned' && !canStartWork}
              title={order.technicalStatus === 'Planned' && !canStartWork ? 'Tek seferlik işler sadece planlandığı gün başlatılabilir' : undefined}
              onClick={() => onOpenWorkOrderInPanel(order)}
            >
              <ArrowUpRight size={16} /> {order.technicalStatus === 'Planned' ? (canStartWork ? 'İşe Başla / Müşteriyi Aç' : 'Plan Gününde Başlatılabilir') : 'İş Emirlerimde Gör'}
            </button>
          )}
          <button type="button" className="secondary-button" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}

function isSameDate(d1: Date, d2: Date) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function AuthorizedPhoto({ photo, token }: { photo: WorkOrderPhoto; token: string }) {
  const [url, setUrl] = useState('');
  const [blobData, setBlobData] = useState<Blob | null>(null);

  useEffect(() => {
    let objectUrl = '';
    apiFetch(photo.url, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => (response.ok ? response.blob() : Promise.reject()))
      .then((blob) => {
        setBlobData(blob);
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(''));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.url, token]);

  const handleShare = () => {
    if (blobData) {
      void shareOrDownloadFile({
        title: photo.fileName,
        fileName: photo.fileName,
        blob: blobData,
      });
    }
  };

  return url ? (
    <div className="authorized-photo-card" style={{ display: 'inline-flex', flexDirection: 'column', gap: '6px' }}>
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt={photo.fileName} />
      </a>
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
        <a
          href={url}
          download={photo.fileName}
          className="secondary-button"
          title="İndir"
          style={{ padding: '3px 8px', fontSize: '11px' }}
        >
          <Download size={13} /> İndir
        </a>
        <button
          type="button"
          className="secondary-button"
          onClick={handleShare}
          title="Paylaş"
          style={{ padding: '3px 8px', fontSize: '11px' }}
        >
          <Share2 size={13} /> Paylaş
        </button>
      </div>
    </div>
  ) : (
    <span className="photo-loading">Fotoğraf yükleniyor…</span>
  );
}

function visitLabel(value: string) {
  return (
    ({
      Routine: 'Rutin hizmet',
      Extra: 'Ekstra hizmet',
      EmergencyPaid: 'Ücretli acil çağrı',
      EmergencyFree: 'Ücretsiz acil çağrı',
    } as Record<string, string>)[value] ?? value
  );
}

function recurrenceLabel(value: string) {
  return (
    ({
      Once: 'Tek seferlik',
      Weekly: 'Haftalık',
      Monthly: 'Aylık',
      Manual: 'Manuel tarihler',
    } as Record<string, string>)[value] ?? value
  );
}

function priorityLabel(value: string) {
  return ({ Low: 'Düşük', Normal: 'Normal', High: 'Yüksek' } as Record<string, string>)[value] ?? value;
}

function riskLabel(value: string) {
  return ({ Low: 'Düşük', Medium: 'Orta', High: 'Yüksek' } as Record<string, string>)[value] ?? value;
}

function formatMinutes(minutes: number) {
  return minutes < 60 ? `${minutes} dk.` : `${Math.floor(minutes / 60)} sa. ${minutes % 60} dk.`;
}

function formatTaskDate(task: CalendarEntryRecord) {
  const value = new Date(task.scheduledAt);
  return `${new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', weekday: 'short' }).format(value)} · ${
    task.isAllDay
      ? 'Tüm gün'
      : new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(value)
  }`;
}
