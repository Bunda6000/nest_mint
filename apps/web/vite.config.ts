import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Local development: forward /api calls to the NestJS API.
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: { environment: 'jsdom' },
});
