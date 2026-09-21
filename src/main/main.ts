import { app, BrowserWindow, dialog, nativeTheme, net, protocol, session, shell } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { DentivaDatabase } from './database/database.js';
import { registerIpc } from './ipc/register-ipc.js';
import { AuditService, SessionService } from './security/security.js';
import { AppointmentService } from './services/appointment-service.js';
import { AttachmentService } from './services/attachment-service.js';
import { BackupService } from './services/backup-service.js';
import { BillingService } from './services/billing-service.js';
import { ClinicalService } from './services/clinical-service.js';
import { DocumentService } from './services/document-service.js';
import { ExportService } from './services/export-service.js';
import { HealthService } from './services/health-service.js';
import { InsightsService } from './services/insights-service.js';
import { PatientService } from './services/patient-service.js';
import { RecordsService } from './services/records-service.js';
import { SettingsService } from './services/settings-service.js';
import { SetupService } from './services/setup-service.js';
import { TreatmentPlanService } from './services/treatment-plan-service.js';
import { UserService } from './services/user-service.js';
import { AppLogger } from './utils/logger.js';
import { DentivaPaths } from './utils/paths.js';

protocol.registerSchemesAsPrivileged([{scheme:'dentiva-media',privileges:{secure:true,standard:true,supportFetchAPI:true,stream:true,corsEnabled:false}}]);

let mainWindow:BrowserWindow|null=null;
let database:DentivaDatabase|undefined;
let logger:AppLogger|undefined;
const smokeTest=process.argv.includes('--smoke-test');

const hasLock=app.requestSingleInstanceLock();
if(!hasLock)app.quit();
else app.on('second-instance',()=>{if(mainWindow){if(mainWindow.isMinimized())mainWindow.restore();mainWindow.show();mainWindow.focus();}});

async function start():Promise<void>{
  nativeTheme.themeSource='light';app.setAppUserModelId('com.dentiva.desktop');
  const paths=DentivaPaths.fromElectron();paths.ensure();logger=new AppLogger(paths.logs);logger.info('Dentiva starting',{version:app.getVersion(),platform:process.platform,arch:process.arch});
  try{database=new DentivaDatabase(paths,logger);}catch(error){logger.error('Database startup failed',error);if(!smokeTest)dialog.showErrorBox('Dentiva could not start','The local database could not be opened safely. No data was changed. Review the diagnostic log or contact support.');process.exitCode=1;app.quit();return;}
  const audit=new AuditService(database);const sessions=new SessionService(database,audit,logger);const setup=new SetupService(database,paths,sessions,audit,app.getVersion());const patients=new PatientService(database,audit);const appointments=new AppointmentService(database,audit);const clinical=new ClinicalService(database,audit);const billing=new BillingService(database,audit);const records=new RecordsService(database,audit);const treatmentPlans=new TreatmentPlanService(database,audit);const users=new UserService(database,audit);const attachments=new AttachmentService(database,paths,audit);const insights=new InsightsService(database);const backup=new BackupService(database,paths,audit,logger,app.getVersion());const settings=new SettingsService(database,audit,paths);const documents=new DocumentService(database,paths,audit,()=>mainWindow);const exports=new ExportService(database,paths,audit,documents);const health=new HealthService(database,paths,app.getVersion());

  const windowIcon=app.isPackaged?path.join(process.resourcesPath,'icons','dentiva-256.png'):path.join(process.cwd(),'resources','icons','dentiva-256.png');
  mainWindow=new BrowserWindow({width:1500,height:940,minWidth:1080,minHeight:700,show:false,backgroundColor:'#f6f7f9',title:'Dentiva',icon:windowIcon,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.js'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,spellcheck:true}});
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(({url})=>{if(url.startsWith('https://')||url.startsWith('mailto:'))void shell.openExternal(url);return{action:'deny'};});
  mainWindow.webContents.on('will-navigate',(event,url)=>{const allowed=process.env.DENTIVA_DEV_URL&&url.startsWith(process.env.DENTIVA_DEV_URL);if(!url.startsWith('file:')&&!allowed)event.preventDefault();});
  session.defaultSession.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  registerIpc({setup,sessions,patients,appointments,clinical,billing,records,treatmentPlans,users,attachments,insights,backup,settings,documents,exports,health,logger},()=>mainWindow);

  protocol.handle('dentiva-media',(request)=>{try{const url=new URL(request.url);const id=decodeURIComponent(url.pathname.replace(/^\//,''));const token=url.searchParams.get('token')??'';const current=sessions.require(token,'documents.manage');const file=attachments.pathFor(id,current.clinicId);return net.fetch(pathToFileURL(file).toString());}catch{return new Response('Document unavailable',{status:404,headers:{'Content-Type':'text/plain','Cache-Control':'no-store'}});}});

  const devUrl=process.env.DENTIVA_DEV_URL;
  if(devUrl)await mainWindow.loadURL(devUrl);else await mainWindow.loadFile(path.join(__dirname,'..','renderer','index.html'));
  if(smokeTest){await new Promise((resolve)=>setTimeout(resolve,1000));const rendered=await mainWindow.webContents.executeJavaScript("Boolean(document.querySelector('#root')?.children.length)");if(!rendered||database.integrityCheck()!=='ok'||database.foreignKeyCheck().length)throw new Error('Packaged startup smoke test failed.');logger.info('Packaged startup smoke test passed');console.log('DENTIVA_SMOKE_TEST_OK');app.quit();return;}
  mainWindow.once('ready-to-show',()=>mainWindow?.show());mainWindow.on('closed',()=>{mainWindow=null;});
  database.optimize();
}

app.whenReady().then(start).catch((error)=>{logger?.error('Fatal startup error',error);if(smokeTest)console.error(error);else dialog.showErrorBox('Dentiva could not start','An unexpected startup error occurred. Diagnostic details were saved securely.');process.exitCode=1;app.quit();});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{try{database?.optimize();database?.close();}catch(error){logger?.error('Database shutdown error',error);}});
process.on('uncaughtException',(error)=>logger?.error('Uncaught process error',error));
process.on('unhandledRejection',(error)=>logger?.error('Unhandled operation rejection',error));
