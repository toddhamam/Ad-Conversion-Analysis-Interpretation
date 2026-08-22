import { defineConfig } from 'vitest/config';

// Unit tests only — pure logic (analysis modes, cache/storage helpers). No DOM environment is
// needed: the one browser API under test (localStorage) is stubbed per-test, which keeps the suite
// dependency-light and fast.
export default defineConfig({
  test: {
    environment: 'node',
    // api/ is included so the SSRF guard is covered. It is the only place in the app that
    // fetches a user-chosen host, and its IP-range logic is pure and node-safe.
    include: ['src/**/*.test.ts', 'api/**/*.test.ts'],
    // Lets tests exercise code paths behind `isOpenAIConfigured()`. No real credential: the
    // network layer is stubbed in every test that reaches it.
    env: {
      VITE_SUPABASE_URL: 'https://test.supabase.invalid',
      // Same reason: lets tests reach the image-generation prompt builders behind
      // isGeminiConfigured(). Read at module scope in openaiApi.ts, so vi.stubEnv after
      // import is too late — it has to be set here.
      VITE_GEMINI_API_KEY: 'test-gemini-key',
    },
  },
});
