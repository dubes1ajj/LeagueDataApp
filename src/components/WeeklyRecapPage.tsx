import { memo, useMemo, useState } from 'react';
import {
  BarChart, Bar, Cell, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { EventData, CourseConfig } from '../types/golf';
import { buildWeeklyRecaps } from '../lib/analytics';
import { useChartColors } from '../lib/useChartColors';
import { getPlayerColor } from '../lib/colors';
import { buildDisplayNames } from '../lib/displayNames';
import { computeBreakdown, getParsForNine } from '../lib/scoring';
import { useIsMobile } from '../lib/useIsMobile';

interface WeeklyRecapPageProps {
  events: EventData[];
  courseConfig: CourseConfig | null;
}

function formatPlayerNames(playerNames: string[]): string {
  const shortNames = playerNames.map(name => name.split(',')[0]);
  if (shortNames.length <= 2) return shortNames.join(' & ');
  return `${shortNames.slice(0, -1).join(', ')} & ${shortNames[shortNames.length - 1]}`;
}

function mixHexColors(startHex: string, endHex: string, ratio: number): string {
  const clamp = Math.max(0, Math.min(1, ratio));
  const parse = (hex: string) => {
    const normalized = hex.replace('#', '');
    return {
      r: Number.parseInt(normalized.slice(0, 2), 16),
      g: Number.parseInt(normalized.slice(2, 4), 16),
      b: Number.parseInt(normalized.slice(4, 6), 16),
    };
  };

  const start = parse(startHex);
  const end = parse(endHex);
  const toHex = (value: number) => Math.round(value).toString(16).padStart(2, '0');

  const r = start.r + (end.r - start.r) * clamp;
  const g = start.g + (end.g - start.g) * clamp;
  const b = start.b + (end.b - start.b) * clamp;

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function getDifficultyColor(avgVsPar: number, maxAbsValue: number): string {
  if (maxAbsValue <= 0) return '#94a3b8';

  const strength = Math.min(Math.abs(avgVsPar) / maxAbsValue, 1);
  if (avgVsPar > 0) {
    if (strength < 0.5) {
      return mixHexColors('#fde68a', '#f59e0b', strength * 2);
    }
    return mixHexColors('#f59e0b', '#dc2626', (strength - 0.5) * 2);
  }
  if (avgVsPar < 0) return mixHexColors('#bbf7d0', '#15803d', strength);
  return '#94a3b8';
}

function getLowScoreGradientColor(value: number, minValue: number, maxValue: number): string {
  if (maxValue <= minValue) return '#f59e0b';
  const ratio = Math.max(0, Math.min(1, (value - minValue) / (maxValue - minValue)));
  if (ratio < 0.5) {
    return mixHexColors('#dc2626', '#f97316', ratio * 2);
  }
  return mixHexColors('#f97316', '#fde68a', (ratio - 0.5) * 2);
}

function getChaosGradientColor(value: number, minValue: number, maxValue: number): string {
  if (maxValue <= minValue) return '#f59e0b';
  const ratio = Math.max(0, Math.min(1, (value - minValue) / (maxValue - minValue)));
  if (ratio < 0.5) {
    return mixHexColors('#fde68a', '#f59e0b', ratio * 2);
  }
  return mixHexColors('#f59e0b', '#dc2626', (ratio - 0.5) * 2);
}

export default memo(function WeeklyRecapPage({ events, courseConfig }: WeeklyRecapPageProps) {
  const c = useChartColors();
  const isMobile = useIsMobile();
  const recaps = useMemo(() => buildWeeklyRecaps(events, courseConfig), [events, courseConfig]);
  const [eventNumber, setEventNumber] = useState<number | null>(() => recaps.at(-1)?.eventNumber ?? null);
  const sortedEvents = useMemo(() => [...events].sort((a, b) => a.eventNumber - b.eventNumber), [events]);

  const recap = recaps.find(r => r.eventNumber === eventNumber) ?? recaps.at(-1) ?? null;
  const event = useMemo(
    () => (recap ? events.find(item => item.eventNumber === recap.eventNumber) ?? null : null),
    [events, recap]
  );
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

      let worstVsPar = 0;
      if (pars) {
        worstVsPar = player.holes.reduce<number>((worst, score, holeIndex) => {
          if (score === null || score === undefined) return worst;
          return Math.max(worst, score - pars[holeIndex]);
        }, 0);
      } else {
        worstVsPar = scores.length ? Math.max(...scores) - Math.min(...scores) : 0;
      }

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

  const roundStrugglers = useMemo(() => {
    if (!event || !activePlayers.length) return null;

    const lowestPoints = Math.min(...activePlayers.map((player) => player.points), Number.POSITIVE_INFINITY);
    const mostPointsLeftBehind = Number.isFinite(lowestPoints)
      ? {
          playerNames: activePlayers.filter((player) => player.points === lowestPoints).map((player) => player.playerName),
          points: lowestPoints,
        }
      : null;

    const netPlayers = activePlayers.filter((player): player is typeof player & { netScore: number } => player.netScore !== null);
    const grossPlayers = activePlayers.filter((player): player is typeof player & { grossScore: number } => player.grossScore !== null);

    const highestNet = netPlayers.length ? Math.max(...netPlayers.map((player) => player.netScore)) : null;
    const toughestNet = highestNet !== null
      ? {
          playerNames: netPlayers.filter((player) => player.netScore === highestNet).map((player) => player.playerName),
          netScore: highestNet,
        }
      : null;

    const highestGross = grossPlayers.length ? Math.max(...grossPlayers.map((player) => player.grossScore)) : null;
    const toughestGross = highestGross !== null
      ? {
          playerNames: grossPlayers.filter((player) => player.grossScore === highestGross).map((player) => player.playerName),
          grossScore: highestGross,
        }
      : null;

    let biggestSlide: { playerNames: string[]; drop: number } | null = null;
    if (previousEvent) {
      let maxDrop = 0;
      const sliders: string[] = [];
      for (const standing of event.standings) {
        const previousStanding = previousEvent.standings.find((item) => item.playerName === standing.playerName);
        if (!previousStanding) continue;
        const drop = standing.position - previousStanding.position;
        if (drop > maxDrop) {
          maxDrop = drop;
          sliders.length = 0;
          sliders.push(standing.playerName);
        } else if (drop > 0 && drop === maxDrop) {
          sliders.push(standing.playerName);
        }
      }
      if (maxDrop > 0) {
        biggestSlide = { playerNames: sliders, drop: maxDrop };
      }
    }

    return {
      mostPointsLeftBehind,
      toughestNet,
      toughestGross,
      biggestSlide,
    };
  }, [activePlayers, event, previousEvent]);

  const holeDifficultyData = useMemo(() => {
    if (!event || !courseConfig) return [];

    const pars = getParsForNine(courseConfig, event.nineHoles);
    const startHole = event.nineHoles === 'back' ? 10 : 1;

    return pars.map((par, holeIndex) => {
      const scores = activePlayers
        .map(player => player.holes[holeIndex])
        .filter((score): score is number => score !== null && score !== undefined);

      if (!scores.length) {
        return {
          hole: `${startHole + holeIndex}`,
          avgVsPar: 0,
          avgScore: null,
          par,
        };
      }

      const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      return {
        hole: `${startHole + holeIndex}`,
        avgVsPar: Math.round((avgScore - par) * 100) / 100,
        avgScore: Math.round(avgScore * 100) / 100,
        par,
      };
    });
  }, [activePlayers, courseConfig, event]);

  const maxHoleDifficultyMagnitude = useMemo(() => {
    return holeDifficultyData.reduce((max, hole) => Math.max(max, Math.abs(hole.avgVsPar)), 0);
  }, [holeDifficultyData]);

  const eventMeta = useMemo(() => {
    if (!event) return [] as string[];

    return [
      event.eventDate || 'Date TBD',
      event.nineHoles === 'back' ? 'Back 9' : 'Front 9',
      `${activePlayers.length} players`,
    ];
  }, [activePlayers.length, event]);

  const leaderChartData = useMemo(() => pointsLeaderboard.slice(0, 5), [pointsLeaderboard]);

  const strugglerChartData = useMemo(() => {
    return [...roundPlayerStats]
      .sort((a, b) => a.points - b.points || (b.netScore ?? 0) - (a.netScore ?? 0) || a.playerName.localeCompare(b.playerName))
      .slice(0, 5)
      .map((player) => ({
        playerName: player.playerName,
        displayName: player.displayName,
        points: player.points,
        netScore: player.netScore,
      }));
  }, [roundPlayerStats]);

  const strugglerPointsBounds = useMemo(() => {
    if (!strugglerChartData.length) return { min: 0, max: 0 };
    return {
      min: Math.min(...strugglerChartData.map((player) => player.points)),
      max: Math.max(...strugglerChartData.map((player) => player.points)),
    };
  }, [strugglerChartData]);

  const chaosChartData = useMemo(() => {
    return [...roundPlayerStats]
      .sort((a, b) => b.bogeysOrWorse - a.bogeysOrWorse || b.volatility - a.volatility || a.playerName.localeCompare(b.playerName))
      .slice(0, 5)
      .map((player) => ({
        playerName: player.playerName,
        displayName: player.displayName,
        bogeysOrWorse: player.bogeysOrWorse,
        volatility: player.volatility,
      }));
  }, [roundPlayerStats]);

  const chaosBounds = useMemo(() => {
    if (!chaosChartData.length) return { min: 0, max: 0 };
    return {
      min: Math.min(...chaosChartData.map((player) => player.bogeysOrWorse)),
      max: Math.max(...chaosChartData.map((player) => player.bogeysOrWorse)),
    };
  }, [chaosChartData]);

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
              Event {r.eventNumber}{r.eventDate ? ` · ${r.eventDate}` : ''}
            </option>
          ))}
        </select>
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

      <div className="pp-section-title">Round Leaders</div>
      <div className="recap-chart-card recap-inline-chart-card">
        <p className="pp-chart-label">Points leaderboard</p>
        <ResponsiveContainer width="100%" height={Math.max(220, leaderChartData.length * 34)}>
          <BarChart data={leaderChartData} layout="vertical" margin={{ top: 6, right: 12, left: isMobile ? 0 : 8, bottom: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
            <XAxis type="number" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
            <YAxis dataKey="shortName" type="category" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} width={isMobile ? 68 : 80} />
            <Tooltip
              contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
              labelStyle={{ color: c.text2 }}
              formatter={(value, name, entry: { payload?: { netScore: number | null; grossScore: number | null } }) => {
                if (name === 'points') {
                  return [`${Number(value ?? 0)} pts`, `Net ${entry.payload?.netScore ?? '—'} · Gross ${entry.payload?.grossScore ?? '—'}`];
                }
                return [value, name];
              }}
            />
            <Bar dataKey="points" radius={[0, 8, 8, 0]}>
              {leaderChartData.map(player => (
                <Cell key={player.playerName} fill={getPlayerColor(player.playerName)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="story-grid recap-story-grid">
        <div className="story-card recap-story-card story-good">
          <span className="story-title">Most Points Gained</span>
          <span className="story-value">{recap.winner ? formatPlayerNames(recap.winner.playerNames) : '—'}</span>
          <span className="story-detail">{recap.winner ? `${recap.winner.points} points` : 'No data'}</span>
        </div>
        <div className="story-card recap-story-card story-neutral">
          <span className="story-title">Best Net Round</span>
          <span className="story-value">{recap.bestNet ? formatPlayerNames(recap.bestNet.playerNames) : '—'}</span>
          <span className="story-detail">{recap.bestNet ? `${recap.bestNet.netScore} net` : 'No data'}</span>
        </div>
        <div className="story-card recap-story-card story-neutral">
          <span className="story-title">Best Gross Round</span>
          <span className="story-value">{recap.bestGross ? formatPlayerNames(recap.bestGross.playerNames) : '—'}</span>
          <span className="story-detail">{recap.bestGross ? `${recap.bestGross.grossScore} gross` : 'No data'}</span>
        </div>
        <div className={`story-card recap-story-card ${recap.biggestMover ? 'story-good' : 'story-neutral'}`}>
          <span className="story-title">Biggest Mover</span>
          <span className="story-value">{recap.biggestMover ? formatPlayerNames(recap.biggestMover.playerNames) : 'No change'}</span>
          <span className="story-detail">{recap.biggestMover ? `Moved up ${recap.biggestMover.change} spots` : 'No upward movers that week'}</span>
        </div>
      </div>

      <div className="pp-section-title">Round Strugglers</div>
      <div className="recap-chart-card recap-inline-chart-card">
        <p className="pp-chart-label">Bottom of the points sheet</p>
        <ResponsiveContainer width="100%" height={Math.max(220, strugglerChartData.length * 34)}>
          <BarChart data={strugglerChartData} layout="vertical" margin={{ top: 6, right: 12, left: isMobile ? 0 : 8, bottom: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
            <XAxis type="number" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
            <YAxis dataKey="displayName" type="category" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} width={isMobile ? 68 : 80} />
            <Tooltip
              contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
              labelStyle={{ color: c.text2 }}
              formatter={(value, name, entry: { payload?: { netScore: number | null } }) => {
                if (name === 'points') {
                  return [`${Number(value ?? 0)} pts`, `Net ${entry.payload?.netScore ?? '—'}`];
                }
                return [value, name];
              }}
            />
            <Bar dataKey="points" radius={[0, 8, 8, 0]}>
              {strugglerChartData.map((player) => (
                <Cell
                  key={player.playerName}
                  fill={getLowScoreGradientColor(player.points, strugglerPointsBounds.min, strugglerPointsBounds.max)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="story-grid recap-story-grid">
        <div className={`story-card recap-story-card ${roundStrugglers?.mostPointsLeftBehind ? 'story-warn' : 'story-neutral'}`}>
          <span className="story-title">Fewest Points Won</span>
          <span className="story-value">{roundStrugglers?.mostPointsLeftBehind ? formatPlayerNames(roundStrugglers.mostPointsLeftBehind.playerNames) : '—'}</span>
          <span className="story-detail">{roundStrugglers?.mostPointsLeftBehind ? `${roundStrugglers.mostPointsLeftBehind.points} points` : 'No data'}</span>
        </div>
        <div className={`story-card recap-story-card ${roundStrugglers?.toughestNet ? 'story-warn' : 'story-neutral'}`}>
          <span className="story-title">Toughest Net Round</span>
          <span className="story-value">{roundStrugglers?.toughestNet ? formatPlayerNames(roundStrugglers.toughestNet.playerNames) : '—'}</span>
          <span className="story-detail">{roundStrugglers?.toughestNet ? `${roundStrugglers.toughestNet.netScore} net` : 'No data'}</span>
        </div>
        <div className={`story-card recap-story-card ${roundStrugglers?.toughestGross ? 'story-warn' : 'story-neutral'}`}>
          <span className="story-title">Toughest Gross Round</span>
          <span className="story-value">{roundStrugglers?.toughestGross ? formatPlayerNames(roundStrugglers.toughestGross.playerNames) : '—'}</span>
          <span className="story-detail">{roundStrugglers?.toughestGross ? `${roundStrugglers.toughestGross.grossScore} gross` : 'No data'}</span>
        </div>
        <div className={`story-card recap-story-card ${roundStrugglers?.biggestSlide ? 'story-warn' : 'story-neutral'}`}>
          <span className="story-title">Biggest Slide</span>
          <span className="story-value">{roundStrugglers?.biggestSlide ? formatPlayerNames(roundStrugglers.biggestSlide.playerNames) : 'No change'}</span>
          <span className="story-detail">{roundStrugglers?.biggestSlide ? `Dropped ${roundStrugglers.biggestSlide.drop} spots` : 'No one dropped in the standings'}</span>
        </div>
      </div>

      <div className="pp-section-title">Course Snapshot</div>
      <div className="recap-chart-card recap-inline-chart-card">
        <p className="pp-chart-label">Hole difficulty this week</p>
        {holeDifficultyData.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={holeDifficultyData} margin={{ top: 6, right: 12, left: isMobile ? -18 : -12, bottom: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
              <XAxis dataKey="hole" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
              <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                labelStyle={{ color: c.text2 }}
                formatter={(value, name, entry: { payload?: { avgScore: number | null; par: number } }) => {
                  if (name === 'avgVsPar') {
                    const numericValue = Number(value ?? 0);
                    const label = `${numericValue >= 0 ? '+' : ''}${numericValue.toFixed(2)} vs par`;
                    const detail = `Avg ${entry.payload?.avgScore ?? '—'} on par ${entry.payload?.par ?? '—'}`;
                    return [label, detail];
                  }
                  return [value, name];
                }}
              />
              <Bar dataKey="avgVsPar" radius={[8, 8, 0, 0]}>
                {holeDifficultyData.map((hole) => (
                  <Cell key={hole.hole} fill={getDifficultyColor(hole.avgVsPar, maxHoleDifficultyMagnitude)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="pp-no-course">Set a course scorecard to unlock weekly hole-difficulty visuals.</p>
        )}
      </div>
      <div className="story-grid recap-story-grid recap-story-grid-secondary">
        <div className="story-card recap-story-card story-neutral">
          <span className="story-title">Cleanest Card</span>
          <span className="story-value">{recap.cleanestCard ? formatPlayerNames(recap.cleanestCard.playerNames) : '—'}</span>
          <span className="story-detail">{recap.cleanestCard ? `${recap.cleanestCard.bogeysOrWorse} bogeys or worse` : 'No data'}</span>
        </div>
        <div className={`story-card recap-story-card ${recap.hardestHole ? 'story-warn' : 'story-neutral'}`}>
          <span className="story-title">Hardest Hole</span>
          <span className="story-value">{recap.hardestHole ? `Hole ${recap.hardestHole.holeNum}` : '—'}</span>
          <span className="story-detail">
            {recap.hardestHole
              ? `${recap.hardestHole.avgVsPar >= 0 ? '+' : ''}${recap.hardestHole.avgVsPar.toFixed(2)} vs par`
              : 'Set course scorecard to compute'}
          </span>
        </div>
        <div className={`story-card recap-story-card ${recap.easiestHole ? 'story-good' : 'story-neutral'}`}>
          <span className="story-title">Easiest Hole</span>
          <span className="story-value">{recap.easiestHole ? `Hole ${recap.easiestHole.holeNum}` : '—'}</span>
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
      <div className="recap-chart-card recap-inline-chart-card">
        <p className="pp-chart-label">Chaos meter</p>
        <ResponsiveContainer width="100%" height={Math.max(220, chaosChartData.length * 34)}>
          <BarChart data={chaosChartData} layout="vertical" margin={{ top: 6, right: 12, left: isMobile ? 0 : 8, bottom: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
            <XAxis type="number" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
            <YAxis dataKey="displayName" type="category" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} width={isMobile ? 68 : 80} />
            <Tooltip
              contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
              labelStyle={{ color: c.text2 }}
              formatter={(value, name, entry: { payload?: { volatility: number } }) => {
                if (name === 'bogeysOrWorse') {
                  return [`${Number(value ?? 0)} bogeys+`, `Volatility ${entry.payload?.volatility ?? '—'}`];
                }
                return [value, name];
              }}
            />
            <Bar dataKey="bogeysOrWorse" radius={[0, 8, 8, 0]}>
              {chaosChartData.map((player) => (
                <Cell
                  key={player.playerName}
                  fill={getChaosGradientColor(player.bogeysOrWorse, chaosBounds.min, chaosBounds.max)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="story-grid recap-story-grid recap-story-grid-secondary">
        <div className={`story-card recap-story-card ${funnyRecap?.closestDuel ? 'story-warn' : 'story-neutral'}`}>
          <span className="story-title">Cardiac Finish</span>
          <span className="story-value">{funnyRecap?.closestDuel ? formatPlayerNames(funnyRecap.closestDuel.playerNames) : '—'}</span>
          <span className="story-detail">
            {funnyRecap?.closestDuel
              ? `${funnyRecap.closestDuel.gap.toFixed(1)} shot gap in net score`
              : 'Need two posted net scores'}
          </span>
        </div>
        <div className={`story-card recap-story-card ${funnyRecap?.rollercoaster ? 'story-warn' : 'story-neutral'}`}>
          <span className="story-title">Rollercoaster Round</span>
          <span className="story-value">{funnyRecap?.rollercoaster ? formatPlayerNames(funnyRecap.rollercoaster.playerNames) : '—'}</span>
          <span className="story-detail">
            {funnyRecap?.rollercoaster
              ? `${funnyRecap.rollercoaster.spread} shot swing between best and worst hole`
              : 'No hole-by-hole data'}
          </span>
        </div>
        <div className={`story-card recap-story-card ${funnyRecap?.troubleMagnet ? 'story-warn' : 'story-neutral'}`}>
          <span className="story-title">Trouble Magnet</span>
          <span className="story-value">{funnyRecap?.troubleMagnet ? formatPlayerNames(funnyRecap.troubleMagnet.playerNames) : '—'}</span>
          <span className="story-detail">
            {funnyRecap?.troubleMagnet
              ? `${funnyRecap.troubleMagnet.count} bogeys or worse`
              : 'No scoring data'}
          </span>
        </div>
        <div className={`story-card recap-story-card ${funnyRecap?.disasterArtists ? 'story-warn' : 'story-neutral'}`}>
          <span className="story-title">Blow-Up Hole</span>
          <span className="story-value">{funnyRecap?.disasterArtists ? formatPlayerNames(funnyRecap.disasterArtists.playerNames) : '—'}</span>
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
