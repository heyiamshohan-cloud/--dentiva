import{useEffect,useRef,useState}from'react';
import{Search,UserRound,X}from'lucide-react';
import{useTranslation}from'react-i18next';
import type{Patient}from'../../shared/types';
import{useApp}from'../context/AppContext';

export function PatientPicker({value,onChange,disabled=false}:{value:{id:string;label:string}|null;onChange:(value:{id:string;label:string}|null)=>void;disabled?:boolean}){const{t}=useTranslation();const{session}=useApp();const[query,setQuery]=useState('');const[items,setItems]=useState<Patient[]>([]);const[open,setOpen]=useState(false);const timer=useRef<number | undefined>(undefined);
  useEffect(()=>{if(!open||!session)return;window.clearTimeout(timer.current);timer.current=window.setTimeout(async()=>{const result=await window.dentiva.patients.list(session.token,{page:1,pageSize:20,search:query,sortBy:'fullName',sortDirection:'asc'});if(result.ok)setItems(result.data?.items??[]);},180);return()=>window.clearTimeout(timer.current);},[query,open,session]);
  if(value)return<div className="patient-picker selected"><span className="avatar"><UserRound size={16}/></span><b>{value.label}</b><button type="button"aria-label={t('common.clear')}onClick={()=>onChange(null)}disabled={disabled}><X size={16}/></button></div>;
  return<div className="patient-picker"><Search size={17}/><input value={query}onChange={(event)=>{setQuery(event.target.value);setOpen(true);}}onFocus={()=>setOpen(true)}placeholder={t('patients.search')}disabled={disabled}/>{open&&<div className="picker-popover">{items.length===0?<span>{t('common.noResults')}</span>:items.map((patient)=><button type="button"key={patient.id}onClick={()=>{onChange({id:patient.id,label:`${patient.fullName} · ${patient.patientCode}`});setOpen(false);setQuery('');}}><b>{patient.fullName}</b><small>{patient.patientCode} · {patient.phone}</small></button>)}</div>}</div>;
}
