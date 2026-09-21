import{AppProvider,useApp}from'./context/AppContext';
import{Shell}from'./components/Shell';
import{LoadingState,ToastViewport}from'./components/UI';
import{SetupWizard}from'./pages/SetupWizard';
import{Login}from'./pages/Login';
function AppGate(){const{loading,bootstrap,session}=useApp();if(loading||!bootstrap)return<div className="startup-screen"><div className="startup-mark">D</div><LoadingState/></div>;if(!bootstrap.configured)return<><SetupWizard/><ToastViewport/></>;if(!session)return<><Login/><ToastViewport/></>;return<Shell/>}
export default function App(){return<AppProvider><AppGate/></AppProvider>}
