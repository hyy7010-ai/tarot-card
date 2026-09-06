import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { DEMO_MESSAGES, MY_UID, OTHER_NAME } from './demo-messages';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App messages={DEMO_MESSAGES} myUid={MY_UID} otherName={OTHER_NAME} />
  </React.StrictMode>,
);
