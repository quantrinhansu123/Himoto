'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { canManageAccounts, canRecoverAccountPasswords } from '@/lib/management/permissions';
import { useManagement } from './ManagementProvider';

interface StaffAccount { id: number; login_name: string; enabled: boolean; password_available: boolean; revision: string }

export function StaffAccountDetails({ staffId, editable = false, disabled = false, onBusyChange }: { staffId: number; editable?: boolean; disabled?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const { accessUser } = useManagement();
  const allowed = canManageAccounts(accessUser);
  const recovery = canRecoverAccountPasswords(accessUser);
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [shown, setShown] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const revealLock = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!allowed) return;
    const abort = new AbortController(); controller.current = abort;
    setLoading(true); setError(''); setShown({}); setAccounts([]);
    void fetch(`/api/auth/accounts/staff/${staffId}`, { cache: 'no-store', credentials: 'same-origin', signal: abort.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok || body.status !== 'success' || !Array.isArray(body.data)) throw new Error(body.message || 'Không tải được tài khoản.');
        if (!abort.signal.aborted) setAccounts(body.data);
      }).catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không tải được tài khoản.'); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { abort.abort(); controller.current = null; };
  }, [staffId, allowed, reload]);
  // Do not leave passwords visible indefinitely or when the tab loses focus.
  useEffect(() => {
    const hide = () => setShown({});
    window.addEventListener('blur', hide);
    const timeout = Object.keys(shown).length ? window.setTimeout(hide, 60_000) : undefined;
    return () => { window.removeEventListener('blur', hide); if (timeout) window.clearTimeout(timeout); };
  }, [shown]);
  async function reveal(account: StaffAccount) {
    if (!recovery || revealLock.current) return;
    const signal = controller.current?.signal;
    if (!signal || signal.aborted) return;
    revealLock.current = true; setBusy(account.id); setError('');
    try {
      const response = await fetch('/api/auth/accounts/password', { method: 'POST', cache: 'no-store', credentials: 'same-origin', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reveal', id: account.id }) });
      const body = await response.json();
      if (!response.ok || body.status !== 'success' || Number(body.data?.id) !== account.id || typeof body.data?.password !== 'string') throw new Error(body.message || 'Không xem được mật khẩu.');
      if (!signal.aborted) setShown(current => ({ ...current, [account.id]: body.data.password }));
    } catch (cause) { if (!signal.aborted) setError(cause instanceof Error ? cause.message : 'Không xem được mật khẩu.'); }
    finally { revealLock.current = false; if (!signal.aborted) setBusy(null); }
  }
  if (!allowed) return null;
  return <section aria-label="Tài khoản đăng nhập của nhân sự" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
    <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 12px' }}><KeyRound size={18} />Tài khoản đăng nhập</h3>
    {loading && <p role="status">Đang tải tài khoản…</p>}
    {error && <p role="alert" className="mg-field-error">{error} <button type="button" className="mg-button" disabled={busy !== null} onClick={() => setReload(value => value + 1)}>Tải lại</button></p>}
    {!loading && !error && !accounts.length && <p>Nhân sự chưa được liên kết với tài khoản đăng nhập.</p>}
    {accounts.map(account => <div key={account.id} style={{ padding: '12px 0' }}>
      <dl className="mg-detail-grid"><div><dt>Tên đăng nhập (nick)</dt><dd><code>{account.login_name || 'Chưa có tên đăng nhập'}</code></dd></div><div><dt>Trạng thái tài khoản</dt><dd>{account.enabled ? 'Hoạt động' : 'Đã khóa'}</dd></div>
        {recovery && <div><dt>Mật khẩu</dt><dd>{account.password_available ? <div className="mg-account-password"><code>{shown[account.id] ?? '••••••••'}</code><button type="button" className="mg-button" disabled={busy !== null} aria-label={`${shown[account.id] ? 'Ẩn' : 'Hiện'} mật khẩu ${account.login_name}`} onClick={() => {
          if (shown[account.id]) setShown(current => { const next = { ...current }; delete next[account.id]; return next; });
          else void reveal(account);
        }}>{shown[account.id] ? <EyeOff size={15} /> : <Eye size={15} />}{busy === account.id ? 'Đang tải…' : shown[account.id] ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}</button></div> : <span>Chưa có bản lưu mật khẩu hiện tại. Nhân viên cần tự đổi mật khẩu để cập nhật.</span>}</dd></div>}
      </dl>
      {editable && <StaffAccountEditor key={`${account.id}:${account.revision}`} account={account} staffId={staffId} recovery={recovery} disabled={disabled || busy !== null} onBusyChange={onBusyChange} onSaved={() => setReload(value => value + 1)} />}
    </div>)}
    {!recovery && accounts.length > 0 && <p>Chỉ tài khoản quanlyvanhanh, quantri và quanlyvanhanhhimoto được xem mật khẩu.</p>}
    {recovery && accounts.length > 0 && <small>Mỗi lần xem mật khẩu được ghi nhật ký. Mật khẩu tự ẩn sau 60 giây hoặc khi chuyển cửa sổ.</small>}
  </section>;
}

function StaffAccountEditor({ account, staffId, recovery, disabled, onBusyChange, onSaved }: { account: StaffAccount; staffId: number; recovery: boolean; disabled: boolean; onBusyChange?: (busy: boolean) => void; onSaved: () => void }) {
  const { notify } = useManagement();
  const [login, setLogin] = useState(account.login_name);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function save() {
    if (lock.current || disabled || uncertain) return;
    if (!/^[a-z0-9._-]{3,80}$/.test(login.trim().toLowerCase())) { setError('Tên đăng nhập cần 3–80 ký tự không dấu, gồm chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.'); return; }
    if (password && (password.length < 8 || new TextEncoder().encode(password).length > 72)) { setError('Mật khẩu cần ít nhất 8 ký tự và không quá 72 byte.'); return; }
    if (password !== confirmation) { setError('Nhập lại mật khẩu mới chưa khớp.'); return; }
    lock.current = true; setSaving(true); setError(''); onBusyChange?.(true);
    try {
      const response = await fetch(`/api/auth/accounts/staff/${staffId}`, { method: 'PATCH', cache: 'no-store', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account_id: account.id, revision: account.revision, login_name: login, ...(password ? { password, confirmation } : {}) }) });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.status !== 'success' || Number(body.data?.id) !== account.id) {
        if (mounted.current && (response.status === 409 || response.status >= 500 || response.ok)) setUncertain(true);
        throw new Error(body?.message || 'Chưa xác nhận được thay đổi tài khoản. Tải lại để kiểm tra.');
      }
      if (mounted.current) { setPassword(''); setConfirmation(''); notify(body.data.password_changed ? 'Đã lưu tài khoản và mật khẩu mới. Các phiên đăng nhập cũ của tài khoản đã hết hiệu lực.' : 'Đã cập nhật tên đăng nhập.'); onSaved(); }
    } catch (cause) {
      if (mounted.current) { if (cause instanceof TypeError) setUncertain(true); setError(cause instanceof Error ? cause.message : 'Không lưu được tài khoản.'); }
    } finally { lock.current = false; onBusyChange?.(false); if (mounted.current) setSaving(false); }
  }
  return <div style={{ marginTop: 12 }}>
    <fieldset disabled={disabled || saving || uncertain} style={{ border: 0, padding: 0, margin: 0 }}><legend className="mg-sr-only">Sửa tài khoản {account.login_name}</legend><div className="mg-form-grid">
      <div className="mg-field"><label htmlFor={`account-login-${account.id}`}>Tên đăng nhập mới</label><input id={`account-login-${account.id}`} value={login} autoComplete="off" maxLength={80} spellCheck={false} onChange={event => setLogin(event.target.value)} /></div>
      {recovery && <><div className="mg-field"><label htmlFor={`account-password-${account.id}`}>Mật khẩu mới</label><input id={`account-password-${account.id}`} type={visible ? 'text' : 'password'} value={password} autoComplete="new-password" minLength={8} maxLength={128} placeholder="Để trống để giữ mật khẩu hiện tại" onChange={event => setPassword(event.target.value)} /></div>
        <div className="mg-field"><label htmlFor={`account-confirm-${account.id}`}>Nhập lại mật khẩu mới</label><input id={`account-confirm-${account.id}`} type={visible ? 'text' : 'password'} value={confirmation} autoComplete="new-password" maxLength={128} onChange={event => setConfirmation(event.target.value)} /></div>
        <label><input type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)} /> Hiện mật khẩu mới</label></>}
    </div></fieldset>
    <p className="mg-reminder-help">Lưu tài khoản riêng bằng nút bên dưới. Để trống mật khẩu nếu chỉ đổi nick. Đặt mật khẩu mới sẽ đăng xuất các phiên đăng nhập cũ.</p>
    {error && <p className="mg-field-error" role="alert">{error}</p>}
    {uncertain ? <button type="button" className="mg-button" disabled={saving} onClick={onSaved}>Tải lại tài khoản để kiểm tra</button> : <button type="button" className="mg-button mg-button-primary" disabled={disabled || saving || (login === account.login_name && !password)} onClick={() => void save()}>{saving ? 'Đang lưu tài khoản…' : 'Lưu tài khoản và mật khẩu'}</button>}
  </div>;
}
