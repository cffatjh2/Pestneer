import { FormEvent, useState } from 'react';
import { Check, PackagePlus, Plus, Trash2, X } from 'lucide-react';
import type { VehicleStockItemInput } from '../../services/fieldOperationsApi';

type DraftItem = VehicleStockItemInput & { key: string };

export default function VehicleStockModal({ catalog, initialItems, onClose, onSubmit }: {
  catalog: string[];
  initialItems?: VehicleStockItemInput[];
  onClose: () => void;
  onSubmit: (items: VehicleStockItemInput[]) => Promise<void>;
}) {
  const [items, setItems] = useState<DraftItem[]>(() =>
    (initialItems ?? []).map((item) => ({ ...item, key: crypto.randomUUID() })));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addCatalogItem = (productName: string) => {
    if (items.some((item) => item.productName.toLocaleLowerCase('tr-TR') === productName.toLocaleLowerCase('tr-TR'))) return;
    setItems((current) => [...current, { key: crypto.randomUUID(), productName, quantity: 1, unit: 'Adet', isManual: false }]);
  };

  const addManualItem = () => {
    setItems((current) => [...current, { key: crypto.randomUUID(), productName: '', quantity: 1, unit: 'Adet', isManual: true }]);
  };

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (items.length === 0) {
      setError('Kontrole en az bir ilaç veya ürün ekleyin.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(items.map(({ key: _key, ...item }) => item));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Araç stok kontrolü kaydedilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="vehicle-stock-title">
      <div className="modal vehicle-stock-modal">
        <div className="modal-header">
          <div className="employee-modal-heading"><span><PackagePlus size={20} /></span><div><p className="eyebrow">SAHA HAZIRLIĞI</p><h2 id="vehicle-stock-title">Araç Stok Kontrolü</h2><p>Araçtaki ilaç ve ekipmanları miktarlarıyla doğrulayın.</p></div></div>
          <button className="icon-button" onClick={onClose} aria-label="Pencereyi kapat"><X size={20} /></button>
        </div>

        {catalog.length > 0 && <div className="stock-catalog"><span>Daha önce kullanılan ürünler</span><div>{catalog.map((name) => <button type="button" key={name} onClick={() => addCatalogItem(name)}><Plus size={13} />{name}</button>)}</div></div>}

        <form onSubmit={submit}>
          <div className="vehicle-stock-items">
            {items.length === 0 && <div className="vehicle-stock-empty"><PackagePlus size={28} /><strong>Henüz ürün eklenmedi</strong><span>Listeden seçin veya manuel ürün ekleyin.</span></div>}
            {items.map((item) => (
              <div className="vehicle-stock-row" key={item.key}>
                <label>Ürün / ilaç<input value={item.productName} onChange={(event) => updateItem(item.key, { productName: event.target.value, isManual: true })} placeholder="Ürün adını yazın" maxLength={160} required /></label>
                <label>Miktar<input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event) => updateItem(item.key, { quantity: Number(event.target.value) })} required /></label>
                <label>Birim<select value={item.unit} onChange={(event) => updateItem(item.key, { unit: event.target.value })}><option>Adet</option><option>Litre</option><option>Mililitre</option><option>Kilogram</option><option>Gram</option><option>Paket</option><option>Kutu</option></select></label>
                <button type="button" onClick={() => setItems((current) => current.filter((entry) => entry.key !== item.key))} aria-label={`${item.productName || 'Ürün'} kaydını kaldır`}><Trash2 size={17} /></button>
              </div>
            ))}
          </div>

          <button type="button" className="stock-manual-add" onClick={addManualItem}><Plus size={16} /> Manuel ürün ekle</button>
          {error && <div className="modal-form-error" role="alert">{error}</div>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={isSubmitting}>İptal</button><button className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Kaydediliyor…' : 'Kontrolü Tamamla'} <Check size={17} /></button></div>
        </form>
      </div>
    </div>
  );
}
