import { useEffect, useState } from 'react';
import { Camera, CheckCircle2, ClipboardCheck, Clock3, Download, FileText, Lightbulb, MapPin, Pencil, Share2, UserRound, X } from 'lucide-react';
import type { WorkOrder, WorkOrderPhoto } from '../../types';
import { shareOrDownloadFile } from '../../utils/shareUtils';
import { apiFetch } from '../../services/apiBase';

type Props = { order: WorkOrder; accessToken: string; onClose: () => void; onEdit?: () => void; onOpenStations?: () => void };

export default function WorkOrderDetailModal({ order, accessToken, onClose, onEdit, onOpenStations }: Props) {
  const handleShareOrder = async () => {
    await shareOrDownloadFile({
      title: `${order.id} - ${order.client}`,
      text: `${order.id} · ${order.client} (${order.branch}) - ${order.service} | Tarih: ${order.date} ${order.time}`,
      url: window.location.href,
    });
  };

  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label="İş emri detayı"><div className="modal work-order-detail-modal">
    <div className="modal-header"><div><p className="eyebrow">{order.id}</p><h2>{order.client} · {order.branch}</h2><p>{order.service} operasyonunun plan, saha ve kapanış kayıtları.</p></div><button className="icon-button" onClick={onClose}><X size={20} /></button></div>
    <div className="work-detail-summary"><span><Clock3 size={17} />{order.date} · {order.time}</span><span><UserRound size={17} />{order.assignments.length ? order.assignments.map((item) => item.employeeName).join(', ') : order.technician}</span><span><MapPin size={17} />{order.branchAddress}</span>{order.customerDurationMinutes ? <span><Clock3 size={17} />Müşteride {formatMinutes(order.customerDurationMinutes)} · ekip emeği {formatMinutes(order.totalLaborMinutes)}</span> : null}</div>
    <div className="work-detail-grid"><section><h3><FileText size={17} /> Operasyon özeti</h3><dl><div><dt>İş türü</dt><dd>{visitLabel(order.visitType)}</dd></div><div><dt>Tekrar</dt><dd>{recurrenceLabel(order.recurrenceType)}</dd></div><div><dt>Durum</dt><dd>{order.status}</dd></div><div><dt>Not</dt><dd>{order.notes || '—'}</dd></div></dl></section><section><h3><CheckCircle2 size={17} /> Saha kapanışı</h3><p>{order.completionNote || 'Çalışan henüz saha kapanış açıklaması girmedi.'}</p>{order.recommendation && <div className="work-recommendation"><Lightbulb size={17} /><span>{order.recommendation}</span></div>}</section></div>
    {order.photos.length > 0 && <section className="work-photo-section"><h3><Camera size={17} /> Saha fotoğrafları</h3><div>{order.photos.map((photo) => <AuthorizedPhoto key={photo.id} photo={photo} token={accessToken} />)}</div></section>}
    <section className="work-history"><h3>İşlem geçmişi</h3>{order.history.length > 0 ? order.history.map((item) => <article key={item.id}><span /><div><strong>{statusLabel(item.toStatus)}</strong><small>{item.note} · {item.changedBy}</small></div><time>{formatDateTime(item.occurredAt)}</time></article>) : <p>Henüz işlem geçmişi bulunmuyor.</p>}</section>
    <div className="modal-actions">
      <button type="button" className="secondary-button" onClick={() => void handleShareOrder()}><Share2 size={16} /> Paylaş</button>
      {onOpenStations && order.technicalStatus !== 'Planned' && <button type="button" className="secondary-button" onClick={onOpenStations}><ClipboardCheck size={16} /> İstasyon Monitörleri</button>}
      <button className="secondary-button" onClick={onClose}>Kapat</button>
      {onEdit && order.technicalStatus !== 'Completed' && order.technicalStatus !== 'InProgress' && <button className="primary-button" onClick={onEdit}><Pencil size={16} /> İş Emrini Düzenle</button>}
    </div>
  </div></div>;
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
      <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={photo.fileName} /></a>
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
        <a href={url} download={photo.fileName} className="secondary-button" title="İndir" style={{ padding: '3px 8px', fontSize: '11px' }}>
          <Download size={13} /> İndir
        </a>
        <button type="button" className="secondary-button" onClick={handleShare} title="Paylaş" style={{ padding: '3px 8px', fontSize: '11px' }}>
          <Share2 size={13} /> Paylaş
        </button>
      </div>
    </div>
  ) : <span className="photo-loading">Fotoğraf yükleniyor…</span>;
}

function visitLabel(value: string) { return ({ Routine: 'Rutin hizmet', Extra: 'Ekstra hizmet', EmergencyPaid: 'Ücretli acil çağrı', EmergencyFree: 'Ücretsiz acil çağrı' } as Record<string, string>)[value] ?? value; }
function recurrenceLabel(value: string) { return ({ Once: 'Tek seferlik', Weekly: 'Haftalık', Monthly: 'Aylık', Manual: 'Manuel tarihler' } as Record<string, string>)[value] ?? value; }
function statusLabel(value: string) { return ({ Planned: 'Planlandı', InProgress: 'Saha uygulaması başladı', Completed: 'Tamamlandı', Cancelled: 'İptal edildi' } as Record<string, string>)[value] ?? value; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
function formatMinutes(minutes: number) { return minutes < 60 ? `${minutes} dk.` : `${Math.floor(minutes / 60)} sa. ${minutes % 60} dk.`; }
