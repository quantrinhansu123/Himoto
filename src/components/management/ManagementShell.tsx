'use client';

import { ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AlarmClock, BatteryCharging, Bike, Building2, CalendarDays, ChevronDown, ChevronRight, ContactRound, FilePenLine, Files, History, House, KeyRound, LogOut, MapPin,Menu, MessageCircle, PanelLeftClose, ReceiptText,Settings, UsersRound, Wallet, X } from 'lucide-react';
import { ManagementProvider, useManagement } from './ManagementProvider';
import { lockBodyScroll, trapFocusWithin } from './Dialog';
import { canRecordContractPayment,hasPermission,type AccessPermission } from '@/lib/management/permissions';
import { ContractTypesProvider } from '@/components/contracts/ContractTypesProvider';
import type { SessionUser } from '@/lib/server/management-session';
import { SePayNotifications } from './SePayNotifications';
import { GpsSyncPulse } from './GpsSyncPulse';

const navigation = [
  {href:'/operations',label:'Thao tác nhanh',kind:'operations' as const,icon:House},
  {href:'/staff-sales',label:'Doanh số nhân viên',kind:'staff-sales' as const,icon:ReceiptText},
  { href: '/staff', label: 'Nhân sự', kind: 'staff' as const, icon: UsersRound },
  { href: '/duty-roster', label: 'Lịch trực cơ sở', kind: 'duty-roster' as const, icon: CalendarDays },
  { href: '/customers', label: 'Khách hàng', kind: 'customers' as const, icon: ContactRound },
  { href: '/contracts', label: 'Danh sách hợp đồng', kind: 'contracts' as const, icon: Files },
  { href: '/contracts/drafts', label: 'Hợp đồng nháp', kind: 'contracts' as const, icon: FilePenLine },
  { href: '/contracts/vat', label: 'Hợp đồng VAT', kind: 'contracts' as const, icon: ReceiptText },
  { href: '/contracts/overdue', label: 'Hợp đồng quá hạn', kind: 'contracts' as const, icon: AlarmClock },
  { href: '/contracts/due', label: 'Đến hạn đóng tiền', kind: 'contracts' as const, icon: CalendarDays },
  { href: '/debt-reminders', label: 'Gửi nhắc nợ', kind: 'debt-reminders' as const, icon: MessageCircle },
  { href: '/contracts/ownership', label: 'Hợp đồng thuê sở hữu', kind: 'contracts' as const, icon: KeyRound },
  { href: '/contracts/battery', label: 'Hợp đồng thuê pin / sạc', kind: 'battery-contracts' as const, icon: BatteryCharging },
  { href: '/contracts/types', label: 'Loại hợp đồng', kind: 'contract-types' as const, icon: Files },
  { href: '/stores', label: 'Cơ sở', kind: 'stores' as const, icon: Building2 },
  { href: '/vehicles', label: 'Danh sách xe', kind: 'vehicles' as const, icon: Bike },
  { href: '/vehicles/transfers', label: 'Lịch sử luân chuyển', kind: 'vehicle-transfers' as const, icon: History },
  { href: '/gps', label: 'Định vị GPS', kind: 'gps' as const, icon: MapPin },
  { href: '/integrations', label: 'Tích hợp GPS & Telegram', kind: 'integrations' as const, icon: Settings },
  { href: '/cashbook', label: 'Sổ quỹ / Sổ két', kind: 'cashbook' as const, icon: Wallet },
  { href: '/accounts', label: 'Tài khoản & Phân quyền', kind: 'accounts' as const, icon: UsersRound },
];
const navigationPermission=(kind:string):AccessPermission=>kind==='accounts'?'accounts.manage':kind==='staff'||kind==='duty-roster'?'hr.read':kind==='cashbook'?'finance.read':kind==='customers'?'customers.read':kind==='stores'||kind==='contract-types'||kind==='integrations'?'settings.write':kind==='vehicles'||kind==='vehicle-transfers'||kind==='gps'?'vehicles.read':'contracts.read';

function Shell({ children, user }: { children: ReactNode; user: SessionUser | null }) {
  const { dataset, selectedStore, selectStore, source, canSaveContractDrafts } = useManagement();
  const pathname = usePathname();
  const router = useRouter();
  const active = navigation.find(n => pathname === n.href) || navigation.find(n => n.kind === 'vehicles')!;
  const visibleNavigation=navigation.filter(item=>hasPermission(user,navigationPermission(item.kind)));
  const pageAllowed=hasPermission(user,navigationPermission(active.kind));
  const writableCustomers = source === 'api' && active.kind === 'customers';
  const writableStores = source === 'api' && active.kind === 'stores';
  const writableDuties = source === 'api' && active.kind === 'duty-roster';
  const writableBattery = source === 'api' && active.kind === 'battery-contracts';
  const writableVehicles = source === 'api' && active.kind === 'vehicles';
  const writableDrafts = source === 'api' && active.kind === 'contracts' && canSaveContractDrafts;
  const gpsPage = active.kind === 'gps';
  const integrationPage = active.kind === 'integrations';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const mobileRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');

  async function signOut() {
    setSigningOut(true); setSignOutError('');
    try {
      const response = await fetch('/api/session', { method: 'DELETE', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Không đăng xuất được. Vui lòng thử lại.');
      window.location.replace('/login');
    } catch (cause) { setSignOutError(cause instanceof Error ? cause.message : 'Không đăng xuất được.'); setSigningOut(false); }
  }

  // A stale browser tab must return to login when the server rejects its session.
  useEffect(() => {
    if (!user) return;
    const checkSession = async () => {
      if (document.visibilityState !== 'visible') return;
      try { if ((await fetch('/api/session', { cache: 'no-store' })).status === 401) { router.replace('/login'); router.refresh(); } } catch { /* Keep the page during a temporary network outage. */ }
    };
    window.addEventListener('focus', checkSession);
    return () => window.removeEventListener('focus', checkSession);
  }, [router, user]);

  useEffect(() => {
    if (mobileOpen) mobileRef.current?.showModal(); else mobileRef.current?.close();
    if (!mobileOpen) return;
    const unlockScroll = lockBodyScroll();
    const releaseFocus = mobileRef.current ? trapFocusWithin(mobileRef.current) : () => {};
    return () => { releaseFocus(); unlockScroll(); };
  }, [mobileOpen]);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) menuRef.current.open = false; };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const navContent = <>
    <Link href="/vehicles" className="mg-brand" aria-label="HIMOTO - Danh sách xe" onClick={() => setMobileOpen(false)}>
      {/* Existing brand asset, kept in its original proportions. */}
      <img src="/images/branding/logo-himoto-dark.svg" width="154" height="32" alt="HIMOTO" />
      <span>HỆ THỐNG QUẢN LÝ</span>
    </Link>
    <div className="mg-workspace"><span className="mg-workspace-symbol"><Building2 size={19} /></span><div><strong>HIMOTO Workspace</strong><small>Quản lý vận hành</small></div></div>
    <p className="mg-nav-caption">DANH MỤC QUẢN LÝ</p>
    <nav aria-label="Điều hướng quản lý">{visibleNavigation.map(item => <Link key={item.href} href={item.href}
      className={`mg-nav-link ${active.href === item.href ? 'is-active' : ''}`} aria-current={active.href === item.href ? 'page' : undefined}
      title={collapsed ? item.label : undefined} onClick={() => setMobileOpen(false)}>
      <item.icon size={19} strokeWidth={1.8} /><span>{item.label}</span>{active.href === item.href && <ChevronRight className="mg-nav-arrow" size={15} />}
    </Link>)}</nav>
  </>;

  return <div className={`mg-app ${collapsed ? 'mg-is-collapsed' : ''}`}>
    <GpsSyncPulse/>
    <a href="#management-main" className="mg-skip">Đến nội dung chính</a>
    <aside className="mg-sidebar">{navContent}</aside>
    <dialog ref={mobileRef} className="mg-mobile-nav" aria-label="Menu điều hướng" onCancel={event => { event.preventDefault(); setMobileOpen(false); }}>
      <button type="button" className="mg-icon-button mg-mobile-close" aria-label="Đóng menu" onClick={() => setMobileOpen(false)}><X size={20} /></button>{navContent}
    </dialog>
    <div className="mg-main">
      <header className="mg-topbar">
        <div className="mg-breadcrumb"><button type="button" className="mg-icon-button mg-desktop-toggle" aria-label={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'} onClick={() => setCollapsed(!collapsed)}><PanelLeftClose size={19} /></button>
          <button type="button" className="mg-icon-button mg-mobile-toggle" aria-label="Mở menu" onClick={() => setMobileOpen(true)}><Menu size={21} /></button>
          <span>Quản lý</span><ChevronRight size={14} /><strong>{active.label}</strong></div>
        <div className="mg-topbar-right"><label className="mg-branch-select"><Building2 size={16} /><span className="mg-sr-only">Cơ sở đang xem</span><select aria-label="Cơ sở đang xem" value={selectedStore} onChange={event => selectStore(event.target.value)}>
          {user?.scope_all&&<option value="all">Tất cả cơ sở</option>}{dataset?.stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <span className={`mg-source-badge ${source === 'api' ? 'is-api' : ''}`}>{gpsPage?'Tự đồng bộ':integrationPage?'Cấu hình tích hợp':writableDrafts ? 'Lưu nháp' : writableVehicles ? 'Đồng bộ xe' : writableCustomers || writableStores || writableDuties || writableBattery ? 'Có thể sửa' : 'Chỉ đọc'}</span>
          <details className="mg-user-menu" ref={menuRef}><summary aria-label="Menu người dùng"><span className="mg-user-avatar">QT</span><div><strong>{user?.name || 'Quản trị viên'}</strong><small>{user ? 'Đã đăng nhập' : writableCustomers ? 'Supabase' : 'Phiên tra cứu'}</small></div><ChevronDown size={14} /></summary>
            <div className="mg-popover"><strong>{gpsPage?'Định vị GPS tự động':integrationPage?'Quản lý tích hợp':writableBattery ? 'Hợp đồng thuê pin kết nối Supabase' : writableDuties ? 'Quản lý lịch trực' : writableCustomers ? 'Khách hàng kết nối Supabase' : writableStores ? 'Cơ sở kết nối Supabase' : writableVehicles ? 'Xe kết nối Supabase' : 'Phiên tra cứu API'}</strong><p>{gpsPage?'Trạng thái xe được cập nhật từ Protrack và IOPGPS; có lưu lịch sử thay đổi.':integrationPage?'Quản trị cập nhật tài khoản GPS và nhóm Telegram của từng cơ sở tại đây.':writableBattery ? 'Tạo, sửa, xóa và in hợp đồng thuê pin; dữ liệu lưu trực tiếp vào Supabase.' : writableDuties ? 'Thêm, sửa hoặc xóa ca; hệ thống kiểm tra trùng giờ của cùng nhân viên.' : writableCustomers ? 'Thêm và cập nhật lưu trực tiếp; xóa hồ sơ có đơn thuê sẽ bị chặn để giữ lịch sử.' : writableStores ? 'Thêm và sửa cơ sở; xóa cơ sở có dữ liệu liên quan sẽ bị chặn để giữ lịch sử.' : writableVehicles ? 'Đồng bộ Excel có sao lưu. Xóa hết bị chặn khi xe có dữ liệu liên quan.' : 'Thao tác ghi dữ liệu chưa được tích hợp cho danh mục này.'}</p>
              <SePayNotifications/>
              {hasPermission(user,'contracts.draft')&&<Link href="/contracts/drafts"><FilePenLine size={16} />Mở hợp đồng nháp</Link>}
              {<button type="button" disabled={signingOut} onClick={signOut}><LogOut size={16} />{signingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>}
              {signOutError && <p role="alert">{signOutError}</p>}</div></details>
        </div>
      </header>
      <main id="management-main" className="mg-content" tabIndex={-1}>{pageAllowed?children:<section className="mg-page"><h1>Không có quyền truy cập</h1><p>Tài khoản chưa được phân quyền cho chức năng này.</p><Link className="mg-button" href={visibleNavigation[0]?.href||'/login'}>Mở chức năng được phân quyền</Link></section>}</main>
      <footer className="mg-app-footer"><span>HIMOTO <span className="mg-footer-dot">·</span> Quản lý vận hành</span><span>{gpsPage?'GPS · Tự đồng bộ mỗi 30 giây':integrationPage?'GPS & Telegram · Cấu hình theo cơ sở':writableBattery ? 'Hợp đồng thuê pin · Ghi trực tiếp vào Supabase' : writableDuties ? 'Lịch trực theo tuần' : writableDrafts ? 'Lưu nháp · Lưu trên hệ thống' : writableCustomers ? 'Khách hàng · Ghi trực tiếp vào Supabase' : writableStores ? 'Cơ sở · Ghi trực tiếp vào Supabase' : writableVehicles ? 'Xe · Đồng bộ có sao lưu' : 'Chế độ tra cứu · Không ghi dữ liệu'}</span></footer>
      <nav className="mg-mobile-bottom-nav" aria-label="Thao tác chính trên điện thoại">{visibleNavigation.filter(item=>['/operations','/contracts','/vehicles','/cashbook','/staff'].includes(item.href)).slice(0,4).map(item=><Link key={item.href} href={item.href} aria-current={pathname === item.href ? 'page' : undefined}><item.icon size={20}/><span>{item.href === '/operations' ? 'Thao tác' : item.href === '/contracts' ? 'Hợp đồng' : item.href === '/vehicles' ? 'Xe' : 'Sổ quỹ'}</span></Link>)}</nav>
    </div>
  </div>;
}

export function ManagementShell({ children, user = null }: { children: ReactNode; user?: SessionUser | null }) {
  return <ManagementProvider user={user} canPayContracts={canRecordContractPayment(user)}><ContractTypesProvider canManage={hasPermission(user,'settings.write')}><Shell user={user}>{children}</Shell></ContractTypesProvider></ManagementProvider>;
}
