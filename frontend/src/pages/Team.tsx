import { useEffect, useState } from 'react';
import { AlertCircle, Edit2, Info, Mail, Phone, Plus, RefreshCw, Users } from 'lucide-react';
import EmployeeModal from '../components/modals/EmployeeModal';
import {
  createEmployee,
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
                <button className="icon-button" onClick={() => openEditModal(employee)} aria-label={`${employee.name} hesabını düzenle`}>
                  <Edit2 size={16} />
                </button>
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
        <EmployeeModal employee={editingEmployee} companyCode={companyCode} onClose={() => setIsModalOpen(false)} onSubmit={handleSubmit} />
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
