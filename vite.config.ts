import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/coc_editor/',
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    pool: 'threads',
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
