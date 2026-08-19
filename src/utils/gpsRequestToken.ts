export function nextGpsRequestToken(currentToken: number): number {
  return currentToken + 1
}

export function isCurrentGpsRequestToken(
  currentToken: number,
  callbackToken: number,
): boolean {
  return currentToken === callbackToken
}
