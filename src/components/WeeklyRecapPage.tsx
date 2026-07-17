import { memo, useMemo, useState } from 'react';
import type { EventData, CourseConfig } from '../types/golf';
import { buildWeeklyRecaps } from '../lib/analytics';
import { buildDisplayNames } from '../lib/displayNames';
import { computeBreakdown, getParsForNine } from '../lib/scoring';
import { getEventDisplayName } from '../lib/eventNames';
import { formatEventDateDisplay } from '../lib/eventDateDisplay';

interface WeeklyRecapPageProps {
  events: EventData[];
  courseConfig: CourseConfig | null;
  onPlayerClick?: (playerName: string) => void;
  onHoleClick?: (holeNum: number, nine: 'front' | 'back') => void;
}

interface LeaderboardTableRow {
  rank: number;
  playerName: string;
  displayName: string;
  value: string;
  detail?: string;
}

interface LeaderboardTableCard {
  title: string;
  subtitle?: string;
  rows: LeaderboardTableRow[];
  hideDetailColumn?: boolean;
}

function formatPlayerNames(playerNames: string[]): string {
  const shortNames = playerNames.map(name => name.split(',')[0]);
  if (shortNames.length <= 2) return shortNames.join(' & ');
  return `${shortNames.slice(0, -1).join(', ')} & ${shortNames[shortNames.length - 1]}`;
}

function buildLeaderboardRows<T>(
  items: T[],
  getPlayerName: (item: T) => string,
  getDisplayName: (item: T) => string,
  getScore: (item: T) => number | null,
  sortDirection: 'asc' | 'desc',
  formatValue: (item: T) => string,
  formatDetail?: (item: T) => string | undefined,
) {
  const scored = items
    .map((item) => ({ item, score: getScore(item) }))
    .filter((entry): entry is { item: T; score: number } => entry.score !== null && Number.isFinite(entry.score));

  scored.sort((a, b) => {
    const primary = sortDirection === 'asc' ? a.score - b.score : b.score - a.score;
    if (primary !== 0) return primary;
    return getDisplayName(a.item).localeCompare(getDisplayName(b.item));
  });

  let previousScore: number | null = null;
  let previousRank = 1;
  return scored.slice(0, 5).map((entry, index) => {
    const rank = previousScore !== null && Math.abs(entry.score - previousScore) < 1e-9 ? previousRank : index + 1;
    previousScore = entry.score;
    previousRank = rank;
    return {
      rank,
      playerName: getPlayerName(entry.item),
      displayName: getDisplayName(entry.item),
      value: formatValue(entry.item),
      detail: formatDetail?.(entry.item),
    };
  });
}

function LeaderboardTable({ card, onPlayerClick }: { card: LeaderboardTableCard; onPlayerClick?: (playerName: string) => void }) {
  return (
    <div className="recap-chart-card recap-leaderboard-card">
      <p className="pp-chart-label">{card.title}</p>
      {card.subtitle ? <p className="recap-leaderboard-subtitle">{card.subtitle}</p> : null}
      {card.rows.length ? (
        <div className="pp-scorecard-wrap">
          <table className="pp-scorecard recap-leaderboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th className="pp-sc-label">Player</th>
                <th>Value</th>
                {!card.hideDetailColumn ? <th>Detail</th> : null}
              </tr>
            </thead>
            <tbody>
              {card.rows.map((row, index) => (
                <tr key={`${card.title}-${row.playerName}-${index}`} className={index % 2 === 0 ? '' : 'pp-sc-row'}>
                  <td className="pp-sc-hole-cell" style={{ fontWeight: 700 }}>{row.rank}</td>
                  <td className="pp-sc-label">
                    {onPlayerClick ? (
                      <button
                        className="icon-btn"
                        style={{ width: 'auto', height: 'auto', padding: 0, color: 'var(--text)', textDecoration: 'underline' }}
                        onClick={() => onPlayerClick(row.playerName)}
                        title={`View ${row.playerName} profile`}
                      >
                        {row.displayName}
                      </button>
                    ) : row.displayName}
                  </td>
                  <td className="pp-sc-total">{row.value}</td>
                  {!card.hideDetailColumn ? <td className="recap-leaderboard-detail">{row.detail ?? '—'}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="pp-no-course">No data for this metric yet.</p>
      )}
    </div>
  );
}

export default memo(function WeeklyRecapPage({ events, courseConfig, onPlayerClick, onHoleClick }: WeeklyRecapPageProps) {
  const recaps = useMemo(() => buildWeeklyRecaps(events, courseConfig), [events, courseConfig]);
  const [eventNumber, setEventNumber] = useState<number | null>(() => recaps.at(-1)?.eventNumber ?? null);
  const sortedEvents = useMemo(() => [...events].sort((a, b) => a.eventNumber - b.eventNumber), [events]);

  const recap = recaps.find(r => r.eventNumber === eventNumber) ?? recaps.at(-1) ?? null;
  const eventNameByNumber = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of events) {
      map.set(item.eventNumber, getEventDisplayName(item));
    }
    return map;
  }, [events]);
  const event = useMemo(
    () => (recap ? events.find(item => item.eventNumber === recap.eventNumber) ?? null : null),
    [events, recap]
  );
  const recapNine = event?.nineHoles ?? 'front';
  const previousEvent = useMemo(() => {
    if (!event) return null;
    const eventIndex = sortedEvents.findIndex((item) => item.id === event.id);
    return eventIndex > 0 ? sortedEvents[eventIndex - 1] : null;
  }, [event, sortedEvents]);

  const activePlayers = useMemo(
    () => event?.players.filter(player => !player.didNotPlay) ?? [],
    [event]
  );
  const displayNames = useMemo(
    () => buildDisplayNames(activePlayers.map((player) => player.playerName)),
    [activePlayers]
  );

  const recapStats = useMemo(() => {
    if (!event) return null;

    const points = activePlayers.map(player => player.points);
    const netScores = activePlayers.map(player => player.netScore).filter((score): score is number => score !== null);
    const grossScores = activePlayers.map(player => player.grossScore).filter((score): score is number => score !== null);

    let totalBirdies = 0;
    for (const player of activePlayers) {
      if (courseConfig) {
        totalBirdies += computeBreakdown(player.holes, getParsForNine(courseConfig, event.nineHoles)).birdies;
      } else {
        totalBirdies += player.birdies;
      }
    }

    return {
      fieldSize: activePlayers.length,
      totalBirdies,
      pointsSpread: points.length ? Math.max(...points) - Math.min(...points) : null,
      netSpread: netScores.length ? Math.max(...netScores) - Math.min(...netScores) : null,
      grossSpread: grossScores.length ? Math.max(...grossScores) - Math.min(...grossScores) : null,
    };
  }, [activePlayers, courseConfig, event]);

  const pointsLeaderboard = useMemo(() => {
    return [...activePlayers]
      .sort((a, b) => b.points - a.points || (a.netScore ?? 999) - (b.netScore ?? 999) || a.playerName.localeCompare(b.playerName))
      .map(player => ({
        playerName: player.playerName,
        shortName: displayNames[player.playerName] ?? player.playerName.split(',')[0],
        points: player.points,
        netScore: player.netScore,
        grossScore: player.grossScore,
      }));
  }, [activePlayers, displayNames]);

  const roundPlayerStats = useMemo(() => {
    if (!event || !activePlayers.length) return [] as Array<{
      playerName: string;
      displayName: string;
      bogeysOrWorse: number;
      volatility: number;
      worstVsPar: number;
      netScore: number | null;
      points: number;
      grossScore: number | null;
    }>;

    const pars = courseConfig ? getParsForNine(courseConfig, event.nineHoles) : null;

    return activePlayers.map((player) => {
      const scores = player.holes.filter((score): score is number => score !== null && score !== undefined);
      const breakdown = pars
        ? computeBreakdown(player.holes, pars)
        : {
            birdies: player.birdies,
            pars: player.pars,
            bogeys: player.bogeys,
            doubleBogeys: player.doubleBogeys,
            tripleBogeys: player.tripleBogeys,
            other: player.other,
          };

      const bogeysOrWorse = breakdown.bogeys + breakdown.doubleBogeys + breakdown.tripleBogeys + breakdown.other;
      const volatility = scores.length ? Math.max(...scores) - Math.min(...scores) : 0;

      const worstVsPar = pars
        ? player.holes.reduce<number>((worst, score, holeIndex) => {
          if (score === null || score === undefined) return worst;
          return Math.max(worst, score - pars[holeIndex]);
        }, 0)
        : (scores.length ? Math.max(...scores) - Math.min(...scores) : 0);

      return {
        playerName: player.playerName,
        displayName: displayNames[player.playerName] ?? player.playerName.split(',')[0],
        bogeysOrWorse,
        volatility,
        worstVsPar,
        netScore: player.netScore,
        points: player.points,
        grossScore: player.grossScore,
      };
    });
  }, [activePlayers, courseConfig, displayNames, event]);

  const funnyRecap = useMemo(() => {
    if (!roundPlayerStats.length) return null;

    const troubleCount = Math.max(...roundPlayerStats.map((player) => player.bogeysOrWorse), Number.NEGATIVE_INFINITY);
    const troubleMagnet = Number.isFinite(troubleCount)
      ? roundPlayerStats.filter((player) => player.bogeysOrWorse === troubleCount).map((player) => player.playerName)
      : [];

    const volatilityValue = Math.max(...roundPlayerStats.map((player) => player.volatility), Number.NEGATIVE_INFINITY);
    const rollercoaster = Number.isFinite(volatilityValue)
      ? roundPlayerStats.filter((player) => player.volatility === volatilityValue).map((player) => player.playerName)
      : [];

    const worstHoleValue = Math.max(...roundPlayerStats.map((player) => player.worstVsPar), Number.NEGATIVE_INFINITY);
    const disasterArtists = Number.isFinite(worstHoleValue)
      ? roundPlayerStats.filter((player) => player.worstVsPar === worstHoleValue).map((player) => player.playerName)
      : [];

    const sortedNet = roundPlayerStats
      .filter((player): player is typeof player & { netScore: number } => player.netScore !== null)
      .sort((a, b) => a.netScore - b.netScore);

    let closestDuel: { playerNames: string[]; gap: number } | null = null;
    for (let index = 1; index < sortedNet.length; index++) {
      const current = sortedNet[index];
      const previous = sortedNet[index - 1];
      const gap = current.netScore - previous.netScore;
      if (!closestDuel || gap < closestDuel.gap) {
        closestDuel = { playerNames: [previous.playerName, current.playerName], gap };
      }
    }

    return {
      closestDuel,
      troubleMagnet: troubleMagnet.length ? { playerNames: troubleMagnet, count: troubleCount } : null,
      rollercoaster: rollercoaster.length ? { playerNames: rollercoaster, spread: volatilityValue } : null,
      disasterArtists: disasterArtists.length ? { playerNames: disasterArtists, worstVsPar: worstHoleValue } : null,
    };
  }, [roundPlayerStats]);

  const holeDifficultyData = useMemo(() => {
    if (!event || !courseConfig) return [];

    const pars = getParsForNine(courseConfig, event.nineHoles);
    const startHole = event.nineHoles === 'back' ? 10 : 1;
    const scorecardHoles = courseConfig.holes.slice(startHole - 1, startHole + 8);

    return pars.map((par, holeIndex) => {
      const scorecardHole = scorecardHoles[holeIndex];
      const scores = activePlayers
        .map(player => player.holes[holeIndex])
        .filter((score): score is number => score !== null && score !== undefined);

      if (!scores.length) {
        return {
          hole: `${startHole + holeIndex}`,
          avgVsPar: 0,
          avgScore: null,
          bestScore: null,
          worstScore: null,
          par,
          yardage: scorecardHole?.yardage ?? null,
          strokeIndex: scorecardHole?.strokeIndex ?? null,
        };
      }

      const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      return {
        hole: `${startHole + holeIndex}`,
        avgVsPar: Math.round((avgScore - par) * 100) / 100,
        avgScore: Math.round(avgScore * 100) / 100,
        bestScore: Math.min(...scores),
        worstScore: Math.max(...scores),
        par,
        yardage: scorecardHole?.yardage ?? null,
        strokeIndex: scorecardHole?.strokeIndex ?? null,
      };
    });
  }, [activePlayers, courseConfig, event]);

  const eventMeta = useMemo(() => {
    if (!event) return [] as string[];

    return [
      event.eventDate || 'Date TBD',
      event.nineHoles === 'back' ? 'Back 9' : 'Front 9',
      `${activePlayers.length} players`,
    ];
  }, [activePlayers.length, event]);

  const weeklyScorecardRows = useMemo(() => {
    if (!event) return [] as Array<{
      playerName: string;
      displayName: string;
      place: number;
      holes: (number | null)[];
      grossScore: number | null;
      netScore: number | null;
      points: number;
    }>;

    return [...activePlayers]
      .sort((a, b) => b.points - a.points || (a.netScore ?? Number.POSITIVE_INFINITY) - (b.netScore ?? Number.POSITIVE_INFINITY) || a.playerName.localeCompare(b.playerName))
      .map((player, index) => ({
        playerName: player.playerName,
        displayName: displayNames[player.playerName] ?? player.playerName.split(',')[0],
        place: player.position || index + 1,
        holes: player.holes,
        grossScore: player.grossScore,
        netScore: player.netScore,
        points: player.points,
      }));
  }, [activePlayers, displayNames, event]);

  function renderPlayerNames(playerNames: string[]) {
    if (!playerNames.length) return '—';
    const shortNames = playerNames.map((name) => displayNames[name] ?? name.split(',')[0]);
    return formatPlayerNames(shortNames);
  }

  function renderHoleLabel(holeNum: number) {
    return `Hole ${holeNum}`;
  }

  function getScoreCellClass(score: number | null, par: number | null) {
    const diff = score !== null && par !== null ? score - par : null;
    if (diff === null) return '';
    if (diff <= -2) return 'pp-sc-eagle';
    if (diff === -1) return 'pp-sc-birdie';
    if (diff === 0) return 'pp-sc-par';
    if (diff === 1) return 'pp-sc-bogey';
    if (diff === 2) return 'pp-sc-dbl';
    return 'pp-sc-trpl';
  }

  const scorecardHoleHeaders = useMemo(() => {
    if (!event) return [] as number[];
    const startHole = event.nineHoles === 'back' ? 10 : 1;
    return Array.from({ length: 9 }, (_, index) => startHole + index);
  }, [event]);

  const scorecardPars = useMemo(() => {
    if (!event || !courseConfig) return null;
    return getParsForNine(courseConfig, event.nineHoles);
  }, [courseConfig, event]);

  const recapLeaderboards = useMemo(() => {
    if (!event) return null;

    const pars = courseConfig ? getParsForNine(courseConfig, event.nineHoles) : null;

    const cleanCardRows = activePlayers.map((player) => {
      const breakdown = pars
        ? computeBreakdown(player.holes, pars)
        : {
            birdies: player.birdies,
            pars: player.pars,
            bogeys: player.bogeys,
            doubleBogeys: player.doubleBogeys,
            tripleBogeys: player.tripleBogeys,
            other: player.other,
          };
      const doublePlus = breakdown.doubleBogeys + breakdown.tripleBogeys + breakdown.other;
      return {
        playerName: player.playerName,
        displayName: displayNames[player.playerName] ?? player.playerName.split(',')[0],
        doublePlus,
        bogeysOrWorse: breakdown.bogeys + doublePlus,
      };
    });

    const damageRows = activePlayers.map((player) => {
      const totalTracked = player.birdies + player.pars + player.bogeys + player.doubleBogeys + player.tripleBogeys + player.other;
      const weightedMistakePenalty = (player.bogeys * 1) + (player.doubleBogeys * 2) + (player.tripleBogeys * 3) + (player.other * 4);
      const score = totalTracked > 0 ? 1 - (weightedMistakePenalty / (totalTracked * 4)) : Number.NaN;
      return {
        playerName: player.playerName,
        displayName: displayNames[player.playerName] ?? player.playerName.split(',')[0],
        score,
      };
    });

    const bounceRows = pars ? activePlayers.map((player) => {
      const diffs = player.holes.map((score, index) => score === null ? null : score - pars[index]);
      let successes = 0;
      let chances = 0;
      for (let index = 0; index < diffs.length - 1; index += 1) {
        const currentDiff = diffs[index];
        const nextDiff = diffs[index + 1];
        if (currentDiff === null || nextDiff === null || currentDiff < 1) continue;
        chances += 1;
        if (nextDiff <= 0) successes += 1;
      }
      return {
        playerName: player.playerName,
        displayName: displayNames[player.playerName] ?? player.playerName.split(',')[0],
        chances,
        successes,
        rate: chances > 0 ? successes / chances : Number.NaN,
      };
    }) : [];

    const clutchRows = pars ? activePlayers.map((player) => {
      const closingDiffs = player.holes.slice(-3)
        .map((score, index) => score === null ? null : score - pars[pars.length - 3 + index])
        .filter((value): value is number => value !== null);
      const averageDiff = closingDiffs.length ? closingDiffs.reduce((sum, value) => sum + value, 0) / closingDiffs.length : Number.NaN;
      return {
        playerName: player.playerName,
        displayName: displayNames[player.playerName] ?? player.playerName.split(',')[0],
        averageDiff,
      };
    }) : [];

    const moverRows = event.standings.map((standing) => {
      const previousStanding = previousEvent?.standings.find((item) => item.playerName === standing.playerName) ?? null;
      const change = previousStanding ? previousStanding.position - standing.position : Number.NaN;
      return {
        playerName: standing.playerName,
        displayName: displayNames[standing.playerName] ?? standing.playerName.split(',')[0],
        change,
      };
    });

    const slideRows = event.standings.map((standing) => {
      const previousStanding = previousEvent?.standings.find((item) => item.playerName === standing.playerName) ?? null;
      const drop = previousStanding ? standing.position - previousStanding.position : Number.NaN;
      return {
        playerName: standing.playerName,
        displayName: displayNames[standing.playerName] ?? standing.playerName.split(',')[0],
        drop,
      };
    });

    return {
      eventMetrics: [
        {
          title: 'Clean Cards',
          subtitle: 'Double-plus mistakes kept off the card',
          hideDetailColumn: true,
          rows: buildLeaderboardRows(
            cleanCardRows,
            (row) => row.playerName,
            (row) => row.displayName,
            (row) => (row.doublePlus * 100) + row.bogeysOrWorse,
            'asc',
            (row) => `${row.doublePlus} double+ (${row.bogeysOrWorse} bogeys)`,
            (row) => `${row.bogeysOrWorse} bogeys or worse`
          ),
        },
        {
          title: 'Best Damage Control',
          subtitle: 'Weighted mistake control this week',
          hideDetailColumn: true,
          rows: buildLeaderboardRows(
            damageRows,
            (row) => row.playerName,
            (row) => row.displayName,
            (row) => row.score,
            'desc',
            (row) => `${(row.score * 100).toFixed(1)}`,
            () => 'weighted control'
          ),
        },
        {
          title: 'Bounce-Back Leader',
          subtitle: 'Who answered mistakes fastest',
          hideDetailColumn: true,
          rows: buildLeaderboardRows(
            bounceRows,
            (row) => row.playerName,
            (row) => row.displayName,
            (row) => row.rate,
            'desc',
            (row) => `${row.successes}/${row.chances}`,
            (row) => `${row.successes}/${row.chances}`
          ),
        },
        {
          title: 'Best Closer',
          subtitle: 'Final 3 holes vs par',
          hideDetailColumn: true,
          rows: buildLeaderboardRows(
            clutchRows,
            (row) => row.playerName,
            (row) => row.displayName,
            (row) => row.averageDiff,
            'asc',
            (row) => `${row.averageDiff >= 0 ? '+' : ''}${row.averageDiff.toFixed(2)}`,
            () => 'avg vs par'
          ),
        },
      ],
      roundLeaders: [
        {
          title: 'Most Points Gained',
          subtitle: 'Weekly points leaderboard',
          hideDetailColumn: true,
          rows: buildLeaderboardRows(
            pointsLeaderboard,
            (row) => row.playerName,
            (row) => row.shortName,
            (row) => row.points,
            'desc',
            (row) => `${row.points}`,
            (row) => `Net ${row.netScore ?? '—'} · Gross ${row.grossScore ?? '—'}`
          ),
        },
        {
          title: 'Best Net Round',
          subtitle: 'Lowest net score this week',
          hideDetailColumn: true,
          rows: buildLeaderboardRows(
            activePlayers.filter((player): player is typeof player & { netScore: number } => player.netScore !== null).map((player) => ({
              playerName: player.playerName,
              displayName: displayNames[player.playerName] ?? player.playerName.split(',')[0],
              netScore: player.netScore,
              grossScore: player.grossScore,
            })),
            (row) => row.playerName,
            (row) => row.displayName,
            (row) => row.netScore,
            'asc',
            (row) => `${row.netScore}`,
            (row) => `Gross ${row.grossScore ?? '—'}`
          ),
        },
        {
          title: 'Best Gross Round',
          subtitle: 'Lowest gross score this week',
          hideDetailColumn: true,
          rows: buildLeaderboardRows(
            activePlayers.filter((player): player is typeof player & { grossScore: number } => player.grossScore !== null).map((player) => ({
              playerName: player.playerName,
              displayName: displayNames[player.playerName] ?? player.playerName.split(',')[0],
              grossScore: player.grossScore,
              netScore: player.netScore,
            })),
            (row) => row.playerName,
            (row) => row.displayName,
            (row) => row.grossScore,
            'asc',
            (row) => `${row.grossScore}`,
            (row) => `Net ${row.netScore ?? '—'}`
          ),
        },
        {
          title: 'Biggest Mover',
          subtitle: 'Position change vs previous event',
          hideDetailColumn: true,
          rows: buildLeaderboardRows(
            moverRows,
            (row) => row.playerName,
            (row) => row.displayName,
            (row) => row.change,
            'desc',
            (row) => `${row.change > 0 ? '+' : ''}${row.change}`,
            () => 'spots'
          ),
        },
      ],
      roundStrugglers: [
        {
          title: 'Fewest Points Won',
          subtitle: 'Bottom of the points sheet',
          hideDetailColumn: true,
          rows: buildLeaderboardRows(
            pointsLeaderboard,
            (row) => row.playerName,
            (row) => row.shortName,
            (row) => row.points,
            'asc',
            (row) => `${row.points}`,
            (row) => `Net ${row.netScore ?? '—'} · Gross ${row.grossScore ?? '—'}`
          ),
        },
        {
          title: 'Toughest Net Round',
          subtitle: 'Highest net score this week',
          hideDetailColumn: true,
          rows: buildLeaderboardRows(
            activePlayers.filter((player): player is typeof player & { netScore: number } => player.netScore !== null).map((player) => ({
              playerName: player.playerName,
              displayName: displayNames[player.playerName] ?? player.playerName.split(',')[0],
              netScore: player.netScore,
              grossScore: player.grossScore,
            })),
            (row) => row.playerName,
            (row) => row.displayName,
            (row) => row.netScore,
            'desc',
            (row) => `${row.netScore}`,
            (row) => `Gross ${row.grossScore ?? '—'}`
          ),
        },
        {
          title: 'Toughest Gross Round',
          subtitle: 'Highest gross score this week',
          hideDetailColumn: true,
          rows: buildLeaderboardRows(
            activePlayers.filter((player): player is typeof player & { grossScore: number } => player.grossScore !== null).map((player) => ({
              playerName: player.playerName,
              displayName: displayNames[player.playerName] ?? player.playerName.split(',')[0],
              grossScore: player.grossScore,
              netScore: player.netScore,
            })),
            (row) => row.playerName,
            (row) => row.displayName,
            (row) => row.grossScore,
            'desc',
            (row) => `${row.grossScore}`,
            (row) => `Net ${row.netScore ?? '—'}`
          ),
        },
        {
          title: 'Biggest Slide',
          subtitle: 'Position drop vs previous event',
          hideDetailColumn: true,
          rows: buildLeaderboardRows(
            slideRows,
            (row) => row.playerName,
            (row) => row.displayName,
            (row) => row.drop,
            'desc',
            (row) => `${row.drop > 0 ? '+' : ''}${row.drop}`,
            () => 'spots'
          ),
        },
      ],
      coursePlayerTables: [],
    };
  }, [activePlayers, courseConfig, displayNames, event, pointsLeaderboard, previousEvent, roundPlayerStats]);

  if (!recaps.length || !recap) {
    return (
      <div className="chart-container empty-state">
        <h3 className="chart-title">Weekly Recap</h3>
        <p className="empty-text">Add events to generate recap cards.</p>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <div className="recap-header-row">
        <div className="recap-header-copy">
          <h3 className="chart-title">Weekly Recap</h3>
          <p className="chart-subtitle">A generated summary for each completed event</p>
          <div className="recap-meta-row">
            {eventMeta.map((item) => (
              <span key={item} className="recap-meta-pill">{item}</span>
            ))}
          </div>
        </div>
        <select
          className="url-input recap-select"
          value={recap.eventNumber}
          onChange={(e) => setEventNumber(Number(e.target.value))}
        >
          {recaps.map(r => (
            <option key={r.eventNumber} value={r.eventNumber}>
              {eventNameByNumber.get(r.eventNumber) ?? `Event ${r.eventNumber}`}{formatEventDateDisplay(r.eventDate) ? ` · ${formatEventDateDisplay(r.eventDate)}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="recap-scoreboard-card recap-chart-card">
        <p className="pp-chart-label">Weekly score sheet</p>
        <div className="pp-scorecard-wrap">
          <table className="pp-scorecard">
            <thead>
              <tr>
                <th className="pp-sc-label">Player</th>
                {scorecardHoleHeaders.map((hole) => (
                  <th key={hole} className="pp-sc-hole">
                    {onHoleClick ? (
                      <button
                        className="icon-btn"
                        style={{ width: 'auto', height: 'auto', padding: 0, color: 'var(--text)', textDecoration: 'underline' }}
                        onClick={() => onHoleClick(hole, recapNine)}
                        title={`View hole ${hole} profile`}
                      >
                        #{hole}
                      </button>
                    ) : `#${hole}`}
                  </th>
                ))}
                <th className="pp-sc-total pp-sc-total-gross">Gross</th>
                <th className="pp-sc-total pp-sc-total-net">Net</th>
                <th className="pp-sc-total pp-sc-total-pts">Pts</th>
              </tr>
            </thead>
            <tbody>
              {scorecardPars && (
                <tr>
                  <th className="pp-sc-label pp-sc-par-row">Par</th>
                  {scorecardPars.map((par, index) => <th key={index} className="pp-sc-hole pp-sc-par-cell">{par}</th>)}
                  <th className="pp-sc-total pp-sc-total-gross pp-sc-par-cell">{scorecardPars.reduce((sum, par) => sum + par, 0)}</th>
                  <th className="pp-sc-total pp-sc-total-net pp-sc-par-cell">-</th>
                  <th className="pp-sc-total pp-sc-total-pts pp-sc-par-cell">-</th>
                </tr>
              )}
              {weeklyScorecardRows.map((player) => (
                <tr key={player.playerName} className="pp-sc-row">
                  <td className="pp-sc-label">
                    {onPlayerClick ? (
                      <button
                        className="icon-btn"
                        style={{ width: 'auto', height: 'auto', padding: 0, color: 'var(--text)', textDecoration: 'underline' }}
                        onClick={() => onPlayerClick(player.playerName)}
                        title={`View ${player.playerName} profile`}
                      >
                        {player.displayName}
                      </button>
                    ) : player.displayName}
                  </td>
                  {player.holes.map((score, index) => {
                    const par = scorecardPars ? scorecardPars[index] : null;
                    const cls = getScoreCellClass(score, par);

                    return (
                      <td
                        key={`${player.playerName}-${index}`}
                        className={`pp-sc-hole-cell ${cls}`}
                        title={`Hole ${scorecardHoleHeaders[index]}${par ? ` · Par ${par}` : ''}`}
                        onClick={onHoleClick ? () => onHoleClick(scorecardHoleHeaders[index], recapNine) : undefined}
                        style={onHoleClick ? { cursor: 'pointer' } : undefined}
                      >
                        {score ?? '—'}
                      </td>
                    );
                  })}
                  <td className="pp-sc-total pp-sc-total-gross">{player.grossScore ?? '—'}</td>
                  <td className="pp-sc-total pp-sc-total-net">{player.netScore ?? '—'}</td>
                  <td className="pp-sc-total pp-sc-total-pts pp-sc-pts">{player.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pp-section-title">Week Snapshot</div>
      <div className="recap-stat-grid">
        <div className="recap-stat-card">
          <span className="recap-stat-label">Field Size</span>
          <span className="recap-stat-value">{recapStats?.fieldSize ?? '—'}</span>
          <span className="recap-stat-detail">Players who posted a round</span>
        </div>
        <div className="recap-stat-card">
          <span className="recap-stat-label">Total Birdies</span>
          <span className="recap-stat-value">{recapStats?.totalBirdies ?? '—'}</span>
          <span className="recap-stat-detail">Across the whole field</span>
        </div>
        <div className="recap-stat-card">
          <span className="recap-stat-label">Points Spread</span>
          <span className="recap-stat-value">{recapStats?.pointsSpread ?? '—'}</span>
          <span className="recap-stat-detail">Gap from top points to bottom</span>
        </div>
        <div className="recap-stat-card">
          <span className="recap-stat-label">Net Spread</span>
          <span className="recap-stat-value">{recapStats?.netSpread ?? '—'}</span>
          <span className="recap-stat-detail">Best to worst net score</span>
        </div>
      </div>

      <div className="pp-section-title">Event Metrics</div>
      <div className="recap-leaderboard-grid">
        {recapLeaderboards?.eventMetrics.map((card) => <LeaderboardTable key={card.title} card={card} onPlayerClick={onPlayerClick} />)}
      </div>

      <div className="pp-section-title">Round Leaders</div>
      <div className="recap-leaderboard-grid">
        {recapLeaderboards?.roundLeaders.map((card) => <LeaderboardTable key={card.title} card={card} onPlayerClick={onPlayerClick} />)}
      </div>

      <div className="pp-section-title">Round Strugglers</div>
      <div className="recap-leaderboard-grid">
        {recapLeaderboards?.roundStrugglers.map((card) => <LeaderboardTable key={card.title} card={card} onPlayerClick={onPlayerClick} />)}
      </div>

      <div className="pp-section-title">Course Snapshot</div>
      <div className="recap-chart-card recap-inline-chart-card">
        <p className="pp-chart-label">Hole difficulty this week</p>
        {holeDifficultyData.length ? (
          <>
            <div className="pp-scorecard-wrap">
              <table className="pp-scorecard">
                <thead>
                  <tr>
                    <th className="pp-sc-label">Hole</th>
                    {holeDifficultyData.map((hole) => (
                      <th key={`hole-header-${hole.hole}`} className="pp-sc-hole">
                        {onHoleClick ? (
                          <button
                            className="icon-btn"
                            style={{ width: 'auto', height: 'auto', padding: 0, color: 'var(--text)', textDecoration: 'underline' }}
                            onClick={() => onHoleClick(Number(hole.hole), recapNine)}
                            title={`View hole ${hole.hole} profile`}
                          >
                            #{hole.hole}
                          </button>
                        ) : `#${hole.hole}`}
                      </th>
                    ))}
                  </tr>
                  {scorecardPars && (
                    <tr>
                      <th className="pp-sc-label pp-sc-par-row">Par</th>
                      {scorecardPars.map((par, index) => <th key={`par-${index}`} className="pp-sc-hole pp-sc-par-cell">{par}</th>)}
                    </tr>
                  )}
                  {holeDifficultyData.some((hole) => hole.yardage !== null) && (
                    <tr>
                      <th className="pp-sc-label">Yardage</th>
                      {holeDifficultyData.map((hole) => (
                        <th key={`yardage-${hole.hole}`} className="pp-sc-hole pp-sc-par-cell">
                          {hole.yardage ?? '—'}
                        </th>
                      ))}
                    </tr>
                  )}
                  {holeDifficultyData.some((hole) => hole.strokeIndex !== null) && (
                    <tr>
                      <th className="pp-sc-label">Stroke Index</th>
                      {holeDifficultyData.map((hole) => (
                        <th key={`stroke-index-${hole.hole}`} className="pp-sc-hole pp-sc-par-cell" title="Based on the full 18-hole scorecard">
                          {hole.strokeIndex ?? '—'}
                        </th>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  <tr>
                    <th className="pp-sc-label">Field Avg</th>
                    {holeDifficultyData.map((hole) => (
                      <td key={`avg-${hole.hole}`} className="pp-sc-total">{hole.avgScore !== null ? hole.avgScore.toFixed(2) : '—'}</td>
                    ))}
                  </tr>
                  <tr>
                    <th className="pp-sc-label">Best</th>
                    {holeDifficultyData.map((hole) => (
                      <td key={`best-${hole.hole}`} className="pp-sc-total" style={{ color: '#22c55e', fontWeight: 700 }}>
                        {hole.bestScore !== null ? hole.bestScore : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th className="pp-sc-label">Worst</th>
                    {holeDifficultyData.map((hole) => (
                      <td key={`worst-${hole.hole}`} className="pp-sc-total" style={{ color: '#ef4444', fontWeight: 700 }}>
                        {hole.worstScore !== null ? hole.worstScore : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr className="pp-sc-row">
                    <th className="pp-sc-label">vs Par</th>
                    {holeDifficultyData.map((hole) => (
                      <td key={`vs-par-${hole.hole}`} className="pp-sc-hole-cell" style={{ fontWeight: 700, color: hole.avgVsPar < 0 ? '#22c55e' : hole.avgVsPar > 0 ? '#ef4444' : 'var(--text2)' }}>
                        {hole.avgScore !== null ? `${hole.avgVsPar >= 0 ? '+' : ''}${hole.avgVsPar.toFixed(2)}` : '—'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            {holeDifficultyData.some((hole) => hole.strokeIndex !== null) && (
              <p className="chart-subtitle" style={{ marginTop: 10 }}>
                Stroke index is shown from the full 18-hole scorecard, even when the round is only one side.
              </p>
            )}
          </>
        ) : (
          <p className="pp-no-course">Set a course scorecard to unlock weekly hole-difficulty visuals.</p>
        )}
      </div>
      <div className="recap-leaderboard-grid recap-leaderboard-grid-secondary">
        <div className={`story-card recap-story-card ${recap.hardestHole ? 'story-warn' : 'story-neutral'}`}>
          <span className="story-title">Hardest Hole</span>
          <span className="story-value">{recap.hardestHole ? renderHoleLabel(recap.hardestHole.holeNum) : '—'}</span>
          <span className="story-detail">
            {recap.hardestHole
              ? `${recap.hardestHole.avgVsPar >= 0 ? '+' : ''}${recap.hardestHole.avgVsPar.toFixed(2)} vs par`
              : 'Set course scorecard to compute'}
          </span>
        </div>
        <div className={`story-card recap-story-card ${recap.easiestHole ? 'story-good' : 'story-neutral'}`}>
          <span className="story-title">Easiest Hole</span>
          <span className="story-value">{recap.easiestHole ? renderHoleLabel(recap.easiestHole.holeNum) : '—'}</span>
          <span className="story-detail">
            {recap.easiestHole
              ? `${recap.easiestHole.avgVsPar >= 0 ? '+' : ''}${recap.easiestHole.avgVsPar.toFixed(2)} vs par`
              : 'Set course scorecard to compute'}
          </span>
        </div>
        <div className="story-card recap-story-card story-neutral">
          <span className="story-title">Field Net Average</span>
          <span className="story-value">{recap.fieldAverageNet !== null ? recap.fieldAverageNet.toFixed(2) : '—'}</span>
          <span className="story-detail">{recap.fieldAverageGross !== null ? `${recap.fieldAverageGross.toFixed(2)} gross avg` : 'No data'}</span>
        </div>
      </div>

      <div className="pp-section-title">Weekly Chaos</div>
      <div className="story-grid recap-story-grid recap-story-grid-secondary">
        <div className={`story-card recap-story-card ${funnyRecap?.closestDuel ? 'story-warn' : 'story-neutral'}`}>
          <span className="story-title">Cardiac Finish</span>
          <span className="story-value">{funnyRecap?.closestDuel ? renderPlayerNames(funnyRecap.closestDuel.playerNames) : '—'}</span>
          <span className="story-detail">
            {funnyRecap?.closestDuel
              ? `${funnyRecap.closestDuel.gap.toFixed(1)} shot gap in net score`
              : 'Need two posted net scores'}
          </span>
        </div>
        <div className={`story-card recap-story-card ${funnyRecap?.rollercoaster ? 'story-warn' : 'story-neutral'}`}>
          <span className="story-title">Rollercoaster Round</span>
          <span className="story-value">{funnyRecap?.rollercoaster ? renderPlayerNames(funnyRecap.rollercoaster.playerNames) : '—'}</span>
          <span className="story-detail">
            {funnyRecap?.rollercoaster
              ? `${funnyRecap.rollercoaster.spread} shot swing between best and worst hole`
              : 'No hole-by-hole data'}
          </span>
        </div>
        <div className={`story-card recap-story-card ${funnyRecap?.troubleMagnet ? 'story-warn' : 'story-neutral'}`}>
          <span className="story-title">Trouble Magnet</span>
          <span className="story-value">{funnyRecap?.troubleMagnet ? renderPlayerNames(funnyRecap.troubleMagnet.playerNames) : '—'}</span>
          <span className="story-detail">
            {funnyRecap?.troubleMagnet
              ? `${funnyRecap.troubleMagnet.count} bogeys or worse`
              : 'No scoring data'}
          </span>
        </div>
        <div className={`story-card recap-story-card ${funnyRecap?.disasterArtists ? 'story-warn' : 'story-neutral'}`}>
          <span className="story-title">Blow-Up Hole</span>
          <span className="story-value">{funnyRecap?.disasterArtists ? renderPlayerNames(funnyRecap.disasterArtists.playerNames) : '—'}</span>
          <span className="story-detail">
            {funnyRecap?.disasterArtists
              ? `${funnyRecap.disasterArtists.worstVsPar >= 0 ? '+' : ''}${funnyRecap.disasterArtists.worstVsPar} on a single hole`
              : 'Need hole-by-hole data'}
          </span>
        </div>
      </div>
    </div>
  );
});
