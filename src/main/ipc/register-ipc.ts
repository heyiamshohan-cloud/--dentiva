import { dialog, ipcMain, shell, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type { AppointmentService } from '../services/appointment-service.js';
import type { AttachmentService } from '../services/attachment-service.js';
import type { BackupService } from '../services/backup-service.js';
import type { BillingService } from '../services/billing-service.js';
import type { ClinicalService } from '../services/clinical-service.js';
import type { DocumentService } from '../services/document-service.js';
import type { ExportService } from '../services/export-service.js';
import type { HealthService } from '../services/health-service.js';
import type { InsightsService } from '../services/insights-service.js';
import type { PatientService } from '../services/patient-service.js';
import type { RecordsService } from '../services/records-service.js';
import type { SettingsService } from '../services/settings-service.js';
import type { SetupService } from '../services/setup-service.js';
import type { TreatmentPlanService } from '../services/treatment-plan-service.js';
import type { UserService } from '../services/user-service.js';
import type { SessionService } from '../security/security.js';
import type { AppLogger } from '../utils/logger.js';
import { toApiError } from '../utils/errors.js';
import type {
  AppointmentInput, AppointmentStatus, DateRange, DocumentRequest, GenericListRequest, InvoiceInput,
  LoginInput, PageRequest, PatientInput, PaymentInput, PrintOptions, RestoreSelection, RoleInput, SetupInput, TreatmentPlanInput, UserAccountInput, VisitInput
} from '../../shared/types.js';

interface Services{
  setup:SetupService;sessions:SessionService;patients:PatientService;appointments:AppointmentService;clinical:ClinicalService;billing:BillingService;
  records:RecordsService;treatmentPlans:TreatmentPlanService;users:UserService;attachments:AttachmentService;insights:InsightsService;backup:BackupService;settings:SettingsService;documents:DocumentService;exports:ExportService;health:HealthService;logger:AppLogger;
}

type Handler=(event:IpcMainInvokeEvent,...args:unknown[])=>unknown|Promise<unknown>;

export function registerIpc(services:Services,getMainWindow:()=>BrowserWindow|null):void{
  const registered:string[]=[];
  const handle=(channel:string,fn:Handler)=>{ipcMain.removeHandler(channel);ipcMain.handle(channel,async(event,...args)=>{try{const main=getMainWindow();if(main&&event.sender.id!==main.webContents.id)throw new Error('Untrusted IPC sender.');return{ok:true,data:await fn(event,...args)};}catch(error){services.logger.error(`IPC operation failed: ${channel}`,error);return toApiError(error);}});registered.push(channel);};
  const session=(token:unknown,permission?:string)=>services.sessions.require(String(token??''),permission);

  handle('app:bootstrap',()=>services.setup.bootstrap());
  handle('app:choose-file',async(_event,raw)=>{const options=raw as {title?:string;filters?:Array<{name:string;extensions:string[]}>;multiple?:boolean};const config:Electron.OpenDialogOptions={title:options.title??'Select a file',properties:options.multiple?['openFile','multiSelections']:['openFile'],filters:options.filters};const parent=getMainWindow();const result=parent?await dialog.showOpenDialog(parent,config):await dialog.showOpenDialog(config);return result.canceled?[]:result.filePaths;});
  handle('app:choose-directory',async(_event,title)=>{const config:Electron.OpenDialogOptions={title:String(title??'Select a folder'),properties:['openDirectory','createDirectory']};const parent=getMainWindow();const result=parent?await dialog.showOpenDialog(parent,config):await dialog.showOpenDialog(config);return result.canceled?null:(result.filePaths[0]??null);});
  handle('app:printers',async()=>{const printers=await getMainWindow()?.webContents.getPrintersAsync()??[];return printers.map((printer)=>({name:printer.name,displayName:printer.displayName||printer.name,isDefault:String((printer.options as unknown as Record<string,unknown>)['printer-is-default']??'false')==='true',status:Number((printer.options as unknown as Record<string,unknown>)['printer-status']??0)}));});
  handle('app:health',(_event,token)=>{const s=session(token,'settings.manage');return services.health.get(s.clinicId);});
  handle('app:open-external',async(_event,url)=>{const value=String(url??'');const parsed=new URL(value);if(!['https:','mailto:'].includes(parsed.protocol))throw new Error('Only secure web and email links can be opened.');await shell.openExternal(value);});

  handle('setup:complete',(_event,input)=>services.setup.complete(input as SetupInput));
  handle('auth:login',(_event,input)=>services.sessions.login(input as LoginInput));
  handle('auth:logout',(_event,token)=>services.sessions.logout(String(token)));
  handle('auth:lock',(_event,token)=>services.sessions.logout(String(token),true));
  handle('auth:touch',(_event,token)=>services.sessions.touch(String(token)));
  handle('auth:change-password',(_event,token,input)=>{const data=input as {currentPassword:string;newPassword:string};services.sessions.changePassword(String(token),data.currentPassword,data.newPassword);});

  handle('dashboard:get',(_event,token,range)=>{const s=session(token,'reports.view');services.insights.generateOperationalNotifications(s.clinicId);return services.insights.dashboard(s.clinicId,range as DateRange);});

  handle('patients:list',(_event,token,request)=>{const s=session(token,'patients.view');return services.patients.list(s.clinicId,request as PageRequest,s.user.permissions);});
  handle('patients:get',(_event,token,id)=>{const s=session(token,'patients.view');return services.patients.get(String(id),s.clinicId,s.user.permissions);});
  handle('patients:duplicates',(_event,token,input)=>{const s=session(token,'patients.view');return services.patients.duplicates(s.clinicId,input as Partial<PatientInput>);});
  handle('patients:create',(_event,token,input)=>{const s=session(token,'patients.edit');return services.patients.create(s.clinicId,s.user.id,s.user.displayName,input as PatientInput);});
  handle('patients:update',(_event,token,id,input)=>{const s=session(token,'patients.edit');return services.patients.update(String(id),s.clinicId,s.user.id,s.user.displayName,input as Partial<PatientInput>);});
  handle('patients:archive',(_event,token,id)=>{const s=session(token,'patients.archive');return services.patients.archive(String(id),s.clinicId,s.user.id,s.user.displayName);});
  handle('patients:restore',(_event,token,id)=>{const s=session(token,'patients.archive');return services.patients.restore(String(id),s.clinicId,s.user.id,s.user.displayName);});

  handle('appointments:list',(_event,token,request)=>{const s=session(token,'appointments.view');return services.appointments.list(s.clinicId,request as PageRequest);});
  handle('appointments:day',(_event,token,date)=>{const s=session(token,'appointments.view');return services.appointments.day(s.clinicId,String(date));});
  handle('appointments:create',(_event,token,input)=>{const s=session(token,'appointments.edit');return services.appointments.create(s.clinicId,s.user.id,s.user.displayName,input as AppointmentInput);});
  handle('appointments:update',(_event,token,id,input)=>{const s=session(token,'appointments.edit');return services.appointments.update(String(id),s.clinicId,s.user.id,s.user.displayName,input as Partial<AppointmentInput>);});
  handle('appointments:status',(_event,token,id,status)=>{const s=session(token,'appointments.edit');return services.appointments.setStatus(String(id),s.clinicId,s.user.id,s.user.displayName,status as AppointmentStatus);});

  handle('clinical:visits',(_event,token,request)=>{const s=session(token,'clinical.view');return services.clinical.visits(s.clinicId,request as PageRequest);});
  handle('clinical:create-visit',(_event,token,input)=>{const s=session(token,'clinical.edit');return services.clinical.createVisit(s.clinicId,s.user.id,s.user.displayName,input as VisitInput);});
  handle('clinical:update-visit',(_event,token,id,input)=>{const s=session(token,'clinical.edit');return services.clinical.updateVisit(String(id),s.clinicId,s.user.id,s.user.displayName,input as Partial<VisitInput>);});
  handle('clinical:complete-visit',(_event,token,id)=>{const s=session(token,'clinical.edit');return services.clinical.completeVisit(String(id),s.clinicId,s.user.id,s.user.displayName);});
  handle('clinical:add-note',(_event,token,visitId,note)=>{const s=session(token,'clinical.edit');return services.clinical.addNote(String(visitId),s.clinicId,s.user.id,s.user.displayName,note as Parameters<ClinicalService['addNote']>[4]);});
  handle('clinical:chart',(_event,token,patientId)=>{const s=session(token,'clinical.view');return services.clinical.chart(String(patientId),s.clinicId);});
  handle('clinical:set-chart',(_event,token,entry)=>{const s=session(token,'clinical.edit');return services.clinical.setChartEntry(s.clinicId,s.user.id,s.user.displayName,entry as Parameters<ClinicalService['setChartEntry']>[3]);});
  handle('clinical:prescriptions',(_event,token,patientId)=>{const s=session(token,'clinical.view');return services.clinical.prescriptions(String(patientId),s.clinicId);});
  handle('clinical:create-prescription',(_event,token,input)=>{const s=session(token,'clinical.edit');return services.clinical.createPrescription(s.clinicId,s.user.id,s.user.displayName,input as Parameters<ClinicalService['createPrescription']>[3]);});
  handle('treatment-plans:list',(_event,token,request)=>{const s=session(token,'clinical.view');return services.treatmentPlans.list(s.clinicId,request as PageRequest);});
  handle('treatment-plans:create',(_event,token,input)=>{const s=session(token,'clinical.edit');return services.treatmentPlans.create(s.clinicId,s.user.id,s.user.displayName,input as TreatmentPlanInput);});
  handle('treatment-plans:update',(_event,token,id,input)=>{const s=session(token,'clinical.edit');return services.treatmentPlans.update(String(id),s.clinicId,s.user.id,s.user.displayName,input as TreatmentPlanInput);});

  handle('billing:list',(_event,token,request)=>{const s=session(token,'billing.view');return services.billing.list(s.clinicId,request as PageRequest);});
  handle('billing:get',(_event,token,id)=>{const s=session(token,'billing.view');return services.billing.get(String(id),s.clinicId);});
  handle('billing:create',(_event,token,input)=>{const s=session(token,'billing.edit');return services.billing.create(s.clinicId,s.user.id,s.user.displayName,input as InvoiceInput);});
  handle('billing:issue',(_event,token,id)=>{const s=session(token,'billing.edit');return services.billing.issue(String(id),s.clinicId,s.user.id,s.user.displayName);});
  handle('billing:void',(_event,token,id,reason)=>{const s=session(token,'billing.edit');return services.billing.void(String(id),s.clinicId,s.user.id,s.user.displayName,String(reason));});
  handle('billing:payment',(_event,token,input)=>{const s=session(token,'billing.edit');return services.billing.addPayment(s.clinicId,s.user.id,s.user.displayName,input as PaymentInput);});
  handle('billing:refund',(_event,token,input)=>{const s=session(token,'billing.refund');return services.billing.refund(s.clinicId,s.user.id,s.user.displayName,input as {paymentId:string;amountMinor:number;reason:string});});
  handle('billing:methods',(_event,token)=>{const s=session(token,'billing.view');return services.billing.paymentMethods(s.clinicId);});

  const recordPermission=(entity:string,edit=false)=>entity==='expenses'?(edit?'finances.edit':'finances.view'):entity==='staff'?'staff.manage':entity==='inventory'||entity==='suppliers'?(edit?'inventory.edit':'inventory.view'):entity==='audit'?'audit.view':entity==='attachments'?'documents.manage':entity==='treatments'||entity==='prescriptions'||entity==='referrals'?(edit?'clinical.edit':'clinical.view'):entity==='notifications'?'notifications.manage':'clinical.view';
  handle('records:list',(_event,token,request)=>{const r=request as GenericListRequest;if(r.entity==='staff'&&r.filters?.lookup==='providers'){const s=session(token);if(!['staff.manage','appointments.view','appointments.edit','clinical.view','clinical.edit'].some((permission)=>s.user.permissions.includes(permission)))session(token,'staff.manage');return services.records.list(s.clinicId,r);}const s=session(token,recordPermission(r.entity));return services.records.list(s.clinicId,r);});
  handle('records:create',(_event,token,entity,input)=>{const name=String(entity) as GenericListRequest['entity'];const s=session(token,recordPermission(name,true));return services.records.create(s.clinicId,s.user.id,s.user.displayName,name,input as Record<string,unknown>);});
  handle('records:update',(_event,token,entity,id,input)=>{const name=String(entity) as GenericListRequest['entity'];const s=session(token,recordPermission(name,true));return services.records.update(s.clinicId,s.user.id,s.user.displayName,name,String(id),input as Record<string,unknown>);});

  handle('attachments:add',async(_event,token,input)=>{const s=session(token,'documents.manage');return services.attachments.add(s.clinicId,s.user.id,s.user.displayName,input as Parameters<AttachmentService['add']>[3]);});
  handle('attachments:list',(_event,token,input)=>{const s=session(token,'documents.manage');return services.attachments.list(s.clinicId,input as Parameters<AttachmentService['list']>[1]);});
  handle('attachments:archive',(_event,token,id)=>{const s=session(token,'documents.manage');return services.attachments.archive(String(id),s.clinicId,s.user.id,s.user.displayName);});
  handle('attachments:open',async(_event,token,id)=>{const s=session(token,'documents.manage');const error=await shell.openPath(services.attachments.pathFor(String(id),s.clinicId));if(error)throw new Error(error);});
  handle('attachments:media-url',(_event,token,id)=>{session(token,'documents.manage');return`dentiva-media://attachment/${encodeURIComponent(String(id))}?token=${encodeURIComponent(String(token))}`;});

  handle('reports:summary',(_event,token,range)=>{const s=session(token,'reports.view');return services.insights.report(s.clinicId,range as DateRange);});
  handle('reports:export',async(_event,token,input)=>{const s=session(token,'reports.export');session(token,'reports.view');return services.exports.export(s.clinicId,s.user.id,s.user.displayName,input as Parameters<ExportService['export']>[3]);});

  handle('backup:list',(_event,token)=>{const s=session(token,'backup.create');return services.backup.list(s.clinicId);});
  handle('backup:create',async(_event,token,input)=>{const s=session(token,'backup.create');return services.backup.create(s.clinicId,s.user.id,s.user.displayName,input as Parameters<BackupService['create']>[3]);});
  handle('backup:verify',async(_event,token,file,password)=>{session(token,'backup.create');return services.backup.verifyFile(String(file),password?String(password):undefined);});
  handle('backup:analyze',async(_event,token,file,password)=>{session(token,'backup.restore');return services.backup.analyze(String(file),password?String(password):undefined);});
  handle('backup:restore',async(_event,token,file,selection)=>{const s=session(token,'backup.restore');return services.backup.restore(s.clinicId,s.user.id,s.user.displayName,String(file),selection as RestoreSelection);});

  handle('search:global',(_event,token,query)=>{const s=session(token,'patients.view');return services.insights.globalSearch(s.clinicId,String(query),s.user.permissions);});
  handle('notifications:list',(_event,token)=>{const s=session(token,'notifications.manage');services.insights.generateOperationalNotifications(s.clinicId);return services.insights.notifications(s.clinicId);});
  handle('notifications:read',(_event,token,id)=>{const s=session(token,'notifications.manage');return services.insights.markRead(s.clinicId,id?String(id):undefined);});

  handle('users:list',(_event,token)=>{const s=session(token,'users.manage');return services.users.list(s.clinicId);});
  handle('users:roles',(_event,token)=>{const s=session(token,'users.manage');return services.users.roles(s.clinicId);});
  handle('users:create',(_event,token,input)=>{const s=session(token,'users.manage');return services.users.create(s.clinicId,s.user.id,s.user.displayName,input as UserAccountInput);});
  handle('users:update',(_event,token,id,input)=>{const s=session(token,'users.manage');return services.users.update(s.clinicId,s.user.id,s.user.displayName,String(id),input as Omit<UserAccountInput,'password'>);});
  handle('users:reset-password',(_event,token,id,password)=>{const s=session(token,'users.manage');return services.users.resetPassword(s.clinicId,s.user.id,s.user.displayName,String(id),String(password));});
  handle('users:create-role',(_event,token,input)=>{const s=session(token,'users.manage');return services.users.createRole(s.clinicId,s.user.id,s.user.displayName,input as RoleInput);});
  handle('users:update-role',(_event,token,id,input)=>{const s=session(token,'users.manage');return services.users.updateRole(s.clinicId,s.user.id,s.user.displayName,String(id),input as RoleInput);});
  handle('users:delete-role',(_event,token,id)=>{const s=session(token,'users.manage');return services.users.deleteRole(s.clinicId,s.user.id,s.user.displayName,String(id));});

  handle('settings:get',(_event,token)=>{const s=session(token,'settings.manage');return services.settings.get(s.clinicId);});
  handle('settings:clinic',(_event,token,input)=>{const s=session(token,'settings.manage');return services.settings.updateClinic(s.clinicId,s.user.id,s.user.displayName,input as Parameters<SettingsService['updateClinic']>[3]);});
  handle('settings:logo',(_event,token,sourcePath)=>{const s=session(token,'settings.manage');return services.settings.updateLogo(s.clinicId,s.user.id,s.user.displayName,sourcePath?String(sourcePath):null);});
  handle('settings:payment-methods',(_event,token)=>{const s=session(token,'settings.manage');return services.settings.paymentMethods(s.clinicId);});
  handle('settings:update-payment-methods',(_event,token,methods)=>{const s=session(token,'settings.manage');return services.settings.updatePaymentMethods(s.clinicId,s.user.id,s.user.displayName,methods as string[]);});
  handle('settings:app',(_event,token,input)=>{const s=session(token,'settings.manage');return services.settings.updateApp(s.clinicId,s.user.id,s.user.displayName,input as Parameters<SettingsService['updateApp']>[3]);});

  const documentSession=(token:unknown,request:DocumentRequest)=>{const s=session(token,'printing.use');const permission=request.type==='invoice'||request.type==='receipt'?'billing.view':request.type==='appointment_slip'?'appointments.view':request.type==='patient_summary'?'patients.view':'clinical.view';session(token,permission);return s;};
  handle('documents:preview',(_event,token,request)=>{const input=request as DocumentRequest;const s=documentSession(token,input);return services.documents.preview(s.clinicId,input);});
  handle('documents:pdf',(_event,token,request,destination)=>{const input=request as DocumentRequest;const s=documentSession(token,input);return services.documents.pdf(s.clinicId,s.user.id,s.user.displayName,input,destination?String(destination):undefined);});
  handle('documents:print',(_event,token,request,options)=>{const input=request as DocumentRequest;const s=documentSession(token,input);return services.documents.print(s.clinicId,s.user.id,s.user.displayName,input,options as PrintOptions);});
}
