import { useMemo, memo } from 'react';
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
}

export default memo(function GrossNetScoresChart({ events, scoreType = 'net', topN = 12 }: GrossNetScoresProps) {
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

  const { selected, toggle, clearAll, getLineProps } = useLineSelect(topPlayers);
  const c = useChartColors();
  const isMobile = useIsMobile();
  const tooltipTrigger = getTooltipTrigger(isMobile);

  const chartData = useMemo(() => {
    return sorted.map(ev => {
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
      return obj;
    });
  }, [sorted, topPlayers, scoreType]);

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
      <p className="chart-subtitle">Lower is better. {playerScopeLabel}. Click a name below to highlight.</p>
      <ResponsiveContainer width="100%" height={380}>
        <LineChart data={chartData} margin={{ top: 10, right: isMobile ? 10 : 30, left: isMobile ? -14 : 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
          <XAxis dataKey="event" stroke={c.axis} tick={{ fill: c.tick, fontSize: 12 }} />
          <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 12 }}
            label={isMobile ? undefined : { value: label, angle: -90, position: 'insideLeft', fill: c.tick, fontSize: 11 }}
            domain={(['dataMin - 2', 'dataMax + 2'] as [string, string])}
          />
          <Tooltip trigger={tooltipTrigger} content={<ChartTooltip selected={selected} sortDir="asc" />} />
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
        </LineChart>
      </ResponsiveContainer>
      <ClickableLegend players={topPlayers} selected={selected} onToggle={toggle} onClearAll={clearAll} />
    </div>
  );
});
