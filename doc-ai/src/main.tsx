import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { IndexedDBService } from './services/indexedDBService.ts'

// Initialize IndexedDB on app startup
IndexedDBService.initialize().then(() => {
  console.log('IndexedDB initialized on app startup');
}).catch((error) => {
  console.error('Failed to initialize IndexedDB on startup:', error);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
