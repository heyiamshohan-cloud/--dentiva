import React from'react';
import{createRoot}from'react-dom/client';
import'@fontsource/inter/400.css';
import'@fontsource/inter/500.css';
import'@fontsource/inter/600.css';
import'@fontsource/inter/700.css';
import'@fontsource/noto-sans-bengali/400.css';
import'@fontsource/noto-sans-bengali/500.css';
import'@fontsource/noto-sans-bengali/600.css';
import'./i18n';
import'./styles/global.css';
import App from'./App';
import{ErrorBoundary}from'./components/ErrorBoundary';

createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App/></ErrorBoundary></React.StrictMode>);
