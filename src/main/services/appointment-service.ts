import { randomUUID } from 'node:crypto';
import type { Appointment, AppointmentInput, AppointmentStatus, PageRequest, PageResult } from '../../shared/types.js';
import type { DentivaDatabase } from '../database/database.js';
import { mapAppointment } from '../database/mappers.js';
import type { AuditService } from '../security/security.js';
import { AppError, assertText, optionalText } from '../utils/errors.js';
import { CounterService, pageBounds } from './common.js';

const appointmentSort: Record<string, string> = { startAt: 'a.start_at', patientName: 'p.full_name', serialNumber: 'a.serial_number', status: 'a.status', createdAt: 'a.created_at' };
const statuses: AppointmentStatus[] = ['scheduled','confirmed','waiting','in_consultation','completed','cancelled','no_show','rescheduled'];
const activeStatuses: AppointmentStatus[] = ['scheduled','confirmed','waiting','in_consultation'];

function localIso(date: Date): string {
  const part = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${part(date.getMonth()+1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`;
}

export class AppointmentService {
  private readonly counters: CounterService;
  constructor(private readonly db: DentivaDatabase, private readonly audit: AuditService) { this.counters = new CounterService(db); }

  list(clinicId: string, request: PageRequest): PageResult<Appointment> {
    const { page, pageSize, offset } = pageBounds(request.page, request.pageSize);
    const where = ['a.clinic_id=?'];
    const params: Array<string | number> = [clinicId];
    const search = String(request.search ?? '').trim();
    if (search) { where.push('(p.full_name LIKE ? ESCAPE \'\\\' OR p.patient_code LIKE ? ESCAPE \'\\\' OR p.phone LIKE ? ESCAPE \'\\\' OR a.appointment_code LIKE ? ESCAPE \'\\\')'); const term = `%${search.replace(/[\\%_]/g, '\\$&')}%`; params.push(term,term,term,term); }
    const status = request.filters?.status;
    if (typeof status === 'string' && statuses.includes(status as AppointmentStatus)) { where.push('a.status=?'); params.push(status); }
    if (typeof request.filters?.from === 'string') { where.push('substr(a.start_at,1,10)>=?'); params.push(request.filters.from); }
    if (typeof request.filters?.to === 'string') { where.push('substr(a.start_at,1,10)<=?'); params.push(request.filters.to); }
    if (typeof request.filters?.dentistId === 'string') { where.push('a.dentist_id=?'); params.push(request.filters.dentistId); }
    const clause = where.join(' AND ');
    const total = Number(this.db.get<{ count: number }>(`SELECT count(*) AS count FROM appointments a JOIN patients p ON p.id=a.patient_id WHERE ${clause}`, ...params)?.count ?? 0);
    const sort = appointmentSort[request.sortBy ?? 'startAt'] ?? appointmentSort.startAt;
    const direction = request.sortDirection === 'asc' ? 'ASC' : 'DESC';
    const rows = this.db.all<Record<string, unknown>>(`SELECT a.*,p.patient_code,p.full_name AS patient_name,s.name AS dentist_name FROM appointments a
      JOIN patients p ON p.id=a.patient_id LEFT JOIN staff s ON s.id=a.dentist_id WHERE ${clause} ORDER BY ${sort} ${direction},a.id LIMIT ? OFFSET ?`, ...params, pageSize, offset);
    return { items: rows.map(mapAppointment), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  day(clinicId: string, date: string): Appointment[] {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError('VALIDATION_ERROR', 'Select a valid schedule date.');
    return this.db.all<Record<string, unknown>>(`SELECT a.*,p.patient_code,p.full_name AS patient_name,s.name AS dentist_name FROM appointments a
      JOIN patients p ON p.id=a.patient_id LEFT JOIN staff s ON s.id=a.dentist_id
      WHERE a.clinic_id=? AND substr(a.start_at,1,10)=? ORDER BY coalesce(a.serial_number,999999),a.start_at`, clinicId, date).map(mapAppointment);
  }

  create(clinicId: string, userId: string, userName: string, input: AppointmentInput): Appointment {
    const data = this.validate(input);
    const patient = this.db.get<{ id: string; status: string }>('SELECT id,status FROM patients WHERE id=? AND clinic_id=?', data.patientId, clinicId);
    if (!patient || patient.status === 'archived') throw new AppError('PATIENT_NOT_FOUND', 'Choose an active patient for the appointment.', 'patientId');
    const id = randomUUID();
    const now = new Date().toISOString();
    let appointmentCode = '';
    this.db.transaction(() => {
      this.ensureNoConflict(clinicId, data, null);
      const clinic = this.db.get<{ appointment_prefix: string }>('SELECT appointment_prefix FROM clinics WHERE id=?', clinicId);
      if (!clinic) throw new AppError('CLINIC_NOT_FOUND', 'Clinic configuration is unavailable.');
      appointmentCode = this.counters.next(clinicId, 'appointment', clinic.appointment_prefix);
      const serialRow = this.db.get<{ next_serial: number }>(`SELECT coalesce(max(serial_number),0)+1 AS next_serial FROM appointments
        WHERE clinic_id=? AND substr(start_at,1,10)=? AND status NOT IN ('cancelled','rescheduled')`, clinicId, data.startAt.slice(0,10));
      const serial = Number(serialRow?.next_serial ?? 1);
      this.db.run(`INSERT INTO appointments
        (id,clinic_id,appointment_code,patient_id,dentist_id,appointment_type,reason,start_at,end_at,duration_minutes,status,serial_number,notes,follow_up,chair,rescheduled_from_id,checked_in_at,consultation_started_at,completed_at,created_at,updated_at)
        VALUES(${Array(21).fill('?').join(',')})`, id, clinicId, appointmentCode, data.patientId, data.dentistId, data.appointmentType, data.reason,
      data.startAt, data.endAt, data.durationMinutes, data.status, serial, data.notes, data.followUp ? 1 : 0, data.chair, null, null, null, null, now, now);
      this.refreshPatientNextAppointment(data.patientId);
      this.audit.record({ clinicId, userId, userName, action: 'appointment_created', entityType: 'appointment', entityIdentifier: appointmentCode, summary: `Appointment ${appointmentCode} created` });
    });
    return this.getById(id, clinicId);
  }

  update(id: string, clinicId: string, userId: string, userName: string, input: Partial<AppointmentInput>): Appointment {
    const existing = this.getById(id, clinicId);
    const data = this.validate({ ...existing, ...input });
    this.db.transaction(() => {
      this.ensureNoConflict(clinicId, data, id);
      this.db.run(`UPDATE appointments SET patient_id=?,dentist_id=?,appointment_type=?,reason=?,start_at=?,end_at=?,duration_minutes=?,status=?,notes=?,follow_up=?,chair=?,updated_at=? WHERE id=? AND clinic_id=?`,
        data.patientId, data.dentistId, data.appointmentType, data.reason, data.startAt, data.endAt, data.durationMinutes, data.status, data.notes, data.followUp ? 1 : 0,
        data.chair, new Date().toISOString(), id, clinicId);
      this.refreshPatientNextAppointment(existing.patientId);
      if (data.patientId !== existing.patientId) this.refreshPatientNextAppointment(data.patientId);
      this.audit.record({ clinicId, userId, userName, action: 'appointment_edited', entityType: 'appointment', entityIdentifier: existing.appointmentCode, summary: `Appointment ${existing.appointmentCode} updated` });
    });
    return this.getById(id, clinicId);
  }

  setStatus(id: string, clinicId: string, userId: string, userName: string, status: AppointmentStatus): Appointment {
    if (!statuses.includes(status)) throw new AppError('VALIDATION_ERROR', 'Appointment status is invalid.');
    const appointment = this.getById(id, clinicId);
    const now = new Date().toISOString();
    let timestampColumn = '';
    if (status === 'waiting') timestampColumn = ',checked_in_at=coalesce(checked_in_at,?)';
    else if (status === 'in_consultation') timestampColumn = ',consultation_started_at=coalesce(consultation_started_at,?)';
    else if (status === 'completed') timestampColumn = ',completed_at=coalesce(completed_at,?)';
    const params: Array<string> = [status];
    if (timestampColumn) params.push(now);
    params.push(now, id, clinicId);
    this.db.run(`UPDATE appointments SET status=?${timestampColumn},updated_at=? WHERE id=? AND clinic_id=?`, ...params);
    this.refreshPatientNextAppointment(appointment.patientId);
    this.audit.record({ clinicId, userId, userName, action: 'appointment_status_changed', entityType: 'appointment', entityIdentifier: appointment.appointmentCode, summary: `Appointment ${appointment.appointmentCode} marked ${status.replace('_',' ')}` });
    return this.getById(id, clinicId);
  }

  private getById(id: string, clinicId: string): Appointment {
    const row = this.db.get<Record<string, unknown>>(`SELECT a.*,p.patient_code,p.full_name AS patient_name,s.name AS dentist_name FROM appointments a
      JOIN patients p ON p.id=a.patient_id LEFT JOIN staff s ON s.id=a.dentist_id WHERE a.id=? AND a.clinic_id=?`, id, clinicId);
    if (!row) throw new AppError('APPOINTMENT_NOT_FOUND', 'The appointment could not be found.');
    return mapAppointment(row);
  }

  private validate(input: AppointmentInput): AppointmentInput & { endAt: string } {
    const patientId = assertText(input.patientId, 'Patient', 30, 50);
    const appointmentType = assertText(input.appointmentType, 'Appointment type', 2, 120);
    const start = new Date(input.startAt);
    if (Number.isNaN(start.getTime())) throw new AppError('VALIDATION_ERROR', 'Select a valid appointment date and time.', 'startAt');
    const durationMinutes = Number(input.durationMinutes);
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 720) throw new AppError('VALIDATION_ERROR', 'Appointment duration must be between 5 and 720 minutes.', 'durationMinutes');
    const startAt = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.startAt) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(input.startAt) ? `${input.startAt.slice(0,19)}` : localIso(start);
    const endAt = localIso(new Date(start.getTime() + durationMinutes * 60_000));
    return { patientId, dentistId: input.dentistId || null, appointmentType, reason: optionalText(input.reason, 1000), startAt, endAt, durationMinutes,
      status: statuses.includes(input.status) ? input.status : 'scheduled', notes: optionalText(input.notes, 4000), followUp: Boolean(input.followUp), chair: optionalText(input.chair, 80) };
  }

  private ensureNoConflict(clinicId: string, data: AppointmentInput & { endAt: string }, excludedId: string | null): void {
    if (!activeStatuses.includes(data.status)) return;
    const conditions = [`a.clinic_id=?`, `a.status IN ('scheduled','confirmed','waiting','in_consultation')`, 'a.start_at < ?', 'a.end_at > ?'];
    const params: Array<string | null> = [clinicId, data.endAt, data.startAt];
    if (excludedId) { conditions.push('a.id != ?'); params.push(excludedId); }
    if (data.dentistId) { conditions.push('(a.dentist_id=? OR (? IS NOT NULL AND a.chair=?))'); params.push(data.dentistId, data.chair, data.chair); }
    else if (data.chair) { conditions.push('a.chair=?'); params.push(data.chair); }
    else return;
    const conflict = this.db.get<{ appointment_code: string }>(`SELECT a.appointment_code FROM appointments a WHERE ${conditions.join(' AND ')} LIMIT 1`, ...params);
    if (conflict) throw new AppError('APPOINTMENT_CONFLICT', `This time overlaps with appointment ${conflict.appointment_code}. Choose another time, provider, or chair.`, 'startAt');
  }

  private refreshPatientNextAppointment(patientId: string): void {
    const next = this.db.get<{ start_at: string }>(`SELECT start_at FROM appointments WHERE patient_id=? AND status IN ('scheduled','confirmed','waiting') AND start_at>=? ORDER BY start_at LIMIT 1`, patientId, localIso(new Date()));
    this.db.run('UPDATE patients SET next_appointment=?,updated_at=updated_at WHERE id=?', next?.start_at ?? null, patientId);
  }
}
