import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, RadarChart,
  PolarGrid, PolarAngleAxis, Radar
} from 'recharts';
import type { EventData, CourseConfig } from '../types/golf';
import { getPlayerColor } from '../lib/colors';
import { computeBreakdown, getParsForNine } from '../lib/scoring';
import { useChartColors } from '../lib/useChartColors';
import { X, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface PlayerProfileModalProps {
  playerName: string;
  events: EventData[];
  courseConfig: CourseConfig | null;
  onClose: () => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function avg(nums: number[]): number {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}

function StatCard({ label, value, sub, trend }: {
  label: string; value: string | number; sub?: string; trend?: 'up' | 'down' | 'flat';
}) {
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#888';
  return (
    <div className="pp-stat-card">
      <span className="pp-stat-label">{label}</span>
      <span className="pp-stat-value">{value}</span>
      {sub && <span className="pp-stat-sub">{sub}</span>}
      {trend && <Icon size={14} style={{ color: trendColor, marginTop: 4 }} />}
    </div>
  );
}

const SCORE_COLORS: Record<string, string> = {
  Eagles: '#f59e0b', Birdies: '#22c55e', Pars: '#4f8ef7',
  Bogeys: '#f97316', 'Dbl Bogeys': '#ef4444', 'Trpl+': '#7c3aed', 'Other': '#3f3f5a',
};

// ── Main component ────────────────────────────────────────────────────────────
export default function PlayerProfileModal({
  playerName, events, courseConfig, onClose,
}: PlayerProfileModalProps) {
  const color = getPlayerColor(playerName);
  const c = useChartColors();
  const sortedEvents = useMemo(() =>
    [...events].sort((a, b) => a.eventNumber - b.eventNumber), [events]);

  // All event data for this player, in order
  const playerRounds = useMemo(() =>
    sortedEvents.map(ev => ({
      ev,
      data: ev.players.find(p => p.playerName === playerName) ?? null,
      standing: ev.standings.find(s => s.playerName === playerName) ?? null,
    })).filter(r => r.data && !r.data.didNotPlay),
    [sortedEvents, playerName]);

  // Current standing from the latest event
  const latestStanding = useMemo(() => {
    for (let i = sortedEvents.length - 1; i >= 0; i--) {
      const s = sortedEvents[i].standings.find(s => s.playerName === playerName);
      if (s) return s;
    }
    return null;
  }, [sortedEvents, playerName]);

  // ── Summary stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!playerRounds.length) return null;
    const grossScores = playerRounds.map(r => r.data!.grossScore).filter((v): v is number => v !== null);
    const netScores   = playerRounds.map(r => r.data!.netScore).filter((v): v is number => v !== null);
    const points      = playerRounds.map(r => r.data!.points);
    const handicaps   = playerRounds.map(r => r.data!.handicap);

    const bestGross = grossScores.length ? Math.min(...grossScores) : null;
    const worstGross = grossScores.length ? Math.max(...grossScores) : null;
    const bestPoints = points.length ? Math.max(...points) : null;
    const eventsPlayed = playerRounds.length;
    const totalEvents = sortedEvents.length;

    // Handicap trend: compare last vs first
    const hcpTrend = handicaps.length >= 2
      ? (handicaps[handicaps.length - 1] < handicaps[0] ? 'down'
        : handicaps[handicaps.length - 1] > handicaps[0] ? 'up' : 'flat')
      : 'flat';

    return {
      eventsPlayed, totalEvents,
      avgGross: grossScores.length ? avg(grossScores).toFixed(1) : '—',
      avgNet:   netScores.length   ? avg(netScores).toFixed(1)   : '—',
      avgPoints: avg(points).toFixed(1),
      bestGross, worstGross, bestPoints,
      currentHcp: handicaps[handicaps.length - 1] ?? '—',
      hcpTrend: hcpTrend as 'up' | 'down' | 'flat',
    };
  }, [playerRounds, sortedEvents]);

  // ── Scoring breakdown totals (uses course pars if available) ──────────────
  const breakdown = useMemo(() => {
    const totals = { Eagles: 0, Birdies: 0, Pars: 0, Bogeys: 0, 'Dbl Bogeys': 0, 'Trpl+': 0, Other: 0 };
    for (const { ev, data } of playerRounds) {
      if (!data) continue;
      if (courseConfig) {
        const pars = getParsForNine(courseConfig, ev.nineHoles ?? 'front');
        const bd = computeBreakdown(data.holes, pars);
        totals.Eagles     += bd.eagles;
        totals.Birdies    += bd.birdies;
        totals.Pars       += bd.pars;
        totals.Bogeys     += bd.bogeys;
        totals['Dbl Bogeys'] += bd.doubleBogeys;
        totals['Trpl+']   += bd.tripleBogeys;
        totals.Other      += bd.other;
      }
    }
    return Object.entries(totals)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value }));
  }, [playerRounds, courseConfig]);

  // ── Per-event chart data ───────────────────────────────────────────────────
  const eventChartData = useMemo(() =>
    playerRounds.map(({ ev, data, standing }) => ({
      label: `E${ev.eventNumber}`,
      date: ev.eventDate,
      gross: data?.grossScore ?? null,
      net: data?.netScore ?? null,
      points: data?.points ?? 0,
      handicap: data?.handicap ?? null,
      position: standing?.position ?? null,
      cumulativePoints: standing?.cumulativePoints ?? 0,
    })),
    [playerRounds]);

  // ── Per-hole stats for this player vs field ──────────────────────────────
  const perHoleStats = useMemo(() => {
    if (!courseConfig) return null;

    const nines: ('front' | 'back')[] = ['front', 'back'];
    return nines.map(nine => {
      const startHole = nine === 'back' ? 10 : 1;
      const pars = getParsForNine(courseConfig, nine);
      const relevantEvs = sortedEvents.filter(ev => ev.nineHoles === nine);
      if (!relevantEvs.length) return null;

      const holes = Array.from({ length: 9 }, (_, slotIdx) => {
        const holeNum = startHole + slotIdx;
        const par = pars[slotIdx];

        // This player's scores on this hole
        const playerScores: number[] = [];
        for (const ev of relevantEvs) {
          const pd = ev.players.find(p => p.playerName === playerName);
          if (!pd || pd.didNotPlay) continue;
          const s = pd.holes[slotIdx];
          if (s !== null && s !== undefined) playerScores.push(s);
        }

        // Per-player averages for ranking
        const playerAvgMap: Record<string, number[]> = {};
        for (const ev of relevantEvs) {
          for (const p of ev.players) {
            if (p.didNotPlay) continue;
            const s = p.holes[slotIdx];
            if (s === null || s === undefined) continue;
            if (!playerAvgMap[p.playerName]) playerAvgMap[p.playerName] = [];
            playerAvgMap[p.playerName].push(s);
          }
        }
        const playerAvgsSorted = Object.entries(playerAvgMap)
          .map(([name, scores]) => ({ name, avg: scores.reduce((a, b) => a + b, 0) / scores.length }))
          .sort((a, b) => a.avg - b.avg); // lower avg = better rank

        const pAvg = playerScores.length ? playerScores.reduce((s, n) => s + n, 0) / playerScores.length : null;

        // Field scores on this hole
        const allFieldScores: number[] = Object.values(playerAvgMap).flat();
        const fAvg = allFieldScores.length ? allFieldScores.reduce((s, n) => s + n, 0) / allFieldScores.length : null;

        // Rank: position of this player among all who played this hole
        const rankEntry = playerAvgsSorted.findIndex(e => e.name === playerName);
        const rank = rankEntry >= 0 ? rankEntry + 1 : null;
        const totalRanked = playerAvgsSorted.length;

        return {
          holeNum,
          label: `H${holeNum}`,
          par,
          playerAvg: pAvg !== null ? Math.round(pAvg * 100) / 100 : null,
          fieldAvg:  fAvg !== null ? Math.round(fAvg * 100) / 100 : null,
          playerVsPar: pAvg !== null ? Math.round((pAvg - par) * 100) / 100 : null,
          fieldVsPar:  fAvg !== null ? Math.round((fAvg - par) * 100) / 100 : null,
          advantage: pAvg !== null && fAvg !== null ? Math.round((pAvg - fAvg) * 100) / 100 : null,
          rounds: playerScores.length,
          best:  playerScores.length ? Math.min(...playerScores) : null,
          worst: playerScores.length ? Math.max(...playerScores) : null,
          rank,
          totalRanked,
        };
      });

      return { nine, label: nine === 'front' ? 'Front 9 — Holes 1–9' : 'Back 9 — Holes 10–18', holes };
    }).filter(Boolean);
  }, [courseConfig, sortedEvents, playerName]);

  // ── Hole-by-hole scorecard table ──────────────────────────────────────────
  const holeHeaders = useMemo(() => {
    if (!playerRounds.length) return [];
    return Array.from({ length: 9 }, (_, i) => i + 1);
  }, [playerRounds]);

  // ── Radar data (scoring profile vs averages) ──────────────────────────────
  const radarData = useMemo(() => {
    if (!breakdown.length) return [];
    const total = breakdown.reduce((s, b) => s + b.value, 0);
    return breakdown.map(b => ({
      subject: b.name,
      value: total > 0 ? Math.round((b.value / total) * 100) : 0,
    }));
  }, [breakdown]);

  const lastName = playerName.split(',')[0].trim();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="pp-modal" onClick={e => e.stopPropagation()}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="pp-header">
          <div className="pp-header-left">
            <div className="pp-avatar" style={{ background: color }}>
              {lastName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="pp-name">{playerName}</h2>
              {latestStanding && (
                <p className="pp-rank">
                  Rank <strong>#{latestStanding.position}</strong>
                  <span className="pp-rank-sep">·</span>
                  <strong>{latestStanding.cumulativePoints}</strong> pts total
                </p>
              )}
            </div>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={22} /></button>
        </div>

        <div className="pp-body">

          {/* ── Stat cards ─────────────────────────────────────────── */}
          {stats && (
            <div className="pp-stats-row">
              <StatCard label="Events Played" value={`${stats.eventsPlayed} / ${stats.totalEvents}`} />
              <StatCard label="Avg Gross" value={stats.avgGross} />
              <StatCard label="Avg Net" value={stats.avgNet} />
              <StatCard label="Avg Points" value={stats.avgPoints} />
              <StatCard label="Best Gross" value={stats.bestGross ?? '—'} />
              <StatCard label="Best Points" value={stats.bestPoints ?? '—'} />
              <StatCard label="Current H'cap" value={stats.currentHcp} trend={stats.hcpTrend} />
            </div>
          )}

          {playerRounds.length === 0 && (
            <p style={{ color: '#888', padding: '24px 0', textAlign: 'center' }}>
              No rounds played yet.
            </p>
          )}

          {playerRounds.length > 0 && (
            <>
              {/* ── Points + cumulative history ─────────────────────── */}
              <div className="pp-section-title">Points History</div>
              <div className="pp-charts-row">
                <div className="pp-chart-half">
                  <p className="pp-chart-label">Points per Event</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={eventChartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                      <XAxis dataKey="label" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                        labelStyle={{ color: c.text2 }}
                      />
                      <Bar dataKey="points" name="Points" radius={[3, 3, 0, 0]}>
                        {eventChartData.map((_, i) => (
                          <Cell key={i} fill={color} opacity={0.7 + i * (0.3 / Math.max(eventChartData.length, 1))} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="pp-chart-half">
                  <p className="pp-chart-label">Cumulative Points</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={eventChartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                      <XAxis dataKey="label" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                        labelStyle={{ color: c.text2 }}
                      />
                      <Line type="linear" dataKey="cumulativePoints" name="Cumulative" stroke={color} strokeWidth={2.5} dot={{ r: 4, fill: color }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Gross / Net scores ───────────────────────────────── */}
              <div className="pp-section-title">Score History</div>
              <div className="pp-charts-row">
                <div className="pp-chart-half">
                  <p className="pp-chart-label">Gross &amp; Net Scores (lower = better)</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={eventChartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                      <XAxis dataKey="label" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                        labelStyle={{ color: c.text2 }}
                      />
                      <Line type="linear" dataKey="gross" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} name="Gross" connectNulls />
                      <Line type="linear" dataKey="net"   stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} name="Net"   connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="pp-chart-half">
                  <p className="pp-chart-label">Handicap</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={eventChartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                      <XAxis dataKey="label" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                        labelStyle={{ color: c.text2 }}
                      />
                      <Line type="linear" dataKey="handicap" name="Handicap" stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* ── Ranking history ──────────────────────────────────── */}
              <div className="pp-section-title">Ranking History</div>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={eventChartData} margin={{ top: 4, right: 16, left: -20, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                  <XAxis dataKey="label" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                  <YAxis reversed stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }}
                    label={{ value: 'Rank', angle: -90, position: 'insideLeft', fill: c.tick, fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                    labelStyle={{ color: c.text2 }}
                    formatter={(v) => [`#${v}`, 'Position']}
                  />
                  <Line type="linear" dataKey="position" name="Position" stroke={color} strokeWidth={2.5}
                    dot={{ r: 4, fill: color }} connectNulls />
                </LineChart>
              </ResponsiveContainer>

              {/* ── Scoring breakdown ────────────────────────────────── */}
              {breakdown.length > 0 ? (
                <>
                  <div className="pp-section-title">Scoring Breakdown</div>
                  <div className="pp-charts-row">
                    <div className="pp-chart-half">
                      <p className="pp-chart-label">Totals</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={breakdown} layout="vertical" margin={{ top: 4, right: 30, left: 60, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={false} />
                          <XAxis type="number" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} width={70} />
                          <Tooltip
                            contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                            labelStyle={{ color: c.text2 }}
                          />
                          <Bar dataKey="value" name="Count" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                            {breakdown.map((b) => (
                              <Cell key={b.name} fill={SCORE_COLORS[b.name] ?? '#4f8ef7'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="pp-chart-half">
                      <p className="pp-chart-label">Profile (%)</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <RadarChart data={radarData} margin={{ top: 10, right: 20, left: 20, bottom: 10 }}>
                          <PolarGrid stroke={c.grid} />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: c.tick, fontSize: 10 }} />
                          <Radar dataKey="value" stroke={color} fill={color} fillOpacity={0.25} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              ) : courseConfig === null ? (
                <p className="pp-no-course">Set up your course scorecard to see scoring breakdown.</p>
              ) : null}

              {/* ── Hole-by-hole scorecard ───────────────────────────── */}
              {/* ── Per-hole performance ─────────────────────────── */}
              {perHoleStats && perHoleStats.length > 0 && perHoleStats.map(group => {
                if (!group) return null;
                const hasData = group.holes.some(h => h.rounds > 0);
                if (!hasData) return null;

                const chartData = group.holes.filter(h => h.playerAvg !== null);

                return (
                  <div key={group.nine}>
                    <div className="pp-section-title">Per-Hole Performance — {group.label}</div>
                    <p className="pp-chart-label" style={{ marginBottom: 8 }}>
                      Your avg vs field avg per hole · green bar = better than field, red = worse
                    </p>

                    {/* Advantage chart */}
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={chartData} margin={{ top: 4, right: 10, left: -20, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                        <XAxis dataKey="label" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                        <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }}
                          tickFormatter={(v: number) => (v >= 0 ? `+${v}` : `${v}`)}
                        />
                        <Tooltip
                          contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                          labelStyle={{ color: c.text2, fontWeight: 700 }}
                          formatter={(val) => [
                            `${Number(val) >= 0 ? '+' : ''}${Number(val).toFixed(2)} vs field`,
                            'Advantage',
                          ]}
                        />
                        <Bar dataKey="advantage" name="vs Field" radius={[3, 3, 0, 0]}>
                          {chartData.map((d, i) => (
                            <Cell
                              key={i}
                              fill={d.advantage === null ? c.grid
                                : d.advantage < 0 ? '#22c55e'   // lower = better
                                : d.advantage > 0 ? '#ef4444'
                                : '#4f8ef7'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>

                    {/* Per-hole detail table */}
                    <div className="pp-scorecard-wrap" style={{ marginTop: 12 }}>
                      <table className="pp-scorecard">
                        <thead>
                          <tr>
                            <th className="pp-sc-label">Hole</th>
                            <th>Par</th>
                            <th>Rounds</th>
                            <th>Your Avg</th>
                            <th>vs Par</th>
                            <th>Field Avg</th>
                            <th title="Your avg minus field avg — negative = better than field">vs Field</th>
                            <th title="Rank among all players by avg score on this hole (1 = best)">Rank</th>
                            <th style={{ color: '#22c55e' }}>Best</th>
                            <th style={{ color: '#ef4444' }}>Worst</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.holes.map((h, i) => {
                            const vsParColor = h.playerVsPar === null ? c.tick
                              : h.playerVsPar <= -1 ? '#22c55e'
                              : h.playerVsPar === 0 ? '#4f8ef7'
                              : h.playerVsPar <= 1  ? '#f97316'
                              : '#ef4444';
                            const vsFieldColor = h.advantage === null ? c.tick
                              : h.advantage < 0  ? '#22c55e'
                              : h.advantage > 0  ? '#ef4444'
                              : c.tick;
                            return (
                              <tr key={i} className={i % 2 === 0 ? '' : 'pp-sc-row'}>
                                <td className="pp-sc-label">
                                  <span className="hs-hole-badge" style={{ background: color, color: '#fff' }}>
                                    {h.holeNum}
                                  </span>
                                </td>
                                <td className="pp-sc-hole-cell">{h.par}</td>
                                <td className="pp-sc-hole-cell">{h.rounds}</td>
                                <td className="pp-sc-hole-cell" style={{ fontWeight: 600 }}>
                                  {h.playerAvg !== null ? h.playerAvg.toFixed(2) : '—'}
                                </td>
                                <td className="pp-sc-hole-cell" style={{ color: vsParColor, fontWeight: 700 }}>
                                  {h.playerVsPar !== null
                                    ? `${h.playerVsPar >= 0 ? '+' : ''}${h.playerVsPar.toFixed(2)}`
                                    : '—'}
                                </td>
                                <td className="pp-sc-hole-cell" style={{ color: c.text2 }}>
                                  {h.fieldAvg !== null ? h.fieldAvg.toFixed(2) : '—'}
                                </td>
                                <td className="pp-sc-hole-cell" style={{ color: vsFieldColor, fontWeight: 700 }}>
                                  {h.advantage !== null
                                    ? `${h.advantage >= 0 ? '+' : ''}${h.advantage.toFixed(2)}`
                                    : '—'}
                                </td>
                                <td className="pp-sc-hole-cell" style={{
                                  fontWeight: 700,
                                  color: h.rank === null ? c.tick
                                    : h.rank === 1 ? '#22c55e'
                                    : h.totalRanked > 1 && h.rank === h.totalRanked ? '#ef4444'
                                    : c.tick,
                                }}>
                                  {h.rank !== null ? `#${h.rank} / ${h.totalRanked}` : '—'}
                                </td>
                                <td className="pp-sc-hole-cell" style={{ color: '#22c55e' }}>
                                  {h.best ?? '—'}
                                </td>
                                <td className="pp-sc-hole-cell" style={{ color: '#ef4444' }}>
                                  {h.worst ?? '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}

              {/* ── Round Scorecards ─────────────────────────────── */}
              <div className="pp-section-title">Round Scorecards</div>
              <div className="pp-scorecard-wrap">
                <table className="pp-scorecard">
                  <thead>
                    <tr>
                      <th className="pp-sc-label">Event</th>
                      <th className="pp-sc-label">Nine</th>
                      {holeHeaders.map(h => <th key={h} className="pp-sc-hole">#{h}</th>)}
                      <th className="pp-sc-total">Gross</th>
                      <th className="pp-sc-total">Net</th>
                      <th className="pp-sc-total">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerRounds.map(({ ev, data }) => {
                      if (!data) return null;
                      const pars = courseConfig ? getParsForNine(courseConfig, ev.nineHoles ?? 'front') : null;
                      const nineLabel = ev.nineHoles === 'back' ? 'Back 9' : 'Front 9';
                      const startHole = ev.nineHoles === 'back' ? 10 : 1;
                      return (
                        <tr key={ev.id} className="pp-sc-row">
                          <td className="pp-sc-label">E{ev.eventNumber}{ev.eventDate ? ` · ${ev.eventDate}` : ''}</td>
                          <td className="pp-sc-label">{nineLabel}</td>
                          {data.holes.map((score, i) => {
                            const holeNum = startHole + i;
                            const par = pars ? pars[i] : null;
                            const diff = score !== null && par !== null ? score - par : null;
                            const cls = diff === null ? ''
                              : diff <= -2 ? 'pp-sc-eagle'
                              : diff === -1 ? 'pp-sc-birdie'
                              : diff === 0  ? 'pp-sc-par'
                              : diff === 1  ? 'pp-sc-bogey'
                              : diff === 2  ? 'pp-sc-dbl'
                              : 'pp-sc-trpl';
                            return (
                              <td key={i} className={`pp-sc-hole-cell ${cls}`} title={`Hole ${holeNum}${par ? ` · Par ${par}` : ''}`}>
                                {score ?? '—'}
                              </td>
                            );
                          })}
                          <td className="pp-sc-total">{data.grossScore ?? '—'}</td>
                          <td className="pp-sc-total">{data.netScore ?? '—'}</td>
                          <td className="pp-sc-total pp-sc-pts">{data.points}</td>
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
