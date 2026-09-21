import { randomUUID } from 'node:crypto';
import type { DentivaDatabase } from '../database/database.js';
import type {
  Appointment, AttachmentRecord, DentalChartEntry, Invoice, PageRequest, PageResult, Patient,
  PatientDuplicate, PatientInput, Prescription, Visit
} from '../../shared/types.js';
import { mapAppointment, mapAttachment, mapChartEntry, mapInvoice, mapPatient, mapPrescription, mapPrescriptionItem, mapVisit, stringOrNull } from '../database/mappers.js';
import { AppError, assertText, optionalText } from '../utils/errors.js';
import type { AuditService } from '../security/security.js';
import { CounterService, ftsQuery, pageBounds } from './common.js';

type PatientProfile = Patient & { visits: Visit[]; appointments: Appointment[]; invoices: Invoice[]; chart: DentalChartEntry[]; prescriptions: Prescription[]; attachments: AttachmentRecord[] };

const patientSort: Record<string, string> = {
  patientCode: 'p.patient_code', fullName: 'p.full_name', phone: 'p.phone', registrationDate: 'p.registration_date',
  lastVisit: 'p.last_visit', nextAppointment: 'p.next_appointment', outstandingMinor: 'p.outstanding_minor', status: 'p.status', updatedAt: 'p.updated_at'
};

export class PatientService {
  private readonly counters: CounterService;
  constructor(private readonly db: DentivaDatabase, private readonly audit: AuditService) { this.counters = new CounterService(db); }

  list(clinicId: string, request: PageRequest, permissions?: readonly string[]): PageResult<Patient> {
    const { page, pageSize, offset } = pageBounds(request.page, request.pageSize);
    const canViewBilling=!permissions||permissions.includes('billing.view');const where = ['p.clinic_id=?'];
    const params: Array<string | number> = [clinicId];
    const search = String(request.search ?? '').trim();
    if (search) {
      where.push(`p.id IN (SELECT patient_id FROM patients_fts WHERE patients_fts MATCH ?)`);
      params.push(ftsQuery(search));
    }
    const status = request.filters?.status;
    if (typeof status === 'string' && ['active','inactive','archived','deceased'].includes(status)) { where.push('p.status=?'); params.push(status); }
    else if (!request.filters?.includeArchived) where.push("p.status != 'archived'");
    const gender = request.filters?.gender;
    if (typeof gender === 'string' && ['male','female','other','undisclosed'].includes(gender)) { where.push('p.gender=?'); params.push(gender); }
    if (canViewBilling && request.filters?.hasOutstanding === true) where.push('p.outstanding_minor > 0');
    const requestedSort=request.sortBy??'updatedAt';const sort = requestedSort==='outstandingMinor'&&!canViewBilling?patientSort.updatedAt:(patientSort[requestedSort] ?? patientSort.updatedAt);
    const direction = request.sortDirection === 'asc' ? 'ASC' : 'DESC';
    const clause = where.join(' AND ');
    const total = Number(this.db.get<{ count: number }>(`SELECT count(*) AS count FROM patients p WHERE ${clause}`, ...params)?.count ?? 0);
    const rows = this.db.all<Record<string, unknown>>(`SELECT p.* FROM patients p WHERE ${clause} ORDER BY ${sort} ${direction}, p.id ASC LIMIT ? OFFSET ?`, ...params, pageSize, offset);
    return { items: rows.map(mapPatient).map((patient)=>canViewBilling?patient:{...patient,outstandingMinor:0}), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  get(id: string, clinicId: string, permissions?: readonly string[]): PatientProfile {
    const row = this.db.get<Record<string, unknown>>('SELECT * FROM patients WHERE id=? AND clinic_id=?', id, clinicId);
    if (!row) throw new AppError('PATIENT_NOT_FOUND', 'The patient record could not be found. It may have been archived or removed by an authorized user.');
    const patient = mapPatient(row);const can=(permission:string)=>!permissions||permissions.includes(permission);if(!can('billing.view'))patient.outstandingMinor=0;
    const visits = can('clinical.view')?this.db.all<Record<string, unknown>>(`SELECT v.*,s.name AS provider_name FROM visits v LEFT JOIN staff s ON s.id=v.provider_id WHERE v.patient_id=? ORDER BY v.visited_at DESC`, id).map(mapVisit):[];
    const appointments = can('appointments.view')?this.db.all<Record<string, unknown>>(`SELECT a.*,p.patient_code,p.full_name AS patient_name,s.name AS dentist_name FROM appointments a JOIN patients p ON p.id=a.patient_id LEFT JOIN staff s ON s.id=a.dentist_id WHERE a.patient_id=? ORDER BY a.start_at DESC`, id).map(mapAppointment):[];
    const invoiceRows = can('billing.view')?this.db.all<Record<string, unknown>>(`SELECT i.*,p.patient_code,p.full_name AS patient_name FROM invoices i JOIN patients p ON p.id=i.patient_id WHERE i.patient_id=? ORDER BY i.issued_at DESC`, id):[];
    const invoices = invoiceRows.map((invoiceRow) => mapInvoice(invoiceRow, this.invoiceItems(String(invoiceRow.id))));
    const chart = can('clinical.view')?this.db.all<Record<string, unknown>>('SELECT * FROM dental_chart_entries WHERE patient_id=? ORDER BY recorded_at DESC', id).map(mapChartEntry):[];
    const prescriptionRows = can('clinical.view')?this.db.all<Record<string, unknown>>('SELECT * FROM prescriptions WHERE patient_id=? ORDER BY prescribed_at DESC', id):[];
    const prescriptions = prescriptionRows.map((prescriptionRow) => mapPrescription(prescriptionRow, this.db.all<Record<string, unknown>>('SELECT * FROM prescription_items WHERE prescription_id=? ORDER BY sort_order', String(prescriptionRow.id)).map(mapPrescriptionItem)));
    const attachments = can('documents.manage')?this.db.all<Record<string, unknown>>('SELECT * FROM attachments WHERE patient_id=? AND archived_at IS NULL ORDER BY created_at DESC', id).map(mapAttachment):[];
    return Object.assign(patient, { visits, appointments, invoices, chart, prescriptions, attachments });
  }

  duplicates(clinicId: string, input: Partial<PatientInput>): PatientDuplicate[] {
    const clauses: string[] = [];
    const params: string[] = [clinicId];
    const reasons = new Map<string, PatientDuplicate['reason']>();
    const phone = String(input.phone ?? '').replace(/[^\d+]/g, '');
    if (phone.length >= 7) { clauses.push("replace(replace(replace(p.phone,' ',''),'-',''),'(', '') LIKE ?"); params.push(`%${phone.replace('+','')}%`); }
    if (input.email?.trim()) { clauses.push('lower(p.email)=lower(?)'); params.push(input.email.trim()); }
    if (input.fullName?.trim() && input.dateOfBirth) { clauses.push('(lower(p.full_name)=lower(?) AND p.date_of_birth=?)'); params.push(input.fullName.trim(), input.dateOfBirth.slice(0, 10)); }
    if (clauses.length === 0) return [];
    const rows = this.db.all<Record<string, unknown>>(`SELECT p.id,p.patient_code,p.full_name,p.phone,p.email,p.date_of_birth FROM patients p WHERE p.clinic_id=? AND p.status!='archived' AND (${clauses.join(' OR ')}) LIMIT 20`, ...params);
    return rows.map((row) => {
      let reason: PatientDuplicate['reason'] = 'phone';
      if (input.email && String(row.email ?? '').toLowerCase() === input.email.toLowerCase()) reason = 'email';
      else if (input.fullName && input.dateOfBirth && String(row.full_name).toLowerCase() === input.fullName.toLowerCase() && row.date_of_birth === input.dateOfBirth.slice(0, 10)) reason = 'name_and_birth_date';
      reasons.set(String(row.id), reason);
      return { id: String(row.id), patientCode: String(row.patient_code), fullName: String(row.full_name), phone: String(row.phone), reason };
    });
  }

  create(clinicId: string, userId: string, userName: string, input: PatientInput): Patient {
    const data = this.validate(input);
    const now = new Date().toISOString();
    const id = randomUUID();
    let patientCode = '';
    this.db.transaction(() => {
      const clinic = this.db.get<{ patient_prefix: string }>('SELECT patient_prefix FROM clinics WHERE id=?', clinicId);
      if (!clinic) throw new AppError('CLINIC_NOT_FOUND', 'Clinic configuration is unavailable.');
      patientCode = input.patientCode?.trim().toUpperCase() || this.counters.next(clinicId, 'patient', clinic.patient_prefix);
      this.db.run(`INSERT INTO patients (
        id,clinic_id,patient_code,full_name,preferred_name,phone,alternative_phone,email,date_of_birth,gender,blood_group,address,
        emergency_contact,emergency_phone,occupation,identification_type,identification_number,medical_alerts,allergies_summary,
        current_medications,medical_conditions,dental_history,previous_dentist,referral_source,registration_date,last_visit,next_appointment,
        outstanding_minor,status,notes,tags_json,is_favorite,created_at,updated_at,archived_at
      ) VALUES(${Array(35).fill('?').join(',')})`,
      id, clinicId, patientCode, data.fullName, data.preferredName, data.phone, data.alternativePhone, data.email, data.dateOfBirth, data.gender,
      data.bloodGroup, data.address, data.emergencyContact, data.emergencyPhone, data.occupation, data.identificationType, data.identificationNumber,
      data.medicalAlerts, data.allergiesSummary, data.currentMedications, data.medicalConditions, data.dentalHistory, data.previousDentist, data.referralSource,
      now.slice(0,10), null, null, 0, data.status, data.notes, JSON.stringify(data.tags), data.isFavorite ? 1 : 0, now, now, null);
      this.audit.record({ clinicId, userId, userName, action: 'patient_created', entityType: 'patient', entityIdentifier: patientCode, summary: `Patient record ${patientCode} created` });
    });
    return this.get(id, clinicId);
  }

  update(id: string, clinicId: string, userId: string, userName: string, input: Partial<PatientInput>): Patient {
    const existing = this.db.get<Record<string, unknown>>('SELECT * FROM patients WHERE id=? AND clinic_id=?', id, clinicId);
    if (!existing) throw new AppError('PATIENT_NOT_FOUND', 'The patient record could not be found.');
    const merged = this.validate({ ...mapPatient(existing), ...input } as PatientInput);
    const now = new Date().toISOString();
    this.db.run(`UPDATE patients SET full_name=?,preferred_name=?,phone=?,alternative_phone=?,email=?,date_of_birth=?,gender=?,blood_group=?,address=?,
      emergency_contact=?,emergency_phone=?,occupation=?,identification_type=?,identification_number=?,medical_alerts=?,allergies_summary=?,current_medications=?,
      medical_conditions=?,dental_history=?,previous_dentist=?,referral_source=?,status=?,notes=?,tags_json=?,is_favorite=?,updated_at=? WHERE id=? AND clinic_id=?`,
    merged.fullName, merged.preferredName, merged.phone, merged.alternativePhone, merged.email, merged.dateOfBirth, merged.gender, merged.bloodGroup, merged.address,
    merged.emergencyContact, merged.emergencyPhone, merged.occupation, merged.identificationType, merged.identificationNumber, merged.medicalAlerts, merged.allergiesSummary,
    merged.currentMedications, merged.medicalConditions, merged.dentalHistory, merged.previousDentist, merged.referralSource, merged.status, merged.notes,
    JSON.stringify(merged.tags), merged.isFavorite ? 1 : 0, now, id, clinicId);
    this.audit.record({ clinicId, userId, userName, action: 'patient_edited', entityType: 'patient', entityIdentifier: String(existing.patient_code), summary: `Patient record ${String(existing.patient_code)} updated` });
    return this.get(id, clinicId);
  }

  archive(id: string, clinicId: string, userId: string, userName: string): void {
    const patient = this.db.get<{ patient_code: string; status: string }>('SELECT patient_code,status FROM patients WHERE id=? AND clinic_id=?', id, clinicId);
    if (!patient) throw new AppError('PATIENT_NOT_FOUND', 'The patient record could not be found.');
    if (patient.status === 'archived') return;
    const now = new Date().toISOString();
    this.db.run("UPDATE patients SET status='archived',archived_at=?,updated_at=? WHERE id=?", now, now, id);
    this.audit.record({ clinicId, userId, userName, action: 'patient_archived', entityType: 'patient', entityIdentifier: patient.patient_code, summary: `Patient record ${patient.patient_code} archived` });
  }

  restore(id: string, clinicId: string, userId: string, userName: string): void {
    const patient = this.db.get<{ patient_code: string }>('SELECT patient_code FROM patients WHERE id=? AND clinic_id=?', id, clinicId);
    if (!patient) throw new AppError('PATIENT_NOT_FOUND', 'The patient record could not be found.');
    this.db.run("UPDATE patients SET status='active',archived_at=NULL,updated_at=? WHERE id=?", new Date().toISOString(), id);
    this.audit.record({ clinicId, userId, userName, action: 'patient_restored', entityType: 'patient', entityIdentifier: patient.patient_code, summary: `Patient record ${patient.patient_code} restored` });
  }

  private validate(input: PatientInput): Omit<PatientInput, 'patientCode'> {
    const fullName = assertText(input.fullName, 'Full name', 2, 180);
    const phone = assertText(input.phone, 'Phone number', 5, 40);
    if (!/[0-9]/.test(phone)) throw new AppError('VALIDATION_ERROR', 'Phone number must contain digits.', 'phone');
    const email = optionalText(input.email, 254);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('VALIDATION_ERROR', 'Enter a valid email address.', 'email');
    const dateOfBirth = optionalText(input.dateOfBirth, 10);
    if (dateOfBirth && (Number.isNaN(Date.parse(dateOfBirth)) || new Date(dateOfBirth) > new Date())) throw new AppError('VALIDATION_ERROR', 'Date of birth cannot be in the future.', 'dateOfBirth');
    const gender = ['male','female','other','undisclosed'].includes(input.gender) ? input.gender : 'undisclosed';
    const status = ['active','inactive','archived','deceased'].includes(input.status) ? input.status : 'active';
    return {
      fullName, preferredName: optionalText(input.preferredName, 180), phone, alternativePhone: optionalText(input.alternativePhone, 40), email,
      dateOfBirth, gender, bloodGroup: optionalText(input.bloodGroup, 10), address: optionalText(input.address, 1000), emergencyContact: optionalText(input.emergencyContact, 180),
      emergencyPhone: optionalText(input.emergencyPhone, 40), occupation: optionalText(input.occupation, 180), identificationType: optionalText(input.identificationType, 80),
      identificationNumber: optionalText(input.identificationNumber, 120), medicalAlerts: optionalText(input.medicalAlerts, 4000), allergiesSummary: optionalText(input.allergiesSummary, 4000),
      currentMedications: optionalText(input.currentMedications, 4000), medicalConditions: optionalText(input.medicalConditions, 4000), dentalHistory: optionalText(input.dentalHistory, 8000),
      previousDentist: optionalText(input.previousDentist, 180), referralSource: optionalText(input.referralSource, 180), status, notes: optionalText(input.notes, 10_000),
      tags: Array.isArray(input.tags) ? [...new Set(input.tags.map((tag) => String(tag).trim()).filter(Boolean))].slice(0, 20) : [], isFavorite: Boolean(input.isFavorite)
    };
  }

  private invoiceItems(invoiceId: string): Invoice['items'] {
    return this.db.all<Record<string, unknown>>('SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY sort_order', invoiceId).map((row) => ({
      id: String(row.id), treatmentId: stringOrNull(row.treatment_id), description: String(row.description), quantity: Number(row.quantity), unitPriceMinor: Number(row.unit_price_minor),
      discountMinor: Number(row.discount_minor), taxRate: Number(row.tax_rate), taxMinor: Number(row.tax_minor), lineTotalMinor: Number(row.line_total_minor)
    }));
  }
}
