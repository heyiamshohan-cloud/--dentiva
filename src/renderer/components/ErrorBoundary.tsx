import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from './UI.js';

interface State { error:Error|null; }

function ErrorFallback({error,onRetry}:{error:Error;onRetry:()=>void}){
  const {t}=useTranslation();
  return <main className="fatal-error" role="alert" aria-live="assertive">
    <section className="fatal-error-card">
      <span className="fatal-error-icon"><AlertTriangle/></span>
      <p className="eyebrow">{t('errorBoundary.eyebrow')}</p>
      <h1>{t('errorBoundary.title')}</h1>
      <p>{t('errorBoundary.body')}</p>
      <details><summary>{t('errorBoundary.details')}</summary><pre>{error.message}</pre></details>
      <div className="fatal-error-actions"><Button variant="secondary" icon={RotateCcw} onClick={onRetry}>{t('errorBoundary.retry')}</Button><Button icon={RefreshCw} onClick={()=>window.location.reload()}>{t('errorBoundary.reload')}</Button></div>
      <small>{t('errorBoundary.safety')}</small>
    </section>
  </main>;
}

export class ErrorBoundary extends Component<{children:ReactNode},State>{
  state:State={error:null};
  static getDerivedStateFromError(error:Error):State{return{error};}
  componentDidCatch(error:Error,info:ErrorInfo):void{console.error('Dentiva renderer failure',error,info.componentStack);}
  render():ReactNode{return this.state.error?<ErrorFallback error={this.state.error} onRetry={()=>this.setState({error:null})}/>:this.props.children;}
}
