import { randomUUID } from 'node:crypto';
import type { GenericListRequest, PageResult } from '../../shared/types.js';
import type { DentivaDatabase } from '../database/database.js';
import { mapAttachment, mapExpense, mapInventory, mapNotification, mapStaff, mapSupplier, mapTreatment } from '../database/mappers.js';
import type { AuditService } from '../security/security.js';
import { AppError, assertNonNegativeInteger, assertText, optionalText } from '../utils/errors.js';
import { CounterService, pageBounds } from './common.js';

export class RecordsService{
  private readonly counters:CounterService;
  constructor(private readonly db:DentivaDatabase,private readonly audit:AuditService){this.counters=new CounterService(db);}

  list(clinicId:string,request:GenericListRequest):PageResult<Record<string,unknown>>{
    const {page,pageSize,offset}=pageBounds(request.page,request.pageSize);
    const search=String(request.search??'').trim();const like=`%${search.replace(/[\\%_]/g,'\\$&')}%`;
    let rows:Record<string,unknown>[]=[];let total=0;
    switch(request.entity){
      case'expenses':{
        if(request.filters?.lookup==='categories'){
          rows=this.db.all<Record<string,unknown>>('SELECT id,name,active FROM expense_categories WHERE clinic_id=? AND active=1 ORDER BY sort_order,name',clinicId);
          return {items:rows,page:1,pageSize:rows.length||1,total:rows.length,totalPages:1};
        }
        const where=['e.clinic_id=?'];const params:Array<string|number>=[clinicId];
        if(search){where.push("(e.expense_number LIKE ? ESCAPE '\\' OR e.description LIKE ? ESCAPE '\\' OR e.payee LIKE ? ESCAPE '\\')");params.push(like,like,like);}
        if(typeof request.filters?.from==='string'){where.push('e.expense_date>=?');params.push(request.filters.from);}if(typeof request.filters?.to==='string'){where.push('e.expense_date<=?');params.push(request.filters.to);}
        const clause=where.join(' AND ');total=Number(this.db.get<{count:number}>(`SELECT count(*) AS count FROM expenses e WHERE ${clause}`,...params)?.count??0);
        rows=this.db.all<Record<string,unknown>>(`SELECT e.*,c.name AS category_name FROM expenses e JOIN expense_categories c ON c.id=e.category_id WHERE ${clause} ORDER BY e.expense_date DESC,e.created_at DESC LIMIT ? OFFSET ?`,...params,pageSize,offset).map((r)=>mapExpense(r) as unknown as Record<string,unknown>);break;
      }
      case'staff':{
        if(request.filters?.lookup==='providers'){rows=this.db.all<Record<string,unknown>>(`SELECT id,name,staff_code AS staffCode,role,status FROM staff WHERE clinic_id=? AND status='active' ORDER BY name`,clinicId);return{items:rows,page:1,pageSize:Math.max(1,rows.length),total:rows.length,totalPages:1};}
        if(request.filters?.lookup==='salaryHistory'&&typeof request.filters.staffId==='string'){rows=this.db.all<Record<string,unknown>>(`SELECT h.id,h.amount_minor AS amountMinor,h.frequency,h.effective_from AS effectiveFrom,h.effective_to AS effectiveTo,h.notes,h.created_at AS createdAt FROM staff_salary_history h JOIN staff s ON s.id=h.staff_id WHERE h.staff_id=? AND s.clinic_id=? ORDER BY h.effective_from DESC,h.created_at DESC`,request.filters.staffId,clinicId);return{items:rows,page:1,pageSize:Math.max(1,rows.length),total:rows.length,totalPages:1};}
        const where=['s.clinic_id=?'];const params:Array<string|number>=[clinicId];if(search){where.push("(s.name LIKE ? ESCAPE '\\' OR s.staff_code LIKE ? ESCAPE '\\' OR s.phone LIKE ? ESCAPE '\\' OR s.role LIKE ? ESCAPE '\\')");params.push(like,like,like,like);}
        const clause=where.join(' AND ');total=Number(this.db.get<{count:number}>(`SELECT count(*) AS count FROM staff s WHERE ${clause}`,...params)?.count??0);
        rows=this.db.all<Record<string,unknown>>(`SELECT * FROM staff s WHERE ${clause} ORDER BY s.status,s.name LIMIT ? OFFSET ?`,...params,pageSize,offset).map((r)=>mapStaff(r) as unknown as Record<string,unknown>);break;
      }
      case'inventory':{
        if(request.filters?.lookup==='categories'){
          rows=this.db.all<Record<string,unknown>>('SELECT id,name,active FROM inventory_categories WHERE clinic_id=? AND active=1 ORDER BY name',clinicId);
          return {items:rows,page:1,pageSize:rows.length||1,total:rows.length,totalPages:1};
        }
        const where=['i.clinic_id=?'];const params:Array<string|number>=[clinicId];if(search){where.push("(i.name LIKE ? ESCAPE '\\' OR i.sku LIKE ? ESCAPE '\\' OR i.batch_number LIKE ? ESCAPE '\\')");params.push(like,like,like);}
        if(request.filters?.lowStock===true)where.push('i.current_stock<=i.minimum_stock');if(request.filters?.expiring===true)where.push("i.expiry_date IS NOT NULL AND i.expiry_date<=date('now','+60 days')");
        const clause=where.join(' AND ');total=Number(this.db.get<{count:number}>(`SELECT count(*) AS count FROM inventory_items i WHERE ${clause}`,...params)?.count??0);
        rows=this.db.all<Record<string,unknown>>(`SELECT i.*,c.name AS category_name,s.name AS supplier_name FROM inventory_items i LEFT JOIN inventory_categories c ON c.id=i.category_id LEFT JOIN suppliers s ON s.id=i.supplier_id WHERE ${clause} ORDER BY (i.current_stock<=i.minimum_stock) DESC,i.name LIMIT ? OFFSET ?`,...params,pageSize,offset).map((r)=>mapInventory(r) as unknown as Record<string,unknown>);break;
      }
      case'suppliers':{
        const where=['clinic_id=?'];const params:Array<string|number>=[clinicId];if(search){where.push("(name LIKE ? ESCAPE '\\' OR contact_person LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')");params.push(like,like,like);}
        const clause=where.join(' AND ');total=Number(this.db.get<{count:number}>(`SELECT count(*) AS count FROM suppliers WHERE ${clause}`,...params)?.count??0);
        rows=this.db.all<Record<string,unknown>>(`SELECT * FROM suppliers WHERE ${clause} ORDER BY active DESC,name LIMIT ? OFFSET ?`,...params,pageSize,offset).map((r)=>mapSupplier(r) as unknown as Record<string,unknown>);break;
      }
      case'treatments':{
        const where=['clinic_id=?'];const params:Array<string|number>=[clinicId];if(search){where.push("(name LIKE ? ESCAPE '\\' OR code LIKE ? ESCAPE '\\' OR category LIKE ? ESCAPE '\\')");params.push(like,like,like);}
        const clause=where.join(' AND ');total=Number(this.db.get<{count:number}>(`SELECT count(*) AS count FROM treatment_catalog WHERE ${clause}`,...params)?.count??0);
        rows=this.db.all<Record<string,unknown>>(`SELECT * FROM treatment_catalog WHERE ${clause} ORDER BY active DESC,name LIMIT ? OFFSET ?`,...params,pageSize,offset).map((r)=>mapTreatment(r) as unknown as Record<string,unknown>);break;
      }
      case'notifications':{
        const where=['clinic_id=?'];const params:Array<string|number>=[clinicId];if(request.filters?.unread===true)where.push('is_read=0');
        const clause=where.join(' AND ');total=Number(this.db.get<{count:number}>(`SELECT count(*) AS count FROM notifications WHERE ${clause}`,...params)?.count??0);
        rows=this.db.all<Record<string,unknown>>(`SELECT * FROM notifications WHERE ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,...params,pageSize,offset).map((r)=>mapNotification(r) as unknown as Record<string,unknown>);break;
      }
      case'audit':{
        const where=['clinic_id=?'];const params:Array<string|number>=[clinicId];if(search){where.push("(action LIKE ? ESCAPE '\\' OR entity_identifier LIKE ? ESCAPE '\\' OR user_name LIKE ? ESCAPE '\\')");params.push(like,like,like);}
        const clause=where.join(' AND ');total=Number(this.db.get<{count:number}>(`SELECT count(*) AS count FROM audit_logs WHERE ${clause}`,...params)?.count??0);
        rows=this.db.all<Record<string,unknown>>(`SELECT id,timestamp,user_name AS userName,action,entity_type AS entityType,entity_identifier AS entityIdentifier,summary,outcome FROM audit_logs WHERE ${clause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,...params,pageSize,offset);break;
      }
      case'attachments':{
        const where=['a.clinic_id=?','a.archived_at IS NULL'];const params:Array<string|number>=[clinicId];if(search){where.push("(a.original_name LIKE ? ESCAPE '\\' OR a.description LIKE ? ESCAPE '\\' OR p.full_name LIKE ? ESCAPE '\\')");params.push(like,like,like);}
        const clause=where.join(' AND ');total=Number(this.db.get<{count:number}>(`SELECT count(*) AS count FROM attachments a LEFT JOIN patients p ON p.id=a.patient_id WHERE ${clause}`,...params)?.count??0);
        rows=this.db.all<Record<string,unknown>>(`SELECT a.*,p.full_name AS patient_name,p.patient_code FROM attachments a LEFT JOIN patients p ON p.id=a.patient_id WHERE ${clause} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,...params,pageSize,offset).map((r)=>({...mapAttachment(r),patientName:r.patient_name,patientCode:r.patient_code}) as unknown as Record<string,unknown>);break;
      }
      case'referrals':{
        const where=['r.clinic_id=?'];const params:Array<string|number>=[clinicId];if(search){where.push("(r.referral_number LIKE ? ESCAPE '\\' OR r.reason LIKE ? ESCAPE '\\' OR r.destination LIKE ? ESCAPE '\\' OR p.full_name LIKE ? ESCAPE '\\')");params.push(like,like,like,like);}if(typeof request.filters?.patientId==='string'){where.push('r.patient_id=?');params.push(request.filters.patientId);}const clause=where.join(' AND ');total=Number(this.db.get<{count:number}>(`SELECT count(*) AS count FROM referrals r JOIN patients p ON p.id=r.patient_id WHERE ${clause}`,...params)?.count??0);rows=this.db.all<Record<string,unknown>>(`SELECT r.id,r.clinic_id AS clinicId,r.patient_id AS patientId,r.visit_id AS visitId,r.referral_number AS referralNumber,r.reason,r.destination,r.provider,r.referral_date AS referralDate,r.response,r.outcome,r.status,r.notes,r.created_at AS createdAt,r.updated_at AS updatedAt,p.full_name AS patientName,p.patient_code AS patientCode FROM referrals r JOIN patients p ON p.id=r.patient_id WHERE ${clause} ORDER BY r.referral_date DESC,r.created_at DESC LIMIT ? OFFSET ?`,...params,pageSize,offset);break;
      }
      case'prescriptions':{
        const where=['r.clinic_id=?'];const params:Array<string|number>=[clinicId];if(search){where.push("(r.prescription_number LIKE ? ESCAPE '\\' OR p.full_name LIKE ? ESCAPE '\\' OR p.patient_code LIKE ? ESCAPE '\\')");params.push(like,like,like);}
        const clause=where.join(' AND ');total=Number(this.db.get<{count:number}>(`SELECT count(*) AS count FROM prescriptions r JOIN patients p ON p.id=r.patient_id WHERE ${clause}`,...params)?.count??0);
        rows=this.db.all<Record<string,unknown>>(`SELECT r.id,r.prescription_number AS prescriptionNumber,r.patient_id AS patientId,r.prescribed_at AS prescribedAt,r.diagnosis,r.language,p.full_name AS patientName,p.patient_code AS patientCode FROM prescriptions r JOIN patients p ON p.id=r.patient_id WHERE ${clause} ORDER BY r.prescribed_at DESC LIMIT ? OFFSET ?`,...params,pageSize,offset);break;
      }
      case'appointments':case'visits':case'invoices': throw new AppError('INVALID_OPERATION','Use the dedicated service for this record type.');
      default:throw new AppError('INVALID_OPERATION','Unsupported record type.');
    }
    return{items:rows,page,pageSize,total,totalPages:Math.max(1,Math.ceil(total/pageSize))};
  }

  create(clinicId:string,userId:string,userName:string,entity:GenericListRequest['entity'],input:Record<string,unknown>):Record<string,unknown>{
    const now=new Date().toISOString();const id=randomUUID();
    switch(entity){
      case'expenses':{
        const categoryId=assertText(input.categoryId,'Expense category',30,50);if(!this.db.get('SELECT id FROM expense_categories WHERE id=? AND clinic_id=?',categoryId,clinicId))throw new AppError('VALIDATION_ERROR','Select a valid expense category.');
        const amount=assertNonNegativeInteger(Number(input.amountMinor),'Expense amount');if(amount<=0)throw new AppError('VALIDATION_ERROR','Expense amount must be greater than zero.');
        const date=this.validDate(input.expenseDate,'Expense date');const description=assertText(input.description,'Description',2,1000);let number='';
        this.db.transaction(()=>{number=this.counters.next(clinicId,'expense','EXP',6,true);this.db.run(`INSERT INTO expenses(id,clinic_id,expense_number,category_id,amount_minor,expense_date,payee,method,reference,description,status,void_reason,created_at,created_by)
          VALUES(?,?,?,?,?,?,?,?,?,?,'recorded',NULL,?,?)`,id,clinicId,number,categoryId,amount,date,optionalText(input.payee,200),assertText(input.method??'Cash','Payment method',2,100),optionalText(input.reference,200),description,now,userId);
          this.audit.record({clinicId,userId,userName,action:'expense_created',entityType:'expense',entityIdentifier:number,summary:`Expense ${number} recorded`});});
        return mapExpense(this.db.get<Record<string,unknown>>('SELECT e.*,c.name AS category_name FROM expenses e JOIN expense_categories c ON c.id=e.category_id WHERE e.id=?',id)!) as unknown as Record<string,unknown>;
      }
      case'staff':{
        const name=assertText(input.name,'Staff name',2,180);let code='';
        this.db.transaction(()=>{code=typeof input.staffCode==='string'&&input.staffCode.trim()?input.staffCode.trim().toUpperCase():this.counters.next(clinicId,'staff','STF');
          this.db.run(`INSERT INTO staff(id,clinic_id,staff_code,name,photo_path,phone,email,role,responsibilities,joining_date,salary_minor,salary_frequency,working_hours,status,emergency_contact,address,notes,created_at,updated_at)
            VALUES(${Array(19).fill('?').join(',')})`,id,clinicId,code,name,null,optionalText(input.phone,40),optionalText(input.email,254),assertText(input.role,'Role',2,120),optionalText(input.responsibilities,2000),optionalText(input.joiningDate,40),
          input.salaryMinor===null||input.salaryMinor===undefined?null:assertNonNegativeInteger(Number(input.salaryMinor),'Salary'),optionalText(input.salaryFrequency,80),optionalText(input.workingHours,500),input.status==='inactive'?'inactive':'active',optionalText(input.emergencyContact,200),optionalText(input.address,1000),optionalText(input.notes,4000),now,now);const salary=input.salaryMinor===null||input.salaryMinor===undefined?null:assertNonNegativeInteger(Number(input.salaryMinor),'Salary');if(salary!==null)this.db.run('INSERT INTO staff_salary_history(id,staff_id,amount_minor,frequency,effective_from,effective_to,notes,created_at) VALUES(?,?,?,?,?,NULL,?,?)',randomUUID(),id,salary,optionalText(input.salaryFrequency,80)??'Monthly',optionalText(input.joiningDate,40)??now.slice(0,10),'Initial salary record',now);
          this.audit.record({clinicId,userId,userName,action:'staff_created',entityType:'staff',entityIdentifier:code,summary:`Staff record ${code} created`});});
        return mapStaff(this.db.get<Record<string,unknown>>('SELECT * FROM staff WHERE id=?',id)!) as unknown as Record<string,unknown>;
      }
      case'suppliers':{
        const name=assertText(input.name,'Supplier name',2,180);this.db.run(`INSERT INTO suppliers(id,clinic_id,name,contact_person,phone,email,address,notes,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?,?)`,id,clinicId,name,optionalText(input.contactPerson,180),optionalText(input.phone,40),optionalText(input.email,254),optionalText(input.address,1000),optionalText(input.notes,4000),now,now);
        this.audit.record({clinicId,userId,userName,action:'supplier_created',entityType:'supplier',entityIdentifier:id,summary:`Supplier ${name} created`});return mapSupplier(this.db.get<Record<string,unknown>>('SELECT * FROM suppliers WHERE id=?',id)!) as unknown as Record<string,unknown>;
      }
      case'referrals':{
        const patientId=assertText(input.patientId,'Patient',30,50);if(!this.db.get('SELECT id FROM patients WHERE id=? AND clinic_id=?',patientId,clinicId))throw new AppError('PATIENT_NOT_FOUND','Select a valid patient.');const visitId=typeof input.visitId==='string'&&input.visitId?input.visitId:null;if(visitId&&!this.db.get('SELECT id FROM visits WHERE id=? AND clinic_id=? AND patient_id=?',visitId,clinicId,patientId))throw new AppError('VISIT_NOT_FOUND','The selected visit is not available for this patient.');const reason=assertText(input.reason,'Referral reason',3,2000);const destination=assertText(input.destination,'Referral destination',2,300);const referralDate=this.validDate(input.referralDate,'Referral date');let number='';this.db.transaction(()=>{number=this.counters.next(clinicId,'referral','REF',6,true);this.db.run(`INSERT INTO referrals(id,clinic_id,patient_id,visit_id,referral_number,reason,destination,provider,referral_date,response,outcome,status,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,NULL,NULL,'open',?,?,?)`,id,clinicId,patientId,visitId,number,reason,destination,optionalText(input.provider,180),referralDate,optionalText(input.notes,2000),now,now);this.audit.record({clinicId,userId,userName,action:'referral_created',entityType:'referral',entityIdentifier:number,summary:`Referral ${number} created`});});return this.referral(id,clinicId);
      }
      case'treatments':{
        const code=assertText(input.code,'Treatment code',1,30).toUpperCase();const name=assertText(input.name,'Treatment name',2,180);const fee=assertNonNegativeInteger(Number(input.defaultFeeMinor??0),'Default fee');const tax=Number(input.taxRate??0);if(!Number.isFinite(tax)||tax<0||tax>100)throw new AppError('VALIDATION_ERROR','Tax rate must be between 0 and 100.');const duration=input.durationMinutes?Number(input.durationMinutes):null;if(duration!==null&&(!Number.isInteger(duration)||duration<1||duration>1440))throw new AppError('VALIDATION_ERROR','Duration must be between 1 and 1440 minutes.');
        this.db.run(`INSERT INTO treatment_catalog(id,clinic_id,code,name,category,default_fee_minor,duration_minutes,description,tax_rate,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)`,id,clinicId,code,name,optionalText(input.category,120),fee,duration,optionalText(input.description,2000),tax,now,now);
        this.audit.record({clinicId,userId,userName,action:'treatment_created',entityType:'treatment',entityIdentifier:code,summary:`Treatment ${code} created`});return mapTreatment(this.db.get<Record<string,unknown>>('SELECT * FROM treatment_catalog WHERE id=?',id)!) as unknown as Record<string,unknown>;
      }
      case'inventory':return this.createInventory(clinicId,userId,userName,input,id,now);
      default:throw new AppError('INVALID_OPERATION','This record type cannot be created from this screen.');
    }
  }

  update(clinicId:string,userId:string,userName:string,entity:GenericListRequest['entity'],id:string,input:Record<string,unknown>):Record<string,unknown>{
    const now=new Date().toISOString();
    switch(entity){
      case'staff':{
        const current=this.db.get<Record<string,unknown>>('SELECT * FROM staff WHERE id=? AND clinic_id=?',id,clinicId);if(!current)throw new AppError('NOT_FOUND','Staff record not found.');const salary=input.salaryMinor===null?null:assertNonNegativeInteger(Number(input.salaryMinor??current.salary_minor??0),'Salary');const frequency=optionalText(input.salaryFrequency??current.salary_frequency,80);const salaryChanged=salary!==((current.salary_minor===null||current.salary_minor===undefined)?null:Number(current.salary_minor))||frequency!==(current.salary_frequency?String(current.salary_frequency):null);const effectiveFrom=optionalText(input.salaryEffectiveFrom,40)??now.slice(0,10);
        this.db.transaction(()=>{this.db.run(`UPDATE staff SET name=?,phone=?,email=?,role=?,responsibilities=?,joining_date=?,salary_minor=?,salary_frequency=?,working_hours=?,status=?,emergency_contact=?,address=?,notes=?,updated_at=? WHERE id=?`,
          assertText(input.name??current.name,'Staff name',2,180),optionalText(input.phone??current.phone,40),optionalText(input.email??current.email,254),assertText(input.role??current.role,'Role',2,120),optionalText(input.responsibilities??current.responsibilities,2000),optionalText(input.joiningDate??current.joining_date,40),salary,frequency,optionalText(input.workingHours??current.working_hours,500),input.status==='inactive'?'inactive':'active',optionalText(input.emergencyContact??current.emergency_contact,200),optionalText(input.address??current.address,1000),optionalText(input.notes??current.notes,4000),now,id);if(salaryChanged){this.db.run('UPDATE staff_salary_history SET effective_to=? WHERE staff_id=? AND effective_to IS NULL',effectiveFrom,id);if(salary!==null)this.db.run('INSERT INTO staff_salary_history(id,staff_id,amount_minor,frequency,effective_from,effective_to,notes,created_at) VALUES(?,?,?,?,?,NULL,?,?)',randomUUID(),id,salary,frequency??'Monthly',effectiveFrom,optionalText(input.salaryChangeNotes,1000),now);}this.audit.record({clinicId,userId,userName,action:'staff_updated',entityType:'staff',entityIdentifier:String(current.staff_code),summary:`Staff record ${String(current.staff_code)} updated${salaryChanged?' with salary history':''}`});});return mapStaff(this.db.get<Record<string,unknown>>('SELECT * FROM staff WHERE id=?',id)!) as unknown as Record<string,unknown>;
      }
      case'suppliers':{
        const current=this.db.get<Record<string,unknown>>('SELECT * FROM suppliers WHERE id=? AND clinic_id=?',id,clinicId);if(!current)throw new AppError('NOT_FOUND','Supplier not found.');
        this.db.run('UPDATE suppliers SET name=?,contact_person=?,phone=?,email=?,address=?,notes=?,active=?,updated_at=? WHERE id=?',assertText(input.name??current.name,'Supplier name',2,180),optionalText(input.contactPerson??current.contact_person,180),optionalText(input.phone??current.phone,40),optionalText(input.email??current.email,254),optionalText(input.address??current.address,1000),optionalText(input.notes??current.notes,4000),input.active===false?0:1,now,id);return mapSupplier(this.db.get<Record<string,unknown>>('SELECT * FROM suppliers WHERE id=?',id)!) as unknown as Record<string,unknown>;
      }
      case'referrals':{
        const current=this.db.get<Record<string,unknown>>('SELECT * FROM referrals WHERE id=? AND clinic_id=?',id,clinicId);if(!current)throw new AppError('NOT_FOUND','Referral not found.');const status=['open','completed','cancelled'].includes(String(input.status))?String(input.status):String(current.status);this.db.run('UPDATE referrals SET reason=?,destination=?,provider=?,referral_date=?,response=?,outcome=?,status=?,notes=?,updated_at=? WHERE id=?',assertText(input.reason??current.reason,'Referral reason',3,2000),assertText(input.destination??current.destination,'Referral destination',2,300),optionalText(input.provider??current.provider,180),this.validDate(input.referralDate??current.referral_date,'Referral date'),optionalText(input.response??current.response,2000),optionalText(input.outcome??current.outcome,2000),status,optionalText(input.notes??current.notes,2000),now,id);this.audit.record({clinicId,userId,userName,action:'referral_updated',entityType:'referral',entityIdentifier:String(current.referral_number),summary:`Referral ${String(current.referral_number)} updated to ${status}`});return this.referral(id,clinicId);
      }
      case'treatments':{
        const current=this.db.get<Record<string,unknown>>('SELECT * FROM treatment_catalog WHERE id=? AND clinic_id=?',id,clinicId);if(!current)throw new AppError('NOT_FOUND','Treatment not found.');
        const tax=Number(input.taxRate??current.tax_rate);if(!Number.isFinite(tax)||tax<0||tax>100)throw new AppError('VALIDATION_ERROR','Tax rate must be between 0 and 100.');const duration=input.durationMinutes?Number(input.durationMinutes):null;if(duration!==null&&(!Number.isInteger(duration)||duration<1||duration>1440))throw new AppError('VALIDATION_ERROR','Duration must be between 1 and 1440 minutes.');this.db.run('UPDATE treatment_catalog SET code=?,name=?,category=?,default_fee_minor=?,duration_minutes=?,description=?,tax_rate=?,active=?,updated_at=? WHERE id=?',assertText(input.code??current.code,'Treatment code',1,30).toUpperCase(),assertText(input.name??current.name,'Treatment name',2,180),optionalText(input.category??current.category,120),assertNonNegativeInteger(Number(input.defaultFeeMinor??current.default_fee_minor),'Default fee'),duration,optionalText(input.description??current.description,2000),tax,input.active===false?0:1,now,id);this.audit.record({clinicId,userId,userName,action:'treatment_updated',entityType:'treatment',entityIdentifier:String(current.code),summary:`Treatment ${String(current.code)} updated`});return mapTreatment(this.db.get<Record<string,unknown>>('SELECT * FROM treatment_catalog WHERE id=?',id)!) as unknown as Record<string,unknown>;
      }
      case'inventory':return this.updateInventory(clinicId,userId,userName,id,input,now);
      case'expenses':{
        const expense=this.db.get<Record<string,unknown>>('SELECT * FROM expenses WHERE id=? AND clinic_id=?',id,clinicId);if(!expense)throw new AppError('NOT_FOUND','Expense not found.');
        if(input.status==='void'){const reason=assertText(input.voidReason,'Void reason',5,1000);this.db.run("UPDATE expenses SET status='void',void_reason=? WHERE id=?",reason,id);this.audit.record({clinicId,userId,userName,action:'expense_voided',entityType:'expense',entityIdentifier:String(expense.expense_number),summary:`Expense ${String(expense.expense_number)} voided`});}
        else throw new AppError('INVALID_OPERATION','Recorded expenses are immutable. Void the record and create a corrected expense.');
        return mapExpense(this.db.get<Record<string,unknown>>('SELECT e.*,c.name AS category_name FROM expenses e JOIN expense_categories c ON c.id=e.category_id WHERE e.id=?',id)!) as unknown as Record<string,unknown>;
      }
      default:throw new AppError('INVALID_OPERATION','This record type cannot be edited from this screen.');
    }
  }

  private createInventory(clinicId:string,userId:string,userName:string,input:Record<string,unknown>,id:string,now:string):Record<string,unknown>{
    if(input.operation==='transaction')return this.stockTransaction(clinicId,userId,userName,input,id,now);
    const sku=assertText(input.sku,'SKU / code',1,50).toUpperCase();const name=assertText(input.name,'Item name',2,180);const stock=Number(input.currentStock??0);const minimum=Number(input.minimumStock??0);if(!Number.isFinite(stock)||stock<0||!Number.isFinite(minimum)||minimum<0)throw new AppError('VALIDATION_ERROR','Stock values cannot be negative.');
    this.db.transaction(()=>{let categoryId=typeof input.categoryId==='string'&&input.categoryId?input.categoryId:null;const categoryName=optionalText(input.categoryName,120);if(!categoryId&&categoryName){const existing=this.db.get<{id:string}>('SELECT id FROM inventory_categories WHERE clinic_id=? AND name=? COLLATE NOCASE',clinicId,categoryName);categoryId=existing?.id??randomUUID();if(!existing)this.db.run('INSERT INTO inventory_categories(id,clinic_id,name,active) VALUES(?,?,?,1)',categoryId,clinicId,categoryName);}const supplierId=typeof input.supplierId==='string'&&input.supplierId?input.supplierId:null;this.db.run(`INSERT INTO inventory_items(id,clinic_id,sku,name,category_id,unit,current_stock,minimum_stock,purchase_price_minor,supplier_id,expiry_date,batch_number,location,notes,active,created_at,updated_at)
      VALUES(${Array(17).fill('?').join(',')})`,id,clinicId,sku,name,categoryId,assertText(input.unit,'Unit',1,40),stock,minimum,assertNonNegativeInteger(Number(input.purchasePriceMinor??0),'Purchase price'),supplierId,optionalText(input.expiryDate,40),optionalText(input.batchNumber,100),optionalText(input.location,160),optionalText(input.notes,2000),1,now,now);
      if(stock>0)this.db.run(`INSERT INTO inventory_transactions(id,inventory_item_id,transaction_type,quantity,previous_stock,resulting_stock,unit_cost_minor,reference,notes,transaction_at,created_by) VALUES(?,?,'stock_in',?,0,?,?,?,?,?,?)`,randomUUID(),id,stock,stock,input.purchasePriceMinor?Number(input.purchasePriceMinor):null,null,'Opening stock',now,userId);
      this.audit.record({clinicId,userId,userName,action:'inventory_item_created',entityType:'inventory',entityIdentifier:sku,summary:`Inventory item ${sku} created`});});
    return mapInventory(this.db.get<Record<string,unknown>>(`SELECT i.*,c.name AS category_name,s.name AS supplier_name FROM inventory_items i LEFT JOIN inventory_categories c ON c.id=i.category_id LEFT JOIN suppliers s ON s.id=i.supplier_id WHERE i.id=?`,id)!) as unknown as Record<string,unknown>;
  }

  private stockTransaction(clinicId:string,userId:string,userName:string,input:Record<string,unknown>,id:string,now:string):Record<string,unknown>{
    const itemId=assertText(input.inventoryItemId,'Inventory item',30,50);const item=this.db.get<Record<string,unknown>>('SELECT * FROM inventory_items WHERE id=? AND clinic_id=?',itemId,clinicId);if(!item)throw new AppError('NOT_FOUND','Inventory item not found.');
    const kind=String(input.transactionType);if(!['stock_in','stock_out','adjustment','wastage'].includes(kind))throw new AppError('VALIDATION_ERROR','Select a valid stock movement type.');
    const quantity=Number(input.quantity);if(!Number.isFinite(quantity)||quantity<=0)throw new AppError('VALIDATION_ERROR','Stock movement quantity must be greater than zero.');
    const previous=Number(item.current_stock);let result=previous;if(kind==='stock_in')result+=quantity;else if(kind==='stock_out'||kind==='wastage')result-=quantity;else result=quantity;
    if(result<0)throw new AppError('INSUFFICIENT_STOCK','This stock movement would make available stock negative.');
    this.db.transaction(()=>{this.db.run('UPDATE inventory_items SET current_stock=?,updated_at=? WHERE id=?',result,now,itemId);this.db.run(`INSERT INTO inventory_transactions(id,inventory_item_id,transaction_type,quantity,previous_stock,resulting_stock,unit_cost_minor,reference,notes,transaction_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,id,itemId,kind,quantity,previous,result,input.unitCostMinor===undefined?null:assertNonNegativeInteger(Number(input.unitCostMinor),'Unit cost'),optionalText(input.reference,200),optionalText(input.notes,1000),now,userId);
      this.audit.record({clinicId,userId,userName,action:'inventory_adjusted',entityType:'inventory',entityIdentifier:String(item.sku),summary:`Inventory ${String(item.sku)} ${kind.replace('_',' ')} recorded`});});
    return mapInventory(this.db.get<Record<string,unknown>>('SELECT i.*,NULL AS category_name,NULL AS supplier_name FROM inventory_items i WHERE i.id=?',itemId)!) as unknown as Record<string,unknown>;
  }

  private updateInventory(clinicId:string,userId:string,userName:string,id:string,input:Record<string,unknown>,now:string):Record<string,unknown>{
    if(input.operation==='transaction')return this.stockTransaction(clinicId,userId,userName,{...input,inventoryItemId:id},randomUUID(),now);
    const current=this.db.get<Record<string,unknown>>('SELECT * FROM inventory_items WHERE id=? AND clinic_id=?',id,clinicId);if(!current)throw new AppError('NOT_FOUND','Inventory item not found.');
    this.db.run(`UPDATE inventory_items SET sku=?,name=?,category_id=?,unit=?,minimum_stock=?,purchase_price_minor=?,supplier_id=?,expiry_date=?,batch_number=?,location=?,notes=?,active=?,updated_at=? WHERE id=?`,
      assertText(input.sku??current.sku,'SKU / code',1,50).toUpperCase(),assertText(input.name??current.name,'Item name',2,180),typeof input.categoryId==='string'?input.categoryId:(current.category_id as string|null),assertText(input.unit??current.unit,'Unit',1,40),Number(input.minimumStock??current.minimum_stock),assertNonNegativeInteger(Number(input.purchasePriceMinor??current.purchase_price_minor),'Purchase price'),typeof input.supplierId==='string'?input.supplierId:(current.supplier_id as string|null),optionalText(input.expiryDate??current.expiry_date,40),optionalText(input.batchNumber??current.batch_number,100),optionalText(input.location??current.location,160),optionalText(input.notes??current.notes,2000),input.active===false?0:1,now,id);
    this.audit.record({clinicId,userId,userName,action:'inventory_item_updated',entityType:'inventory',entityIdentifier:String(current.sku),summary:`Inventory item ${String(current.sku)} updated`});
    return mapInventory(this.db.get<Record<string,unknown>>('SELECT i.*,NULL AS category_name,NULL AS supplier_name FROM inventory_items i WHERE i.id=?',id)!) as unknown as Record<string,unknown>;
  }

  private referral(id:string,clinicId:string):Record<string,unknown>{const row=this.db.get<Record<string,unknown>>(`SELECT r.id,r.clinic_id AS clinicId,r.patient_id AS patientId,r.visit_id AS visitId,r.referral_number AS referralNumber,r.reason,r.destination,r.provider,r.referral_date AS referralDate,r.response,r.outcome,r.status,r.notes,r.created_at AS createdAt,r.updated_at AS updatedAt,p.full_name AS patientName,p.patient_code AS patientCode FROM referrals r JOIN patients p ON p.id=r.patient_id WHERE r.id=? AND r.clinic_id=?`,id,clinicId);if(!row)throw new AppError('NOT_FOUND','Referral not found.');return row;}

  private validDate(value:unknown,label:string):string{if(typeof value!=='string'||Number.isNaN(Date.parse(value)))throw new AppError('VALIDATION_ERROR',`${label} is invalid.`);return value;}
}
