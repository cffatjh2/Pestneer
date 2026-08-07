import { useEffect, useState } from 'react';
import { Camera, CheckCircle2, Clock3, FileText, Lightbulb, MapPin, Pencil, UserRound, X } from 'lucide-react';
import type { WorkOrder, WorkOrderPhoto } from '../../types';

type Props = { order: WorkOrder; accessToken: string; onClose: () => void; onEdit?: () => void };

export default function WorkOrderDetailModal({ order, accessToken, onClose, onEdit }: Props) {
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label="İş emri detayı"><div className="modal work-order-detail-modal">
    <div className="modal-header"><div><p className="eyebrow">{order.id}</p><h2>{order.client} · {order.branch}</h2><p>{order.service} operasyonunun plan, saha ve kapanış kayıtları.</p></div><button className="icon-button" onClick={onClose}><X size={20} /></button></div>
    <div className="work-detail-summary"><span><Clock3 size={17} />{order.date} · {order.time}</span><span><UserRound size={17} />{order.technician}</span><span><MapPin size={17} />{order.branchAddress}</span></div>
    <div className="work-detail-grid"><section><h3><FileText size={17} /> Operasyon özeti</h3><dl><div><dt>İş türü</dt><dd>{visitLabel(order.visitType)}</dd></div><div><dt>Tekrar</dt><dd>{recurrenceLabel(order.recurrenceType)}</dd></div><div><dt>Durum</dt><dd>{order.status}</dd></div><div><dt>Not</dt><dd>{order.notes || '—'}</dd></div></dl></section><section><h3><CheckCircle2 size={17} /> Saha kapanışı</h3><p>{order.completionNote || 'Çalışan henüz saha kapanış açıklaması girmedi.'}</p>{order.recommendation && <div className="work-recommendation"><Lightbulb size={17} /><span>{order.recommendation}</span></div>}</section></div>
    {order.photos.length > 0 && <section className="work-photo-section"><h3><Camera size={17} /> Saha fotoğrafları</h3><div>{order.photos.map((photo) => <AuthorizedPhoto key={photo.id} photo={photo} token={accessToken} />)}</div></section>}
    <section className="work-history"><h3>İşlem geçmişi</h3>{order.history.length > 0 ? order.history.map((item) => <article key={item.id}><span /><div><strong>{statusLabel(item.toStatus)}</strong><small>{item.note} · {item.changedBy}</small></div><time>{formatDateTime(item.occurredAt)}</time></article>) : <p>Henüz işlem geçmişi bulunmuyor.</p>}</section>
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Kapat</button>{onEdit && order.technicalStatus !== 'Completed' && order.technicalStatus !== 'InProgress' && <button className="primary-button" onClick={onEdit}><Pencil size={16} /> İş Emrini Düzenle</button>}</div>
  </div></div>;
}

function AuthorizedPhoto({ photo, token }: { photo: WorkOrderPhoto; token: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => { let objectUrl = ''; fetch(photo.url, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.ok ? response.blob() : Promise.reject()).then((blob) => { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }).catch(() => setUrl('')); return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }; }, [photo.url, token]);
  return url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={photo.fileName} /></a> : <span className="photo-loading">Fotoğraf yükleniyor…</span>;
}

function visitLabel(value: string) { return ({ Routine: 'Rutin hizmet', Extra: 'Ekstra hizmet', EmergencyPaid: 'Ücretli acil çağrı', EmergencyFree: 'Ücretsiz acil çağrı' } as Record<string, string>)[value] ?? value; }
function recurrenceLabel(value: string) { return ({ Once: 'Tek seferlik', Weekly: 'Haftalık', Monthly: 'Aylık', Manual: 'Manuel tarihler' } as Record<string, string>)[value] ?? value; }
function statusLabel(value: string) { return ({ Planned: 'Planlandı', InProgress: 'Saha uygulaması başladı', Completed: 'Tamamlandı', Cancelled: 'İptal edildi' } as Record<string, string>)[value] ?? value; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
