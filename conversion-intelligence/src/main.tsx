import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Force rebuild - 2026-01-11T07:15:00Z
console.log('🚀 APP LOADED - BUILD TIMESTAMP: 2026-01-11T07:19:00Z');
console.log('🔧 VITE_META_ACCESS_TOKEN:', import.meta.env.VITE_META_ACCESS_TOKEN ? import.meta.env.VITE_META_ACCESS_TOKEN.substring(0, 20) + '...' : 'UNDEFINED');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
