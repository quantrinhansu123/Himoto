import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { compare } from 'bcryptjs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { ACCESS_PERMISSIONS, canRecordContractPayment, isAdminAccount } from '@/lib/management/permissions';
import { himotoPool, ownerDatabase } from './himoto-database';
import { dataAccess } from './access-context';

export const SESSION_COOKIE = 'himoto_management_session';
export const SESSION_SECONDS = 8 * 60 * 60;
export type SessionUser = { id: number; name: string; email: string; role: string; role_slug: string; access_role?:string; permissions?:string[]; store_id?:number|null; scope_all?:boolean };
type Account = { id: string | number; name: string; email: string; password?: string; status: string; role: string; role_id: string | number; role_slug: string | null; access_role?:string; permissions?:string[]; access_store_id?:string|number|null; scope_all?:boolean; access_enabled?:boolean };
type Database = Pick<typeof himotoPool, 'query'>;
export { canRecordContractPayment, isAdminAccount };

// Missing server configuration must never expose an unauthenticated dashboard.
export function isManagementConfigured() {
  return Boolean((process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL) &&
    (process.env.NODE_ENV !== 'production' || (process.env.MANAGEMENT_SESSION_SECRET?.length || 0) >= 32));
}

const globalSession = globalThis as typeof globalThis & { managementSessionKey?: string; managementLoginAttempts?: Map<string, { count: number; expires: number }>;
  managementReadSessions?: Map<number, { expires: number; allowed: Promise<boolean> }> };
function sessionKey() {
  if (process.env.NODE_ENV === 'production' && (process.env.MANAGEMENT_SESSION_SECRET?.length || 0) < 32) {
    throw new Error('Thiếu MANAGEMENT_SESSION_SECRET hợp lệ cho bản triển khai.');
  }
  return process.env.MANAGEMENT_SESSION_SECRET || (globalSession.managementSessionKey ??= randomBytes(32).toString('hex'));
}
function signature(body: string, key: string) { return createHmac('sha256', key).update(body).digest('base64url'); }

export function signSession(id: number, key = sessionKey(), now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ id, expires: now + SESSION_SECONDS * 1000 })).toString('base64url');
  return `${body}.${signature(body, key)}`;
}

export function verifySession(token: string | undefined, key = sessionKey(), now = Date.now()): number | null {
  if (!token || token.length > 512) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = Buffer.from(signature(parts[0], key));
  const supplied = Buffer.from(parts[1]);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    return Number.isSafeInteger(payload.id) && payload.id > 0 && Number.isFinite(payload.expires) && payload.expires > now ? payload.id : null;
  } catch { return null; }
}

function allowedAccount(account: Account) {
  // Managed accounts require an enabled scope; preserve existing admin/accounting access.
  return account.status === 'active' && (account.access_role ? account.access_enabled===true && (account.scope_all===true || Number(account.access_store_id)>0) : canRecordContractPayment(account));
}
function safeUser(account: Account): SessionUser {
  const admin=isAdminAccount(account);
  return { id: Number(account.id), name: account.name, email: account.email, role: String(account.role || ''), role_slug: String(account.role_slug || ''),
    access_role:account.access_role||(admin?'admin':'accounting'),permissions:admin?[...ACCESS_PERMISSIONS]:account.permissions||['contracts.read','finance.read','finance.write'],
    store_id:account.access_store_id==null?null:Number(account.access_store_id),scope_all:admin||(!account.access_role)||account.scope_all===true };
}
const accountFields = 'u.id, u.name, u.email, u.status, u.role, u.role_id, r.slug AS role_slug,a.access_role,a.permissions,a.store_id AS access_store_id,a.scope_all,a.enabled AS access_enabled';
const accountJoin='LEFT JOIN himoto.roles r ON r.id=u.role_id LEFT JOIN himoto.management_account_access a ON a.user_id=u.id';
export class LoginError extends Error {
  constructor(message: string, public status = 401) { super(message); }
}

export async function authenticateAccount(email: string, password: string, database: Database = ownerDatabase): Promise<SessionUser> {
  const result = await database.query(`SELECT ${accountFields}, u.password FROM himoto.users u ${accountJoin} WHERE (lower(u.email)=lower($1) OR lower(a.login_name)=lower($1)) AND u.deleted_at IS NULL LIMIT 1`, [email]);
  const account = result.rows[0] as Account | undefined;
  // A missing user still performs bcrypt work; never return a password hash.
  const hash = account?.password?.replace(/^\$2y\$/, '$2b$') || '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
  const matches = await compare(password, hash);
  if (!account || !matches || account.status !== 'active') throw new LoginError('Email hoặc mật khẩu không chính xác.');
  if (!allowedAccount(account)) throw new LoginError('Tài khoản chưa được cấp quyền truy cập. Liên hệ quản trị viên.', 403);
  return safeUser(account);
}

export function checkLoginLimit(email: string, now = Date.now()) {
  const attempts = globalSession.managementLoginAttempts ??= new Map();
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
  const key = email.toLowerCase();
  const attempt = attempts.get(key);
  if ((attempt?.count || 0) >= 10 || (!attempt && attempts.size >= 1000)) throw new LoginError('Bạn đã thử quá nhiều lần. Vui lòng thử lại sau 15 phút.', 429);
  attempts.set(key, { count: (attempt?.count || 0) + 1, expires: attempt?.expires || now + 15 * 60 * 1000 });
}
export function clearLoginLimit(email: string) { globalSession.managementLoginAttempts?.delete(email.toLowerCase()); }

export async function userFromSession(token: string | undefined, database: Database = ownerDatabase): Promise<SessionUser | null> {
  const id = verifySession(token);
  if (id === null) return null;
  const result = await database.query(`SELECT ${accountFields} FROM himoto.users u ${accountJoin} WHERE u.id=$1 AND u.deleted_at IS NULL LIMIT 1`, [id]);
  const account = result.rows[0] as Account | undefined;
  return account && allowedAccount(account) ? safeUser(account) : null;
}

// Coalesce only simultaneous reads. Settled lookups are removed immediately so
// the next request still observes account disabling and permission changes.
const pendingSessionReads = new Map<string, Promise<SessionUser | null>>();
export function readSessionUser(token: string | undefined, database: Database = ownerDatabase): Promise<SessionUser | null> {
  if (!token || verifySession(token) === null) return Promise.resolve(null);
  const pending = pendingSessionReads.get(token);
  if (pending) return pending;
  const request = userFromSession(token, database);
  pendingSessionReads.set(token, request);
  const clear = () => { if (pendingSessionReads.get(token) === request) pendingSessionReads.delete(token); };
  void request.then(clear, clear);
  return request;
}

// Reads only: the signed token is verified on every request, but the account
// status/role lookup is shared for a few seconds so a page's parallel list
// requests cost one database round trip. Writes always re-check the account.
const READ_SESSION_TTL_MS = 15_000;
function readSessionAllowed(token: string | undefined): Promise<boolean> {
  const id = verifySession(token);
  if (id === null) return Promise.resolve(false);
  const checks = globalSession.managementReadSessions ??= new Map();
  const now = Date.now();
  const cached = checks.get(id);
  if (cached && cached.expires > now) return cached.allowed;
  for (const [key, value] of checks) if (value.expires <= now) checks.delete(key);
  const allowed = userFromSession(token).then(Boolean);
  checks.set(id, { expires: now + READ_SESSION_TTL_MS, allowed });
  allowed.then(ok => { if (!ok) checks.delete(id); }, () => checks.delete(id));
  return allowed;
}

export async function currentSessionUser() {
  return readSessionUser((await cookies()).get(SESSION_COOKIE)?.value);
}

export function sameOrigin(request: NextRequest) {
  // NextURL normalizes loopback IPs to localhost; the browser's Origin uses
  // the actual Host header (for example 127.0.0.1:3000).
  const host = request.headers.get('host') || request.nextUrl.host;
  return request.headers.get('origin') === `${request.nextUrl.protocol}//${host}`;
}

export async function protectDatabaseRequest(request: NextRequest): Promise<NextResponse | null> {
  if (!isManagementConfigured()) return NextResponse.json({ status: 'error', message: 'Hệ thống chưa được cấu hình kết nối dữ liệu. Vui lòng liên hệ quản trị viên.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'GET' && !sameOrigin(request)) return NextResponse.json({ status: 'error', message: 'Yêu cầu không hợp lệ.' }, { status: 403 });
  // withAccessRequest already authenticated this request and loaded its scope.
  const actor = dataAccess.getStore();
  if (actor && verifySession(request.cookies.get(SESSION_COOKIE)?.value) === actor.id) return null;
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (request.method === 'GET' ? await readSessionAllowed(token) : await userFromSession(token)) return null;
    return NextResponse.json({ status: 'error', message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ status: 'error', message: 'Không xác thực được phiên đăng nhập. Vui lòng thử lại.' }, { status: 503 });
  }
}
