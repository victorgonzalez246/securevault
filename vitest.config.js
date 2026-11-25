import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    setupFiles: ['test/setup.js'],
    fileParallelism: false, // comparten la BD de pruebas
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
