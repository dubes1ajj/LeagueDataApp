import { useMemo, memo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList
} from 'recharts';
import type { EventData, CourseConfig } from '../types/golf';
import { computeBreakdown, getParsForNine } from '../lib/scoring';
import { Edit2 } from 'lucide-react';
import { useChartColors } from '../lib/useChartColors';
import { getPlayerColor } from '../lib/colors';
import { buildDisplayNames } from '../lib/displayNames';
import { useIsMobile } from '../lib/useIsMobile';

interface ScoringBreakdownProps {
  events: EventData[];
  courseConfig: CourseConfig | null;
  onSetupCourse: () => void;
}

const SCORE_KEYS = [
  { key: 'eagles',       label: 'Eagles',     color: '#f59e0b' },
  { key: 'birdies',      label: 'Birdies',    color: '#22c55e' },
  { key: 'pars',         label: 'Pars',       color: '#4f8ef7' },
  { key: 'bogeys',       label: 'Bogeys',     color: '#f97316' },
  { key: 'doubleBogeys', label: 'Dbl Bogey',  color: '#ef4444' },
  { key: 'tripleBogeys', label: 'Trpl+',      color: '#7c3aed' },
  { key: 'other',        label: '4+ Over',    color: '#3f3f5a' },
];

interface RowData {
  name: string;
  fullName: string;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  tripleBogeys: number;
  other: number;
  totalHoles: number;
  totalPoints: number;
}

export default memo(function ScoringBreakdownChart({ events, courseConfig, onSetupCourse }: ScoringBreakdownProps) {
  const c = useChartColors();
  const isMobile = useIsMobile();
  type SortKey = 'name' | 'totalHoles' | 'totalPoints' | 'eagles' | 'birdies' | 'pars' | 'bogeys' | 'doubleBogeys' | 'tripleBogeys' | 'other';
  const [sortKey, setSortKey] = useState<SortKey>('totalPoints');
  const [sortAsc, setSortAsc] = useState(false);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(key === 'name'); }
  }

  function SortArrow({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span style={{ opacity: 0.3, fontSize: 10, marginLeft: 3 }}>↕</span>;
    return <span style={{ fontSize: 10, marginLeft: 3 }}>{sortAsc ? '↑' : '↓'}</span>;
  }

  const chartData = useMemo(() => {
    const totals: Record<string, Record<string, number>> = {};

    for (const ev of events) {
      const parValues = courseConfig ? getParsForNine(courseConfig, ev.nineHoles ?? 'front') : null;

      for (const p of ev.players) {
        if (p.didNotPlay) continue;
        if (!totals[p.playerName]) {
          totals[p.playerName] = {
            eagles: 0, birdies: 0, pars: 0, bogeys: 0,
            doubleBogeys: 0, tripleBogeys: 0, other: 0, totalPoints: 0, totalHoles: 0,
          };
        }

        if (parValues) {
          const bd = computeBreakdown(p.holes, parValues);
          totals[p.playerName].eagles       += bd.eagles;
          totals[p.playerName].birdies      += bd.birdies;
          totals[p.playerName].pars         += bd.pars;
          totals[p.playerName].bogeys       += bd.bogeys;
          totals[p.playerName].doubleBogeys += bd.doubleBogeys;
          totals[p.playerName].tripleBogeys += bd.tripleBogeys;
          totals[p.playerName].other        += bd.other;
          totals[p.playerName].totalHoles   +=
            bd.eagles + bd.birdies + bd.pars + bd.bogeys + bd.doubleBogeys + bd.tripleBogeys + bd.other;
        }
        totals[p.playerName].totalPoints += p.points;
      }
    }

    const playerNames = Object.keys(totals);
    const displayNames = buildDisplayNames(playerNames);

    return Object.entries(totals)
      .sort(([, a], [, b]) => b.totalPoints - a.totalPoints)
      .map(([name, data]): RowData => ({
        name: displayNames[name] ?? name.split(',')[0].trim(),
        fullName: name,
        eagles:       data.eagles,
        birdies:      data.birdies,
        pars:         data.pars,
        bogeys:       data.bogeys,
        doubleBogeys: data.doubleBogeys,
        tripleBogeys: data.tripleBogeys,
        other:        data.other,
        totalHoles:   data.totalHoles,
        totalPoints:  data.totalPoints,
      }));
  }, [events, courseConfig]);

  if (events.length === 0) {
    return (
      <div className="chart-container empty-state">
        <h3 className="chart-title">Scoring Breakdown</h3>
        <p className="empty-text">Add events to see scoring breakdown.</p>
      </div>
    );
  }

  if (!courseConfig) {
    return (
      <div className="chart-container empty-state">
        <h3 className="chart-title">Scoring Breakdown</h3>
        <p className="empty-text" style={{ marginBottom: 16 }}>
          A course scorecard is required to compute eagles, birdies, pars, etc.
        </p>
        <button className="btn-primary" onClick={onSetupCourse} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Edit2 size={14} /> Set Up Course Scorecard
        </button>
      </div>
    );
  }

  const hasData = chartData.some(d => d.totalHoles > 0);

  return (
    <>
      {/* ── Horizontal stacked bar ──────────────────────────────────── */}
      <div className="chart-container">
        <h3 className="chart-title">Scoring Breakdown — All Players</h3>
        <p className="chart-subtitle">
          Stacked by score type · bar length = total holes played · sorted by points
        </p>

        {/* Legend */}
        <div className="sc-breakdown-legend">
          {SCORE_KEYS.map(({ label, color }) => (
            <span key={label} className="sc-breakdown-badge">
              <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block', marginRight: 4 }} />
              {label}
            </span>
          ))}
        </div>

        {!hasData ? (
          <p className="empty-text" style={{ padding: '16px 0' }}>
            No scoring data yet — hole scores will appear here once course pars are set and events are imported.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 28)}>
            <BarChart
              layout="vertical"
              data={chartData}
              margin={{ top: 4, right: isMobile ? 28 : 50, left: isMobile ? 0 : 10, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={false} />
              <XAxis type="number" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={isMobile ? 74 : 110}
                stroke={c.axis}
                tick={{ fill: c.tick, fontSize: isMobile ? 10 : 12 }}
              />
              <Tooltip
                contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                labelStyle={{ color: c.text2, fontWeight: 700 }}
                formatter={(val, key) => {
                  const sk = SCORE_KEYS.find(s => s.key === key);
                  const n = Number(val);
                  return [`${n} hole${n !== 1 ? 's' : ''}`, sk?.label ?? String(key)];
                }}
                cursor={{ fill: 'rgba(128,128,128,0.06)' }}
              />
              {SCORE_KEYS.map(({ key, color }, i) => (
                <Bar key={key} dataKey={key} stackId="s" fill={color} isAnimationActive={false}>
                  {/* Show total holes label on last segment */}
                  {i === SCORE_KEYS.length - 1 && (
                    <LabelList
                      dataKey="totalHoles"
                      position="right"
                      style={{ fill: c.tick, fontSize: 11 }}
                      formatter={(v: unknown) => (Number(v) > 0 ? String(v) : '')}
                    />
                  )}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Summary table ───────────────────────────────────────────── */}
      {hasData && (() => {
        const sortedData = [...chartData].sort((a, b) => {
          const av = a[sortKey as keyof RowData];
          const bv = b[sortKey as keyof RowData];
          let cmp = 0;
          if (typeof av === 'string' && typeof bv === 'string') cmp = av.localeCompare(bv);
          else cmp = (av as number) - (bv as number);
          return sortAsc ? cmp : -cmp;
        });

        return (
          <div className="chart-container">
            <h3 className="chart-title">Scoring Counts Table</h3>
            <p className="chart-subtitle">Click any column header to sort · exact counts per player</p>
            <div className="sc-table-wrap">
              <table className="sc-counts-table">
                <thead>
                  <tr>
                    <th
                      className={`sc-ct-player sc-th-sortable ${sortKey === 'name' ? 'sc-th-active' : ''}`}
                      onClick={() => handleSort('name')}
                    >
                      Player <SortArrow col="name" />
                    </th>
                    {SCORE_KEYS.map(({ label, color, key }) => (
                      <th
                        key={label}
                        className={`sc-ct-num sc-th-sortable ${sortKey === key ? 'sc-th-active' : ''}`}
                        style={{ borderBottom: `2px solid ${color}` }}
                        onClick={() => handleSort(key as SortKey)}
                      >
                        {label} <SortArrow col={key as SortKey} />
                      </th>
                    ))}
                    <th
                      className={`sc-ct-num sc-ct-total sc-th-sortable ${sortKey === 'totalHoles' ? 'sc-th-active' : ''}`}
                      onClick={() => handleSort('totalHoles')}
                    >
                      Holes <SortArrow col="totalHoles" />
                    </th>
                    <th
                      className={`sc-ct-num sc-ct-pts sc-th-sortable ${sortKey === 'totalPoints' ? 'sc-th-active' : ''}`}
                      onClick={() => handleSort('totalPoints')}
                    >
                      Points <SortArrow col="totalPoints" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedData.map((row, idx) => {
                    const r = row as unknown as Record<string, number | string>;
                    const totalPct = (key: string) => {
                      if (!row.totalHoles) return '';
                      const pct = Math.round(((r[key] as number) / row.totalHoles) * 100);
                      return pct > 0 ? ` (${pct}%)` : '';
                    };
                    return (
                      <tr key={row.fullName} className={idx % 2 === 0 ? 'sc-ct-even' : ''}>
                        <td className="sc-ct-player-cell">
                          <span className="player-dot" style={{ background: getPlayerColor(row.fullName) }} />
                          {row.name}
                        </td>
                        {SCORE_KEYS.map(({ key, color }) => (
                          <td key={key} className="sc-ct-num-cell">
                            {(r[key] as number) > 0
                              ? <><span style={{ color, fontWeight: 600 }}>{r[key] as number}</span><span className="sc-ct-pct">{totalPct(key)}</span></>
                              : <span style={{ color: c.text2 }}>—</span>
                            }
                          </td>
                        ))}
                        <td className="sc-ct-num-cell sc-ct-total-cell">{row.totalHoles}</td>
                        <td className="sc-ct-num-cell sc-ct-pts-cell">{row.totalPoints}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}
    </>
  );
});
