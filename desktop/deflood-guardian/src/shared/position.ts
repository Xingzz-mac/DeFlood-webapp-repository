export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rectangle extends Point, Size {}

export interface DisplayWorkArea {
  id: string
  workArea: Rectangle
}

export const DEFAULT_SCREEN_MARGIN = 20

function isFinitePoint(point: Point | null | undefined): point is Point {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y))
}

export function isPositionVisible(
  point: Point | null | undefined,
  windowSize: Size,
  displays: readonly DisplayWorkArea[],
): point is Point {
  if (!isFinitePoint(point)) return false
  return displays.some(({ workArea }) => (
    point.x >= workArea.x
    && point.y >= workArea.y
    && point.x + windowSize.width <= workArea.x + workArea.width
    && point.y + windowSize.height <= workArea.y + workArea.height
  ))
}

export function defaultGuardianPosition(
  primaryDisplay: DisplayWorkArea,
  windowSize: Size,
  margin = DEFAULT_SCREEN_MARGIN,
): Point {
  const { workArea } = primaryDisplay
  return {
    x: Math.round(workArea.x + Math.max(0, workArea.width - windowSize.width - margin)),
    y: Math.round(workArea.y + Math.max(0, workArea.height - windowSize.height - margin)),
  }
}

export function resolveGuardianPosition(
  savedPosition: Point | null | undefined,
  windowSize: Size,
  displays: readonly DisplayWorkArea[],
  primaryDisplay: DisplayWorkArea,
  margin = DEFAULT_SCREEN_MARGIN,
): Point {
  if (isPositionVisible(savedPosition, windowSize, displays)) return savedPosition
  return defaultGuardianPosition(primaryDisplay, windowSize, margin)
}

export function clampPositionToWorkArea(
  point: Point,
  windowSize: Size,
  workArea: Rectangle,
): Point {
  const maximumX = workArea.x + Math.max(0, workArea.width - windowSize.width)
  const maximumY = workArea.y + Math.max(0, workArea.height - windowSize.height)
  return {
    x: Math.round(Math.min(Math.max(point.x, workArea.x), maximumX)),
    y: Math.round(Math.min(Math.max(point.y, workArea.y), maximumY)),
  }
}
