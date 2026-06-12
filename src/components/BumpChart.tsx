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
}

export default memo(function BumpChart({ events }: BumpChartProps) {
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
    return [...latest.standings]
      .sort((a, b) => a.position - b.position)
      .map(s => {
        const prevStanding = prev?.standings.find(p => p.playerName === s.playerName);
        const change = prevStanding ? prevStanding.position - s.position : null; // positive = moved up
        const gap = leader - s.cumulativePoints;
        const evPts = latest.players.find(p => p.playerName === s.playerName)?.points ?? null;
        return { ...s, change, gap, evPts };
      });
  }, [latest, prev]);

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

  if (events.length === 0) return <EmptyState message="Add at least one event to see standings." />;

  return (
    <>
      {/* ── Rank Movement Table ────────────────────────────────────────── */}
      <div className="chart-container">
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
                <th className="bump-th-gap" title="Points behind leader">Gap</th>
                <th className="bump-th-evpts" title={`Points this event (Event ${latest?.eventNumber})`}>This Event</th>
              </tr>
            </thead>
            <tbody>
              {movementRows.map((row, idx) => {
                const color = getPlayerColor(row.playerName);
                const isTop3 = row.position <= 3;
                const podiumColors = ['#f59e0b', '#9ca3af', '#b45309'];
                const badgeBg = isTop3 ? podiumColors[row.position - 1] : (isDark ? '#2a2a3e' : '#e4e4ec');
                const badgeText = '#fff';

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
                  <tr key={row.playerName} className={`bump-row ${idx % 2 === 0 ? 'bump-row-even' : ''}`}>
                    <td className="bump-td-rank">
                      <span className="pos-badge" style={{ background: badgeBg, color: badgeText, minWidth: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                        {row.position}
                      </span>
                    </td>
                    {prev && <td className="bump-td-change">{arrow}</td>}
                    <td className="bump-td-player">
                      <span className="player-dot" style={{ background: color }} />
                      {row.playerName}
                    </td>
                    <td className="bump-td-pts">{row.cumulativePoints}</td>
                    <td className="bump-td-gap" style={{ color: row.gap === 0 ? '#22c55e' : (isDark ? '#888' : '#666') }}>
                      {row.gap === 0 ? '—' : `-${row.gap}`}
                    </td>
                    <td className="bump-td-evpts" style={{ color: row.evPts !== null && row.evPts > 0 ? color : (isDark ? '#555' : '#aaa') }}>
                      {row.evPts !== null ? row.evPts : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Bump line chart ─────────────────────────────────────────── */}
      {events.length >= 2 && (
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
