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
import { getTooltipTrigger } from '../lib/tooltip';
import { useIsMobile } from '../lib/useIsMobile';

interface CumulativePointsProps {
  events: EventData[];
  topN?: number;
  onOpenPlayer?: (playerName: string) => void;
  rankBasis?: 'adjusted' | 'raw';
}

export default memo(function CumulativePointsChart({ events, topN = 999, onOpenPlayer, rankBasis = 'adjusted' }: CumulativePointsProps) {
  const sorted = useMemo(() => [...events].sort((a, b) => a.eventNumber - b.eventNumber), [events]);

  const topPlayers = useMemo(() => {
    const totals: Record<string, number> = {};
    if (rankBasis === 'raw') {
      for (const ev of sorted) {
        for (const player of ev.players) {
          if (player.didNotPlay) continue;
          totals[player.playerName] = (totals[player.playerName] ?? 0) + player.points;
        }
      }
    } else {
      for (const ev of sorted) {
        for (const standing of ev.standings) {
          totals[standing.playerName] = standing.cumulativePoints;
        }
      }
    }
    return Object.entries(totals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, topN)
      .map(([name]) => name);
  }, [rankBasis, sorted, topN]);

  const { selected, toggle, clearAll, getLineProps } = useLineSelect();
  const c = useChartColors();
  const isMobile = useIsMobile();
  const tooltipTrigger = getTooltipTrigger(isMobile);

  const chartData = useMemo(() => {
    if (rankBasis === 'raw') {
      const running: Record<string, number> = {};
      return sorted.map(ev => {
        const obj: Record<string, number | string> = {
          event: `Evt ${ev.eventNumber}`,
          date: ev.eventDate,
        };
        for (const p of ev.players) {
          if (p.didNotPlay) continue;
          running[p.playerName] = (running[p.playerName] ?? 0) + p.points;
        }
        for (const player of topPlayers) {
          obj[player] = running[player] ?? 0;
        }
        return obj;
      });
    }

    return sorted.map(ev => {
      const obj: Record<string, number | string> = {
        event: `Evt ${ev.eventNumber}`,
        date: ev.eventDate,
      };
      for (const player of topPlayers) {
        const s = ev.standings.find(st => st.playerName === player);
        obj[player] = s ? s.cumulativePoints : 0;
      }
      return obj;
    });
  }, [rankBasis, sorted, topPlayers]);

  if (events.length === 0) {
    return (
      <div className="chart-container empty-state">
        <h3 className="chart-title">Cumulative Points Race</h3>
        <p className="empty-text">Add events to see the points race.</p>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <h3 className="chart-title">Cumulative Points Race</h3>
      <p className="chart-subtitle">
        {topPlayers.length} players · {rankBasis === 'raw' ? 'ranked by total points' : 'ranked by adjusted points'} · click a name below to isolate
      </p>
      <ResponsiveContainer width="100%" height={Math.max(isMobile ? 320 : 460, topPlayers.length * (isMobile ? 14 : 18))}>
        <LineChart data={chartData} margin={{ top: 10, right: isMobile ? 10 : 160, left: isMobile ? -14 : 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
          <XAxis dataKey="event" stroke={c.axis} tick={{ fill: c.tick, fontSize: 12 }} />
          <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 12 }}
            label={isMobile ? undefined : { value: 'Points', angle: -90, position: 'insideLeft', fill: c.tick, fontSize: 12 }}
          />
          <Tooltip trigger={tooltipTrigger} content={<ChartTooltip selected={selected} sortDir="desc" />} />
          {topPlayers.map((player) => {
            const color = getPlayerColor(player);
            const lineProps = getLineProps(player, color);
            const isActive = !selected.size || selected.has(player);
            const lastIndex = chartData.length - 1;
            return (
              <Line
                key={player}
                type="linear"
                dataKey={player}
                stroke={color}
                connectNulls
                {...lineProps}
              >
                {isActive && !isMobile && (
                  <LabelList
                    dataKey={player}
                    position="right"
                    content={({ x, y, value, index }) => {
                      if (index !== lastIndex) return null;
                      const lastName = player.split(',')[0].trim();
                      return (
                        <text
                          x={Number(x) + 8}
                          y={Number(y) + 4}
                          fill={color}
                          fontSize={11}
                          fontWeight={selected.has(player) ? 700 : 400}
                          style={{ pointerEvents: 'none' }}
                        >
                          {`${lastName} (${value})`}
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
      <ClickableLegend players={topPlayers} selected={selected} onToggle={toggle} onClearAll={clearAll} onOpenPlayer={onOpenPlayer} />
    </div>
  );
});
