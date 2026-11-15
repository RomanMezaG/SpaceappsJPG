import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../astrohealth_with_recommendations';
import './styles.css';
import SessionGate from './SessionGate';
import HealthDataProvider from './HealthDataContext';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SessionGate><HealthDataProvider><App /></HealthDataProvider></SessionGate>
  </React.StrictMode>
);
