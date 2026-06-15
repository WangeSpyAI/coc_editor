import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppV6 } from './ui-v6/AppV6'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppV6 />
  </StrictMode>,
)
