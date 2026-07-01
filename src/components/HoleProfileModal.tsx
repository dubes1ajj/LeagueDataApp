import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, PieChart, Pie
} from 'recharts';
import type { EventData, CourseConfig } from '../types/golf';
import { getParsForNine } from '../lib/scoring';
import { getPlayerColor } from '../lib/colors';
import { useChartColors } from '../lib/useChartColors';
import { buildDisplayNames } from '../lib/displayNames';
import { X } from 'lucide-react';

interface HoleProfileModalProps {
  holeNum: number;        // 1–18
  nine: 'front' | 'back';
  events: EventData[];
  courseConfig: CourseConfig | null;
  onClose: () => void;
  onPlayerClick?: (playerName: string) => void;
  onShowHole?: (holeNum: number, nine: 'front' | 'back') => void;
}

const TYPE_COLORS: Record<string, string> = {
  Eagles:    '#f59e0b',
  Birdies:   '#22c55e',
  Pars:      '#4f8ef7',
  Bogeys:    '#f97316',
  'Dbl Bogeys': '#ef4444',
  'Trpl+':   '#7c3aed',
};

function avgVsParColor(v: number | null): string {
  if (v === null) return '#888';
  if (v <= -0.5) return '#22c55e';
  if (v <= 0)    return '#84cc16';
  if (v <= 0.5)  return '#f59e0b';
  if (v <= 1)    return '#f97316';
  return '#ef4444';
}

export default function HoleProfileModal({ holeNum, nine, events, courseConfig, onClose, onPlayerClick, onShowHole }: HoleProfileModalProps) {
  const c = useChartColors();
  const slotIdx = holeNum - (nine === 'back' ? 10 : 1);
  const minHole = nine === 'back' ? 10 : 1;
  const maxHole = nine === 'back' ? 18 : 9;
  const previousHole = holeNum > minHole ? holeNum - 1 : maxHole;
  const nextHole = holeNum < maxHole ? holeNum + 1 : minHole;
  const pars = courseConfig ? getParsForNine(courseConfig, nine) : null;
  const par = pars ? pars[slotIdx] : null;

  const relevantEvents = useMemo(() =>
    events.filter(ev => ev.nineHoles === nine), [events, nine]);

  const allScores = useMemo(() => {
    const scores: number[] = [];
    for (const ev of relevantEvents) {
      for (const player of ev.players) {
        if (player.didNotPlay) continue;
        const score = player.holes[slotIdx];
        if (score !== null && score !== undefined) scores.push(score);
      }
    }
    return scores;
  }, [relevantEvents, slotIdx]);

  const overallAvg = allScores.length
    ? Math.round(allScores.reduce((s, n) => s + n, 0) / allScores.length * 100) / 100
    : null;

  const overallVsPar = overallAvg !== null && par !== null
    ? Math.round((overallAvg - par) * 100) / 100 : null;

  // ── Per-player stats for this hole ────────────────────────────────────
  const playerStats = useMemo(() => {
    const map: Record<string, { scores: number[]; name: string }> = {};
    for (const ev of relevantEvents) {
      for (const p of ev.players) {
        if (p.didNotPlay) continue;
        const score = p.holes[slotIdx];
        if (score === null || score === undefined) continue;
        if (!map[p.playerName]) map[p.playerName] = { scores: [], name: p.playerName };
        map[p.playerName].scores.push(score);
      }
    }
    const countsByAverage = new Map<string, number>();

    const ranked = Object.values(map)
      .map(({ name, scores }) => {
        const avg = scores.reduce((s, n) => s + n, 0) / scores.length;
        const roundedAvg = Math.round(avg * 100) / 100;
        const averageKey = roundedAvg.toFixed(2);
        countsByAverage.set(averageKey, (countsByAverage.get(averageKey) ?? 0) + 1);
        return {
          name,
          rounds:  scores.length,
          avg:     roundedAvg,
          avgVsPar: par !== null ? Math.round((avg - par) * 100) / 100 : null,
          best:    Math.min(...scores),
          worst:   Math.max(...scores),
          scores,
        };
      })
      .sort((a, b) => {
        if (a.avg !== b.avg) return a.avg - b.avg; // lower = better
        return b.rounds - a.rounds;
      });

    return ranked.reduce<Array<typeof ranked[number] & { rank: number; tied: boolean; vsFieldAvg: number | null }>>((acc, entry, index) => {
      const previous = acc[index - 1];
      const rank = previous && previous.avg === entry.avg ? previous.rank : index + 1;
      acc.push({
        ...entry,
        rank,
        tied: (countsByAverage.get(entry.avg.toFixed(2)) ?? 0) > 1,
        vsFieldAvg: overallAvg !== null ? Math.round((entry.avg - overallAvg) * 100) / 100 : null,
      });
      return acc;
    }, []);
  }, [overallAvg, relevantEvents, slotIdx, par]);

  const displayNames = useMemo(() =>
    buildDisplayNames(playerStats.map(p => p.name)), [playerStats]);

  const scoreFreq = useMemo(() => {
    const freq: Record<number, number> = {};
    for (const s of allScores) freq[s] = (freq[s] ?? 0) + 1;
    return Object.entries(freq)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([scoreStr, count]) => {
        const s = Number(scoreStr);
        return {
          score: s,
          name: par !== null ? `${s} (${s - par >= 0 ? '+' : ''}${s - par})` : String(s),
          count,
        };
      });
  }, [allScores, par]);

  const pieData = useMemo(() => {
    if (par === null) return [];
    let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0, triples = 0;
    for (const s of allScores) {
      const d = s - par;
      if (d <= -2)       eagles++;
      else if (d === -1) birdies++;
      else if (d === 0)  pars++;
      else if (d === 1)  bogeys++;
      else if (d === 2)  doubles++;
      else               triples++;
    }
    return [
      { name: 'Eagles',      value: eagles,  fill: TYPE_COLORS.Eagles },
      { name: 'Birdies',     value: birdies, fill: TYPE_COLORS.Birdies },
      { name: 'Pars',        value: pars,    fill: TYPE_COLORS.Pars },
      { name: 'Bogeys',      value: bogeys,  fill: TYPE_COLORS.Bogeys },
      { name: 'Dbl Bogeys',  value: doubles, fill: TYPE_COLORS['Dbl Bogeys'] },
      { name: 'Trpl+',       value: triples, fill: TYPE_COLORS['Trpl+'] },
    ].filter(d => d.value > 0);
  }, [allScores, par]);

  // ── Score trend over events ───────────────────────────────────────────
  const trendData = useMemo(() => {
    return relevantEvents.map(ev => {
      const scores = ev.players
        .filter(p => !p.didNotPlay && p.holes[slotIdx] !== null && p.holes[slotIdx] !== undefined)
        .map(p => p.holes[slotIdx] as number);
      const avg = scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : null;
      return {
        event: `E${ev.eventNumber}`,
        avg: avg !== null ? Math.round(avg * 100) / 100 : null,
        par,
        scorers: scores.length,
      };
    });
  }, [relevantEvents, slotIdx, par]);

  const holeInfo = courseConfig?.holes[holeNum - 1];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="pp-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="pp-header">
          <div className="pp-header-left">
            <div className="pp-avatar" style={{ background: avgVsParColor(overallVsPar), fontSize: 18, fontWeight: 800 }}>
              {holeNum}
            </div>
            <div>
              <h2 className="pp-name">Hole {holeNum}</h2>
              <p className="pp-rank">
                {nine === 'back' ? 'Back 9' : 'Front 9'}
                {par !== null && <><span className="pp-rank-sep">·</span>Par <strong>{par}</strong></>}
                {holeInfo?.yardage && <><span className="pp-rank-sep">·</span><strong>{holeInfo.yardage}</strong> yds</>}
                {holeInfo?.strokeIndex && <><span className="pp-rank-sep">·</span>H'cap <strong>{holeInfo.strokeIndex}</strong></>}
                {overallVsPar !== null && (
                  <><span className="pp-rank-sep">·</span>
                  <strong style={{ color: avgVsParColor(overallVsPar) }}>
                    Avg {overallVsPar >= 0 ? '+' : ''}{overallVsPar.toFixed(2)} vs par
                  </strong></>
                )}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn-secondary"
              onClick={() => onShowHole?.(previousHole, nine)}
              title={`Show Hole ${previousHole}`}
            >
              Previous Hole
            </button>
            <button
              className="btn-secondary"
              onClick={() => onShowHole?.(nextHole, nine)}
              title={`Show Hole ${nextHole}`}
            >
              Next Hole
            </button>
            <button className="icon-btn" onClick={onClose}><X size={22} /></button>
          </div>
        </div>

        <div className="pp-body">
          {allScores.length === 0 && (
            <p style={{ color: 'var(--text2)', padding: '16px 0' }}>No rounds played on this hole yet.</p>
          )}

          {allScores.length > 0 && (
            <>
              {/* ── Summary stat cards ──────────────────────────── */}
              <div className="pp-stats-row">
                <div className="pp-stat-card">
                  <span className="pp-stat-label">Rounds</span>
                  <span className="pp-stat-value">{allScores.length}</span>
                </div>
                <div className="pp-stat-card">
                  <span className="pp-stat-label">Avg Score</span>
                  <span className="pp-stat-value">{overallAvg?.toFixed(2) ?? '—'}</span>
                  {overallVsPar !== null && (
                    <span className="pp-stat-sub" style={{ color: avgVsParColor(overallVsPar) }}>
                      {overallVsPar >= 0 ? '+' : ''}{overallVsPar.toFixed(2)} vs par
                    </span>
                  )}
                </div>
                <div className="pp-stat-card">
                  <span className="pp-stat-label">Best Score</span>
                  <span className="pp-stat-value" style={{ color: '#22c55e' }}>{Math.min(...allScores)}</span>
                  {par !== null && <span className="pp-stat-sub">{Math.min(...allScores) - par >= 0 ? '+' : ''}{Math.min(...allScores) - par} vs par</span>}
                </div>
                <div className="pp-stat-card">
                  <span className="pp-stat-label">Worst Score</span>
                  <span className="pp-stat-value" style={{ color: '#ef4444' }}>{Math.max(...allScores)}</span>
                  {par !== null && <span className="pp-stat-sub">+{Math.max(...allScores) - par} vs par</span>}
                </div>
                {par !== null && pieData.find(d => d.name === 'Birdies') && (
                  <div className="pp-stat-card">
                    <span className="pp-stat-label">Birdies</span>
                    <span className="pp-stat-value" style={{ color: TYPE_COLORS.Birdies }}>
                      {pieData.find(d => d.name === 'Birdies')?.value ?? 0}
                    </span>
                    <span className="pp-stat-sub">
                      {Math.round(((pieData.find(d => d.name === 'Birdies')?.value ?? 0) / allScores.length) * 100)}%
                    </span>
                  </div>
                )}
                {par !== null && pieData.find(d => d.name === 'Eagles') && (
                  <div className="pp-stat-card">
                    <span className="pp-stat-label">Eagles</span>
                    <span className="pp-stat-value" style={{ color: TYPE_COLORS.Eagles }}>
                      {pieData.find(d => d.name === 'Eagles')?.value ?? 0}
                    </span>
                  </div>
                )}
              </div>

              {/* ── Avg trend over events ───────────────────────── */}
              {trendData.length >= 2 && (
                <>
                  <div className="pp-section-title">Field Average Trend</div>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={trendData} margin={{ top: 4, right: 16, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                      <XAxis dataKey="event" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} domain={['auto', 'auto']} />
                      {par !== null && <CartesianGrid horizontal={false} strokeDasharray="0" stroke={c.grid} />}
                      <Tooltip
                        contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                        labelStyle={{ color: c.text2 }}
                        formatter={(v: unknown) => [Number(v).toFixed(2), 'Field avg']}
                      />
                      {par !== null && (
                        <Line type="linear" dataKey="par" stroke={c.grid} strokeDasharray="4 3" dot={false} name="Par" />
                      )}
                      <Line type="linear" dataKey="avg" stroke="#4f8ef7" strokeWidth={2.5}
                        dot={{ r: 4, fill: '#4f8ef7' }} name="Avg score" connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </>
              )}

              {/* ── Score frequency & pie ────────────────────────── */}
              <div className="pp-section-title">Score Distribution</div>
              <div className="pp-charts-row">
                <div className="pp-chart-half">
                  <p className="pp-chart-label">Score frequency</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={scoreFreq} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                      <XAxis dataKey="name" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                        labelStyle={{ color: c.text2 }}
                        formatter={(v) => [v, 'Times scored']}
                      />
                      <Bar dataKey="count" name="Times scored" radius={[3, 3, 0, 0]}>
                        {scoreFreq.map((entry, i) => {
                          const diff = par !== null ? entry.score - par : 0;
                          const fill = diff <= -2 ? '#f59e0b' : diff === -1 ? '#22c55e'
                            : diff === 0 ? '#4f8ef7' : diff === 1 ? '#f97316'
                            : diff === 2 ? '#ef4444' : '#7c3aed';
                          return <Cell key={i} fill={fill} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {pieData.length > 0 && (
                  <div className="pp-chart-half">
                    <p className="pp-chart-label">Score type breakdown</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name"
                          cx="50%" cy="50%" outerRadius={65} label={({ name, percent }: { name?: string; percent?: number }) =>
                            `${name ?? ''} ${Math.round((percent ?? 0) * 100)}%`
                          } labelLine={false} fontSize={10}>
                          {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                        </Pie>
                        <Tooltip
                          contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                          labelStyle={{ color: c.text2 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* ── Player leaderboard ────────────────────────────── */}
              <div className="pp-section-title">Player Performance on This Hole</div>
              <div className="pp-scorecard-wrap">
                <table className="pp-scorecard">
                  <thead>
                    <tr>
                      <th className="pp-sc-label" style={{ textAlign: 'left' }}>Rank</th>
                      <th className="pp-sc-label" style={{ textAlign: 'left' }}>Player</th>
                      <th>Rounds</th>
                      <th>Avg</th>
                      <th title="Player average minus field average — negative is better">vs Field Avg</th>
                      {par !== null && <th>vs Par</th>}
                      <th style={{ color: '#22c55e' }}>Best</th>
                      <th style={{ color: '#ef4444' }}>Worst</th>
                      <th>Scores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerStats.map((ps, idx) => {
                      const color = getPlayerColor(ps.name);
                      const dispName = displayNames[ps.name] ?? ps.name.split(',')[0].trim();
                      const vsFieldColor = ps.vsFieldAvg === null ? 'var(--text2)'
                        : ps.vsFieldAvg < 0 ? '#22c55e'
                        : ps.vsFieldAvg > 0 ? '#ef4444'
                        : 'var(--text2)';
                      return (
                        <tr key={ps.name} className={idx % 2 === 0 ? 'pp-sc-row' : ''}>
                          <td style={{ textAlign: 'left', fontWeight: 700, color: 'var(--text2)', paddingLeft: 8 }}>
                            {ps.tied ? `T${ps.rank}` : ps.rank}
                          </td>
                          <td style={{ textAlign: 'left' }}>
                            <span className="player-dot" style={{ background: color }} />
                            {onPlayerClick ? (
                              <button
                                className="icon-btn"
                                style={{ width: 'auto', height: 'auto', padding: 0, color: 'var(--text)', textDecoration: 'underline' }}
                                onClick={() => onPlayerClick(ps.name)}
                              >
                                {dispName}
                              </button>
                            ) : dispName}
                          </td>
                          <td className="pp-sc-hole-cell">{ps.rounds}</td>
                          <td className="pp-sc-hole-cell" style={{ fontWeight: 700 }}>{ps.avg.toFixed(2)}</td>
                          <td className="pp-sc-hole-cell" style={{ color: vsFieldColor, fontWeight: 700 }}>
                            {ps.vsFieldAvg !== null ? `${ps.vsFieldAvg >= 0 ? '+' : ''}${ps.vsFieldAvg.toFixed(2)}` : '—'}
                          </td>
                          {par !== null && (
                            <td className="pp-sc-hole-cell" style={{ color: avgVsParColor(ps.avgVsPar), fontWeight: 700 }}>
                              {ps.avgVsPar !== null ? `${ps.avgVsPar >= 0 ? '+' : ''}${ps.avgVsPar.toFixed(2)}` : '—'}
                            </td>
                          )}
                          <td className="pp-sc-hole-cell" style={{ color: '#22c55e' }}>{ps.best}</td>
                          <td className="pp-sc-hole-cell" style={{ color: '#ef4444' }}>{ps.worst}</td>
                          <td className="pp-sc-hole-cell" style={{ fontSize: 11, color: 'var(--text2)' }}>
                            {ps.scores.join(', ')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
