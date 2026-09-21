import { contextBridge, ipcRenderer } from 'electron';
import type { DentivaApi } from '../shared/types.js';

const invoke=<T>(channel:string,...args:unknown[])=>ipcRenderer.invoke(channel,...args) as Promise<T>;

const api:DentivaApi={
  app:{
    bootstrap:()=>invoke('app:bootstrap'),
    chooseFile:(options)=>invoke('app:choose-file',options),
    chooseDirectory:(title)=>invoke('app:choose-directory',title),
    getPrinters:()=>invoke('app:printers'),
    health:(token)=>invoke('app:health',token),
    openExternal:(url)=>invoke('app:open-external',url)
  },
  setup:{complete:(input)=>invoke('setup:complete',input)},
  auth:{
    login:(input)=>invoke('auth:login',input),logout:(token)=>invoke('auth:logout',token),lock:(token)=>invoke('auth:lock',token),
    touch:(token)=>invoke('auth:touch',token),changePassword:(token,input)=>invoke('auth:change-password',token,input)
  },
  dashboard:{get:(token,range)=>invoke('dashboard:get',token,range)},
  patients:{
    list:(token,request)=>invoke('patients:list',token,request),get:(token,id)=>invoke('patients:get',token,id),duplicates:(token,input)=>invoke('patients:duplicates',token,input),
    create:(token,input)=>invoke('patients:create',token,input),update:(token,id,input)=>invoke('patients:update',token,id,input),archive:(token,id)=>invoke('patients:archive',token,id),restore:(token,id)=>invoke('patients:restore',token,id)
  },
  appointments:{
    list:(token,request)=>invoke('appointments:list',token,request),create:(token,input)=>invoke('appointments:create',token,input),update:(token,id,input)=>invoke('appointments:update',token,id,input),
    setStatus:(token,id,status)=>invoke('appointments:status',token,id,status),day:(token,date)=>invoke('appointments:day',token,date)
  },
  clinical:{
    visits:(token,request)=>invoke('clinical:visits',token,request),createVisit:(token,input)=>invoke('clinical:create-visit',token,input),updateVisit:(token,id,input)=>invoke('clinical:update-visit',token,id,input),
    completeVisit:(token,id)=>invoke('clinical:complete-visit',token,id),addNote:(token,visitId,note)=>invoke('clinical:add-note',token,visitId,note),chart:(token,patientId)=>invoke('clinical:chart',token,patientId),
    setChartEntry:(token,entry)=>invoke('clinical:set-chart',token,entry),prescriptions:(token,patientId)=>invoke('clinical:prescriptions',token,patientId),createPrescription:(token,input)=>invoke('clinical:create-prescription',token,input)
  },
  treatmentPlans:{list:(token,request)=>invoke('treatment-plans:list',token,request),create:(token,input)=>invoke('treatment-plans:create',token,input),update:(token,id,input)=>invoke('treatment-plans:update',token,id,input)},
  billing:{
    list:(token,request)=>invoke('billing:list',token,request),get:(token,id)=>invoke('billing:get',token,id),create:(token,input)=>invoke('billing:create',token,input),issue:(token,id)=>invoke('billing:issue',token,id),
    void:(token,id,reason)=>invoke('billing:void',token,id,reason),addPayment:(token,input)=>invoke('billing:payment',token,input),refund:(token,input)=>invoke('billing:refund',token,input),paymentMethods:(token)=>invoke('billing:methods',token)
  },
  records:{
    list:(token,request)=>invoke('records:list',token,request),create:(token,entity,input)=>invoke('records:create',token,entity,input),update:(token,entity,id,input)=>invoke('records:update',token,entity,id,input)
  },
  attachments:{
    add:(token,input)=>invoke('attachments:add',token,input),list:(token,input)=>invoke('attachments:list',token,input),archive:(token,id)=>invoke('attachments:archive',token,id),
    open:(token,id)=>invoke('attachments:open',token,id),mediaUrl:(token,id)=>invoke('attachments:media-url',token,id)
  },
  reports:{summary:(token,range)=>invoke('reports:summary',token,range),export:(token,input)=>invoke('reports:export',token,input)},
  backup:{
    list:(token)=>invoke('backup:list',token),create:(token,input)=>invoke('backup:create',token,input),verify:(token,path,password)=>invoke('backup:verify',token,path,password),
    analyze:(token,path,password)=>invoke('backup:analyze',token,path,password),restore:(token,path,selection)=>invoke('backup:restore',token,path,selection)
  },
  search:{global:(token,query)=>invoke('search:global',token,query)},
  notifications:{list:(token)=>invoke('notifications:list',token),markRead:(token,id)=>invoke('notifications:read',token,id)},
  users:{list:(token)=>invoke('users:list',token),roles:(token)=>invoke('users:roles',token),create:(token,input)=>invoke('users:create',token,input),update:(token,id,input)=>invoke('users:update',token,id,input),resetPassword:(token,id,password)=>invoke('users:reset-password',token,id,password),createRole:(token,input)=>invoke('users:create-role',token,input),updateRole:(token,id,input)=>invoke('users:update-role',token,id,input),deleteRole:(token,id)=>invoke('users:delete-role',token,id)},
  settings:{get:(token)=>invoke('settings:get',token),updateClinic:(token,input)=>invoke('settings:clinic',token,input),updateLogo:(token,sourcePath)=>invoke('settings:logo',token,sourcePath),paymentMethods:(token)=>invoke('settings:payment-methods',token),updatePaymentMethods:(token,methods)=>invoke('settings:update-payment-methods',token,methods),updateApp:(token,input)=>invoke('settings:app',token,input)},
  documents:{preview:(token,request)=>invoke('documents:preview',token,request),pdf:(token,request,destination)=>invoke('documents:pdf',token,request,destination),print:(token,request,options)=>invoke('documents:print',token,request,options)}
};

contextBridge.exposeInMainWorld('dentiva',api);
