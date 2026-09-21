import { randomUUID } from 'node:crypto';
import type {
  ClinicalNote, DentalChartEntry, PageRequest, PageResult, Prescription, Visit, VisitInput
} from '../../shared/types.js';
import type { DentivaDatabase } from '../database/database.js';
import { mapChartEntry, mapPrescription, mapPrescriptionItem, mapVisit } from '../database/mappers.js';
import type { AuditService } from '../security/security.js';
import { AppError, assertText, optionalText } from '../utils/errors.js';
import { CounterService, pageBounds } from './common.js';

const adultTeeth = new Set(['11','12','13','14','15','16','17','18','21','22','23','24','25','26','27','28','31','32','33','34','35','36','37','38','41','42','43','44','45','46','47','48']);
const primaryTeeth = new Set(['51','52','53','54','55','61','62','63','64','65','71','72','73','74','75','81','82','83','84','85']);
const visitSort: Record<string, string> = { visitedAt: 'v.visited_at', patientName: 'p.full_name', visitNumber: 'v.visit_number', status: 'v.status' };

export class ClinicalService {
  private readonly counters: CounterService;
  constructor(private readonly db: DentivaDatabase, private readonly audit: AuditService) { this.counters = new CounterService(db); }

  visits(clinicId: string, request: PageRequest): PageResult<Visit> {
    const { page, pageSize, offset } = pageBounds(request.page, request.pageSize);
    const where = ['v.clinic_id=?'];
    const params: Array<string | number> = [clinicId];
    const search = String(request.search ?? '').trim();
    if (search) { const term = `%${search.replace(/[\\%_]/g, '\\$&')}%`; where.push("(p.full_name LIKE ? ESCAPE '\\' OR p.patient_code LIKE ? ESCAPE '\\' OR v.visit_number LIKE ? ESCAPE '\\')"); params.push(term,term,term); }
    if (typeof request.filters?.patientId === 'string') { where.push('v.patient_id=?'); params.push(request.filters.patientId); }
    if (typeof request.filters?.status === 'string' && ['open','completed','cancelled'].includes(request.filters.status)) { where.push('v.status=?'); params.push(request.filters.status); }
    if (typeof request.filters?.from === 'string') { where.push('substr(v.visited_at,1,10)>=?'); params.push(request.filters.from); }
    if (typeof request.filters?.to === 'string') { where.push('substr(v.visited_at,1,10)<=?'); params.push(request.filters.to); }
    const clause = where.join(' AND ');
    const total = Number(this.db.get<{ count: number }>(`SELECT count(*) AS count FROM visits v JOIN patients p ON p.id=v.patient_id WHERE ${clause}`, ...params)?.count ?? 0);
    const sort = visitSort[request.sortBy ?? 'visitedAt'] ?? visitSort.visitedAt;
    const direction = request.sortDirection === 'asc' ? 'ASC' : 'DESC';
    const rows = this.db.all<Record<string, unknown>>(`SELECT v.*,p.full_name AS patient_name,p.patient_code,s.name AS provider_name FROM visits v
      JOIN patients p ON p.id=v.patient_id LEFT JOIN staff s ON s.id=v.provider_id WHERE ${clause} ORDER BY ${sort} ${direction},v.id LIMIT ? OFFSET ?`, ...params, pageSize, offset);
    return { items: rows.map(mapVisit), page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  createVisit(clinicId: string, userId: string, userName: string, input: VisitInput): Visit {
    const patient = this.db.get<{ patient_code: string; status: string }>('SELECT patient_code,status FROM patients WHERE id=? AND clinic_id=?', input.patientId, clinicId);
    if (!patient || patient.status === 'archived') throw new AppError('PATIENT_NOT_FOUND', 'Choose an active patient for this visit.');
    const data = this.validateVisit(input);
    const id = randomUUID();
    const now = new Date().toISOString();
    let visitNumber = '';
    this.db.transaction(() => {
      visitNumber = this.counters.next(clinicId, 'visit', 'VIS', 6, true);
      this.db.run(`INSERT INTO visits (
        id,clinic_id,patient_id,appointment_id,provider_id,visit_number,visited_at,chief_complaint,reason,symptoms,clinical_findings,diagnosis,
        treatment_plan,treatment_performed,procedure_details,materials_used,follow_up_recommendation,next_visit_date,dentist_notes,assistant_notes,
        status,created_at,updated_at,completed_at
      ) VALUES(${Array(24).fill('?').join(',')})`,
      id,clinicId,data.patientId,data.appointmentId,data.providerId,visitNumber,data.visitedAt,data.chiefComplaint,data.reason,data.symptoms,data.clinicalFindings,
      data.diagnosis,data.treatmentPlan,data.treatmentPerformed,data.procedureDetails,data.materialsUsed,data.followUpRecommendation,data.nextVisitDate,
      data.dentistNotes,data.assistantNotes,data.status,now,now,null);
      this.db.run('UPDATE patients SET last_visit=?,updated_at=? WHERE id=?', data.visitedAt, now, data.patientId);
      if (data.appointmentId) this.db.run("UPDATE appointments SET status='in_consultation',consultation_started_at=coalesce(consultation_started_at,?),updated_at=? WHERE id=? AND patient_id=?", now, now, data.appointmentId, data.patientId);
      this.audit.record({ clinicId,userId,userName,action:'clinical_record_created',entityType:'visit',entityIdentifier:visitNumber,summary:`Clinical visit ${visitNumber} created` });
    });
    return this.getVisit(id, clinicId);
  }

  updateVisit(id: string, clinicId: string, userId: string, userName: string, input: Partial<VisitInput>): Visit {
    const existing = this.getVisit(id, clinicId);
    if (existing.status === 'cancelled') throw new AppError('VISIT_LOCKED', 'A cancelled visit cannot be edited.');
    const data = this.validateVisit({ ...existing, ...input });
    this.db.run(`UPDATE visits SET appointment_id=?,provider_id=?,visited_at=?,chief_complaint=?,reason=?,symptoms=?,clinical_findings=?,diagnosis=?,
      treatment_plan=?,treatment_performed=?,procedure_details=?,materials_used=?,follow_up_recommendation=?,next_visit_date=?,dentist_notes=?,assistant_notes=?,status=?,updated_at=? WHERE id=? AND clinic_id=?`,
    data.appointmentId,data.providerId,data.visitedAt,data.chiefComplaint,data.reason,data.symptoms,data.clinicalFindings,data.diagnosis,data.treatmentPlan,
    data.treatmentPerformed,data.procedureDetails,data.materialsUsed,data.followUpRecommendation,data.nextVisitDate,data.dentistNotes,data.assistantNotes,data.status,
    new Date().toISOString(),id,clinicId);
    this.audit.record({ clinicId,userId,userName,action:'clinical_record_edited',entityType:'visit',entityIdentifier:existing.visitNumber,summary:`Clinical visit ${existing.visitNumber} updated` });
    return this.getVisit(id, clinicId);
  }

  completeVisit(id: string, clinicId: string, userId: string, userName: string): Visit {
    const visit = this.getVisit(id, clinicId);
    if (visit.status === 'completed') return visit;
    if (visit.status === 'cancelled') throw new AppError('VISIT_CANCELLED', 'A cancelled visit cannot be completed.');
    const now = new Date().toISOString();
    this.db.transaction(() => {
      this.db.run("UPDATE visits SET status='completed',completed_at=?,updated_at=? WHERE id=?", now,now,id);
      this.db.run('UPDATE patients SET last_visit=?,updated_at=? WHERE id=?',visit.visitedAt,now,visit.patientId);
      if (visit.appointmentId) this.db.run("UPDATE appointments SET status='completed',completed_at=?,updated_at=? WHERE id=?",now,now,visit.appointmentId);
      this.audit.record({clinicId,userId,userName,action:'clinical_visit_completed',entityType:'visit',entityIdentifier:visit.visitNumber,summary:`Clinical visit ${visit.visitNumber} completed`});
    });
    return this.getVisit(id,clinicId);
  }

  addNote(visitId: string, clinicId: string, userId: string, userName: string, note: { noteType: ClinicalNote['noteType']; content: string }): ClinicalNote {
    const visit = this.getVisit(visitId,clinicId);
    const noteTypes: ClinicalNote['noteType'][] = ['clinical','dentist','assistant','progress'];
    const noteType = noteTypes.includes(note.noteType) ? note.noteType : 'clinical';
    const content = assertText(note.content,'Clinical note',1,20_000);
    const id = randomUUID(); const now = new Date().toISOString();
    this.db.run('INSERT INTO clinical_notes(id,visit_id,author_id,note_type,content,created_at,amended_at,amendment_reason,supersedes_id) VALUES(?,?,?,?,?,?,NULL,NULL,NULL)',id,visitId,userId,noteType,content,now);
    this.audit.record({clinicId,userId,userName,action:'clinical_note_created',entityType:'visit',entityIdentifier:visit.visitNumber,summary:`A ${noteType} note was added to visit ${visit.visitNumber}`});
    return {id,visitId,authorId:userId,noteType,content,createdAt:now,amendedAt:null,amendmentReason:null};
  }

  chart(patientId: string, clinicId: string): DentalChartEntry[] {
    this.ensurePatient(patientId,clinicId);
    return this.db.all<Record<string,unknown>>('SELECT * FROM dental_chart_entries WHERE patient_id=? ORDER BY recorded_at DESC',patientId).map(mapChartEntry);
  }

  setChartEntry(clinicId: string,userId: string,userName: string,entry: Omit<DentalChartEntry,'id'|'recordedAt'|'recordedBy'>): DentalChartEntry {
    this.ensurePatient(entry.patientId,clinicId);
    const validTeeth = entry.dentition === 'primary' ? primaryTeeth : adultTeeth;
    if (!validTeeth.has(entry.toothNumber)) throw new AppError('VALIDATION_ERROR','Select a valid tooth number.','toothNumber');
    const condition = assertText(entry.condition,'Condition',2,160);
    if (!['observed','planned','in_progress','completed','cancelled'].includes(entry.status)) throw new AppError('VALIDATION_ERROR','Select a valid treatment status.');
    if (entry.visitId) {
      const visit = this.db.get<{id:string}>('SELECT id FROM visits WHERE id=? AND patient_id=? AND clinic_id=?',entry.visitId,entry.patientId,clinicId);
      if (!visit) throw new AppError('VISIT_NOT_FOUND','The selected visit does not belong to this patient.');
    }
    const id=randomUUID(); const now=new Date().toISOString();
    this.db.run(`INSERT INTO dental_chart_entries(id,patient_id,visit_id,dentition,tooth_number,surface,condition,procedure,status,notes,recorded_at,recorded_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,id,entry.patientId,entry.visitId,entry.dentition,entry.toothNumber,optionalText(entry.surface,80),condition,
    optionalText(entry.procedure,500),entry.status,optionalText(entry.notes,4000),now,userId);
    this.audit.record({clinicId,userId,userName,action:'dental_chart_recorded',entityType:'patient',entityIdentifier:entry.patientId,summary:`Dental chart entry recorded for tooth ${entry.toothNumber}`});
    return mapChartEntry(this.db.get<Record<string,unknown>>('SELECT * FROM dental_chart_entries WHERE id=?',id)!);
  }

  prescriptions(patientId:string,clinicId:string):Prescription[]{
    this.ensurePatient(patientId,clinicId);
    return this.db.all<Record<string,unknown>>('SELECT * FROM prescriptions WHERE patient_id=? ORDER BY prescribed_at DESC',patientId).map((row)=>
      mapPrescription(row,this.db.all<Record<string,unknown>>('SELECT * FROM prescription_items WHERE prescription_id=? ORDER BY sort_order',String(row.id)).map(mapPrescriptionItem)));
  }

  createPrescription(clinicId:string,userId:string,userName:string,input:Omit<Prescription,'id'|'clinicId'|'prescriptionNumber'|'createdAt'>):Prescription{
    const patient=this.ensurePatient(input.patientId,clinicId);
    if (!Array.isArray(input.items)||input.items.length===0) throw new AppError('VALIDATION_ERROR','Add at least one medicine before saving the prescription.','items');
    if (input.items.length>100) throw new AppError('VALIDATION_ERROR','A prescription cannot contain more than 100 medicine lines.','items');
    if (input.visitId && !this.db.get('SELECT id FROM visits WHERE id=? AND patient_id=?',input.visitId,input.patientId)) throw new AppError('VISIT_NOT_FOUND','The selected visit does not belong to this patient.');
    const id=randomUUID(); const now=new Date().toISOString(); let number='';
    this.db.transaction(()=>{
      number=this.counters.next(clinicId,'prescription','RX',6,true);
      this.db.run(`INSERT INTO prescriptions(id,clinic_id,patient_id,visit_id,prescription_number,prescribed_at,provider_id,diagnosis,advice,follow_up_date,language,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,id,clinicId,input.patientId,input.visitId,number,input.prescribedAt||now,input.providerId||null,optionalText(input.diagnosis,4000),
      optionalText(input.advice,4000),optionalText(input.followUpDate,40),input.language==='bn'?'bn':'en',now);
      input.items.forEach((item,index)=>{
        this.db.run(`INSERT INTO prescription_items(id,prescription_id,medicine_name,generic_name,strength,dosage,frequency,duration,route,meal_timing,quantity,instructions,notes,sort_order)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,randomUUID(),id,assertText(item.medicineName,'Medicine name',2,200),optionalText(item.genericName,200),optionalText(item.strength,100),
        assertText(item.dosage,'Dosage',1,120),assertText(item.frequency,'Frequency',1,120),assertText(item.duration,'Duration',1,120),optionalText(item.route,80),
        optionalText(item.mealTiming,100),optionalText(item.quantity,80),optionalText(item.instructions,1000),optionalText(item.notes,1000),index);
      });
      this.audit.record({clinicId,userId,userName,action:'prescription_created',entityType:'prescription',entityIdentifier:number,summary:`Prescription ${number} created for patient ${patient.patient_code}`});
    });
    const row=this.db.get<Record<string,unknown>>('SELECT * FROM prescriptions WHERE id=?',id)!;
    return mapPrescription(row,this.db.all<Record<string,unknown>>('SELECT * FROM prescription_items WHERE prescription_id=? ORDER BY sort_order',id).map(mapPrescriptionItem));
  }

  private getVisit(id:string,clinicId:string):Visit{
    const row=this.db.get<Record<string,unknown>>(`SELECT v.*,p.full_name AS patient_name,p.patient_code,s.name AS provider_name FROM visits v JOIN patients p ON p.id=v.patient_id
      LEFT JOIN staff s ON s.id=v.provider_id WHERE v.id=? AND v.clinic_id=?`,id,clinicId);
    if(!row) throw new AppError('VISIT_NOT_FOUND','The clinical visit could not be found.');
    return mapVisit(row);
  }

  private ensurePatient(id:string,clinicId:string):{patient_code:string}{
    const patient=this.db.get<{patient_code:string}>('SELECT patient_code FROM patients WHERE id=? AND clinic_id=?',id,clinicId);
    if(!patient) throw new AppError('PATIENT_NOT_FOUND','The patient record could not be found.');
    return patient;
  }

  private validateVisit(input:VisitInput):VisitInput{
    const visited=new Date(input.visitedAt);
    if(Number.isNaN(visited.getTime())) throw new AppError('VALIDATION_ERROR','Select a valid visit date and time.','visitedAt');
    const status=['open','completed','cancelled'].includes(input.status)?input.status:'open';
    return {patientId:assertText(input.patientId,'Patient',30,50),appointmentId:input.appointmentId||null,providerId:input.providerId||null,visitedAt:input.visitedAt,
      chiefComplaint:optionalText(input.chiefComplaint,4000),reason:optionalText(input.reason,4000),symptoms:optionalText(input.symptoms,8000),clinicalFindings:optionalText(input.clinicalFindings,12_000),
      diagnosis:optionalText(input.diagnosis,8000),treatmentPlan:optionalText(input.treatmentPlan,12_000),treatmentPerformed:optionalText(input.treatmentPerformed,12_000),
      procedureDetails:optionalText(input.procedureDetails,12_000),materialsUsed:optionalText(input.materialsUsed,4000),followUpRecommendation:optionalText(input.followUpRecommendation,4000),
      nextVisitDate:optionalText(input.nextVisitDate,40),dentistNotes:optionalText(input.dentistNotes,12_000),assistantNotes:optionalText(input.assistantNotes,12_000),status};
  }
}
