import { useMemo, useState, type FormEvent } from 'react';
import { ArrowUpRight, Building2, CalendarRange, CheckSquare2, MapPin, Plus, Search, Square, X } from 'lucide-react';
import type { WorkOrder } from '../../types';
import type { EmployeeRecord } from '../../services/employeeApi';
import type { CreateWorkOrdersInput, CustomerRecord, UpdateWorkOrderInput } from '../../services/workOrderApi';

type Props = {
  customers: CustomerRecord[];
  employees?: EmployeeRecord[];
  editingOrder?: WorkOrder | null;
  selfSchedule?: boolean;
  onClose: () => void;
  onManageCustomers?: () => void;
  onCreate?: (input: CreateWorkOrdersInput) => Promise<void>;
  onUpdate?: (input: UpdateWorkOrderInput) => Promise<void>;
};

export default function WorkOrderModal({ customers, employees = [], editingOrder, selfSchedule, onClose, onManageCustomers, onCreate, onUpdate }: Props) {
  const isEditing = Boolean(editingOrder);
  const [customerId, setCustomerId] = useState(editingOrder?.customerId ?? customers[0]?.id ?? '');
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>(editingOrder?.branchId ? [editingOrder.branchId] : []);
  const [branchAssignments, setBranchAssignments] = useState<Record<string, string>>(editingOrder?.branchId ? { [editingOrder.branchId]: editingOrder.employeeAccountId ?? '' } : {});
  const [teamEmployeeIds, setTeamEmployeeIds] = useState<string[]>(editingOrder?.assignments.map((item) => item.employeeAccountId) ?? []);
  const [branchSearch, setBranchSearch] = useState('');
  const [recurrenceType, setRecurrenceType] = useState('Once');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const visibleBranches = useMemo(() => {
    const query = branchSearch.trim().toLocaleLowerCase('tr-TR');
    return (selectedCustomer?.branches ?? []).filter((branch) => !query || `${branch.name} ${branch.code} ${branch.city ?? ''} ${branch.district ?? ''} ${branch.address}`.toLocaleLowerCase('tr-TR').includes(query));
  }, [selectedCustomer, branchSearch]);
  const initialDate = editingOrder ? toDateInput(editingOrder.scheduledAt) : toDateInput(new Date().toISOString());
  const initialTime = editingOrder ? toTimeInput(editingOrder.scheduledAt) : '09:00';

  const handleCustomerChange = (nextCustomerId: string) => { setCustomerId(nextCustomerId); setSelectedBranchIds([]); setBranchAssignments({}); setBranchSearch(''); };
  const toggleBranch = (branchId: string) => {
    setSelectedBranchIds((current) => current.includes(branchId) ? current.filter((id) => id !== branchId) : [...current, branchId]);
    setBranchAssignments((current) => ({ ...current, [branchId]: current[branchId] ?? '' }));
  };
  const toggleAllVisible = () => {
    const visibleIds = visibleBranches.map((branch) => branch.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedBranchIds.includes(id));
    setSelectedBranchIds((current) => allSelected ? current.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...current, ...visibleIds])));
  };
  const applyEmployeeToAll = (employeeId: string) => setBranchAssignments((current) => Object.fromEntries(selectedBranchIds.map((id) => [id, employeeId || current[id] || ''])));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!customerId || selectedBranchIds.length === 0) { setError('İş emri oluşturmak için en az bir şube seçin.'); return; }
    const form = new FormData(event.currentTarget);
    setIsSubmitting(true); setError(null);
    try {
      if (isEditing && onUpdate) {
        await onUpdate({
          employeeAccountId: String(form.get('employeeAccountId') || '') || undefined,
          employeeAccountIds: teamEmployeeIds,
          serviceType: String(form.get('serviceType')), visitType: String(form.get('visitType')), date: String(form.get('date')),
          time: String(form.get('time')), durationMinutes: Number(form.get('durationMinutes')), notes: String(form.get('notes') || '') || undefined,
          status: String(form.get('status') || 'Planned'),
        });
      } else if (onCreate) {
        const manualDates = String(form.get('manualDates') || '').split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
        await onCreate({
          customerId, branchIds: selectedBranchIds, serviceType: String(form.get('serviceType')), date: String(form.get('date')),
          time: String(form.get('time')), durationMinutes: Number(form.get('durationMinutes')), notes: String(form.get('notes') || '') || undefined,
          visitType: String(form.get('visitType')), recurrenceType, occurrenceCount: Number(form.get('occurrenceCount') || 0) || undefined,
          manualDates: recurrenceType === 'Manual' ? manualDates : undefined,
          branchAssignments: selfSchedule ? undefined : selectedBranchIds.map((branchId) => ({ branchId, employeeAccountId: branchAssignments[branchId] || undefined })),
          employeeAccountIds: selfSchedule ? undefined : teamEmployeeIds,
        });
      }
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'İş emri kaydedilemedi.'); }
    finally { setIsSubmitting(false); }
  };

  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label={isEditing ? 'İş emrini düzenle' : 'Yeni iş emri'}>
    <div className="modal work-order-modal phase-two-work-modal">
      <div className="modal-header"><div><p className="eyebrow">OPERASYON PLANLAMA</p><h2>{isEditing ? `${editingOrder?.id} iş emrini düzenle` : selfSchedule ? 'Kendime iş planla' : 'Akıllı iş emri planlama'}</h2><p>{isEditing ? 'Personel, zaman ve operasyon tipini güncelleyin.' : 'Şubeleri farklı personele atayın, tek seferlik veya periyodik plan oluşturun.'}</p></div><button className="icon-button" onClick={onClose} aria-label="Kapat"><X size={20} /></button></div>
      {customers.length === 0 ? <div className="work-order-no-customer"><Building2 size={36} /><strong>Aktif müşteri ve şube bulunmuyor</strong>{onManageCustomers && <button className="primary-button" onClick={onManageCustomers}><Plus size={17} /> Müşteri ve Şube Ekle</button>}</div> : <form onSubmit={handleSubmit}>
        <div className="work-order-customer-line"><label><span>Müşteri</span><select value={customerId} disabled={isEditing} onChange={(event) => handleCustomerChange(event.target.value)}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.legalName} · {customer.branches.length} şube</option>)}</select></label>{onManageCustomers && !isEditing && <button type="button" className="secondary-button" onClick={onManageCustomers}><Plus size={16} /> Müşteri / Şube Yönet</button>}</div>

        {!isEditing && <section className="branch-picker"><div className="branch-picker-heading"><div><strong>Şubeleri seçin</strong><span>{selectedBranchIds.length} / {selectedCustomer?.branches.length ?? 0} şube seçildi</span></div><button type="button" onClick={toggleAllVisible}>{visibleBranches.length > 0 && visibleBranches.every((branch) => selectedBranchIds.includes(branch.id)) ? <CheckSquare2 size={16} /> : <Square size={16} />} Görünenlerin tümü</button></div><div className="branch-picker-search"><Search size={17} /><input value={branchSearch} onChange={(event) => setBranchSearch(event.target.value)} placeholder="Şube adı, kodu, il veya ilçe ara" /></div><div className="branch-picker-list">{visibleBranches.map((branch) => { const selected = selectedBranchIds.includes(branch.id); return <button type="button" key={branch.id} className={selected ? 'selected' : ''} onClick={() => toggleBranch(branch.id)}><span className="branch-check">{selected ? <CheckSquare2 size={18} /> : <Square size={18} />}</span><span><strong>{branch.name}</strong><small><MapPin size={12} /> {[branch.district, branch.city].filter(Boolean).join(' / ') || branch.address}</small></span><em>{branch.code}</em></button>; })}</div></section>}

        {!selfSchedule && !isEditing && selectedBranchIds.length > 0 && <section className="branch-assignment-panel"><div className="assignment-heading"><div><strong>Şube bazlı personel ataması</strong><span>Her lokasyon için farklı saha personeli belirleyebilirsiniz.</span></div><select defaultValue="" onChange={(event) => applyEmployeeToAll(event.target.value)}><option value="">Toplu personel ata</option>{employees.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="assignment-list">{selectedBranchIds.map((id) => { const branch = selectedCustomer?.branches.find((item) => item.id === id); return <label key={id}><span>{branch?.name}</span><select value={branchAssignments[id] ?? ''} onChange={(event) => setBranchAssignments((current) => ({ ...current, [id]: event.target.value }))}><option value="">Atama bekliyor</option>{employees.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>; })}</div></section>}
        {!selfSchedule && (isEditing || selectedBranchIds.length > 0) && <section className="branch-assignment-panel work-team-panel"><div className="assignment-heading"><div><strong>Ortak saha ekibi</strong><span>Büyük tesislerde birden fazla personel aynı işi eş zamanlı başlatabilir.</span></div></div><div className="work-team-options">{employees.filter((item) => item.isActive).map((item) => <label key={item.id}><input type="checkbox" checked={teamEmployeeIds.includes(item.id)} onChange={() => setTeamEmployeeIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span>{item.name}</span><small>{item.role}</small></label>)}</div></section>}

        <div className="form-grid work-order-details">
          <label>Hizmet türü<select name="serviceType" defaultValue={editingOrder?.service ?? 'Genel ilaçlama'}><option>Genel ilaçlama</option><option>Kemirgen kontrolü</option><option>Periyodik kontrol</option><option>Uçan haşere kontrolü</option><option>Yürüyen haşere kontrolü</option></select></label>
          <label>İşin niteliği<select name="visitType" defaultValue={editingOrder?.visitType ?? 'Routine'}><option value="Routine">Rutin hizmet</option><option value="Extra">Ekstra hizmet</option><option value="EmergencyPaid">Ücretli acil çağrı</option><option value="EmergencyFree">Ücretsiz acil çağrı</option></select></label>
          {isEditing && <label>Saha personeli<select name="employeeAccountId" defaultValue={editingOrder?.employeeAccountId ?? ''}><option value="">Atama bekliyor</option>{employees.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          <label>Tarih<input name="date" type="date" defaultValue={initialDate} required /></label><label>Saat<input name="time" type="time" defaultValue={initialTime} required /></label>
          <label>Tahmini süre<select name="durationMinutes" defaultValue={String(editingOrder?.durationMinutes ?? 60)}><option value="30">30 dakika</option><option value="45">45 dakika</option><option value="60">1 saat</option><option value="90">1,5 saat</option><option value="120">2 saat</option></select></label>
          {!isEditing && <label>Tekrar düzeni<select value={recurrenceType} onChange={(event) => setRecurrenceType(event.target.value)}><option value="Once">Tek seferlik</option><option value="Monthly">Aylık (12 Aylık Periyot)</option><option value="Weekly">Haftalık (52 Haftalık Periyot)</option><option value="Manual">Manuel tarihler</option></select></label>}
          {!isEditing && (recurrenceType === 'Weekly' || recurrenceType === 'Monthly') && (
            <label>
              {recurrenceType === 'Monthly' ? 'Tekrar sayısı (Ay)' : 'Tekrar sayısı (Hafta)'}
              <input
                name="occurrenceCount"
                type="number"
                min="2"
                max={recurrenceType === 'Weekly' ? 104 : 60}
                key={recurrenceType}
                defaultValue={recurrenceType === 'Monthly' ? 12 : 52}
              />
            </label>
          )}
          {!isEditing && recurrenceType === 'Manual' && <label className="form-field-wide">Ek tarihler<textarea name="manualDates" placeholder="Tarihleri virgülle ayırın (Örn: 2026-09-15, 2026-10-15)" required /></label>}
          {isEditing && <label>Durum<select name="status" defaultValue={editingOrder?.technicalStatus ?? 'Planned'}><option value="Planned">Planlandı</option><option value="Cancelled">İptal</option></select></label>}
          <label className="form-field-wide">Operasyon notu<textarea name="notes" defaultValue={editingOrder?.notes} maxLength={1000} placeholder="Erişim bilgisi, özel talimat veya şube notu..." /></label>
        </div>
        {!isEditing && (recurrenceType === 'Monthly' || recurrenceType === 'Weekly') && (
          <div className="batch-order-summary" style={{ marginTop: '8px' }}>
            <CalendarRange size={18} />
            <span>
              <strong>12 Aylık Takvim Projeksiyonu:</strong> {recurrenceType === 'Monthly' ? 'Seçtiğiniz tarihin gününe göre (örn. her ayın 3\'ü) 12 ay boyunca takvime otomatik iş emri tanımlanır.' : 'Her 7 günde bir olmak üzere 52 hafta boyunca takvime iş emri tanımlanır.'} Rutin işleri personel farklı günlerde de esnek olarak başlatabilir.
            </span>
          </div>
        )}
        {!isEditing && selectedBranchIds.length > 0 && <div className="batch-order-summary"><CalendarRange size={18} /><span><strong>{selectedBranchIds.length} şube</strong> seçildi. Tekrar düzenine göre her tarih ve şube için bağımsız iş emri oluşur.</span></div>}
        {error && <div className="modal-form-error" role="alert">{error}</div>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Vazgeç</button><button type="submit" className="primary-button" disabled={isSubmitting || selectedBranchIds.length === 0}>{isSubmitting ? 'Kaydediliyor…' : isEditing ? 'Değişiklikleri Kaydet' : 'Planı Oluştur'} <ArrowUpRight size={17} /></button></div>
      </form>}
    </div>
  </div>;
}

function toDateInput(value: string) { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function toTimeInput(value: string) { const date = new Date(value); return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }
