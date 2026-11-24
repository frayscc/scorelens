import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './pages/App';
import { AccountGate } from './pages/AccountGate';
import './styles/app.css';
import './styles/classes.css';
import './styles/import-wizard.css';
import './styles/settings.css';
import './styles/analysis.css';
import './styles/profile.css';
import './styles/phase5.css';
import './styles/phase6.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><AccountGate><App /></AccountGate></React.StrictMode>,
);
