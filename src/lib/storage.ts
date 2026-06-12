import type { LeagueData, EventData, CourseConfig, PlayerConfig } from '../types/golf';

const STORAGE_KEY    = 'golf_tracker_data';
const COURSE_KEY     = 'golf_tracker_course';
const PLAYERS_KEY    = 'golf_tracker_players';
const HIDDEN_EVT_KEY = 'golf_tracker_hidden_events';
const ACTIVE_LEAGUE_KEY = 'golf_tracker_active_league';
const LEAGUE_REGISTRY_KEY = 'golf_tracker_league_registry';
const COURSE_LIBRARY_KEY = 'golf_tracker_course_library';
const REMOTE_DATA_BASE_URL =
  (import.meta.env.VITE_REMOTE_DATA_BASE_URL as string | undefined)
  ?? 'https://raw.githubusercontent.com/dubes1ajj/CarringtonLeagueData/main';
const REMOTE_DATA_REPO_API_URL =
  (import.meta.env.VITE_REMOTE_DATA_REPO_API_URL as string | undefined)
  ?? 'https://api.github.com/repos/dubes1ajj/CarringtonLeagueData/contents';

// ── Built-in league registry ──────────────────────────────────────────────────

export const BUILT_IN_LEAGUES = [
  { id: '2026', name: '2026 Guinness Cup' },
  { id: '2025', name: '2025 Guinness Cup' },
] as const;

export interface BuiltInLeague {
  id: string;
  name: string;
}

export type LeagueId = typeof BUILT_IN_LEAGUES[number]['id'];

function leagueSortValue(id: string): number {
  const parsed = Number.parseInt(id, 10);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function formatLeagueName(id: string): string {
  return `${id} Guinness Cup`;
}

export function getLatestLeagueId(leagues: ReadonlyArray<Pick<BuiltInLeague, 'id'>>): string {
  const sorted = [...leagues].sort((a, b) => leagueSortValue(b.id) - leagueSortValue(a.id));
  return sorted[0]?.id ?? '2026';
}

export async function fetchAvailableLeagues(): Promise<BuiltInLeague[]> {
  const localLeagues = loadLeagueRegistry().map((id) => ({ id, name: formatLeagueName(id) }));
  try {
    const res = await fetch(REMOTE_DATA_REPO_API_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const files = await res.json() as Array<{ name?: string; type?: string }>;
    const remoteLeagues = files
      .filter((entry) => entry.type === 'file' && typeof entry.name === 'string' && /^\d{4}\.json$/i.test(entry.name))
      .map((entry) => ({
        id: entry.name!.replace(/\.json$/i, ''),
        name: formatLeagueName(entry.name!.replace(/\.json$/i, '')),
      }));

    const leagues = [...BUILT_IN_LEAGUES, ...localLeagues, ...remoteLeagues]
      .reduce<BuiltInLeague[]>((acc, league) => {
        if (!acc.some((entry) => entry.id === league.id)) acc.push(league);
        return acc;
      }, [])
      .sort((a, b) => leagueSortValue(b.id) - leagueSortValue(a.id));

    return leagues.length ? leagues : [...BUILT_IN_LEAGUES];
  } catch {
    return [...BUILT_IN_LEAGUES, ...localLeagues]
      .reduce<BuiltInLeague[]>((acc, league) => {
        if (!acc.some((entry) => entry.id === league.id)) acc.push(league);
        return acc;
      }, [])
      .sort((a, b) => leagueSortValue(b.id) - leagueSortValue(a.id));
  }
}

export function getStoredActiveLeagueId(): string | null {
  return localStorage.getItem(ACTIVE_LEAGUE_KEY);
}

export function getActiveLeagueId(defaultId = '2026'): string {
  return getStoredActiveLeagueId() ?? defaultId;
}

export function setActiveLeagueIdStorage(id: string): void {
  localStorage.setItem(ACTIVE_LEAGUE_KEY, id);
}

// ── Per-league key helpers ────────────────────────────────────────────────────

function lk(id: string, suffix: string): string {
  return `golf_tracker_${id}_${suffix}`;
}

function loadLeagueRegistry(): string[] {
  try {
    const raw = localStorage.getItem(LEAGUE_REGISTRY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function saveLeagueRegistry(ids: string[]): void {
  localStorage.setItem(LEAGUE_REGISTRY_KEY, JSON.stringify([...new Set(ids)]));
}

export function registerLeagueId(id: string): void {
  const current = loadLeagueRegistry();
  if (current.includes(id)) return;
  saveLeagueRegistry([...current, id]);
}

function migrateEvents(data: LeagueData): LeagueData {
  return {
    ...data,
    events: data.events.map(e => {
      if (!e.nineHoles) return { ...e, nineHoles: 'front' as const };
      return e;
    }),
  };
}

function normalizeCourseConfig(config: CourseConfig): CourseConfig {
  return {
    ...config,
    holes: Array.from({ length: 18 }, (_, i) => ({
      hole: i + 1,
      par: config.holes?.[i]?.par ?? 4,
      yardage: config.holes?.[i]?.yardage,
      strokeIndex: config.holes?.[i]?.strokeIndex,
    })),
  };
}

// ── Per-league load / save ────────────────────────────────────────────────────

export function loadLeagueDataById(id: string): LeagueData | null {
  try {
    const raw = localStorage.getItem(lk(id, 'data'));
    if (raw) {
      registerLeagueId(id);
      return migrateEvents(JSON.parse(raw) as LeagueData);
    }
    // Legacy fallback for 2026 (existing users' data)
    if (id === '2026') {
      const legacyRaw = localStorage.getItem(STORAGE_KEY);
      if (legacyRaw) return migrateEvents(JSON.parse(legacyRaw) as LeagueData);
    }
  } catch { /* ignore */ }
  return null;
}

export function saveLeagueDataById(id: string, data: LeagueData): void {
  registerLeagueId(id);
  localStorage.setItem(lk(id, 'data'), JSON.stringify(data));
  if (id === '2026') localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); // keep legacy in sync
}

export function loadCourseConfigById(id: string): CourseConfig | null {
  try {
    const raw = localStorage.getItem(lk(id, 'course'));
    if (raw) return JSON.parse(raw) as CourseConfig;
    if (id === '2026') {
      const legacyRaw = localStorage.getItem(COURSE_KEY);
      if (legacyRaw) return JSON.parse(legacyRaw) as CourseConfig;
    }
  } catch { /* ignore */ }
  return null;
}

export function saveCourseConfigById(id: string, config: CourseConfig): void {
  localStorage.setItem(lk(id, 'course'), JSON.stringify(config));
  if (id === '2026') localStorage.setItem(COURSE_KEY, JSON.stringify(config));
}

export function loadSavedCourseConfigs(): CourseConfig[] {
  try {
    const raw = localStorage.getItem(COURSE_LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CourseConfig[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((config) => config && typeof config.courseName === 'string' && Array.isArray(config.holes))
      .map(normalizeCourseConfig);
  } catch {
    return [];
  }
}

export function saveCourseTemplate(config: CourseConfig): void {
  const current = loadSavedCourseConfigs();
  const next = [...current.filter((item) => item.courseName !== config.courseName), config]
    .sort((a, b) => a.courseName.localeCompare(b.courseName));
  localStorage.setItem(COURSE_LIBRARY_KEY, JSON.stringify(next));
}

export function loadPlayerConfigById(id: string): PlayerConfig {
  try {
    const raw = localStorage.getItem(lk(id, 'players'));
    if (raw) return JSON.parse(raw) as PlayerConfig;
    if (id === '2026') {
      const legacyRaw = localStorage.getItem(PLAYERS_KEY);
      if (legacyRaw) return JSON.parse(legacyRaw) as PlayerConfig;
    }
  } catch { /* ignore */ }
  return { active: {} };
}

export function savePlayerConfigById(id: string, config: PlayerConfig): void {
  localStorage.setItem(lk(id, 'players'), JSON.stringify(config));
  if (id === '2026') localStorage.setItem(PLAYERS_KEY, JSON.stringify(config));
}

export function loadHiddenEventIdsById(id: string): Set<string> {
  try {
    const raw = localStorage.getItem(lk(id, 'hidden'));
    if (raw) return new Set(JSON.parse(raw) as string[]);
    if (id === '2026') {
      const legacyRaw = localStorage.getItem(HIDDEN_EVT_KEY);
      if (legacyRaw) return new Set(JSON.parse(legacyRaw) as string[]);
    }
  } catch { /* ignore */ }
  return new Set();
}

export function saveHiddenEventIdsById(id: string, ids: Set<string>): void {
  localStorage.setItem(lk(id, 'hidden'), JSON.stringify([...ids]));
  if (id === '2026') localStorage.setItem(HIDDEN_EVT_KEY, JSON.stringify([...ids]));
}

// Async: load a league snapshot from the shared remote repo first, then fall
// back to the bundled static /data/{id}.json file.
export async function fetchLeagueSnapshot(id: string): Promise<LeagueSnapshot | null> {
  const cacheBust = `ts=${Date.now()}`;
  const remoteUrl = `${REMOTE_DATA_BASE_URL}/${id}.json?${cacheBust}`;

  try {
    const remoteRes = await fetch(remoteUrl, { cache: 'no-store' });
    if (remoteRes.ok) {
      return await remoteRes.json() as LeagueSnapshot;
    }
  } catch {
    // fall back to bundled file below
  }

  try {
    const res = await fetch(`/data/${id}.json?${cacheBust}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json() as LeagueSnapshot;
  } catch {
    return null;
  }
}



export function loadLeagueData(): LeagueData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as LeagueData;
      // Migrate old events that predate the nineHoles field
      data.events = data.events.map(e => {
        if (!e.nineHoles) return { ...e, nineHoles: 'front' as const };
        return e;
      });
      return data;
    }
  } catch {
    // corrupted data — start fresh
  }
  return { leagueName: '2026 Guinness Cup', events: [] };
}

export function saveLeagueData(data: LeagueData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadCourseConfig(): CourseConfig | null {
  try {
    const raw = localStorage.getItem(COURSE_KEY);
    if (raw) return JSON.parse(raw) as CourseConfig;
  } catch { /* ignore */ }
  return null;
}

export function saveCourseConfig(config: CourseConfig): void {
  localStorage.setItem(COURSE_KEY, JSON.stringify(config));
}

export function loadPlayerConfig(): PlayerConfig {
  try {
    const raw = localStorage.getItem(PLAYERS_KEY);
    if (raw) return JSON.parse(raw) as PlayerConfig;
  } catch { /* ignore */ }
  return { active: {} };
}

export function savePlayerConfig(config: PlayerConfig): void {
  localStorage.setItem(PLAYERS_KEY, JSON.stringify(config));
}

export function loadHiddenEventIds(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_EVT_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

export function saveHiddenEventIds(ids: Set<string>): void {
  localStorage.setItem(HIDDEN_EVT_KEY, JSON.stringify([...ids]));
}

// ── Full snapshot export / import ────────────────────────────────────────────

export interface LeagueSnapshot {
  version: 1;
  exportedAt: string;
  league: LeagueData;
  courseConfig: CourseConfig | null;
  playerConfig: PlayerConfig;
}

function downloadSnapshotFile(snapshot: LeagueSnapshot, fileName: string): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportSnapshot(
  league: LeagueData,
  courseConfig: CourseConfig | null,
  playerConfig: PlayerConfig
): void {
  const snapshot: LeagueSnapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    league,
    courseConfig,
    playerConfig,
  };
  const safeName = (league.leagueName || 'golf-tracker').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  downloadSnapshotFile(snapshot, `${safeName}-${new Date().toISOString().slice(0, 10)}.json`);
}

export function exportSharedSnapshot(
  leagueId: string,
  league: LeagueData,
  courseConfig: CourseConfig | null,
  playerConfig: PlayerConfig
): void {
  const snapshot: LeagueSnapshot = {
    version: 1,
    exportedAt: new Date().toISOString(),
    league,
    courseConfig,
    playerConfig,
  };
  downloadSnapshotFile(snapshot, `${leagueId}.json`);
}

export function parseSnapshotFile(file: File): Promise<LeagueSnapshot> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target?.result as string) as LeagueSnapshot;
        if (data.version !== 1 || !data.league) {
          reject(new Error('Invalid snapshot file format.'));
          return;
        }
        // Migrate events
        data.league.events = data.league.events.map(ev => {
          if (!ev.nineHoles) return { ...ev, nineHoles: 'front' as const };
          return ev;
        });
        resolve(data);
      } catch {
        reject(new Error('Could not parse file — is it a valid Golf Tracker export?'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

/**
 * Returns an updated PlayerConfig where every player who has never played
 * a round (didNotPlay for all events) is set to active=false, UNLESS the
 * user has already explicitly set them to active=true.
 */
export function applyAutoHide(config: PlayerConfig, events: EventData[]): PlayerConfig {
  const everPlayed = new Set<string>();
  for (const ev of events) {
    for (const p of ev.players) {
      if (!p.didNotPlay) everPlayed.add(p.playerName);
    }
  }
  // Collect all players mentioned in any event
  const allSeen = new Set<string>();
  for (const ev of events) {
    for (const p of ev.players) allSeen.add(p.playerName);
  }

  const active = { ...config.active };
  for (const name of allSeen) {
    if (!everPlayed.has(name)) {
      // Never played — hide unless user explicitly activated them
      if (active[name] !== true) {
        active[name] = false;
      }
    }
  }
  return { active };
}

export function addEvent(data: LeagueData, newEvent: EventData): LeagueData {
  // Replace if same event number, otherwise append
  const existing = data.events.findIndex(e => e.eventNumber === newEvent.eventNumber);
  let events: EventData[];
  if (existing >= 0) {
    events = [...data.events];
    events[existing] = newEvent;
  } else {
    events = [...data.events, newEvent].sort((a, b) => a.eventNumber - b.eventNumber);
  }
  return { ...data, events };
}

export function removeEvent(data: LeagueData, eventId: string): LeagueData {
  return { ...data, events: data.events.filter(e => e.id !== eventId) };
}
