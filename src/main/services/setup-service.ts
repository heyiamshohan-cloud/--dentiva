import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DentivaDatabase } from '../database/database.js';
import type { AuditService, SessionService } from '../security/security.js';
import { hashPassword, permissionDefinitions } from '../security/security.js';
import type { AppBootstrap, AppSettings, Session, SetupInput } from '../../shared/types.js';
import { mapClinic } from '../database/mappers.js';
import { AppError, assertText, optionalText } from '../utils/errors.js';
import type { DentivaPaths } from '../utils/paths.js';

const rolePermissions: Record<string, string[]> = {
  'Owner / Administrator': ['*'],
  Dentist: ['patients.view', 'patients.edit', 'clinical.view', 'clinical.edit', 'appointments.view', 'appointments.edit', 'billing.view', 'documents.manage', 'printing.use', 'reports.view', 'notifications.manage'],
  Manager: ['patients.view', 'patients.edit', 'patients.archive', 'clinical.view', 'appointments.view', 'appointments.edit', 'billing.view', 'billing.edit', 'finances.view', 'finances.edit', 'staff.manage', 'inventory.view', 'inventory.edit', 'reports.view', 'reports.export', 'documents.manage', 'printing.use', 'backup.create', 'notifications.manage'],
  Receptionist: ['patients.view', 'patients.edit', 'appointments.view', 'appointments.edit', 'billing.view', 'billing.edit', 'documents.manage', 'printing.use', 'notifications.manage'],
  Accountant: ['patients.view', 'billing.view', 'billing.edit', 'billing.refund', 'finances.view', 'finances.edit', 'reports.view', 'reports.export', 'printing.use', 'notifications.manage'],
  Assistant: ['patients.view', 'clinical.view', 'clinical.edit', 'appointments.view', 'inventory.view', 'documents.manage', 'printing.use', 'notifications.manage']
};

const defaultSettings: AppSettings = {
  language: 'en', autoLockMinutes: 15, dashboardPreset: 'today', backupReminderDays: 7,
  defaultAppointmentMinutes: 30, receiptWidth: '80mm', dateFormat: 'dd MMM yyyy', timeFormat: 'hh:mm a',
  notificationsEnabled: true, lowStockNotifications: true, appointmentNotifications: true, backupLocation: null
};

export class SetupService {
  constructor(
    private readonly db: DentivaDatabase,
    private readonly paths: DentivaPaths,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly version: string
  ) {}

  bootstrap(): AppBootstrap {
    const row = this.db.get<Record<string, unknown>>('SELECT * FROM clinics ORDER BY created_at LIMIT 1');
    const clinic = row ? mapClinic(row) : undefined;
    return {
      configured: Boolean(clinic), version: this.version, databaseVersion: this.db.schemaVersion, clinic,
      language: clinic?.defaultLanguage ?? 'en', paths: { data: this.paths.root, backups: this.paths.backups, exports: this.paths.exports }
    };
  }

  complete(input: SetupInput): Session {
    if (this.db.get('SELECT id FROM clinics LIMIT 1')) throw new AppError('ALREADY_CONFIGURED', 'Dentiva has already been configured. Sign in to change clinic settings.');
    const now = new Date().toISOString();
    const clinicId = randomUUID();
    const userId = randomUUID();
    const ownerName = assertText(input.ownerName, 'Owner name', 2, 160);
    const username = this.validateUsername(input.ownerUsername);
    const password = hashPassword(input.ownerPassword);
    const name = assertText(input.name, 'Clinic name', 2, 160);
    const dentistName = assertText(input.dentistName, 'Dentist name', 2, 160);
    const phone = assertText(input.phone, 'Phone number', 5, 40);
    const address = assertText(input.address, 'Address', 3, 500);
    let logoPath: string | null = null;
    const allPermissions = permissionDefinitions.map(([code]) => code);

    try { this.db.transaction(() => {
      logoPath = input.logoSourcePath ? this.copyLogo(input.logoSourcePath, clinicId) : null;
      this.db.run(`INSERT INTO clinics (
        id,name,dentist_name,professional_title,phone,alternative_phone,email,address,city,district,country,registration_info,
        opening_hours,working_days_json,currency_code,currency_symbol,invoice_prefix,patient_prefix,appointment_prefix,date_format,
        time_format,default_language,default_printer,footer_text,invoice_terms,payment_instructions,emergency_contact,logo_path,created_at,updated_at
      ) VALUES(${Array(30).fill('?').join(',')})`,
      clinicId, name, dentistName, optionalText(input.professionalTitle, 160) ?? '', phone, optionalText(input.alternativePhone, 40),
      this.validateEmail(input.email), address, optionalText(input.city, 100) ?? '', optionalText(input.district, 100) ?? '',
      assertText(input.country || 'Bangladesh', 'Country', 2, 100), optionalText(input.registrationInfo, 500), optionalText(input.openingHours, 500),
      JSON.stringify(Array.isArray(input.workingDays) ? input.workingDays.slice(0, 7) : []), assertText(input.currencyCode || 'BDT', 'Currency code', 2, 8).toUpperCase(),
      assertText(input.currencySymbol || '৳', 'Currency symbol', 1, 8), this.prefix(input.invoicePrefix, 'Invoice prefix'), this.prefix(input.patientPrefix, 'Patient prefix'),
      this.prefix(input.appointmentPrefix, 'Appointment prefix'), assertText(input.dateFormat || 'dd MMM yyyy', 'Date format', 2, 40),
      assertText(input.timeFormat || 'hh:mm a', 'Time format', 2, 40), input.defaultLanguage === 'bn' ? 'bn' : 'en', optionalText(input.defaultPrinter, 200),
      optionalText(input.footerText, 1000), optionalText(input.invoiceTerms, 2000), optionalText(input.paymentInstructions, 2000), optionalText(input.emergencyContact, 200),
      logoPath, now, now);

      for (const [code, permissionName, description] of permissionDefinitions) {
        this.db.run('INSERT INTO permissions(code,name,description) VALUES(?,?,?)', code, permissionName, description);
      }

      let ownerRoleId = '';
      for (const [roleName, allowed] of Object.entries(rolePermissions)) {
        const roleId = randomUUID();
        if (roleName === 'Owner / Administrator') ownerRoleId = roleId;
        this.db.run('INSERT INTO roles(id,clinic_id,name,description,is_system,created_at) VALUES(?,?,?,?,1,?)', roleId, clinicId, roleName, `${roleName} permissions`, now);
        const permissions = allowed.includes('*') ? allPermissions : allowed;
        for (const code of permissions) this.db.run('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)', roleId, code);
      }

      this.db.run(`INSERT INTO users
        (id,clinic_id,username,display_name,password_hash,password_salt,password_iterations,language,status,failed_login_count,password_changed_at,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?, 'active',0,?,?,?)`,
      userId, clinicId, username, ownerName, password.hash, password.salt, password.iterations, input.defaultLanguage === 'bn' ? 'bn' : 'en', now, now, now);
      this.db.run('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)', userId, ownerRoleId);

      const settings = { ...defaultSettings, language: input.defaultLanguage === 'bn' ? 'bn' : 'en', dateFormat: input.dateFormat, timeFormat: input.timeFormat };
      for (const [key, value] of Object.entries(settings)) this.db.run('INSERT INTO app_settings(clinic_id,key,value_json,updated_at) VALUES(?,?,?,?)', clinicId, key, JSON.stringify(value), now);
      for (const key of ['patient','appointment','visit','invoice','receipt','prescription','expense','referral','treatment_plan','staff','lab_case']) {
        this.db.run('INSERT INTO counters(clinic_id,counter_key,current_value) VALUES(?,?,0)', clinicId, key);
      }

      const methods: Array<[string, string, string | null]> = [
        ['Cash','cash',null], ['Bank transfer','bank',null], ['Card','card',null], ['bKash','mfs','bKash'],
        ['Nagad','mfs','Nagad'], ['Rocket','mfs','Rocket'], ['Upay','mfs','Upay'], ['Other','other',null]
      ];
      methods.forEach(([methodName, kind, provider], index) => this.db.run(
        'INSERT INTO payment_methods(id,clinic_id,name,kind,provider,active,sort_order) VALUES(?,?,?,?,?,1,?)', randomUUID(), clinicId, methodName, kind, provider, index
      ));

      const categories = [
        'Clinic rent','Electricity','Internet','Staff salary','Equipment','Dental materials','Laboratory',
        'Maintenance','Transport','Office supplies','Marketing','Software','Utilities','Other'
      ];
      categories.forEach((category, index) => this.db.run('INSERT INTO expense_categories(id,clinic_id,name,active,sort_order) VALUES(?,?,?,1,?)', randomUUID(), clinicId, category, index));

      this.audit.record({ clinicId, userId, userName: ownerName, action: 'initial_setup', entityType: 'clinic', entityIdentifier: clinicId, summary: 'Dentiva initial setup completed' });
    }); } catch (error) { if (logoPath) fs.rmSync(logoPath, { force: true }); throw error; }

    return this.sessions.createSession(userId);
  }

  private validateUsername(value: string): string {
    const username = assertText(value, 'Username', 3, 80);
    if (!/^[A-Za-z0-9._-]+$/.test(username)) throw new AppError('VALIDATION_ERROR', 'Username may contain letters, numbers, dots, underscores, and hyphens.', 'ownerUsername');
    return username;
  }

  private validateEmail(value: string | null | undefined): string | null {
    const email = optionalText(value, 254);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('VALIDATION_ERROR', 'Enter a valid email address.', 'email');
    return email;
  }

  private prefix(value: string, label: string): string {
    const prefix = assertText(value, label, 1, 12).toUpperCase();
    if (!/^[A-Z0-9-]+$/.test(prefix)) throw new AppError('VALIDATION_ERROR', `${label} may contain letters, numbers, and hyphens only.`);
    return prefix;
  }

  private copyLogo(source: string, clinicId: string): string {
    const resolved = path.resolve(source);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new AppError('FILE_NOT_FOUND', 'The selected clinic logo could not be found.');
    const ext = path.extname(resolved).toLowerCase();
    if (!['.png','.jpg','.jpeg','.webp'].includes(ext)) throw new AppError('UNSUPPORTED_FILE', 'Clinic logos must be PNG, JPG, JPEG, or WEBP files.');
    if (fs.statSync(resolved).size > 10 * 1024 * 1024) throw new AppError('FILE_TOO_LARGE', 'The clinic logo must be smaller than 10 MB.');
    const destination = path.join(this.paths.branding, `${clinicId}${ext}`);
    fs.copyFileSync(resolved, destination);
    return destination;
  }
}

export { defaultSettings };
