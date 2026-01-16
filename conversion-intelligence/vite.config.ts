import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')

  console.log('🔍 Vite loading with mode:', mode)
  console.log('🔍 VITE_META_ACCESS_TOKEN from .env:', env.VITE_META_ACCESS_TOKEN ? 'LOADED ✅' : 'MISSING ❌')
  console.log('🔍 VITE_OPENAI_API_KEY from .env:', env.VITE_OPENAI_API_KEY ? 'LOADED ✅' : 'MISSING ❌')

  return {
    plugins: [react()],
    server: {
      port: 5175,
      host: '0.0.0.0',
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store',
      },
    },
    define: {
      'process.env.BUILD_TIME': JSON.stringify(new Date().toISOString()),
      // Load from .env file - no hardcoded secrets
      'import.meta.env.VITE_META_APP_ID': JSON.stringify(env.VITE_META_APP_ID || ''),
      'import.meta.env.VITE_META_APP_SECRET': JSON.stringify(env.VITE_META_APP_SECRET || ''),
      'import.meta.env.VITE_META_ACCESS_TOKEN': JSON.stringify(env.VITE_META_ACCESS_TOKEN || ''),
      'import.meta.env.VITE_META_AD_ACCOUNT_ID': JSON.stringify(env.VITE_META_AD_ACCOUNT_ID || ''),
      'import.meta.env.VITE_OPENAI_API_KEY': JSON.stringify(env.VITE_OPENAI_API_KEY || ''),
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || ''),
    },
  }
})
