import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DentivaDatabase } from '../src/main/database/database.js';
import { AppLogger } from '../src/main/utils/logger.js';
import type { DentivaPaths } from '../src/main/utils/paths.js';
import { AuditService, SessionService } from '../src/main/security/security.js';
import { SetupService } from '../src/main/services/setup-service.js';
import type { SetupInput } from '../src/shared/types.js';

export interface TestWorkspace { root:string; paths:DentivaPaths; logger:AppLogger; db:DentivaDatabase; audit:AuditService; sessions:SessionService; setup:SetupService; dispose():void; }

export function createWorkspace():TestWorkspace{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'dentiva-qa-'));
  const p={root,databaseDir:path.join(root,'Database'),database:path.join(root,'Database','dentiva.db'),attachments:path.join(root,'Attachments'),backups:path.join(root,'Backups'),exports:path.join(root,'Exports'),logs:path.join(root,'Logs'),temp:path.join(root,'Temp'),branding:path.join(root,'Branding'),migrationBackups:path.join(root,'Backups','MigrationSafety')};
  const paths={...p,ensure(){for(const directory of Object.values(p).filter((v)=>typeof v==='string'&&!v.endsWith('.db')))fs.mkdirSync(directory,{recursive:true});fs.mkdirSync(p.databaseDir,{recursive:true});},cleanTemporaryFiles(){},resolveAttachment(relative:string){const target=path.resolve(p.attachments,relative);if(!target.startsWith(path.resolve(p.attachments)+path.sep))throw new Error('unsafe');return target;}} as unknown as DentivaPaths;
  paths.ensure();const logger=new AppLogger(p.logs);const db=new DentivaDatabase(paths,logger);const audit=new AuditService(db);const sessions=new SessionService(db,audit,logger);const setup=new SetupService(db,paths,sessions,audit,'1.0.0');
  return{root,paths,logger,db,audit,sessions,setup,dispose(){try{db.close();}catch{}fs.rmSync(root,{recursive:true,force:true});}};
}

export function setupInput(suffix='A'):SetupInput{return{
  name:`Bangladesh Oral Care ${suffix}`,dentistName:`Dr. Clinic Owner ${suffix}`,professionalTitle:'Dental Surgeon',phone:`01700000${suffix.charCodeAt(0)}`,alternativePhone:null,email:`owner${suffix.toLowerCase()}@clinic.local`,address:'Dhaka, Bangladesh',city:'Dhaka',district:'Dhaka',country:'Bangladesh',registrationInfo:null,openingHours:'09:00–20:00',workingDays:['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday'],currencyCode:'BDT',currencySymbol:'৳',invoicePrefix:'INV',patientPrefix:'DTV',appointmentPrefix:'APT',dateFormat:'dd MMM yyyy',timeFormat:'hh:mm a',defaultLanguage:'en',defaultPrinter:null,footerText:'Thank you for trusting our clinic.',invoiceTerms:'Payment is due according to the stated balance.',paymentInstructions:null,emergencyContact:null,ownerName:`Clinic Owner ${suffix}`,ownerUsername:`owner.${suffix.toLowerCase()}`,ownerPassword:'Secure#Clinic2026',logoSourcePath:null
};}
