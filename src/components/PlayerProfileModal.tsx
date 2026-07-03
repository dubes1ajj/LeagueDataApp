import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, RadarChart,
  PolarGrid, PolarAngleAxis, Radar
} from 'recharts';
import type { AdjustedScoringSettings, EventData, CourseConfig, HandicapMode } from '../types/golf';
import { getPlayerColor } from '../lib/colors';
import { computeBreakdown, getParsForNine } from '../lib/scoring';
import { useChartColors } from '../lib/useChartColors';
import { X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getEventDisplayName } from '../lib/eventNames';
import { formatEventDateDisplay } from '../lib/eventDateDisplay';

interface PlayerProfileModalProps {
  playerName: string;
  events: EventData[];
  courseConfig: CourseConfig | null;
  handicapMode: HandicapMode;
  adjustedScoring?: AdjustedScoringSettings;
  onHoleClick?: (holeNum: number, nine: 'front' | 'back') => void;
  onClose: () => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function avg(nums: number[]): number {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}

function formatSigned(value: number, digits = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function getTrend(values: number[]): 'up' | 'down' | 'flat' {
  if (values.length < 2) return 'flat';
  const first = values[0];
  const last = values[values.length - 1];
  if (last < first) return 'down';
  if (last > first) return 'up';
  return 'flat';
}

function getStringHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickVariant(seed: string, variants: string[]): string {
  if (!variants.length) return '';
  return variants[getStringHash(seed) % variants.length];
}

function normalizeNicknameTitle(nickname: string): string {
  const trimmed = nickname.trim();
  if (!trimmed) return 'Fairway Menace';
  return trimmed.replace(/^the\s+/i, '');
}

function pickUniqueNicknameFromPool(seed: string, pool: string[], used: Set<string>, fallbackLabel: string): string {
  if (pool.length > 0) {
    const startIndex = getStringHash(seed) % pool.length;
    for (let offset = 0; offset < pool.length; offset += 1) {
      const rawCandidate = pool[(startIndex + offset) % pool.length];
      const candidate = normalizeNicknameTitle(rawCandidate);
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
  }

  let suffix = 2;
  let fallback = `${normalizeNicknameTitle(fallbackLabel)} ${suffix}`;
  while (used.has(fallback)) {
    suffix += 1;
    fallback = `${normalizeNicknameTitle(fallbackLabel)} ${suffix}`;
  }
  used.add(fallback);
  return fallback;
}

type NicknameCategory =
  | 'elite'
  | 'contender'
  | 'firestarter'
  | 'cleanup'
  | 'responder'
  | 'closer'
  | 'netBandit'
  | 'chaos'
  | 'damage'
  | 'caged'
  | 'partTime'
  | 'steady';

type NicknameProfile = {
  playerName: string;
  category: NicknameCategory;
  score: number;
};

const NICKNAME_PARTS: Record<NicknameCategory, { pool: string[]; fallback: string }> = {
  elite: {
    pool: ['Sniper', 'Captain Hook', 'Christopher Columbus', 'Arsonist', 'Crypto Bro', 'Flagstick Taxman', 'Putter Assassin', 'Scorecard Reaper'],
    fallback: 'Sniper',
  },
  contender: {
    pool: ['Accountant', 'Cart Path Lurker', 'Podium Parking Ticket', 'Birdie Bureaucrat', 'Pin Collector', 'Scorecard Squatter', 'Weekend Menace', 'Fairway Foreclosure'],
    fallback: 'Accountant',
  },
  firestarter: {
    pool: ['Hosel Rocket Scientist', 'Worm Burner', 'Arsonist', 'Tee Box Torch', 'Fairway Flamethrower', 'Backspin Bomber', 'Pin Seeker', 'Birdie Blast Furnace'],
    fallback: 'Hosel Rocket Scientist',
  },
  cleanup: {
    pool: ['Roomba', 'Beaver Pelt', 'Bogey Janitor', 'Mulligan Medic', 'Fairway Plumber', 'Duct Tape Caddie', 'Scorecard Custodian', 'Cardboard Surgeon'],
    fallback: 'Roomba',
  },
  responder: {
    pool: ['Houdini', 'Witness Protection', 'Poltergeist', 'Bounce-Back Refund', 'Bogey Escape Plan', 'Round Rebooter', 'Do-Over Dealer', 'Apology Department'],
    fallback: 'Houdini',
  },
  closer: {
    pool: ['Back Nine Butcher', 'Captain Hook', 'Final Putt Coroner', 'Parking Lot Undertaker', '18th Hole Taxman', 'Lights-Out Closer', 'Card Killer', 'Last-Hole Collector'],
    fallback: 'Back Nine Butcher',
  },
  netBandit: {
    pool: ['Crypto Bro', 'Christopher Columbus', 'Accountant', 'Handicap Hustle', 'Net Par Bandit', 'Scorecard Forger', 'Popsie Plus Pirate', 'Bogey Bookie'],
    fallback: 'Crypto Bro',
  },
  chaos: {
    pool: ['Loose Wire', 'Shank Alert', 'Double Bogey Factory', 'Cart Path Chaos', 'Hazard Magnet', 'OB Explosion', 'Tee Box Tornado', 'Fairway Car Crash'],
    fallback: 'Loose Wire',
  },
  damage: {
    pool: ['Snowman', 'Put Me Down for a 5', 'Tin Cup', 'Three-Putt Invoice', 'Penalty Stroke Bill', 'Bunker Disaster', 'Double-Crossed Scorecard', 'Cart-Wreck Estimate'],
    fallback: 'Snowman',
  },
  caged: {
    pool: ['Tin Cup', 'Birdie Curfew', 'Par Handbrake', 'Safety Golf Warden', 'Speed Limit Marshal', 'Neutral Gear Caddie', 'Cruise Control Committee', 'Bogey Chaperone'],
    fallback: 'Tin Cup',
  },
  partTime: {
    pool: ['Witness Protection', 'Pop-In Episode', 'Tee Time Ghost', 'Guest List Entry', 'Vanishing Tee Sheet', 'Day Pass Phantom', 'Surprise Appearance', 'Calendar Conflict'],
    fallback: 'Witness Protection',
  },
  steady: {
    pool: ['Meatloaf', 'Accountant', 'Roomba', 'Quiet Money', 'Payroll Pars', 'Lunch Pail Golfer', 'Card Cubicle', 'Fairway Clerk'],
    fallback: 'Meatloaf',
  },
};

function buildNicknameProfile(playerName: string, events: EventData[], courseConfig: CourseConfig | null): NicknameProfile | null {
  const playerRounds = events
    .map((ev) => ({
      ev,
      data: ev.players.find((p) => p.playerName === playerName) ?? null,
    }))
    .filter((round) => round.data && !round.data.didNotPlay);

  if (!playerRounds.length) return null;

  const totalEvents = events.length;
  const points = playerRounds.map((round) => round.data!.points);
  const avgPoints = avg(points);
  const participationRate = totalEvents > 0 ? playerRounds.length / totalEvents : 0;

  let totalBirdies = 0;
  let totalPars = 0;
  let totalBogeys = 0;
  let totalDoubleBogeys = 0;
  let totalTripleBogeys = 0;
  let totalOther = 0;
  let totalTrackedHoles = 0;
  let eventWins = 0;
  let topThree = 0;
  let cleanCards = 0;
  let bounceBackSuccess = 0;
  let bounceBackChances = 0;
  let clutchDiffTotal = 0;
  let clutchHoleCount = 0;
  const netParDiffs: number[] = [];

  for (const { ev, data } of playerRounds) {
    if (!data) continue;

    const activePlayers = ev.players.filter((player) => !player.didNotPlay);
    const maxPoints = activePlayers.reduce((max, player) => Math.max(max, player.points), Number.NEGATIVE_INFINITY);
    const pointsRank = activePlayers.filter((player) => player.points > data.points).length + 1;
    if (data.points === maxPoints) eventWins += 1;
    if (pointsRank <= 3) topThree += 1;

    let eagles = 0;
    let birdies = data.birdies;
    let pars = data.pars;
    let bogeys = data.bogeys;
    let doubleBogeys = data.doubleBogeys;
    let tripleBogeys = data.tripleBogeys;
    let other = data.other;

    if (courseConfig) {
      const parsForNine = getParsForNine(courseConfig, ev.nineHoles ?? 'front');
      const bd = computeBreakdown(data.holes, parsForNine);
      eagles = bd.eagles;
      birdies = bd.birdies;
      pars = bd.pars;
      bogeys = bd.bogeys;
      doubleBogeys = bd.doubleBogeys;
      tripleBogeys = bd.tripleBogeys;
      other = bd.other;

      const totalPar = parsForNine.reduce((sum, par) => sum + par, 0);
      if (data.netScore !== null) {
        netParDiffs.push(totalPar - data.netScore);
      }

      const diffs = data.holes.map((score, index) => score === null ? null : score - parsForNine[index]);
      let hasDoublePlus = false;
      diffs.forEach((diff, index) => {
        if (diff === null) return;
        if (index >= Math.max(0, diffs.length - 3)) {
          clutchDiffTotal += diff;
          clutchHoleCount += 1;
        }
        if (diff >= 2) hasDoublePlus = true;
      });
      for (let index = 0; index < diffs.length - 1; index += 1) {
        const currentDiff = diffs[index];
        const nextDiff = diffs[index + 1];
        if (currentDiff === null || nextDiff === null || currentDiff < 1) continue;
        bounceBackChances += 1;
        if (nextDiff <= 0) bounceBackSuccess += 1;
      }
      if (!hasDoublePlus) cleanCards += 1;
    } else if (doubleBogeys + tripleBogeys + other === 0) {
      cleanCards += 1;
    }

    totalBirdies += birdies;
    totalPars += pars;
    totalBogeys += bogeys;
    totalDoubleBogeys += doubleBogeys;
    totalTripleBogeys += tripleBogeys;
    totalOther += other;
    totalTrackedHoles += eagles + birdies + pars + bogeys + doubleBogeys + tripleBogeys + other;
  }

  const cleanCardRate = playerRounds.length > 0 ? cleanCards / playerRounds.length : 0;
  const topThreeRate = playerRounds.length > 0 ? topThree / playerRounds.length : 0;
  const weightedPenalty = (totalBogeys * 1) + (totalDoubleBogeys * 2) + (totalTripleBogeys * 3) + (totalOther * 4);
  const damageControl = totalTrackedHoles > 0 ? (1 - (weightedPenalty / (totalTrackedHoles * 4))) * 100 : null;
  const blowupAvoidance = totalTrackedHoles > 0 ? (1 - ((totalDoubleBogeys + totalTripleBogeys + totalOther) / totalTrackedHoles)) * 100 : null;
  const birdieRate = totalTrackedHoles > 0 ? (totalBirdies / totalTrackedHoles) * 100 : null;
  const bounceBackRate = bounceBackChances > 0 ? (bounceBackSuccess / bounceBackChances) * 100 : null;
  const clutchPerformance = clutchHoleCount > 0 ? clutchDiffTotal / clutchHoleCount : null;
  const handicapOutperformance = netParDiffs.length ? avg(netParDiffs) : null;

  let category: NicknameCategory = 'steady';
  if (eventWins >= 3 && birdieRate !== null && birdieRate >= 18) {
    category = 'elite';
  } else if (eventWins >= 2 || topThreeRate >= 0.6) {
    category = 'contender';
  } else if (birdieRate !== null && birdieRate >= 20 && bounceBackRate !== null && bounceBackRate >= 50) {
    category = 'firestarter';
  } else if (cleanCardRate >= 0.45 && damageControl !== null && damageControl >= 84) {
    category = 'cleanup';
  } else if (bounceBackRate !== null && bounceBackRate >= 60 && blowupAvoidance !== null && blowupAvoidance >= 82) {
    category = 'responder';
  } else if (clutchPerformance !== null && clutchPerformance <= -0.35) {
    category = 'closer';
  } else if (handicapOutperformance !== null && handicapOutperformance >= 0.7) {
    category = 'netBandit';
  } else if (blowupAvoidance !== null && blowupAvoidance < 68 && bounceBackRate !== null && bounceBackRate < 38) {
    category = 'chaos';
  } else if (damageControl !== null && damageControl < 70 && avgPoints < 8) {
    category = 'damage';
  } else if (birdieRate !== null && birdieRate < 9 && avgPoints < 8) {
    category = 'caged';
  } else if (participationRate < 0.6) {
    category = 'partTime';
  }

  return {
    playerName,
    category,
    score: (eventWins * 1000) + (topThree * 200) + Math.round(avgPoints * 10) + Math.round((birdieRate ?? 0) * 5) + Math.round((damageControl ?? 0)),
  };
}

function StatCard({ label, value, sub, trend }: {
  label: string; value: string | number; sub?: string; trend?: 'up' | 'down' | 'flat';
}) {
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#888';
  return (
    <div className="pp-stat-card">
      <span className="pp-stat-label">{label}</span>
      <span className="pp-stat-value">{value}</span>
      {sub && <span className="pp-stat-sub">{sub}</span>}
      {trend && <Icon size={14} style={{ color: trendColor, marginTop: 4 }} />}
    </div>
  );
}

const SCORE_COLORS: Record<string, string> = {
  Eagles: '#f59e0b', Birdies: '#22c55e', Pars: '#4f8ef7',
  Bogeys: '#f97316', 'Dbl Bogeys': '#ef4444', 'Trpl+': '#7c3aed', 'Other': '#3f3f5a',
};

// ── Main component ────────────────────────────────────────────────────────────
export default function PlayerProfileModal({
  playerName, events, courseConfig, handicapMode, adjustedScoring, onHoleClick, onClose,
}: PlayerProfileModalProps) {
  const color = getPlayerColor(playerName);
  const c = useChartColors();
  const handicapLabel = handicapMode === 'front-back' ? 'Side H\'cap' : 'H\'cap';
  const handicapLongLabel = handicapMode === 'front-back' ? 'Side Handicap' : 'Handicap';
  const adjustedMode = adjustedScoring?.mode ?? 'none';
  const adjustedDropCount = Math.max(0, Math.floor(adjustedScoring?.dropCount ?? 0));
  const sortedEvents = useMemo(() =>
    [...events].sort((a, b) => a.eventNumber - b.eventNumber), [events]);

  // All event data for this player, in order
  const playerRounds = useMemo(() =>
    sortedEvents.map(ev => ({
      ev,
      data: ev.players.find(p => p.playerName === playerName) ?? null,
      standing: ev.standings.find(s => s.playerName === playerName) ?? null,
    })).filter(r => r.data && !r.data.didNotPlay),
    [sortedEvents, playerName]);

  // Current standing from the latest event
  const latestStanding = useMemo(() => {
    for (let i = sortedEvents.length - 1; i >= 0; i--) {
      const s = sortedEvents[i].standings.find(s => s.playerName === playerName);
      if (s) return s;
    }
    return null;
  }, [sortedEvents, playerName]);

  const droppedEventIds = useMemo(() => {
    if (adjustedMode !== 'drop-lowest' || adjustedDropCount <= 0) return new Set<string>();
    const played = playerRounds
      .map((round) => ({
        eventId: round.ev.id,
        eventNumber: round.ev.eventNumber,
        points: round.data?.points ?? 0,
      }))
      .sort((a, b) => a.points - b.points || a.eventNumber - b.eventNumber);
    const drop = Math.min(adjustedDropCount, played.length);
    return new Set(played.slice(0, drop).map((item) => item.eventId));
  }, [adjustedDropCount, adjustedMode, playerRounds]);

  // ── Summary stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!playerRounds.length) return null;
    const grossScores = playerRounds.map(r => r.data!.grossScore).filter((v): v is number => v !== null);
    const netScores   = playerRounds.map(r => r.data!.netScore).filter((v): v is number => v !== null);
    const points      = playerRounds.map(r => r.data!.points);
    const handicaps   = playerRounds.map(r => r.data!.handicap);
    const frontRounds = playerRounds.filter(r => r.ev.nineHoles !== 'back');
    const backRounds  = playerRounds.filter(r => r.ev.nineHoles === 'back');
    const frontHandicaps = frontRounds.map(r => r.data!.handicap);
    const backHandicaps  = backRounds.map(r => r.data!.handicap);

    const bestGross = grossScores.length ? Math.min(...grossScores) : null;
    const worstGross = grossScores.length ? Math.max(...grossScores) : null;
    const bestPoints = points.length ? Math.max(...points) : null;
    const eventsPlayed = playerRounds.length;
    const totalEvents = sortedEvents.length;

    const hcpTrend = getTrend(handicaps);
    const frontHcpTrend = getTrend(frontHandicaps);
    const backHcpTrend = getTrend(backHandicaps);

    return {
      eventsPlayed, totalEvents,
      avgGross: grossScores.length ? avg(grossScores).toFixed(1) : '—',
      avgNet:   netScores.length   ? avg(netScores).toFixed(1)   : '—',
      avgPoints: avg(points).toFixed(1),
      bestGross, worstGross, bestPoints,
      currentHcp: handicaps[handicaps.length - 1] ?? '—',
      currentFrontHcp: frontHandicaps[frontHandicaps.length - 1] ?? '—',
      currentBackHcp: backHandicaps[backHandicaps.length - 1] ?? '—',
      hcpTrend: hcpTrend as 'up' | 'down' | 'flat',
      frontHcpTrend: frontHcpTrend as 'up' | 'down' | 'flat',
      backHcpTrend: backHcpTrend as 'up' | 'down' | 'flat',
    };
  }, [playerRounds, sortedEvents]);

  const profileMetrics = useMemo(() => {
    if (!playerRounds.length) return null;

    let totalBirdies = 0;
    let totalPars = 0;
    let totalBogeys = 0;
    let totalDoubleBogeys = 0;
    let totalTripleBogeys = 0;
    let totalOther = 0;
    let totalTrackedHoles = 0;
    let eventWins = 0;
    let topThree = 0;
    let cleanCards = 0;
    let bounceBackSuccess = 0;
    let bounceBackChances = 0;
    let clutchDiffTotal = 0;
    let clutchHoleCount = 0;
    const netParDiffs: number[] = [];

    for (const { ev, data } of playerRounds) {
      if (!data) continue;

      const activePlayers = ev.players.filter((player) => !player.didNotPlay);
      const maxPoints = activePlayers.reduce((max, player) => Math.max(max, player.points), Number.NEGATIVE_INFINITY);
      const pointsRank = activePlayers.filter((player) => player.points > data.points).length + 1;
      if (data.points === maxPoints) eventWins += 1;
      if (pointsRank <= 3) topThree += 1;

      let eagles = 0;
      let birdies = data.birdies;
      let pars = data.pars;
      let bogeys = data.bogeys;
      let doubleBogeys = data.doubleBogeys;
      let tripleBogeys = data.tripleBogeys;
      let other = data.other;

      if (courseConfig) {
        const parsForNine = getParsForNine(courseConfig, ev.nineHoles ?? 'front');
        const bd = computeBreakdown(data.holes, parsForNine);
        eagles = bd.eagles;
        birdies = bd.birdies;
        pars = bd.pars;
        bogeys = bd.bogeys;
        doubleBogeys = bd.doubleBogeys;
        tripleBogeys = bd.tripleBogeys;
        other = bd.other;

        const totalPar = parsForNine.reduce((sum, par) => sum + par, 0);
        if (data.netScore !== null) {
          netParDiffs.push(totalPar - data.netScore);
        }

        const diffs = data.holes.map((score, index) => score === null ? null : score - parsForNine[index]);
        let hasDoublePlus = false;
        diffs.forEach((diff, index) => {
          if (diff === null) return;
          if (index >= Math.max(0, diffs.length - 3)) {
            clutchDiffTotal += diff;
            clutchHoleCount += 1;
          }
          if (diff >= 2) hasDoublePlus = true;
        });
        for (let index = 0; index < diffs.length - 1; index += 1) {
          const currentDiff = diffs[index];
          const nextDiff = diffs[index + 1];
          if (currentDiff === null || nextDiff === null || currentDiff < 1) continue;
          bounceBackChances += 1;
          if (nextDiff <= 0) bounceBackSuccess += 1;
        }
        if (!hasDoublePlus) cleanCards += 1;
      } else if (doubleBogeys + tripleBogeys + other === 0) {
        cleanCards += 1;
      }

      totalBirdies += birdies;
      totalPars += pars;
      totalBogeys += bogeys;
      totalDoubleBogeys += doubleBogeys;
      totalTripleBogeys += tripleBogeys;
      totalOther += other;
      totalTrackedHoles += eagles + birdies + pars + bogeys + doubleBogeys + tripleBogeys + other;
    }

    const bogeysOrWorse = totalBogeys + totalDoubleBogeys + totalTripleBogeys + totalOther;
    const weightedPenalty = (totalBogeys * 1) + (totalDoubleBogeys * 2) + (totalTripleBogeys * 3) + (totalOther * 4);
    const damageControl = totalTrackedHoles > 0 ? (1 - (weightedPenalty / (totalTrackedHoles * 4))) * 100 : null;
    const blowupAvoidance = totalTrackedHoles > 0 ? (1 - ((totalDoubleBogeys + totalTripleBogeys + totalOther) / totalTrackedHoles)) * 100 : null;
    const birdieRate = totalTrackedHoles > 0 ? (totalBirdies / totalTrackedHoles) * 100 : null;
    const parRate = totalTrackedHoles > 0 ? (totalPars / totalTrackedHoles) * 100 : null;
    const bounceBackRate = bounceBackChances > 0 ? (bounceBackSuccess / bounceBackChances) * 100 : null;
    const clutchPerformance = clutchHoleCount > 0 ? clutchDiffTotal / clutchHoleCount : null;
    const handicapOutperformance = netParDiffs.length ? avg(netParDiffs) : null;

    return {
      eventWins,
      topThree,
      cleanCards,
      birdieRate,
      parRate,
      damageControl,
      blowupAvoidance,
      bounceBackRate,
      bounceBackSuccess,
      bounceBackChances,
      clutchPerformance,
      handicapOutperformance,
      bogeysOrWorse,
      totalTrackedHoles,
    };
  }, [courseConfig, playerRounds]);

  const uniqueNicknames = useMemo(() => {
    const allPlayers = Array.from(new Set(sortedEvents.flatMap((event) => event.players.map((player) => player.playerName))));
    const profiles = allPlayers
      .map((name) => buildNicknameProfile(name, sortedEvents, courseConfig))
      .filter((profile): profile is NicknameProfile => profile !== null);

    const grouped = new Map<NicknameCategory, NicknameProfile[]>();
    for (const profile of profiles) {
      const existing = grouped.get(profile.category) ?? [];
      existing.push(profile);
      grouped.set(profile.category, existing);
    }

    const usedNicknames = new Set<string>();
    const map = new Map<string, string>();
    const categoryOrder: NicknameCategory[] = ['elite', 'contender', 'firestarter', 'cleanup', 'responder', 'closer', 'netBandit', 'chaos', 'damage', 'caged', 'partTime', 'steady'];

    for (const category of categoryOrder) {
      const playersInCategory = (grouped.get(category) ?? [])
        .sort((a, b) => b.score - a.score || a.playerName.localeCompare(b.playerName));
      const spec = NICKNAME_PARTS[category];

      for (const profile of playersInCategory) {
        const nickname = pickUniqueNicknameFromPool(`${profile.playerName}:${category}:nickname`, spec.pool, usedNicknames, spec.fallback);
        map.set(profile.playerName, nickname);
      }
    }

    return map;
  }, [courseConfig, sortedEvents]);

  const playerSummary = useMemo(() => {
    if (!stats || !profileMetrics) return null;

    const topThreeRate = stats.eventsPlayed > 0 ? profileMetrics.topThree / stats.eventsPlayed : 0;
    const participationRate = stats.totalEvents > 0 ? stats.eventsPlayed / stats.totalEvents : 0;
    const attendancePct = Math.round(participationRate * 100);
    const avgPoints = Number.parseFloat(stats.avgPoints);
    const avgNet = Number.parseFloat(stats.avgNet);
    const volatility = stats.bestGross !== null && stats.worstGross !== null ? stats.worstGross - stats.bestGross : null;
    const blowupAvoidance = profileMetrics.blowupAvoidance ?? null;
    const damageControl = profileMetrics.damageControl ?? null;
    const birdieRate = profileMetrics.birdieRate ?? null;
    const bounceBackRate = profileMetrics.bounceBackRate ?? null;
    const clutchPerformance = profileMetrics.clutchPerformance ?? null;
    const handicapOutperformance = profileMetrics.handicapOutperformance ?? null;
    const bestPoints = stats.bestPoints;
    const cleanCards = profileMetrics.cleanCards;
    const bogeysOrWorse = profileMetrics.bogeysOrWorse;

    const nicknameSeed = [
      playerName,
      profileMetrics.eventWins,
      profileMetrics.topThree,
      Math.round(avgPoints),
      Math.round((birdieRate ?? 0) * 10),
      Math.round((blowupAvoidance ?? 0) * 10),
    ].join(':');
    const summarySeed = `${nicknameSeed}:${stats.hcpTrend}:${Math.round((damageControl ?? 0) * 10)}:${Math.round((bounceBackRate ?? 0) * 10)}`;

    const nickname = uniqueNicknames.get(playerName) ?? 'Fairway Menace';

    const factDeck = [
      profileMetrics.eventWins > 0 || topThreeRate >= 0.5 ? {
        key: 'results',
        weight: 100 + (profileMetrics.eventWins * 20) + (profileMetrics.topThree * 8),
        read: pickVariant(`${summarySeed}:fact:results`, [
          `The results profile is loud: ${profileMetrics.eventWins} win${profileMetrics.eventWins === 1 ? '' : 's'}, ${profileMetrics.topThree} top-3 finish${profileMetrics.topThree === 1 ? '' : 'es'}, and enough weekly output to force the league to account for ${playerName} before the round even starts.`,
          `${playerName} has already built a resume instead of just a couple of decent nights, with ${profileMetrics.eventWins} win${profileMetrics.eventWins === 1 ? '' : 's'} and ${profileMetrics.topThree} appearances inside the top 3.`,
          `This is a real standings presence, not a fluke sample: ${profileMetrics.eventWins} trip${profileMetrics.eventWins === 1 ? '' : 's'} to first and ${profileMetrics.topThree} top-3 finish${profileMetrics.topThree === 1 ? '' : 'es'} say the profile belongs near the top of the sheet.`,
        ]),
        card: pickVariant(`${summarySeed}:cardfact:results`, [
          `${playerName} keeps turning competitive rounds into official paperwork, because the points total is backed by actual placements instead of good vibes.`,
          `The calling card is simple: this player cashes in real rounds often enough that the rest of the league has to build around it.`,
          `What separates ${playerName} is that the good nights do not disappear into “almost” finishes; they usually leave evidence on the leaderboard.`,
        ]),
      } : null,
      birdieRate !== null ? {
        key: 'offense',
        weight: birdieRate + ((bestPoints ?? 0) * 0.8),
        read: pickVariant(`${summarySeed}:fact:offense`, [
          `${playerName} carries real scoring heat. A ${birdieRate.toFixed(1)}% birdie rate and a high-water mark of ${bestPoints ?? '—'} points means this round can stop being polite in a hurry.`,
          `There is real offense in this profile: ${birdieRate.toFixed(1)}% birdie production gives ${playerName} a ceiling that can erase an average front half very quickly.`,
          `${playerName} is one of the players whose round can accelerate without warning, because the birdie rate is actually high enough to move the standings on its own.`,
        ]),
        card: pickVariant(`${summarySeed}:cardfact:offense`, [
          `The calling card is shot-making with consequences. When the putter cooperates, ${playerName} does not just improve the card, he starts charging rent to the field.`,
          `${playerName}'s best golf is built on creating points, not waiting for other people to donate them.`,
          `This profile becomes dangerous the moment one birdie turns into two, because the offense is real and not decorative.`,
        ]),
      } : null,
      damageControl !== null ? {
        key: damageControl >= 80 ? 'control' : 'fragility',
        weight: damageControl >= 80 ? damageControl : 100 - damageControl,
        read: damageControl >= 80
          ? pickVariant(`${summarySeed}:fact:control`, [
              `${playerName} keeps the round employable. A ${damageControl.toFixed(0)} damage-control mark with ${cleanCards} clean card${cleanCards === 1 ? '' : 's'} means the bad stuff usually gets contained before it becomes a full shift of nonsense.`,
              `The profile has a real floor because ${playerName} does not donate many catastrophic stretches. ${damageControl.toFixed(0)} in damage control is not flashy, but it pays bills.`,
              `${playerName}'s card rarely goes fully off payroll. The damage-control score of ${damageControl.toFixed(0)} keeps even messy rounds from turning into community service.`,
            ])
          : pickVariant(`${summarySeed}:fact:fragility`, [
              `${playerName} has workable golf in the bag, but the round still struggles to survive its own mistakes. A ${damageControl.toFixed(0)} damage-control score means the recovery phase is still too expensive.`,
              `The profile is not short on playable holes; it is short on containment. ${damageControl.toFixed(0)} damage control keeps showing that one bad stretch is still doing too much damage.`,
              `${playerName} is still paying interest after mistakes. The damage-control number of ${damageControl.toFixed(0)} makes that part of the profile hard to ignore.`,
            ]),
        card: damageControl >= 80
          ? pickVariant(`${summarySeed}:cardfact:control`, [
              `The calling card is emergency competence. ${playerName} almost always gives himself something to work with on the next hole instead of detonating the whole night.`,
              `${playerName}'s most bankable trait is that the card usually remains recoverable, even when the round gets weird.`,
              `The value here is in how rarely one wobble becomes a write-off. That floor is doing heavy lifting.`,
            ])
          : pickVariant(`${summarySeed}:cardfact:fragility`, [
              `The calling card, for now, is that mistakes still bring friends. ${playerName} can survive the first miss, but the follow-up damage is where the card keeps getting taxed.`,
              `The problem is not the existence of bad holes; it is how often they grow legs and start walking through the rest of the round.`,
              `Right now the round still needs an emergency brake. Until that shows up, every wobble has sequel potential.`,
            ]),
      } : null,
      blowupAvoidance !== null ? {
        key: blowupAvoidance >= 85 ? 'stable' : 'chaos',
        weight: blowupAvoidance >= 85 ? blowupAvoidance : 100 - blowupAvoidance,
        read: blowupAvoidance >= 85
          ? pickVariant(`${summarySeed}:fact:stable`, [
              `${playerName} does not hand out many free implosions. With blow-up avoidance at ${blowupAvoidance.toFixed(0)}, the profile usually forces the league to beat solid golf instead of waiting for a scene.`,
              `The cleanest thing about this profile is how rarely it turns into a public emergency. Blow-up avoidance at ${blowupAvoidance.toFixed(0)} keeps the floor respectable.`,
              `${playerName} is usually making the field earn it. The blow-up holes are scarce enough that the round tends to stay inside the rails.`,
            ])
          : pickVariant(`${summarySeed}:fact:chaos`, [
              `The chaos is quantifiable. Blow-up avoidance at ${blowupAvoidance.toFixed(0)} and ${bogeysOrWorse} bogey-or-worse holes in the sample means the ugly part of the card is still too available.`,
              `${playerName} is still one crooked stretch away from a full-on incident report. The blow-up avoidance number of ${blowupAvoidance.toFixed(0)} explains why.`,
              `There is still too much live ammunition in the bad-hole profile. A ${blowupAvoidance.toFixed(0)} blow-up avoidance score keeps making the round flinchy.`,
            ]),
        card: blowupAvoidance >= 85
          ? pickVariant(`${summarySeed}:cardfact:stable`, [
              `The calling card is simple: nothing gets stupid very often. That alone makes ${playerName} more annoying than the flashier profiles.`,
              `${playerName} wins a lot of value by refusing to provide the giant number everyone else is waiting for.`,
              `This player makes you earn the round because the meltdown window stays mostly closed.`,
            ])
          : pickVariant(`${summarySeed}:cardfact:chaos`, [
              `The calling card is expensive holes. Until those stop showing up in clusters, every decent stretch has to survive its own jump scare.`,
              `${playerName}'s round is still carrying a fire hazard sticker. The biggest scores on the card are doing too much of the storytelling.`,
              `Too much of the profile still comes down to whether the disaster holes stay in the holster. Right now they do not always stay there.`,
            ]),
      } : null,
      bounceBackRate !== null ? {
        key: bounceBackRate >= 50 ? 'response' : 'hangover',
        weight: Math.abs(bounceBackRate - 50),
        read: bounceBackRate >= 50
          ? pickVariant(`${summarySeed}:fact:response`, [
              `${playerName} has a real recovery gear. A ${bounceBackRate.toFixed(0)}% bounce-back rate means bad holes are often followed by a useful response instead of a sequel.`,
              `One of the more valuable things ${playerName} does is refuse to let one mistake occupy the whole scorecard. ${bounceBackRate.toFixed(0)}% bounce-back is a real stabilizer.`,
              `${playerName} tends to answer trouble instead of narrating it for three holes. A ${bounceBackRate.toFixed(0)}% bounce-back rate backs that up.`,
            ])
          : pickVariant(`${summarySeed}:fact:hangover`, [
              `${playerName} is still wearing too much of the last mistake. A ${bounceBackRate.toFixed(0)}% bounce-back rate means the recovery hole is not arriving often enough.`,
              `The round is still carrying emotional baggage. ${bounceBackRate.toFixed(0)}% bounce-back says one mistake keeps bleeding into the next decision too often.`,
              `${playerName} is not losing every round on one bad swing, but the answer hole is still arriving late. ${bounceBackRate.toFixed(0)}% bounce-back tells that story clearly.`,
            ]),
        card: bounceBackRate >= 50
          ? pickVariant(`${summarySeed}:cardfact:response`, [
              `The calling card is recovery under pressure. ${playerName} does not panic cleanly, but he usually stops the bleeding before the card needs last rites.`,
              `${playerName}'s bounce-back game quietly saves more rounds than the highlight stats will ever admit.`,
              `There is real survival skill here. Bad holes rarely get the kind of sequel they need to wreck the whole night.`,
            ])
          : pickVariant(`${summarySeed}:cardfact:hangover`, [
              `The calling card, at the moment, is the aftershock. The first mistake hurts, and the next hole still tends to carry the bruise.`,
              `${playerName} is still paying next-hole tax after trouble, and that is where too many decent cards lose their shape.`,
              `The recovery game is where this profile keeps leaking value. Until that improves, every mistake arrives with interest.`,
            ]),
      } : null,
      handicapOutperformance !== null ? {
        key: handicapOutperformance >= 0 ? 'netPlus' : 'netMinus',
        weight: Math.abs(handicapOutperformance) * 10,
        read: handicapOutperformance >= 0
          ? pickVariant(`${summarySeed}:fact:netplus`, [
              `${playerName} keeps cashing the number. Beating net par by ${formatSigned(handicapOutperformance, 1)} means the scoring profile is more useful than it sometimes looks from the outside.`,
              `The handicap is not decorative here. ${playerName} is outperforming net par by ${formatSigned(handicapOutperformance, 1)}, which turns ordinary-looking rounds into actual points.`,
              `${playerName} keeps finding value on the net side of the card. ${formatSigned(handicapOutperformance, 1)} versus net par is enough to matter over a season.`,
            ])
          : pickVariant(`${summarySeed}:fact:netminus`, [
              `${playerName} is still leaving some value unclaimed on the net line. ${formatSigned(handicapOutperformance, 1)} versus net par says the number has not been fully turned into points yet.`,
              `There is still money sitting on the table in the handicap game. ${formatSigned(handicapOutperformance, 1)} against net par is not a disaster, but it is not a weapon yet either.`,
              `${playerName} is playable gross-to-net, but the handicap line is not being squeezed hard enough yet. ${formatSigned(handicapOutperformance, 1)} tells that story.`,
            ]),
        card: handicapOutperformance >= 0
          ? pickVariant(`${summarySeed}:cardfact:netplus`, [
              `The calling card is quiet theft. ${playerName} keeps turning reasonable net golf into points without needing a circus act.`,
              `${playerName}'s most underrated trait is how often the handicap line gets converted into something useful.`,
              `This profile sneaks value out of the number often enough that it becomes a season-long problem for everyone else.`,
            ])
          : pickVariant(`${summarySeed}:cardfact:netminus`, [
              `The calling card is unfinished business on the net side. There is still a version of ${playerName} that should be cashing this number harder than he currently is.`,
              `${playerName} has some hidden upside parked in the handicap line, but the conversion rate is not there yet.`,
              `The number looks more generous than the point total it is currently producing, which leaves room for a much better version of this profile.`,
            ]),
      } : null,
      {
        key: 'baseline',
        weight: 5 + attendancePct / 10 + avgPoints,
        read: pickVariant(`${summarySeed}:fact:baseline`, [
          `${playerName} is carrying ${attendancePct}% availability, ${stats.avgPoints} points a week, and an average net of ${avgNet.toFixed(1)}. That is enough information to call the profile real, even if it still has a few loose screws.`,
          `The baseline file on ${playerName} is now thick enough to trust: ${attendancePct}% attendance, ${stats.avgPoints} points per week, and a scoring profile that no longer looks accidental.`,
          `${playerName} has logged enough nights and enough useful scoring to stop being theory. ${attendancePct}% attendance and ${stats.avgPoints} points per week make the profile concrete.`,
        ]),
        card: pickVariant(`${summarySeed}:cardfact:baseline`, [
          `The calling card is that ${playerName} keeps showing up with enough golf to matter, even when the style points are limited.`,
          `${playerName} keeps stacking usable rounds, which is less glamorous than a heater but more annoying over a full season.`,
          `There is a real worker-bee quality here: not every round is loud, but too many of them are useful to ignore.`,
        ]),
      },
    ].filter((fact): fact is { key: string; weight: number; read: string; card: string } => Boolean(fact))
      .sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));

    const primaryFact = factDeck[0];
    const secondaryFact = factDeck[1] ?? factDeck[0];
    const tertiaryFact = factDeck[2] ?? factDeck[1] ?? factDeck[0];

    const subtitle = (() => {
      const headline = latestStanding
        ? pickVariant(`${summarySeed}:headline:ranked`, [
            `${playerName} currently sits ${latestStanding.position}${latestStanding.position === 1 ? 'st' : latestStanding.position === 2 ? 'nd' : latestStanding.position === 3 ? 'rd' : 'th'} in the league, and the profile explains why.`,
            `The current rank of #${latestStanding.position} is not random noise; the shape of ${playerName}'s card keeps pointing back to it.`,
            `${playerName} is sitting at #${latestStanding.position} right now, and the profile reads like someone who has earned that neighborhood.`,
          ])
        : pickVariant(`${summarySeed}:headline:unranked`, [
            `${playerName} has a profile that is clearer now than it was a month ago.`,
            `${playerName} is no longer hard to read; the card is starting to tell on itself.`,
            `There is enough sample now to say what kind of player ${playerName} actually is.`,
          ]);
      return `${headline} ${primaryFact.read} ${secondaryFact.key !== primaryFact.key ? secondaryFact.read : tertiaryFact.read}`;
    })();

    const resultLine = profileMetrics.eventWins > 0 || profileMetrics.topThree > 0
      ? pickVariant(`${summarySeed}:results:wins`, [
          `${profileMetrics.eventWins} win${profileMetrics.eventWins === 1 ? '' : 's'} and ${profileMetrics.topThree} top-3 finish${profileMetrics.topThree === 1 ? '' : 'es'} across ${stats.eventsPlayed} start${stats.eventsPlayed === 1 ? '' : 's'}, while averaging ${stats.avgPoints} points a week.`,
          `The results are real: ${profileMetrics.eventWins} win${profileMetrics.eventWins === 1 ? '' : 's'}, ${profileMetrics.topThree} trip${profileMetrics.topThree === 1 ? '' : 's'} into the top 3, and ${stats.avgPoints} points per outing over ${stats.eventsPlayed} round${stats.eventsPlayed === 1 ? '' : 's'}.`,
          `Across ${stats.eventsPlayed} start${stats.eventsPlayed === 1 ? '' : 's'}, the resume reads ${profileMetrics.eventWins} win${profileMetrics.eventWins === 1 ? '' : 's'}, ${profileMetrics.topThree} top-3 finish${profileMetrics.topThree === 1 ? '' : 'es'}, and a weekly scoring rate of ${stats.avgPoints} points.`,
        ])
      : pickVariant(`${summarySeed}:results:steady`, [
          `${stats.eventsPlayed} start${stats.eventsPlayed === 1 ? '' : 's'} so far, with an average of ${stats.avgPoints} points and ${stats.avgNet} net across ${Math.round(participationRate * 100)}% of the schedule.`,
          `Through ${stats.eventsPlayed} appearance${stats.eventsPlayed === 1 ? '' : 's'}, the profile is sitting at ${stats.avgPoints} points per week and ${stats.avgNet} net while covering ${Math.round(participationRate * 100)}% of the calendar.`,
          `The working sample is ${stats.eventsPlayed} start${stats.eventsPlayed === 1 ? '' : 's'}: ${stats.avgPoints} points per round, ${stats.avgNet} net on average, and availability in ${Math.round(participationRate * 100)}% of league nights.`,
        ]);

    const callingCard = (() => {
      const extraContext = pickVariant(`${summarySeed}:card:context`, [
        `That matters more because the best gross is ${stats.bestGross ?? '—'} and the worst gross is ${stats.worstGross ?? '—'}, so the gap between good-night ${playerName} and bad-night ${playerName} is ${volatility ?? '—'} stroke${volatility === 1 ? '' : 's'}.`,
        `The sample is also large enough to trust, with ${attendancePct}% attendance and ${stats.eventsPlayed} played event${stats.eventsPlayed === 1 ? '' : 's'} feeding the profile.`,
        `Put differently: this is not a one-round illusion. The scoring sample is wide enough that the traits showing up here are real.`,
      ]);
      return `${primaryFact.card} ${secondaryFact.key !== primaryFact.key ? secondaryFact.card : tertiaryFact.card} ${extraContext}`;
    })();

    const developmentLine = (() => {
      if (stats.hcpTrend === 'down' && handicapOutperformance !== null && handicapOutperformance > 0) {
        return pickVariant(`${summarySeed}:trend:improving`, [
          'The handicap trend is moving the right way, and the scoring profile suggests the improvement is real rather than random noise.',
          'The numbers point to genuine improvement rather than a couple of lucky nights propping up the graph.',
          'The recent shape of the card says this player is actually getting better, not just surviving the schedule.',
        ]);
      }
      if (stats.hcpTrend === 'up' && damageControl !== null && damageControl < 75) {
        return pickVariant(`${summarySeed}:trend:sliding`, [
          'The handicap has drifted the wrong way, and the profile backs it up with too many holes where the damage keeps snowballing.',
          'The trend line is honest here: the card has been giving away too much ground once trouble arrives.',
          'The recent direction is not flattering, and the underlying profile agrees with it.',
        ]);
      }
      if (avgNet <= 36 && clutchPerformance !== null && clutchPerformance <= 0) {
        return pickVariant(`${summarySeed}:trend:baseline`, [
          'There is enough baseline scoring here to matter every week, especially when the finishing holes stay under control.',
          'The floor is good enough to stay relevant most weeks, which is why the closing stretch matters so much.',
          'The foundation is better than the occasional finish suggests, and that keeps this player in the conversation.',
        ]);
      }
      if (avgPoints < 8 && birdieRate !== null && birdieRate < 10) {
        return pickVariant(`${summarySeed}:trend:softfloor`, [
          'The weekly floor is still too soft, because there is not enough scoring punch to offset the mistakes that do show up.',
          'Right now the ceiling is not bailing out the floor, and that leaves too many rounds feeling stuck in neutral.',
          'The card needs either fewer mistakes or more offense, because at the moment it has neither often enough.',
        ]);
      }
      return pickVariant(`${summarySeed}:trend:default`, [
        'The shape of the profile is established, but the week-to-week finish still determines whether this lands as solid or forgettable.',
        'The identity is mostly clear; the remaining swing factor is how cleanly the round gets to the clubhouse.',
        'This player already has a defined lane, but the final result still depends on whether the late holes cooperate.',
      ]);
    })();

    const watchItem = (() => {
      if (blowupAvoidance !== null && blowupAvoidance < 70 && bounceBackRate !== null && bounceBackRate < 40) {
        return pickVariant(`${summarySeed}:watch:chaos`, [
          'Right now the profile is leaking too many shots after mistakes, so the honest fix is cleaner damage control and a better response on the next hole.',
          'The fastest fix is stopping bad holes from turning into full-card panic.',
          'If the recovery hole improves, the entire profile looks different in a hurry.',
        ]);
      }
      if (blowupAvoidance !== null && blowupAvoidance < 75) {
        return pickVariant(`${summarySeed}:watch:blowup`, [
          'The quickest way up the standings is trimming the double-and-worse holes, because they are costing too many otherwise playable rounds.',
          'This profile does not need a miracle; it needs fewer expensive mistakes.',
          'The cleanest ranking jump is available by making the worst holes merely bad instead of disastrous.',
        ]);
      }
      if (bounceBackRate !== null && bounceBackRate < 40) {
        return pickVariant(`${summarySeed}:watch:bounce`, [
          'The next jump is in the recovery game after mistakes, because bad holes are lingering longer than they should.',
          'One better answer hole after trouble would change the scoring profile more than another random birdie.',
          'The profile needs a shorter memory after mistakes if it wants the points total to move.',
        ]);
      }
      if (clutchPerformance !== null && clutchPerformance > 0.5) {
        return pickVariant(`${summarySeed}:watch:close`, [
          'Late-hole execution is giving away points right now, so finishing the side better would move the needle fast.',
          'The most obvious leak is at the end of the side, where too many decent rounds are losing their shape.',
          'The closing holes are still taxing the card harder than they should, and that is where the easiest points are hiding.',
        ]);
      }
      if (birdieRate !== null && birdieRate < 10) {
        return pickVariant(`${summarySeed}:watch:ceiling`, [
          'There is not enough scoring pressure yet, so more real birdie looks are needed to raise the ceiling.',
          'The card needs a few more holes each night where it is actually threatening red numbers.',
          'Without more birdie pressure, this profile stays too dependent on everyone else making mistakes.',
        ]);
      }
      return pickVariant(`${summarySeed}:watch:default`, [
        'The profile is balanced overall, with marginal gains likely coming from sharper closing holes.',
        'There is no single emergency here; the next step is just turning a few average finishes into cleaner endings.',
        'The path upward is more polish than overhaul, especially late in the round.',
      ]);
    })();

    const badgeItems = [
      profileMetrics.cleanCards > 0 ? `${profileMetrics.cleanCards} clean card${profileMetrics.cleanCards === 1 ? '' : 's'}` : null,
      profileMetrics.damageControl !== null ? `${profileMetrics.damageControl.toFixed(0)} damage control` : null,
      profileMetrics.blowupAvoidance !== null ? `${profileMetrics.blowupAvoidance.toFixed(0)} blow-up avoidance` : null,
      profileMetrics.handicapOutperformance !== null ? `${formatSigned(profileMetrics.handicapOutperformance, 1)} vs net par` : null,
    ].filter((item): item is string => Boolean(item)).slice(0, 3);

    return {
      title: nickname,
      subtitle,
      resultLine,
      callingCard,
      developmentLine,
      watchItem,
      badges: badgeItems,
    };
  }, [playerName, profileMetrics, stats, uniqueNicknames]);

  // ── Scoring breakdown totals (uses course pars if available) ──────────────
  const breakdown = useMemo(() => {
    const totals = { Eagles: 0, Birdies: 0, Pars: 0, Bogeys: 0, 'Dbl Bogeys': 0, 'Trpl+': 0, Other: 0 };
    for (const { ev, data } of playerRounds) {
      if (!data) continue;
      if (courseConfig) {
        const pars = getParsForNine(courseConfig, ev.nineHoles ?? 'front');
        const bd = computeBreakdown(data.holes, pars);
        totals.Eagles     += bd.eagles;
        totals.Birdies    += bd.birdies;
        totals.Pars       += bd.pars;
        totals.Bogeys     += bd.bogeys;
        totals['Dbl Bogeys'] += bd.doubleBogeys;
        totals['Trpl+']   += bd.tripleBogeys;
        totals.Other      += bd.other;
      }
    }
    return Object.entries(totals)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [playerRounds, courseConfig]);

  // ── Per-event chart data ───────────────────────────────────────────────────
  const eventChartData = useMemo(() =>
    playerRounds.map(({ ev, data, standing }) => ({
      label: `E${ev.eventNumber}`,
      date: ev.eventDate,
      dropped: droppedEventIds.has(ev.id),
      side: ev.nineHoles === 'back' ? 'Back' : 'Front',
      gross: data?.grossScore ?? null,
      net: data?.netScore ?? null,
      points: data?.points ?? 0,
      handicap: data?.handicap ?? null,
      frontHandicap: ev.nineHoles === 'back' ? null : (data?.handicap ?? null),
      backHandicap: ev.nineHoles === 'back' ? (data?.handicap ?? null) : null,
      position: standing?.position ?? null,
      cumulativePoints: standing?.cumulativePoints ?? 0,
    })),
    [droppedEventIds, playerRounds]);

  // ── Per-hole stats for this player vs field ──────────────────────────────
  const perHoleStats = useMemo(() => {
    if (!courseConfig) return null;

    const nines: ('front' | 'back')[] = ['front', 'back'];
    return nines.map(nine => {
      const startHole = nine === 'back' ? 10 : 1;
      const pars = getParsForNine(courseConfig, nine);
      const relevantEvs = sortedEvents.filter(ev => ev.nineHoles === nine);
      if (!relevantEvs.length) return null;

      const holes = Array.from({ length: 9 }, (_, slotIdx) => {
        const holeNum = startHole + slotIdx;
        const par = pars[slotIdx];

        // This player's scores on this hole
        const playerScores: number[] = [];
        for (const ev of relevantEvs) {
          const pd = ev.players.find(p => p.playerName === playerName);
          if (!pd || pd.didNotPlay) continue;
          const s = pd.holes[slotIdx];
          if (s !== null && s !== undefined) playerScores.push(s);
        }

        // Per-player averages for ranking
        const playerAvgMap: Record<string, number[]> = {};
        for (const ev of relevantEvs) {
          for (const p of ev.players) {
            if (p.didNotPlay) continue;
            const s = p.holes[slotIdx];
            if (s === null || s === undefined) continue;
            if (!playerAvgMap[p.playerName]) playerAvgMap[p.playerName] = [];
            playerAvgMap[p.playerName].push(s);
          }
        }
        const playerAvgsSorted = Object.entries(playerAvgMap)
          .map(([name, scores]) => ({ name, avg: scores.reduce((a, b) => a + b, 0) / scores.length }))
          .sort((a, b) => a.avg - b.avg); // lower avg = better rank

        const pAvg = playerScores.length ? playerScores.reduce((s, n) => s + n, 0) / playerScores.length : null;

        // Field scores on this hole
        const allFieldScores: number[] = Object.values(playerAvgMap).flat();
        const fAvg = allFieldScores.length ? allFieldScores.reduce((s, n) => s + n, 0) / allFieldScores.length : null;

        // Rank: position of this player among all who played this hole
        const rankEntry = playerAvgsSorted.findIndex(e => e.name === playerName);
        const rank = rankEntry >= 0 ? rankEntry + 1 : null;
        const totalRanked = playerAvgsSorted.length;

        return {
          holeNum,
          label: `H${holeNum}`,
          par,
          playerAvg: pAvg !== null ? Math.round(pAvg * 100) / 100 : null,
          fieldAvg:  fAvg !== null ? Math.round(fAvg * 100) / 100 : null,
          playerVsPar: pAvg !== null ? Math.round((pAvg - par) * 100) / 100 : null,
          fieldVsPar:  fAvg !== null ? Math.round((fAvg - par) * 100) / 100 : null,
          advantage: pAvg !== null && fAvg !== null ? Math.round((pAvg - fAvg) * 100) / 100 : null,
          rounds: playerScores.length,
          best:  playerScores.length ? Math.min(...playerScores) : null,
          worst: playerScores.length ? Math.max(...playerScores) : null,
          rank,
          totalRanked,
        };
      });

      return { nine, label: nine === 'front' ? 'Front 9 — Holes 1–9' : 'Back 9 — Holes 10–18', holes };
    }).filter(Boolean);
  }, [courseConfig, sortedEvents, playerName]);

  // ── Hole-by-hole scorecard table ──────────────────────────────────────────
  const roundScorecardGroups = useMemo(() => {
    const groups = [
      {
        nine: 'front' as const,
        label: 'Front 9',
        startHole: 1,
        rounds: playerRounds.filter(({ ev }) => ev.nineHoles !== 'back'),
      },
      {
        nine: 'back' as const,
        label: 'Back 9',
        startHole: 10,
        rounds: playerRounds.filter(({ ev }) => ev.nineHoles === 'back'),
      },
    ];

    return groups
      .map((group) => ({
        ...group,
        holeHeaders: Array.from({ length: 9 }, (_, index) => group.startHole + index),
      }))
      .filter((group) => group.rounds.length > 0);
  }, [playerRounds]);

  // ── Radar data (scoring profile vs averages) ──────────────────────────────
  const radarData = useMemo(() => {
    if (!breakdown.length) return [];
    const total = breakdown.reduce((s, b) => s + b.value, 0);
    return breakdown.map(b => ({
      subject: b.name,
      value: total > 0 ? Math.round((b.value / total) * 100) : 0,
    }));
  }, [breakdown]);

  const lastName = playerName.split(',')[0].trim();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="pp-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="pp-header">
          <div className="pp-header-left">
            <div className="pp-avatar" style={{ background: color }}>
              {lastName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="pp-name">{playerName}</h2>
              {latestStanding && (
                <p className="pp-rank">
                  Rank <strong>#{latestStanding.position}</strong>
                  <span className="pp-rank-sep">·</span>
                  <strong>{latestStanding.cumulativePoints}</strong> pts total
                </p>
              )}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={22} /></button>
        </div>

        <div className="pp-body">

          {/* ── Stat cards ─────────────────────────────────────────── */}
          {stats && (
            <div className="pp-stats-row">
              <StatCard label="Events Played" value={`${stats.eventsPlayed} / ${stats.totalEvents}`} />
              <StatCard label="Avg Gross" value={stats.avgGross} />
              <StatCard label="Avg Net" value={stats.avgNet} />
              <StatCard label="Avg Points" value={stats.avgPoints} />
              <StatCard label="Best Gross" value={stats.bestGross ?? '—'} />
              <StatCard label="Best Points" value={stats.bestPoints ?? '—'} />
              {handicapMode === 'front-back' ? (
                <>
                  <StatCard label="Current Front H'cap" value={stats.currentFrontHcp} trend={stats.frontHcpTrend} />
                  <StatCard label="Current Back H'cap" value={stats.currentBackHcp} trend={stats.backHcpTrend} />
                </>
              ) : (
                <StatCard label={`Current ${handicapLabel}`} value={stats.currentHcp} trend={stats.hcpTrend} />
              )}
            </div>
          )}

          {playerSummary && (
            <>
              <div className="pp-section-title">Player Summary</div>
              <div className="pp-summary-card">
                <div className="pp-summary-eyebrow">Scouting Report</div>
                <div className="pp-summary-title">{playerSummary.title}</div>
                <div className="pp-summary-body"><strong>Read:</strong> {playerSummary.subtitle}</div>
                <div className="pp-summary-body"><strong>Snapshot:</strong> {playerSummary.resultLine}</div>
                <div className="pp-summary-body"><strong>Calling Card:</strong> {playerSummary.callingCard}</div>
                <div className="pp-summary-body"><strong>Trend:</strong> {playerSummary.developmentLine}</div>
                <div className="pp-summary-points">
                  {playerSummary.badges.map((badge) => (
                    <span key={badge} className="pp-summary-pill">{badge}</span>
                  ))}
                </div>
                <div className="pp-summary-footer"><strong>What Changes the Ranking:</strong> {playerSummary.watchItem}</div>
              </div>
            </>
          )}

          {profileMetrics && (
            <>
              <div className="pp-section-title">Player Metrics</div>
              <div className="pp-stats-row">
                <StatCard label="Event Wins" value={profileMetrics.eventWins} />
                <StatCard label="Top-3 Finishes" value={profileMetrics.topThree} />
                <StatCard label="Clean Cards" value={profileMetrics.cleanCards} />
                <StatCard label="Birdie Rate" value={profileMetrics.birdieRate !== null ? `${profileMetrics.birdieRate.toFixed(1)}%` : '—'} />
                <StatCard label="Par Rate" value={profileMetrics.parRate !== null ? `${profileMetrics.parRate.toFixed(1)}%` : '—'} />
                <StatCard label="Damage Control" value={profileMetrics.damageControl !== null ? `${profileMetrics.damageControl.toFixed(0)}` : '—'} />
                <StatCard label="Blow-Up Avoidance" value={profileMetrics.blowupAvoidance !== null ? `${profileMetrics.blowupAvoidance.toFixed(0)}` : '—'} />
                <StatCard label="Bounce-Back" value={profileMetrics.bounceBackRate !== null ? `${profileMetrics.bounceBackRate.toFixed(1)}%` : '—'} sub={profileMetrics.bounceBackChances > 0 ? `${profileMetrics.bounceBackSuccess}/${profileMetrics.bounceBackChances}` : 'No chances'} />
                <StatCard label="Clutch Holes" value={profileMetrics.clutchPerformance !== null ? formatSigned(profileMetrics.clutchPerformance, 2) : '—'} sub="Final 3 holes vs par" />
                <StatCard label="Handicap Outperformance" value={profileMetrics.handicapOutperformance !== null ? formatSigned(profileMetrics.handicapOutperformance, 2) : '—'} sub="vs net par" />
              </div>
            </>
          )}

          {playerRounds.length === 0 && (
            <p style={{ color: '#888', padding: '24px 0', textAlign: 'center' }}>
              No rounds played yet.
            </p>
          )}

          {playerRounds.length > 0 && (
            <>
              {/* ── Points + cumulative history ─────────────────────── */}
              <div className="pp-section-title">Points History</div>
              {adjustedMode === 'drop-lowest' && droppedEventIds.size > 0 && (
                <p className="pp-chart-label" style={{ marginBottom: 8 }}>
                  Dropped rounds are shown in muted gray and tagged "Dropped" in scorecards.
                </p>
              )}
              <div className="pp-charts-row">
                <div className="pp-chart-half">
                  <p className="pp-chart-label">Points per Event</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={eventChartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                      <XAxis dataKey="label" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                        labelStyle={{ color: c.text2 }}
                        formatter={(value, name, entry: { payload?: { dropped?: boolean } }) => {
                          if (name === 'Points') {
                            return [
                              entry.payload?.dropped ? `${value} (dropped)` : value,
                              'Points',
                            ];
                          }
                          return [value, name];
                        }}
                      />
                      <Bar dataKey="points" name="Points" radius={[3, 3, 0, 0]}>
                        {eventChartData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={entry.dropped ? '#94a3b8' : color}
                            opacity={entry.dropped ? 0.45 : (0.7 + i * (0.3 / Math.max(eventChartData.length, 1)))}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="pp-chart-half">
                  <p className="pp-chart-label">Cumulative Points</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={eventChartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                      <XAxis dataKey="label" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                        labelStyle={{ color: c.text2 }}
                      />
                      <Line type="linear" dataKey="cumulativePoints" name="Cumulative" stroke={color} strokeWidth={2.5} dot={{ r: 4, fill: color }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Gross / Net scores ───────────────────────────────── */}
              <div className="pp-section-title">Score History</div>
              <div className="pp-charts-row">
                <div className="pp-chart-half">
                  <p className="pp-chart-label">Gross &amp; Net Scores (lower = better)</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={eventChartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                      <XAxis dataKey="label" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                        labelStyle={{ color: c.text2 }}
                      />
                      <Line type="linear" dataKey="gross" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} name="Gross" connectNulls />
                      <Line type="linear" dataKey="net"   stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Net"   connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="pp-chart-half">
                  <p className="pp-chart-label">
                    {handicapMode === 'front-back' ? 'Side Handicap (Front vs Back)' : handicapLongLabel}
                  </p>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={eventChartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                      <XAxis dataKey="label" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                        labelStyle={{ color: c.text2 }}
                        formatter={(value, name, entry: { payload?: { side?: string } }) => {
                          if (handicapMode !== 'front-back') return [value, name];
                          if (name === 'Front Handicap') return [value, 'Front Handicap'];
                          if (name === 'Back Handicap') return [value, 'Back Handicap'];
                          const side = entry.payload?.side ?? 'Unknown side';
                          return [value, `${name} (${side})`];
                        }}
                      />
                      {handicapMode === 'front-back' ? (
                        <>
                          <Line type="linear" dataKey="frontHandicap" name="Front Handicap" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                          <Line type="linear" dataKey="backHandicap" name="Back Handicap" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                        </>
                      ) : (
                        <Line type="linear" dataKey="handicap" name={handicapLongLabel} stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Ranking history ──────────────────────────────────── */}
              <div className="pp-section-title">Ranking History</div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={eventChartData} margin={{ top: 4, right: 16, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                  <XAxis dataKey="label" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                  <YAxis reversed stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }}
                    label={{ value: 'Rank', angle: -90, position: 'insideLeft', fill: c.tick, fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                    labelStyle={{ color: c.text2 }}
                    formatter={(v) => [`#${v}`, 'Position']}
                  />
                  <Line type="linear" dataKey="position" name="Position" stroke={color} strokeWidth={2.5}
                    dot={{ r: 4, fill: color }} connectNulls />
                </LineChart>
              </ResponsiveContainer>

              {/* ── Scoring breakdown ────────────────────────────────── */}
              {breakdown.length > 0 ? (
                <>
                  <div className="pp-section-title">Scoring Breakdown</div>
                  <div className="pp-charts-row">
                    <div className="pp-chart-half">
                      <p className="pp-chart-label">Totals</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={breakdown} layout="vertical" margin={{ top: 4, right: 30, left: 60, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={false} />
                          <XAxis type="number" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} width={70} />
                          <Tooltip
                            contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                            labelStyle={{ color: c.text2 }}
                          />
                          <Bar dataKey="value" name="Count" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                            {breakdown.map((b) => (
                              <Cell key={b.name} fill={SCORE_COLORS[b.name] ?? '#4f8ef7'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="pp-chart-half">
                      <p className="pp-chart-label">Profile (%)</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <RadarChart data={radarData} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
                          <PolarGrid stroke={c.grid} />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: c.tick, fontSize: 10 }} />
                          <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.25} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              ) : courseConfig === null ? (
                <p className="pp-no-course">Set up your course scorecard to see scoring breakdown.</p>
              ) : null}

              {/* ── Hole-by-hole scorecard ───────────────────────────── */}
              {/* ── Per-hole performance ─────────────────────────── */}
              {perHoleStats && perHoleStats.length > 0 && perHoleStats.map(group => {
                if (!group) return null;
                const hasData = group.holes.some(h => h.rounds > 0);
                if (!hasData) return null;

                const chartData = group.holes.filter(h => h.playerAvg !== null);

                return (
                  <div key={group.nine}>
                    <div className="pp-section-title">Per-Hole Performance — {group.label}</div>
                    <p className="pp-chart-label" style={{ marginBottom: 8 }}>
                      Your avg vs field avg per hole · green bar = better than field, red = worse
                    </p>

                    {/* Advantage chart */}
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={chartData} margin={{ top: 4, right: 10, left: -20, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                        <XAxis dataKey="label" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                        <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }}
                          tickFormatter={(v: number) => (v >= 0 ? `+${v}` : `${v}`)}
                        />
                        <Tooltip
                          contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                          labelStyle={{ color: c.text2, fontWeight: 700 }}
                          formatter={(val) => [
                            `${Number(val) >= 0 ? '+' : ''}${Number(val).toFixed(2)} vs field`,
                            'Advantage',
                          ]}
                        />
                        <Bar dataKey="advantage" name="vs Field" radius={[3, 3, 0, 0]}>
                          {chartData.map((d, i) => (
                            <Cell
                              key={i}
                              fill={d.advantage === null ? c.grid
                                : d.advantage < 0 ? '#22c55e'   // lower = better
                                : d.advantage > 0 ? '#ef4444'
                                : '#4f8ef7'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    {/* Per-hole detail table */}
                    <div className="pp-scorecard-wrap" style={{ marginTop: 12 }}>
                      <table className="pp-scorecard">
                        <thead>
                          <tr>
                            <th className="pp-sc-label">Hole</th>
                            <th>Par</th>
                            <th>Rounds</th>
                            <th>Your Avg</th>
                            <th>vs Par</th>
                            <th>Field Avg</th>
                            <th title="Your avg minus field avg — negative = better than field">vs Field</th>
                            <th title="Rank among all players by avg score on this hole (1 = best)">Rank</th>
                            <th style={{ color: '#22c55e' }}>Best</th>
                            <th style={{ color: '#ef4444' }}>Worst</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.holes.map((h, i) => {
                            const vsParColor = h.playerVsPar === null ? c.tick
                              : h.playerVsPar < 0 ? '#22c55e'
                              : h.playerVsPar === 0 ? '#4f8ef7'
                              : h.playerVsPar <= 1  ? '#f97316'
                              : '#ef4444';
                            const vsFieldColor = h.advantage === null ? c.tick
                              : h.advantage < 0  ? '#22c55e'
                              : h.advantage > 0  ? '#ef4444'
                              : c.tick;
                            return (
                              <tr key={i} className={i % 2 === 0 ? '' : 'pp-sc-row'}>
                                <td className="pp-sc-label">
                                  {onHoleClick ? (
                                    <button
                                      className="hs-hole-badge hs-hole-clickable"
                                      style={{ background: color, color: '#fff' }}
                                      onClick={() => onHoleClick(h.holeNum, group.nine)}
                                      title={`View hole ${h.holeNum} profile`}
                                    >
                                      {h.holeNum}
                                    </button>
                                  ) : (
                                    <span className="hs-hole-badge" style={{ background: color, color: '#fff' }}>
                                      {h.holeNum}
                                    </span>
                                  )}
                                </td>
                                <td className="pp-sc-hole-cell">{h.par}</td>
                                <td className="pp-sc-hole-cell">{h.rounds}</td>
                                <td className="pp-sc-hole-cell" style={{ fontWeight: 600 }}>
                                  {h.playerAvg !== null ? h.playerAvg.toFixed(2) : '—'}
                                </td>
                                <td className="pp-sc-hole-cell" style={{ color: vsParColor, fontWeight: 700 }}>
                                  {h.playerVsPar !== null
                                    ? `${h.playerVsPar >= 0 ? '+' : ''}${h.playerVsPar.toFixed(2)}`
                                    : '—'}
                                </td>
                                <td className="pp-sc-hole-cell" style={{ color: c.text2 }}>
                                  {h.fieldAvg !== null ? h.fieldAvg.toFixed(2) : '—'}
                                </td>
                                <td className="pp-sc-hole-cell" style={{ color: vsFieldColor, fontWeight: 700 }}>
                                  {h.advantage !== null
                                    ? `${h.advantage >= 0 ? '+' : ''}${h.advantage.toFixed(2)}`
                                    : '—'}
                                </td>
                                <td className="pp-sc-hole-cell" style={{
                                  fontWeight: 700,
                                  color: h.rank === null ? c.tick
                                    : h.rank === 1 ? '#22c55e'
                                    : h.totalRanked > 1 && h.rank === h.totalRanked ? '#ef4444'
                                    : c.tick,
                                }}>
                                  {h.rank !== null ? `#${h.rank} / ${h.totalRanked}` : '—'}
                                </td>
                                <td className="pp-sc-hole-cell" style={{ color: '#22c55e' }}>
                                  {h.best ?? '—'}
                                </td>
                                <td className="pp-sc-hole-cell" style={{ color: '#ef4444' }}>
                                  {h.worst ?? '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}

              {/* ── Round Scorecards ─────────────────────────────── */}
              <div className="pp-section-title">Round Scorecards</div>
              <div className="pp-scorecard-wrap">
                {roundScorecardGroups.map((group) => (
                  <div key={group.nine} style={{ marginBottom: 16 }}>
                    <p className="pp-chart-label" style={{ marginBottom: 8 }}>{group.label}</p>
                    <table className="pp-scorecard">
                      <thead>
                        <tr>
                          <th className="pp-sc-label">Event</th>
                          <th className="pp-sc-label">Nine</th>
                          {group.holeHeaders.map(h => (
                            <th key={h} className="pp-sc-hole">
                              {onHoleClick ? (
                                <button
                                  className="icon-btn"
                                  style={{ width: 'auto', height: 'auto', padding: 0, color: 'var(--text)', textDecoration: 'underline' }}
                                  onClick={() => onHoleClick(h, group.nine)}
                                  title={`View hole ${h} profile`}
                                >
                                  #{h}
                                </button>
                              ) : `#${h}`}
                            </th>
                          ))}
                          <th className="pp-sc-total">Gross</th>
                          <th className="pp-sc-total">Net</th>
                          <th className="pp-sc-total">Pts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rounds.map(({ ev, data }) => {
                          if (!data) return null;
                          const pars = courseConfig ? getParsForNine(courseConfig, ev.nineHoles ?? 'front') : null;
                          const nineLabel = ev.nineHoles === 'back' ? 'Back 9' : 'Front 9';
                          const startHole = ev.nineHoles === 'back' ? 10 : 1;
                          const isDropped = droppedEventIds.has(ev.id);
                          return (
                            <tr key={ev.id} className="pp-sc-row" style={isDropped ? { background: 'rgba(148,163,184,0.10)' } : undefined}>
                              <td className="pp-sc-label">
                                {getEventDisplayName(ev)}{formatEventDateDisplay(ev.eventDate) ? ` · ${formatEventDateDisplay(ev.eventDate)}` : ''}
                                {isDropped && (
                                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Dropped</span>
                                )}
                              </td>
                              <td className="pp-sc-label">{nineLabel}</td>
                              {data.holes.map((score, i) => {
                                const holeNum = startHole + i;
                                const par = pars ? pars[i] : null;
                                const diff = score !== null && par !== null ? score - par : null;
                                const cls = diff === null ? ''
                                  : diff <= -2 ? 'pp-sc-eagle'
                                  : diff === -1 ? 'pp-sc-birdie'
                                  : diff === 0  ? 'pp-sc-par'
                                  : diff === 1  ? 'pp-sc-bogey'
                                  : diff === 2  ? 'pp-sc-dbl'
                                  : 'pp-sc-trpl';
                                return (
                                  <td
                                    key={i}
                                    className={`pp-sc-hole-cell ${cls}`}
                                    title={`Hole ${holeNum}${par ? ` · Par ${par}` : ''}`}
                                    onClick={onHoleClick ? () => onHoleClick(holeNum, ev.nineHoles ?? 'front') : undefined}
                                    style={onHoleClick ? { cursor: 'pointer' } : undefined}
                                  >
                                    {score ?? '—'}
                                  </td>
                                );
                              })}
                              <td className="pp-sc-total">{data.grossScore ?? '—'}</td>
                              <td className="pp-sc-total">{data.netScore ?? '—'}</td>
                              <td className="pp-sc-total pp-sc-pts">{data.points}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
