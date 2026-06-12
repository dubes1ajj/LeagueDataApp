export interface HoleScore {
  hole: number;
  score: number;
}

export interface HoleInfo {
  hole: number;        // 1–18
  par: number;         // 3, 4, or 5
  yardage?: number;
  strokeIndex?: number; // 1 = hardest, 18 = easiest
}

export interface CourseConfig {
  courseName: string;
  holes: HoleInfo[]; // exactly 18 entries
}

export interface PlayerEventData {
  position: number;
  playerName: string;
  // Raw hole scores (9 scores, corresponding to whichever 9 were played)
  holes: (number | null)[];
  // Summary fields
  grossScore: number | null;
  handicap: number;
  netScore: number | null;
  points: number;
  bonusPoints: number;
  totalPoints: number; // cumulative across all events up to this event
  // Score type counts — computed from raw holes + course par when available
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  tripleBogeys: number;
  other: number; // 4+ over par
  // Did not play
  didNotPlay: boolean;
}

export interface EventData {
  id: string;
  eventNumber: number;
  eventDate: string; // e.g. "4/22/2025"
  nineHoles: 'front' | 'back'; // which 9 holes were played this event
  players: PlayerEventData[];
  // Derived: cumulative standings at end of this event
  standings: StandingEntry[];
}

export interface StandingEntry {
  playerName: string;
  cumulativePoints: number;
  position: number;
}

export interface LeagueData {
  leagueName: string;
  events: EventData[];
}

/** Per-player configuration — inactive players are hidden from all charts/standings. */
export interface PlayerConfig {
  /** playerName → true if active (default), false if hidden */
  active: Record<string, boolean>;
}

// For the bump chart — one data point per event per player
export interface BumpPoint {
  event: number;
  position: number;
  points: number;
  playerName: string;
}

