import{useTranslation}from'react-i18next';
import logo from'../assets/dentiva.svg';
export function Brand({compact=false,inverse=false}:{compact?:boolean;inverse?:boolean}){const{t}=useTranslation();return<div className={`brand-lockup ${compact?'compact':''} ${inverse?'inverse':''}`}><img src={logo}alt="Dentiva"/><div><strong>Dentiva</strong>{!compact&&<span>{t('ui.brandTagline')}</span>}</div></div>}
