import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppSettings, Clinic } from '../../shared/types.js';
import type { DentivaDatabase } from '../database/database.js';
import { mapClinic } from '../database/mappers.js';
import type { AuditService } from '../security/security.js';
import type { DentivaPaths } from '../utils/paths.js';
import { AppError, optionalText } from '../utils/errors.js';
import { defaultSettings } from './setup-service.js';

const clinicColumns: Record<keyof Partial<Clinic>, string> = {
  id: 'id', name: 'name', dentistName: 'dentist_name', professionalTitle: 'professional_title', phone: 'phone', alternativePhone: 'alternative_phone',
  email: 'email', address: 'address', city: 'city', district: 'district', country: 'country', registrationInfo: 'registration_info', openingHours: 'opening_hours',
  workingDays: 'working_days_json', currencyCode: 'currency_code', currencySymbol: 'currency_symbol', invoicePrefix: 'invoice_prefix', patientPrefix: 'patient_prefix',
  appointmentPrefix: 'appointment_prefix', dateFormat: 'date_format', timeFormat: 'time_format', defaultLanguage: 'default_language', defaultPrinter: 'default_printer',
  footerText: 'footer_text', invoiceTerms: 'invoice_terms', paymentInstructions: 'payment_instructions', emergencyContact: 'emergency_contact', logoPath: 'logo_path',
  createdAt: 'created_at', updatedAt: 'updated_at'
};

const editableClinicKeys = new Set<keyof Clinic>([
  'name','dentistName','professionalTitle','phone','alternativePhone','email','address','city','district','country','registrationInfo','openingHours','workingDays',
  'currencyCode','currencySymbol','invoicePrefix','patientPrefix','appointmentPrefix','dateFormat','timeFormat','defaultLanguage','defaultPrinter','footerText',
  'invoiceTerms','paymentInstructions','emergencyContact'
]);

export class SettingsService {
  constructor(private readonly db: DentivaDatabase, private readonly audit: AuditService, private readonly paths: DentivaPaths) {}

  get(clinicId: string): { clinic: Clinic; app: AppSettings } {
    const row = this.db.get<Record<string, unknown>>('SELECT * FROM clinics WHERE id=?', clinicId);
    if (!row) throw new AppError('CLINIC_NOT_FOUND', 'Clinic settings could not be found.');
    const app = { ...defaultSettings };
    for (const setting of this.db.all<{ key: string; value_json: string }>('SELECT key,value_json FROM app_settings WHERE clinic_id=?', clinicId)) {
      if (setting.key in app) {
        try { (app as unknown as Record<string, unknown>)[setting.key] = JSON.parse(setting.value_json); } catch { /* retain safe default */ }
      }
    }
    return { clinic: mapClinic(row), app };
  }

  updateClinic(clinicId: string, userId: string, userName: string, input: Partial<Clinic>): Clinic {
    const entries = Object.entries(input).filter(([key]) => editableClinicKeys.has(key as keyof Clinic));
    if (entries.length === 0) return this.get(clinicId).clinic;
    const assignments: string[] = [];
    const values: Array<string | null> = [];
    for (const [rawKey, rawValue] of entries) {
      const key = rawKey as keyof Clinic;
      const column = clinicColumns[key];
      if (!column) continue;
      let value: string | null;
      if (key === 'workingDays') value = JSON.stringify(Array.isArray(rawValue) ? rawValue.slice(0, 7) : []);
      else if (key === 'defaultLanguage') value = rawValue === 'bn' ? 'bn' : 'en';
      else if (['currencyCode','invoicePrefix','patientPrefix','appointmentPrefix'].includes(key)) value = String(rawValue ?? '').trim().toUpperCase();
      else value = optionalText(rawValue, key === 'invoiceTerms' || key === 'paymentInstructions' ? 2000 : 1000);
      if (['name','dentistName','phone','address','country','currencyCode','currencySymbol','invoicePrefix','patientPrefix','appointmentPrefix','dateFormat','timeFormat'].includes(key) && !value) {
        throw new AppError('VALIDATION_ERROR', `${key} cannot be empty.`, key);
      }
      assignments.push(`${column}=?`);
      values.push(value);
    }
    const now = new Date().toISOString();
    assignments.push('updated_at=?');
    values.push(now);
    this.db.run(`UPDATE clinics SET ${assignments.join(',')} WHERE id=?`, ...values, clinicId);
    this.audit.record({ clinicId, userId, userName, action: 'settings_changed', entityType: 'clinic', entityIdentifier: clinicId, summary: `Clinic settings updated: ${entries.map(([key]) => key).join(', ')}` });
    return this.get(clinicId).clinic;
  }

  updateLogo(clinicId:string,userId:string,userName:string,sourcePath:string|null):Clinic{
    const previous=this.db.get<{logo_path:string|null}>('SELECT logo_path FROM clinics WHERE id=?',clinicId)?.logo_path??null;let managedPath:string|null=null;if(sourcePath){const source=path.resolve(sourcePath);if(!fs.existsSync(source)||!fs.statSync(source).isFile())throw new AppError('FILE_NOT_FOUND','The selected logo file could not be found.');const extension=path.extname(source).toLowerCase();if(!['.png','.jpg','.jpeg','.webp'].includes(extension))throw new AppError('UNSUPPORTED_FILE','Use a PNG, JPG, or WEBP clinic logo.');if(fs.statSync(source).size>10*1024*1024)throw new AppError('FILE_TOO_LARGE','The clinic logo must be 10 MB or smaller.');managedPath=path.join(this.paths.branding,`clinic-logo-${randomUUID()}${extension}`);fs.mkdirSync(this.paths.branding,{recursive:true,mode:0o700});const temporary=`${managedPath}.partial`;try{fs.copyFileSync(source,temporary);fs.renameSync(temporary,managedPath);}catch{fs.rmSync(temporary,{force:true});throw new AppError('FILE_COPY_FAILED','The clinic logo could not be copied into managed storage.');}}
    try{this.db.run('UPDATE clinics SET logo_path=?,updated_at=? WHERE id=?',managedPath,new Date().toISOString(),clinicId);}catch(error){if(managedPath)fs.rmSync(managedPath,{force:true});throw error;}if(previous&&previous!==managedPath){const resolved=path.resolve(previous);const brandingRoot=path.resolve(this.paths.branding)+path.sep;if(resolved.startsWith(brandingRoot))fs.rmSync(resolved,{force:true});}this.audit.record({clinicId,userId,userName,action:'settings_changed',entityType:'clinic_branding',entityIdentifier:clinicId,summary:managedPath?'Clinic logo updated':'Clinic logo removed from documents'});return this.get(clinicId).clinic;
  }

  paymentMethods(clinicId:string):string[]{return this.db.all<{name:string}>('SELECT name FROM payment_methods WHERE clinic_id=? AND active=1 ORDER BY sort_order,name',clinicId).map((row)=>row.name);}

  updatePaymentMethods(clinicId:string,userId:string,userName:string,values:string[]):string[]{const methods=[...new Map((Array.isArray(values)?values:[]).map((value)=>String(value).trim()).filter(Boolean).slice(0,30).map((value)=>[value.toLocaleLowerCase('en'),value])).values()];if(!methods.length)throw new AppError('VALIDATION_ERROR','Configure at least one payment method.');if(methods.some((value)=>value.length>80))throw new AppError('VALIDATION_ERROR','Payment method names cannot exceed 80 characters.');this.db.transaction(()=>{this.db.run('UPDATE payment_methods SET active=0 WHERE clinic_id=?',clinicId);methods.forEach((name,index)=>{const existing=this.db.get<{id:string}>('SELECT id FROM payment_methods WHERE clinic_id=? AND name=? COLLATE NOCASE',clinicId,name);if(existing)this.db.run('UPDATE payment_methods SET name=?,active=1,sort_order=? WHERE id=?',name,index,existing.id);else this.db.run("INSERT INTO payment_methods(id,clinic_id,name,kind,provider,active,sort_order) VALUES(?,?,?,'other',NULL,1,?)",randomUUID(),clinicId,name,index);});this.audit.record({clinicId,userId,userName,action:'settings_changed',entityType:'payment_methods',entityIdentifier:clinicId,summary:`Payment methods updated (${methods.length} active)`});});return this.paymentMethods(clinicId);}

  updateApp(clinicId: string, userId: string, userName: string, input: Partial<AppSettings>): AppSettings {
    const validKeys = Object.keys(defaultSettings) as Array<keyof AppSettings>;
    const now = new Date().toISOString();
    this.db.transaction(() => {
      for (const key of validKeys) {
        if (!(key in input)) continue;
        const value = this.validateSetting(key, input[key]);
        this.db.run(`INSERT INTO app_settings(clinic_id,key,value_json,updated_at) VALUES(?,?,?,?)
          ON CONFLICT(clinic_id,key) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at`, clinicId, key, JSON.stringify(value), now);
      }
      this.audit.record({ clinicId, userId, userName, action: 'settings_changed', entityType: 'application_settings', entityIdentifier: clinicId, summary: `Application settings updated: ${Object.keys(input).filter((key) => validKeys.includes(key as keyof AppSettings)).join(', ')}` });
    });
    return this.get(clinicId).app;
  }

  private validateSetting(key: keyof AppSettings, value: unknown): unknown {
    switch (key) {
      case 'language': return value === 'bn' ? 'bn' : 'en';
      case 'autoLockMinutes': {
        const number = Number(value); if (!Number.isInteger(number) || number < 1 || number > 240) throw new AppError('VALIDATION_ERROR', 'Automatic lock must be between 1 and 240 minutes.'); return number;
      }
      case 'backupReminderDays': {
        const number = Number(value); if (!Number.isInteger(number) || number < 1 || number > 365) throw new AppError('VALIDATION_ERROR', 'Backup reminder must be between 1 and 365 days.'); return number;
      }
      case 'defaultAppointmentMinutes': {
        const number = Number(value); if (!Number.isInteger(number) || number < 5 || number > 720) throw new AppError('VALIDATION_ERROR', 'Default appointment duration must be between 5 and 720 minutes.'); return number;
      }
      case 'dashboardPreset': return ['today','7days','1month','3months','6months','1year','custom'].includes(String(value)) ? value : 'today';
      case 'receiptWidth': return ['58mm','80mm','A4','A5'].includes(String(value)) ? value : '80mm';
      case 'dateFormat': case 'timeFormat': return String(value ?? '').slice(0, 40) || defaultSettings[key];
      case 'notificationsEnabled': case 'lowStockNotifications': case 'appointmentNotifications': return Boolean(value);
      case 'backupLocation': return value ? String(value).slice(0, 1000) : null;
      default: return value;
    }
  }
}
