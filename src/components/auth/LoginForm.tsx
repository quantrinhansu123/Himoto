'use client';

import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, Globe, LoaderCircle } from 'lucide-react';

export function LoginForm({ connected }: { connected: boolean }) {
  const router = useRouter();
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState<'email' | 'password' | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    setError(''); setInvalid(null);
    if (!connected) { setError('Hệ thống chưa được cấu hình kết nối dữ liệu. Vui lòng liên hệ quản trị viên.'); return; }
    if (!emailInput.current?.validity.valid || !email.trim()) { setError('Vui lòng nhập email hợp lệ.'); setInvalid('email'); emailInput.current?.focus(); return; }
    if (!password) { setError('Vui lòng nhập mật khẩu.'); setInvalid('password'); passwordInput.current?.focus(); return; }
    pending.current = true; setBusy(true);
    try {
      const response = await fetch('/api/session', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), password }) });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.user) throw new Error(result?.message || 'Không đăng nhập được. Vui lòng thử lại.');
      setPassword('');
      router.replace('/vehicles'); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Không kết nối được hệ thống. Vui lòng thử lại.'); }
    finally { pending.current = false; setBusy(false); }
  }

  return <main className="hm-login">
    <aside className="hm-login-art" aria-label="Khởi đầu hành trình cùng HIMOTO">
      <img src="/images/branding/himoto-journey.webp" alt="Khởi đầu hành trình. Khám phá tự do. Hai xe máy HIMOTO trên cung đường ven biển Việt Nam." width={1122} height={1402} fetchPriority="high" />
    </aside>
    <section className="hm-login-main" aria-labelledby="login-heading">
      <span className="hm-login-language"><Globe size={17} aria-hidden="true" />Tiếng Việt</span>
      <div className="hm-login-content">
        <img className="hm-login-logo" src="/images/branding/logo-himoto-dark.svg" width={194} height={40} alt="HIMOTO" />
        <div className="hm-login-card">
          <p className="hm-login-eyebrow">HỆ THỐNG QUẢN LÝ HIMOTO</p>
          <h1 id="login-heading">Chào mừng trở lại</h1>
          <p className="hm-login-description">Đăng nhập để quản lý xe và hợp đồng.</p>
          {!connected && <p className="hm-login-error" role="alert">Hệ thống chưa được cấu hình kết nối dữ liệu. Vui lòng liên hệ quản trị viên.</p>}
          {error && <p id="login-error" className="hm-login-error" role="alert">{error}</p>}
          <form onSubmit={submit} noValidate aria-busy={busy}>
            <label htmlFor="login-email">Email</label>
            <input ref={emailInput} id="login-email" name="email" type="email" value={email} onChange={event => { setEmail(event.target.value); if (invalid === 'email') { setInvalid(null); setError(''); } }} placeholder="Nhập email của bạn" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} required disabled={busy || !connected} aria-invalid={invalid === 'email'} aria-describedby={invalid === 'email' ? 'login-error' : undefined} />
            <label htmlFor="login-password">Mật khẩu</label>
            <div className="hm-login-password">
              <input ref={passwordInput} id="login-password" name="password" type={visible ? 'text' : 'password'} value={password} onChange={event => { setPassword(event.target.value); if (invalid === 'password') { setInvalid(null); setError(''); } }} placeholder="Nhập mật khẩu" autoComplete="current-password" maxLength={256} required disabled={busy || !connected} aria-invalid={invalid === 'password'} aria-describedby={invalid === 'password' ? 'login-error' : undefined} />
              <button type="button" aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={visible} disabled={busy || !connected} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button>
            </div>
            <button type="submit" className="hm-login-submit" disabled={busy || !connected}>{busy ? <LoaderCircle size={19} className="hm-login-spinner" /> : null}{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}{!busy && <ArrowRight size={18} aria-hidden="true" />}</button>
          </form>
        </div>
        <p className="hm-login-footer">HIMOTO · Quản lý vận hành</p>
      </div>
    </section>
  </main>;
}
