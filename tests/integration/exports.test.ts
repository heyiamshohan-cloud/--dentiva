import fs from 'node:fs';
import path from 'node:path';
import yauzl from 'yauzl';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExportService } from '../../src/main/services/export-service.js';
import { PatientService } from '../../src/main/services/patient-service.js';
import type { DocumentService } from '../../src/main/services/document-service.js';
import type { PatientInput } from '../../src/shared/types.js';
import { createWorkspace, setupInput, type TestWorkspace } from '../helpers.js';

function zipEntries(file:string):Promise<string[]>{return new Promise((resolve,reject)=>yauzl.open(file,{lazyEntries:true},(error,zip)=>{if(error||!zip)return reject(error);const names:string[]=[];zip.on('entry',(entry)=>{names.push(entry.fileName);zip.readEntry();});zip.on('end',()=>resolve(names));zip.on('error',reject);zip.readEntry();}));}

describe('standards-based report exports',()=>{let workspace:TestWorkspace;let service:ExportService;let clinicId:string;let userId:string;beforeEach(()=>{workspace=createWorkspace();const session=workspace.setup.complete(setupInput('E'));clinicId=workspace.setup.bootstrap().clinic!.id;userId=session.user.id;service=new ExportService(workspace.db,workspace.paths,workspace.audit,{htmlToPdf:async()=>''} as unknown as DocumentService);const input:PatientInput={fullName:'=Formula Safe Record',preferredName:null,phone:'01715000006',alternativePhone:null,email:'export@clinic.local',dateOfBirth:null,gender:'undisclosed',bloodGroup:null,address:null,emergencyContact:null,emergencyPhone:null,occupation:null,identificationType:null,identificationNumber:null,medicalAlerts:null,allergiesSummary:null,currentMedications:null,medicalConditions:null,dentalHistory:null,previousDentist:null,referralSource:null,status:'active',notes:null,tags:[],isFavorite:false};new PatientService(workspace.db,workspace.audit).create(clinicId,userId,'Clinic Owner',input);});afterEach(()=>workspace.dispose());
  it('writes UTF-8 CSV while neutralizing spreadsheet formulas',async()=>{const result=await service.export(clinicId,userId,'Clinic Owner',{report:'patients',range:{from:'2026-01-01',to:'2026-12-31'},format:'csv'});const text=fs.readFileSync(result.path,'utf8');expect(text.charCodeAt(0)).toBe(0xfeff);expect(text).toContain("'=Formula Safe Record");expect(text).toContain('Patient code');});
  it('writes a valid Open XML workbook package with required parts',async()=>{const result=await service.export(clinicId,userId,'Clinic Owner',{report:'patients',range:{from:'2026-01-01',to:'2026-12-31'},format:'xlsx',destination:path.join(workspace.paths.exports,'patient-register')});expect(result.path.endsWith('.xlsx')).toBe(true);expect(fs.statSync(result.path).size).toBeGreaterThan(1000);expect(await zipEntries(result.path)).toEqual(expect.arrayContaining(['[Content_Types].xml','_rels/.rels','xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/styles.xml','xl/worksheets/sheet1.xml']));expect(workspace.db.get<{n:number}>("SELECT count(*) AS n FROM audit_logs WHERE action='data_exported'")?.n).toBe(1);});
});
