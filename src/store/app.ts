import { defineStore } from 'pinia'
import { ref } from 'vue'

export type AppMode = 'editor' | 'session'

export const useAppStore = defineStore('app', () => {
  const mode = ref<AppMode>('editor')

  function setMode(m: AppMode) {
    mode.value = m
  }

  return { mode, setMode }
})
