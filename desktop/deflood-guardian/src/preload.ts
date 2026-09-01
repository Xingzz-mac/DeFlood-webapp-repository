import { contextBridge, ipcRenderer } from 'electron'

type GuardianOpenAction = 'ask' | 'open'

// Keep the sandboxed preload self-contained: Electron's sandbox intentionally
// restricts preload modules to a small safe subset.
const guardianChannels = {
  open: 'guardian:open',
  dragStart: 'guardian:drag-start',
  dragMove: 'guardian:drag-move',
  dragEnd: 'guardian:drag-end',
  contextMenu: 'guardian:context-menu',
} as const

contextBridge.exposeInMainWorld('defloodGuardian', Object.freeze({
  open: (action: GuardianOpenAction): Promise<boolean> => ipcRenderer.invoke(guardianChannels.open, action),
  dragStart: (screenX: number, screenY: number): void => {
    ipcRenderer.send(guardianChannels.dragStart, { screenX, screenY })
  },
  dragMove: (screenX: number, screenY: number): void => {
    ipcRenderer.send(guardianChannels.dragMove, { screenX, screenY })
  },
  dragEnd: (): void => {
    ipcRenderer.send(guardianChannels.dragEnd)
  },
  showContextMenu: (): void => {
    ipcRenderer.send(guardianChannels.contextMenu)
  },
}))
