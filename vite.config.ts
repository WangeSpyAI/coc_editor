import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/coc_editor/',
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
