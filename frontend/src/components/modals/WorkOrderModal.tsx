import { useMemo, useState, type FormEvent } from 'react';
import { ArrowUpRight, Building2, CheckSquare2, MapPin, Plus, Search, Square, X } from 'lucide-react';
import type { EmployeeRecord } from '../../services/employeeApi';
import type { CreateWorkOrdersInput, CustomerRecord } from '../../services/workOrderApi';

type WorkOrderModalProps = {
  customers: CustomerRecord[];
  employees: EmployeeRecord[];
  onClose: () => void;
  onManageCustomers: () => void;
  onSubmit: (input: CreateWorkOrdersInput) => Promise<void>;
};

export default function WorkOrderModal({ customers, employees, onClose, onManageCustomers, onSubmit }: WorkOrderModalProps) {
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [branchSearch, setBranchSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const visibleBranches = useMemo(() => {
    const query = branchSearch.trim().toLocaleLowerCase('tr-TR');
    return (selectedCustomer?.branches ?? []).filter((branch) => !query ||
      `${branch.name} ${branch.code} ${branch.city ?? ''} ${branch.district ?? ''} ${branch.address}`
        .toLocaleLowerCase('tr-TR').includes(query));
  }, [selectedCustomer, branchSearch]);

  const handleCustomerChange = (nextCustomerId: string) => {
    setCustomerId(nextCustomerId);
    setSelectedBranchIds([]);
    setBranchSearch('');
  };

  const toggleBranch = (branchId: string) => {
    setSelectedBranchIds((current) => current.includes(branchId)
      ? current.filter((id) => id !== branchId)
      : [...current, branchId]);
  };

  const toggleAllVisible = () => {
    const visibleIds = visibleBranches.map((branch) => branch.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedBranchIds.includes(id));
    setSelectedBranchIds((current) => allSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : Array.from(new Set([...current, ...visibleIds])));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!customerId || selectedBranchIds.length === 0) {
      setError('İş emri oluşturmak için en az bir şube seçin.');
      return;
    }
    const formData = new FormData(event.currentTarget);
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        customerId,
        branchIds: selectedBranchIds,
        serviceType: String(formData.get('serviceType')),
        employeeAccountId: String(formData.get('employeeAccountId') || '') || undefined,
        date: String(formData.get('date')),
        time: String(formData.get('time')),
        durationMinutes: Number(formData.get('durationMinutes')),
        notes: String(formData.get('notes') || '') || undefined,
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'İş emirleri oluşturulamadı.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Yeni iş emri">
      <div className="modal work-order-modal">
        <div className="modal-header">
          <div><p className="eyebrow">OPERASYON PLANLAMA</p><h2>Çoklu şube iş emri</h2><p>Bir müşterinin seçtiğiniz tüm şubeleri için tek seferde ayrı iş emirleri oluşturun.</p></div>
          <button className="icon-button" onClick={onClose} aria-label="Kapat"><X size={20} /></button>
        </div>

        {customers.length === 0 ? (
          <div className="work-order-no-customer">
            <Building2 size={36} />
            <strong>Önce müşteri ve şubelerini tanımlayın</strong>
            <span>Çatı müşteri kaydını oluşturup tüm lokasyonları toplu olarak ekleyebilirsiniz.</span>
            <button className="primary-button" onClick={onManageCustomers}><Plus size={17} /> Müşteri ve Şube Ekle</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="work-order-customer-line">
              <label><span>Müşteri</span><select value={customerId} onChange={(event) => handleCustomerChange(event.target.value)}>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.legalName} · {customer.branches.length} şube</option>)}</select></label>
              <button type="button" className="secondary-button" onClick={onManageCustomers}><Plus size={16} /> Müşteri / Şube Yönet</button>
            </div>

            <section className="branch-picker">
              <div className="branch-picker-heading">
                <div><strong>Şubeleri seçin</strong><span>{selectedBranchIds.length} / {selectedCustomer?.branches.length ?? 0} şube seçildi</span></div>
                <button type="button" onClick={toggleAllVisible}>{visibleBranches.length > 0 && visibleBranches.every((branch) => selectedBranchIds.includes(branch.id)) ? <CheckSquare2 size={16} /> : <Square size={16} />} Görünenlerin tümü</button>
              </div>
              <div className="branch-picker-search"><Search size={17} /><input value={branchSearch} onChange={(event) => setBranchSearch(event.target.value)} placeholder="Şube adı, kodu, il veya ilçe ara" /></div>
              <div className="branch-picker-list">
                {visibleBranches.length > 0 ? visibleBranches.map((branch) => {
                  const selected = selectedBranchIds.includes(branch.id);
                  return <button type="button" key={branch.id} className={selected ? 'selected' : ''} onClick={() => toggleBranch(branch.id)}>
                    <span className="branch-check">{selected ? <CheckSquare2 size={18} /> : <Square size={18} />}</span>
                    <span><strong>{branch.name}</strong><small><MapPin size={12} /> {[branch.district, branch.city].filter(Boolean).join(' / ') || branch.address}</small></span>
                    <em>{branch.code}</em>
                  </button>;
                }) : <div className="branch-picker-empty">Bu müşteride eşleşen aktif şube bulunamadı.</div>}
              </div>
            </section>

            <div className="form-grid work-order-details">
              <label>Hizmet türü<select name="serviceType" defaultValue="Genel ilaçlama"><option>Genel ilaçlama</option><option>Kemirgen kontrolü</option><option>Periyodik kontrol</option><option>Uçan haşere kontrolü</option><option>Yürüyen haşere kontrolü</option></select></label>
              <label>Saha personeli<select name="employeeAccountId" defaultValue=""><option value="">Atama bekliyor</option>{employees.filter((employee) => employee.isActive).map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
              <label>Tarih<input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
              <label>Saat<input name="time" type="time" defaultValue="09:00" required /></label>
              <label>Tahmini süre<select name="durationMinutes" defaultValue="60"><option value="30">30 dakika</option><option value="45">45 dakika</option><option value="60">1 saat</option><option value="90">1,5 saat</option><option value="120">2 saat</option></select></label>
              <label className="form-field-wide">Operasyon notu<textarea name="notes" maxLength={1000} placeholder="Erişim bilgisi, özel talimat veya şube notu..." /></label>
            </div>

            {selectedBranchIds.length > 0 && <div className="batch-order-summary"><Building2 size={18} /><span><strong>{selectedBranchIds.length} şube</strong> için {selectedBranchIds.length} ayrı iş emri hazırlanacak.</span></div>}
            {error && <div className="modal-form-error" role="alert">{error}</div>}
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Vazgeç</button><button type="submit" className="primary-button" disabled={isSubmitting || selectedBranchIds.length === 0}>{isSubmitting ? 'Oluşturuluyor…' : `${selectedBranchIds.length || ''} İş Emri Oluştur`} <ArrowUpRight size={17} /></button></div>
          </form>
        )}
      </div>
    </div>
  );
}
