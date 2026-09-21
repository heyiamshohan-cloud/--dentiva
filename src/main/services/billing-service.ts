import { randomUUID } from 'node:crypto';
import type { Invoice, InvoiceInput, InvoiceItem, PageRequest, PageResult, Payment, PaymentInput, Refund } from '../../shared/types.js';
import type { DentivaDatabase } from '../database/database.js';
import { mapInvoice, mapPayment, stringOrNull } from '../database/mappers.js';
import type { AuditService } from '../security/security.js';
import { AppError, assertNonNegativeInteger, assertText, optionalText } from '../utils/errors.js';
import { CounterService, pageBounds } from './common.js';

const invoiceSort: Record<string,string>={issuedAt:'i.issued_at',invoiceNumber:'i.invoice_number',patientName:'p.full_name',totalMinor:'i.total_minor',dueMinor:'i.due_minor',status:'i.status'};

type InvoiceDetail=Invoice&{payments:Payment[];refunds:Refund[]};

export class BillingService{
  private readonly counters:CounterService;
  constructor(private readonly db:DentivaDatabase,private readonly audit:AuditService){this.counters=new CounterService(db);}

  list(clinicId:string,request:PageRequest):PageResult<Invoice>{
    this.markOverdue(clinicId);
    const {page,pageSize,offset}=pageBounds(request.page,request.pageSize);
    const where=['i.clinic_id=?']; const params:Array<string|number>=[clinicId];
    const search=String(request.search??'').trim();
    if(search){const term=`%${search.replace(/[\\%_]/g,'\\$&')}%`;where.push("(i.invoice_number LIKE ? ESCAPE '\\' OR p.full_name LIKE ? ESCAPE '\\' OR p.patient_code LIKE ? ESCAPE '\\' OR p.phone LIKE ? ESCAPE '\\')");params.push(term,term,term,term);}
    if(typeof request.filters?.status==='string'&&['draft','issued','partially_paid','paid','overdue','void'].includes(request.filters.status)){where.push('i.status=?');params.push(request.filters.status);}
    if(typeof request.filters?.patientId==='string'){where.push('i.patient_id=?');params.push(request.filters.patientId);}
    if(request.filters?.hasDue===true)where.push("i.due_minor>0 AND i.status!='void'");
    if(typeof request.filters?.from==='string'){where.push('substr(i.issued_at,1,10)>=?');params.push(request.filters.from);}
    if(typeof request.filters?.to==='string'){where.push('substr(i.issued_at,1,10)<=?');params.push(request.filters.to);}
    const clause=where.join(' AND ');
    const total=Number(this.db.get<{count:number}>(`SELECT count(*) AS count FROM invoices i JOIN patients p ON p.id=i.patient_id WHERE ${clause}`,...params)?.count??0);
    const sort=invoiceSort[request.sortBy??'issuedAt']??invoiceSort.issuedAt;const direction=request.sortDirection==='asc'?'ASC':'DESC';
    const rows=this.db.all<Record<string,unknown>>(`SELECT i.*,p.full_name AS patient_name,p.patient_code FROM invoices i JOIN patients p ON p.id=i.patient_id
      WHERE ${clause} ORDER BY ${sort} ${direction},i.id LIMIT ? OFFSET ?`,...params,pageSize,offset);
    return {items:rows.map((row)=>mapInvoice(row,this.items(String(row.id)))),page,pageSize,total,totalPages:Math.max(1,Math.ceil(total/pageSize))};
  }

  get(id:string,clinicId:string):InvoiceDetail{
    const row=this.db.get<Record<string,unknown>>(`SELECT i.*,p.full_name AS patient_name,p.patient_code FROM invoices i JOIN patients p ON p.id=i.patient_id WHERE i.id=? AND i.clinic_id=?`,id,clinicId);
    if(!row)throw new AppError('INVOICE_NOT_FOUND','The invoice could not be found.');
    const invoice=mapInvoice(row,this.items(id));
    const payments=this.db.all<Record<string,unknown>>('SELECT * FROM payments WHERE invoice_id=? ORDER BY paid_at DESC',id).map(mapPayment);
    const refunds=this.db.all<Record<string,unknown>>(`SELECT r.* FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.invoice_id=? ORDER BY r.refunded_at DESC`,id).map((r)=>({
      id:String(r.id),paymentId:String(r.payment_id),amountMinor:Number(r.amount_minor),refundedAt:String(r.refunded_at),reason:String(r.reason),approvedBy:String(r.approved_by??''),createdAt:String(r.created_at)
    }));
    return Object.assign(invoice,{payments,refunds});
  }

  create(clinicId:string,userId:string,userName:string,input:InvoiceInput):Invoice{
    const patient=this.db.get<{patient_code:string}>('SELECT patient_code FROM patients WHERE id=? AND clinic_id=? AND status!=\'archived\'',input.patientId,clinicId);
    if(!patient)throw new AppError('PATIENT_NOT_FOUND','Choose an active patient for the invoice.','patientId');
    if(!Array.isArray(input.items)||input.items.length===0)throw new AppError('VALIDATION_ERROR','Add at least one invoice item.','items');
    if(input.items.length>250)throw new AppError('VALIDATION_ERROR','An invoice cannot contain more than 250 line items.','items');
    const computed=input.items.map((item,index)=>this.calculateItem(item,index));
    const subtotal=computed.reduce((sum,item)=>sum+Math.round(item.quantity*item.unitPriceMinor)-item.discountMinor,0);
    const tax=computed.reduce((sum,item)=>sum+(item.taxMinor??0),0);
    const discount=assertNonNegativeInteger(input.discountMinor,'Invoice discount');
    if(discount>subtotal+tax)throw new AppError('INVALID_TOTAL','Invoice discount cannot exceed the charge total.','discountMinor');
    const total=subtotal-discount+tax;
    const issuedAt=this.validDate(input.issuedAt,'Invoice date');
    const dueAt=input.dueAt?this.validDate(input.dueAt,'Due date'):null;
    const id=randomUUID();const now=new Date().toISOString();let number='';
    this.db.transaction(()=>{
      const clinic=this.db.get<{invoice_prefix:string;invoice_terms:string|null}>('SELECT invoice_prefix,invoice_terms FROM clinics WHERE id=?',clinicId);
      if(!clinic)throw new AppError('CLINIC_NOT_FOUND','Clinic configuration is unavailable.');
      number=this.counters.next(clinicId,'invoice',clinic.invoice_prefix,6,true);
      this.db.run(`INSERT INTO invoices(id,clinic_id,invoice_number,patient_id,visit_id,issued_at,due_at,subtotal_minor,discount_minor,tax_minor,total_minor,paid_minor,due_minor,status,notes,terms,void_reason,voided_at,voided_by,created_at,updated_at,created_by)
        VALUES(${Array(22).fill('?').join(',')})`,id,clinicId,number,input.patientId,input.visitId||null,issuedAt,dueAt,subtotal,discount,tax,total,0,total,input.issueNow?'issued':'draft',
      optionalText(input.notes,4000),optionalText(input.terms,4000)??clinic.invoice_terms,null,null,null,now,now,userId);
      computed.forEach((item,index)=>this.db.run(`INSERT INTO invoice_items(id,invoice_id,treatment_id,description,quantity,unit_price_minor,discount_minor,tax_rate,tax_minor,line_total_minor,sort_order)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`,randomUUID(),id,item.treatmentId,item.description,item.quantity,item.unitPriceMinor,item.discountMinor,item.taxRate,item.taxMinor,item.lineTotalMinor,index));
      this.recalculatePatientBalance(input.patientId);
      this.audit.record({clinicId,userId,userName,action:'invoice_created',entityType:'invoice',entityIdentifier:number,summary:`Invoice ${number} created for patient ${patient.patient_code}`});
    });
    return this.get(id,clinicId);
  }

  issue(id:string,clinicId:string,userId:string,userName:string):Invoice{
    const invoice=this.get(id,clinicId);
    if(invoice.status==='void')throw new AppError('INVOICE_VOID','A void invoice cannot be issued.');
    if(invoice.status!=='draft')return invoice;
    this.db.run("UPDATE invoices SET status='issued',updated_at=? WHERE id=?",new Date().toISOString(),id);
    this.audit.record({clinicId,userId,userName,action:'invoice_issued',entityType:'invoice',entityIdentifier:invoice.invoiceNumber,summary:`Invoice ${invoice.invoiceNumber} issued`});
    return this.get(id,clinicId);
  }

  void(id:string,clinicId:string,userId:string,userName:string,reason:string):Invoice{
    const invoice=this.get(id,clinicId);const cleanReason=assertText(reason,'Void reason',5,1000);
    if(invoice.status==='void')return invoice;
    if(invoice.paidMinor>0)throw new AppError('INVOICE_HAS_PAYMENTS','Refund or void all payments before voiding this invoice. Financial history cannot be removed silently.');
    const now=new Date().toISOString();
    this.db.transaction(()=>{
      this.db.run("UPDATE invoices SET status='void',void_reason=?,voided_at=?,voided_by=?,updated_at=? WHERE id=?",cleanReason,now,userId,now,id);
      this.recalculatePatientBalance(invoice.patientId);
      this.audit.record({clinicId,userId,userName,action:'invoice_voided',entityType:'invoice',entityIdentifier:invoice.invoiceNumber,summary:`Invoice ${invoice.invoiceNumber} voided`});
    });
    return this.get(id,clinicId);
  }

  addPayment(clinicId:string,userId:string,userName:string,input:PaymentInput):Payment{
    const invoice=this.get(input.invoiceId,clinicId);
    if(['draft','void'].includes(invoice.status))throw new AppError('PAYMENT_NOT_ALLOWED',invoice.status==='draft'?'Issue the invoice before recording payment.':'Payment cannot be recorded against a void invoice.');
    const amount=assertNonNegativeInteger(input.amountMinor,'Payment amount');
    if(amount<=0)throw new AppError('VALIDATION_ERROR','Payment amount must be greater than zero.','amountMinor');
    if(amount>invoice.dueMinor)throw new AppError('PAYMENT_EXCEEDS_DUE',`Payment cannot exceed the outstanding amount of ${invoice.dueMinor} minor currency units.`,'amountMinor');
    const method=assertText(input.method,'Payment method',2,100);
    const paidAt=this.validDate(input.paidAt,'Payment date');
    const id=randomUUID();const now=new Date().toISOString();let receipt='';
    this.db.transaction(()=>{
      receipt=this.counters.next(clinicId,'receipt','RCT',6,true);
      this.db.run(`INSERT INTO payments(id,clinic_id,invoice_id,receipt_number,amount_minor,paid_at,method,provider,reference,notes,received_by,voided_at,void_reason,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?)`,id,clinicId,input.invoiceId,receipt,amount,paidAt,method,optionalText(input.provider,120),optionalText(input.reference,200),optionalText(input.notes,2000),userId,now);
      this.recalculateInvoice(input.invoiceId);
      this.recalculatePatientBalance(invoice.patientId);
      this.audit.record({clinicId,userId,userName,action:'payment_recorded',entityType:'payment',entityIdentifier:receipt,summary:`Payment ${receipt} recorded against invoice ${invoice.invoiceNumber}`});
    });
    return mapPayment(this.db.get<Record<string,unknown>>('SELECT * FROM payments WHERE id=?',id)!);
  }

  refund(clinicId:string,userId:string,userName:string,input:{paymentId:string;amountMinor:number;reason:string}):Refund{
    const paymentRow=this.db.get<Record<string,unknown>>(`SELECT p.*,i.invoice_number,i.patient_id,i.id AS invoice_id FROM payments p JOIN invoices i ON i.id=p.invoice_id WHERE p.id=? AND p.clinic_id=?`,input.paymentId,clinicId);
    if(!paymentRow)throw new AppError('PAYMENT_NOT_FOUND','The payment could not be found.');
    if(paymentRow.voided_at)throw new AppError('PAYMENT_VOID','A void payment cannot be refunded.');
    const amount=assertNonNegativeInteger(input.amountMinor,'Refund amount');
    if(amount<=0)throw new AppError('VALIDATION_ERROR','Refund amount must be greater than zero.','amountMinor');
    const existing=Number(this.db.get<{total:number}>('SELECT coalesce(sum(amount_minor),0) AS total FROM refunds WHERE payment_id=?',input.paymentId)?.total??0);
    if(existing+amount>Number(paymentRow.amount_minor))throw new AppError('REFUND_EXCEEDS_PAYMENT','Refund total cannot exceed the original payment.','amountMinor');
    const reason=assertText(input.reason,'Refund reason',5,1000);const id=randomUUID();const now=new Date().toISOString();
    this.db.transaction(()=>{
      this.db.run('INSERT INTO refunds(id,clinic_id,payment_id,amount_minor,refunded_at,reason,approved_by,created_at) VALUES(?,?,?,?,?,?,?,?)',id,clinicId,input.paymentId,amount,now,reason,userId,now);
      this.recalculateInvoice(String(paymentRow.invoice_id));
      this.recalculatePatientBalance(String(paymentRow.patient_id));
      this.audit.record({clinicId,userId,userName,action:'refund_issued',entityType:'payment',entityIdentifier:String(paymentRow.receipt_number),summary:`Refund recorded for receipt ${String(paymentRow.receipt_number)}`});
    });
    return {id,paymentId:input.paymentId,amountMinor:amount,refundedAt:now,reason,approvedBy:userId,createdAt:now};
  }

  paymentMethods(clinicId:string):string[]{return this.db.all<{name:string}>('SELECT name FROM payment_methods WHERE clinic_id=? AND active=1 ORDER BY sort_order,name',clinicId).map((r)=>r.name);}

  private calculateItem(item:InvoiceItem,index:number):Required<Omit<InvoiceItem,'id'>> & {id?:string}{
    const description=assertText(item.description,`Item ${index+1} description`,2,500);
    const quantity=Number(item.quantity);if(!Number.isFinite(quantity)||quantity<=0||quantity>100000)throw new AppError('VALIDATION_ERROR',`Item ${index+1} has an invalid quantity.`,'quantity');
    const unitPriceMinor=assertNonNegativeInteger(item.unitPriceMinor,`Item ${index+1} unit price`);
    const discountMinor=assertNonNegativeInteger(item.discountMinor??0,`Item ${index+1} discount`);
    const base=Math.round(quantity*unitPriceMinor);if(discountMinor>base)throw new AppError('INVALID_TOTAL',`Discount on item ${index+1} cannot exceed its price.`,'discountMinor');
    const taxRate=Number(item.taxRate??0);if(!Number.isFinite(taxRate)||taxRate<0||taxRate>100)throw new AppError('VALIDATION_ERROR',`Item ${index+1} tax rate must be between 0 and 100.`,'taxRate');
    const taxMinor=Math.round((base-discountMinor)*taxRate/100);const lineTotalMinor=base-discountMinor+taxMinor;
    return {treatmentId:item.treatmentId||null,description,quantity,unitPriceMinor,discountMinor,taxRate,taxMinor,lineTotalMinor};
  }

  private items(invoiceId:string):InvoiceItem[]{return this.db.all<Record<string,unknown>>('SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY sort_order',invoiceId).map((row)=>({
    id:String(row.id),treatmentId:stringOrNull(row.treatment_id),description:String(row.description),quantity:Number(row.quantity),unitPriceMinor:Number(row.unit_price_minor),discountMinor:Number(row.discount_minor),taxRate:Number(row.tax_rate),taxMinor:Number(row.tax_minor),lineTotalMinor:Number(row.line_total_minor)
  }));}

  private recalculateInvoice(invoiceId:string):void{
    const row=this.db.get<{total_minor:number;status:string}>(`SELECT total_minor,status FROM invoices WHERE id=?`,invoiceId);if(!row)throw new AppError('INVOICE_NOT_FOUND','The invoice could not be found.');
    const payments=Number(this.db.get<{total:number}>('SELECT coalesce(sum(amount_minor),0) AS total FROM payments WHERE invoice_id=? AND voided_at IS NULL',invoiceId)?.total??0);
    const refunds=Number(this.db.get<{total:number}>(`SELECT coalesce(sum(r.amount_minor),0) AS total FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.invoice_id=?`,invoiceId)?.total??0);
    const paid=payments-refunds;if(paid<0||paid>row.total_minor)throw new AppError('FINANCIAL_RECONCILIATION_FAILED','Invoice payment totals are inconsistent. No changes were committed.');
    const due=row.total_minor-paid;const status:string=due===0?'paid':paid>0?'partially_paid':'issued';
    this.db.run('UPDATE invoices SET paid_minor=?,due_minor=?,status=?,updated_at=? WHERE id=?',paid,due,status,new Date().toISOString(),invoiceId);
  }

  private recalculatePatientBalance(patientId:string):void{
    const total=Number(this.db.get<{total:number}>("SELECT coalesce(sum(due_minor),0) AS total FROM invoices WHERE patient_id=? AND status!='void'",patientId)?.total??0);
    this.db.run('UPDATE patients SET outstanding_minor=? WHERE id=?',total,patientId);
  }

  private markOverdue(clinicId:string):void{
    const today=new Date().toISOString().slice(0,10);
    this.db.run("UPDATE invoices SET status='overdue' WHERE clinic_id=? AND status='issued' AND due_minor>0 AND due_at IS NOT NULL AND substr(due_at,1,10)<?",clinicId,today);
  }

  private validDate(value:string,label:string):string{if(typeof value!=='string'||Number.isNaN(Date.parse(value)))throw new AppError('VALIDATION_ERROR',`${label} is invalid.`);return value;}
}
