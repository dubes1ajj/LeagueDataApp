import { useMemo, memo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import type { EventData } from '../types/golf';
import { getPlayerColor } from '../lib/colors';
import { useLineSelect } from '../lib/useLineHover';
import { ChartTooltip } from './ChartTooltip';
import { ClickableLegend } from './ClickableLegend';
import { useChartColors } from '../lib/useChartColors';
import { getTooltipTrigger } from '../lib/tooltip';
import { useIsMobile } from '../lib/useIsMobile';

interface GrossNetScoresProps {
  events: EventData[];
  scoreType?: 'gross' | 'net';
  topN?: number;
  onOpenPlayer?: (playerName: string) => void;
}

export default memo(function GrossNetScoresChart({ events, scoreType = 'net', topN = 12, onOpenPlayer }: GrossNetScoresProps) {
  const movingAverageWindow = 3;
  const [showMovingAverage, setShowMovingAverage] = useState(true);
  const sorted = useMemo(() => [...events].sort((a, b) => a.eventNumber - b.eventNumber), [events]);

  const topPlayers = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const ev of sorted) {
      for (const p of ev.players) {
        if (!p.didNotPlay) totals[p.playerName] = (totals[p.playerName] ?? 0) + p.points;
      }
    }
    return Object.entries(totals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, topN)
      .map(([name]) => name);
  }, [sorted, topN]);

  const { selected, toggle, clearAll, getLineProps } = useLineSelect();
  const c = useChartColors();
  const isMobile = useIsMobile();
  const tooltipTrigger = getTooltipTrigger(isMobile);
  const movingAverageKey = `${movingAverageWindow}-Event Moving Avg`;

  const movingAverages = useMemo(() => {
    const eventAverages = sorted.map((ev) => {
      const scores = topPlayers
        .map((player) => {
          const pd = ev.players.find((p) => p.playerName === player);
          if (!pd || pd.didNotPlay) return null;
          return scoreType === 'gross' ? pd.grossScore : pd.netScore;
        })
        .filter((score): score is number => score !== null);

      if (!scores.length) return null;
      return scores.reduce((sum, score) => sum + score, 0) / scores.length;
    });

    return eventAverages.map((_, index) => {
      let sum = 0;
      let count = 0;
      const start = Math.max(0, index - movingAverageWindow + 1);
      for (let i = start; i <= index; i++) {
        const value = eventAverages[i];
        if (value === null) continue;
        sum += value;
        count += 1;
      }
      return count ? Math.round((sum / count) * 100) / 100 : null;
    });
  }, [sorted, topPlayers, scoreType, movingAverageWindow]);

  const chartData = useMemo(() => {
    return sorted.map((ev, index) => {
      const obj: Record<string, number | string> = {
        event: `Evt ${ev.eventNumber}`,
        date: ev.eventDate,
      };
      for (const player of topPlayers) {
        const pd = ev.players.find(p => p.playerName === player);
        if (pd && !pd.didNotPlay) {
          obj[player] = scoreType === 'gross' ? (pd.grossScore ?? 0) : (pd.netScore ?? 0);
        }
      }
      const movingAverage = movingAverages[index];
      if (showMovingAverage && movingAverage !== null) obj[movingAverageKey] = movingAverage;
      return obj;
    });
  }, [sorted, topPlayers, scoreType, movingAverages, movingAverageKey, showMovingAverage]);

  const label = scoreType === 'gross' ? 'Gross Scores' : 'Net Scores';
  const playerScopeLabel = topN >= 999 ? 'All active players' : `Top ${topN} players by total points`;

  if (events.length === 0) {
    return (
      <div className="chart-container empty-state">
        <h3 className="chart-title">{label} Over Time</h3>
        <p className="empty-text">Add events to see score trends.</p>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <h3 className="chart-title">{label} Over Time</h3>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p className="chart-subtitle" style={{ margin: 0 }}>
          Lower is better. {playerScopeLabel}. Dashed line shows {movingAverageWindow}-event moving average. Click a name below to highlight.
        </p>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text2)', fontSize: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showMovingAverage}
            onChange={(event) => setShowMovingAverage(event.target.checked)}
          />
          Show moving average
        </label>
      </div>
      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={chartData} margin={{ top: 10, right: isMobile ? 10 : 30, left: isMobile ? -14 : 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
          <XAxis dataKey="event" stroke={c.axis} tick={{ fill: c.tick, fontSize: 12 }} />
          <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 12 }}
            label={isMobile ? undefined : { value: label, angle: -90, position: 'insideLeft', fill: c.tick, fontSize: 11 }}
            domain={(['dataMin - 2', 'dataMax + 2'] as [string, string])}
          />
          <Tooltip trigger={tooltipTrigger} content={<ChartTooltip selected={selected} pinnedKeys={showMovingAverage ? [movingAverageKey] : []} sortDir="asc" />} />
          {topPlayers.map(player => (
            <Line
              key={player}
              type="linear"
              dataKey={player}
              stroke={getPlayerColor(player)}
              connectNulls
              {...getLineProps(player, getPlayerColor(player))}
            />
          ))}
          {showMovingAverage && (
            <Line
              key={movingAverageKey}
              type="monotone"
              dataKey={movingAverageKey}
              stroke="var(--text)"
              strokeWidth={3}
              strokeDasharray="8 6"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      <ClickableLegend players={topPlayers} selected={selected} onToggle={toggle} onClearAll={clearAll} onOpenPlayer={onOpenPlayer} />
    </div>
  );
});
