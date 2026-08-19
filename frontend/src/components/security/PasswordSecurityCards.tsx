import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound, RefreshCw, ShieldCheck, UserCog } from 'lucide-react';
import {
  AccountSecuritySessionExpiredError,
  changeOwnPassword,
  getCompanyManagedAccounts,
  resetCompanyAccountPassword,
  type ManagedAccount,
} from '../../services/accountSecurityApi';

type CommonProps = { accessToken: string; onSessionExpired: () => void; onNotify?: (message: string) => void };

export function PasswordChangeCard({ accessToken, onSessionExpired, onNotify }: CommonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError(undefined); setNotice(undefined);
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get('currentPassword') || '');
    const newPassword = String(form.get('newPassword') || '');
    const confirmation = String(form.get('confirmation') || '');

    if (newPassword !== confirmation) {
      setBusy(false);
      setError('Yeni şifre tekrarı eşleşmiyor.');
      return;
    }
    if (!newPassword) {
      setBusy(false);
      setError('Lütfen yeni şifrenizi girin.');
      return;
    }

    try {
      const result = await changeOwnPassword(accessToken, currentPassword, newPassword, confirmation);
      event.currentTarget.reset();
      setNotice(result.message);
      onNotify?.(result.message);
      window.setTimeout(onSessionExpired, 1200);
    } catch (submitError) {
      if (submitError instanceof AccountSecuritySessionExpiredError) return onSessionExpired();
      setError(submitError instanceof Error ? submitError.message : 'Şifre güncellenemedi.');
    } finally { setBusy(false); }
  };

  return <section className="account-security-card">
    <header><span><KeyRound size={21} /></span><div><strong>Giriş şifrem</strong><small>Mevcut şifrenizi doğrulayarak yeni şifrenizi belirleyin.</small></div></header>
    <form onSubmit={submit}>
      <label>Mevcut şifre<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
      <label>Yeni şifre<input name="newPassword" type="password" placeholder="Yeni şifreniz" autoComplete="new-password" required /></label>
      <label>Yeni şifre tekrarı<input name="confirmation" type="password" placeholder="Şifreyi tekrar girin" autoComplete="new-password" required /></label>
      {error && <div className="account-security-error">{error}</div>}
      {notice && <div className="account-security-success">{notice}</div>}
      <button className="primary-button" disabled={busy}>{busy ? <RefreshCw className="spin-icon" size={16} /> : <ShieldCheck size={16} />}Şifremi değiştir</button>
    </form>
  </section>;
}

export function CompanyAccountResetCard({ accessToken, onSessionExpired, onNotify }: CommonProps) {
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    getCompanyManagedAccounts(accessToken).then((items) => { setAccounts(items); setSelectedId(items[0]?.id ?? ''); })
      .catch((loadError) => loadError instanceof AccountSecuritySessionExpiredError ? onSessionExpired() : setError(loadError instanceof Error ? loadError.message : 'Hesaplar yüklenemedi.'));
  }, [accessToken]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selectedId) return;
    setBusy(true); setError(undefined);
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get('newPassword') || '');
    const confirmation = String(form.get('confirmation') || '');

    if (newPassword !== confirmation) {
      setBusy(false);
      setError('Geçici şifre tekrarı eşleşmiyor.');
      return;
    }
    if (!newPassword) {
      setBusy(false);
      setError('Lütfen geçici şifreyi girin.');
      return;
    }

    try {
      const result = await resetCompanyAccountPassword(accessToken, selectedId, newPassword, confirmation);
      event.currentTarget.reset(); onNotify?.(result.message);
    } catch (submitError) {
      if (submitError instanceof AccountSecuritySessionExpiredError) return onSessionExpired();
      setError(submitError instanceof Error ? submitError.message : 'Geçici şifre atanamadı.');
    } finally { setBusy(false); }
  };

  return <section className="account-security-card managed-account-card">
    <header><span><UserCog size={21} /></span><div><strong>Bağlı hesapların şifreleri</strong><small>Yalnızca firmanıza bağlı personel ve müşteri portalı hesaplarına geçici şifre atayın.</small></div></header>
    <form onSubmit={submit}>
      <label className="wide">Hesap<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} required><option value="">Hesap seçin</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {portalLabel(account.portal)} · {account.email}</option>)}</select></label>
      <label>Geçici şifre<input name="newPassword" type="password" placeholder="Yeni geçici şifre" autoComplete="new-password" required /></label>
      <label>Geçici şifre tekrarı<input name="confirmation" type="password" placeholder="Şifreyi tekrar girin" autoComplete="new-password" required /></label>
      {error && <div className="account-security-error wide">{error}</div>}
      <button className="secondary-button" disabled={busy || !selectedId}>{busy ? <RefreshCw className="spin-icon" size={16} /> : <CheckCircle2 size={16} />}Geçici şifre ata</button>
    </form>
  </section>;
}

function portalLabel(portal: ManagedAccount['portal']) {
  return ({ Owner: 'Firma sahibi', Employee: 'Personel', Customer: 'Müşteri', SystemAdmin: 'Sistem yöneticisi' } as const)[portal];
}
