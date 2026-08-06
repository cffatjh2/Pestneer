import { FormEvent, useMemo, useState } from 'react';
import { Check, Eye, EyeOff, KeyRound, Pencil, ShieldCheck, UserPlus, X } from 'lucide-react';
import type {
  CreateEmployeeInput,
  EmployeeRecord,
  EmployeeRole,
  UpdateEmployeeInput,
} from '../../services/employeeApi';

type EmployeeModalProps = {
  companyCode: string;
  employee?: EmployeeRecord | null;
  onClose: () => void;
  onSubmit: (input: CreateEmployeeInput | UpdateEmployeeInput) => Promise<void>;
};

export default function EmployeeModal({ companyCode, employee, onClose, onSubmit }: EmployeeModalProps) {
  const isEditing = Boolean(employee);
  const nameParts = useMemo(() => splitName(employee?.name ?? ''), [employee?.name]);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get('password') ?? '');
    const passwordConfirmation = String(formData.get('passwordConfirmation') ?? '');
    if (password !== passwordConfirmation) {
      setError('Şifre ve şifre tekrarı aynı olmalıdır.');
      return;
    }

    const sharedInput = {
      firstName: String(formData.get('firstName') ?? '').trim(),
      lastName: String(formData.get('lastName') ?? '').trim(),
      phoneNumber: String(formData.get('phoneNumber') ?? '').trim(),
      email: String(formData.get('email') ?? '').trim(),
      role: String(formData.get('role') ?? 'Technician') as EmployeeRole,
    };
    const input: CreateEmployeeInput | UpdateEmployeeInput = isEditing
      ? {
          ...sharedInput,
          isActive: String(formData.get('isActive')) === 'true',
          newPassword: password || undefined,
        }
      : { ...sharedInput, password };

    setIsSubmitting(true);
    try {
      await onSubmit(input);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : `Personel hesabı ${isEditing ? 'güncellenemedi' : 'oluşturulamadı'}.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const HeadingIcon = isEditing ? Pencil : UserPlus;

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-labelledby="employee-modal-title">
      <div className="modal employee-modal">
        <div className="modal-header">
          <div className="employee-modal-heading">
            <span><HeadingIcon size={20} /></span>
            <div>
              <p className="eyebrow">EKİP YÖNETİMİ</p>
              <h2 id="employee-modal-title">{isEditing ? 'Personel Bilgilerini Düzenle' : 'Yeni Personel Hesabı'}</h2>
              <p>{isEditing ? 'İletişim, görev, durum ve giriş bilgilerini güncelleyin.' : 'Temel bilgileri ve giriş şifresini belirleyerek hesabı anında açın.'}</p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Pencereyi kapat"><X size={20} /></button>
        </div>

        <div className="employee-login-note">
          <ShieldCheck size={18} />
          <span>Personel, <strong>Firma çalışanı</strong> girişinden <strong>{companyCode}</strong> firma koduyla oturum açabilir.</span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-grid employee-form-grid">
            <label>
              Ad
              <input name="firstName" defaultValue={nameParts.firstName} autoComplete="given-name" minLength={2} maxLength={80} placeholder="Örn. Ahmet" required />
            </label>
            <label>
              Soyad
              <input name="lastName" defaultValue={nameParts.lastName} autoComplete="family-name" minLength={2} maxLength={80} placeholder="Örn. Yılmaz" required />
            </label>
            <label>
              Telefon numarası
              <input name="phoneNumber" defaultValue={employee?.phoneNumber} type="tel" autoComplete="tel" minLength={10} maxLength={24} placeholder="05xx xxx xx xx" required />
            </label>
            <label>
              E-posta adresi
              <input name="email" defaultValue={employee?.email} type="email" autoComplete="email" maxLength={320} placeholder="personel@firma.com" required />
            </label>
            <label className={isEditing ? '' : 'form-field-wide'}>
              Yetki / görev
              <select name="role" defaultValue={employee?.role ?? 'Technician'} required>
                <option value="Technician">Saha Personeli</option>
                <option value="OperationsManager">Operasyon Yöneticisi</option>
                <option value="Administrator">Firma Yöneticisi</option>
              </select>
            </label>
            {isEditing && (
              <label>
                Hesap durumu
                <select name="isActive" defaultValue={employee?.isActive ? 'true' : 'false'} required>
                  <option value="true">Aktif — giriş yapabilir</option>
                  <option value="false">Pasif — giriş engelli</option>
                </select>
              </label>
            )}
            <label>
              {isEditing ? 'Yeni şifre (isteğe bağlı)' : 'Geçici şifre'}
              <span className="password-input-wrap">
                <KeyRound size={17} />
                <input name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={6} placeholder={isEditing ? 'Değişmeyecekse boş bırakın' : 'En az 6 karakter'} required={!isEditing} />
                <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
            <label>
              {isEditing ? 'Yeni şifre tekrarı' : 'Şifre tekrarı'}
              <span className="password-input-wrap">
                <KeyRound size={17} />
                <input name="passwordConfirmation" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={6} placeholder={isEditing ? 'Yeni şifreyi tekrar girin' : 'Şifreyi tekrar girin'} required={!isEditing} />
              </span>
            </label>
          </div>

          {error && <div className="modal-form-error" role="alert">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose} disabled={isSubmitting}>İptal</button>
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? (isEditing ? 'Kaydediliyor…' : 'Hesap oluşturuluyor…') : (isEditing ? 'Değişiklikleri Kaydet' : 'Hesabı Oluştur')} <Check size={17} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() ?? '',
    lastName: parts.join(' '),
  };
}
