import { useMemo, memo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList
} from 'recharts';
import type { EventData } from '../types/golf';
import { getPlayerColor } from '../lib/colors';
import { useLineSelect } from '../lib/useLineHover';
import { ChartTooltip } from './ChartTooltip';
import { ClickableLegend } from './ClickableLegend';
import { useChartColors } from '../lib/useChartColors';
import { buildDisplayNames } from '../lib/displayNames';
import { useIsMobile } from '../lib/useIsMobile';

interface BumpChartProps {
  events: EventData[];
  onPlayerClick?: (playerName: string) => void;
  showTable?: boolean;
  showHistory?: boolean;
}

export default memo(function BumpChart({ events, onPlayerClick, showTable = true, showHistory = true }: BumpChartProps) {
  const sorted = useMemo(() => [...events].sort((a, b) => a.eventNumber - b.eventNumber), [events]);
  const latest = sorted[sorted.length - 1];
  const prev   = sorted[sorted.length - 2];

  const relevantPlayers = useMemo(() => {
    const set = new Set<string>();
    for (const ev of sorted) ev.standings.forEach(s => set.add(s.playerName));
    return Array.from(set);
  }, [sorted]);

  const maxPosition = useMemo(() => {
    let max = 1;
    for (const ev of sorted)
      for (const s of ev.standings)
        if (s.position > max) max = s.position;
    return max;
  }, [sorted]);

  const { selected, toggle, clearAll, getLineProps } = useLineSelect(relevantPlayers);
  const c = useChartColors();
  const isDark = !document.documentElement.classList.contains('light');
  const isMobile = useIsMobile();
  const displayNames = useMemo(() => buildDisplayNames(relevantPlayers), [relevantPlayers]);

  // ── Rank movement table data ─────────────────────────────────────────────
  const movementRows = useMemo(() => {
    if (!latest) return [];
    const leader = latest.standings[0]?.cumulativePoints ?? 0;
    const latestPoints = latest.players.filter((player) => !player.didNotPlay).map((player) => player.points);
    const latestMaxPoints = latestPoints.length ? Math.max(...latestPoints) : 0;
    const latestMinPoints = latestPoints.length ? Math.min(...latestPoints) : 0;
    const tiedPositions = new Set(
      latest.standings
        .map((standing) => standing.position)
        .filter((position, index, all) => all.indexOf(position) !== index)
    );

    return [...latest.standings]
      .sort((a, b) => a.position - b.position)
      .map(s => {
        const prevStanding = prev?.standings.find(p => p.playerName === s.playerName);
        const change = prevStanding ? prevStanding.position - s.position : null; // positive = moved up
        const gap = leader - s.cumulativePoints;
        const evPts = latest.players.find(p => p.playerName === s.playerName)?.points ?? null;
        const eventCount = sorted.reduce((count, event) => {
          const player = event.players.find((candidate) => candidate.playerName === s.playerName);
          return player && !player.didNotPlay ? count + 1 : count;
        }, 0);
        return {
          ...s,
          change,
          gap,
          evPts,
          eventCount,
          avgPoints: eventCount > 0 ? Math.round((s.cumulativePoints / eventCount) * 100) / 100 : null,
          tied: tiedPositions.has(s.position),
          latestMinPoints,
          latestMaxPoints,
        };
      });
  }, [latest, prev, sorted]);

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    return sorted.map(ev => {
      const obj: Record<string, number | string> = {
        event: `Evt ${ev.eventNumber}`,
        date: ev.eventDate,
      };
      for (const player of relevantPlayers) {
        const standing = ev.standings.find(s => s.playerName === player);
        obj[player] = standing ? standing.position : maxPosition + 1;
      }
      return obj;
    });
  }, [sorted, relevantPlayers, maxPosition]);

  const hasSelection = selected.size > 0;
  const lastIndex = chartData.length - 1;

  function getEventPointsStyle(points: number | null, minPoints: number, maxPoints: number): React.CSSProperties {
    if (points === null) return { color: isDark ? '#555' : '#8b8b98' };
    if (maxPoints === minPoints) {
      return {
        background: isDark ? 'rgba(34,197,94,0.22)' : 'rgba(34,197,94,0.16)',
        color: isDark ? '#f5f5f5' : '#17311f',
      };
    }

    const ratio = (points - minPoints) / (maxPoints - minPoints);
    const stops: Array<[number, [number, number, number]]> = [
      [0, [239, 68, 68]],
      [0.33, [255, 255, 255]],
      [0.66, [250, 204, 21]],
      [1, [34, 197, 94]],
    ];

    let rgb = stops[stops.length - 1][1];
    for (let index = 0; index < stops.length - 1; index += 1) {
      const [startRatio, startColor] = stops[index];
      const [endRatio, endColor] = stops[index + 1];
      if (ratio >= startRatio && ratio <= endRatio) {
        const weight = (ratio - startRatio) / (endRatio - startRatio || 1);
        rgb = startColor.map((channel, channelIndex) => (
          Math.round(channel + (endColor[channelIndex] - channel) * weight)
        )) as [number, number, number];
        break;
      }
    }

    const alpha = isDark ? 0.26 : 0.18;
    return {
      background: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`,
      color: isDark ? '#f5f5f5' : '#1a1a2e',
      fontWeight: 700,
      borderRadius: 999,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 52,
      padding: '4px 10px',
    };
  }

  if (events.length === 0) return <EmptyState message="Add at least one event to see standings." />;

  return (
    <>
      {/* ── Rank Movement Table ────────────────────────────────────────── */}
      {showTable && <div className="chart-container">
        <h3 className="chart-title">
          Current Rankings
          {latest && <span className="chart-badge">After Event {latest.eventNumber}</span>}
        </h3>
        <p className="chart-subtitle">
          {movementRows.length} players ranked
          {prev && ` · arrows show change from Event ${prev.eventNumber}`}
        </p>
        <div className="bump-table-wrap">
          <table className="bump-table">
            <thead>
              <tr>
                <th className="bump-th-rank">Rank</th>
                {prev && <th className="bump-th-change" title="Change from previous event">±</th>}
                <th className="bump-th-player">Player</th>
                <th className="bump-th-pts">Total Pts</th>
                <th className="bump-th-pts">Avg Pts</th>
                <th className="bump-th-gap" title="Points behind leader">Gap</th>
                <th className="bump-th-evpts" title={`Points from the latest event (Event ${latest?.eventNumber})`}>Last Event</th>
              </tr>
            </thead>
            <tbody>
              {movementRows.map((row, idx) => {
                const color = getPlayerColor(row.playerName);
                const isTop3 = row.position <= 3;
                const podiumColors = ['#f59e0b', '#9ca3af', '#b45309'];
                const badgeBg = isTop3 ? podiumColors[row.position - 1] : (isDark ? '#2a2a3e' : '#e4e4ec');
                const badgeText = isTop3 || isDark ? '#fff' : '#1a1a2e';

                // Change arrow
                let arrow = null;
                if (row.change !== null && row.change !== 0) {
                  const up = row.change > 0;
                  arrow = (
                    <span style={{ color: up ? '#22c55e' : '#ef4444', fontWeight: 700, fontSize: 13 }}>
                      {up ? '▲' : '▼'} {Math.abs(row.change)}
                    </span>
                  );
                } else if (row.change === 0) {
                  arrow = <span style={{ color: isDark ? '#555' : '#aaa', fontSize: 12 }}>—</span>;
                } else {
                  arrow = <span style={{ color: isDark ? '#555' : '#aaa', fontSize: 11 }}>new</span>;
                }

                return (
                  <tr
                    key={row.playerName}
                    className={`bump-row ${idx % 2 === 0 ? 'bump-row-even' : ''} ${onPlayerClick ? 'bump-row-clickable' : ''}`}
                    onClick={onPlayerClick ? () => onPlayerClick(row.playerName) : undefined}
                    title={onPlayerClick ? `View ${row.playerName}'s profile` : undefined}
                  >
                    <td className="bump-td-rank">
                      <span className="pos-badge" style={{ background: badgeBg, color: badgeText, minWidth: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        {row.tied ? `T${row.position}` : row.position}
                      </span>
                    </td>
                    {prev && <td className="bump-td-change">{arrow}</td>}
                    <td className="bump-td-player">
                      <span className="player-dot" style={{ background: color }} />
                      {row.playerName}
                    </td>
                    <td className="bump-td-pts">{row.cumulativePoints}</td>
                    <td className="bump-td-gap">{row.avgPoints !== null ? row.avgPoints.toFixed(2) : '—'}</td>
                    <td className="bump-td-gap" style={{ color: row.gap === 0 ? '#22c55e' : (isDark ? '#888' : '#666') }}>
                      {row.gap === 0 ? '—' : `-${row.gap}`}
                    </td>
                    <td className="bump-td-evpts">
                      <span style={getEventPointsStyle(row.evPts, row.latestMinPoints, row.latestMaxPoints)}>
                        {row.evPts !== null ? row.evPts : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>}

      {/* ── Bump line chart ─────────────────────────────────────────── */}
      {showHistory && events.length >= 2 && (
        <div className="chart-container">
          <h3 className="chart-title">Position History</h3>
          <p className="chart-subtitle">
            Lower = better rank · click a name below to isolate players
          </p>
          <ResponsiveContainer width="100%" height={Math.max(isMobile ? 360 : 440, maxPosition * (isMobile ? 32 : 26))}>
            <LineChart data={chartData} margin={{ top: 10, right: isMobile ? 10 : 165, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
              <XAxis dataKey="event" stroke={c.axis} tick={{ fill: c.tick, fontSize: 12 }} />
              <YAxis
                reversed
                domain={[1, maxPosition]}
                ticks={Array.from({ length: maxPosition }, (_, i) => i + 1)}
                interval={0}
                stroke={c.axis}
                tick={{ fill: c.tick, fontSize: 12 }}
                label={{ value: 'Position', angle: -90, position: 'insideLeft', fill: c.tick, fontSize: 12 }}
                width={40}
              />
              <Tooltip
                content={<ChartTooltip selected={selected} sortDir="asc" valueFormat={(v) => `#${v}`} />}
              />
              {relevantPlayers.map(player => {
                const color = getPlayerColor(player);
                const isActive = !hasSelection || selected.has(player);

                // Group tied players at the last data point so labels don't overlap.
                // Only the alphabetically-first player in each tied group renders
                // a label — showing all tied names comma-separated.
                const lastPos = chartData[lastIndex]?.[player] as number | undefined;
                const tiedGroup = lastPos !== undefined
                  ? relevantPlayers
                      .filter(p => {
                        if (hasSelection && !selected.has(p)) return false;
                        return (chartData[lastIndex]?.[p] as number | undefined) === lastPos;
                      })
                      .sort()
                  : [];
                const isGroupRepresentative = tiedGroup[0] === player;

                return (
                  <Line
                    key={player}
                    type="linear"
                    dataKey={player}
                    stroke={color}
                    connectNulls
                    {...getLineProps(player, color)}
                  >
                    {isActive && isGroupRepresentative && !isMobile && (
                      <LabelList
                        dataKey={player}
                        position="right"
                        content={({ x, y, index }) => {
                          if (index !== lastIndex) return null;
                          const lastNames = tiedGroup.map(p => displayNames[p] ?? p.split(',')[0].trim());
                          const label = `#${lastPos} ${lastNames.join(', ')}`;
                          const labelColor = tiedGroup.length === 1 ? color : c.tick;
                          const isBold = tiedGroup.some(p => selected.has(p));
                          return (
                            <text
                              x={Number(x) + 8}
                              y={Number(y) + 4}
                              fill={labelColor}
                              fontSize={11}
                              fontWeight={isBold ? 700 : 400}
                              style={{ pointerEvents: 'none' }}
                            >
                              {label}
                            </text>
                          );
                        }}
                      />
                    )}
                  </Line>
                );
              })}
            </LineChart>
          </ResponsiveContainer>
          <ClickableLegend players={relevantPlayers} selected={selected} onToggle={toggle} onClearAll={clearAll} />
        </div>
      )}
      {showHistory && events.length < 2 && (
        <EmptyState message="Add at least two events to see position history." />
      )}
    </>
  );
});

function EmptyState({ message }: { message: string }) {
  return (
    <div className="chart-container empty-state">
      <h3 className="chart-title">Overall Standings — Position Over Time</h3>
      <p className="empty-text">{message}</p>
    </div>
  );
}
