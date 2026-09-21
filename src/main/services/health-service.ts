import fs from 'node:fs';
import path from 'node:path';
import type { SystemHealth } from '../../shared/types.js';
import type { DentivaDatabase } from '../database/database.js';
import type { DentivaPaths } from '../utils/paths.js';

function directorySize(root:string):number{let total=0;if(!fs.existsSync(root))return 0;const stack=[root];while(stack.length){const current=stack.pop()!;try{for(const entry of fs.readdirSync(current,{withFileTypes:true})){const full=path.join(current,entry.name);if(entry.isDirectory())stack.push(full);else if(entry.isFile())total+=fs.statSync(full).size;}}catch{/* Files may be locked briefly; report the measurable size. */}}return total;}

export class HealthService{
  constructor(private readonly db:DentivaDatabase,private readonly paths:DentivaPaths,private readonly version:string){}
  get(clinicId:string):SystemHealth{const stat=fs.statfsSync(this.paths.root);const last=this.db.get<{created_at:string}>('SELECT created_at FROM backup_records WHERE clinic_id=? AND status=\'verified\' ORDER BY created_at DESC LIMIT 1',clinicId);return{databaseIntegrity:this.db.integrityCheck(),databaseSize:fs.existsSync(this.paths.database)?fs.statSync(this.paths.database).size:0,attachmentsSize:directorySize(this.paths.attachments),freeDiskBytes:Number(stat.bavail)*Number(stat.bsize),lastBackupAt:last?.created_at??null,schemaVersion:this.db.schemaVersion,appVersion:this.version,platform:`${process.platform} ${process.arch}`,paths:{data:this.paths.root,database:this.paths.database,attachments:this.paths.attachments,backups:this.paths.backups,exports:this.paths.exports,logs:this.paths.logs}};}
}
