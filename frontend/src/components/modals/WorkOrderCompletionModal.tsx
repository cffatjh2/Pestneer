import { useState, type FormEvent } from 'react';
import { Camera, Check, Lightbulb, X } from 'lucide-react';
import type { WorkOrder } from '../../types';
import { compressImages } from '../../utils/imageCompression';

type Props = { order: WorkOrder; onClose: () => void; onSubmit: (note: string, recommendation: string, photos: File[]) => Promise<void> };
export default function WorkOrderCompletionModal({ order, onClose, onSubmit }: Props) {
  const [photos, setPhotos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (photos.length > 5) {
      setError('En fazla 5 adet fotoğraf yükleyebilirsiniz.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(String(form.get('completionNote')), String(form.get('recommendation') || ''), photos);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'İş kapatılamadı.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <div className="modal work-completion-modal">
        <div className="modal-header">
          <div>
            <p className="eyebrow">SAHA KAPANIŞI · {order.id}</p>
            <h2>Uygulamayı tamamla</h2>
            <p>{order.client} · {order.branch} için yapılan işlemi resmi kayda dönüştürün.</p>
          </div>
          <button className="icon-button" onClick={onClose}><X size={20} /></button>
        </div>
        <form onSubmit={submit}>
          <label>
            Yapılan işlem ve sonuç
            <textarea name="completionNote" minLength={3} maxLength={2000} placeholder="Uygulanan alanlar, tespitler ve işlem sonucu..." required />
          </label>
          <label>
            <span><Lightbulb size={16} /> Düzeltici / önleyici öneri</span>
            <textarea name="recommendation" maxLength={2000} placeholder="Düzeltici veya önleyici öneriyi yazın" />
          </label>
          <label className="photo-upload-field">
            <span><Camera size={18} /> Saha fotoğrafları</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={async (event) => {
                const rawFiles = Array.from(event.target.files ?? []).slice(0, 5);
                if (rawFiles.length === 0) return;
                const compressed = await compressImages(rawFiles, { maxDimension: 1600, quality: 0.82 });
                setPhotos(compressed);
              }}
            />
            <small>{photos.length ? `${photos.length} fotoğraf seçildi (otomatik optimize edildi)` : 'İsteğe bağlı · en fazla 5 fotoğraf'}</small>
          </label>
          {error && <div className="modal-form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Vazgeç</button>
            <button className="primary-button" disabled={saving}>{saving ? 'Kaydediliyor…' : 'İşi Tamamla'} <Check size={17} /></button>
          </div>
        </form>
      </div>
    </div>
  );
}
