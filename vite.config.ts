import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: '/coc_editor/',
  plugins: [vue()],
})
