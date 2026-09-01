export const guardianChannels = {
  open: 'guardian:open',
  dragStart: 'guardian:drag-start',
  dragMove: 'guardian:drag-move',
  dragEnd: 'guardian:drag-end',
  contextMenu: 'guardian:context-menu',
} as const

export type GuardianOpenAction = 'ask' | 'open'
