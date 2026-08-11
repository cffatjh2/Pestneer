import { useState, type FormEvent } from 'react';
import { Ban, CheckCircle2, CirclePause, LogOut, OctagonX, X } from 'lucide-react';

export type VisitAction = 'Stop' | 'Pause' | 'FinishPart' | 'Skip' | 'Cancel';

const actions: { value: VisitAction; title: string; description: string; icon: React.ReactNode; requiresReason: boolean }[] = [
  { value: 'Stop', title: 'Ziyareti durdur', description: 'Bu personelin oturumunu kapatır; diğer ekip üyeleri çalışmaya devam edebilir.', icon: <LogOut />, requiresReason: false },
  { value: 'Pause', title: 'Ziyareti yarım bırak', description: 'Kayıtlar korunur ve daha sonra kaldığınız yerden devam edebilirsiniz.', icon: <CirclePause />, requiresReason: false },
  { value: 'FinishPart', title: 'Saha payımı tamamla', description: 'Sizin oturumunuz tamamlanır. Ziyaret, ekipteki herkes işini bitirene kadar açık kalır.', icon: <CheckCircle2 />, requiresReason: false },
  { value: 'Skip', title: 'Ziyareti yoksay', description: 'Müşteri o gün hizmet istemediğinde gerekçesiyle birlikte kapatır.', icon: <Ban />, requiresReason: true },
  { value: 'Cancel', title: 'Ziyareti iptal et', description: 'Planlanan ziyareti iptal eder ve tekrar başlatılmasını engeller.', icon: <OctagonX />, requiresReason: true },
];

export default function VisitActionModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (action: VisitAction, reason?: string) => Promise<void> }) {
  const [selected, setSelected] = useState<VisitAction>('Pause');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = actions.find((item) => item.value === selected)!;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (current.requiresReason && reason.trim().length < 3) return setError('Bu işlem için kısa bir gerekçe yazın.');
    setSaving(true); setError(null);
    try { await onSubmit(selected, reason.trim() || undefined); }
    catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Ziyaret durumu güncellenemedi.'); setSaving(false); }
  };
  return <div className="modal-layer"><div className="modal visit-action-modal"><div className="modal-header"><div><p className="eyebrow">ZİYARET YÖNETİMİ</p><h2>Ziyaret durumunu değiştir</h2><p>İşlemler personel, tarih, süre ve gerekçeyle kayıt altına alınır.</p></div><button className="icon-button" onClick={onClose}><X /></button></div><form onSubmit={submit}><div className="visit-action-options">{actions.map((item) => <button type="button" key={item.value} className={selected === item.value ? 'active' : ''} onClick={() => { setSelected(item.value); setError(null); }}><span>{item.icon}</span><div><strong>{item.title}</strong><small>{item.description}</small></div></button>)}</div><label>İşlem gerekçesi {current.requiresReason && <b>*</b>}<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} placeholder="Müşteri talebi, erişim sorunu, üretim devam ediyor…" /></label>{error && <div className="modal-form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Vazgeç</button><button className="primary-button" disabled={saving}>{saving ? 'Kaydediliyor…' : 'Durumu uygula'}</button></div></form></div></div>;
}
