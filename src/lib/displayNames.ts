/**
 * Builds a display-name map for a list of full player names ("Last, First").
 * If two players share the same last name, the display name becomes "Last, F."
 * so they can be distinguished in charts and tables.
 */
export function buildDisplayNames(players: string[]): Record<string, string> {
  const lastNameCount: Record<string, number> = {};
  for (const name of players) {
    const last = name.split(',')[0].trim();
    lastNameCount[last] = (lastNameCount[last] ?? 0) + 1;
  }
  const map: Record<string, string> = {};
  for (const name of players) {
    const parts = name.split(',');
    const last = parts[0].trim();
    const first = parts[1]?.trim() ?? '';
    map[name] = lastNameCount[last] > 1 && first
      ? `${last}, ${first.charAt(0)}.`
      : last;
  }
  return map;
}
