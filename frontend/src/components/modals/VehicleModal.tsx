import { FormEvent, useState } from 'react';
import { CarFront, Check, X } from 'lucide-react';
import type { EmployeeRecord } from '../../services/employeeApi';
import type { CreateVehicleInput, VehicleRecord } from '../../services/inventoryApi';

export default function VehicleModal({ employees, vehicle, onClose, onSubmit }: {
  employees: EmployeeRecord[];
  vehicle?: VehicleRecord;
  onClose: () => void;
  onSubmit: (input: CreateVehicleInput) => Promise<void>;
}) {
  const [form, setForm] = useState<CreateVehicleInput>({
    plate: vehicle?.plate ?? '', brand: vehicle?.brand ?? '', model: vehicle?.model ?? '',
    modelYear: vehicle?.modelYear, assignedEmployeeAccountId: vehicle?.assignedEmployeeAccountId,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null);
    try { await onSubmit(form); }
    catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Araç kaydedilemedi.'); }
    finally { setSaving(false); }
  };

  return <div className="modal-layer" role="dialog" aria-modal="true">
    <div className="modal inventory-action-modal"><div className="modal-header"><div className="employee-modal-heading"><span><CarFront size={20} /></span><div><p className="eyebrow">FİLO YÖNETİMİ</p><h2>{vehicle ? 'Aracı Düzenle' : 'Yeni Araç Tanımla'}</h2><p>Plaka, araç bilgisi ve sorumlu personeli tanımlayın.</p></div></div><button className="icon-button" onClick={onClose}><X size={20} /></button></div>
      <form onSubmit={submit}><div className="form-grid">
        <label>Plaka<input value={form.plate} onChange={(event) => setForm({ ...form, plate: event.target.value })} placeholder="06 ABC 123" maxLength={16} required /></label>
        <label>Marka<input value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} placeholder="Ford" maxLength={80} required /></label>
        <label>Model<input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} placeholder="Transit Courier" maxLength={80} required /></label>
        <label>Model yılı<input type="number" min="1980" max="2100" value={form.modelYear ?? ''} onChange={(event) => setForm({ ...form, modelYear: event.target.value ? Number(event.target.value) : undefined })} placeholder="2024" /></label>
        <label className="form-field-wide">Sorumlu personel<select value={form.assignedEmployeeAccountId ?? ''} onChange={(event) => setForm({ ...form, assignedEmployeeAccountId: event.target.value || undefined })}><option value="">Personel atanmamış</option>{employees.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}</select></label>
      </div>{error && <div className="modal-form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>İptal</button><button className="primary-button" disabled={saving}>{saving ? 'Kaydediliyor…' : 'Aracı Kaydet'} <Check size={17} /></button></div></form>
    </div>
  </div>;
}
