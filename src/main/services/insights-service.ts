import type { DashboardData, DateRange, NotificationRecord, ReportSummary, SearchResult } from '../../shared/types.js';
import type { DentivaDatabase } from '../database/database.js';
import { mapAppointment, mapNotification, mapPatient } from '../database/mappers.js';
import { AppError } from '../utils/errors.js';
import { escapeLike, ftsQuery } from './common.js';

function rangeValues(range:DateRange):{from:string;to:string}{
  if(!range||typeof range.from!=='string'||typeof range.to!=='string'||Number.isNaN(Date.parse(range.from))||Number.isNaN(Date.parse(range.to)))throw new AppError('VALIDATION_ERROR','Select a valid date range.');
  if(range.from>range.to)throw new AppError('VALIDATION_ERROR','The start date must be before the end date.');
  return{from:range.from.slice(0,10),to:range.to.slice(0,10)};
}

export class InsightsService{
  constructor(private readonly db:DentivaDatabase){}

  dashboard(clinicId:string,range:DateRange):DashboardData{
    const {from,to}=rangeValues(range);const between=' BETWEEN ? AND ?';
    const patients=Number(this.db.get<{n:number}>(`SELECT count(*) AS n FROM patients WHERE clinic_id=? AND registration_date${between} AND status!='archived'`,clinicId,from,to)?.n??0);
    const appointments=Number(this.db.get<{n:number}>(`SELECT count(*) AS n FROM appointments WHERE clinic_id=? AND substr(start_at,1,10)${between}`,clinicId,from,to)?.n??0);
    const waiting=Number(this.db.get<{n:number}>(`SELECT count(*) AS n FROM appointments WHERE clinic_id=? AND substr(start_at,1,10)${between} AND status='waiting'`,clinicId,from,to)?.n??0);
    const completedConsultations=Number(this.db.get<{n:number}>(`SELECT count(*) AS n FROM visits WHERE clinic_id=? AND substr(visited_at,1,10)${between} AND status='completed'`,clinicId,from,to)?.n??0);
    const followUpsDue=Number(this.db.get<{n:number}>(`SELECT count(*) AS n FROM visits WHERE clinic_id=? AND substr(next_visit_date,1,10)${between} AND status='completed'`,clinicId,from,to)?.n??0);
    const unpaidInvoices=Number(this.db.get<{n:number}>(`SELECT count(*) AS n FROM invoices WHERE clinic_id=? AND substr(issued_at,1,10)${between} AND due_minor>0 AND status!='void'`,clinicId,from,to)?.n??0);
    const revenue=Number(this.db.get<{n:number}>(`SELECT coalesce(sum(amount_minor),0) AS n FROM payments WHERE clinic_id=? AND substr(paid_at,1,10)${between} AND voided_at IS NULL`,clinicId,from,to)?.n??0);
    const refunds=Number(this.db.get<{n:number}>(`SELECT coalesce(sum(amount_minor),0) AS n FROM refunds WHERE clinic_id=? AND substr(refunded_at,1,10)${between}`,clinicId,from,to)?.n??0);
    const outstandingMinor=Number(this.db.get<{n:number}>(`SELECT coalesce(sum(due_minor),0) AS n FROM invoices WHERE clinic_id=? AND substr(issued_at,1,10)${between} AND status!='void'`,clinicId,from,to)?.n??0);
    const now=this.localDateTime();
    const upcomingAppointments=this.db.all<Record<string,unknown>>(`SELECT a.*,p.patient_code,p.full_name AS patient_name,s.name AS dentist_name FROM appointments a JOIN patients p ON p.id=a.patient_id LEFT JOIN staff s ON s.id=a.dentist_id WHERE a.clinic_id=? AND substr(a.start_at,1,10) BETWEEN ? AND ? AND a.start_at>=? AND a.status IN ('scheduled','confirmed','waiting','in_consultation') ORDER BY a.start_at LIMIT 8`,clinicId,from,to,now).map(mapAppointment);
    const recentPatients=this.db.all<Record<string,unknown>>(`SELECT * FROM patients WHERE clinic_id=? AND registration_date BETWEEN ? AND ? AND status!='archived' ORDER BY created_at DESC LIMIT 6`,clinicId,from,to).map(mapPatient);
    const followUps=this.db.all<{patient_id:string;patient_code:string;patient_name:string;due_date:string}>(`SELECT v.patient_id,p.patient_code,p.full_name AS patient_name,v.next_visit_date AS due_date FROM visits v JOIN patients p ON p.id=v.patient_id WHERE v.clinic_id=? AND substr(v.next_visit_date,1,10) BETWEEN ? AND ? AND v.status='completed' ORDER BY v.next_visit_date LIMIT 8`,clinicId,from,to).map((r)=>({patientId:r.patient_id,patientCode:r.patient_code,patientName:r.patient_name,dueDate:r.due_date}));
    const lowStock=this.db.all<{id:string;name:string;current_stock:number;minimum_stock:number;unit:string}>(`SELECT id,name,current_stock,minimum_stock,unit FROM inventory_items WHERE clinic_id=? AND active=1 AND current_stock<=minimum_stock ORDER BY (minimum_stock-current_stock) DESC LIMIT 8`,clinicId).map((r)=>({id:r.id,name:r.name,currentStock:Number(r.current_stock),minimumStock:Number(r.minimum_stock),unit:r.unit}));
    return{range:{...range,from,to},patients,appointments,waiting,completedConsultations,followUpsDue,unpaidInvoices,revenueMinor:revenue-refunds,outstandingMinor,upcomingAppointments,recentPatients,followUps,lowStock};
  }

  report(clinicId:string,range:DateRange):ReportSummary{
    const {from,to}=rangeValues(range);const payments=Number(this.db.get<{n:number}>(`SELECT coalesce(sum(amount_minor),0) AS n FROM payments WHERE clinic_id=? AND substr(paid_at,1,10) BETWEEN ? AND ? AND voided_at IS NULL`,clinicId,from,to)?.n??0);
    const refunds=Number(this.db.get<{n:number}>(`SELECT coalesce(sum(amount_minor),0) AS n FROM refunds WHERE clinic_id=? AND substr(refunded_at,1,10) BETWEEN ? AND ?`,clinicId,from,to)?.n??0);
    const expenses=Number(this.db.get<{n:number}>(`SELECT coalesce(sum(amount_minor),0) AS n FROM expenses WHERE clinic_id=? AND expense_date BETWEEN ? AND ? AND status='recorded'`,clinicId,from,to)?.n??0);
    const receivables=Number(this.db.get<{n:number}>(`SELECT coalesce(sum(due_minor),0) AS n FROM invoices WHERE clinic_id=? AND substr(issued_at,1,10) BETWEEN ? AND ? AND status!='void'`,clinicId,from,to)?.n??0);
    const newPatients=Number(this.db.get<{n:number}>(`SELECT count(*) AS n FROM patients WHERE clinic_id=? AND registration_date BETWEEN ? AND ? AND status!='archived'`,clinicId,from,to)?.n??0);
    const visits=Number(this.db.get<{n:number}>(`SELECT count(*) AS n FROM visits WHERE clinic_id=? AND substr(visited_at,1,10) BETWEEN ? AND ?`,clinicId,from,to)?.n??0);
    const appointments=Number(this.db.get<{n:number}>(`SELECT count(*) AS n FROM appointments WHERE clinic_id=? AND substr(start_at,1,10) BETWEEN ? AND ?`,clinicId,from,to)?.n??0);
    const paymentMethods=this.db.all<{method:string;amount_minor:number;count:number}>(`SELECT method,sum(amount_minor) AS amount_minor,count(*) AS count FROM payments WHERE clinic_id=? AND substr(paid_at,1,10) BETWEEN ? AND ? AND voided_at IS NULL GROUP BY method ORDER BY amount_minor DESC`,clinicId,from,to).map((r)=>({method:r.method,amountMinor:Number(r.amount_minor),count:Number(r.count)}));
    const expenseCategories=this.db.all<{category:string;amount_minor:number;count:number}>(`SELECT c.name AS category,sum(e.amount_minor) AS amount_minor,count(*) AS count FROM expenses e JOIN expense_categories c ON c.id=e.category_id WHERE e.clinic_id=? AND e.expense_date BETWEEN ? AND ? AND e.status='recorded' GROUP BY c.id,c.name ORDER BY amount_minor DESC`,clinicId,from,to).map((r)=>({category:r.category,amountMinor:Number(r.amount_minor),count:Number(r.count)}));
    const daily=this.db.all<{date:string;revenue_minor:number;expense_minor:number;visits:number}>(`WITH dates AS (
      SELECT substr(paid_at,1,10) AS date FROM payments WHERE clinic_id=? AND substr(paid_at,1,10) BETWEEN ? AND ?
      UNION SELECT expense_date FROM expenses WHERE clinic_id=? AND expense_date BETWEEN ? AND ?
      UNION SELECT substr(visited_at,1,10) FROM visits WHERE clinic_id=? AND substr(visited_at,1,10) BETWEEN ? AND ?)
      SELECT d.date,
      coalesce((SELECT sum(p.amount_minor) FROM payments p WHERE p.clinic_id=? AND substr(p.paid_at,1,10)=d.date AND p.voided_at IS NULL),0)-coalesce((SELECT sum(r.amount_minor) FROM refunds r WHERE r.clinic_id=? AND substr(r.refunded_at,1,10)=d.date),0) AS revenue_minor,
      coalesce((SELECT sum(e.amount_minor) FROM expenses e WHERE e.clinic_id=? AND e.expense_date=d.date AND e.status='recorded'),0) AS expense_minor,
      coalesce((SELECT count(*) FROM visits v WHERE v.clinic_id=? AND substr(v.visited_at,1,10)=d.date),0) AS visits
      FROM dates d ORDER BY d.date`,clinicId,from,to,clinicId,from,to,clinicId,from,to,clinicId,clinicId,clinicId,clinicId).map((r)=>({date:r.date,revenueMinor:Number(r.revenue_minor),expensesMinor:Number(r.expense_minor),visits:Number(r.visits)}));
    return{range:{...range,from,to},revenueMinor:payments-refunds,expensesMinor:expenses,refundsMinor:refunds,netMinor:payments-refunds-expenses,receivablesMinor:receivables,newPatients,visits,appointments,paymentMethods,expenseCategories,daily};
  }

  globalSearch(clinicId:string,query:string,permissions?:readonly string[]):SearchResult[]{
    const q=query.trim();if(q.length<2)return[];const like=`%${escapeLike(q)}%`;const results:SearchResult[]=[];const allowed=(permission:string)=>!permissions||permissions.includes(permission);
    if(allowed('patients.view'))try{for(const r of this.db.all<{id:string;patient_code:string;full_name:string;phone:string;updated_at:string}>(`SELECT p.id,p.patient_code,p.full_name,p.phone,p.updated_at FROM patients p WHERE p.clinic_id=? AND p.status!='archived' AND p.id IN (SELECT patient_id FROM patients_fts WHERE patients_fts MATCH ?) LIMIT 8`,clinicId,ftsQuery(q)))results.push({type:'patient',id:r.id,title:r.full_name,identifier:r.patient_code,context:r.phone,date:r.updated_at});}catch{/* LIKE fallbacks below cover unusual FTS input. */}
    if(allowed('appointments.view'))for(const r of this.db.all<{id:string;appointment_code:string;full_name:string;start_at:string;status:string}>(`SELECT a.id,a.appointment_code,p.full_name,a.start_at,a.status FROM appointments a JOIN patients p ON p.id=a.patient_id WHERE a.clinic_id=? AND (a.appointment_code LIKE ? ESCAPE '\\' OR p.full_name LIKE ? ESCAPE '\\') ORDER BY a.start_at DESC LIMIT 5`,clinicId,like,like))results.push({type:'appointment',id:r.id,title:r.full_name,identifier:r.appointment_code,context:r.status.replace('_',' '),date:r.start_at});
    if(allowed('billing.view'))for(const r of this.db.all<{id:string;invoice_number:string;full_name:string;issued_at:string;status:string}>(`SELECT i.id,i.invoice_number,p.full_name,i.issued_at,i.status FROM invoices i JOIN patients p ON p.id=i.patient_id WHERE i.clinic_id=? AND (i.invoice_number LIKE ? ESCAPE '\\' OR p.full_name LIKE ? ESCAPE '\\') ORDER BY i.issued_at DESC LIMIT 5`,clinicId,like,like))results.push({type:'invoice',id:r.id,title:r.full_name,identifier:r.invoice_number,context:r.status.replace('_',' '),date:r.issued_at});
    if(allowed('documents.manage'))for(const r of this.db.all<{id:string;original_name:string;patient_name:string|null;created_at:string;category:string}>(`SELECT a.id,a.original_name,p.full_name AS patient_name,a.created_at,a.category FROM attachments a LEFT JOIN patients p ON p.id=a.patient_id WHERE a.clinic_id=? AND a.archived_at IS NULL AND (a.original_name LIKE ? ESCAPE '\\' OR a.description LIKE ? ESCAPE '\\') ORDER BY a.created_at DESC LIMIT 5`,clinicId,like,like))results.push({type:'document',id:r.id,title:r.original_name,identifier:r.category,context:r.patient_name??'Clinic document',date:r.created_at});
    if(allowed('staff.manage'))for(const r of this.db.all<{id:string;staff_code:string;name:string;role:string;joining_date:string|null}>(`SELECT id,staff_code,name,role,joining_date FROM staff WHERE clinic_id=? AND (name LIKE ? ESCAPE '\\' OR staff_code LIKE ? ESCAPE '\\') LIMIT 5`,clinicId,like,like))results.push({type:'staff',id:r.id,title:r.name,identifier:r.staff_code,context:r.role,date:r.joining_date});
    if(allowed('inventory.view'))for(const r of this.db.all<{id:string;sku:string;name:string;current_stock:number;unit:string}>(`SELECT id,sku,name,current_stock,unit FROM inventory_items WHERE clinic_id=? AND (name LIKE ? ESCAPE '\\' OR sku LIKE ? ESCAPE '\\') LIMIT 5`,clinicId,like,like))results.push({type:'inventory',id:r.id,title:r.name,identifier:r.sku,context:`${r.current_stock} ${r.unit} in stock`,date:null});
    return results.slice(0,30);
  }

  notifications(clinicId:string):NotificationRecord[]{if(!this.settingBoolean(clinicId,'notificationsEnabled',true))return[];return this.db.all<Record<string,unknown>>('SELECT * FROM notifications WHERE clinic_id=? AND (expires_at IS NULL OR expires_at>?) ORDER BY is_read,created_at DESC LIMIT 100',clinicId,new Date().toISOString()).map(mapNotification);}
  markRead(clinicId:string,id?:string):void{const now=new Date().toISOString();if(id)this.db.run('UPDATE notifications SET is_read=1,read_at=? WHERE id=? AND clinic_id=?',now,id,clinicId);else this.db.run('UPDATE notifications SET is_read=1,read_at=? WHERE clinic_id=? AND is_read=0',now,clinicId);}

  generateOperationalNotifications(clinicId:string):void{
    if(!this.settingBoolean(clinicId,'notificationsEnabled',true))return;
    const today=this.localDateTime().slice(0,10);const now=new Date().toISOString();const language=this.db.get<{value_json:string}>("SELECT value_json FROM app_settings WHERE clinic_id=? AND key='language'",clinicId);let bengali=false;try{bengali=Boolean(language&&JSON.parse(language.value_json)==='bn');}catch{/* retain English */}
    if(this.settingBoolean(clinicId,'lowStockNotifications',true)){
      const low=Number(this.db.get<{n:number}>('SELECT count(*) AS n FROM inventory_items WHERE clinic_id=? AND active=1 AND current_stock<=minimum_stock',clinicId)?.n??0);
      if(low>0)this.upsertNotification(clinicId,`low-stock-${today}`,'low_stock','warning',bengali?'ইনভেন্টরিতে নজর দেওয়া প্রয়োজন':'Inventory attention required',bengali?`${low}টি পণ্যের মজুত ন্যূনতম সীমায় বা তার নিচে রয়েছে।`:`${low} inventory item${low===1?' is':'s are'} at or below minimum stock.`,now);
    }
    if(this.settingBoolean(clinicId,'appointmentNotifications',true)){
      const appointments=Number(this.db.get<{n:number}>(`SELECT count(*) AS n FROM appointments WHERE clinic_id=? AND substr(start_at,1,10)=? AND status IN ('scheduled','confirmed','waiting','in_consultation')`,clinicId,today)?.n??0);
      if(appointments>0)this.upsertNotification(clinicId,`appointments-${today}`,'appointment_reminder','info',bengali?'আজকের অ্যাপয়েন্টমেন্ট':'Today’s appointments',bengali?`আজ ${appointments}টি সক্রিয় অ্যাপয়েন্টমেন্ট রয়েছে।`:`${appointments} active appointment${appointments===1?' is':'s are'} scheduled today.`,now);
    }
    const overdue=Number(this.db.get<{n:number}>(`SELECT count(*) AS n FROM invoices WHERE clinic_id=? AND status NOT IN ('draft','paid','void') AND due_minor>0 AND due_at IS NOT NULL AND due_at<?`,clinicId,today)?.n??0);
    if(overdue>0)this.upsertNotification(clinicId,`overdue-invoices-${today}`,'payment_due','warning',bengali?'বকেয়া ইনভয়েস পর্যালোচনা করুন':'Review overdue invoices',bengali?`${overdue}টি ইনভয়েসের নির্ধারিত তারিখ পেরিয়েছে এবং বকেয়া রয়েছে।`:`${overdue} invoice${overdue===1?' is':'s are'} past due with an outstanding balance.`,now);
    const last=this.db.get<{created_at:string}>('SELECT created_at FROM backup_records WHERE clinic_id=? AND status=\'verified\' ORDER BY created_at DESC LIMIT 1',clinicId);
    const days=last?Math.floor((Date.now()-Date.parse(last.created_at))/86_400_000):999;const setting=this.db.get<{value_json:string}>('SELECT value_json FROM app_settings WHERE clinic_id=? AND key=\'backupReminderDays\'',clinicId);let reminder=7;try{reminder=Number(setting?JSON.parse(setting.value_json):7);}catch{}
    if(days>=reminder)this.upsertNotification(clinicId,`backup-reminder-${today}`,'backup_reminder','warning',bengali?'যাচাইকৃত ব্যাকআপ তৈরি করা প্রয়োজন':'A verified backup is due',bengali?(last?`সর্বশেষ যাচাইকৃত ব্যাকআপ ${days} দিন আগে তৈরি হয়েছে।`:'ক্লিনিকের তথ্য সুরক্ষায় প্রথম যাচাইকৃত ব্যাকআপ তৈরি করুন।'):(last?`The last verified backup was ${days} days ago.`:'Create the first verified backup to protect clinic records.'),now);
  }

  private upsertNotification(clinicId:string,id:string,type:string,severity:string,title:string,message:string,now:string):void{
    this.db.run(`INSERT INTO notifications(id,clinic_id,user_id,type,severity,title,message,entity_type,entity_id,is_read,created_at,read_at,expires_at) VALUES(?,?,NULL,?,?,?,?,NULL,NULL,0,?,NULL,NULL)
      ON CONFLICT(id) DO UPDATE SET message=excluded.message`,id,clinicId,type,severity,title,message,now);
  }

  private settingBoolean(clinicId:string,key:string,fallback:boolean):boolean{const row=this.db.get<{value_json:string}>('SELECT value_json FROM app_settings WHERE clinic_id=? AND key=?',clinicId,key);try{return row?Boolean(JSON.parse(row.value_json)):fallback;}catch{return fallback;}}
  private localDateTime():string{const d=new Date();const p=(n:number)=>String(n).padStart(2,'0');return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;}
}
