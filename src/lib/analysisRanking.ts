import type { AnalysisMetricKey, CourseConfig, EventData, LeagueAnalysisSettings } from '../types/golf';
import { buildComparePlayerRows } from './analytics';
import { computeBreakdown, getParsForNine } from './scoring';

const METRIC_IDS: AnalysisMetricKey[] = [
  'pointsForm',
  'netScoring',
  'grossScoring',
  'consistency',
  'birdieRate',
  'damageControl',
  'blowupAvoidance',
  'participation',
  'parEfficiency',
  'eventWins',
  'topThreeRate',
  'topFiveRate',
  'clutchPerformance',
  'bounceBack',
  'cleanCard',
  'ceilingFloor',
  'handicapOutperformance',
  'momentum',
  'clutchFactor',
];

type SummaryRow = {
  name: string;
  eventsPlayed: number;
  avgPoints: number | null;
  avgGross: number | null;
  avgNet: number | null;
  scoreStdDev: number | null;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  tripleBogeys: number;
  others: number;
  totalTrackedHoles: number;
  parEfficiency: number;
  eventWinsCount: number;
  topThreeCount: number;
  topFiveCount: number;
  clutchPerformance: number;
  bounceBackRate: number;
  bounceBackSuccess: number;
  bounceBackOpportunities: number;
  cleanCardCount: number;
  ceilingFloorSpread: number;
  bestRoundScore: number | null;
  worstRoundScore: number | null;
  handicapOutperformance: number;
  momentum: number;
  clutchFactor: number;
};

export type MetricRank = { rank: number; total: number };

export type LeagueAnalysisEntry = {
  name: string;
  overallScore: number;
  stars: number;
  metricScores: Record<AnalysisMetricKey, number>;
  metricRawCounts: {
    eventWins: number;
    topThreeRate: number;
    topFiveRate: number;
    cleanCard: number;
  };
};

export type LeagueAnalysisRankingResult = {
  ranking: LeagueAnalysisEntry[];
  overallRankByPlayer: Record<string, MetricRank>;
  metricRanksByMetricId: Record<AnalysisMetricKey, Record<string, MetricRank>>;
};

function scoreToStars(score: number): number {
  const normalized = Math.max(0, Math.min(100, score));
  return Math.round((normalized / 20) * 2) / 2;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function splitAverage(values: number[], start: number, end: number): number | null {
  const subset = values.slice(start, end);
  return subset.length ? subset.reduce((sum, value) => sum + value, 0) / subset.length : null;
}

function stdDev(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function normalize(valuesByPlayer: Record<string, number>, domainNames: string[], allNames: string[], invert = false): Record<string, number> {
  const vals = domainNames
    .map((name) => valuesByPlayer[name])
    .filter((value) => Number.isFinite(value));

  if (!vals.length) {
    return Object.fromEntries(allNames.map((name) => [name, 0]));
  }

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (Math.abs(max - min) < 1e-9) {
    return Object.fromEntries(allNames.map((name) => [name, 100]));
  }

  return Object.fromEntries(allNames.map((name) => {
    const value = valuesByPlayer[name];
    if (!Number.isFinite(value)) return [name, 0];
    const ratio = (value - min) / (max - min);
    const normalized = invert ? 1 - ratio : ratio;
    return [name, Math.round(normalized * 100)];
  }));
}

function buildRankMap(scoresByPlayer: Record<string, number>): Record<string, MetricRank> {
  const sortable = Object.entries(scoresByPlayer)
    .filter(([, score]) => Number.isFinite(score))
    .sort((a, b) => b[1] - a[1]);

  const total = sortable.length;
  const rankByPlayer: Record<string, MetricRank> = {};

  sortable.forEach(([name, score]) => {
    const rank = sortable.findIndex(([, value]) => Math.abs(value - score) < 1e-9) + 1;
    rankByPlayer[name] = { rank, total };
  });

  return rankByPlayer;
}

function summarizePlayers(eventSource: EventData[], names: string[], sourceRows: ReturnType<typeof buildComparePlayerRows>, courseConfig: CourseConfig | null): SummaryRow[] {
  return names.map((name) => {
    const playerRows = sourceRows
      .filter((row) => row.playerName === name && row.points !== null)
      .sort((a, b) => a.eventNumber - b.eventNumber);

    const points = playerRows.map((row) => row.points ?? 0);
    const roundScores = playerRows
      .map((row) => (row.netScore !== null ? row.netScore : row.grossScore))
      .filter((value): value is number => value !== null);
    const gross = playerRows.map((row) => row.grossScore).filter((value): value is number => value !== null);
    const net = playerRows.map((row) => row.netScore).filter((value): value is number => value !== null);

    let attendedEvents = 0;
    let birdies = 0;
    let pars = 0;
    let bogeys = 0;
    let doubleBogeys = 0;
    let tripleBogeys = 0;
    let others = 0;
    let totalTrackedHoles = 0;
    let eventWinsByPoints = 0;
    let topThreeByPoints = 0;
    let topFiveByPoints = 0;
    let clutchDiffTotal = 0;
    let clutchHoleCount = 0;
    let bounceBackSuccess = 0;
    let bounceBackOpportunities = 0;
    let cleanCardCount = 0;
    const handicapOutperformanceValues: number[] = [];
    let bestRoundScore: number | null = null;
    let worstRoundScore: number | null = null;

    for (const event of eventSource) {
      const player = event.players.find((x) => x.playerName === name && !x.didNotPlay);
      if (!player) continue;
      attendedEvents += 1;

      const activeEventPlayers = event.players.filter((x) => !x.didNotPlay);
      const maxPoints = activeEventPlayers.reduce((max, p) => Math.max(max, p.points), Number.NEGATIVE_INFINITY);
      if (Number.isFinite(maxPoints) && player.points === maxPoints) {
        eventWinsByPoints += 1;
      }
      const pointsRank = activeEventPlayers.filter((p) => p.points > player.points).length + 1;
      if (pointsRank <= 3) topThreeByPoints += 1;
      if (pointsRank <= 5) topFiveByPoints += 1;

      const comparableRoundScore = player.netScore ?? player.grossScore;
      if (comparableRoundScore !== null) {
        bestRoundScore = bestRoundScore === null ? comparableRoundScore : Math.min(bestRoundScore, comparableRoundScore);
        worstRoundScore = worstRoundScore === null ? comparableRoundScore : Math.max(worstRoundScore, comparableRoundScore);
      }

      if (courseConfig) {
        const parsForNine = getParsForNine(courseConfig, event.nineHoles);
        const breakdown = computeBreakdown(player.holes, parsForNine);

        birdies += breakdown.birdies;
        pars += breakdown.pars;
        bogeys += breakdown.bogeys;
        doubleBogeys += breakdown.doubleBogeys;
        tripleBogeys += breakdown.tripleBogeys;
        others += breakdown.other;

        const totalPar = parsForNine.reduce((sum, par) => sum + par, 0);
        if (player.netScore !== null) {
          handicapOutperformanceValues.push(totalPar - player.netScore);
        }

        const holeDiffs = player.holes.map((score, index) => (score === null ? null : score - parsForNine[index]));
        let hasDoublePlus = false;

        holeDiffs.forEach((diff, index) => {
          if (diff === null) return;
          totalTrackedHoles += 1;
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
        birdies += player.birdies;
        pars += player.pars;
        bogeys += player.bogeys;
        doubleBogeys += player.doubleBogeys;
        tripleBogeys += player.tripleBogeys;
        others += player.other;
        totalTrackedHoles += player.birdies + player.pars + player.bogeys + player.doubleBogeys + player.tripleBogeys + player.other;
        if (player.doubleBogeys + player.tripleBogeys + player.other === 0) cleanCardCount += 1;
      }
    }

    const halfSplit = Math.floor(points.length / 2);
    const firstHalfAvg = splitAverage(points, 0, Math.max(1, halfSplit));
    const secondHalfAvg = splitAverage(points, Math.max(halfSplit, 1), points.length);
    const recentWindowSize = Math.min(3, points.length);
    const recentAvg = recentWindowSize > 0 ? splitAverage(points, points.length - recentWindowSize, points.length) : null;
    const avgPoints = average(points);

    return {
      name,
      eventsPlayed: attendedEvents,
      avgPoints,
      avgGross: average(gross),
      avgNet: average(net),
      scoreStdDev: stdDev(roundScores),
      birdies,
      pars,
      bogeys,
      doubleBogeys,
      tripleBogeys,
      others,
      totalTrackedHoles,
      parEfficiency: totalTrackedHoles > 0 ? pars / totalTrackedHoles : Number.NaN,
      eventWinsCount: eventWinsByPoints,
      topThreeCount: topThreeByPoints,
      topFiveCount: topFiveByPoints,
      clutchPerformance: clutchHoleCount > 0 ? clutchDiffTotal / clutchHoleCount : Number.NaN,
      bounceBackRate: bounceBackOpportunities > 0 ? bounceBackSuccess / bounceBackOpportunities : Number.NaN,
      bounceBackSuccess,
      bounceBackOpportunities,
      cleanCardCount,
      ceilingFloorSpread: bestRoundScore !== null && worstRoundScore !== null ? worstRoundScore - bestRoundScore : Number.NaN,
      bestRoundScore,
      worstRoundScore,
      handicapOutperformance: handicapOutperformanceValues.length
        ? handicapOutperformanceValues.reduce((sum, value) => sum + value, 0) / handicapOutperformanceValues.length
        : Number.NaN,
      momentum: firstHalfAvg !== null && secondHalfAvg !== null ? secondHalfAvg - firstHalfAvg : Number.NaN,
      clutchFactor: recentAvg !== null && avgPoints !== null ? recentAvg - avgPoints : Number.NaN,
    };
  });
}

export function buildLeagueAnalysisRanking(
  events: EventData[],
  courseConfig: CourseConfig | null,
  analysisSettings: LeagueAnalysisSettings,
): LeagueAnalysisRankingResult {
  const sortedEvents = [...events].sort((a, b) => a.eventNumber - b.eventNumber);
  const players = Array.from(new Set(
    sortedEvents.flatMap((event) => event.players.filter((p) => !p.didNotPlay).map((p) => p.playerName)),
  )).sort();

  if (!players.length) {
    return {
      ranking: [],
      overallRankByPlayer: {},
      metricRanksByMetricId: Object.fromEntries(METRIC_IDS.map((id) => [id, {}])) as Record<AnalysisMetricKey, Record<string, MetricRank>>,
    };
  }

  const rows = buildComparePlayerRows(sortedEvents, players);
  const summaries = summarizePlayers(sortedEvents, players, rows, courseConfig);
  const names = summaries.map((row) => row.name);

  const seasonRoundsTotal = Math.max(sortedEvents.length, 1);

  const pointsByPlayer = Object.fromEntries(summaries.map((row) => [row.name, row.avgPoints ?? 0]));
  const netByPlayer = Object.fromEntries(summaries.map((row) => [row.name, row.avgNet ?? Number.NaN]));
  const grossByPlayer = Object.fromEntries(summaries.map((row) => [row.name, row.avgGross ?? Number.NaN]));
  const consistencyByPlayer = Object.fromEntries(summaries.map((row) => [row.name, row.scoreStdDev ?? Number.NaN]));
  const roundsByPlayer = Object.fromEntries(summaries.map((row) => [row.name, row.eventsPlayed / seasonRoundsTotal]));
  const birdieRateByPlayer = Object.fromEntries(summaries.map((row) => [row.name, row.totalTrackedHoles > 0 ? row.birdies / row.totalTrackedHoles : Number.NaN]));
  const damageControlByPlayer = Object.fromEntries(summaries.map((row) => {
    if (!row.totalTrackedHoles) return [row.name, Number.NaN];
    const weightedPenalty = (row.bogeys * 1) + (row.doubleBogeys * 2) + (row.tripleBogeys * 3) + (row.others * 4);
    return [row.name, 1 - (weightedPenalty / (row.totalTrackedHoles * 4))];
  }));
  const blowupAvoidanceByPlayer = Object.fromEntries(summaries.map((row) => {
    if (!row.totalTrackedHoles) return [row.name, Number.NaN];
    const blowupHoles = row.doubleBogeys + row.tripleBogeys + row.others;
    return [row.name, 1 - (blowupHoles / row.totalTrackedHoles)];
  }));
  const parEfficiencyByPlayer = Object.fromEntries(summaries.map((row) => [row.name, row.parEfficiency]));
  const eventWinsByPlayer = Object.fromEntries(summaries.map((row) => [row.name, row.eventWinsCount]));
  const topThreeByPlayer = Object.fromEntries(summaries.map((row) => [row.name, row.topThreeCount]));
  const topFiveByPlayer = Object.fromEntries(summaries.map((row) => [row.name, row.topFiveCount]));
  const clutchPerformanceByPlayer = Object.fromEntries(summaries.map((row) => [row.name, row.clutchPerformance]));
  const bounceBackByPlayer = Object.fromEntries(summaries.map((row) => [row.name, row.bounceBackRate]));
  const cleanCardByPlayer = Object.fromEntries(summaries.map((row) => [row.name, row.cleanCardCount]));
  const ceilingFloorByPlayer = Object.fromEntries(summaries.map((row) => [row.name, row.ceilingFloorSpread]));
  const handicapOutperformanceByPlayer = Object.fromEntries(summaries.map((row) => [row.name, row.handicapOutperformance]));
  const momentumByPlayer = Object.fromEntries(summaries.map((row) => [row.name, row.momentum]));
  const clutchFactorByPlayer = Object.fromEntries(summaries.map((row) => [row.name, row.clutchFactor]));

  const pointsScore = normalize(pointsByPlayer, names, names);
  const netScore = normalize(netByPlayer, names, names, true);
  const grossScore = normalize(grossByPlayer, names, names, true);
  const fieldConsistencyScore = normalize(consistencyByPlayer, names, names, true);
  const consistencyScore = Object.fromEntries(names.map((name) => {
    const stdev = consistencyByPlayer[name];
    if (!Number.isFinite(stdev)) return [name, 0];
    return [name, Math.max(10, fieldConsistencyScore[name] ?? 0)];
  }));
  const roundsScore = Object.fromEntries(names.map((name) => [name, Math.round((roundsByPlayer[name] ?? 0) * 100)]));
  const birdieRateScore = normalize(birdieRateByPlayer, names, names);
  const damageControlScore = normalize(damageControlByPlayer, names, names);
  const blowupAvoidanceScore = normalize(blowupAvoidanceByPlayer, names, names);
  const parEfficiencyScore = normalize(parEfficiencyByPlayer, names, names);
  const eventWinsScore = normalize(eventWinsByPlayer, names, names);
  const topThreeRateScore = normalize(topThreeByPlayer, names, names);
  const topFiveRateScore = normalize(topFiveByPlayer, names, names);
  const clutchPerformanceScore = normalize(clutchPerformanceByPlayer, names, names, true);
  const bounceBackScore = normalize(bounceBackByPlayer, names, names);
  const cleanCardScore = normalize(cleanCardByPlayer, names, names);
  const ceilingFloorScore = normalize(ceilingFloorByPlayer, names, names, true);
  const handicapOutperformanceScore = normalize(handicapOutperformanceByPlayer, names, names);
  const momentumScore = normalize(momentumByPlayer, names, names);
  const clutchFactorScore = normalize(clutchFactorByPlayer, names, names);

  const scoresByMetricId: Record<AnalysisMetricKey, Record<string, number>> = {
    pointsForm: pointsScore,
    netScoring: netScore,
    grossScoring: grossScore,
    consistency: consistencyScore,
    birdieRate: birdieRateScore,
    damageControl: damageControlScore,
    blowupAvoidance: blowupAvoidanceScore,
    participation: roundsScore,
    parEfficiency: parEfficiencyScore,
    eventWins: eventWinsScore,
    topThreeRate: topThreeRateScore,
    topFiveRate: topFiveRateScore,
    clutchPerformance: clutchPerformanceScore,
    bounceBack: bounceBackScore,
    cleanCard: cleanCardScore,
    ceilingFloor: ceilingFloorScore,
    handicapOutperformance: handicapOutperformanceScore,
    momentum: momentumScore,
    clutchFactor: clutchFactorScore,
  };

  const metricWeights: Record<AnalysisMetricKey, number> = {
    pointsForm: analysisSettings.weights.pointsForm ?? 0.18,
    netScoring: analysisSettings.weights.netScoring ?? 0.14,
    grossScoring: analysisSettings.weights.grossScoring ?? 0.1,
    consistency: analysisSettings.weights.consistency ?? 0.1,
    birdieRate: analysisSettings.weights.birdieRate ?? 0.07,
    damageControl: analysisSettings.weights.damageControl ?? 0.07,
    blowupAvoidance: analysisSettings.weights.blowupAvoidance ?? 0.06,
    participation: analysisSettings.weights.participation ?? 0.04,
    parEfficiency: analysisSettings.weights.parEfficiency ?? 0.06,
    eventWins: analysisSettings.weights.eventWins ?? 0.05,
    topThreeRate: analysisSettings.weights.topThreeRate ?? 0.05,
    topFiveRate: analysisSettings.weights.topFiveRate ?? 0.04,
    clutchPerformance: analysisSettings.weights.clutchPerformance ?? 0.05,
    bounceBack: analysisSettings.weights.bounceBack ?? 0.04,
    cleanCard: analysisSettings.weights.cleanCard ?? 0.04,
    ceilingFloor: analysisSettings.weights.ceilingFloor ?? 0.04,
    handicapOutperformance: analysisSettings.weights.handicapOutperformance ?? 0.06,
    momentum: analysisSettings.weights.momentum ?? 0.04,
    clutchFactor: analysisSettings.weights.clutchFactor ?? 0.03,
  };

  const metricWeightSum = METRIC_IDS.reduce((sum, id) => sum + metricWeights[id], 0);

  const ranking: LeagueAnalysisEntry[] = summaries
    .map((summary) => {
      const metricScores = Object.fromEntries(METRIC_IDS.map((id) => [id, scoresByMetricId[id][summary.name] ?? 0])) as Record<AnalysisMetricKey, number>;
      const weightedSum = METRIC_IDS.reduce((sum, id) => sum + (metricScores[id] * metricWeights[id]), 0);
      const overallScore = weightedSum / (metricWeightSum || 1);

      return {
        name: summary.name,
        overallScore,
        stars: scoreToStars(overallScore),
        metricScores,
        metricRawCounts: {
          eventWins: summary.eventWinsCount,
          topThreeRate: summary.topThreeCount,
          topFiveRate: summary.topFiveCount,
          cleanCard: summary.cleanCardCount,
        },
      };
    })
    .sort((a, b) => b.overallScore - a.overallScore || a.name.localeCompare(b.name));

  const overallRankByPlayer = buildRankMap(Object.fromEntries(ranking.map((entry) => [entry.name, entry.overallScore])));
  const metricRanksByMetricId = Object.fromEntries(
    METRIC_IDS.map((id) => [id, buildRankMap(scoresByMetricId[id])]),
  ) as Record<AnalysisMetricKey, Record<string, MetricRank>>;

  return {
    ranking,
    overallRankByPlayer,
    metricRanksByMetricId,
  };
}
