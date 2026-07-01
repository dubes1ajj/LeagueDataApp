// Consistent player color palette — 30 distinct colors
const PALETTE = [
  '#4f8ef7', '#f97316', '#22c55e', '#a855f7', '#ef4444',
  '#06b6d4', '#eab308', '#ec4899', '#14b8a6', '#f59e0b',
  '#6366f1', '#84cc16', '#f43f5e', '#0ea5e9', '#10b981',
  '#8b5cf6', '#fb923c', '#34d399', '#fb7185', '#38bdf8',
  '#a3e635', '#c084fc', '#fdba74', '#67e8f9', '#86efac',
  '#fcd34d', '#fca5a5', '#d8b4fe', '#7dd3fc', '#bef264',
];

const colorMap = new Map<string, string>();
const playerColorOverrides = new Map<string, string>();

export function getPlayerColor(playerName: string): string {
  if (playerColorOverrides.has(playerName)) return playerColorOverrides.get(playerName)!;
  if (colorMap.has(playerName)) return colorMap.get(playerName)!;
  const idx = colorMap.size % PALETTE.length;
  const color = PALETTE[idx];
  colorMap.set(playerName, color);
  return color;
}

export function setPlayerColorOverrides(overrides: Record<string, string>): void {
  playerColorOverrides.clear();
  for (const [playerName, color] of Object.entries(overrides)) {
    if (!playerName || !color) continue;
    playerColorOverrides.set(playerName, color);
  }
}

export function resetColors(): void {
  colorMap.clear();
}
