import { defineConfig } from 'vitest/config';

// Unit tests only — pure logic (analysis modes, cache/storage helpers). No DOM environment is
// needed: the one browser API under test (localStorage) is stubbed per-test, which keeps the suite
// dependency-light and fast.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Lets tests exercise code paths behind `isOpenAIConfigured()`. No real credential: the
    // network layer is stubbed in every test that reaches it.
    env: {
      VITE_SUPABASE_URL: 'https://test.supabase.invalid',
    },
  },
});
