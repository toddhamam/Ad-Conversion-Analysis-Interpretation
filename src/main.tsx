// import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// CRITICAL: This log MUST appear first if new code is loading
console.log('%c🚀🚀🚀 NEW BUILD LOADED - PORT 5175 🚀🚀🚀', 'background: #00ff00; color: #000; font-size: 20px; font-weight: bold; padding: 10px;');
console.log('🔧 VITE_META_ACCESS_TOKEN:', import.meta.env.VITE_META_ACCESS_TOKEN);
console.log('📊 Token length:', import.meta.env.VITE_META_ACCESS_TOKEN?.length || 0);
console.log('📊 Token first 30 chars:', import.meta.env.VITE_META_ACCESS_TOKEN?.substring(0, 30) || 'MISSING');

// Note: StrictMode temporarily disabled to debug rendering issues
// StrictMode causes double-rendering in development which can cause issues
// with async operations and localStorage parsing
createRoot(document.getElementById('root')!).render(
  // <StrictMode>
    <App />
  // </StrictMode>,
)
