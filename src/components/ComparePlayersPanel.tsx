import { memo, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts';
import type { CourseConfig, EventData } from '../types/golf';
import { buildComparePlayerRows } from '../lib/analytics';
import { getPlayerColor } from '../lib/colors';
import { useChartColors } from '../lib/useChartColors';
import { buildDisplayNames } from '../lib/displayNames';
import { computeBreakdown, getParsForNine } from '../lib/scoring';
import { getTooltipTrigger } from '../lib/tooltip';
import { useIsMobile } from '../lib/useIsMobile';

interface ComparePlayersPanelProps {
  events: EventData[];
  courseConfig: CourseConfig | null;
}

export default memo(function ComparePlayersPanel({ events, courseConfig }: ComparePlayersPanelProps) {
  const c = useChartColors();
  const isMobile = useIsMobile();
  const tooltipTrigger = getTooltipTrigger(isMobile);

  const players = useMemo(() => {
    const set = new Set<string>();
    for (const ev of events) {
      for (const p of ev.players) if (!p.didNotPlay) set.add(p.playerName);
    }
    return Array.from(set).sort();
  }, [events]);

  const displayNames = useMemo(() => buildDisplayNames(players), [players]);
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(name: string) {
    setSelected(prev => {
      if (prev.includes(name)) return prev.filter(p => p !== name);
      if (prev.length >= 4) return prev;
      return [...prev, name];
    });
  }

  const rows = useMemo(() => buildComparePlayerRows(events, selected), [events, selected]);

  const eventData = useMemo(() => {
    const byEvent = new Map<number, Record<string, string | number | null>>();
    for (const row of rows) {
      if (!byEvent.has(row.eventNumber)) {
        byEvent.set(row.eventNumber, { event: `E${row.eventNumber}`, eventNumber: row.eventNumber });
      }
      const target = byEvent.get(row.eventNumber)!;
      target[`${row.playerName}:points`] = row.points;
      target[`${row.playerName}:cum`] = row.cumulativePoints;
      target[`${row.playerName}:net`] = row.netScore;
      target[`${row.playerName}:gross`] = row.grossScore;
      target[`${row.playerName}:hcp`] = row.handicap;
      target[`${row.playerName}:pos`] = row.position;
    }
    return Array.from(byEvent.values()).sort((a, b) => Number(a.eventNumber) - Number(b.eventNumber));
  }, [rows]);

  const summaryRows = useMemo(() => {
    return selected.map(name => {
      const playerRows = rows.filter(r => r.playerName === name && r.points !== null);
      const points = playerRows.map(r => r.points ?? 0);
      const gross = playerRows.map(r => r.grossScore).filter((v): v is number => v !== null);
      const net = playerRows.map(r => r.netScore).filter((v): v is number => v !== null);
      const positions = playerRows.map(r => r.position).filter((v): v is number => v !== null);

      let birdies = 0;
      let pars = 0;
      let bogeysOrWorse = 0;
      let currentHcp: number | null = null;
      let bestGross: number | null = null;
      let bestNet: number | null = null;
      for (const ev of events) {
        const p = ev.players.find(x => x.playerName === name && !x.didNotPlay);
        if (!p) continue;
        currentHcp = p.handicap;
        if (p.grossScore !== null) bestGross = bestGross === null ? p.grossScore : Math.min(bestGross, p.grossScore);
        if (p.netScore !== null) bestNet = bestNet === null ? p.netScore : Math.min(bestNet, p.netScore);
        if (courseConfig) {
          const bd = computeBreakdown(p.holes, getParsForNine(courseConfig, ev.nineHoles));
          birdies += bd.birdies;
          pars += bd.pars;
          bogeysOrWorse += bd.bogeys + bd.doubleBogeys + bd.tripleBogeys + bd.other;
        } else {
          birdies += p.birdies;
          pars += p.pars;
          bogeysOrWorse += p.bogeys + p.doubleBogeys + p.tripleBogeys + p.other;
        }
      }

      const avg = (vals: number[]) => vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      return {
        name,
        display: displayNames[name] ?? name,
        eventsPlayed: playerRows.length,
        totalPoints: points.reduce((a, b) => a + b, 0),
        avgPoints: avg(points),
        avgGross: avg(gross),
        avgNet: avg(net),
        avgPosition: avg(positions),
        currentHcp,
        bestGross,
        bestNet,
        birdies,
        pars,
        bogeysOrWorse,
      };
    });
  }, [selected, rows, events, courseConfig, displayNames]);

  const scoringProfileData = useMemo(() => {
    return summaryRows.map((row) => {
      const totalTracked = row.birdies + row.pars + row.bogeysOrWorse;
      return {
        player: row.display,
        playerName: row.name,
        birdies: totalTracked ? Math.round((row.birdies / totalTracked) * 100) : 0,
        pars: totalTracked ? Math.round((row.pars / totalTracked) * 100) : 0,
        bogeysOrWorse: totalTracked ? Math.round((row.bogeysOrWorse / totalTracked) * 100) : 0,
      };
    });
  }, [summaryRows]);

  const radarData = useMemo(() => {
    const maxPoints = Math.max(...summaryRows.map((row) => row.avgPoints ?? 0), 1);
    const maxBirdies = Math.max(...summaryRows.map((row) => row.birdies), 1);
    const maxBogeys = Math.max(...summaryRows.map((row) => row.bogeysOrWorse), 1);

    return [
      {
        metric: 'Points',
        ...Object.fromEntries(summaryRows.map((row) => [row.name, Math.round(((row.avgPoints ?? 0) / maxPoints) * 100)])),
      },
      {
        metric: 'Net',
        ...Object.fromEntries(summaryRows.map((row) => [row.name, row.avgNet !== null ? Math.max(0, Math.round((60 - row.avgNet) * 4)) : 0])),
      },
      {
        metric: 'Birdies',
        ...Object.fromEntries(summaryRows.map((row) => [row.name, Math.round((row.birdies / maxBirdies) * 100)])),
      },
      {
        metric: 'Damage Ctrl',
        ...Object.fromEntries(summaryRows.map((row) => [row.name, Math.max(0, 100 - Math.round((row.bogeysOrWorse / maxBogeys) * 100))])),
      },
    ];
  }, [summaryRows]);

  return (
    <div className="chart-container">
      <h3 className="chart-title">Compare Players</h3>
      <p className="chart-subtitle">Pick 2 to 4 players and compare points, scoring, and consistency</p>

      <div className="compare-picker">
        {players.map(name => {
          const active = selected.includes(name);
          const disabled = !active && selected.length >= 4;
          return (
            <button
              key={name}
              className={`compare-pill ${active ? 'active' : ''}`}
              disabled={disabled}
              onClick={() => toggle(name)}
            >
              <span className="player-dot" style={{ background: getPlayerColor(name) }} />
              {active && <span className="compare-pill-state">{`Selected ${selected.indexOf(name) + 1}`}</span>}
              {displayNames[name] ?? name}
            </button>
          );
        })}
      </div>

      {selected.length < 2 ? (
        <p className="empty-text" style={{ paddingTop: 12 }}>Select at least 2 players to compare.</p>
      ) : (
        <>
          <div className="pp-section-title">Selected Players</div>
          <div className="compare-selected-grid">
            {summaryRows.map((row) => (
              <button key={row.name} className="compare-selected-card" onClick={() => toggle(row.name)}>
                <div className="compare-selected-top">
                  <span className="player-dot compare-selected-dot" style={{ background: getPlayerColor(row.name) }} />
                  <span className="compare-selected-name">{row.display}</span>
                  <span className="compare-selected-rank">#{selected.indexOf(row.name) + 1}</span>
                </div>
                <div className="compare-selected-metrics">
                  <span>{row.totalPoints} pts</span>
                  <span>{row.avgNet?.toFixed(1) ?? '—'} net avg</span>
                  <span>{row.currentHcp ?? '—'} hcp</span>
                </div>
              </button>
            ))}
          </div>

          <div className="pp-charts-row">
            <div className="pp-chart-half">
              <p className="pp-chart-label">Cumulative points</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={eventData} margin={{ top: 8, right: 10, left: isMobile ? -16 : -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                  <XAxis dataKey="event" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                  <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                  <Tooltip trigger={tooltipTrigger} contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }} labelStyle={{ color: c.text2 }} />
                  {selected.map(name => (
                    <Line key={name} type="linear" dataKey={`${name}:cum`} name={displayNames[name] ?? name} stroke={getPlayerColor(name)} strokeWidth={2.5} dot={{ r: 3, fill: getPlayerColor(name) }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="pp-chart-half">
              <p className="pp-chart-label">Net scores</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={eventData} margin={{ top: 8, right: 10, left: isMobile ? -16 : -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                  <XAxis dataKey="event" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                  <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} domain={['dataMin - 2', 'dataMax + 2']} />
                  <Tooltip trigger={tooltipTrigger} contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }} labelStyle={{ color: c.text2 }} />
                  {selected.map(name => (
                    <Line key={name} type="linear" dataKey={`${name}:net`} name={displayNames[name] ?? name} stroke={getPlayerColor(name)} strokeWidth={2.5} dot={{ r: 3, fill: getPlayerColor(name) }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="pp-charts-row compare-extended-row">
            <div className="pp-chart-half">
              <p className="pp-chart-label">Handicap trend</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={eventData} margin={{ top: 8, right: 10, left: isMobile ? -16 : -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                  <XAxis dataKey="event" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} />
                  <YAxis stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} domain={['dataMin - 1', 'dataMax + 1']} />
                  <Tooltip trigger={tooltipTrigger} contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }} labelStyle={{ color: c.text2 }} />
                  {selected.map(name => (
                    <Line key={name} type="linear" dataKey={`${name}:hcp`} name={displayNames[name] ?? name} stroke={getPlayerColor(name)} strokeWidth={2.5} dot={{ r: 3, fill: getPlayerColor(name) }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="pp-chart-half">
              <p className="pp-chart-label">Scoring profile</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={scoringProfileData} layout="vertical" margin={{ top: 8, right: 12, left: isMobile ? 0 : 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                  <XAxis type="number" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} domain={[0, 100]} />
                  <YAxis dataKey="player" type="category" stroke={c.axis} tick={{ fill: c.tick, fontSize: 11 }} width={isMobile ? 68 : 84} />
                  <Tooltip trigger={tooltipTrigger} contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }} labelStyle={{ color: c.text2 }} />
                  <Bar dataKey="birdies" stackId="a" fill="#22c55e" radius={[8, 0, 0, 8]} />
                  <Bar dataKey="pars" stackId="a" fill="#4f8ef7" />
                  <Bar dataKey="bogeysOrWorse" stackId="a" fill="#f97316" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="pp-section-title">Profile Snapshot</div>
          <div className="compare-profile-grid">
            {summaryRows.map((row) => (
              <div key={row.name} className="compare-profile-card">
                <div className="compare-profile-header">
                  <span className="player-dot compare-selected-dot" style={{ background: getPlayerColor(row.name) }} />
                  <span className="compare-profile-name">{row.display}</span>
                </div>
                <div className="compare-profile-stats">
                  <span><strong>{row.eventsPlayed}</strong> rounds</span>
                  <span><strong>{row.bestGross ?? '—'}</strong> best gross</span>
                  <span><strong>{row.bestNet ?? '—'}</strong> best net</span>
                  <span><strong>{row.currentHcp ?? '—'}</strong> current hcp</span>
                  <span><strong>{row.birdies}</strong> birdies</span>
                  <span><strong>{row.bogeysOrWorse}</strong> bogeys+</span>
                </div>
              </div>
            ))}
          </div>

          <div className="pp-section-title">Overall Shape</div>
          <div className="compare-radar-card">
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke={c.grid} />
                <PolarAngleAxis dataKey="metric" tick={{ fill: c.tick, fontSize: 11 }} />
                {selected.map((name) => (
                  <Radar
                    key={name}
                    name={displayNames[name] ?? name}
                    dataKey={name}
                    stroke={getPlayerColor(name)}
                    fill={getPlayerColor(name)}
                    fillOpacity={0.14}
                    strokeWidth={2}
                  />
                ))}
                <Tooltip trigger={tooltipTrigger} contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }} labelStyle={{ color: c.text2 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="compare-summary-table-wrap">
            <table className="compare-summary-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Rounds</th>
                  <th>Total Pts</th>
                  <th>Avg Pts</th>
                  <th>Avg Gross</th>
                  <th>Avg Net</th>
                  <th>Current Hcp</th>
                  <th>Avg Rank</th>
                  <th>Best Gross</th>
                  <th>Best Net</th>
                  <th>Birdies</th>
                  <th>Pars</th>
                  <th>Bogeys+</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((row, idx) => (
                  <tr key={row.name} className={idx % 2 === 0 ? 'compare-even' : ''}>
                    <td className="compare-player-cell"><span className="player-dot" style={{ background: getPlayerColor(row.name) }} />{row.display}</td>
                    <td>{row.eventsPlayed}</td>
                    <td>{row.totalPoints}</td>
                    <td>{row.avgPoints?.toFixed(1) ?? '—'}</td>
                    <td>{row.avgGross?.toFixed(1) ?? '—'}</td>
                    <td>{row.avgNet?.toFixed(1) ?? '—'}</td>
                    <td>{row.currentHcp ?? '—'}</td>
                    <td>{row.avgPosition?.toFixed(1) ?? '—'}</td>
                    <td>{row.bestGross ?? '—'}</td>
                    <td>{row.bestNet ?? '—'}</td>
                    <td>{row.birdies}</td>
                    <td>{row.pars}</td>
                    <td>{row.bogeysOrWorse}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
});
