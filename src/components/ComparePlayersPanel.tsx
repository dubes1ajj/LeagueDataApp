import { memo, useCallback, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import type { AnalysisMetricKey, CourseConfig, EventData, HandicapMode, LeagueAnalysisSettings } from '../types/golf';
import { buildComparePlayerRows } from '../lib/analytics';
import { buildLeagueAnalysisRanking } from '../lib/analysisRanking';
import { getPlayerColor } from '../lib/colors';
import { useChartColors } from '../lib/useChartColors';
import { buildDisplayNames } from '../lib/displayNames';
import { computeBreakdown, getParsForNine } from '../lib/scoring';
import { getTooltipTrigger } from '../lib/tooltip';
import { useIsMobile } from '../lib/useIsMobile';

interface ComparePlayersPanelProps {
  events: EventData[];
  courseConfig: CourseConfig | null;
  handicapMode: HandicapMode;
  analysisSettings: LeagueAnalysisSettings;
  onPlayerClick?: (playerName: string) => void;
}

function renderStarRating(stars: number) {
  const clamped = Math.max(0, Math.min(5, stars));
  const fillPercent = `${(clamped / 5) * 100}%`;
  return (
    <span style={{ position: 'relative', display: 'inline-block', letterSpacing: 1, fontSize: 13, lineHeight: 1 }} aria-label={`${clamped.toFixed(1)} stars`}>
      <span style={{ color: 'var(--text2)' }}>☆☆☆☆☆</span>
      <span style={{ position: 'absolute', left: 0, top: 0, overflow: 'hidden', width: fillPercent, color: '#fbbf24', whiteSpace: 'nowrap' }}>★★★★★</span>
    </span>
  );
}

export default memo(function ComparePlayersPanel({ events, courseConfig, handicapMode, analysisSettings, onPlayerClick }: ComparePlayersPanelProps) {
  const c = useChartColors();
  const isMobile = useIsMobile();
  const tooltipTrigger = getTooltipTrigger(isMobile);
  const hcpLabel = handicapMode === 'front-back' ? 'side hcp' : 'hcp';
  const currentHcpLabel = handicapMode === 'front-back' ? 'current side hcp' : 'current hcp';
  const trendLabel = handicapMode === 'front-back' ? 'Side handicap trend' : 'Handicap trend';
  const headerHcpLabel = handicapMode === 'front-back' ? 'Current Side Hcp' : 'Current Hcp';

  const players = useMemo(() => {
    const set = new Set<string>();
    for (const ev of events) {
      for (const p of ev.players) if (!p.didNotPlay) set.add(p.playerName);
    }
    return Array.from(set).sort();
  }, [events]);

  const displayNames = useMemo(() => buildDisplayNames(players), [players]);
  const [selected, setSelected] = useState<string[]>([]);
  const [showMetricDefinitions, setShowMetricDefinitions] = useState(false);
  const [historyMetricId, setHistoryMetricId] = useState<AnalysisMetricKey>('eventWins');
  const [metricContextTarget, setMetricContextTarget] = useState<{ metricId: AnalysisMetricKey; mode: 'player' | 'leaderTimeline'; playerName?: string } | null>(null);
  const [metricContextView, setMetricContextView] = useState<'table' | 'graph'>('table');
  const sortedEvents = useMemo(() => [...events].sort((a, b) => a.eventNumber - b.eventNumber), [events]);

  const metricDefinitionsContent = useMemo(() => ([
    {
      id: 'pointsForm',
      title: 'Points Form',
      definition: 'How many points a player earns per round on average. Higher means they consistently collect points in your scoring format.',
      formula: 'avgPoints = totalPoints / roundsPlayed',
    },
    {
      id: 'netScoring',
      title: 'Net Scoring',
      definition: 'Average net score after handicap adjustments. Lower net scores indicate stronger adjusted performance.',
      formula: 'avgNet = sum(net scores) / roundsWithNet',
    },
    {
      id: 'grossScoring',
      title: 'Gross Scoring',
      definition: 'Average raw strokes before handicap. Lower gross scores indicate better pure shot-making performance.',
      formula: 'avgGross = sum(gross scores) / roundsWithGross',
    },
    {
      id: 'consistency',
      title: 'Consistency',
      definition: 'How stable a player is week to week in scoring. Uses score variability (net when available, otherwise gross); lower spread means steadier golf.',
      formula: 'scoreStdDev = sqrt(sum((score - avgScore)^2) / roundsWithScore)',
    },
    {
      id: 'birdieRate',
      title: 'Birdie Rate',
      definition: 'Share of tracked holes finished as birdie or better. Higher values indicate stronger scoring upside.',
      formula: 'birdieRate = birdies / trackedHoles',
    },
    {
      id: 'damageControl',
      title: 'Damage Control',
      definition: 'How severe a player\'s mistake holes are when they happen, with heavier penalties for doubles, triples, and worse outcomes.',
      formula: 'weightedPenalty = (1*bogeys + 2*doubleBogeys + 3*tripleBogeys + 4*other) / (4*trackedHoles)',
    },
    {
      id: 'blowupAvoidance',
      title: 'Blow-Up Avoidance',
      definition: 'How often a player avoids blow-up holes (double bogey or worse). Higher values mean fewer major mistakes per hole played.',
      formula: 'blowupRate = (doubleBogeys + tripleBogeys + other) / trackedHoles',
    },
    {
      id: 'participation',
      title: 'Participation',
      definition: 'How often a player shows up relative to total season rounds. Higher participation rewards availability and reliability.',
      formula: 'participation = roundsPlayed / totalRoundsInSeason',
    },
    {
      id: 'parEfficiency',
      title: 'Par Efficiency',
      definition: 'Percentage of tracked holes finished at par. Higher values indicate steady, low-variance golf.',
      formula: 'parEfficiency = pars / trackedHoles',
    },
    {
      id: 'eventWins',
      title: 'Event Wins',
      definition: 'How many events a player wins by points, including tied wins when multiple players share the highest points total.',
      formula: 'count events where player points = event max points',
    },
    {
      id: 'topThreeRate',
      title: 'Top-3 Finishes',
      definition: 'How many events a player finishes in the top three by points, including ties based on points rank.',
      formula: 'count events where pointsRank <= 3',
    },
    {
      id: 'topFiveRate',
      title: 'Top-5 Finishes',
      definition: 'How many events a player finishes in the top five by points, including ties based on points rank.',
      formula: 'count events where pointsRank <= 5',
    },
    {
      id: 'clutchPerformance',
      title: 'Clutch Holes',
      definition: 'Performance on the final three holes of each round. Lower average score versus par means a player closes rounds better under pressure.',
      formula: 'average score versus par across final 3 holes of each round',
    },
    {
      id: 'bounceBack',
      title: 'Bounce-Back',
      definition: 'How often a player follows a bogey-or-worse hole with par or better on the next hole. Higher values indicate resilience after mistakes.',
      formula: 'bounceBackRate = par-or-better next hole / bounce-back chances',
    },
    {
      id: 'cleanCard',
      title: 'Clean Cards',
      definition: 'How many rounds a player completes without any double bogey or worse. Higher values reward mistake-free cards.',
      formula: 'count rounds with no double bogey or worse',
    },
    {
      id: 'ceilingFloor',
      title: 'Ceiling vs Floor',
      definition: 'The spread between a player\'s best and worst scoring rounds. Lower spread means a tighter performance range from ceiling to floor.',
      formula: 'ceilingFloorSpread = worst scoring round - best scoring round',
    },
    {
      id: 'handicapOutperformance',
      title: 'Handicap Outperformance',
      definition: 'Average strokes a player finishes under or over net par. Higher values mean they beat their handicap-adjusted expectation more often.',
      formula: 'average(net par - net score)',
    },
    {
      id: 'momentum',
      title: 'Momentum',
      definition: 'Whether a player improves as the season progresses. Positive momentum means stronger second-half performance than first-half.',
      formula: 'momentum = secondHalfAvgPoints - firstHalfAvgPoints',
    },
    {
      id: 'clutchFactor',
      title: 'Clutch Factor',
      definition: 'How recent form compares to season average. Higher clutch factor means the player has been stepping up in the most recent rounds.',
      formula: 'clutchFactor = recentAvgPoints(last 3) - seasonAvgPoints',
    },
  ]), []);

  function toggle(name: string) {
    setSelected(prev => {
      if (prev.includes(name)) return prev.filter(p => p !== name);
      if (prev.length >= 4) return prev;
      return [...prev, name];
    });
  }

  const rows = useMemo(() => buildComparePlayerRows(events, selected), [events, selected]);
  const allRows = useMemo(() => buildComparePlayerRows(events, players), [events, players]);

  const eventData = useMemo(() => {
    const byEvent = new Map<number, Record<string, string | number | null>>();
    for (const row of rows) {
      if (!byEvent.has(row.eventNumber)) {
        byEvent.set(row.eventNumber, { event: `E${row.eventNumber}`, eventNumber: row.eventNumber });
      }
      const target = byEvent.get(row.eventNumber)!;
      target[`${row.playerName}:points`] = row.points;
      target[`${row.playerName}:cum`] = row.cumulativePoints;
      target[`${row.playerName}:net`] = row.netScore;
      target[`${row.playerName}:gross`] = row.grossScore;
      target[`${row.playerName}:hcp`] = row.handicap;
      target[`${row.playerName}:pos`] = row.position;
    }
    return Array.from(byEvent.values()).sort((a, b) => Number(a.eventNumber) - Number(b.eventNumber));
  }, [rows]);

  const summarizePlayers = useCallback((eventSource: EventData[], names: string[], sourceRows: ReturnType<typeof buildComparePlayerRows>) => {
    return names.map((name) => {
      const playerRows = sourceRows
        .filter(r => r.playerName === name && r.points !== null)
        .sort((a, b) => a.eventNumber - b.eventNumber);
      const points = playerRows.map(r => r.points ?? 0);
      const roundScores = playerRows
        .map((r) => (r.netScore !== null ? r.netScore : r.grossScore))
        .filter((v): v is number => v !== null);
      const gross = playerRows.map(r => r.grossScore).filter((v): v is number => v !== null);
      const net = playerRows.map(r => r.netScore).filter((v): v is number => v !== null);
      const positions = playerRows.map(r => r.position).filter((v): v is number => v !== null);
      let eventWinsByPoints = 0;
      let topThreeByPoints = 0;
      let topFiveByPoints = 0;

      let attendedEvents = 0;
      let birdies = 0;
      let pars = 0;
      let bogeys = 0;
      let doubleBogeys = 0;
      let tripleBogeys = 0;
      let others = 0;
      let bogeysOrWorse = 0;
      let currentHcp: number | null = null;
      let bestGross: number | null = null;
      let bestNet: number | null = null;
      let totalTrackedHoles = 0;
      let par3DiffTotal = 0;
      let par3Count = 0;
      let par4DiffTotal = 0;
      let par4Count = 0;
      let par5DiffTotal = 0;
      let par5Count = 0;
      let clutchDiffTotal = 0;
      let clutchHoleCount = 0;
      let bounceBackSuccess = 0;
      let bounceBackOpportunities = 0;
      let cleanCardCount = 0;
      const frontPoints: number[] = [];
      const backPoints: number[] = [];
      const frontNetScores: number[] = [];
      const backNetScores: number[] = [];
      const handicapOutperformanceValues: number[] = [];
      let bestRoundScore: number | null = null;
      let worstRoundScore: number | null = null;

      for (const ev of eventSource) {
        const p = ev.players.find(x => x.playerName === name && !x.didNotPlay);
        if (!p) continue;
        attendedEvents += 1;

        const activeEventPlayers = ev.players.filter((x) => !x.didNotPlay);
        const maxPoints = activeEventPlayers.reduce((max, player) => Math.max(max, player.points), Number.NEGATIVE_INFINITY);
        if (Number.isFinite(maxPoints) && p.points === maxPoints) {
          eventWinsByPoints += 1;
        }
        const pointsRank = activeEventPlayers.filter((player) => player.points > p.points).length + 1;
        if (pointsRank <= 3) {
          topThreeByPoints += 1;
        }
        if (pointsRank <= 5) {
          topFiveByPoints += 1;
        }

        if (ev.nineHoles === 'front') frontPoints.push(p.points);
        else backPoints.push(p.points);
        if (p.netScore !== null) {
          if (ev.nineHoles === 'front') frontNetScores.push(p.netScore);
          else backNetScores.push(p.netScore);
        }

        currentHcp = p.handicap;
        if (p.grossScore !== null) bestGross = bestGross === null ? p.grossScore : Math.min(bestGross, p.grossScore);
        if (p.netScore !== null) bestNet = bestNet === null ? p.netScore : Math.min(bestNet, p.netScore);
        const comparableRoundScore = p.netScore ?? p.grossScore;
        if (comparableRoundScore !== null) {
          bestRoundScore = bestRoundScore === null ? comparableRoundScore : Math.min(bestRoundScore, comparableRoundScore);
          worstRoundScore = worstRoundScore === null ? comparableRoundScore : Math.max(worstRoundScore, comparableRoundScore);
        }
        if (courseConfig) {
          const parsForNine = getParsForNine(courseConfig, ev.nineHoles);
          const bd = computeBreakdown(p.holes, parsForNine);
          birdies += bd.birdies;
          pars += bd.pars;
          bogeys += bd.bogeys;
          doubleBogeys += bd.doubleBogeys;
          tripleBogeys += bd.tripleBogeys;
          others += bd.other;
          bogeysOrWorse += bd.bogeys + bd.doubleBogeys + bd.tripleBogeys + bd.other;

          const totalPar = parsForNine.reduce((sum, par) => sum + par, 0);
          if (p.netScore !== null) {
            handicapOutperformanceValues.push(totalPar - p.netScore);
          }

          const holeDiffs = p.holes.map((score, index) => score === null ? null : score - parsForNine[index]);
          let hasDoublePlus = false;
          holeDiffs.forEach((diff, index) => {
            if (diff === null) return;
            totalTrackedHoles += 1;
            const parValue = parsForNine[index];
            if (parValue === 3) {
              par3DiffTotal += diff;
              par3Count += 1;
            } else if (parValue === 4) {
              par4DiffTotal += diff;
              par4Count += 1;
            } else if (parValue === 5) {
              par5DiffTotal += diff;
              par5Count += 1;
            }
            if (index >= Math.max(0, holeDiffs.length - 3)) {
              clutchDiffTotal += diff;
              clutchHoleCount += 1;
            }
            if (diff >= 2) hasDoublePlus = true;
          });
          for (let index = 0; index < holeDiffs.length - 1; index += 1) {
            const currentDiff = holeDiffs[index];
            const nextDiff = holeDiffs[index + 1];
            if (currentDiff === null || nextDiff === null || currentDiff < 1) continue;
            bounceBackOpportunities += 1;
            if (nextDiff <= 0) bounceBackSuccess += 1;
          }
          if (!hasDoublePlus) cleanCardCount += 1;
        } else {
          birdies += p.birdies;
          pars += p.pars;
          bogeys += p.bogeys;
          doubleBogeys += p.doubleBogeys;
          tripleBogeys += p.tripleBogeys;
          others += p.other;
          bogeysOrWorse += p.bogeys + p.doubleBogeys + p.tripleBogeys + p.other;
          totalTrackedHoles += p.birdies + p.pars + p.bogeys + p.doubleBogeys + p.tripleBogeys + p.other;
          if (p.doubleBogeys + p.tripleBogeys + p.other === 0) cleanCardCount += 1;
        }
      }

      const avg = (vals: number[]) => vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      const splitAverage = (vals: number[], start: number, end: number) => {
        const subset = vals.slice(start, end);
        return subset.length ? subset.reduce((sum, value) => sum + value, 0) / subset.length : null;
      };
      const stdDev = (vals: number[]) => {
        if (vals.length < 2) return null;
        const mean = vals.reduce((sum, value) => sum + value, 0) / vals.length;
        const variance = vals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / vals.length;
        return Math.sqrt(variance);
      };
      const halfSplit = Math.floor(points.length / 2);
      const firstHalfAvg = splitAverage(points, 0, Math.max(1, halfSplit));
      const secondHalfAvg = splitAverage(points, Math.max(halfSplit, 1), points.length);
      const recentWindowSize = Math.min(3, points.length);
      const recentAvg = recentWindowSize > 0 ? splitAverage(points, points.length - recentWindowSize, points.length) : null;
      const totalTracked = birdies + pars + bogeysOrWorse;

      return {
        name,
        display: displayNames[name] ?? name,
        eventsPlayed: attendedEvents,
        totalPoints: points.reduce((a, b) => a + b, 0),
        avgPoints: avg(points),
        avgGross: avg(gross),
        avgNet: avg(net),
        avgPosition: avg(positions),
        scoreStdDev: stdDev(roundScores),
        currentHcp,
        bestGross,
        bestNet,
        birdies,
        pars,
        bogeys,
        doubleBogeys,
        tripleBogeys,
        others,
        bogeysOrWorse,
        totalTrackedHoles,
        parEfficiency: totalTracked > 0 ? pars / totalTracked : Number.NaN,
        eventWinsCount: eventWinsByPoints,
        topThreeCount: topThreeByPoints,
        topFiveCount: topFiveByPoints,
        par3AvgDiff: par3Count > 0 ? par3DiffTotal / par3Count : Number.NaN,
        par4AvgDiff: par4Count > 0 ? par4DiffTotal / par4Count : Number.NaN,
        par5AvgDiff: par5Count > 0 ? par5DiffTotal / par5Count : Number.NaN,
        frontAvgPoints: avg(frontPoints),
        backAvgPoints: avg(backPoints),
        frontAvgNet: avg(frontNetScores),
        backAvgNet: avg(backNetScores),
        clutchPerformance: clutchHoleCount > 0 ? clutchDiffTotal / clutchHoleCount : Number.NaN,
        bounceBackRate: bounceBackOpportunities > 0 ? bounceBackSuccess / bounceBackOpportunities : Number.NaN,
        bounceBackSuccess,
        bounceBackOpportunities,
        cleanCardCount,
        cleanCardRate: attendedEvents > 0 ? cleanCardCount / attendedEvents : Number.NaN,
        ceilingFloorSpread: bestRoundScore !== null && worstRoundScore !== null ? worstRoundScore - bestRoundScore : Number.NaN,
        bestRoundScore,
        worstRoundScore,
        handicapOutperformance: handicapOutperformanceValues.length ? handicapOutperformanceValues.reduce((sum, value) => sum + value, 0) / handicapOutperformanceValues.length : Number.NaN,
        momentum: firstHalfAvg !== null && secondHalfAvg !== null ? secondHalfAvg - firstHalfAvg : Number.NaN,
        clutchFactor: recentAvg !== null && avg(points) !== null ? recentAvg - (avg(points) ?? 0) : Number.NaN,
      };
    });
  }, [courseConfig, displayNames]);

  const summaryRows = useMemo(() => summarizePlayers(sortedEvents, selected, rows), [selected, rows, sortedEvents, summarizePlayers]);
  const fieldSummaryRows = useMemo(() => summarizePlayers(sortedEvents, players, allRows), [allRows, players, sortedEvents, summarizePlayers]);

  const scoringProfileData = useMemo(() => {
    return summaryRows.map((row) => {
      const totalTracked = row.birdies + row.pars + row.bogeysOrWorse;
      return {
        player: row.display,
        playerName: row.name,
        birdies: totalTracked ? Math.round((row.birdies / totalTracked) * 100) : 0,
        pars: totalTracked ? Math.round((row.pars / totalTracked) * 100) : 0,
        bogeys: totalTracked ? Math.round((row.bogeys / totalTracked) * 100) : 0,
        doubleBogeys: totalTracked ? Math.round((row.doubleBogeys / totalTracked) * 100) : 0,
        tripleBogeys: totalTracked ? Math.round((row.tripleBogeys / totalTracked) * 100) : 0,
        other: totalTracked ? Math.round((row.others / totalTracked) * 100) : 0,
      };
    });
  }, [summaryRows]);
  const buildMetricModel = useCallback((
    rankingResult: ReturnType<typeof buildLeagueAnalysisRanking>,
    selectedNames: string[],
    fieldSummaryInput: typeof fieldSummaryRows,
    seasonEventCount: number,
  ) => {
    const fieldByName = Object.fromEntries(fieldSummaryInput.map((row) => [row.name, row]));
    const seasonRoundsTotal = Math.max(seasonEventCount, 1);

    const metricDefinitions = [
      {
        id: 'pointsForm' as const,
        label: 'Points Form',
        weight: analysisSettings.weights.pointsForm ?? 0.18,
        detail: (name: string) => `${(fieldByName[name]?.avgPoints ?? 0).toFixed(1)} avg pts/round`,
      },
      {
        id: 'netScoring' as const,
        label: 'Net Scoring',
        weight: analysisSettings.weights.netScoring ?? 0.14,
        detail: (name: string) => Number.isFinite(fieldByName[name]?.avgNet ?? Number.NaN) ? `${(fieldByName[name]?.avgNet ?? 0).toFixed(1)} avg net` : 'No net data',
      },
      {
        id: 'grossScoring' as const,
        label: 'Gross Scoring',
        weight: analysisSettings.weights.grossScoring ?? 0.1,
        detail: (name: string) => Number.isFinite(fieldByName[name]?.avgGross ?? Number.NaN) ? `${(fieldByName[name]?.avgGross ?? 0).toFixed(1)} avg gross` : 'No gross data',
      },
      {
        id: 'consistency' as const,
        label: 'Consistency',
        weight: analysisSettings.weights.consistency ?? 0.1,
        detail: (name: string) => Number.isFinite(fieldByName[name]?.scoreStdDev ?? Number.NaN) ? `${(fieldByName[name]?.scoreStdDev ?? 0).toFixed(2)} score stdev` : 'Not enough rounds',
      },
      {
        id: 'birdieRate' as const,
        label: 'Birdie Rate',
        weight: analysisSettings.weights.birdieRate ?? 0.07,
        detail: (name: string) => {
          const row = fieldByName[name];
          if (!row || !row.totalTrackedHoles) return 'No hole data';
          return `${((row.birdies / row.totalTrackedHoles) * 100).toFixed(1)}% birdie rate`;
        },
      },
      {
        id: 'damageControl' as const,
        label: 'Damage Control',
        weight: analysisSettings.weights.damageControl ?? 0.07,
        detail: (name: string) => {
          const row = fieldByName[name];
          if (!row || !row.totalTrackedHoles) return 'No hole data';
          const weightedPenalty = (row.bogeys * 1) + (row.doubleBogeys * 2) + (row.tripleBogeys * 3) + (row.others * 4);
          const score = (1 - (weightedPenalty / (row.totalTrackedHoles * 4))) * 100;
          return `${score.toFixed(1)} weighted damage control`;
        },
      },
      {
        id: 'blowupAvoidance' as const,
        label: 'Blow-Up Avoidance',
        weight: analysisSettings.weights.blowupAvoidance ?? 0.06,
        detail: (name: string) => {
          const row = fieldByName[name];
          if (!row) return 'No hole data';
          const blowupHoles = row.doubleBogeys + row.tripleBogeys + row.others;
          return `${blowupHoles} blow-up hole${blowupHoles === 1 ? '' : 's'}`;
        },
      },
      {
        id: 'participation' as const,
        label: 'Participation',
        weight: analysisSettings.weights.participation ?? 0.04,
        detail: (name: string) => `${(((fieldByName[name]?.eventsPlayed ?? 0) / seasonRoundsTotal) * 100).toFixed(1)}% participation`,
      },
      {
        id: 'parEfficiency' as const,
        label: 'Par Efficiency',
        weight: analysisSettings.weights.parEfficiency ?? 0.06,
        detail: (name: string) => Number.isFinite(fieldByName[name]?.parEfficiency ?? Number.NaN) ? `${(((fieldByName[name]?.parEfficiency ?? 0)) * 100).toFixed(1)}% pars` : 'No hole data',
      },
      {
        id: 'eventWins' as const,
        label: 'Event Wins',
        weight: analysisSettings.weights.eventWins ?? 0.05,
        detail: (name: string) => {
          const wins = fieldByName[name]?.eventWinsCount ?? 0;
          return `${wins} win${wins === 1 ? '' : 's'}`;
        },
      },
      {
        id: 'topThreeRate' as const,
        label: 'Top-3 Finishes',
        weight: analysisSettings.weights.topThreeRate ?? 0.05,
        detail: (name: string) => {
          const topThree = fieldByName[name]?.topThreeCount ?? 0;
          return `${topThree} top-3 finish${topThree === 1 ? '' : 'es'}`;
        },
      },
      {
        id: 'topFiveRate' as const,
        label: 'Top-5 Finishes',
        weight: analysisSettings.weights.topFiveRate ?? 0.04,
        detail: (name: string) => {
          const topFive = fieldByName[name]?.topFiveCount ?? 0;
          return `${topFive} top-5 finish${topFive === 1 ? '' : 'es'}`;
        },
      },
      {
        id: 'clutchPerformance' as const,
        label: 'Clutch Holes',
        weight: analysisSettings.weights.clutchPerformance ?? 0.05,
        detail: (name: string) => Number.isFinite(fieldByName[name]?.clutchPerformance ?? Number.NaN) ? `${(fieldByName[name]?.clutchPerformance ?? 0).toFixed(2)} avg vs par on final 3` : 'No hole data',
      },
      {
        id: 'bounceBack' as const,
        label: 'Bounce-Back',
        weight: analysisSettings.weights.bounceBack ?? 0.04,
        detail: (name: string) => {
          const row = fieldByName[name];
          if (!row || row.bounceBackOpportunities === 0) return 'No bounce-back chances';
          return `${row.bounceBackSuccess}/${row.bounceBackOpportunities} bounce-backs`;
        },
      },
      {
        id: 'cleanCard' as const,
        label: 'Clean Cards',
        weight: analysisSettings.weights.cleanCard ?? 0.04,
        detail: (name: string) => {
          const cleanCards = fieldByName[name]?.cleanCardCount ?? 0;
          return `${cleanCards} clean card${cleanCards === 1 ? '' : 's'}`;
        },
      },
      {
        id: 'ceilingFloor' as const,
        label: 'Ceiling vs Floor',
        weight: analysisSettings.weights.ceilingFloor ?? 0.04,
        detail: (name: string) => {
          const row = fieldByName[name];
          if (!row || !Number.isFinite(row.ceilingFloorSpread)) return 'Not enough rounds';
          return `best ${row.bestRoundScore?.toFixed(1) ?? '—'} / floor ${row.worstRoundScore?.toFixed(1) ?? '—'} / spread ${row.ceilingFloorSpread.toFixed(1)}`;
        },
      },
      {
        id: 'handicapOutperformance' as const,
        label: 'Handicap Outperformance',
        weight: analysisSettings.weights.handicapOutperformance ?? 0.06,
        detail: (name: string) => Number.isFinite(fieldByName[name]?.handicapOutperformance ?? Number.NaN) ? `${(fieldByName[name]?.handicapOutperformance ?? 0).toFixed(2)} strokes vs net par` : 'No par data',
      },
      {
        id: 'momentum' as const,
        label: 'Momentum',
        weight: analysisSettings.weights.momentum ?? 0.04,
        detail: (name: string) => Number.isFinite(fieldByName[name]?.momentum ?? Number.NaN) ? `${(fieldByName[name]?.momentum ?? 0).toFixed(2)} pts second-half lift` : 'Not enough rounds',
      },
      {
        id: 'clutchFactor' as const,
        label: 'Clutch Factor',
        weight: analysisSettings.weights.clutchFactor ?? 0.03,
        detail: (name: string) => Number.isFinite(fieldByName[name]?.clutchFactor ?? Number.NaN) ? `${(fieldByName[name]?.clutchFactor ?? 0).toFixed(2)} pts recent-vs-season` : 'Not enough rounds',
      },
    ] as const;

    const scoresByMetricId = Object.fromEntries(
      metricDefinitions.map((metric) => [
        metric.id,
        Object.fromEntries(rankingResult.ranking.map((entry) => [entry.name, Number(entry.metricScores[metric.id] ?? 0)])),
      ]),
    ) as Record<AnalysisMetricKey, Record<string, number>>;

    const data = metricDefinitions.map((metric) => ({
      metric: metric.label,
      ...Object.fromEntries(selectedNames.map((name) => [name, scoresByMetricId[metric.id]?.[name] ?? 0])),
    }));

    const details: Record<string, Record<string, string>> = Object.fromEntries(
      metricDefinitions.map((metric) => [
        metric.label,
        Object.fromEntries(selectedNames.map((name) => [name, metric.detail(name)])),
      ]),
    );

    const weights: Record<string, number> = Object.fromEntries(metricDefinitions.map((metric) => [metric.label, metric.weight]));

    return {
      data,
      details,
      weights,
      metricDefinitions,
      scoresByMetricId,
    };
  }, [analysisSettings.weights]);

  const previousFieldSummaryRows = useMemo(() => {
    if (sortedEvents.length < 2) return [] as typeof fieldSummaryRows;
    const previousEvents = sortedEvents.slice(0, -1);
    const previousRows = buildComparePlayerRows(previousEvents, players);
    return summarizePlayers(previousEvents, players, previousRows);
  }, [sortedEvents, players, summarizePlayers]);

  const previousFieldSummaryByName = useMemo(
    () => Object.fromEntries(previousFieldSummaryRows.map((row) => [row.name, row])),
    [previousFieldSummaryRows]
  );

  const sharedAnalysis = useMemo(
    () => buildLeagueAnalysisRanking(sortedEvents, courseConfig, analysisSettings),
    [analysisSettings, courseConfig, sortedEvents],
  );

  const previousSharedAnalysis = useMemo(
    () => (sortedEvents.length > 1 ? buildLeagueAnalysisRanking(sortedEvents.slice(0, -1), courseConfig, analysisSettings) : null),
    [analysisSettings, courseConfig, sortedEvents],
  );

  const radarModel = useMemo(
    () => buildMetricModel(sharedAnalysis, selected, fieldSummaryRows, events.length),
    [buildMetricModel, events.length, fieldSummaryRows, selected, sharedAnalysis],
  );

  const previousRadarModel = useMemo(
    () => previousSharedAnalysis && previousFieldSummaryRows.length
      ? buildMetricModel(previousSharedAnalysis, players, previousFieldSummaryRows, sortedEvents.length - 1)
      : null,
    [buildMetricModel, players, previousFieldSummaryRows, previousSharedAnalysis, sortedEvents.length]
  );

  function formatChipDelta(value: number | null) {
    if (value === null || !Number.isFinite(value) || Math.abs(value) < 1e-9) {
      return { label: '', className: 'compare-metric-delta compare-metric-delta-neutral' };
    }
    return {
      label: ` (${value > 0 ? '+' : ''}${Math.round(value)})`,
      className: `compare-metric-delta ${value > 0 ? 'compare-metric-delta-positive' : 'compare-metric-delta-negative'}`,
    };
  }

  const analysisRanking = useMemo(() => {
    return sharedAnalysis.ranking.map((entry) => ({
      ...entry,
      display: displayNames[entry.name] ?? entry.name,
    }));
  }, [displayNames, sharedAnalysis.ranking]);

  const fieldSummaryByName = useMemo(
    () => Object.fromEntries(fieldSummaryRows.map((row) => [row.name, row])),
    [fieldSummaryRows]
  );

  const getMetricHistoryValue = useCallback((row: (typeof fieldSummaryRows)[number] | undefined, metricId: AnalysisMetricKey, seasonRounds: number): number | null => {
    if (!row) return null;
    const totalTracked = row.totalTrackedHoles || 0;
    switch (metricId) {
      case 'pointsForm': return row.avgPoints;
      case 'netScoring': return row.avgNet;
      case 'grossScoring': return row.avgGross;
      case 'consistency': return row.scoreStdDev;
      case 'birdieRate': return totalTracked ? (row.birdies / totalTracked) * 100 : null;
      case 'damageControl': {
        if (!totalTracked) return null;
        const weightedMistakePenalty = (row.bogeys * 1) + (row.doubleBogeys * 2) + (row.tripleBogeys * 3) + (row.others * 4);
        return (1 - (weightedMistakePenalty / (totalTracked * 4))) * 100;
      }
      case 'blowupAvoidance': {
        if (!totalTracked) return null;
        return (1 - ((row.doubleBogeys + row.tripleBogeys + row.others) / totalTracked)) * 100;
      }
      case 'participation': return seasonRounds > 0 ? (row.eventsPlayed / seasonRounds) * 100 : null;
      case 'parEfficiency': return Number.isFinite(row.parEfficiency) ? row.parEfficiency * 100 : null;
      case 'eventWins': return row.eventWinsCount;
      case 'topThreeRate': return row.topThreeCount;
      case 'topFiveRate': return row.topFiveCount;
      case 'clutchPerformance': return row.clutchPerformance;
      case 'bounceBack': return Number.isFinite(row.bounceBackRate) ? row.bounceBackRate * 100 : null;
      case 'cleanCard': return row.cleanCardCount;
      case 'ceilingFloor': return row.ceilingFloorSpread;
      case 'handicapOutperformance': return row.handicapOutperformance;
      case 'momentum': return row.momentum;
      case 'clutchFactor': return row.clutchFactor;
      default: return null;
    }
  }, []);

  const formatMetricHistoryValue = useCallback((metricId: AnalysisMetricKey, value: number | null): string => {
    if (value === null || !Number.isFinite(value)) return '—';
    if (['eventWins', 'topThreeRate', 'topFiveRate', 'cleanCard'].includes(metricId)) return `${Math.round(value)}`;
    if (['birdieRate', 'damageControl', 'blowupAvoidance', 'participation', 'parEfficiency', 'bounceBack'].includes(metricId)) return `${value.toFixed(1)}%`;
    return value.toFixed(2);
  }, []);

  const shouldCarryForwardOnDnp = useCallback((metricId: AnalysisMetricKey) => metricId !== 'participation', []);

  const prefixSnapshots = useMemo(() => {
    return sortedEvents.map((event, index) => {
      const prefixEvents = sortedEvents.slice(0, index + 1);
      const prefixRows = buildComparePlayerRows(prefixEvents, players);
      const prefixSummaries = summarizePlayers(prefixEvents, players, prefixRows);
      const prefixByName = Object.fromEntries(prefixSummaries.map((row) => [row.name, row]));
      const prefixAnalysis = buildLeagueAnalysisRanking(prefixEvents, courseConfig, analysisSettings);
      const prefixModel = buildMetricModel(prefixAnalysis, players, prefixSummaries, prefixEvents.length);

      return {
        event,
        seasonRounds: prefixEvents.length,
        prefixByName,
        prefixSummaries,
        prefixModel,
      };
    });
  }, [sortedEvents, players, summarizePlayers, courseConfig, analysisSettings, buildMetricModel]);

  const metricHistoryData = useMemo(() => {
    if (!selected.length) return [] as Array<Record<string, string | number | null>>;

    const previousRawByPlayer: Record<string, number | null> = Object.fromEntries(selected.map((name) => [name, null]));

    return prefixSnapshots.map((snapshot) => {
      const { event, prefixByName, seasonRounds } = snapshot;
      const point: Record<string, string | number | null> = {
        event: `E${event.eventNumber}`,
        eventNumber: event.eventNumber,
      };
      selected.forEach((name) => {
        const playerInEvent = event.players.find((entry) => entry.playerName === name);
        const playedThisEvent = Boolean(playerInEvent && !playerInEvent.didNotPlay);
        const computedRawValue = getMetricHistoryValue(prefixByName[name], historyMetricId, seasonRounds);
        const rawValue = !playedThisEvent && shouldCarryForwardOnDnp(historyMetricId)
          ? previousRawByPlayer[name]
          : computedRawValue;

        point[name] = rawValue;

        if (rawValue !== null && Number.isFinite(rawValue)) {
          previousRawByPlayer[name] = rawValue;
        }
      });
      return point;
    });
  }, [selected, prefixSnapshots, historyMetricId, getMetricHistoryValue, shouldCarryForwardOnDnp]);

  const metricLeaders = useMemo(() => {
    return radarModel.metricDefinitions.map((metric) => {
      const values = fieldSummaryRows.map((row) => ({
        name: row.name,
        display: row.display,
        score: radarModel.scoresByMetricId[metric.id]?.[row.name] ?? 0,
        detail: metric.detail(row.name),
      }));
      const maxScore = Math.max(...values.map((entry) => entry.score));
      const leaders = values.filter((entry) => entry.score === maxScore);
      return {
        id: metric.id,
        label: metric.label,
        leaders,
      };
    });
  }, [fieldSummaryRows, radarModel.metricDefinitions, radarModel.scoresByMetricId]);

  const rankExplanations = useMemo(() => {
    return Object.fromEntries(analysisRanking.map((entry) => {
      const contributions = radarModel.metricDefinitions.map((metric) => ({
        id: metric.id,
        label: metric.label,
        contribution: (entry.metricScores[metric.id] as number) * metric.weight,
      }));
      const strengths = [...contributions].sort((a, b) => b.contribution - a.contribution).slice(0, 3);
      const weaknesses = [...contributions].sort((a, b) => a.contribution - b.contribution).slice(0, 2);
      return [entry.name, { strengths, weaknesses }];
    }));
  }, [analysisRanking, radarModel.metricDefinitions]);

  const metricContextRows = useMemo<Array<{ eventLabel: string; eventDate: string; summary: string }>>(() => {
    if (!metricContextTarget) return [] as Array<{ eventLabel: string; eventDate: string; summary: string; counted?: boolean }>;
    if (metricContextTarget.mode === 'leaderTimeline') {
      return prefixSnapshots.map((snapshot) => {
        const { event, prefixSummaries, prefixModel } = snapshot;
        const metricDefinition = prefixModel.metricDefinitions.find((metric) => metric.id === metricContextTarget.metricId);
        const values = prefixSummaries.map((row) => ({
          name: row.name,
          display: row.display,
          score: prefixModel.scoresByMetricId[metricContextTarget.metricId]?.[row.name] ?? 0,
          detail: metricDefinition?.detail(row.name) ?? '—',
        }));
        const maxScore = Math.max(...values.map((entry) => entry.score));
        const leaders = values.filter((entry) => entry.score === maxScore);
        return {
          eventLabel: event.eventName?.trim() || `Event ${event.eventNumber}`,
          eventDate: event.eventDate || '',
          summary: `${leaders.map((leader) => leader.display).join(', ')} — ${leaders[0]?.detail ?? '—'}`,
        };
      });
    }
    return [];
  }, [metricContextTarget, prefixSnapshots]);

  const playerMetricHistoryRows = useMemo<Array<{
    eventKey: string;
    eventLabel: string;
    eventDate: string;
    rawValue: number | null;
    rawLabel: string;
    normalizedScore: number | null;
    normalizedLabel: string;
    rawDelta: number | null;
    normalizedDelta: number | null;
  }>>(() => {
    if (!metricContextTarget || metricContextTarget.mode !== 'player' || !metricContextTarget.playerName) return [];

    const rows: Array<{
      eventKey: string;
      eventLabel: string;
      eventDate: string;
      rawValue: number | null;
      rawLabel: string;
      normalizedScore: number | null;
      normalizedLabel: string;
      rawDelta: number | null;
      normalizedDelta: number | null;
    }> = [];

    let previousRaw: number | null = null;
    let previousNormalized: number | null = null;

    for (const snapshot of prefixSnapshots) {
      const { event, prefixByName, prefixModel, seasonRounds } = snapshot;
      const playerSummary = prefixByName[metricContextTarget.playerName];
      const playerInEvent = event.players.find((entry) => entry.playerName === metricContextTarget.playerName);
      const playedThisEvent = Boolean(playerInEvent && !playerInEvent.didNotPlay);
      const computedRawValue: number | null = getMetricHistoryValue(playerSummary, metricContextTarget.metricId, seasonRounds);
      const rawValue: number | null = !playedThisEvent && shouldCarryForwardOnDnp(metricContextTarget.metricId)
        ? previousRaw
        : computedRawValue;

      const normalizedScore = playerSummary
        ? Number(prefixModel.scoresByMetricId[metricContextTarget.metricId]?.[metricContextTarget.playerName] ?? 0)
        : null;

      const rawDelta = rawValue === null || previousRaw === null ? null : rawValue - previousRaw;
      const normalizedDelta = normalizedScore === null || previousNormalized === null ? null : normalizedScore - previousNormalized;

      rows.push({
        eventKey: `E${event.eventNumber}`,
        eventLabel: event.eventName?.trim() || `Event ${event.eventNumber}`,
        eventDate: event.eventDate || '',
        rawValue,
        rawLabel: formatMetricHistoryValue(metricContextTarget.metricId, rawValue),
        normalizedScore,
        normalizedLabel: normalizedScore === null ? '—' : `${Math.round(normalizedScore)}`,
        rawDelta,
        normalizedDelta,
      });

      if (rawValue !== null && Number.isFinite(rawValue)) previousRaw = rawValue;
      if (normalizedScore !== null && Number.isFinite(normalizedScore)) previousNormalized = normalizedScore;
    }

    return rows;
  }, [metricContextTarget, prefixSnapshots, getMetricHistoryValue, formatMetricHistoryValue, shouldCarryForwardOnDnp]);

  const playerMetricHistoryGraphData = useMemo(() => {
    return playerMetricHistoryRows.map((row) => ({
      event: row.eventKey,
      rawValue: row.rawValue,
      normalizedScore: row.normalizedScore,
    }));
  }, [playerMetricHistoryRows]);

  return (
    <div className="chart-container">
      <h3 className="chart-title">Compare Players</h3>
      <p className="chart-subtitle">Pick 2 to 4 players for direct compare; league-wide analysis ranking is always shown below.</p>

      <div className="compare-picker">
        {players.map(name => {
          const active = selected.includes(name);
          const disabled = !active && selected.length >= 4;
          return (
            <button
              key={name}
              className={`compare-pill ${active ? 'active' : ''}`}
              disabled={disabled}
              onClick={() => toggle(name)}
            >
              <span className="player-dot" style={{ background: getPlayerColor(name) }} />
              {active && <span className="compare-pill-state">{`Selected ${selected.indexOf(name) + 1}`}</span>}
              {displayNames[name] ?? name}
            </button>
          );
        })}
      </div>

      {selected.length < 2 ? (
        <p className="empty-text" style={{ paddingTop: 12 }}>Select at least 2 players to unlock charts and head-to-head compare cards.</p>
      ) : (
        <>
          <div className="pp-section-title">Selected Players</div>
          <div className="compare-selected-grid">
            {summaryRows.map((row) => (
              <button key={row.name} className="compare-selected-card" onClick={() => toggle(row.name)}>
                <div className="compare-selected-top">
                  <span className="player-dot compare-selected-dot" style={{ background: getPlayerColor(row.name) }} />
                  {onPlayerClick ? (
                    <button className="icon-btn" style={{ width: 'auto', height: 'auto', padding: 0, color: 'var(--text)', textDecoration: 'underline' }} onClick={(e) => { e.stopPropagation(); onPlayerClick(row.name); }}>
                      {row.display}
                    </button>
                  ) : (
                    <span className="compare-selected-name">{row.display}</span>
                  )}
                  <span className="compare-selected-rank">#{selected.indexOf(row.name) + 1}</span>
                </div>
                <div className="compare-selected-metrics">
                  <span>{row.totalPoints} pts</span>
                  <span>{row.avgNet?.toFixed(1) ?? '—'} net avg</span>
                  <span>{row.currentHcp ?? '—'} {hcpLabel}</span>
                </div>
              </button>
            ))}
          </div>

          <div className="pp-charts-row">
            <div className="pp-chart-half">
              <p className="pp-chart-label">Cumulative points</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={eventData} margin={{ top: 8, right: 10, left: isMobile ? -16 : -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                  <XAxis dataKey="event" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                  <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                  <Tooltip trigger={tooltipTrigger} contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }} labelStyle={{ color: c.text2 }} />
                  {selected.map(name => (
                    <Line key={name} type="linear" dataKey={`${name}:cum`} name={displayNames[name] ?? name} stroke={getPlayerColor(name)} strokeWidth={2.5} dot={{ r: 3, fill: getPlayerColor(name) }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="pp-chart-half">
              <p className="pp-chart-label">Net scores</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={eventData} margin={{ top: 8, right: 10, left: isMobile ? -16 : -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                  <XAxis dataKey="event" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                  <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} domain={['dataMin - 2', 'dataMax + 2']} />
                  <Tooltip trigger={tooltipTrigger} contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }} labelStyle={{ color: c.text2 }} />
                  {selected.map(name => (
                    <Line key={name} type="linear" dataKey={`${name}:net`} name={displayNames[name] ?? name} stroke={getPlayerColor(name)} strokeWidth={2.5} dot={{ r: 3, fill: getPlayerColor(name) }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="pp-charts-row compare-extended-row">
            <div className="pp-chart-half">
              <p className="pp-chart-label">{trendLabel}</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={eventData} margin={{ top: 8, right: 10, left: isMobile ? -16 : -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                  <XAxis dataKey="event" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                  <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} domain={['dataMin - 1', 'dataMax + 1']} />
                  <Tooltip trigger={tooltipTrigger} contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }} labelStyle={{ color: c.text2 }} />
                  {selected.map(name => (
                    <Line key={name} type="linear" dataKey={`${name}:hcp`} name={displayNames[name] ?? name} stroke={getPlayerColor(name)} strokeWidth={2.5} dot={{ r: 3, fill: getPlayerColor(name) }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="pp-chart-half">
              <p className="pp-chart-label">Scoring profile</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={scoringProfileData} layout="vertical" margin={{ top: 8, right: 12, left: isMobile ? 0 : 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                  <XAxis type="number" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} domain={[0, 100]} />
                  <YAxis dataKey="player" type="category" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} width={isMobile ? 68 : 84} />
                  <Tooltip trigger={tooltipTrigger} contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }} labelStyle={{ color: c.text2 }} />
                  <Bar dataKey="birdies" stackId="a" fill="#22c55e" radius={[8, 0, 0, 8]} />
                  <Bar dataKey="pars" stackId="a" fill="#4f8ef7" />
                  <Bar dataKey="bogeys" stackId="a" fill="#f97316" />
                  <Bar dataKey="doubleBogeys" stackId="a" fill="#ef4444" />
                  <Bar dataKey="tripleBogeys" stackId="a" fill="#7c3aed" />
                  <Bar dataKey="other" stackId="a" fill="#3f3f5a" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="pp-section-title">Profile Snapshot</div>
          <div className="compare-profile-grid">
            {summaryRows.map((row) => (
              <div key={row.name} className="compare-profile-card">
                <div className="compare-profile-header">
                  <span className="player-dot compare-selected-dot" style={{ background: getPlayerColor(row.name) }} />
                  {onPlayerClick ? (
                    <button className="icon-btn" style={{ width: 'auto', height: 'auto', padding: 0, color: 'var(--text)', textDecoration: 'underline' }} onClick={() => onPlayerClick(row.name)}>
                      {row.display}
                    </button>
                  ) : (
                    <span className="compare-profile-name">{row.display}</span>
                  )}
                </div>
                <div className="compare-profile-stats">
                  <span><strong>{row.eventsPlayed}</strong> rounds</span>
                  <span><strong>{row.bestGross ?? '—'}</strong> best gross</span>
                  <span><strong>{row.bestNet ?? '—'}</strong> best net</span>
                  <span><strong>{row.currentHcp ?? '—'}</strong> {currentHcpLabel}</span>
                  <span><strong>{row.birdies}</strong> birdies</span>
                  <span><strong>{row.bogeysOrWorse}</strong> bogeys+</span>
                </div>
              </div>
            ))}
          </div>

          <div className="pp-section-title">Hole-Type Splits</div>
          {courseConfig ? (
            <div className="compare-profile-grid">
              {summaryRows.map((row) => (
                <div key={`hole-type-${row.name}`} className="compare-profile-card">
                  <div className="compare-profile-header">
                    <span className="player-dot compare-selected-dot" style={{ background: getPlayerColor(row.name) }} />
                    <span className="compare-profile-name">{row.display}</span>
                  </div>
                  <div className="compare-profile-stats">
                    <span><strong>{Number.isFinite(row.par3AvgDiff) ? `${row.par3AvgDiff >= 0 ? '+' : ''}${row.par3AvgDiff.toFixed(2)}` : '—'}</strong> par 3 avg</span>
                    <span><strong>{Number.isFinite(row.par4AvgDiff) ? `${row.par4AvgDiff >= 0 ? '+' : ''}${row.par4AvgDiff.toFixed(2)}` : '—'}</strong> par 4 avg</span>
                    <span><strong>{Number.isFinite(row.par5AvgDiff) ? `${row.par5AvgDiff >= 0 ? '+' : ''}${row.par5AvgDiff.toFixed(2)}` : '—'}</strong> par 5 avg</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="pp-no-course">Set a course scorecard to unlock par-3/par-4/par-5 split analysis.</p>
          )}

          <div className="pp-section-title">Front vs Back Splits</div>
          <div className="compare-profile-grid">
            {summaryRows.map((row) => (
              <div key={`front-back-${row.name}`} className="compare-profile-card">
                <div className="compare-profile-header">
                  <span className="player-dot compare-selected-dot" style={{ background: getPlayerColor(row.name) }} />
                  <span className="compare-profile-name">{row.display}</span>
                </div>
                <div className="compare-profile-stats">
                  <span><strong>{row.frontAvgPoints?.toFixed(1) ?? '—'}</strong> front pts</span>
                  <span><strong>{row.backAvgPoints?.toFixed(1) ?? '—'}</strong> back pts</span>
                  <span><strong>{row.frontAvgNet?.toFixed(1) ?? '—'}</strong> front net</span>
                  <span><strong>{row.backAvgNet?.toFixed(1) ?? '—'}</strong> back net</span>
                </div>
              </div>
            ))}
          </div>

          <div className="pp-section-title">Overall Shape (Normalized 0-100)</div>
          <div className="compare-radar-card">
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarModel.data} outerRadius="72%">
                <PolarGrid stroke={c.grid} />
                <PolarAngleAxis dataKey="metric" tick={{ fill: c.tick, fontSize: 11 }} />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tickCount={6}
                  tick={{ fill: c.tick, fontSize: 10 }}
                  axisLine={false}
                />
                {selected.map((name) => (
                  <Radar
                    key={name}
                    name={displayNames[name] ?? name}
                    dataKey={name}
                    stroke={getPlayerColor(name)}
                    fill={getPlayerColor(name)}
                    fillOpacity={0.14}
                    strokeWidth={2}
                  />
                ))}
                <Tooltip
                  trigger={tooltipTrigger}
                  contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                  labelStyle={{ color: c.text2 }}
                  labelFormatter={(label) => `${label} (0-100 normalized)`}
                  formatter={(value, name, item) => {
                    const metric = String(item?.payload?.metric ?? '');
                    const playerName = String(name);
                    const baseName = displayNames[playerName] ?? playerName;
                    const detail = radarModel.details[metric]?.[playerName];
                    return [`${Math.round(Number(value))}`, detail ? `${baseName} - ${detail}` : baseName];
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="compare-summary-table-wrap">
            <table className="compare-summary-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Rounds</th>
                  <th>Total Pts</th>
                  <th>Avg Pts</th>
                  <th>Avg Gross</th>
                  <th>Avg Net</th>
                  <th>{headerHcpLabel}</th>
                  <th>Avg Rank</th>
                  <th>Best Gross</th>
                  <th>Best Net</th>
                  <th>Birdies</th>
                  <th>Pars</th>
                  <th>Bogeys+</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((row, idx) => (
                  <tr key={row.name} className={idx % 2 === 0 ? 'compare-even' : ''}>
                    <td className="compare-player-cell">
                      <span className="player-dot" style={{ background: getPlayerColor(row.name) }} />
                      {onPlayerClick ? (
                        <button className="icon-btn" style={{ width: 'auto', height: 'auto', padding: 0, color: 'var(--text)', textDecoration: 'underline' }} onClick={() => onPlayerClick(row.name)}>
                          {row.display}
                        </button>
                      ) : row.display}
                    </td>
                    <td>{row.eventsPlayed}</td>
                    <td>{row.totalPoints}</td>
                    <td>{row.avgPoints?.toFixed(1) ?? '—'}</td>
                    <td>{row.avgGross?.toFixed(1) ?? '—'}</td>
                    <td>{row.avgNet?.toFixed(1) ?? '—'}</td>
                    <td>{row.currentHcp ?? '—'}</td>
                    <td>{row.avgPosition?.toFixed(1) ?? '—'}</td>
                    <td>{row.bestGross ?? '—'}</td>
                    <td>{row.bestNet ?? '—'}</td>
                    <td>{row.birdies}</td>
                    <td>{row.pars}</td>
                    <td>{row.bogeysOrWorse}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selected.length > 0 && (
        <>
          <div className="pp-section-title">Metric History</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10, marginBottom: 10 }}>
            <label style={{ color: 'var(--text2)', fontSize: 12 }}>Metric</label>
            <select className="url-input" value={historyMetricId} onChange={(e) => setHistoryMetricId(e.target.value as AnalysisMetricKey)} style={{ maxWidth: 260 }}>
              {radarModel.metricDefinitions.map((metric) => (
                <option key={`history-${metric.id}`} value={metric.id}>{metric.label}</option>
              ))}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={metricHistoryData} margin={{ top: 8, right: 10, left: isMobile ? -16 : -10, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
              <XAxis dataKey="event" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
              <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
              <Tooltip
                trigger={tooltipTrigger}
                contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                labelStyle={{ color: c.text2 }}
                formatter={(value, name) => [formatMetricHistoryValue(historyMetricId, Number.isFinite(Number(value)) ? Number(value) : null), displayNames[String(name)] ?? String(name)]}
              />
              {selected.map((name) => (
                <Line key={`history-line-${name}`} type="linear" dataKey={name} name={displayNames[name] ?? name} stroke={getPlayerColor(name)} strokeWidth={2.5} dot={{ r: 3, fill: getPlayerColor(name) }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </>
      )}

      <div className="pp-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span>Overall Analysis Ranking (League-Wide)</span>
        <button className="btn-secondary" onClick={() => setShowMetricDefinitions(true)} style={{ padding: '5px 10px', fontSize: 12 }}>
          Metric Definitions
        </button>
      </div>
      <div className="compare-radar-card" style={{ paddingTop: 10 }}>
        <div style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 10 }}>
          Weighted composite = sum(metricScore * metricWeight) / sum(metricWeight)
        </div>
        <div style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
          {radarModel.metricDefinitions.map((metric) => `${metric.label} ${(metric.weight * 100).toFixed(0)}%`).join(', ')}
        </div>

        <div className="pp-section-title">Per-Metric League Leaders</div>
        <div className="compare-selected-grid" style={{ marginTop: 10 }}>
          {metricLeaders.map((metric) => (
            <button
              key={`leader-${metric.id}`}
              type="button"
              className="compare-profile-card"
              style={{ textAlign: 'left' }}
              onClick={() => {
                setMetricContextView('table');
                setMetricContextTarget({ metricId: metric.id, mode: 'leaderTimeline' });
              }}
            >
              <div className="compare-profile-name" style={{ marginBottom: 8 }}>{metric.label}</div>
              <div style={{ color: 'var(--text)', fontWeight: 700, marginBottom: 4 }}>
                {metric.leaders.map((leader) => leader.display).join(', ')}
              </div>
              <div style={{ color: 'var(--text2)', fontSize: 12, lineHeight: 1.5 }}>{metric.leaders[0]?.detail ?? '—'}</div>
            </button>
          ))}
        </div>

        <div className="compare-analysis-mobile-list" style={{ marginTop: 14 }}>
          {analysisRanking.map((entry, index) => {
            const row = fieldSummaryByName[entry.name];
            const isSelected = selected.includes(entry.name);
            const explanation = rankExplanations[entry.name];
            return (
              <div key={`analysis-mobile-${entry.name}`} className={`compare-analysis-mobile-card ${isSelected ? 'compare-selected-row' : ''}`.trim()}>
                <div className="compare-analysis-mobile-top">
                  <span style={{ color: 'var(--text2)', fontSize: 12 }}>#{index + 1}</span>
                  <span className="compare-player-cell" style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <span className="player-dot" style={{ background: getPlayerColor(entry.name) }} />
                    {onPlayerClick ? (
                      <button className="icon-btn" style={{ width: 'auto', height: 'auto', padding: 0, color: 'var(--text)', textDecoration: 'underline' }} onClick={() => onPlayerClick(entry.name)}>
                        {entry.display}
                      </button>
                    ) : entry.display}
                  </span>
                  {isSelected && <span className="compare-pill-state">Selected</span>}
                </div>
                <div className="compare-analysis-mobile-summary">
                  <span><strong>{entry.overallScore.toFixed(1)}</strong> score</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {renderStarRating(entry.stars)}
                    <span style={{ color: 'var(--text2)', fontSize: 12 }}>{entry.stars.toFixed(1)}</span>
                  </span>
                </div>
                <div className="compare-analysis-mobile-summary">
                  <span>{row?.eventsPlayed ?? '—'} rounds</span>
                  <span>{row?.avgPoints?.toFixed(1) ?? '—'} avg pts</span>
                  <span>{row?.avgNet?.toFixed(1) ?? '—'} avg net</span>
                </div>
                <div className="compare-analysis-mobile-summary">
                  <span>{entry.metricRawCounts.eventWins} wins</span>
                  <span>{entry.metricRawCounts.topThreeRate} top-3</span>
                  <span>{entry.metricRawCounts.topFiveRate} top-5</span>
                </div>
                <div className="compare-analysis-mobile-summary" style={{ display: 'grid', gap: 4 }}>
                  <span><strong style={{ color: 'var(--text)' }}>Strengths:</strong> {explanation?.strengths.map((item) => item.label).join(', ')}</span>
                  <span><strong style={{ color: 'var(--text)' }}>Weaknesses:</strong> {explanation?.weaknesses.map((item) => item.label).join(', ')}</span>
                </div>
                <div className="compare-analysis-mobile-metrics">
                  {radarModel.metricDefinitions.map((metric) => {
                    const previousRow = previousFieldSummaryByName[entry.name];
                    const previousScore = previousRadarModel?.scoresByMetricId[metric.id]?.[entry.name];
                    const currentScore = Number(entry.metricScores[metric.id] ?? 0);
                    const deltaValue = metric.id === 'eventWins'
                      ? (row?.eventWinsCount ?? 0) - (previousRow?.eventWinsCount ?? 0)
                      : metric.id === 'topThreeRate'
                        ? (row?.topThreeCount ?? 0) - (previousRow?.topThreeCount ?? 0)
                        : metric.id === 'topFiveRate'
                          ? (row?.topFiveCount ?? 0) - (previousRow?.topFiveCount ?? 0)
                          : metric.id === 'cleanCard'
                            ? (row?.cleanCardCount ?? 0) - (previousRow?.cleanCardCount ?? 0)
                            : previousRadarModel ? currentScore - Number(previousScore ?? 0) : null;
                    const chipDelta = formatChipDelta(deltaValue);
                    const chipValue = metric.id === 'eventWins'
                      ? `${entry.metricRawCounts.eventWins}`
                      : metric.id === 'topThreeRate'
                        ? `${entry.metricRawCounts.topThreeRate}`
                        : metric.id === 'topFiveRate'
                          ? `${entry.metricRawCounts.topFiveRate}`
                          : metric.id === 'cleanCard'
                            ? `${entry.metricRawCounts.cleanCard}`
                            : `${Math.round(currentScore)}`;
                    return (
                      <button
                        key={`metric-chip-${entry.name}-${metric.id}`}
                        type="button"
                        className="compare-analysis-metric-chip"
                        style={{ textAlign: 'left', cursor: 'pointer' }}
                        onClick={() => {
                          setMetricContextView('table');
                          setMetricContextTarget({ playerName: entry.name, metricId: metric.id, mode: 'player' });
                        }}
                      >
                        {metric.label}: {chipValue}<span className={chipDelta.className}>{chipDelta.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {metricContextTarget && (
        <div className="modal-overlay" onClick={() => setMetricContextTarget(null)}>
          <div className="modal" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{metricContextTarget.mode === 'leaderTimeline'
                ? `${radarModel.metricDefinitions.find((metric) => metric.id === metricContextTarget.metricId)?.label ?? 'Metric'} — Leaders by Event`
                : `${displayNames[metricContextTarget.playerName ?? ''] ?? metricContextTarget.playerName} — ${radarModel.metricDefinitions.find((metric) => metric.id === metricContextTarget.metricId)?.label ?? 'Metric Context'}`}</h2>
              <button className="icon-btn" onClick={() => setMetricContextTarget(null)}>Close</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 10 }}>
              <p className="hint" style={{ marginBottom: 0 }}>
                {metricContextTarget.mode === 'leaderTimeline'
                  ? 'Event-by-event leader timeline showing who led this metric after each event.'
                  : 'Event-by-event progression for this metric, including raw value and normalized model score.'}
              </p>
              {metricContextTarget.mode === 'player' && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    type="button"
                    className={`btn-secondary ${metricContextView === 'table' ? 'rank-basis-btn-active' : ''}`}
                    onClick={() => setMetricContextView('table')}
                    style={{ padding: '5px 10px', fontSize: 12 }}
                  >
                    Table View
                  </button>
                  <button
                    type="button"
                    className={`btn-secondary ${metricContextView === 'graph' ? 'rank-basis-btn-active' : ''}`}
                    onClick={() => setMetricContextView('graph')}
                    style={{ padding: '5px 10px', fontSize: 12 }}
                  >
                    Graph View
                  </button>
                </div>
              )}
              {metricContextTarget.mode === 'leaderTimeline' ? (
                <div className="compare-summary-table-wrap" style={{ marginTop: 0 }}>
                  <table className="compare-summary-table">
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Date</th>
                        <th>Leader Context</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metricContextRows.map((row, index) => (
                        <tr key={`metric-context-${row.eventLabel}-${index}`} className={index % 2 === 0 ? 'compare-even' : ''}>
                          <td>{row.eventLabel}</td>
                          <td>{row.eventDate || '—'}</td>
                          <td>{row.summary}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : metricContextView === 'table' ? (
                <div className="compare-summary-table-wrap" style={{ marginTop: 0 }}>
                  <table className="compare-summary-table">
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Date</th>
                        <th>Raw Metric Value</th>
                        <th>Raw Delta</th>
                        <th>Model Score (0-100)</th>
                        <th>Score Trend</th>
                        <th>Score Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {playerMetricHistoryRows.map((row, index) => (
                        <tr key={`metric-history-${row.eventLabel}-${index}`} className={index % 2 === 0 ? 'compare-even' : ''}>
                          <td>{row.eventLabel}</td>
                          <td>{row.eventDate || '—'}</td>
                          <td>{row.rawLabel}</td>
                          <td>{row.rawDelta === null ? '—' : `${row.rawDelta >= 0 ? '+' : ''}${row.rawDelta.toFixed(2)}`}</td>
                          <td>{row.normalizedLabel}</td>
                          <td>
                            {row.normalizedScore === null ? '—' : (
                              <div style={{ width: 140, height: 10, background: 'var(--bg4)', borderRadius: 999, overflow: 'hidden' }}>
                                <div
                                  style={{
                                    height: '100%',
                                    width: `${Math.max(0, Math.min(100, row.normalizedScore))}%`,
                                    background: 'var(--accent)',
                                  }}
                                />
                              </div>
                            )}
                          </td>
                          <td>{row.normalizedDelta === null ? '—' : `${row.normalizedDelta >= 0 ? '+' : ''}${row.normalizedDelta.toFixed(1)}`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={playerMetricHistoryGraphData} margin={{ top: 8, right: 24, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                      <XAxis dataKey="event" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <YAxis
                        yAxisId="raw"
                        stroke={c.axis}
                        tick={{ fill: c.tick, fontSize: 11 }}
                        tickFormatter={(value) => formatMetricHistoryValue(metricContextTarget.metricId, Number(value))}
                      />
                      <YAxis yAxisId="norm" orientation="right" domain={[0, 100]} stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <Tooltip
                        trigger={tooltipTrigger}
                        contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                        labelStyle={{ color: c.text2 }}
                        formatter={(value, name) => {
                          if (name === 'rawValue') return [formatMetricHistoryValue(metricContextTarget.metricId, Number.isFinite(Number(value)) ? Number(value) : null), 'Raw value'];
                          return [Number.isFinite(Number(value)) ? `${Math.round(Number(value))}` : '—', 'Model score (0-100)'];
                        }}
                      />
                      <Line yAxisId="raw" type="monotone" dataKey="rawValue" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--accent)' }} connectNulls name="rawValue" />
                      <Line yAxisId="norm" type="monotone" dataKey="normalizedScore" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: '#f59e0b' }} connectNulls name="normalizedScore" />
                    </LineChart>
                  </ResponsiveContainer>
                  <div style={{ color: 'var(--text2)', fontSize: 12, lineHeight: 1.5 }}>
                    Blue line = raw metric value, amber line = normalized model score (0-100).
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showMetricDefinitions && (
        <div className="modal-overlay" onClick={() => setShowMetricDefinitions(false)}>
          <div className="modal" style={{ maxWidth: 760 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Analysis Metric Definitions</h2>
              <button className="icon-btn" onClick={() => setShowMetricDefinitions(false)}>Close</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: 10 }}>
              <p className="hint" style={{ marginBottom: 0 }}>
                These definitions explain what each metric is actually measuring in the league-wide ranking model.
              </p>
              {metricDefinitionsContent.map((item) => (
                <div key={item.id} className="compare-radar-card" style={{ margin: 0 }}>
                  <div style={{ color: 'var(--text)', fontWeight: 700, marginBottom: 4 }}>{item.title}</div>
                  <div style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.5 }}>{item.definition}</div>
                  <div style={{ color: 'var(--text2)', fontSize: 12, lineHeight: 1.5, marginTop: 6 }}>
                    <strong style={{ color: 'var(--text)' }}>Formula:</strong> {item.formula}
                  </div>
                </div>
              ))}
              <div className="modal-actions" style={{ marginTop: 4 }}>
                <button className="btn-secondary" onClick={() => setShowMetricDefinitions(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
