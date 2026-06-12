import { useMemo, memo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine
} from 'recharts';
import type { EventData, CourseConfig } from '../types/golf';
import { getParsForNine } from '../lib/scoring';
import { useChartColors } from '../lib/useChartColors';
import { Edit2 } from 'lucide-react';

interface HoleStatsProps {
  events: EventData[];
  courseConfig: CourseConfig | null;
  onSetupCourse: () => void;
  onHoleClick: (holeNum: number, nine: 'front' | 'back') => void;
}

// Score type colours
const TYPE_COLORS = {
  eagles:       '#f59e0b',
  birdies:      '#22c55e',
  pars:         '#4f8ef7',
  bogeys:       '#f97316',
  doubleBogeys: '#ef4444',
  triplePlus:   '#7c3aed',
};

interface HoleStat {
  holeNum: number;       // actual hole number (1-9 or 10-18)
  slot: number;          // 1-9 position on the nine
  par: number | null;
  avgScore: number | null;
  avgVsPar: number | null;
  rounds: number;
  best: number | null;
  worst: number | null;
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  triplePlus: number;
}

function computeHoleStats(
  events: EventData[],
  nine: 'front' | 'back',
  courseConfig: CourseConfig | null
): HoleStat[] {
  const pars = courseConfig ? getParsForNine(courseConfig, nine) : null;
  const startHole = nine === 'back' ? 10 : 1;

  // Only include events that played this nine
  const relevant = events.filter(ev => ev.nineHoles === nine);

  return Array.from({ length: 9 }, (_, slotIdx): HoleStat => {
    const holeNum = startHole + slotIdx;
    const par = pars ? pars[slotIdx] : null;

    const scores: number[] = [];
    let eagles = 0, birdies = 0, pars_ = 0, bogeys = 0, doubles = 0, triples = 0;

    for (const ev of relevant) {
      for (const p of ev.players) {
        if (p.didNotPlay) continue;
        const score = p.holes[slotIdx];
        if (score === null || score === undefined) continue;
        scores.push(score);
        if (par !== null) {
          const diff = score - par;
          if (diff <= -2)       eagles++;
          else if (diff === -1) birdies++;
          else if (diff === 0)  pars_++;
          else if (diff === 1)  bogeys++;
          else if (diff === 2)  doubles++;
          else                  triples++;
        }
      }
    }

    const avg = scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : null;
    return {
      holeNum,
      slot: slotIdx + 1,
      par,
      avgScore: avg !== null ? Math.round(avg * 100) / 100 : null,
      avgVsPar: avg !== null && par !== null ? Math.round((avg - par) * 100) / 100 : null,
      rounds: scores.length,
      best: scores.length ? Math.min(...scores) : null,
      worst: scores.length ? Math.max(...scores) : null,
      eagles,
      birdies,
      pars: pars_,
      bogeys,
      doubleBogeys: doubles,
      triplePlus: triples,
    };
  });
}

function avgVsParColor(v: number | null): string {
  if (v === null) return '#888';
  if (v <= -0.5) return '#22c55e';
  if (v <= 0)    return '#84cc16';
  if (v <= 0.5)  return '#f59e0b';
  if (v <= 1)    return '#f97316';
  return '#ef4444';
}

export default memo(function HoleStatsChart({ events, courseConfig, onSetupCourse, onHoleClick }: HoleStatsProps) {
  const c = useChartColors();

  const frontStats = useMemo(() => computeHoleStats(events, 'front', courseConfig), [events, courseConfig]);
  const backStats  = useMemo(() => computeHoleStats(events, 'back',  courseConfig), [events, courseConfig]);

  const frontEvents = events.filter(e => e.nineHoles === 'front').length;
  const backEvents  = events.filter(e => e.nineHoles === 'back').length;

  if (events.length === 0) {
    return (
      <div className="chart-container empty-state">
        <h3 className="chart-title">Hole Statistics</h3>
        <p className="empty-text">Add events to see hole-by-hole stats.</p>
      </div>
    );
  }

  function renderNine(stats: HoleStat[], label: string, evCount: number, nine: 'front' | 'back') {
    const hasData = stats.some(s => s.rounds > 0);
    const hasPar  = stats.some(s => s.par !== null);
    const avgParLine = hasPar
      ? stats.filter(s => s.avgVsPar !== null).reduce((s, h) => s + (h.avgVsPar ?? 0), 0) /
        Math.max(1, stats.filter(s => s.avgVsPar !== null).length)
      : null;

    // Bar chart data: average vs par per hole so mixed pars stay comparable.
    const avgChartData = stats.map(s => ({
      hole: `H${s.holeNum}`,
      avg: s.avgScore,
      par: s.par,
      vsPar: s.avgVsPar,
    }));

    // Stacked distribution data
    const distChartData = stats.map(s => ({
      hole: `H${s.holeNum}`,
      eagles:       s.eagles,
      birdies:      s.birdies,
      pars:         s.pars,
      bogeys:       s.bogeys,
      doubleBogeys: s.doubleBogeys,
      triplePlus:   s.triplePlus,
    }));

    return (
      <div className="chart-container" key={label}>
        <h3 className="chart-title">
          {label}
          <span className="chart-badge">{evCount} event{evCount !== 1 ? 's' : ''}</span>
        </h3>
        {!hasData && (
          <p className="empty-text" style={{ padding: '8px 0' }}>No rounds played on this nine yet.</p>
        )}

        {hasData && (
          <>
            {/* ── Avg score vs par bar chart ─────────────────────── */}
            {hasPar && (
              <>
                <p className="chart-subtitle">Average score versus par per hole</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={avgChartData} margin={{ top: 10, right: 10, left: -10, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                    <XAxis dataKey="hole" stroke={c.axis} tick={{ fill: c.tick, fontSize: 12 }} />
                    <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 12 }} domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                      labelStyle={{ color: c.text2, fontWeight: 700 }}
                      formatter={(val, key) => {
                        const n = Number(val);
                        if (key === 'avg') return [n.toFixed(2), 'Avg score'];
                        if (key === 'par') return [String(n), 'Par'];
                        if (key === 'vsPar') return [`${n >= 0 ? '+' : ''}${n.toFixed(2)}`, 'vs par'];
                        return [String(n), String(key)];
                      }}
                    />
                    <ReferenceLine y={0} stroke={c.grid} />
                    <Bar dataKey="vsPar" name="vs par" radius={[3, 3, 0, 0]}>
                      {avgChartData.map((d, i) => (
                        <Cell key={i} fill={avgVsParColor(d.vsPar)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </>
            )}

            {/* ── Score distribution stacked bar ─────────────────── */}
            <p className="chart-subtitle" style={{ marginTop: hasPar ? 16 : 0 }}>
              Score distribution per hole (stacked count)
              {avgParLine !== null && (
                <span style={{ marginLeft: 10, color: avgVsParColor(avgParLine), fontWeight: 600 }}>
                  Nine avg: {avgParLine >= 0 ? '+' : ''}{avgParLine.toFixed(2)} vs par
                </span>
              )}
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={distChartData} margin={{ top: 4, right: 10, left: -10, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                <XAxis dataKey="hole" stroke={c.axis} tick={{ fill: c.tick, fontSize: 12 }} />
                <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                  labelStyle={{ color: c.text2, fontWeight: 700 }}
                />
                <Bar dataKey="eagles"       name="Eagles"    stackId="d" fill={TYPE_COLORS.eagles} />
                <Bar dataKey="birdies"      name="Birdies"   stackId="d" fill={TYPE_COLORS.birdies} />
                <Bar dataKey="pars"         name="Pars"      stackId="d" fill={TYPE_COLORS.pars} />
                <Bar dataKey="bogeys"       name="Bogeys"    stackId="d" fill={TYPE_COLORS.bogeys} />
                <Bar dataKey="doubleBogeys" name="Dbl Bogey" stackId="d" fill={TYPE_COLORS.doubleBogeys} />
                <Bar dataKey="triplePlus"   name="Trpl+"     stackId="d" fill={TYPE_COLORS.triplePlus} />
              </BarChart>
            </ResponsiveContainer>

            {/* ── Per-hole detail table ───────────────────────────── */}
            <div className="hs-table-wrap">
              <table className="hs-table">
                <thead>
                  <tr>
                    <th>Hole</th>
                    {hasPar && <th>Par</th>}
                    <th>Rounds</th>
                    <th>Avg</th>
                    {hasPar && <th title="Average vs par">vs Par</th>}
                    <th title="Best (lowest) score">Best</th>
                    <th title="Worst (highest) score">Worst</th>
                    <th style={{ color: TYPE_COLORS.eagles }}>Eagle</th>
                    <th style={{ color: TYPE_COLORS.birdies }}>Birdie</th>
                    <th style={{ color: TYPE_COLORS.pars }}>Par</th>
                    <th style={{ color: TYPE_COLORS.bogeys }}>Bogey</th>
                    <th style={{ color: TYPE_COLORS.doubleBogeys }}>Dbl</th>
                    <th style={{ color: TYPE_COLORS.triplePlus }}>Trpl+</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'hs-even' : ''}>
                      <td className="hs-td-hole">
                        <button
                          className="hs-hole-badge hs-hole-clickable"
                          onClick={() => onHoleClick(s.holeNum, nine)}
                          title={`View Hole ${s.holeNum} profile`}
                        >
                          {s.holeNum}
                        </button>
                      </td>
                      {hasPar && <td className="hs-td-center">{s.par ?? '—'}</td>}
                      <td className="hs-td-center">{s.rounds}</td>
                      <td className="hs-td-center" style={{ fontWeight: 600 }}>
                        {s.avgScore !== null ? s.avgScore.toFixed(2) : '—'}
                      </td>
                      {hasPar && (
                        <td className="hs-td-center" style={{ color: avgVsParColor(s.avgVsPar), fontWeight: 700 }}>
                          {s.avgVsPar !== null
                            ? (s.avgVsPar >= 0 ? '+' : '') + s.avgVsPar.toFixed(2)
                            : '—'}
                        </td>
                      )}
                      <td className="hs-td-center" style={{ color: '#22c55e' }}>{s.best ?? '—'}</td>
                      <td className="hs-td-center" style={{ color: '#ef4444' }}>{s.worst ?? '—'}</td>
                      <td className="hs-td-center" style={{ color: TYPE_COLORS.eagles }}>{s.eagles || '—'}</td>
                      <td className="hs-td-center" style={{ color: TYPE_COLORS.birdies }}>{s.birdies || '—'}</td>
                      <td className="hs-td-center">{s.pars || '—'}</td>
                      <td className="hs-td-center" style={{ color: TYPE_COLORS.bogeys }}>{s.bogeys || '—'}</td>
                      <td className="hs-td-center" style={{ color: TYPE_COLORS.doubleBogeys }}>{s.doubleBogeys || '—'}</td>
                      <td className="hs-td-center" style={{ color: TYPE_COLORS.triplePlus }}>{s.triplePlus || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      {!courseConfig && (
        <div className="chart-container" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <h3 className="chart-title">Hole Statistics</h3>
            <p className="chart-subtitle">
              Set up your course scorecard to see average vs par, colour-coded difficulty, and score distribution per hole.
            </p>
          </div>
          <button className="btn-primary" onClick={onSetupCourse} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <Edit2 size={14} /> Set Up Scorecard
          </button>
        </div>
      )}
      {frontEvents > 0 && renderNine(frontStats, 'Front 9 — Holes 1–9', frontEvents, 'front')}
      {backEvents  > 0 && renderNine(backStats,  'Back 9 — Holes 10–18', backEvents,  'back')}
    </>
  );
});
