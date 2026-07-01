import type { CourseConfig, EventData } from '../types/golf';
import { computeBreakdown, getParsForNine } from './scoring';

export interface DashboardCardData {
  title: string;
  value: string;
  detail: string;
  tone?: 'good' | 'warn' | 'neutral';
}

export interface WeeklyRecapData {
  eventNumber: number;
  eventDate: string;
  winner: { playerNames: string[]; points: number } | null;
  biggestMover: { playerNames: string[]; change: number } | null;
  bestNet: { playerNames: string[]; netScore: number } | null;
  bestGross: { playerNames: string[]; grossScore: number } | null;
  cleanestCard: { playerNames: string[]; bogeysOrWorse: number } | null;
  hardestHole: { holeNum: number; avgVsPar: number } | null;
  easiestHole: { holeNum: number; avgVsPar: number } | null;
  fieldAverageNet: number | null;
  fieldAverageGross: number | null;
}

export function sortEvents(events: EventData[]): EventData[] {
  return [...events].sort((a, b) => a.eventNumber - b.eventNumber);
}

function formatPlayerNames(playerNames: string[]): string {
  const shortNames = playerNames.map(name => name.split(',')[0]);
  if (shortNames.length <= 2) return shortNames.join(' & ');
  return `${shortNames.slice(0, -1).join(', ')} & ${shortNames[shortNames.length - 1]}`;
}

export function buildSeasonDashboard(events: EventData[], courseConfig: CourseConfig | null): DashboardCardData[] {
  const sorted = sortEvents(events);
  if (!sorted.length) return [];

  const latest = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2] ?? null;

  // Biggest mover this week
  let biggestMover: { playerNames: string[]; change: number } | null = null;
  if (prev) {
    let bestChange = 0;
    const movers: string[] = [];
    for (const s of latest.standings) {
      const ps = prev.standings.find(p => p.playerName === s.playerName);
      if (!ps) continue;
      const change = ps.position - s.position;
      if (change > bestChange) {
        bestChange = change;
        movers.length = 0;
        movers.push(s.playerName);
      } else if (change > 0 && change === bestChange) {
        movers.push(s.playerName);
      }
    }
    if (bestChange > 0) biggestMover = { playerNames: movers, change: bestChange };
  }

  // Best recent form over last 3 events by total points
  const last3 = sorted.slice(-3);
  const hotMap: Record<string, number> = {};
  for (const ev of last3) {
    for (const p of ev.players) {
      if (p.didNotPlay) continue;
      hotMap[p.playerName] = (hotMap[p.playerName] ?? 0) + p.points;
    }
  }
  const hottestScore = Math.max(...Object.values(hotMap), Number.NEGATIVE_INFINITY);
  const hottest = Number.isFinite(hottestScore)
    ? Object.entries(hotMap)
        .filter(([, points]) => points === hottestScore)
        .map(([playerName]) => playerName)
    : [];

  // Hardest hole this season by avg vs par
  let hardest: { holeNum: number; avgVsPar: number } | null = null;
  if (courseConfig) {
    for (const nine of ['front', 'back'] as const) {
      const pars = getParsForNine(courseConfig, nine);
      const startHole = nine === 'back' ? 10 : 1;
      const relevant = sorted.filter(e => e.nineHoles === nine);
      for (let i = 0; i < 9; i++) {
        const scores: number[] = [];
        for (const ev of relevant) {
          for (const p of ev.players) {
            if (p.didNotPlay) continue;
            const s = p.holes[i];
            if (s !== null && s !== undefined) scores.push(s);
          }
        }
        if (!scores.length) continue;
        const avg = scores.reduce((sum, n) => sum + n, 0) / scores.length;
        const avgVsPar = avg - pars[i];
        if (!hardest || avgVsPar > hardest.avgVsPar) {
          hardest = { holeNum: startHole + i, avgVsPar: Math.round(avgVsPar * 100) / 100 };
        }
      }
    }
  }

  // Most birdies
  const birdieMap: Record<string, number> = {};
  for (const ev of sorted) {
    for (const p of ev.players) {
      if (p.didNotPlay) continue;
      if (courseConfig) {
        const pars = getParsForNine(courseConfig, ev.nineHoles);
        const bd = computeBreakdown(p.holes, pars);
        birdieMap[p.playerName] = (birdieMap[p.playerName] ?? 0) + bd.birdies;
      } else {
        birdieMap[p.playerName] = (birdieMap[p.playerName] ?? 0) + p.birdies;
      }
    }
  }
  const mostBirdiesCount = Math.max(...Object.values(birdieMap), Number.NEGATIVE_INFINITY);
  const mostBirdies = Number.isFinite(mostBirdiesCount)
    ? Object.entries(birdieMap)
        .filter(([, birdies]) => birdies === mostBirdiesCount)
        .map(([playerName]) => playerName)
    : [];

  // Best net round
  let bestNet: { playerNames: string[]; netScore: number; eventNumbers: number[] } | null = null;
  for (const ev of sorted) {
    for (const p of ev.players) {
      if (p.didNotPlay || p.netScore === null) continue;
      if (!bestNet || p.netScore < bestNet.netScore) {
        bestNet = { playerNames: [p.playerName], netScore: p.netScore, eventNumbers: [ev.eventNumber] };
      } else if (bestNet && p.netScore === bestNet.netScore) {
        bestNet.playerNames.push(p.playerName);
        bestNet.eventNumbers.push(ev.eventNumber);
      }
    }
  }

  return [
    biggestMover
      ? {
          title: 'Biggest Mover',
          value: `${formatPlayerNames(biggestMover.playerNames)} ▲${biggestMover.change}`,
          detail: `Moved up the most in Event ${latest.eventNumber}`,
          tone: 'good',
        }
      : { title: 'Biggest Mover', value: 'No change', detail: `No one moved up in Event ${latest.eventNumber}`, tone: 'neutral' },
    hottest.length
      ? { title: 'Most Momentum', value: formatPlayerNames(hottest), detail: `${hottestScore} pts over last 3 events`, tone: 'good' }
      : { title: 'Most Momentum', value: '—', detail: 'Need at least one event', tone: 'neutral' },
    hardest
      ? { title: 'Hardest Hole', value: `Hole ${hardest.holeNum}`, detail: `${hardest.avgVsPar >= 0 ? '+' : ''}${hardest.avgVsPar.toFixed(2)} vs par`, tone: 'warn' }
      : { title: 'Hardest Hole', value: '—', detail: 'Set course scorecard to compute', tone: 'neutral' },
    mostBirdies.length
      ? { title: 'Most Birdies', value: formatPlayerNames(mostBirdies), detail: `${mostBirdiesCount} birdies`, tone: 'good' }
      : { title: 'Most Birdies', value: '—', detail: 'No scoring data', tone: 'neutral' },
    bestNet
      ? { title: 'Best Net Round', value: `${bestNet.netScore}`, detail: `${formatPlayerNames(bestNet.playerNames)} in Event${bestNet.eventNumbers.length > 1 ? 's' : ''} ${bestNet.eventNumbers.join(', ')}`, tone: 'good' }
      : { title: 'Best Net Round', value: '—', detail: 'No net rounds yet', tone: 'neutral' },
  ];
}

export function buildWeeklyRecaps(events: EventData[], courseConfig: CourseConfig | null): WeeklyRecapData[] {
  const sorted = sortEvents(events);

  return sorted.map((ev, idx) => {
    const prev = idx > 0 ? sorted[idx - 1] : null;
    const activePlayers = ev.players.filter(p => !p.didNotPlay);
    const winnerPoints = Math.max(...activePlayers.map(p => p.points), Number.NEGATIVE_INFINITY);
    const winner = Number.isFinite(winnerPoints)
      ? {
          playerNames: activePlayers.filter(p => p.points === winnerPoints).map(p => p.playerName),
          points: winnerPoints,
        }
      : null;

    let biggestMover: { playerNames: string[]; change: number } | null = null;
    if (prev) {
      let bestChange = 0;
      const movers: string[] = [];
      for (const s of ev.standings) {
        const ps = prev.standings.find(p => p.playerName === s.playerName);
        if (!ps) continue;
        const change = ps.position - s.position;
        if (change > bestChange) {
          bestChange = change;
          movers.length = 0;
          movers.push(s.playerName);
        } else if (change > 0 && change === bestChange) {
          movers.push(s.playerName);
        }
      }
      if (bestChange > 0) biggestMover = { playerNames: movers, change: bestChange };
    }

    let bestNet: { playerNames: string[]; netScore: number } | null = null;
    let bestGross: { playerNames: string[]; grossScore: number } | null = null;
    let cleanestCard: { playerNames: string[]; bogeysOrWorse: number } | null = null;
    let hardestHole: { holeNum: number; avgVsPar: number } | null = null;
    let easiestHole: { holeNum: number; avgVsPar: number } | null = null;
    const grosses: number[] = [];
    const nets: number[] = [];

    for (const p of ev.players) {
      if (p.didNotPlay) continue;
      if (p.grossScore !== null) grosses.push(p.grossScore);
      if (p.netScore !== null) nets.push(p.netScore);
      if (p.netScore !== null) {
        if (!bestNet || p.netScore < bestNet.netScore) {
          bestNet = { playerNames: [p.playerName], netScore: p.netScore };
        } else if (p.netScore === bestNet.netScore) {
          bestNet.playerNames.push(p.playerName);
        }
      }
      if (p.grossScore !== null) {
        if (!bestGross || p.grossScore < bestGross.grossScore) {
          bestGross = { playerNames: [p.playerName], grossScore: p.grossScore };
        } else if (p.grossScore === bestGross.grossScore) {
          bestGross.playerNames.push(p.playerName);
        }
      }

      const bogeysOrWorse = courseConfig
        ? (() => {
          const pars = getParsForNine(courseConfig, ev.nineHoles);
          const bd = computeBreakdown(p.holes, pars);
          return bd.bogeys + bd.doubleBogeys + bd.tripleBogeys + bd.other;
        })()
        : p.bogeys + p.doubleBogeys + p.tripleBogeys + p.other;
      if (!cleanestCard || bogeysOrWorse < cleanestCard.bogeysOrWorse) {
        cleanestCard = { playerNames: [p.playerName], bogeysOrWorse };
      } else if (bogeysOrWorse === cleanestCard.bogeysOrWorse) {
        cleanestCard.playerNames.push(p.playerName);
      }
    }

    if (courseConfig) {
      const pars = getParsForNine(courseConfig, ev.nineHoles);
      const holeOffset = ev.nineHoles === 'back' ? 10 : 1;
      for (let holeIndex = 0; holeIndex < 9; holeIndex++) {
        const scores = activePlayers
          .map(player => player.holes[holeIndex])
          .filter((score): score is number => score !== null && score !== undefined);

        if (!scores.length) continue;

        const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        const avgVsPar = Math.round((avgScore - pars[holeIndex]) * 100) / 100;
        const holeNum = holeOffset + holeIndex;

        if (!hardestHole || avgVsPar > hardestHole.avgVsPar) {
          hardestHole = { holeNum, avgVsPar };
        }
        if (!easiestHole || avgVsPar < easiestHole.avgVsPar) {
          easiestHole = { holeNum, avgVsPar };
        }
      }
    }

    const fieldAverageGross = grosses.length ? Math.round((grosses.reduce((a, b) => a + b, 0) / grosses.length) * 100) / 100 : null;
    const fieldAverageNet = nets.length ? Math.round((nets.reduce((a, b) => a + b, 0) / nets.length) * 100) / 100 : null;

    return {
      eventNumber: ev.eventNumber,
      eventDate: ev.eventDate,
      winner,
      biggestMover,
      bestNet,
      bestGross,
      cleanestCard,
      hardestHole,
      easiestHole,
      fieldAverageNet,
      fieldAverageGross,
    };
  });
}

export interface ComparePlayerRow {
  playerName: string;
  eventNumber: number;
  eventDate: string;
  points: number | null;
  cumulativePoints: number | null;
  grossScore: number | null;
  netScore: number | null;
  handicap: number | null;
  position: number | null;
}

export function buildComparePlayerRows(events: EventData[], selectedPlayers: string[]): ComparePlayerRow[] {
  const sorted = sortEvents(events);
  const rows: ComparePlayerRow[] = [];
  for (const ev of sorted) {
    for (const playerName of selectedPlayers) {
      const p = ev.players.find(x => x.playerName === playerName) ?? null;
      const s = ev.standings.find(x => x.playerName === playerName) ?? null;
      rows.push({
        playerName,
        eventNumber: ev.eventNumber,
        eventDate: ev.eventDate,
        points: p && !p.didNotPlay ? p.points : null,
        cumulativePoints: s?.cumulativePoints ?? null,
        grossScore: p?.grossScore ?? null,
        netScore: p?.netScore ?? null,
        handicap: p?.handicap ?? null,
        position: s?.position ?? null,
      });
    }
  }
  return rows;
}
