import { FormEvent, useMemo, useState } from 'react';
import { ArrowRight, PackagePlus, X } from 'lucide-react';
import type { InventoryItem, TransferInventoryInput, VehicleRecord } from '../../services/inventoryApi';

export default function VehicleTransferModal({ items, vehicles, initialVehicleId, onClose, onSubmit }: {
  items: InventoryItem[];
  vehicles: VehicleRecord[];
  initialVehicleId?: string;
  onClose: () => void;
  onSubmit: (input: TransferInventoryInput) => Promise<void>;
}) {
  const available = items.filter((item) => item.quantity > 0);
  const [form, setForm] = useState<TransferInventoryInput>({ inventoryItemId: available[0]?.id ?? '', vehicleId: initialVehicleId ?? vehicles[0]?.id ?? '', quantity: 0, note: '' });
  const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  const selected = useMemo(() => items.find((item) => item.id === form.inventoryItemId), [items, form.inventoryItemId]);
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(null); try { await onSubmit(form); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Transfer tamamlanamadı.'); } finally { setSaving(false); } };

  return <div className="modal-layer" role="dialog" aria-modal="true"><div className="modal inventory-action-modal"><div className="modal-header"><div className="employee-modal-heading"><span><PackagePlus size={20} /></span><div><p className="eyebrow">DEPO → ARAÇ</p><h2>Araca Stok Transferi</h2><p>Ürün araç stoğuna eklenirken aynı miktar depodan otomatik düşer.</p></div></div><button className="icon-button" onClick={onClose}><X size={20} /></button></div>
    <form onSubmit={submit}><div className="form-grid">
      <label className="form-field-wide">Depo ürünü<select value={form.inventoryItemId} onChange={(event) => setForm({ ...form, inventoryItemId: event.target.value })} required><option value="">Ürün seçin</option>{available.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatQuantity(item.quantity)} {item.unit}</option>)}</select></label>
      <label className="form-field-wide">Hedef araç<select value={form.vehicleId} onChange={(event) => setForm({ ...form, vehicleId: event.target.value })} required><option value="">Araç seçin</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plate} · {vehicle.assignedEmployeeName}</option>)}</select></label>
      <label>Miktar<input type="number" min="0.001" step="0.001" max={selected?.quantity} value={form.quantity || ''} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} required /></label>
      <label>Birim<input value={selected?.unit ?? '—'} disabled /></label>
      <label className="form-field-wide">Açıklama<input value={form.note ?? ''} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Örn. haftalık araç ikmali" maxLength={500} /></label>
    </div>{selected && <div className="inventory-transfer-summary"><span>Depo: <strong>{formatQuantity(selected.quantity)} {selected.unit}</strong></span><ArrowRight size={18} /><span>Transfer sonrası: <strong>{formatQuantity(Math.max(0, selected.quantity - form.quantity))} {selected.unit}</strong></span></div>}{error && <div className="modal-form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>İptal</button><button className="primary-button" disabled={saving || !available.length || !vehicles.length}>{saving ? 'Aktarılıyor…' : 'Araca Aktar'} <ArrowRight size={17} /></button></div></form>
  </div></div>;
}

const formatQuantity = (value: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(value);
