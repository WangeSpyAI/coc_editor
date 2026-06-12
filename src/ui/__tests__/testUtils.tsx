import type { ReactElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

export function createDomRenderer() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)

  return {
    container,
    render(ui: ReactElement) {
      act(() => {
        root.render(ui)
      })
    },
    cleanup() {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

export function click(element: Element) {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

export function changeSelect(select: HTMLSelectElement, value: string) {
  act(() => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}
