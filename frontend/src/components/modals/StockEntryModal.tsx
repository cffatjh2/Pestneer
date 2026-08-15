import { FormEvent, useState } from 'react';
import { Check, ShieldCheck, X } from 'lucide-react';
import { pesticideCatalog } from '../../data/pesticideCatalog';
import type { CreateInventoryEntry } from '../../services/inventoryApi';

export default function StockEntryModal({ onClose, onSubmit }: {
  onClose: () => void;
  onSubmit: (input: CreateInventoryEntry) => Promise<void>;
}) {
  const [selectedProduct, setSelectedProduct] = useState('');
  const [isManual, setIsManual] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = isManual ? String(formData.get('customProduct') ?? '').trim() : selectedProduct;
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit({
        name,
        category: String(formData.get('category') ?? ''),
        quantity: Number(formData.get('quantity')),
        unit: String(formData.get('unit') ?? ''),
        minimumQuantity: Number(formData.get('minimumQuantity')),
        unitCost: Number(formData.get('unitCost')),
        lotNumber: String(formData.get('lotNumber') ?? '').trim() || undefined,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Stok girişi kaydedilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="stock-entry-title">
      <div className="modal stock-entry-modal">
        <div className="modal-header"><div><p className="eyebrow">ENVANTER & DEPO</p><h2 id="stock-entry-title">Stok Girişi</h2><p>Depoya eklenecek ürünün miktar ve minimum stok seviyesini girin.</p></div><button className="icon-button" onClick={onClose} type="button" aria-label="Pencereyi kapat"><X size={20} /></button></div>
        <div className="stock-license-note"><ShieldCheck size={17} /><span>Biyosidal ürünlerde ticari marka, ruhsat numarası ve etiket bilgilerini ambalaj üzerinden doğrulayın.</span></div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="form-field-wide">Ürün seçimi<select value={isManual ? 'manual' : selectedProduct} onChange={(event) => { setIsManual(event.target.value === 'manual'); setSelectedProduct(event.target.value === 'manual' ? '' : event.target.value); }} required><option value="" disabled>Ürün seçin…</option>{pesticideCatalog.map((name) => <option key={name} value={name}>{name}</option>)}<option value="manual">+ Diğer ürün (manuel giriş)</option></select></label>
            {isManual && <label className="form-field-wide">Yeni ürün adı<input name="customProduct" minLength={2} maxLength={160} placeholder="Ticari ürün adını yazın" required /></label>}
            <label>Kategori<select name="category" defaultValue="Biyosidal ürün" required><option>Biyosidal ürün</option><option>Larvasit</option><option>Jel insektisit</option><option>Sarf malzeme</option><option>Ekipman</option></select></label>
            <label>Birim<select name="unit" defaultValue="Litre" required><option>Litre</option><option>Mililitre</option><option>Kilogram</option><option>Gram</option><option>Adet</option><option>Tüp</option><option>Kutu</option><option>Paket</option></select></label>
            <label>Giriş miktarı<input name="quantity" type="number" min="0.01" step="0.01" required /></label>
            <label>Minimum stok<input name="minimumQuantity" type="number" min="0" step="0.01" defaultValue="1" required /></label>
            <label>Birim maliyet (₺)<input name="unitCost" type="number" min="0" step="0.01" defaultValue="0" required /></label>
            <label className="form-field-wide">Lot / Parti No<input name="lotNumber" maxLength={80} placeholder="İsteğe bağlı" /></label>
          </div>
          {error && <div className="modal-form-error" role="alert">{error}</div>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={isSubmitting}>İptal</button><button type="submit" className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Kaydediliyor…' : 'Stoklara Ekle'} <Check size={17} /></button></div>
        </form>
      </div>
    </div>
  );
}
