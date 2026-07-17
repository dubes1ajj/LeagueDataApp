import { describe, expect, it } from 'vitest';
import { buildLeagueAnalysisRanking } from '../src/lib/analysisRanking';
import type { AnalysisMetricKey, EventData, LeagueAnalysisSettings, PlayerEventData } from '../src/types/golf';

const ALL_METRICS: AnalysisMetricKey[] = [
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

function buildSettings(overrides: Partial<Record<AnalysisMetricKey, number>>): LeagueAnalysisSettings {
  const weights = Object.fromEntries(ALL_METRICS.map((id) => [id, 0])) as Record<AnalysisMetricKey, number>;
  Object.assign(weights, overrides);
  return { weights };
}

type EventPlayerInput = {
  name: string;
  points: number;
  gross: number | null;
  net: number | null;
  cumulativePoints?: number;
  didNotPlay?: boolean;
};

function createPlayer(input: EventPlayerInput): PlayerEventData {
  const didNotPlay = input.didNotPlay ?? false;
  return {
    position: 0,
    playerName: input.name,
    holes: Array.from({ length: 9 }, () => null),
    grossScore: input.gross,
    handicap: 0,
    netScore: input.net,
    points: didNotPlay ? 0 : input.points,
    bonusPoints: 0,
    totalPoints: didNotPlay ? 0 : input.points,
    eagles: 0,
    birdies: didNotPlay ? 0 : 1,
    pars: didNotPlay ? 0 : 5,
    bogeys: didNotPlay ? 0 : 3,
    doubleBogeys: 0,
    tripleBogeys: 0,
    other: 0,
    didNotPlay,
  };
}

function createEvent(eventNumber: number, players: EventPlayerInput[]): EventData {
  const playerRows = players.map(createPlayer);
  const standings = [...players]
    .sort((a, b) => (b.cumulativePoints ?? b.points) - (a.cumulativePoints ?? a.points) || a.name.localeCompare(b.name))
    .map((player, index) => ({
      playerName: player.name,
      cumulativePoints: player.cumulativePoints ?? player.points,
      position: index + 1,
    }));

  return {
    id: `event-${eventNumber}`,
    eventNumber,
    eventDate: `2026-01-${String(eventNumber).padStart(2, '0')}`,
    nineHoles: 'front',
    players: playerRows,
    standings,
  };
}

function getEntry(result: ReturnType<typeof buildLeagueAnalysisRanking>, name: string) {
  const entry = result.ranking.find((row) => row.name === name);
  if (!entry) throw new Error(`Missing ranking entry for ${name}`);
  return entry;
}

describe('buildLeagueAnalysisRanking', () => {
  it('assigns tied overall ranks when overall scores are equal', () => {
    const settings = buildSettings({ pointsForm: 1 });
    const events = [
      createEvent(1, [
        { name: 'Alpha', points: 10, gross: 40, net: 35 },
        { name: 'Bravo', points: 10, gross: 40, net: 35 },
      ]),
    ];

    const result = buildLeagueAnalysisRanking(events, null, settings);
    const alpha = getEntry(result, 'Alpha');
    const bravo = getEntry(result, 'Bravo');

    expect(alpha.overallScore).toBe(bravo.overallScore);
    expect(result.overallRankByPlayer.Alpha).toEqual({ rank: 1, total: 2 });
    expect(result.overallRankByPlayer.Bravo).toEqual({ rank: 1, total: 2 });
  });

  it('normalizes inverted metrics so lower net/gross scores rank higher', () => {
    const settings = buildSettings({ pointsForm: 1 });
    const events = [
      createEvent(1, [
        { name: 'LowerScore', points: 5, gross: 34, net: 30 },
        { name: 'HigherScore', points: 5, gross: 44, net: 40 },
      ]),
    ];

    const result = buildLeagueAnalysisRanking(events, null, settings);
    const lower = getEntry(result, 'LowerScore');
    const higher = getEntry(result, 'HigherScore');

    expect(lower.metricScores.netScoring).toBeGreaterThan(higher.metricScores.netScoring);
    expect(lower.metricScores.grossScoring).toBeGreaterThan(higher.metricScores.grossScoring);
  });

  it('computes weighted overall score from the configured metrics', () => {
    const settings = buildSettings({ pointsForm: 1 });
    const events = [
      createEvent(1, [
        { name: 'A', points: 10, gross: 35, net: 31 },
        { name: 'B', points: 5, gross: 37, net: 33 },
        { name: 'C', points: 0, gross: 39, net: 35 },
      ]),
    ];

    const result = buildLeagueAnalysisRanking(events, null, settings);
    for (const entry of result.ranking) {
      expect(entry.overallScore).toBe(entry.metricScores.pointsForm);
    }
  });

  it('changes scores when event scope changes', () => {
    const settings = buildSettings({ pointsForm: 1 });
    const event1 = createEvent(1, [
      { name: 'Alpha', points: 10, gross: 36, net: 32, cumulativePoints: 10 },
      { name: 'Bravo', points: 5, gross: 38, net: 34, cumulativePoints: 5 },
      { name: 'Charlie', points: 0, gross: 40, net: 36, cumulativePoints: 0 },
    ]);
    const event2 = createEvent(2, [
      { name: 'Alpha', points: 0, gross: 40, net: 36, cumulativePoints: 10 },
      { name: 'Bravo', points: 10, gross: 35, net: 31, cumulativePoints: 15 },
      { name: 'Charlie', points: 0, gross: 41, net: 37, cumulativePoints: 0 },
    ]);

    const firstScope = buildLeagueAnalysisRanking([event1], null, settings);
    const fullScope = buildLeagueAnalysisRanking([event1, event2], null, settings);

    expect(getEntry(fullScope, 'Alpha').overallScore).toBeLessThan(getEntry(firstScope, 'Alpha').overallScore);
    expect(getEntry(fullScope, 'Bravo').overallScore).toBeGreaterThan(getEntry(firstScope, 'Bravo').overallScore);
  });

  it('maps composite scores to half-star thresholds', () => {
    const settings = buildSettings({ pointsForm: 1 });
    const events = [
      createEvent(1, [
        { name: 'FiveStar', points: 10, gross: 35, net: 31 },
        { name: 'TwoAndHalfStar', points: 5, gross: 37, net: 33 },
        { name: 'ZeroStar', points: 0, gross: 39, net: 35 },
      ]),
    ];

    const result = buildLeagueAnalysisRanking(events, null, settings);

    expect(getEntry(result, 'FiveStar').stars).toBe(5);
    expect(getEntry(result, 'TwoAndHalfStar').stars).toBe(2.5);
    expect(getEntry(result, 'ZeroStar').stars).toBe(0);
  });
});
