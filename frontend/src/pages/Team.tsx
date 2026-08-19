import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, Edit2, Info, Mail, Phone, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import EmployeeModal from '../components/modals/EmployeeModal';
import {
  createEmployee,
  deleteEmployee,
  getEmployees,
  SessionExpiredError,
  updateEmployee,
  type CreateEmployeeInput,
  type EmployeeRecord,
  type UpdateEmployeeInput,
} from '../services/employeeApi';

type TeamProps = {
  accessToken: string;
  companyCode: string;
  onNotify: (message: string) => void;
  onSessionExpired: () => void;
};

const roleLabels: Record<EmployeeRecord['role'], string> = {
  Administrator: 'Firma Yöneticisi',
  OperationsManager: 'Operasyon Yöneticisi',
  Technician: 'Saha Personeli',
};

const avatarColors = ['blue', 'purple', 'green', 'orange'] as const;

export default function Team({ accessToken, companyCode, onNotify, onSessionExpired }: TeamProps) {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<EmployeeRecord | null>(null);
  const [deletingEmployee, setDeletingEmployee] = useState<EmployeeRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadEmployees = async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setEmployees(await getEmployees(accessToken));
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        onSessionExpired();
        return;
      }
      setLoadError(error instanceof Error ? error.message : 'Personel listesi yüklenemedi.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadEmployees();
  }, [accessToken]);

  const openCreateModal = () => {
    setEditingEmployee(null);
    setIsModalOpen(true);
  };

  const openEditModal = (employee: EmployeeRecord) => {
    setEditingEmployee(employee);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (employee: EmployeeRecord) => {
    setIsModalOpen(false);
    setDeleteError(null);
    setDeletingEmployee(employee);
  };

  const confirmDelete = async (employee: EmployeeRecord) => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteEmployee(accessToken, employee.id);
      setEmployees((current) => current.filter((item) => item.id !== employee.id));
      onNotify(`${employee.name} hesabı başarıyla silindi.`);
      setDeletingEmployee(null);
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        onSessionExpired();
        return;
      }
      setDeleteError(error instanceof Error ? error.message : 'Personel hesabı silinemedi.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (input: CreateEmployeeInput | UpdateEmployeeInput) => {
    try {
      if (editingEmployee && 'isActive' in input) {
        const employee = await updateEmployee(accessToken, editingEmployee.id, input);
        setEmployees((current) => current
          .map((item) => item.id === employee.id ? employee : item)
          .sort((left, right) => left.name.localeCompare(right.name, 'tr')));
        onNotify(`${employee.name} bilgileri güncellendi.`);
      } else if (!editingEmployee && 'password' in input) {
        const employee = await createEmployee(accessToken, input);
        setEmployees((current) => [...current, employee].sort((left, right) => left.name.localeCompare(right.name, 'tr')));
        onNotify(`${employee.name} için çalışan hesabı oluşturuldu.`);
      }
      setIsModalOpen(false);
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        onSessionExpired();
        return;
      }
      throw error;
    }
  };

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">İNSAN KAYNAKLARI</p>
          <h1>Ekip & Personel</h1>
          <p>Operasyon personeli, yöneticiler ve çalışan giriş hesaplarını yönetin.</p>
        </div>
        <button className="primary-button" onClick={openCreateModal}>
          <Plus size={19} />
          Personel Ekle
        </button>
      </div>

      {isLoading ? (
        <div className="surface team-empty-state">
          <RefreshCw className="spin-icon" size={30} />
          <h3>Personel listesi yükleniyor</h3>
        </div>
      ) : loadError ? (
        <div className="surface team-empty-state team-error-state">
          <AlertCircle size={34} />
          <h3>Personel listesi alınamadı</h3>
          <p>{loadError}</p>
          <button className="secondary-button" onClick={() => void loadEmployees()}><RefreshCw size={15} /> Tekrar Dene</button>
        </div>
      ) : employees.length > 0 ? (
        <div className="team-grid">
          {employees.map((employee, index) => (
            <article key={employee.id} className="surface employee-card">
              <div className="employee-card-top">
                <div className={`avatar avatar-large avatar-${avatarColors[index % avatarColors.length]}`}>
                  {getInitials(employee.name)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button className="icon-button" onClick={() => openEditModal(employee)} aria-label={`${employee.name} hesabını düzenle`} title="Düzenle">
                    <Edit2 size={16} />
                  </button>
                  <button className="icon-button" onClick={() => handleDeleteClick(employee)} aria-label={`${employee.name} hesabını sil`} title="Personeli Sil" style={{ color: '#ef4444' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <h2>{employee.name}</h2>
              <p>{roleLabels[employee.role]}</p>
              <div className={`employee-state ${employee.isActive ? 'state-available' : 'state-inactive'}`}>
                <i /> {employee.isActive ? 'Hesap aktif' : 'Hesap pasif'}
              </div>

              <div className="employee-contact-list">
                <a href={`tel:${employee.phoneNumber}`}><Phone size={14} /><span>{employee.phoneNumber}</span></a>
                <a href={`mailto:${employee.email}`}><Mail size={14} /><span>{employee.email}</span></a>
              </div>

              <div className="employee-login-status">
                <span>Çalışan girişi</span>
                <strong className={employee.isActive ? '' : 'inactive'}>{employee.isActive ? 'Hazır' : 'Engelli'}</strong>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="surface team-empty-state">
          <Users size={36} />
          <h3>Henüz personel eklenmedi</h3>
          <p>İlk çalışan hesabınızı oluşturmak için “Personel Ekle” düğmesini kullanın.</p>
          <button className="secondary-button" onClick={openCreateModal}><Plus size={16} /> İlk Personeli Ekle</button>
        </div>
      )}

      <div className="surface team-note">
        <div className="team-note-icon"><Info size={22} /></div>
        <div>
          <strong>Çalışan hesabı nasıl kullanılır?</strong>
          <p>Personel; firma kodu <strong>{companyCode}</strong>, e-posta adresi ve belirlediğiniz şifreyle giriş ekranındaki <strong>Firma çalışanı</strong> sekmesini kullanır.</p>
        </div>
      </div>

      {isModalOpen && (
        <EmployeeModal employee={editingEmployee} companyCode={companyCode} onClose={() => setIsModalOpen(false)} onSubmit={handleSubmit} onDelete={handleDeleteClick} />
      )}

      {deletingEmployee && (
        <div className="nested-modal-layer" role="dialog" aria-modal="true" style={{ zIndex: 1200 }}>
          <div className="surface" style={{ maxWidth: '440px', width: '92vw', padding: '24px', borderRadius: '16px', background: '#fff', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', border: '1px solid #cbd5e1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px', borderRadius: '12px', display: 'flex' }}>
                <AlertTriangle size={26} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#0f172a' }}>Personel Hesabını Sil</h3>
                <small style={{ color: '#64748b' }}>Bu işlem personelin sisteme erişimini kaldırır.</small>
              </div>
            </div>

            <p style={{ fontSize: '14px', color: '#334155', lineHeight: 1.5, marginBottom: '18px' }}>
              <strong>{deletingEmployee.name}</strong> ({roleLabels[deletingEmployee.role]}) adlı çalışan hesabını silmek istediğinize emin misiniz?
            </p>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#64748b', marginBottom: '20px' }}>
              ℹ️ Gelecekteki planlanmış açık iş emri atamaları temizlenir, personelin giriş yetkisi iptal edilir. Geçmişte tamamlanmış saha ve servis raporları korunur.
            </div>

            {deleteError && (
              <div className="modal-form-error" style={{ marginBottom: '14px' }}>{deleteError}</div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" className="secondary-button" disabled={isDeleting} onClick={() => { setDeletingEmployee(null); setDeleteError(null); }}>
                Vazgeç
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void confirmDelete(deletingEmployee)}
                style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
              >
                {isDeleting ? 'Siliniyor…' : <><Trash2 size={16} /> Evet, Personeli Sil</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('tr-TR'))
    .join('');
}

