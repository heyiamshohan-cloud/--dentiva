import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import type { DentivaDatabase } from '../database/database.js';
import type { LoginInput, Session, SessionUser } from '../../shared/types.js';
import { AppError, assertText } from '../utils/errors.js';
import type { AppLogger } from '../utils/logger.js';

const PASSWORD_ITERATIONS = 310_000;
const SESSION_MAX_HOURS = 12;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

export const permissionDefinitions = [
  ['patients.view', 'View patients', 'View patient records and profile information'],
  ['patients.edit', 'Manage patients', 'Create and edit patient records'],
  ['patients.archive', 'Archive patients', 'Archive and restore patient records'],
  ['clinical.view', 'View clinical records', 'View visits, charting and prescriptions'],
  ['clinical.edit', 'Manage clinical records', 'Create clinical records, charting and prescriptions'],
  ['appointments.view', 'View appointments', 'View schedules and daily serials'],
  ['appointments.edit', 'Manage appointments', 'Create, reschedule and update appointments'],
  ['billing.view', 'View billing', 'View invoices, receipts and balances'],
  ['billing.edit', 'Manage billing', 'Create invoices and record payments'],
  ['billing.refund', 'Issue refunds', 'Issue and approve payment refunds'],
  ['finances.view', 'View financials', 'View income, expenses and financial reports'],
  ['finances.edit', 'Manage financials', 'Record and void expenses'],
  ['staff.manage', 'Manage staff', 'Manage staff and salary records'],
  ['inventory.view', 'View inventory', 'View supplies, stock and suppliers'],
  ['inventory.edit', 'Manage inventory', 'Manage supplies, suppliers and stock movements'],
  ['reports.view', 'View reports', 'View operational and financial reports'],
  ['reports.export', 'Export reports', 'Export reports to approved formats'],
  ['documents.manage', 'Manage documents', 'Attach, view and archive documents'],
  ['printing.use', 'Print documents', 'Preview, export and print documents'],
  ['backup.create', 'Create backups', 'Create and verify Dentiva backups'],
  ['backup.restore', 'Restore backups', 'Import and restore Dentiva backups'],
  ['settings.manage', 'Manage settings', 'Change clinic and application settings'],
  ['users.manage', 'Manage users', 'Manage users, roles and permissions'],
  ['audit.view', 'View audit history', 'View security and activity audit history'],
  ['notifications.manage', 'Manage notifications', 'Review and configure notifications']
] as const;

export function hashPassword(password: string, salt = randomBytes(32).toString('base64'), iterations = PASSWORD_ITERATIONS): { hash: string; salt: string; iterations: number } {
  validatePassword(password);
  return { hash: pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('base64'), salt, iterations };
}

export function verifyPassword(password: string, expectedHash: string, salt: string, iterations: number): boolean {
  try {
    const actual = pbkdf2Sync(password, salt, iterations, 64, 'sha512');
    const expected = Buffer.from(expectedHash, 'base64');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function validatePassword(password: string): void {
  if (typeof password !== 'string' || password.length < 10) throw new AppError('WEAK_PASSWORD', 'Use at least 10 characters for the password.', 'password');
  if (password.length > 256) throw new AppError('WEAK_PASSWORD', 'The password is too long.', 'password');
  const classes = [/[A-Z]/, /[a-z]/, /\d/, /[^A-Za-z0-9]/].filter((expression) => expression.test(password)).length;
  if (classes < 3) throw new AppError('WEAK_PASSWORD', 'Use a stronger password with a mix of letters, numbers, and symbols.', 'password');
}

interface InternalSession {
  token: string;
  user: SessionUser;
  clinicId: string;
  createdAt: number;
  lastActivity: number;
  expiresAt: number;
  absoluteExpiry: number;
  passwordChangedAt: string;
}

export class AuditService {
  constructor(private readonly db: DentivaDatabase) {}

  record(input: {
    clinicId?: string | null; userId?: string | null; userName?: string | null;
    action: string; entityType?: string | null; entityIdentifier?: string | null;
    summary: string; outcome?: 'success' | 'failure'; correlationId?: string | null;
  }): void {
    this.db.run(`INSERT INTO audit_logs
      (id, clinic_id, user_id, user_name, timestamp, action, entity_type, entity_identifier, summary, outcome, correlation_id, workstation)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
    randomUUID(), input.clinicId ?? null, input.userId ?? null, input.userName ?? null, new Date().toISOString(),
    input.action, input.entityType ?? null, input.entityIdentifier ?? null, input.summary.slice(0, 500), input.outcome ?? 'success',
    input.correlationId ?? null, os.hostname().slice(0, 120));
  }
}

export class SessionService {
  private readonly sessions = new Map<string, InternalSession>();

  constructor(
    private readonly db: DentivaDatabase,
    private readonly audit: AuditService,
    private readonly logger: AppLogger
  ) {}

  login(input: LoginInput): Session {
    const username = assertText(input.username, 'Username', 2, 80);
    const password = typeof input.password === 'string' ? input.password : '';
    const user = this.db.get<Record<string, unknown>>(
      `SELECT u.* FROM users u WHERE u.username = ? COLLATE NOCASE LIMIT 1`, username
    );

    // A full PBKDF operation for an unknown user reduces username timing leakage.
    if (!user) {
      pbkdf2Sync(password || 'invalid', randomBytes(32), PASSWORD_ITERATIONS, 64, 'sha512');
      this.audit.record({ action: 'login', userName: username, summary: 'Unsuccessful sign-in attempt', outcome: 'failure' });
      throw new AppError('INVALID_CREDENTIALS', 'The username or password is incorrect.');
    }

    const clinicId = String(user.clinic_id);
    const userId = String(user.id);
    const now = Date.now();
    if(String(user.status)==='disabled'){this.audit.record({clinicId,userId,userName:String(user.display_name),action:'login',entityType:'user',entityIdentifier:userId,summary:'Sign-in blocked for disabled account',outcome:'failure'});throw new AppError('ACCOUNT_DISABLED','This user account is disabled. Contact the clinic administrator.');}
    const lockedUntil=user.locked_until?Date.parse(String(user.locked_until)):null;
    if(lockedUntil!==null&&lockedUntil>now){this.audit.record({clinicId,userId,userName:String(user.display_name),action:'login',entityType:'user',entityIdentifier:userId,summary:'Sign-in blocked during account lockout',outcome:'failure'});throw new AppError('ACCOUNT_LOCKED','This account is temporarily locked after unsuccessful sign-in attempts. Please try again later.');}
    if(String(user.status)==='locked'){
      if(lockedUntil===null){this.audit.record({clinicId,userId,userName:String(user.display_name),action:'login',entityType:'user',entityIdentifier:userId,summary:'Sign-in blocked for locked account',outcome:'failure'});throw new AppError('ACCOUNT_LOCKED','This account is locked. Contact the clinic administrator.');}
      this.db.run("UPDATE users SET status='active',failed_login_count=0,locked_until=NULL,updated_at=? WHERE id=?",new Date().toISOString(),userId);
    }

    const valid = verifyPassword(password, String(user.password_hash), String(user.password_salt), Number(user.password_iterations));
    if (!valid) {
      const failed = Number(user.failed_login_count) + 1;
      const lockUntil = failed >= MAX_FAILED_LOGINS ? new Date(now + LOCK_MINUTES * 60_000).toISOString() : null;
      this.db.run('UPDATE users SET failed_login_count=?, locked_until=?, status=?, updated_at=? WHERE id=?',
        failed, lockUntil, lockUntil ? 'locked' : 'active', new Date().toISOString(), userId);
      this.audit.record({ clinicId, userId, userName: String(user.display_name), action: 'login', entityType: 'user', entityIdentifier: userId, summary: 'Unsuccessful sign-in attempt', outcome: 'failure' });
      throw new AppError('INVALID_CREDENTIALS', failed >= MAX_FAILED_LOGINS
        ? 'This account has been temporarily locked after repeated unsuccessful sign-in attempts.'
        : 'The username or password is incorrect.');
    }

    this.db.run('UPDATE users SET failed_login_count=0, locked_until=NULL, status=\'active\', last_login_at=?, updated_at=? WHERE id=?',
      new Date().toISOString(), new Date().toISOString(), userId);
    const session = this.createSession(userId);
    this.audit.record({ clinicId, userId, userName: session.user.displayName, action: 'login', entityType: 'user', entityIdentifier: userId, summary: 'Signed in to Dentiva' });
    this.logger.info('User signed in', { userId, clinicId });
    return session;
  }

  createSession(userId: string): Session {
    const user = this.db.get<Record<string, unknown>>('SELECT * FROM users WHERE id=? AND status=\'active\'', userId);
    if (!user) throw new AppError('ACCOUNT_UNAVAILABLE', 'The user account is not available.');
    const roles = this.db.all<{ name: string }>(`SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=? ORDER BY r.name`, userId).map((row) => row.name);
    const permissions = this.db.all<{ code: string }>(`SELECT DISTINCT rp.permission_code AS code FROM role_permissions rp JOIN user_roles ur ON ur.role_id=rp.role_id WHERE ur.user_id=?`, userId).map((row) => row.code);
    const sessionUser: SessionUser = {
      id: String(user.id), displayName: String(user.display_name), username: String(user.username), roleNames: roles,
      permissions, language: user.language === 'bn' ? 'bn' : 'en'
    };
    const autoLockMinutes = this.getAutoLockMinutes(String(user.clinic_id));
    const now = Date.now();
    const token = randomBytes(32).toString('base64url');
    const internal: InternalSession = {
      token, user: sessionUser, clinicId: String(user.clinic_id), createdAt: now, lastActivity: now,
      expiresAt: now + autoLockMinutes * 60_000, absoluteExpiry: now + SESSION_MAX_HOURS * 60 * 60_000,
      passwordChangedAt: String(user.password_changed_at)
    };
    this.sessions.set(token, internal);
    return this.publicSession(internal);
  }

  require(token: string, permission?: string): InternalSession {
    if (typeof token !== 'string' || token.length < 32) throw new AppError('SESSION_REQUIRED', 'Your Dentiva session is locked. Please sign in again.');
    const session = this.sessions.get(token);
    const now = Date.now();
    if (!session || session.expiresAt <= now || session.absoluteExpiry <= now) {
      if (session) this.sessions.delete(token);
      throw new AppError('SESSION_EXPIRED', 'Your Dentiva session has been locked due to inactivity. Please sign in again.');
    }
    const account=this.db.get<{status:string;password_changed_at:string}>('SELECT status,password_changed_at FROM users WHERE id=? AND clinic_id=?',session.user.id,session.clinicId);
    if(!account||account.status!=='active'||account.password_changed_at!==session.passwordChangedAt){this.sessions.delete(token);throw new AppError('SESSION_EXPIRED','Your account or credentials changed. Please sign in again.');}
    session.user.permissions=this.db.all<{code:string}>(`SELECT DISTINCT rp.permission_code AS code FROM role_permissions rp JOIN user_roles ur ON ur.role_id=rp.role_id WHERE ur.user_id=?`,session.user.id).map((row)=>row.code);
    if(permission&&!session.user.permissions.includes(permission)){
      this.audit.record({ clinicId: session.clinicId, userId: session.user.id, userName: session.user.displayName, action: 'permission_denied', summary: `Access denied for permission ${permission}`, outcome: 'failure' });
      throw new AppError('PERMISSION_DENIED', 'Your account does not have permission to perform this action.');
    }
    session.lastActivity = now;
    session.expiresAt = Math.min(now + this.getAutoLockMinutes(session.clinicId) * 60_000, session.absoluteExpiry);
    return session;
  }

  touch(token: string): { expiresAt: string } {
    const session = this.require(token);
    return { expiresAt: new Date(session.expiresAt).toISOString() };
  }

  logout(token: string, locked = false): void {
    const session = this.sessions.get(token);
    if (!session) return;
    this.sessions.delete(token);
    this.audit.record({ clinicId: session.clinicId, userId: session.user.id, userName: session.user.displayName, action: locked ? 'session_lock' : 'logout', entityType: 'user', entityIdentifier: session.user.id, summary: locked ? 'Session locked' : 'Signed out of Dentiva' });
  }

  changePassword(token: string, currentPassword: string, newPassword: string): void {
    const session = this.require(token);
    const row = this.db.get<Record<string, unknown>>('SELECT password_hash,password_salt,password_iterations FROM users WHERE id=?', session.user.id);
    if (!row || !verifyPassword(currentPassword, String(row.password_hash), String(row.password_salt), Number(row.password_iterations))) {
      throw new AppError('INVALID_PASSWORD', 'The current password is incorrect.', 'currentPassword');
    }
    const next = hashPassword(newPassword);const changedAt=new Date().toISOString();
    this.db.run('UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,password_changed_at=?,updated_at=? WHERE id=?',
      next.hash, next.salt, next.iterations, changedAt, changedAt, session.user.id);session.passwordChangedAt=changedAt;
    this.audit.record({ clinicId: session.clinicId, userId: session.user.id, userName: session.user.displayName, action: 'password_changed', entityType: 'user', entityIdentifier: session.user.id, summary: 'Account password changed' });
    for (const [sessionToken, item] of this.sessions) if (item.user.id === session.user.id && sessionToken !== token) this.sessions.delete(sessionToken);
  }

  private getAutoLockMinutes(clinicId: string): number {
    const row = this.db.get<{ value_json: string }>('SELECT value_json FROM app_settings WHERE clinic_id=? AND key=\'autoLockMinutes\'', clinicId);
    try {
      const value = Number(row ? JSON.parse(row.value_json) : 15);
      return Number.isFinite(value) && value >= 1 && value <= 240 ? value : 15;
    } catch { return 15; }
  }

  private publicSession(session: InternalSession): Session {
    return { token: session.token, user: session.user, expiresAt: new Date(session.expiresAt).toISOString() };
  }
}
