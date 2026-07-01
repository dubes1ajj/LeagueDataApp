import { useMemo, useState, memo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList
} from 'recharts';
import type { AdjustedScoringSettings, EventData } from '../types/golf';
import { getPlayerColor } from '../lib/colors';
import { useChartColors } from '../lib/useChartColors';
import { buildDisplayNames } from '../lib/displayNames';
import { getTooltipTrigger } from '../lib/tooltip';
import { useIsMobile } from '../lib/useIsMobile';
import { getEventDisplayName } from '../lib/eventNames';
import { formatEventDateDisplay } from '../lib/eventDateDisplay';
import { EVENT_COLOR_PALETTE } from '../lib/eventColors';

// ─── Types ───────────────────────────────────────────────────────────────────
interface WeeklyPointsChartProps {
  events: EventData[];
  onPlayerClick?: (playerName: string) => void;
  rankBasis?: 'adjusted' | 'raw';
  adjustedScoring?: AdjustedScoringSettings;
  showBarChart?: boolean;
  showMatrix?: boolean;
}

type SortKey = 'total' | number; // number = event index

// ─── Main component ──────────────────────────────────────────────────────────
export default memo(function WeeklyPointsChart({
  events,
  onPlayerClick,
  rankBasis = 'raw',
  adjustedScoring,
  showBarChart = true,
  showMatrix = true,
}: WeeklyPointsChartProps) {
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const c = useChartColors();
  const isMobile = useIsMobile();
  const tooltipTrigger = getTooltipTrigger(isMobile);

  // Read theme text color once for cell styling
  const isDark = !document.documentElement.classList.contains('light');

  /**
   * 5-tier heat-map with continuous interpolation:
   *   ratio 1.0 → deep green   (winner / top)
   *   ratio 0.75 → light green
   *   ratio 0.5  → yellow
   *   ratio 0.25 → orange
   *   ratio 0.0  → red         (lowest positive score)
   *   pts <= 0   → red text
   *   isWinner   → bold + ring highlight
   */
  function cellStyle(
    pts: number | null,
    ratio: number | null,
    isWinner: boolean
  ): React.CSSProperties {
    const textColor = isDark ? '#e2e2f0' : '#1a1a2e';
    if (pts === null) return { color: isDark ? '#555' : '#aaa', background: 'transparent' };
    if (pts <= 0) return {
      color: '#ef4444',
      background: isDark ? 'rgba(239,68,68,0.12)' : 'rgba(239,68,68,0.10)',
      fontWeight: 600,
    };
    if (ratio === null) return { color: textColor };

    const r = Math.max(0, Math.min(1, ratio)); // clamp 0–1

    // Interpolate RGBA across 5 colour stops
    // r=1: green(34,197,94)  r=0.75: lime(132,204,22)  r=0.5: yellow(234,179,8)
    // r=0.25: orange(249,115,22)  r=0: red(239,68,68)
    type Stop = [number, number, number]; // RGB
    const stops: [number, Stop][] = [
      [1.00, [34, 197, 94]],
      [0.75, [132, 204, 22]],
      [0.50, [234, 179, 8]],
      [0.25, [249, 115, 22]],
      [0.00, [239, 68, 68]],
    ];
    let rgb: Stop = stops[stops.length - 1][1];
    for (let i = 0; i < stops.length - 1; i++) {
      const [hi, hiColor] = stops[i];
      const [lo, loColor] = stops[i + 1];
      if (r >= lo) {
        const t = (r - lo) / (hi - lo);
        rgb = hiColor.map((c, j) => Math.round(loColor[j] + t * (c - loColor[j]))) as Stop;
        break;
      }
    }
    const bgAlpha = isDark ? 0.12 + r * 0.28 : 0.10 + r * 0.22;
    const bg = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${bgAlpha.toFixed(2)})`;

    return {
      color: textColor,
      background: bg,
      fontWeight: isWinner ? 800 : r >= 0.66 ? 600 : 400,
      outline: isWinner ? `2px solid rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.7)` : undefined,
      outlineOffset: isWinner ? '-2px' : undefined,
      borderRadius: isWinner ? 4 : undefined,
    };
  }

  const sorted = useMemo(() =>
    [...events].sort((a, b) => a.eventNumber - b.eventNumber), [events]);

  // All players who played at least once
  const allPlayers = useMemo(() => {
    const seen = new Set<string>();
    for (const ev of sorted)
      for (const p of ev.players)
        if (!p.didNotPlay) seen.add(p.playerName);
    return Array.from(seen);
  }, [sorted]);

  // Points per player per event { [playerName]: { [eventNumber]: pts } }
  const pointsMap = useMemo(() => {
    const map: Record<string, Record<number, number>> = {};
    for (const ev of sorted) {
      for (const p of ev.players) {
        if (p.didNotPlay) continue;
        if (!map[p.playerName]) map[p.playerName] = {};
        map[p.playerName][ev.eventNumber] = p.points;
      }
    }
    return map;
  }, [sorted]);

  const rawTotals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const name of allPlayers) {
      t[name] = Object.values(pointsMap[name] ?? {}).reduce((s, v) => s + v, 0);
    }
    return t;
  }, [allPlayers, pointsMap]);

  const adjustedTotals = useMemo(() => {
    function getAdjustedTotal(values: number[]): number {
      if (adjustedScoring?.mode !== 'drop-lowest') {
        return values.reduce((sum, value) => sum + value, 0);
      }
      const dropCount = Math.max(0, Math.floor(adjustedScoring.dropCount ?? 0));
      if (!dropCount || !values.length) return values.reduce((sum, value) => sum + value, 0);
      const sortedVals = [...values].sort((a, b) => a - b);
      const dropped = sortedVals.slice(0, Math.min(dropCount, sortedVals.length)).reduce((sum, value) => sum + value, 0);
      return values.reduce((sum, value) => sum + value, 0) - dropped;
    }

    const t: Record<string, number> = {};
    for (const name of allPlayers) {
      t[name] = getAdjustedTotal(Object.values(pointsMap[name] ?? {}));
    }
    return t;
  }, [adjustedScoring, allPlayers, pointsMap]);

  const totals = useMemo(() => (rankBasis === 'raw' ? rawTotals : adjustedTotals), [adjustedTotals, rankBasis, rawTotals]);

  const droppedEventNumbersByPlayer = useMemo(() => {
    const dropped: Record<string, Set<number>> = {};
    if (rankBasis !== 'adjusted' || adjustedScoring?.mode !== 'drop-lowest') return dropped;

    const dropCount = Math.max(0, Math.floor(adjustedScoring.dropCount ?? 0));
    if (!dropCount) return dropped;

    for (const name of allPlayers) {
      const entries = Object.entries(pointsMap[name] ?? {})
        .map(([eventNumber, points]) => ({ eventNumber: Number(eventNumber), points }))
        .sort((a, b) => a.points - b.points || a.eventNumber - b.eventNumber);
      const toDrop = Math.min(dropCount, entries.length);
      dropped[name] = new Set(entries.slice(0, toDrop).map((entry) => entry.eventNumber));
    }

    return dropped;
  }, [adjustedScoring, allPlayers, pointsMap, rankBasis]);

  const eventNameByNumber = useMemo(() => {
    const map = new Map<number, string>();
    for (const event of sorted) {
      map.set(event.eventNumber, getEventDisplayName(event));
    }
    return map;
  }, [sorted]);

  // Per-event sorted scores for rank-based heat-map
  // { [eventNumber]: sorted array of scores desc }
  const eventRankMap = useMemo(() => {
    const map: Record<number, number[]> = {};
    for (const ev of sorted) {
      const scores = ev.players
        .filter(p => !p.didNotPlay)
        .map(p => p.points)
        .sort((a, b) => b - a);
      map[ev.eventNumber] = scores;
    }
    return map;
  }, [sorted]);

  function getRatio(pts: number | null, evNumber: number): number | null {
    if (pts === null || pts <= 0) return null;
    const scores = eventRankMap[evNumber] ?? [];
    if (scores.length <= 1) return 1;
    const min = scores[scores.length - 1];
    const max = scores[0];
    if (max === min) return 1;
    return (pts - min) / (max - min);
  }

  function isEventWinner(pts: number | null, evNumber: number): boolean {
    if (pts === null || pts <= 0) return false;
    const scores = eventRankMap[evNumber] ?? [];
    return scores.length > 0 && pts === scores[0];
  }

  // Sort players for the matrix table
  const sortedPlayers = useMemo(() => {
    return [...allPlayers].sort((a, b) => {
      if (sortKey === 'total') return (totals[b] ?? 0) - (totals[a] ?? 0);
      const evNum = sorted[sortKey as number]?.eventNumber;
      if (evNum === undefined) return 0;
      return (pointsMap[b]?.[evNum] ?? -Infinity) - (pointsMap[a]?.[evNum] ?? -Infinity);
    });
  }, [allPlayers, sortKey, sorted, totals, pointsMap]);

  // Data for the stacked horizontal bar chart (one row per player)
  // Build a display label map: if last name is unique, use it; else use "Last, F."
  const displayNames = useMemo(() => buildDisplayNames(allPlayers), [allPlayers]);

  const barData = useMemo(() => {
    return [...allPlayers]
      .sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0))
      .map(name => {
        const row: Record<string, string | number> = {
          name: displayNames[name] ?? name.split(',')[0].trim(),
          fullName: name,
        };
        for (const ev of sorted) {
          const rawValue = pointsMap[name]?.[ev.eventNumber] ?? 0;
          const isDropped = droppedEventNumbersByPlayer[name]?.has(ev.eventNumber) ?? false;
          row[`e${ev.eventNumber}`] = isDropped ? 0 : rawValue;
        }
        row.total = totals[name] ?? 0;
        return row;
      });
  }, [allPlayers, sorted, pointsMap, totals, displayNames, droppedEventNumbersByPlayer]);

  if (events.length === 0) {
    return (
      <div className="chart-container empty-state">
        <h3 className="chart-title">Weekly Event Points</h3>
        <p className="empty-text">Add events to see weekly points.</p>
      </div>
    );
  }

  if (!showBarChart && !showMatrix) {
    return null;
  }

  // ── Chart colours per event ──────────────────────────────────────────────
  return (
    <>
      {showBarChart && (
        <div className="chart-container">
          <h3 className="chart-title">Points by Player (Stacked by Event)</h3>
          <p className="chart-subtitle">
            Bar length = cumulative total · each colour = one event · totals shown as {rankBasis === 'raw' ? 'total points' : 'adjusted points'}
          </p>
          <div className="wpc-legend-row">
            {sorted.map((ev, i) => (
                <span key={ev.id} className="wpc-ev-badge" style={{ background: EVENT_COLOR_PALETTE[i % EVENT_COLOR_PALETTE.length] }}>
                {getEventDisplayName(ev)}{formatEventDateDisplay(ev.eventDate) ? ` · ${formatEventDateDisplay(ev.eventDate)}` : ''}
              </span>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={Math.max(280, barData.length * (isMobile ? 22 : 28))}>
            <BarChart
              layout="vertical"
              data={barData}
              margin={{ top: 4, right: isMobile ? 36 : 60, left: isMobile ? 4 : 10, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 'dataMax']}
                tickCount={isMobile ? 4 : 6}
                stroke={c.axis}
                tick={{ fill: c.tick, fontSize: isMobile ? 10 : 11 }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={isMobile ? 72 : 110}
                interval={0}
                stroke={c.axis}
                tick={{ fill: c.tick, fontSize: isMobile ? 10 : 12 }}
              />
              <Tooltip
                trigger={tooltipTrigger}
                contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                labelStyle={{ color: c.text2, fontWeight: 700 }}
                formatter={(val, key) => {
                  const evNum = String(key).replace('e', '');
                  const num = Number(evNum);
                  const eventLabel = eventNameByNumber.get(num) ?? `Event ${evNum}`;
                  return [`${val} pts`, eventLabel];
                }}
                cursor={{ fill: 'rgba(128,128,128,0.06)' }}
              />
              {sorted.map((ev, i) => (
                <Bar
                  key={ev.id}
                  dataKey={`e${ev.eventNumber}`}
                  stackId="pts"
                  fill={EVENT_COLOR_PALETTE[i % EVENT_COLOR_PALETTE.length]}
                  isAnimationActive={false}
                >
                  {i === sorted.length - 1 && (
                    <LabelList
                      dataKey="total"
                      position="right"
                      style={{ fill: c.tick, fontSize: isMobile ? 9 : 11 }}
                      formatter={(v) => (Number(v) > 0 ? String(v) : '')}
                    />
                  )}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {showMatrix && (
        <div className="chart-container">
          <h3 className="chart-title">Points Matrix</h3>
          <p className="chart-subtitle">
            Click any column header to sort · blue tint = more points · cells show individual event points
          </p>
          <div className="wpc-table-wrap">
            <table className="wpc-table">
            <thead>
              <tr>
                <th className="wpc-th wpc-th-player">Player</th>
                {sorted.map((ev, i) => (
                  <th
                    key={ev.id}
                    className={`wpc-th wpc-th-ev ${sortKey === i ? 'wpc-th-sorted' : ''}`}
                    onClick={() => setSortKey(sortKey === i ? 'total' : i)}
                    title={formatEventDateDisplay(ev.eventDate) ? `${getEventDisplayName(ev)} · ${formatEventDateDisplay(ev.eventDate)}` : getEventDisplayName(ev)}
                  >
                    <span style={{ color: EVENT_COLOR_PALETTE[i % EVENT_COLOR_PALETTE.length] }}>{getEventDisplayName(ev)}</span>
                    {formatEventDateDisplay(ev.eventDate) && <span className="wpc-date">{formatEventDateDisplay(ev.eventDate)}</span>}
                  </th>
                ))}
                <th
                  className={`wpc-th wpc-th-total ${sortKey === 'total' ? 'wpc-th-sorted' : ''}`}
                  onClick={() => setSortKey('total')}
                >
                  {rankBasis === 'raw' ? 'Total' : 'Adj Total'}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedPlayers.map((name, rowIdx) => {
                const total = totals[name] ?? 0;
                const displayName = displayNames[name] ?? name.split(',')[0].trim();
                return (
                  <tr key={name} className={rowIdx % 2 === 0 ? 'wpc-row-even' : ''}>
                    <td className="wpc-td-player">
                      <span className="player-dot" style={{ background: getPlayerColor(name) }} />
                      {onPlayerClick ? (
                        <button
                          className="icon-btn"
                          style={{ width: 'auto', height: 'auto', padding: 0, marginLeft: 6, color: 'var(--text)', textDecoration: 'underline' }}
                          onClick={() => onPlayerClick(name)}
                          title={`View ${name} profile`}
                        >
                          {displayName}
                        </button>
                      ) : (
                        displayName
                      )}
                    </td>
                    {sorted.map(ev => {
                      const pts = pointsMap[name]?.[ev.eventNumber] ?? null;
                      const ratio = getRatio(pts, ev.eventNumber);
                      const winner = isEventWinner(pts, ev.eventNumber);
                      return (
                        <td
                          key={ev.id}
                          className="wpc-td-pts"
                          style={cellStyle(pts, ratio, winner)}
                          title={winner ? '🏆 Event winner' : undefined}
                        >
                          {pts !== null ? pts : '—'}
                        </td>
                      );
                    })}
                    <td className="wpc-td-total">{total}</td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
});

