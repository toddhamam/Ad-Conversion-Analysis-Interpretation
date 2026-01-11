import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')

  console.log('🔍 Vite loading with mode:', mode)
  console.log('🔍 VITE_META_ACCESS_TOKEN from .env:', env.VITE_META_ACCESS_TOKEN ? 'LOADED ✅' : 'MISSING ❌')

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
      // Fallback: If .env doesn't load, hardcode the values
      'import.meta.env.VITE_META_APP_ID': JSON.stringify(env.VITE_META_APP_ID || '1988473538733760'),
      'import.meta.env.VITE_META_APP_SECRET': JSON.stringify(env.VITE_META_APP_SECRET || '34e5c0b784961658f3e17b350c8cec37'),
      'import.meta.env.VITE_META_ACCESS_TOKEN': JSON.stringify(env.VITE_META_ACCESS_TOKEN || 'EAAcQgZALr5sABQbZAczCrfFyaAwhfYNOXoJL0GKBiBa5sW93Ir5yAFLGcraR1aIioNBS8FHg6SoXpWtRZAiDq0xZC3UHQAdebmyqhbNWuhdvaZCi14zznsW6CPG1vAU7FyKPbaU9Wm7il43JfMKuTCI4GZBREgMTltyH1YvHSpQiPLNLQifdNiNAsdu4FQEsCo2xFZBdElylrrQ'),
      'import.meta.env.VITE_META_AD_ACCOUNT_ID': JSON.stringify(env.VITE_META_AD_ACCOUNT_ID || 'act_998694289081563'),
    },
  }
})
