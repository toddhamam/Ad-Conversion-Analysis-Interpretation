// import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import './index.css'
import App from './App.tsx'

// Dev-only build indicator (no sensitive data)
if (import.meta.env.DEV) {
  console.log('Convertra dev build loaded');
  console.log('Meta token configured:', !!import.meta.env.VITE_META_ACCESS_TOKEN);
}

// Note: StrictMode temporarily disabled to debug rendering issues
// StrictMode causes double-rendering in development which can cause issues
// with async operations and localStorage parsing
createRoot(document.getElementById('root')!).render(
  // <StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  // </StrictMode>,
)
