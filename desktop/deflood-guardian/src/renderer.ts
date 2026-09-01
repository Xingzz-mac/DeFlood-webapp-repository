type GuardianOpenAction = 'ask' | 'open'

interface GuardianBridge {
  open: (action: GuardianOpenAction) => Promise<boolean>
  dragStart: (screenX: number, screenY: number) => void
  dragMove: (screenX: number, screenY: number) => void
  dragEnd: () => void
  showContextMenu: () => void
}

const guardian = document.querySelector<HTMLElement>('[data-guardian]')
const askButton = document.querySelector<HTMLButtonElement>('[data-action="ask"]')
const openButton = document.querySelector<HTMLButtonElement>('[data-action="open"]')
const bubble = document.querySelector<HTMLElement>('.help-bubble')

if (!guardian || !askButton || !openButton || !bubble) {
  throw new Error('Guardian controls are missing from the local renderer.')
}

const bridge = (window as typeof window & { defloodGuardian: GuardianBridge }).defloodGuardian

const DRAG_THRESHOLD_PX = 6
let pointerStart: { x: number; y: number; screenX: number; screenY: number } | null = null
let dragging = false
let bubbleHideTimer: ReturnType<typeof setTimeout> | null = null

function showBubble(): void {
  if (bubbleHideTimer) clearTimeout(bubbleHideTimer)
  bubbleHideTimer = null
  document.querySelector('.guardian-shell')?.classList.add('bubble-visible')
}

function scheduleBubbleHide(): void {
  if (bubbleHideTimer) clearTimeout(bubbleHideTimer)
  bubbleHideTimer = setTimeout(() => {
    document.querySelector('.guardian-shell')?.classList.remove('bubble-visible')
    bubbleHideTimer = null
  }, 120)
}

async function openDeFlood(action: GuardianOpenAction): Promise<void> {
  try {
    await bridge.open(action)
  } catch {
    // Main process presents the safe user-facing failure dialog.
  }
}

guardian.addEventListener('pointerdown', event => {
  if (event.button !== 0) return
  pointerStart = {
    x: event.clientX,
    y: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
  }
  dragging = false
  guardian.setPointerCapture(event.pointerId)
})

guardian.addEventListener('pointerenter', showBubble)
guardian.addEventListener('pointerleave', scheduleBubbleHide)
guardian.addEventListener('focus', showBubble)
guardian.addEventListener('blur', scheduleBubbleHide)
bubble.addEventListener('pointerenter', showBubble)
bubble.addEventListener('pointerleave', scheduleBubbleHide)

guardian.addEventListener('pointermove', event => {
  if (!pointerStart) return
  const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y)
  if (!dragging && distance >= DRAG_THRESHOLD_PX) {
    dragging = true
    bridge.dragStart(pointerStart.screenX, pointerStart.screenY)
  }
  if (dragging) bridge.dragMove(event.screenX, event.screenY)
})

guardian.addEventListener('pointerup', event => {
  if (!pointerStart) return
  guardian.releasePointerCapture(event.pointerId)
  const wasDragging = dragging
  pointerStart = null
  dragging = false
  if (wasDragging) {
    bridge.dragEnd()
    return
  }
  void openDeFlood('ask')
})

guardian.addEventListener('pointercancel', () => {
  if (dragging) bridge.dragEnd()
  pointerStart = null
  dragging = false
})

guardian.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  void openDeFlood('ask')
})

askButton.addEventListener('click', () => { void openDeFlood('ask') })
openButton.addEventListener('click', () => { void openDeFlood('open') })

document.addEventListener('contextmenu', event => {
  event.preventDefault()
  bridge.showContextMenu()
})
