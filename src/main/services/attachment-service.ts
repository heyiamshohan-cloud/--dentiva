import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { AttachmentRecord } from '../../shared/types.js';
import type { DentivaDatabase } from '../database/database.js';
import { mapAttachment } from '../database/mappers.js';
import type { AuditService } from '../security/security.js';
import type { DentivaPaths } from '../utils/paths.js';
import { AppError, optionalText } from '../utils/errors.js';

const mimeTypes:Record<string,string>={
  '.pdf':'application/pdf','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif','.bmp':'image/bmp','.tif':'image/tiff','.tiff':'image/tiff',
  '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','.csv':'text/csv','.txt':'text/plain','.rtf':'application/rtf'
};
const categories:AttachmentRecord['category'][]=['xray','report','prescription','referral','document','consent','before_after','other'];

export class AttachmentService{
  constructor(private readonly db:DentivaDatabase,private readonly paths:DentivaPaths,private readonly audit:AuditService){}

  async add(clinicId:string,userId:string,userName:string,input:{sourcePath:string;patientId?:string;visitId?:string;invoiceId?:string;category:AttachmentRecord['category'];description?:string}):Promise<AttachmentRecord>{
    const source=path.resolve(input.sourcePath);let stat:fs.Stats;
    try{stat=fs.statSync(source);}catch{throw new AppError('FILE_NOT_FOUND','The selected file could not be found.');}
    if(!stat.isFile())throw new AppError('INVALID_FILE','Select a file rather than a folder.');
    if(stat.size===0)throw new AppError('INVALID_FILE','The selected file is empty.');
    const extension=path.extname(source).toLowerCase();const mime=mimeTypes[extension];
    if(!mime)throw new AppError('UNSUPPORTED_FILE','This file type is not supported. Use PDF, common images, DOCX, XLSX, CSV, TXT, or RTF.');
    if(!categories.includes(input.category))throw new AppError('VALIDATION_ERROR','Select a valid document category.');
    if(input.patientId&&!this.db.get('SELECT id FROM patients WHERE id=? AND clinic_id=?',input.patientId,clinicId))throw new AppError('PATIENT_NOT_FOUND','The selected patient could not be found.');
    if(input.visitId&&!this.db.get('SELECT id FROM visits WHERE id=? AND clinic_id=?',input.visitId,clinicId))throw new AppError('VISIT_NOT_FOUND','The selected visit could not be found.');
    if(input.invoiceId&&!this.db.get('SELECT id FROM invoices WHERE id=? AND clinic_id=?',input.invoiceId,clinicId))throw new AppError('INVOICE_NOT_FOUND','The selected invoice could not be found.');
    const id=randomUUID();const now=new Date();const relative=path.join(input.patientId??'clinic',String(now.getFullYear()),String(now.getMonth()+1).padStart(2,'0'),`${id}${extension}`);
    const destination=this.paths.resolveAttachment(relative);fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});
    const temporary=`${destination}.partial`;
    const hash=createHash('sha256');const reader=fs.createReadStream(source);reader.on('data',(chunk)=>hash.update(chunk));
    try{await pipeline(reader,fs.createWriteStream(temporary,{mode:0o600}));fs.renameSync(temporary,destination);}catch{fs.rmSync(temporary,{force:true});throw new AppError('FILE_COPY_FAILED','The document could not be copied into Dentiva storage. Check available disk space and try again.');}
    const checksum=hash.digest('hex');const createdAt=now.toISOString();
    try{
      this.db.run(`INSERT INTO attachments(id,clinic_id,patient_id,visit_id,referral_id,invoice_id,original_name,stored_name,relative_path,mime_type,extension,size_bytes,category,description,source,sha256,created_at,created_by,archived_at)
        VALUES(${Array(19).fill('?').join(',')})`,id,clinicId,input.patientId??null,input.visitId??null,null,input.invoiceId??null,path.basename(source),path.basename(destination),relative,mime,extension.slice(1),stat.size,input.category,optionalText(input.description,2000),'file',checksum,createdAt,userId,null);
    }catch(error){fs.rmSync(destination,{force:true});throw error;}
    this.audit.record({clinicId,userId,userName,action:'document_attached',entityType:'attachment',entityIdentifier:id,summary:`Document attached (${input.category}, ${stat.size} bytes)`});
    return this.get(id,clinicId);
  }

  list(clinicId:string,input:{patientId?:string;visitId?:string;search?:string}):AttachmentRecord[]{
    const where=['clinic_id=?','archived_at IS NULL'];const params:string[]=[clinicId];
    if(input.patientId){where.push('patient_id=?');params.push(input.patientId);}if(input.visitId){where.push('visit_id=?');params.push(input.visitId);}
    if(input.search){where.push('(original_name LIKE ? OR description LIKE ?)');params.push(`%${input.search}%`,`%${input.search}%`);}
    return this.db.all<Record<string,unknown>>(`SELECT * FROM attachments WHERE ${where.join(' AND ')} ORDER BY created_at DESC`,...params).map(mapAttachment);
  }

  get(id:string,clinicId:string):AttachmentRecord{
    const row=this.db.get<Record<string,unknown>>('SELECT * FROM attachments WHERE id=? AND clinic_id=?',id,clinicId);if(!row)throw new AppError('DOCUMENT_NOT_FOUND','The document could not be found.');return mapAttachment(row);
  }

  pathFor(id:string,clinicId:string):string{
    const record=this.get(id,clinicId);if(record.archivedAt)throw new AppError('DOCUMENT_ARCHIVED','Restore this document before opening it.');const file=this.paths.resolveAttachment(record.relativePath);if(!fs.existsSync(file))throw new AppError('FILE_MISSING','The document metadata exists, but its stored file is missing. Restore a verified backup or contact support.');return file;
  }

  archive(id:string,clinicId:string,userId:string,userName:string):void{
    const record=this.get(id,clinicId);if(record.archivedAt)return;const now=new Date().toISOString();this.db.run('UPDATE attachments SET archived_at=? WHERE id=?',now,id);
    this.audit.record({clinicId,userId,userName,action:'document_archived',entityType:'attachment',entityIdentifier:id,summary:`Document ${record.originalName.slice(0,120)} archived`});
  }
}
