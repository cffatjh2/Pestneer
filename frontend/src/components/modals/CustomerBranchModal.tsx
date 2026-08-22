import { useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from 'react';
import {
  Archive,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileArchive,
  FileSpreadsheet,
  FolderArchive,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Store,
  Table2,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  archiveCustomer,
  archiveCustomerBranch,
  deleteCustomer,
  unarchiveCustomer,
  unarchiveCustomerBranch,
  updateCustomerBranchLocation,
  updateCustomerLocation,
  type CreateBranchInput,
  type CreateCustomerInput,
  type CustomerRecord,
} from '../../services/workOrderApi';
import { downloadBranchTemplate, parseBranchWorkbook } from '../../utils/branchExcel';
import LocationPicker, { type LocationValue } from '../maps/LocationPicker';

type CustomerBranchModalProps = {
  accessToken?: string;
  customers: CustomerRecord[];
  onClose: () => void;
  onSubmit: (customerId: string | null, customer: CreateCustomerInput | null, branches: CreateBranchInput[]) => Promise<void>;
  onRefresh?: () => Promise<void>;
};

type ManualBranchDraft = {
  name: string; code: string; address: string; city: string; district: string; contactName: string;
  phoneNumber: string; email: string; latitude: string; longitude: string; mapUrl: string;
  portalContactName: string; portalEmail: string; portalPassword: string;
};

const emptyManualBranch: ManualBranchDraft = {
  name: '', code: '', address: '', city: '', district: '', contactName: '', phoneNumber: '', email: '',
  latitude: '', longitude: '', mapUrl: '', portalContactName: '', portalEmail: '', portalPassword: '',
};

export default function CustomerBranchModal({ accessToken, customers, onClose, onSubmit, onRefresh }: CustomerBranchModalProps) {
  const [mode, setMode] = useState<'manage' | 'existing' | 'new'>('manage');
  const [customerFilter, setCustomerFilter] = useState<'active' | 'archived'>('active');
  const [customerSearch, setCustomerSearch] = useState('');
  const [expandedCustomerIds, setExpandedCustomerIds] = useState<Set<string>>(new Set());
  const [deletingTarget, setDeletingTarget] = useState<{ type: 'customer' | 'branch'; customerId: string; branchId?: string; name: string } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [newCustomerStructure, setNewCustomerStructure] = useState<'single' | 'multi'>('single');
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [importMode, setImportMode] = useState<'manual' | 'excel' | 'text'>('manual');
  const [manualBranch, setManualBranch] = useState<ManualBranchDraft>(emptyManualBranch);
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerLocation, setCustomerLocation] = useState<LocationValue>({});
  const [editingLocation, setEditingLocation] = useState<{ customerId: string; branchId?: string; name: string; address?: string; value: LocationValue } | null>(null);
  const [branchText, setBranchText] = useState('');
  const [excelBranches, setExcelBranches] = useState<CreateBranchInput[]>([]);
  const [excelFileName, setExcelFileName] = useState('');
  const [excelError, setExcelError] = useState<string | null>(null);
  const [isReadingExcel, setIsReadingExcel] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textBranches = useMemo(() => parseBranches(branchText), [branchText]);
  const manualBranches = useMemo(() => toManualBranches(manualBranch), [manualBranch]);
  const parsedBranches = importMode === 'manual' ? manualBranches : importMode === 'excel' ? excelBranches : textBranches;

  const toggleExpand = (id: string) => {
    setExpandedCustomerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      const isArchived = c.isActive === false;
      if (customerFilter === 'active' && isArchived) return false;
      if (customerFilter === 'archived' && !isArchived) return false;
      if (!customerSearch.trim()) return true;
      const search = customerSearch.trim().toLocaleLowerCase('tr-TR');
      const inCust = `${c.legalName} ${c.code} ${c.contactName ?? ''} ${c.phoneNumber ?? ''} ${c.email ?? ''} ${c.city ?? ''} ${c.district ?? ''}`.toLocaleLowerCase('tr-TR');
      const inBranches = c.branches.some((b) => `${b.name} ${b.code} ${b.address} ${b.contactName ?? ''}`.toLocaleLowerCase('tr-TR').includes(search));
      return inCust.includes(search) || inBranches;
    });
  }, [customers, customerFilter, customerSearch]);

  const activeCustomerCount = useMemo(() => customers.filter((c) => c.isActive !== false).length, [customers]);
  const archivedCustomerCount = useMemo(() => customers.filter((c) => c.isActive === false).length, [customers]);

  const handleArchiveCustomer = async (cId: string) => {
    if (!accessToken) return;
    setActionBusy(true);
    setError(null);
    try {
      await archiveCustomer(accessToken, cId);
      await onRefresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Müşteri arşivlenemedi.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleUnarchiveCustomer = async (cId: string) => {
    if (!accessToken) return;
    setActionBusy(true);
    setError(null);
    try {
      await unarchiveCustomer(accessToken, cId);
      await onRefresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Müşteri arşivden çıkarılamadı.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleArchiveBranch = async (cId: string, bId: string) => {
    if (!accessToken) return;
    setActionBusy(true);
    setError(null);
    try {
      await archiveCustomerBranch(accessToken, cId, bId);
      await onRefresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Şube arşivlenemedi.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleUnarchiveBranch = async (cId: string, bId: string) => {
    if (!accessToken) return;
    setActionBusy(true);
    setError(null);
    try {
      await unarchiveCustomerBranch(accessToken, cId, bId);
      await onRefresh?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Şube arşivden çıkarılamadı.');
    } finally {
      setActionBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingTarget || !accessToken) return;
    setActionBusy(true);
    try {
      if (deletingTarget.type === 'customer') {
        await deleteCustomer(accessToken, deletingTarget.customerId);
      }
      await onRefresh?.();
      setDeletingTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Silme işlemi tamamlanamadı.');
    } finally {
      setActionBusy(false);
    }
  };

  const loadExcelFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setExcelError('Dosya boyutu 5 MB sınırını aşamaz.');
      setExcelBranches([]);
      return;
    }

    setIsReadingExcel(true);
    setExcelError(null);
    setError(null);
    try {
      const branches = await parseBranchWorkbook(file);
      setExcelBranches(branches);
      setExcelFileName(file.name);
    } catch (readError) {
      setExcelBranches([]);
      setExcelFileName(file.name);
      setExcelError(readError instanceof Error ? readError.message : 'Excel dosyası okunamadı.');
    } finally {
      setIsReadingExcel(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void loadExcelFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void loadExcelFile(event.dataTransfer.files?.[0]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const singleLocation = mode === 'new' && newCustomerStructure === 'single';
    const hasIncompleteManualBranch = !singleLocation && importMode === 'manual' && Object.values(manualBranch).some((value) => value.trim()) && manualBranches.length === 0;
    if (hasIncompleteManualBranch) {
      setError('Şube adı ve açık adres alanlarını tamamlayın.');
      return;
    }
    if (mode === 'existing' && parsedBranches.length === 0) {
      setError(importMode === 'manual' ? 'Şube adı ve açık adres alanlarını tamamlayın.' : importMode === 'excel' ? 'Geçerli bir Excel dosyası yükleyin.' : 'En az bir şube satırı girin.');
      return;
    }
    const customer: CreateCustomerInput | null = mode === 'new' ? {
      legalName: String(formData.get('legalName')),
      code: String(formData.get('code') || '') || undefined,
      contactName: String(formData.get('contactName') || '') || undefined,
      phoneNumber: String(formData.get('phoneNumber') || '') || undefined,
      email: String(formData.get('email') || '') || undefined,
      address: customerAddress.trim() || undefined,
      city: String(formData.get('city') || '') || undefined,
      district: String(formData.get('district') || '') || undefined,
      latitude: customerLocation.latitude,
      longitude: customerLocation.longitude,
      mapUrl: customerLocation.mapUrl,
      portalContactName: String(formData.get('portalContactName') || '') || undefined,
      portalEmail: String(formData.get('portalEmail') || '') || undefined,
      portalPassword: String(formData.get('portalPassword') || '') || undefined,
    } : null;
    const branchesToSave: CreateBranchInput[] = singleLocation && customer ? [{
      name: 'Merkez',
      code: customer.code ? `${customer.code}-MRK` : undefined,
      address: customer.address ?? '',
      city: customer.city,
      district: customer.district,
      contactName: customer.contactName,
      phoneNumber: customer.phoneNumber,
      email: customer.email,
      latitude: customer.latitude,
      longitude: customer.longitude,
      mapUrl: customer.mapUrl,
    }] : parsedBranches;
    if (singleLocation && !customer?.address?.trim()) {
      setError('Tek lokasyonlu müşteri için açık adresi girin. Bu adres Merkez lokasyonu olarak kaydedilecek.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(mode === 'existing' ? customerId : null, customer, branchesToSave);
      setMode('manage');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Müşteri ve şubeler kaydedilemedi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveEditedLocation = async () => {
    if (!editingLocation || !accessToken) return;
    setActionBusy(true); setError(null);
    try {
      if (editingLocation.branchId) await updateCustomerBranchLocation(accessToken, editingLocation.customerId, editingLocation.branchId, editingLocation.value);
      else await updateCustomerLocation(accessToken, editingLocation.customerId, editingLocation.value);
      await onRefresh?.();
      setEditingLocation(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Konum kaydedilemedi.');
    } finally { setActionBusy(false); }
  };

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Müşteri ve şube yönetimi">
      <div className="modal customer-branch-modal" style={{ maxWidth: '820px' }}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">MÜŞTERİ & ŞUBE PORTFÖYÜ</p>
            <h2>{mode === 'manage' ? 'Müşteriler, Şubeler ve Arşiv' : mode === 'new' ? 'Yeni Çatı Müşteri Ekle' : 'Müşteriye Yeni Şube Ekle'}</h2>
            <p>Müşterileri ve şubeleri listeleyin, arşivleyin veya yeni lokasyonlar tanımlayın.</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Kapat"><X size={20} /></button>
        </div>

        <div className="customer-mode-switch" style={{ marginBottom: '16px' }}>
          <button type="button" className={mode === 'manage' ? 'active' : ''} onClick={() => { setMode('manage'); setError(null); }}>
            <Building2 size={15} /> Müşteri & Şube Listesi ({customers.length})
          </button>
          <button type="button" className={mode === 'new' ? 'active' : ''} onClick={() => { setMode('new'); setError(null); }}>
            <Plus size={15} /> Yeni Çatı Müşteri
          </button>
          <button type="button" className={mode === 'existing' ? 'active' : ''} onClick={() => { setMode('existing'); setError(null); }} disabled={customers.length === 0}>
            <Store size={15} /> Şube Ekle
          </button>
        </div>

        {mode === 'manage' ? (
          <div className="customer-manage-container" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px', gap: '3px' }}>
                <button
                  type="button"
                  onClick={() => setCustomerFilter('active')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: customerFilter === 'active' ? '#fff' : 'transparent',
                    color: customerFilter === 'active' ? '#0f172a' : '#64748b',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer',
                    boxShadow: customerFilter === 'active' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  🟢 Aktif Müşteriler ({activeCustomerCount})
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerFilter('archived')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: customerFilter === 'archived' ? '#fff' : 'transparent',
                    color: customerFilter === 'archived' ? '#0f172a' : '#64748b',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer',
                    boxShadow: customerFilter === 'archived' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  📁 Arşivlenmiş ({archivedCustomerCount})
                </button>
              </div>

              <div style={{ flex: 1, minWidth: '200px', position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Müşteri adı, şube, yetkili veya şehir ara…"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  style={{ width: '100%', height: '36px', paddingLeft: '32px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                />
              </div>
            </div>

            {error && <div className="modal-form-error" role="alert">{error}</div>}

            <div style={{ maxHeight: '52vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {filteredCustomers.length === 0 ? (
                <div style={{ padding: '40px 20px', textAlign: 'center', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                  <Building2 size={32} color="#94a3b8" />
                  <p style={{ marginTop: '8px', fontWeight: 700, color: '#475569' }}>
                    {customerFilter === 'archived' ? 'Arşivlenmiş müşteri bulunmuyor.' : 'Arama kriterine uygun müşteri bulunamadı.'}
                  </p>
                </div>
              ) : (
                filteredCustomers.map((cust) => {
                  const isArchived = cust.isActive === false;
                  const isExpanded = expandedCustomerIds.has(cust.id);
                  const activeBranches = cust.branches.filter((b) => b.isActive !== false);
                  const archivedBranches = cust.branches.filter((b) => b.isActive === false);

                  return (
                    <div
                      key={cust.id}
                      style={{
                        borderRadius: '12px',
                        border: isArchived ? '1px dashed #cbd5e1' : '1px solid #e2e8f0',
                        background: isArchived ? '#f8fafc' : '#ffffff',
                        overflow: 'hidden',
                        transition: 'all 0.15s',
                      }}
                    >
                      <div
                        style={{
                          padding: '14px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          background: isArchived ? '#f1f5f9' : '#fafafa',
                          borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: isArchived ? '#e2e8f0' : '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: isArchived ? '#64748b' : '#2563eb', flexShrink: 0 }}>
                            <Building2 size={18} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <strong style={{ fontSize: '14.5px', color: isArchived ? '#64748b' : '#0f172a' }}>{cust.legalName}</strong>
                              {isArchived && <span style={{ fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626' }}>Arşivli</span>}
                            </div>
                            <small style={{ color: '#64748b', fontSize: '12px', display: 'block' }}>
                              Kod: <b>{cust.code}</b> · {activeBranches.length} Aktif Şube {archivedBranches.length > 0 ? `(${archivedBranches.length} Arşivli)` : ''}
                              {cust.contactName ? ` · Yetkili: ${cust.contactName}` : ''}
                              {cust.phoneNumber ? ` · Tel: ${cust.phoneNumber}` : ''}
                            </small>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {!isArchived && <button
                            type="button"
                            onClick={() => setEditingLocation({ customerId: cust.id, name: `${cust.legalName} · Merkez`, address: cust.address, value: { latitude: cust.latitude, longitude: cust.longitude, mapUrl: cust.mapUrl } })}
                            style={{ height: '30px', padding: '0 8px', borderRadius: '6px', border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title="Merkez konumunu haritadan seç"
                          ><MapPin size={13}/> {cust.latitude != null ? 'Konumu Düzenle' : 'Konum Ekle'}</button>}
                          <button
                            type="button"
                            onClick={() => { setCustomerId(cust.id); setMode('existing'); }}
                            style={{ height: '30px', padding: '0 8px', borderRadius: '6px', border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title="Yeni Şube Ekle"
                          >
                            <Plus size={13} /> Şube Ekle
                          </button>

                          {isArchived ? (
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => void handleUnarchiveCustomer(cust.id)}
                              style={{ height: '30px', padding: '0 8px', borderRadius: '6px', border: '1px solid #99f6e4', background: '#f0fdfa', color: '#0d9488', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              title="Müşteriyi ve Şubelerini Arşivden Çıkar"
                            >
                              <RefreshCw size={13} /> Arşivden Çıkar
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => void handleArchiveCustomer(cust.id)}
                              style={{ height: '30px', padding: '0 8px', borderRadius: '6px', border: '1px solid #fde68a', background: '#fffbeb', color: '#b45309', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              title="Müşteriyi ve Şubelerini Arşivle"
                            >
                              <FolderArchive size={13} /> Arşivle
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={() => setDeletingTarget({ type: 'customer', customerId: cust.id, name: cust.legalName })}
                            style={{ height: '30px', padding: '0 8px', borderRadius: '6px', border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            title="Müşteriyi Kalıcı Olarak Sil"
                          >
                            <Trash2 size={13} /> Sil
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleExpand(cust.id)}
                            style={{ width: '30px', height: '30px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', cursor: 'pointer' }}
                            title={isExpanded ? 'Şubeleri Gizle' : 'Şubeleri Göster'}
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div style={{ padding: '12px 16px', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Bağlı Lokasyonlar / Şubeler ({cust.branches.length})
                          </span>
                          {cust.branches.length === 0 ? (
                            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0' }}>Tanımlı şube bulunmuyor.</p>
                          ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                              {cust.branches.map((br) => {
                                const brArchived = br.isActive === false;
                                return (
                                  <div
                                    key={br.id}
                                    style={{
                                      padding: '10px 12px',
                                      borderRadius: '8px',
                                      border: brArchived ? '1px dashed #cbd5e1' : '1px solid #e2e8f0',
                                      background: brArchived ? '#f8fafc' : '#f8fafc',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      justifyContent: 'space-between',
                                      gap: '6px',
                                    }}
                                  >
                                    <div>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                                        <strong style={{ fontSize: '13px', color: brArchived ? '#64748b' : '#0f172a' }}>{br.name}</strong>
                                        {brArchived ? (
                                          <span style={{ fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626' }}>Arşivli</span>
                                        ) : (
                                          <span style={{ fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '4px', background: '#dcfce7', color: '#166534' }}>Aktif</span>
                                        )}
                                      </div>
                                      <small style={{ fontSize: '11.5px', color: '#64748b', display: 'block', marginTop: '2px' }}>
                                        {br.address} {[br.district, br.city].filter(Boolean).join(' / ')}
                                      </small>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '4px' }}>
                                      {!brArchived && <button type="button" onClick={() => setEditingLocation({ customerId: cust.id, branchId: br.id, name: `${cust.legalName} · ${br.name}`, address: br.address, value: { latitude: br.latitude, longitude: br.longitude, mapUrl: br.mapUrl } })} style={{ height: '24px', padding: '0 6px', borderRadius: '4px', border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', fontSize: '10.5px', fontWeight: 700, cursor: 'pointer' }}><MapPin size={11}/> {br.latitude != null ? 'Konumu Düzenle' : 'Konum Ekle'}</button>}
                                      {brArchived ? (
                                        <button
                                          type="button"
                                          disabled={actionBusy}
                                          onClick={() => void handleUnarchiveBranch(cust.id, br.id)}
                                          style={{ height: '24px', padding: '0 6px', borderRadius: '4px', border: '1px solid #99f6e4', background: '#f0fdfa', color: '#0d9488', fontSize: '10.5px', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                          Şubeyi Aç
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          disabled={actionBusy}
                                          onClick={() => void handleArchiveBranch(cust.id, br.id)}
                                          style={{ height: '24px', padding: '0 6px', borderRadius: '4px', border: '1px solid #fde68a', background: '#fffbeb', color: '#b45309', fontSize: '10.5px', fontWeight: 700, cursor: 'pointer' }}
                                        >
                                          Şubeyi Arşivle
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: '10px' }}>
              <button type="button" className="secondary-button" onClick={onClose}>Kapat</button>
              <button type="button" className="primary-button" onClick={() => setMode('new')}>
                <Plus size={16} /> Yeni Çatı Müşteri Ekle
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} autoComplete="off" data-lpignore="true" data-form-type="other">
            {mode === 'new' && <div className="customer-structure-switch" role="radiogroup" aria-label="Müşteri lokasyon yapısı"><button type="button" role="radio" aria-checked={newCustomerStructure === 'single'} className={newCustomerStructure === 'single' ? 'active' : ''} onClick={() => { setNewCustomerStructure('single'); setError(null); }}><MapPin size={18} /><span><strong>Tek lokasyon</strong><small>Fabrika, depo veya tek işletme</small></span><CheckCircle2 size={17} /></button><button type="button" role="radio" aria-checked={newCustomerStructure === 'multi'} className={newCustomerStructure === 'multi' ? 'active' : ''} onClick={() => { setNewCustomerStructure('multi'); setError(null); }}><Building2 size={18} /><span><strong>Şubeli yapı</strong><small>Bir çatı altında birden çok lokasyon</small></span><CheckCircle2 size={17} /></button></div>}

            {mode === 'existing' ? <label className="standalone-field">Müşteri<select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>{customers.filter(c => c.isActive !== false).map((customer) => <option key={customer.id} value={customer.id}>{customer.legalName} · {customer.branches.length} şube</option>)}</select></label> : <section className="customer-data-section">
              <div className="modal-subheading"><Building2 size={18} /><div><strong>{newCustomerStructure === 'single' ? 'Müşteri ve tek lokasyon bilgileri' : 'Çatı müşteri bilgileri'}</strong><span>{newCustomerStructure === 'single' ? 'Bu bilgiler otomatik olarak Merkez lokasyonuna da bağlanır.' : 'Merkez iletişim ve fatura/operasyon konumu'}</span></div></div>
              <div className="form-grid customer-data-grid">
                <label>Müşteri / marka adı<input name="legalName" required autoComplete="off" /></label><label>Müşteri kodu<input name="code" placeholder="Otomatik oluşturulur" autoComplete="off" /></label>
                <label>Merkez yetkilisi<input name="contactName" placeholder="Ad Soyad" autoComplete="off" /></label><label>Merkez telefonu<input name="phoneNumber" type="tel" autoComplete="off" /></label>
                <label>Merkez e-postası<input name="email" type="email" autoComplete="new-password" data-lpignore="true" placeholder="musteri@firma.com" /></label><label>İl / İlçe<span className="inline-field-pair"><input name="city" placeholder="İl" autoComplete="off" /><input name="district" placeholder="İlçe" autoComplete="off" /></span></label>
                <label className="form-field-wide">Merkez adresi<input name="address" value={customerAddress} onChange={(event)=>setCustomerAddress(event.target.value)} required={newCustomerStructure === 'single'} placeholder="Açık adres" autoComplete="off" /></label>
                <div className="form-field-wide"><LocationPicker value={customerLocation} address={customerAddress} onChange={(value,formattedAddress)=>{setCustomerLocation(value);if(formattedAddress)setCustomerAddress(formattedAddress);}} /></div>
              </div>
              <div className="customer-portal-account-block">
                <div className="modal-subheading"><CheckCircle2 size={18} /><div><strong>Çatı müşteri portal hesabı</strong><span>Bu hesap müşteri altındaki tüm şubeleri, işleri ve raporları görür.</span></div></div>
                <div className="form-grid customer-data-grid">
                  <label>Hesap yetkilisi<input name="portalContactName" placeholder="Ad Soyad" autoComplete="off" /></label>
                  <label>Giriş e-postası<input name="portalEmail" type="email" autoComplete="new-password" data-lpignore="true" placeholder="portal@musteri.com" /></label>
                  <label>Geçici şifre<input name="portalPassword" type="password" minLength={6} placeholder="En az 6 karakter" autoComplete="new-password" data-lpignore="true" /></label>
                  <div className="portal-account-note">E-posta ve şifre birlikte girildiğinde müşteri hesabı anında açılır (Şifre en az 6 karakter olmalıdır).</div>
                </div>
              </div>
            </section>}

            {mode === 'new' && newCustomerStructure === 'single' && <div className="single-location-summary"><MapPin size={20} /><div><strong>Merkez lokasyonu otomatik oluşturulacak</strong><span>Yukarıdaki adres, yetkili, telefon, e-posta ve harita bilgileri tek operasyon noktası olarak kullanılacak. Daha sonra yeni şubeler ekleyebilirsiniz.</span></div></div>}

            {(mode === 'existing' || newCustomerStructure === 'multi') && <section className="bulk-branch-section">
              <div className="modal-subheading"><FileSpreadsheet size={18} /><div><strong>Şubeleri içe aktar</strong><span>{mode === 'new' ? 'İsterseniz müşteriyi şubesiz kaydedebilir veya ' : ''}Excel dosyasıyla ya da metin listesiyle 250 lokasyona kadar ekleyin.</span></div><em>{parsedBranches.length} şube</em></div>
              <div className="branch-import-switch" role="tablist" aria-label="Şube ekleme yöntemi">
                <button type="button" className={importMode === 'manual' ? 'active' : ''} onClick={() => { setImportMode('manual'); setError(null); }}><Plus size={15} /> Tek şube</button>
                <button type="button" className={importMode === 'excel' ? 'active' : ''} onClick={() => { setImportMode('excel'); setError(null); }}><FileSpreadsheet size={15} /> Excel dosyası</button>
                <button type="button" className={importMode === 'text' ? 'active' : ''} onClick={() => { setImportMode('text'); setError(null); }}><Table2 size={15} /> Metinle ekle</button>
              </div>

              {importMode === 'manual' ? <div className="manual-branch-form">
                <div className="form-grid customer-data-grid">
                  <label>Şube adı<input value={manualBranch.name} onChange={(event) => setManualBranch({ ...manualBranch, name: event.target.value })} autoComplete="off" /></label>
                  <label>Şube kodu<input value={manualBranch.code} onChange={(event) => setManualBranch({ ...manualBranch, code: event.target.value })} placeholder="Otomatik oluşturulur" autoComplete="off" /></label>
                  <label>Şube yetkilisi<input value={manualBranch.contactName} onChange={(event) => setManualBranch({ ...manualBranch, contactName: event.target.value })} placeholder="Ad Soyad" autoComplete="off" /></label>
                  <label>Telefon<input type="tel" value={manualBranch.phoneNumber} onChange={(event) => setManualBranch({ ...manualBranch, phoneNumber: event.target.value })} autoComplete="off" /></label>
                  <label>E-posta<input type="email" value={manualBranch.email} onChange={(event) => setManualBranch({ ...manualBranch, email: event.target.value })} autoComplete="new-password" data-lpignore="true" /></label>
                  <label>İl / İlçe<span className="inline-field-pair"><input value={manualBranch.city} onChange={(event) => setManualBranch({ ...manualBranch, city: event.target.value })} placeholder="İl" autoComplete="off" /><input value={manualBranch.district} onChange={(event) => setManualBranch({ ...manualBranch, district: event.target.value })} placeholder="İlçe" autoComplete="off" /></span></label>
                  <label className="form-field-wide">Açık adres<input value={manualBranch.address} onChange={(event) => setManualBranch({ ...manualBranch, address: event.target.value })} placeholder="Mahalle, cadde, bina ve kat bilgisi" autoComplete="off" /></label>
                  <div className="form-field-wide"><LocationPicker compact value={{ latitude: optionalNumber(manualBranch.latitude), longitude: optionalNumber(manualBranch.longitude), mapUrl: manualBranch.mapUrl || undefined }} address={manualBranch.address} onChange={(value,formattedAddress)=>setManualBranch({ ...manualBranch, address: formattedAddress || manualBranch.address, latitude: value.latitude?.toString() ?? '', longitude: value.longitude?.toString() ?? '', mapUrl: value.mapUrl ?? '' })}/></div>
                </div>
                <div className="branch-portal-fields"><strong>Şube müşteri portalı <small>Opsiyonel</small></strong><div className="form-grid customer-data-grid"><label>Portal yetkilisi<input value={manualBranch.portalContactName} onChange={(event) => setManualBranch({ ...manualBranch, portalContactName: event.target.value })} placeholder="Ad Soyad" autoComplete="off" /></label><label>Giriş e-postası<input type="email" value={manualBranch.portalEmail} onChange={(event) => setManualBranch({ ...manualBranch, portalEmail: event.target.value })} autoComplete="new-password" data-lpignore="true" /></label><label>Geçici şifre<input type="password" minLength={6} value={manualBranch.portalPassword} onChange={(event) => setManualBranch({ ...manualBranch, portalPassword: event.target.value })} placeholder="En az 6 karakter" autoComplete="new-password" data-lpignore="true" /></label><div className="portal-account-note">E-posta ve şifre birlikte girildiğinde yalnızca bu şubeyi gören müşteri hesabı açılır (Şifre en az 6 karakter olmalıdır).</div></div></div>
              </div> : importMode === 'excel' ? <>
                <div
                  className={`excel-upload-zone ${isDragging ? 'dragging' : ''} ${excelBranches.length > 0 ? 'ready' : ''}`}
                  onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                >
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
                  <span className="excel-upload-icon">{excelBranches.length > 0 ? <CheckCircle2 size={25} /> : <UploadCloud size={25} />}</span>
                  <div><strong>{isReadingExcel ? 'Dosya okunuyor…' : excelBranches.length > 0 ? excelFileName : 'Excel dosyasını buraya bırakın'}</strong><span>{excelBranches.length > 0 ? `${excelBranches.length} geçerli şube içe aktarılmaya hazır.` : 'XLSX, XLS veya CSV · en fazla 5 MB'}</span></div>
                  <button type="button" className="secondary-button" disabled={isReadingExcel} onClick={() => fileInputRef.current?.click()}>{excelBranches.length > 0 ? 'Dosyayı değiştir' : 'Dosya seç'}</button>
                </div>
                <div className="excel-import-toolbar">
                  <span>İlk satır sütun başlıkları olmalıdır.</span>
                  <button type="button" onClick={downloadBranchTemplate}><Download size={15} /> Excel şablonunu indir</button>
                </div>
                {excelError && <div className="excel-import-error" role="alert">{excelError}</div>}
                {excelBranches.length > 0 && <div className="excel-preview">
                  <div className="excel-preview-heading"><strong>Aktarım önizlemesi</strong><span>İlk {Math.min(5, excelBranches.length)} kayıt gösteriliyor</span></div>
                  <div className="excel-preview-table-wrap"><table><thead><tr><th>Şube</th><th>Konum</th><th>Yetkili</th><th>İletişim</th></tr></thead><tbody>{excelBranches.slice(0, 5).map((branch, index) => <tr key={`${branch.code ?? branch.name}-${index}`}><td><strong>{branch.name}</strong>{branch.code && <small>{branch.code}</small>}</td><td>{[branch.district, branch.city].filter(Boolean).join(' / ') || '—'}<small>{branch.address}</small></td><td>{branch.contactName || '—'}</td><td>{branch.phoneNumber || branch.email || '—'}{branch.phoneNumber && branch.email && <small>{branch.email}</small>}</td></tr>)}</tbody></table></div>
                </div>}
              </> : <>
                <textarea value={branchText} onChange={(event) => setBranchText(event.target.value)} rows={7} placeholder="Her satıra bir şube kaydı yapıştırın" />
                <div className="bulk-format-note"><MapPin size={15} /><span>Zorunlu alanlar: <strong>Şube adı</strong> ve <strong>açık adres</strong>. Kullanılmayan sütunları boş bırakabilirsiniz; ayırıcı olarak <strong>|</strong> kullanın.</span></div>
              </>}
            </section>}

            {error && <div className="modal-form-error" role="alert">{error}</div>}
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setMode('manage')}>Geri Dön</button><button type="submit" className="primary-button" disabled={isSubmitting || isReadingExcel || (mode === 'existing' && parsedBranches.length === 0)}>{isSubmitting ? 'Kaydediliyor…' : mode === 'new' && newCustomerStructure === 'single' ? 'Müşteri ve Merkez Lokasyonu Kaydet' : parsedBranches.length > 0 ? `${parsedBranches.length} Şubeyi Kaydet` : mode === 'existing' ? 'Şube Bilgilerini Tamamlayın' : 'Çatı Müşteriyi Kaydet'} <Plus size={17} /></button></div>
          </form>
        )}

        {editingLocation && (
          <div className="modal-layer" style={{ zIndex: 1200 }}>
            <div className="modal location-editor-modal">
              <div className="modal-header"><div><p className="eyebrow">OPERASYON KONUMU</p><h2>{editingLocation.name}</h2><p>Mevcut adres ve iletişim bilgileri değişmeden yalnız harita konumu güncellenir.</p></div><button className="icon-button" type="button" onClick={()=>setEditingLocation(null)}><X/></button></div>
              <LocationPicker value={editingLocation.value} address={editingLocation.address} onChange={(value)=>setEditingLocation((current)=>current?{...current,value}:current)} />
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={()=>setEditingLocation(null)}>Vazgeç</button><button type="button" className="primary-button" disabled={actionBusy || (!editingLocation.value.latitude && !editingLocation.value.mapUrl)} onClick={()=>void saveEditedLocation()}>{actionBusy?'Kaydediliyor…':'Konumu Kaydet'}</button></div>
            </div>
          </div>
        )}

        {deletingTarget && (
          <div className="modal-layer" style={{ zIndex: 1200 }}>
            <div className="modal" style={{ maxWidth: '440px' }}>
              <div className="modal-header">
                <div>
                  <p className="eyebrow" style={{ color: '#dc2626' }}>MÜŞTERİ SİLME ONAYI</p>
                  <h2>Müşteriyi Sil</h2>
                </div>
                <button className="icon-button" onClick={() => setDeletingTarget(null)}><X /></button>
              </div>
              <div style={{ padding: '16px 0', fontSize: '13.5px', color: '#334155', lineHeight: 1.5 }}>
                <p><strong>"{deletingTarget.name}"</strong> müşterisini ve bağlı tüm şubelerini silmek istediğinize emin misiniz?</p>
                <p style={{ marginTop: '8px', fontSize: '12px', color: '#ef4444', fontWeight: 600 }}>⚠️ Bu müşteri operasyonel kayıtlardan kaldırılacaktır.</p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setDeletingTarget(null)}>Vazgeç</button>
                <button type="button" className="primary-button" style={{ background: '#dc2626', borderColor: '#b91c1c' }} disabled={actionBusy} onClick={() => void confirmDelete()}>
                  {actionBusy ? 'Siliniyor…' : 'Evet, Kalıcı Olarak Sil'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function parseBranches(value: string): CreateBranchInput[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [name = '', city = '', district = '', address = '', contactName = '', phoneNumber = '', email = '', latitude = '', longitude = '', mapUrl = '', portalContactName = '', portalEmail = '', portalPassword = ''] = line.split('|').map((part) => part.trim());
    return { name, city: city || undefined, district: district || undefined, address, contactName: contactName || undefined, phoneNumber: phoneNumber || undefined, email: email || undefined, latitude: optionalNumber(latitude), longitude: optionalNumber(longitude), mapUrl: mapUrl || undefined, portalContactName: portalContactName || undefined, portalEmail: portalEmail || undefined, portalPassword: portalPassword || undefined };
  }).filter((branch) => branch.name.length > 0 && branch.address.length > 0).slice(0, 250);
}

function toManualBranches(branch: ManualBranchDraft): CreateBranchInput[] {
  const name = branch.name.trim();
  const address = branch.address.trim();
  if (!name || !address) return [];
  return [{
    name,
    address,
    code: optionalText(branch.code),
    city: optionalText(branch.city),
    district: optionalText(branch.district),
    contactName: optionalText(branch.contactName),
    phoneNumber: optionalText(branch.phoneNumber),
    email: optionalText(branch.email),
    latitude: optionalNumber(branch.latitude),
    longitude: optionalNumber(branch.longitude),
    mapUrl: optionalText(branch.mapUrl),
    portalContactName: optionalText(branch.portalContactName),
    portalEmail: optionalText(branch.portalEmail),
    portalPassword: optionalText(branch.portalPassword),
  }];
}

function optionalText(value: string) {
  const text = value.trim();
  return text || undefined;
}

function optionalNumber(value: FormDataEntryValue | string | null) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!text) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}
