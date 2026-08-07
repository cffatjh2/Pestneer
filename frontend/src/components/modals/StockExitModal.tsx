import { FormEvent, useMemo, useState } from 'react';
import { Check, PackageMinus, X } from 'lucide-react';
import type { CreateInventoryExit, InventoryItem } from '../../services/inventoryApi';

export default function StockExitModal({ items, onClose, onSubmit }: {
  items: InventoryItem[];
  onClose: () => void;
  onSubmit: (input: CreateInventoryExit) => Promise<void>;
}) {
  const availableItems = useMemo(() => items.filter((item) => item.quantity > 0), [items]);
  const [selectedId, setSelectedId] = useState(availableItems[0]?.id ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedItem = availableItems.find((item) => item.id === selectedId);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedItem) return setError('Çıkış yapılacak stok kalemini seçin.');
    const formData = new FormData(event.currentTarget);
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        inventoryItemId: selectedItem.id,
        quantity: Number(formData.get('quantity')),
        note: String(formData.get('note') ?? '').trim() || undefined,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Stok çıkışı kaydedilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="stock-exit-title">
      <div className="modal stock-entry-modal">
        <div className="modal-header"><div><p className="eyebrow">ENVANTER & DEPO</p><h2 id="stock-exit-title">Stok Çıkışı</h2><p>Kullanılan veya araçlara aktarılan malzemeyi depodan düşürün.</p></div><button className="icon-button" onClick={onClose} type="button" aria-label="Pencereyi kapat"><X size={20} /></button></div>
        <div className="stock-license-note"><PackageMinus size={17} /><span>Çıkış işlemi stok hareketi olarak kalıcı biçimde kaydedilir ve geri alınamaz.</span></div>
        <form onSubmit={handleSubmit}>
          {availableItems.length > 0 ? <div className="form-grid">
            <label className="form-field-wide">Ürün<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} required>{availableItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatQuantity(item.quantity)} {item.unit}</option>)}</select></label>
            <label>Çıkış miktarı<input name="quantity" type="number" min="0.01" max={selectedItem?.quantity} step="0.01" placeholder="0" required /></label>
            <label>Çıkış sonrası<input value={selectedItem ? `${formatQuantity(selectedItem.quantity)} ${selectedItem.unit} mevcut` : '—'} readOnly /></label>
            <label className="form-field-wide">Açıklama<textarea name="note" rows={3} maxLength={500} placeholder="İş emri, araç, personel veya kullanım nedeni" /></label>
          </div> : <div className="modal-form-error" role="alert">Çıkış yapılabilecek miktarda stok bulunmuyor.</div>}
          {error && <div className="modal-form-error" role="alert">{error}</div>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={isSubmitting}>İptal</button><button type="submit" className="primary-button" disabled={isSubmitting || availableItems.length === 0}>{isSubmitting ? 'Kaydediliyor…' : 'Çıkışı Kaydet'} <Check size={17} /></button></div>
        </form>
      </div>
    </div>
  );
}

const formatQuantity = (quantity: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(quantity);
