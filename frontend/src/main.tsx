import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './styles/variables.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/pages.css';
import './styles/report.css';
import './styles/responsive.css';
import './styles/auth.css';
import './styles/landing.css';

import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
