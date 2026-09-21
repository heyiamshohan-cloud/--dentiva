import React,{createContext,useCallback,useContext,useEffect,useMemo,useRef,useState}from'react';
import type{ApiResult,AppBootstrap,Language,Session}from'../../shared/types';
import i18n from'../i18n';

export type PageName='dashboard'|'patients'|'appointments'|'clinical'|'billing'|'invoices'|'reports'|'inventory'|'staff'|'expenses'|'financials'|'backup'|'documents'|'notifications'|'settings'|'about';
interface Toast{ id:number;type:'success'|'error'|'info'|'warning';message:string; }
interface NavOptions{patientId?:string;recordId?:string;action?:string;}
interface AppContextValue{
  bootstrap:AppBootstrap|null;session:Session|null;loading:boolean;page:PageName;navOptions:NavOptions;toasts:Toast[];
  language:Language;setLanguage:(language:Language)=>void;setSession:(session:Session|null)=>void;refreshBootstrap:()=>Promise<void>;
  navigate:(page:PageName,options?:NavOptions)=>void;notify:(type:Toast['type'],message:string)=>void;dismissToast:(id:number)=>void;
  run:<T>(operation:()=>Promise<ApiResult<T>>,fallback?:string)=>Promise<T>;lock:()=>Promise<void>;logout:()=>Promise<void>;
}
const Context=createContext<AppContextValue|null>(null);

export function AppProvider({children}:{children:React.ReactNode}){
  const[bootstrap,setBootstrap]=useState<AppBootstrap|null>(null);const[session,setSessionState]=useState<Session|null>(null);const[loading,setLoading]=useState(true);
  const[page,setPage]=useState<PageName>('dashboard');const[navOptions,setNavOptions]=useState<NavOptions>({});const[toasts,setToasts]=useState<Toast[]>([]);
  const[language,setLanguageState]=useState<Language>(()=>(localStorage.getItem('dentiva.language')==='bn'?'bn':'en'));const counter=useRef(0);const lastTouch=useRef(0);
  const notify=useCallback((type:Toast['type'],message:string)=>{const id=++counter.current;setToasts((items)=>[...items.slice(-3),{id,type,message}]);window.setTimeout(()=>setToasts((items)=>items.filter((item)=>item.id!==id)),5500);},[]);
  const dismissToast=useCallback((id:number)=>setToasts((items)=>items.filter((item)=>item.id!==id)),[]);
  const setSession=useCallback((value:Session|null)=>{setSessionState(value);if(value){const next=value.user.language;setLanguageState(next);void i18n.changeLanguage(next);}},[]);
  const refreshBootstrap=useCallback(async()=>{setLoading(true);const result=await window.dentiva.app.bootstrap();if(result.ok&&result.data){setBootstrap(result.data);if(!localStorage.getItem('dentiva.language')){setLanguageState(result.data.language);void i18n.changeLanguage(result.data.language);}}else notify('error',result.error?.message??'Dentiva could not load clinic configuration.');setLoading(false);},[notify]);
  useEffect(()=>{void i18n.changeLanguage(language);document.documentElement.lang=language;document.documentElement.dir='ltr';localStorage.setItem('dentiva.language',language);},[language]);
  useEffect(()=>{void refreshBootstrap();},[refreshBootstrap]);
  const setLanguage=useCallback((next:Language)=>{setLanguageState(next);void i18n.changeLanguage(next);},[]);
  const navigate=useCallback((next:PageName,options:NavOptions={})=>{setPage(next);setNavOptions(options);},[]);
  const run=useCallback(async<T,>(operation:()=>Promise<ApiResult<T>>,fallback='The operation could not be completed.'):Promise<T>=>{const result=await operation();if(result.ok)return result.data as T;const message=result.error?.message??fallback;if(['SESSION_EXPIRED','SESSION_REQUIRED'].includes(result.error?.code??'')){setSessionState(null);notify('warning',message);}else notify('error',message);throw new Error(message);},[notify]);
  const lock=useCallback(async()=>{if(session)await window.dentiva.auth.lock(session.token);setSessionState(null);},[session]);
  const logout=useCallback(async()=>{if(session)await window.dentiva.auth.logout(session.token);setSessionState(null);setPage('dashboard');},[session]);
  useEffect(()=>{if(!session)return;let timer:number;const activity=()=>{window.clearTimeout(timer);const expiry=Math.max(1000,Date.parse(session.expiresAt)-Date.now());timer=window.setTimeout(()=>void lock(),expiry);if(Date.now()-lastTouch.current>60_000){lastTouch.current=Date.now();void window.dentiva.auth.touch(session.token).then((result)=>{if(result.ok&&result.data)setSessionState((current)=>current?{...current,expiresAt:result.data!.expiresAt}:null);});}};const events=['mousedown','keydown','touchstart'] as const;events.forEach((event)=>window.addEventListener(event,activity,{passive:true}));activity();return()=>{window.clearTimeout(timer);events.forEach((event)=>window.removeEventListener(event,activity));};},[session,lock]);
  const value=useMemo<AppContextValue>(()=>({bootstrap,session,loading,page,navOptions,toasts,language,setLanguage,setSession,refreshBootstrap,navigate,notify,dismissToast,run,lock,logout}),[bootstrap,session,loading,page,navOptions,toasts,language,setLanguage,setSession,refreshBootstrap,navigate,notify,dismissToast,run,lock,logout]);
  return<Context.Provider value={value}>{children}</Context.Provider>;
}
export function useApp(){const value=useContext(Context);if(!value)throw new Error('App context is unavailable');return value;}
