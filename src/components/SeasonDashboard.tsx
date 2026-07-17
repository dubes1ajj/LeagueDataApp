import { memo, useMemo, type ReactNode } from 'react';
import type { EventData, CourseConfig } from '../types/golf';
import { buildDisplayNames } from '../lib/displayNames';
import { computeBreakdown, getParsForNine } from '../lib/scoring';

interface SeasonDashboardProps {
  events: EventData[];
  courseConfig: CourseConfig | null;
  children?: ReactNode;
}

interface StorylineRow {
  label: string;
  value: string;
  detail: string;
}

interface StorylineTable {
  title: string;
  rows: StorylineRow[];
}

function standardDeviation(values: number[]): number {
  if (!values.length) return Number.NaN;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

export default memo(function SeasonDashboard({ events, courseConfig, children }: SeasonDashboardProps) {
  const storylines = useMemo<StorylineTable[]>(() => {
    if (!events.length) return [];

    const sortedEvents = [...events].sort((a, b) => a.eventNumber - b.eventNumber);

    const activePlayerSet = new Set<string>();
    for (const ev of sortedEvents) {
      for (const player of ev.players) {
        if (!player.didNotPlay) activePlayerSet.add(player.playerName);
      }
    }

    const displayNames = buildDisplayNames(Array.from(activePlayerSet));
    const displayName = (playerName: string) => displayNames[playerName] ?? playerName.split(',')[0];

    const movementByPlayer = new Map<string, { totalMovement: number; firstPosition: number; lastPosition: number; transitions: number }>();
    const previousPositionByPlayer = new Map<string, number>();

    for (const ev of sortedEvents) {
      for (const standing of ev.standings) {
        const existing = movementByPlayer.get(standing.playerName);
        if (!existing) {
          movementByPlayer.set(standing.playerName, {
            totalMovement: 0,
            firstPosition: standing.position,
            lastPosition: standing.position,
            transitions: 0,
          });
        }

        const previousPosition = previousPositionByPlayer.get(standing.playerName);
        const current = movementByPlayer.get(standing.playerName);
        if (!current) continue;

        if (previousPosition !== undefined) {
          current.totalMovement += Math.abs(standing.position - previousPosition);
          current.transitions += 1;
        }
        current.lastPosition = standing.position;
        previousPositionByPlayer.set(standing.playerName, standing.position);
      }
    }

    const moverRows: StorylineRow[] = Array.from(movementByPlayer.entries())
      .map(([playerName, movement]) => ({
        playerName,
        totalMovement: movement.totalMovement,
        netChange: movement.firstPosition - movement.lastPosition,
        transitions: movement.transitions,
      }))
      .filter((entry) => entry.transitions > 0 && entry.totalMovement > 0)
      .sort((a, b) => b.totalMovement - a.totalMovement || displayName(a.playerName).localeCompare(displayName(b.playerName)))
      .slice(0, 5)
      .map((entry) => ({
        label: displayName(entry.playerName),
        value: `${entry.totalMovement} spot${entry.totalMovement === 1 ? '' : 's'} moved (Total)`,
        detail: '',
      }));

    const pointsByPlayer: Record<string, number[]> = {};
    for (const ev of sortedEvents) {
      for (const player of ev.players) {
        if (player.didNotPlay) continue;
        if (!pointsByPlayer[player.playerName]) pointsByPlayer[player.playerName] = [];
        pointsByPlayer[player.playerName].push(player.points);
      }
    }

    const momentumRows: StorylineRow[] = Object.entries(pointsByPlayer)
      .map(([playerName, points]) => {
        const split = Math.ceil(points.length / 2);
        const firstHalf = points.slice(0, split);
        const secondHalf = points.slice(Math.max(split, 1));
        if (!firstHalf.length || !secondHalf.length) return null;
        const firstAvg = firstHalf.reduce((sum, value) => sum + value, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, value) => sum + value, 0) / secondHalf.length;
        const lift = secondAvg - firstAvg;
        return { playerName, firstAvg, secondAvg, lift };
      })
      .filter((entry): entry is { playerName: string; firstAvg: number; secondAvg: number; lift: number } => entry !== null && Number.isFinite(entry.lift))
      .sort((a, b) => b.lift - a.lift || displayName(a.playerName).localeCompare(displayName(b.playerName)))
      .slice(0, 5)
      .map((entry) => ({
        label: displayName(entry.playerName),
        value: `${entry.firstAvg.toFixed(1)}→${entry.secondAvg.toFixed(1)} (${entry.lift >= 0 ? '+' : ''}${entry.lift.toFixed(1)})`,
        detail: '',
      }));

    const netScoresByPlayer: Record<string, number[]> = {};
    for (const ev of sortedEvents) {
      for (const player of ev.players) {
        if (player.didNotPlay || player.netScore === null) continue;
        if (!netScoresByPlayer[player.playerName]) netScoresByPlayer[player.playerName] = [];
        netScoresByPlayer[player.playerName].push(player.netScore);
      }
    }

    const consistencyRows: StorylineRow[] = Object.entries(netScoresByPlayer)
      .map(([playerName, netScores]) => {
        if (netScores.length < 2) return null;
        const stdev = standardDeviation(netScores);
        return { playerName, stdev, rounds: netScores.length };
      })
      .filter((entry): entry is { playerName: string; stdev: number; rounds: number } => entry !== null && Number.isFinite(entry.stdev))
      .sort((a, b) => a.stdev - b.stdev || displayName(a.playerName).localeCompare(displayName(b.playerName)))
      .slice(0, 5)
      .map((entry) => ({
        label: displayName(entry.playerName),
        value: `${entry.stdev.toFixed(1)} net (${entry.rounds}r)`,
        detail: '',
      }));

    const finisherMap = new Map<string, { totalDiff: number; holes: number }>();
    if (courseConfig) {
      for (const ev of sortedEvents) {
        const pars = getParsForNine(courseConfig, ev.nineHoles);
        for (const player of ev.players) {
          if (player.didNotPlay) continue;
          const current = finisherMap.get(player.playerName) ?? { totalDiff: 0, holes: 0 };
          for (let index = 6; index < 9; index += 1) {
            const score = player.holes[index];
            if (score === null || score === undefined) continue;
            current.totalDiff += score - pars[index];
            current.holes += 1;
          }
          finisherMap.set(player.playerName, current);
        }
      }
    }

    const finisherRows: StorylineRow[] = Array.from(finisherMap.entries())
      .map(([playerName, aggregate]) => ({
        playerName,
        averageDiff: aggregate.holes ? aggregate.totalDiff / aggregate.holes : Number.NaN,
        holes: aggregate.holes,
      }))
      .filter((entry) => Number.isFinite(entry.averageDiff) && entry.holes > 0)
      .sort((a, b) => a.averageDiff - b.averageDiff || displayName(a.playerName).localeCompare(displayName(b.playerName)))
      .slice(0, 5)
      .map((entry) => ({
        label: displayName(entry.playerName),
        value: `${entry.averageDiff >= 0 ? '+' : ''}${entry.averageDiff.toFixed(2)} vs par (last 3)`,
        detail: '',
      }));

    const hardestHoleMap = new Map<number, { totalVsPar: number; samples: number }>();
    for (const ev of sortedEvents) {
      if (!courseConfig) continue;
      const pars = getParsForNine(courseConfig, ev.nineHoles);
      const startHole = ev.nineHoles === 'back' ? 10 : 1;
      for (let index = 0; index < pars.length; index += 1) {
        for (const player of ev.players) {
          if (player.didNotPlay) continue;
          const score = player.holes[index];
          if (score === null || score === undefined) continue;
          const holeNum = startHole + index;
          const current = hardestHoleMap.get(holeNum) ?? { totalVsPar: 0, samples: 0 };
          current.totalVsPar += score - pars[index];
          current.samples += 1;
          hardestHoleMap.set(holeNum, current);
        }
      }
    }

    const hardestRows: StorylineRow[] = Array.from(hardestHoleMap.entries())
      .map(([holeNum, aggregate]) => ({
        holeNum,
        avgVsPar: aggregate.samples ? aggregate.totalVsPar / aggregate.samples : Number.NaN,
        samples: aggregate.samples,
      }))
      .filter((entry) => Number.isFinite(entry.avgVsPar))
      .sort((a, b) => b.avgVsPar - a.avgVsPar || a.holeNum - b.holeNum)
      .slice(0, 5)
      .map((entry) => ({
        label: `Hole ${entry.holeNum}`,
        value: `${entry.avgVsPar >= 0 ? '+' : ''}${entry.avgVsPar.toFixed(2)} vs par (${entry.samples} scores)`,
        detail: '',
      }));

    const birdiesByPlayer: Record<string, number> = {};
    for (const ev of sortedEvents) {
      for (const player of ev.players) {
        if (player.didNotPlay) continue;
        let birdies = player.birdies;
        if (courseConfig) {
          const pars = getParsForNine(courseConfig, ev.nineHoles);
          birdies = computeBreakdown(player.holes, pars).birdies;
        }
        birdiesByPlayer[player.playerName] = (birdiesByPlayer[player.playerName] ?? 0) + birdies;
      }
    }

    const birdieRows: StorylineRow[] = Object.entries(birdiesByPlayer)
      .map(([playerName, birdies]) => ({ playerName, birdies }))
      .sort((a, b) => b.birdies - a.birdies || displayName(a.playerName).localeCompare(displayName(b.playerName)))
      .slice(0, 5)
      .map((entry) => ({
        label: displayName(entry.playerName),
        value: `${entry.birdies} season birdies`,
        detail: '',
      }));

    const bestNetRows: StorylineRow[] = sortedEvents
      .flatMap((ev) =>
        ev.players
          .filter((player): player is typeof player & { netScore: number } => !player.didNotPlay && player.netScore !== null)
          .map((player) => ({
            playerName: player.playerName,
            netScore: player.netScore,
            eventNumber: ev.eventNumber,
          }))
      )
      .sort((a, b) => a.netScore - b.netScore || a.eventNumber - b.eventNumber || displayName(a.playerName).localeCompare(displayName(b.playerName)))
      .slice(0, 5)
      .map((entry) => ({
        label: displayName(entry.playerName),
        value: `${entry.netScore} (Event ${entry.eventNumber})`,
        detail: '',
      }));

    const bestGrossRows: StorylineRow[] = sortedEvents
      .flatMap((ev) =>
        ev.players
          .filter((player): player is typeof player & { grossScore: number } => !player.didNotPlay && player.grossScore !== null)
          .map((player) => ({
            playerName: player.playerName,
            grossScore: player.grossScore,
            eventNumber: ev.eventNumber,
          }))
      )
      .sort((a, b) => a.grossScore - b.grossScore || a.eventNumber - b.eventNumber || displayName(a.playerName).localeCompare(displayName(b.playerName)))
      .slice(0, 5)
      .map((entry) => ({
        label: displayName(entry.playerName),
        value: `${entry.grossScore} (Event ${entry.eventNumber})`,
        detail: '',
      }));

    return [
      { title: 'Most Volatile', rows: moverRows },
      { title: 'Most Momentum', rows: momentumRows },
      { title: 'Most Consistent Scoring', rows: consistencyRows },
      { title: 'Best Finishers', rows: finisherRows },
      { title: 'Hardest Holes', rows: hardestRows },
      { title: 'Most Birdies', rows: birdieRows },
      { title: 'Best Gross Rounds', rows: bestGrossRows },
      { title: 'Best Net Rounds', rows: bestNetRows },
    ];
  }, [events, courseConfig]);

  if (!storylines.length) {
    return (
      <div className="chart-container empty-state">
        <h3 className="chart-title">Season Storylines</h3>
        <p className="empty-text">Add events to generate storyline cards.</p>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <h3 className="chart-title">Season Storylines</h3>
      <p className="chart-subtitle">Top 5 season leaders by storyline</p>
      <div className="recap-leaderboard-grid season-storyline-grid">
        {storylines.map((storyline) => (
          <div key={storyline.title} className="recap-chart-card recap-leaderboard-card season-storyline-table-card">
            <p className="pp-chart-label">{storyline.title}</p>
            <div className="pp-scorecard-wrap">
              <table className="pp-scorecard recap-leaderboard-table season-storyline-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th className="pp-sc-label">Player / Hole</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {storyline.rows.length ? storyline.rows.map((row, index) => (
                    <tr key={`${storyline.title}-${row.label}-${index}`} className={index % 2 === 0 ? '' : 'pp-sc-row'}>
                      <td className="pp-sc-hole-cell" style={{ fontWeight: 700 }}>{index + 1}</td>
                      <td className="pp-sc-label">{row.label}</td>
                      <td className="season-storyline-value">{row.value}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={3} className="recap-leaderboard-detail" style={{ textAlign: 'center' }}>
                        No data yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
      {children}
    </div>
  );
});
