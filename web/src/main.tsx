import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useData } from './state/data';
import { initFromUrl, syncUrl } from './state/store';
import './styles/base.css';
import { startI18n } from './i18n';

initFromUrl();
syncUrl();
useData.getState().loadAll();
startI18n();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
