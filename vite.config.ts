import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')

  console.log('🔍 Vite loading with mode:', mode)
  console.log('🔍 VITE_META_ACCESS_TOKEN from .env:', env.VITE_META_ACCESS_TOKEN ? 'LOADED ✅' : 'MISSING ❌')
  console.log('🔍 VITE_OPENAI_API_KEY from .env:', env.VITE_OPENAI_API_KEY ? 'LOADED ✅' : 'MISSING ❌')

  // Use PORT env var (set by Conductor) or fall back to 5175
  const port = parseInt(process.env.PORT || '5175', 10)
  console.log('🔍 Server port:', port)

  return {
    plugins: [react()],
    server: {
      port,
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
    },
  }
})
