import { memo, useCallback, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import type { CourseConfig, EventData, HandicapMode, LeagueAnalysisSettings } from '../types/golf';
import { buildComparePlayerRows } from '../lib/analytics';
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

function scoreToStars(score: number): number {
  const normalized = Math.max(0, Math.min(100, score));
  return Math.round((normalized / 20) * 2) / 2;
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

  const metricDefinitionsContent = useMemo(() => ([
    {
      id: 'pointsForm',
      title: 'Points Form',
      definition: 'How many points a player earns per round on average. Higher means they consistently collect points in your scoring format.',
    },
    {
      id: 'netScoring',
      title: 'Net Scoring',
      definition: 'Average net score after handicap adjustments. Lower net scores indicate stronger adjusted performance.',
    },
    {
      id: 'grossScoring',
      title: 'Gross Scoring',
      definition: 'Average raw strokes before handicap. Lower gross scores indicate better pure shot-making performance.',
    },
    {
      id: 'consistency',
      title: 'Consistency',
      definition: 'How stable a player is week to week in scoring. Uses score variability (net when available, otherwise gross); lower spread means steadier golf.',
    },
    {
      id: 'birdieRate',
      title: 'Birdie Rate',
      definition: 'Share of tracked holes finished as birdie or better. Higher values indicate stronger scoring upside.',
    },
    {
      id: 'damageControl',
      title: 'Damage Control',
      definition: 'How severe a player\'s mistake holes are when they happen, with heavier penalties for doubles, triples, and worse outcomes.',
    },
    {
      id: 'blowupAvoidance',
      title: 'Blow-Up Avoidance',
      definition: 'How often a player avoids blow-up holes (double bogey or worse). Higher values mean fewer major mistakes per hole played.',
    },
    {
      id: 'participation',
      title: 'Participation',
      definition: 'How often a player shows up relative to total season rounds. Higher participation rewards availability and reliability.',
    },
    {
      id: 'parEfficiency',
      title: 'Par Efficiency',
      definition: 'Percentage of tracked holes finished at par. Higher values indicate steady, low-variance golf.',
    },
    {
      id: 'eventWins',
      title: 'Event Wins',
      definition: 'How many events a player wins by points, including tied wins when multiple players share the highest points total.',
    },
    {
      id: 'topThreeRate',
      title: 'Top-3 Finishes',
      definition: 'How many events a player finishes in the top three by points, including ties based on points rank.',
    },
    {
      id: 'topFiveRate',
      title: 'Top-5 Finishes',
      definition: 'How many events a player finishes in the top five by points, including ties based on points rank.',
    },
    {
      id: 'momentum',
      title: 'Momentum',
      definition: 'Whether a player improves as the season progresses. Positive momentum means stronger second-half performance than first-half.',
    },
    {
      id: 'clutchFactor',
      title: 'Clutch Factor',
      definition: 'How recent form compares to season average. Higher clutch factor means the player has been stepping up in the most recent rounds.',
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

  const summarizePlayers = useCallback((names: string[], sourceRows: ReturnType<typeof buildComparePlayerRows>) => {
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
      for (const ev of events) {
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

        currentHcp = p.handicap;
        if (p.grossScore !== null) bestGross = bestGross === null ? p.grossScore : Math.min(bestGross, p.grossScore);
        if (p.netScore !== null) bestNet = bestNet === null ? p.netScore : Math.min(bestNet, p.netScore);
        if (courseConfig) {
          const bd = computeBreakdown(p.holes, getParsForNine(courseConfig, ev.nineHoles));
          birdies += bd.birdies;
          pars += bd.pars;
          bogeys += bd.bogeys;
          doubleBogeys += bd.doubleBogeys;
          tripleBogeys += bd.tripleBogeys;
          others += bd.other;
          bogeysOrWorse += bd.bogeys + bd.doubleBogeys + bd.tripleBogeys + bd.other;
        } else {
          birdies += p.birdies;
          pars += p.pars;
          bogeys += p.bogeys;
          doubleBogeys += p.doubleBogeys;
          tripleBogeys += p.tripleBogeys;
          others += p.other;
          bogeysOrWorse += p.bogeys + p.doubleBogeys + p.tripleBogeys + p.other;
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
        parEfficiency: totalTracked > 0 ? pars / totalTracked : Number.NaN,
        eventWinsCount: eventWinsByPoints,
        topThreeCount: topThreeByPoints,
        topFiveCount: topFiveByPoints,
        momentum: firstHalfAvg !== null && secondHalfAvg !== null ? secondHalfAvg - firstHalfAvg : Number.NaN,
        clutchFactor: recentAvg !== null && avg(points) !== null ? recentAvg - (avg(points) ?? 0) : Number.NaN,
      };
    });
  }, [courseConfig, displayNames, events]);

  const summaryRows = useMemo(() => summarizePlayers(selected, rows), [selected, rows, summarizePlayers]);
  const fieldSummaryRows = useMemo(() => summarizePlayers(players, allRows), [allRows, players, summarizePlayers]);

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

  const radarModel = useMemo(() => {
    const names = summaryRows.map((row) => row.name);
    const fieldNames = fieldSummaryRows.map((row) => row.name);
    const pointsByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => [row.name, row.avgPoints ?? 0]));
    const netByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => [row.name, row.avgNet ?? Number.NaN]));
    const grossByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => [row.name, row.avgGross ?? Number.NaN]));
    const consistencyByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => [row.name, row.scoreStdDev ?? Number.NaN]));
    const seasonRoundsTotal = Math.max(events.length, 1);
    const roundsByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => [row.name, row.eventsPlayed / seasonRoundsTotal]));
    const birdieRateByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => {
      const totalTracked = row.birdies + row.pars + row.bogeysOrWorse;
      return [row.name, totalTracked > 0 ? row.birdies / totalTracked : Number.NaN];
    }));
    const damageControlByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => {
      const totalTracked = row.birdies + row.pars + row.bogeysOrWorse;
      if (!totalTracked) return [row.name, Number.NaN];
      const weightedMistakePenalty = (row.bogeys * 1) + (row.doubleBogeys * 2) + (row.tripleBogeys * 3) + (row.others * 4);
      const maxPenalty = totalTracked * 4;
      return [row.name, 1 - (weightedMistakePenalty / maxPenalty)];
    }));
    const blowupAvoidanceByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => {
      const totalTracked = row.birdies + row.pars + row.bogeysOrWorse;
      if (!totalTracked) return [row.name, Number.NaN];
      const blowupHoles = row.doubleBogeys + row.tripleBogeys + row.others;
      return [row.name, 1 - (blowupHoles / totalTracked)];
    }));
    const parEfficiencyByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => [row.name, row.parEfficiency]));
    const topThreeByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => [row.name, row.topThreeCount]));
    const topFiveByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => [row.name, row.topFiveCount]));
    const momentumByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => [row.name, row.momentum]));
    const clutchFactorByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => [row.name, row.clutchFactor]));

    const selectedRowsByName = Object.fromEntries(summaryRows.map((row) => [row.name, row]));

    function normalize(valuesByPlayer: Record<string, number>, domainNames: string[], invert = false): Record<string, number> {
      const vals = domainNames
        .map((name) => valuesByPlayer[name])
        .filter((value) => Number.isFinite(value));
      if (!vals.length) return Object.fromEntries(fieldNames.map((name) => [name, 0]));
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      if (Math.abs(max - min) < 1e-9) return Object.fromEntries(fieldNames.map((name) => [name, 100]));
      return Object.fromEntries(fieldNames.map((name) => {
        const value = valuesByPlayer[name];
        if (!Number.isFinite(value)) return [name, 0];
        const ratio = (value - min) / (max - min);
        const normalized = invert ? 1 - ratio : ratio;
        return [name, Math.round(normalized * 100)];
      }));
    }

    const pointsScore = normalize(pointsByPlayer, fieldNames);
    const netScore = normalize(netByPlayer, fieldNames, true);
    const grossScore = normalize(grossByPlayer, fieldNames, true);
    const fieldConsistencyScore = normalize(consistencyByPlayer, fieldNames, true);
    const CONSISTENCY_MIN_SCORE = 10;
    const consistencyScore = Object.fromEntries(
      fieldNames.map((name) => {
        const stdev = consistencyByPlayer[name];
        if (!Number.isFinite(stdev)) return [name, 0];
        const normalized = fieldConsistencyScore[name] ?? 0;
        return [name, Math.max(CONSISTENCY_MIN_SCORE, normalized)];
      })
    );
    const roundsScore = Object.fromEntries(
      fieldNames.map((name) => [name, Math.round((roundsByPlayer[name] ?? 0) * 100)])
    );
    const birdieRateScore = normalize(birdieRateByPlayer, fieldNames);
    const damageControlScore = normalize(damageControlByPlayer, fieldNames);
    const blowupAvoidanceScore = normalize(blowupAvoidanceByPlayer, fieldNames);
    const parEfficiencyScore = normalize(parEfficiencyByPlayer, fieldNames);
    const eventWinsByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => [row.name, row.eventWinsCount]));
    const eventWinsScore = normalize(eventWinsByPlayer, fieldNames);
    const topThreeRateScore = normalize(topThreeByPlayer, fieldNames);
    const topFiveRateScore = normalize(topFiveByPlayer, fieldNames);
    const momentumScore = normalize(momentumByPlayer, fieldNames);
    const clutchFactorScore = normalize(clutchFactorByPlayer, fieldNames);

    const metricDefinitions = [
      { id: 'pointsForm', label: 'Points Form', score: pointsScore, weight: analysisSettings.weights.pointsForm ?? 0.18, detail: (name: string) => `${(pointsByPlayer[name] ?? 0).toFixed(1)} avg pts/round` },
      { id: 'netScoring', label: 'Net Scoring', score: netScore, weight: analysisSettings.weights.netScoring ?? 0.14, detail: (name: string) => Number.isFinite(netByPlayer[name]) ? `${(netByPlayer[name] as number).toFixed(1)} avg net` : 'No net data' },
      { id: 'grossScoring', label: 'Gross Scoring', score: grossScore, weight: analysisSettings.weights.grossScoring ?? 0.1, detail: (name: string) => Number.isFinite(grossByPlayer[name]) ? `${(grossByPlayer[name] as number).toFixed(1)} avg gross` : 'No gross data' },
      { id: 'consistency', label: 'Consistency', score: consistencyScore, weight: analysisSettings.weights.consistency ?? 0.1, detail: (name: string) => Number.isFinite(consistencyByPlayer[name]) ? `${(consistencyByPlayer[name] as number).toFixed(2)} score stdev` : 'Not enough rounds' },
      { id: 'birdieRate', label: 'Birdie Rate', score: birdieRateScore, weight: analysisSettings.weights.birdieRate ?? 0.07, detail: (name: string) => Number.isFinite(birdieRateByPlayer[name]) ? `${((birdieRateByPlayer[name] as number) * 100).toFixed(1)}% birdie rate` : 'No hole data' },
      { id: 'damageControl', label: 'Damage Control', score: damageControlScore, weight: analysisSettings.weights.damageControl ?? 0.07, detail: (name: string) => Number.isFinite(damageControlByPlayer[name]) ? `${((damageControlByPlayer[name] as number) * 100).toFixed(1)} weighted damage control` : 'No hole data' },
      { id: 'blowupAvoidance', label: 'Blow-Up Avoidance', score: blowupAvoidanceScore, weight: analysisSettings.weights.blowupAvoidance ?? 0.06, detail: (name: string) => {
        const player = fieldSummaryRows.find((row) => row.name === name);
        if (!player) return 'No hole data';
        const blowupHoles = player.doubleBogeys + player.tripleBogeys + player.others;
        return `${blowupHoles} blow-up hole${blowupHoles === 1 ? '' : 's'}`;
      } },
      { id: 'participation', label: 'Participation', score: roundsScore, weight: analysisSettings.weights.participation ?? 0.04, detail: (name: string) => `${((roundsByPlayer[name] ?? 0) * 100).toFixed(1)}% participation` },
      { id: 'parEfficiency', label: 'Par Efficiency', score: parEfficiencyScore, weight: analysisSettings.weights.parEfficiency ?? 0.06, detail: (name: string) => Number.isFinite(parEfficiencyByPlayer[name]) ? `${((parEfficiencyByPlayer[name] as number) * 100).toFixed(1)}% pars` : 'No hole data' },
      { id: 'eventWins', label: 'Event Wins', score: eventWinsScore, weight: analysisSettings.weights.eventWins ?? 0.05, detail: (name: string) => `${eventWinsByPlayer[name] ?? 0} win${(eventWinsByPlayer[name] ?? 0) === 1 ? '' : 's'}` },
      { id: 'topThreeRate', label: 'Top-3 Finishes', score: topThreeRateScore, weight: analysisSettings.weights.topThreeRate ?? 0.05, detail: (name: string) => `${topThreeByPlayer[name] ?? 0} top-3 finish${(topThreeByPlayer[name] ?? 0) === 1 ? '' : 'es'}` },
      { id: 'topFiveRate', label: 'Top-5 Finishes', score: topFiveRateScore, weight: analysisSettings.weights.topFiveRate ?? 0.04, detail: (name: string) => `${topFiveByPlayer[name] ?? 0} top-5 finish${(topFiveByPlayer[name] ?? 0) === 1 ? '' : 'es'}` },
      { id: 'momentum', label: 'Momentum', score: momentumScore, weight: analysisSettings.weights.momentum ?? 0.04, detail: (name: string) => Number.isFinite(momentumByPlayer[name]) ? `${(momentumByPlayer[name] as number).toFixed(2)} pts second-half lift` : 'Not enough rounds' },
      { id: 'clutchFactor', label: 'Clutch Factor', score: clutchFactorScore, weight: analysisSettings.weights.clutchFactor ?? 0.03, detail: (name: string) => Number.isFinite(clutchFactorByPlayer[name]) ? `${(clutchFactorByPlayer[name] as number).toFixed(2)} pts recent-vs-season` : 'Not enough rounds' },
    ] as const;

    const data = metricDefinitions.map((metric) => ({
      metric: metric.label,
      ...Object.fromEntries(names.map((name) => [name, metric.score[name] ?? 0])),
    }));

    const details: Record<string, Record<string, string>> = Object.fromEntries(
      metricDefinitions.map((metric) => [
        metric.label,
        Object.fromEntries(names.map((name) => [name, metric.detail(name)])),
      ])
    );

    const weights: Record<string, number> = Object.fromEntries(metricDefinitions.map((metric) => [metric.label, metric.weight]));
    const scoresByMetricId: Record<string, Record<string, number>> = Object.fromEntries(
      metricDefinitions.map((metric) => [metric.id, metric.score])
    );

    return {
      data,
      details,
      weights,
      metricDefinitions,
      scoresByMetricId,
      selectedRowsByName,
    };
  }, [summaryRows, fieldSummaryRows, events.length, analysisSettings.weights]);

  const analysisRanking = useMemo(() => {
    const metricWeightSum = radarModel.metricDefinitions.reduce((sum, metric) => sum + metric.weight, 0);
    return fieldSummaryRows
      .map((row) => {
        const metricScores = Object.fromEntries(
          radarModel.metricDefinitions.map((metric) => [metric.id, radarModel.scoresByMetricId[metric.id]?.[row.name] ?? 0])
        );
        const weightedSum = radarModel.metricDefinitions.reduce(
          (sum, metric) => sum + ((metricScores[metric.id] as number) * metric.weight),
          0
        );
        const overallScore = weightedSum / (metricWeightSum || 1);
        const stars = scoreToStars(overallScore);

        return {
          name: row.name,
          display: row.display,
          overallScore,
          stars,
          metricScores,
          metricRawCounts: {
            eventWins: row.eventWinsCount ?? 0,
            topThreeRate: row.topThreeCount ?? 0,
            topFiveRate: row.topFiveCount ?? 0,
          },
        };
      })
      .sort((a, b) => b.overallScore - a.overallScore || a.display.localeCompare(b.display));
  }, [fieldSummaryRows, radarModel.metricDefinitions, radarModel.scoresByMetricId]);

  const fieldSummaryByName = useMemo(
    () => Object.fromEntries(fieldSummaryRows.map((row) => [row.name, row])),
    [fieldSummaryRows]
  );

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
            <div style={{ marginTop: 10, color: 'var(--text2)', fontSize: 12, lineHeight: 1.5 }}>
              <div><strong style={{ color: 'var(--text)' }}>How to read:</strong> each axis is scored 0-100 against the full season field; only selected players are drawn.</div>
              <div>Normalization (higher-better): score = 100 * (x - fieldMin) / (fieldMax - fieldMin)</div>
              <div>Normalization (lower-better): score = 100 * (fieldMax - x) / (fieldMax - fieldMin)</div>
              <div>Points Form: x = avgPoints = (sum of points across played rounds) / roundsPlayed.</div>
              <div>Net Scoring: x = avgNet = (sum of net scores) / roundsWithNet.</div>
              <div>Gross Scoring: x = avgGross = (sum of gross scores) / roundsWithGross.</div>
              <div>Consistency (field-normalized with floor): scoreStdDev = sqrt(sum((score - avgScore)^2) / roundsWithScore), where score is net when available (otherwise gross). baseScore = 100 * (fieldMaxStdDev - scoreStdDev) / (fieldMaxStdDev - fieldMinStdDev), finalScore = max(10, baseScore).</div>
              <div>Birdie Rate: x = birdies / trackedHoles.</div>
              <div>Damage Control: weightedPenalty = (1*bogeys + 2*doubleBogeys + 3*tripleBogeys + 4*other) / (4*trackedHoles), x = 1 - weightedPenalty.</div>
              <div>Blow-Up Avoidance: blowupRate = (doubleBogeys + tripleBogeys + other) / trackedHoles, x = 1 - blowupRate.</div>
              <div>Par Efficiency: x = pars / trackedHoles.</div>
              <div>Event Wins: x = count of events where player points equals the event max (ties included).</div>
              <div>Top-3 Finishes: x = count of events with pointsRank {'<='} 3 (ties by points included).</div>
              <div>Top-5 Finishes: x = count of events with pointsRank {'<='} 5 (ties by points included).</div>
              <div>Momentum: x = secondHalfAvgPoints - firstHalfAvgPoints.</div>
              <div>Clutch Factor: x = recentAvgPoints(Last 3) - seasonAvgPoints.</div>
              <div>Participation (not normalized): score = (roundsPlayed / totalRoundsInSeason) * 100.</div>
            </div>
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

        <div className="compare-analysis-mobile-list" style={{ marginTop: 14 }}>
          {analysisRanking.map((entry, index) => {
            const row = fieldSummaryByName[entry.name];
            const isSelected = selected.includes(entry.name);
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
                <div className="compare-analysis-mobile-metrics">
                  {radarModel.metricDefinitions.map((metric) => (
                    <span key={`metric-chip-${entry.name}-${metric.id}`} className="compare-analysis-metric-chip">
                      {metric.id === 'eventWins'
                        ? `${metric.label}: ${entry.metricRawCounts.eventWins}`
                        : metric.id === 'topThreeRate'
                          ? `${metric.label}: ${entry.metricRawCounts.topThreeRate}`
                          : metric.id === 'topFiveRate'
                            ? `${metric.label}: ${entry.metricRawCounts.topFiveRate}`
                          : `${metric.label}: ${Math.round((entry.metricScores[metric.id] as number) ?? 0)}`}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
