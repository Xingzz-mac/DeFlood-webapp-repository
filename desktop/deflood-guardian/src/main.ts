import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray,
  type IpcMainEvent,
} from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { guardianChannels, type GuardianOpenAction } from './shared/channels.js'
import {
  clampPositionToWorkArea,
  defaultGuardianPosition,
  resolveGuardianPosition,
  type DisplayWorkArea,
  type Point,
  type Size,
} from './shared/position.js'
import {
  buildAskDeFloodUrl,
  buildOpenDeFloodUrl,
  isAllowedDeFloodExternalUrl,
  resolveConfiguredDeFloodAppUrl,
} from './shared/urls.js'
import {
  executeGuardianProtocolCommand,
  GUARDIAN_PROTOCOL_SCHEME,
  hasGuardianProtocolArgument,
  parseGuardianProtocolUrl,
  protocolCommandFromArguments,
  type GuardianProtocolCommand,
} from './shared/protocol.js'

const GUARDIAN_SIZE: Size = { width: 300, height: 190 }
const STATE_FILE_NAME = 'guardian-state.json'

app.setName('DeFlood Guardian')

let guardianWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let dragState: { pointerStart: Point; windowStart: Point } | null = null
const pendingProtocolCommands: GuardianProtocolCommand[] = []

function rendererPath(...segments: string[]): string {
  return path.join(__dirname, ...segments)
}

function statePath(): string {
  return path.join(app.getPath('userData'), STATE_FILE_NAME)
}

function readSavedPosition(): Point | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), 'utf8')) as { position?: Point }
    return parsed.position ?? null
  } catch {
    return null
  }
}

function savePosition(position: Point): void {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.writeFileSync(statePath(), JSON.stringify({ position }), 'utf8')
  } catch (error) {
    console.warn('DeFlood Guardian could not save its local window position.', error)
  }
}

function displayWorkArea(display: Electron.Display): DisplayWorkArea {
  return { id: String(display.id), workArea: display.workArea }
}

function configuredBaseUrl(): string {
  return resolveConfiguredDeFloodAppUrl(process.env.DEFLOOD_APP_URL)
}

async function openDeFlood(action: GuardianOpenAction): Promise<boolean> {
  const baseUrl = configuredBaseUrl()
  const destination = action === 'ask'
    ? buildAskDeFloodUrl(baseUrl)
    : buildOpenDeFloodUrl(baseUrl)
  if (!isAllowedDeFloodExternalUrl(destination)) {
    throw new Error('The configured DeFlood destination is not an allowed web URL.')
  }
  await shell.openExternal(destination)
  return true
}

function showGuardian(): void {
  guardianWindow?.showInactive()
  guardianWindow?.setAlwaysOnTop(true)
  guardianWindow?.moveTop()
}

async function handleProtocolCommand(command: GuardianProtocolCommand): Promise<void> {
  await executeGuardianProtocolCommand(command, {
    show: showGuardian,
    ask: async () => { await openDeFloodSafely('ask') },
    open: async () => { await openDeFloodSafely('open') },
  })
}

function receiveProtocolUrl(rawUrl: string): void {
  const command = parseGuardianProtocolUrl(rawUrl)
  if (!command) {
    console.warn('DeFlood Guardian ignored a malformed or unsupported protocol request.')
    return
  }
  if (!app.isReady() || !guardianWindow) {
    pendingProtocolCommands.push(command)
    return
  }
  void handleProtocolCommand(command)
}

function flushPendingProtocolCommands(): void {
  const command = pendingProtocolCommands.shift()
  pendingProtocolCommands.length = 0
  if (command) void handleProtocolCommand(command)
}

function resetPosition(): void {
  if (!guardianWindow) return
  const position = defaultGuardianPosition(displayWorkArea(screen.getPrimaryDisplay()), GUARDIAN_SIZE)
  guardianWindow.setPosition(position.x, position.y)
  savePosition(position)
  showGuardian()
}

function quitGuardian(): void {
  isQuitting = true
  app.quit()
}

function guardianMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: 'Show Guardian', click: showGuardian },
    { label: 'Ask DeFlood', click: () => { void openDeFloodSafely('ask') } },
    { label: 'Open DeFlood', click: () => { void openDeFloodSafely('open') } },
    { label: 'Reset position', click: resetPosition },
    { type: 'separator' },
    { label: 'Hide Guardian', click: () => guardianWindow?.hide() },
    { label: 'Quit DeFlood Guardian', click: quitGuardian },
  ])
}

async function openDeFloodSafely(action: GuardianOpenAction): Promise<boolean> {
  try {
    return await openDeFlood(action)
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'The destination could not be opened.'
    dialog.showErrorBox('Unable to open DeFlood.AI', detail)
    return false
  }
}

function createTray(): void {
  const image = nativeImage
    .createFromPath(rendererPath('assets', 'deflood-app-icon.png'))
    .resize({ width: 18, height: 18 })
  tray = new Tray(image)
  tray.setToolTip('DeFlood Guardian')
  tray.setContextMenu(guardianMenu())
  tray.on('click', showGuardian)
}

function isGuardianSender(event: IpcMainEvent): boolean {
  return event.sender === guardianWindow?.webContents
}

function finiteScreenPoint(value: unknown): Point | null {
  if (!value || typeof value !== 'object') return null
  const { screenX, screenY } = value as { screenX?: unknown; screenY?: unknown }
  if (typeof screenX !== 'number' || typeof screenY !== 'number') return null
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return null
  return { x: screenX, y: screenY }
}

function registerIpc(): void {
  ipcMain.handle(guardianChannels.open, async (event, action: unknown) => {
    if (event.sender !== guardianWindow?.webContents || (action !== 'ask' && action !== 'open')) return false
    return openDeFloodSafely(action)
  })

  ipcMain.on(guardianChannels.dragStart, (event, payload: unknown) => {
    if (!isGuardianSender(event) || !guardianWindow) return
    const pointerStart = finiteScreenPoint(payload)
    if (!pointerStart) return
    const [x, y] = guardianWindow.getPosition()
    dragState = { pointerStart, windowStart: { x, y } }
  })

  ipcMain.on(guardianChannels.dragMove, (event, payload: unknown) => {
    if (!isGuardianSender(event) || !guardianWindow || !dragState) return
    const pointer = finiteScreenPoint(payload)
    if (!pointer) return
    const proposed = {
      x: dragState.windowStart.x + pointer.x - dragState.pointerStart.x,
      y: dragState.windowStart.y + pointer.y - dragState.pointerStart.y,
    }
    const display = screen.getDisplayNearestPoint({ x: Math.round(pointer.x), y: Math.round(pointer.y) })
    const safe = clampPositionToWorkArea(proposed, GUARDIAN_SIZE, display.workArea)
    guardianWindow.setPosition(safe.x, safe.y)
  })

  ipcMain.on(guardianChannels.dragEnd, event => {
    if (!isGuardianSender(event) || !guardianWindow) return
    dragState = null
    const [x, y] = guardianWindow.getPosition()
    savePosition({ x, y })
  })

  ipcMain.on(guardianChannels.contextMenu, event => {
    if (!isGuardianSender(event)) return
    guardianMenu().popup({ window: guardianWindow ?? undefined })
  })
}

function ensureGuardianIsVisible(): void {
  if (!guardianWindow) return
  const [x, y] = guardianWindow.getPosition()
  const displays = screen.getAllDisplays().map(displayWorkArea)
  const primary = displayWorkArea(screen.getPrimaryDisplay())
  const safe = resolveGuardianPosition({ x, y }, GUARDIAN_SIZE, displays, primary)
  if (safe.x === x && safe.y === y) return
  guardianWindow.setPosition(safe.x, safe.y)
  savePosition(safe)
}

function createGuardianWindow(): void {
  const displays = screen.getAllDisplays().map(displayWorkArea)
  const primary = displayWorkArea(screen.getPrimaryDisplay())
  const position = resolveGuardianPosition(readSavedPosition(), GUARDIAN_SIZE, displays, primary)

  guardianWindow = new BrowserWindow({
    ...GUARDIAN_SIZE,
    ...position,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: rendererPath('preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (process.platform === 'darwin') guardianWindow.setHasShadow(false)

  guardianWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  guardianWindow.webContents.on('will-navigate', (event, destination) => {
    if (!destination.startsWith('file:')) event.preventDefault()
  })
  guardianWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
  guardianWindow.once('ready-to-show', showGuardian)
  guardianWindow.on('close', event => {
    if (isQuitting) return
    event.preventDefault()
    guardianWindow?.hide()
  })
  guardianWindow.on('closed', () => { guardianWindow = null })
  void guardianWindow.loadFile(rendererPath('renderer', 'index.html'))
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('open-url', (event, rawUrl) => {
    event.preventDefault()
    receiveProtocolUrl(rawUrl)
  })

  app.on('second-instance', (_event, argumentsList) => {
    const command = protocolCommandFromArguments(argumentsList)
    if (command) {
      receiveProtocolUrl(`${GUARDIAN_PROTOCOL_SCHEME}://${command}`)
      return
    }
    if (hasGuardianProtocolArgument(argumentsList)) {
      console.warn('DeFlood Guardian ignored a malformed or unsupported protocol request.')
      return
    }
    showGuardian()
  })

  const coldStartCommand = protocolCommandFromArguments(process.argv)
  if (coldStartCommand) pendingProtocolCommands.push(coldStartCommand)

  app.whenReady().then(() => {
    app.setAppUserModelId('ai.deflood.guardian')
    if (process.platform === 'darwin') app.dock?.hide()
    if (process.platform === 'win32' && app.isPackaged) {
      const registered = app.setAsDefaultProtocolClient(GUARDIAN_PROTOCOL_SCHEME)
      if (!registered) console.warn('DeFlood Guardian could not register its Windows protocol handler.')
    }
    registerIpc()
    createGuardianWindow()
    createTray()
    screen.on('display-removed', ensureGuardianIsVisible)
    screen.on('display-metrics-changed', ensureGuardianIsVisible)
    flushPendingProtocolCommands()
    console.info(`DeFlood Guardian ready. Public app destination: ${configuredBaseUrl()}`)
  })

  app.on('activate', showGuardian)
  app.on('before-quit', () => { isQuitting = true })
  app.on('window-all-closed', () => {
    // The tray/menu-bar icon keeps the lightweight companion available until Quit.
  })
}
