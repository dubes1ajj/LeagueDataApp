import { memo, useCallback, useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';
import type { CourseConfig, EventData, HandicapMode } from '../types/golf';
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
  handicapMode: HandicapMode;
  onPlayerClick?: (playerName: string) => void;
}

export default memo(function ComparePlayersPanel({ events, courseConfig, handicapMode, onPlayerClick }: ComparePlayersPanelProps) {
  const c = useChartColors();
  const isMobile = useIsMobile();
  const tooltipTrigger = getTooltipTrigger(isMobile);
  const hcpLabel = handicapMode === 'front-back' ? 'side hcp' : 'hcp';
  const currentHcpLabel = handicapMode === 'front-back' ? 'current side hcp' : 'current hcp';
  const trendLabel = handicapMode === 'front-back' ? 'Side handicap trend' : 'Handicap trend';
  const headerHcpLabel = handicapMode === 'front-back' ? 'Current Side Hcp' : 'Current Hcp';

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
  const allRows = useMemo(() => buildComparePlayerRows(events, players), [events, players]);

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

  const summarizePlayers = useCallback((names: string[], sourceRows: ReturnType<typeof buildComparePlayerRows>) => {
    return names.map((name) => {
      const playerRows = sourceRows.filter(r => r.playerName === name && r.points !== null);
      const points = playerRows.map(r => r.points ?? 0);
      const gross = playerRows.map(r => r.grossScore).filter((v): v is number => v !== null);
      const net = playerRows.map(r => r.netScore).filter((v): v is number => v !== null);
      const positions = playerRows.map(r => r.position).filter((v): v is number => v !== null);

      let attendedEvents = 0;
      let birdies = 0;
      let pars = 0;
      let bogeys = 0;
      let doubleBogeys = 0;
      let tripleBogeys = 0;
      let others = 0;
      let bogeysOrWorse = 0;
      let currentHcp: number | null = null;
      let bestGross: number | null = null;
      let bestNet: number | null = null;
      for (const ev of events) {
        const p = ev.players.find(x => x.playerName === name && !x.didNotPlay);
        if (!p) continue;
        attendedEvents += 1;
        currentHcp = p.handicap;
        if (p.grossScore !== null) bestGross = bestGross === null ? p.grossScore : Math.min(bestGross, p.grossScore);
        if (p.netScore !== null) bestNet = bestNet === null ? p.netScore : Math.min(bestNet, p.netScore);
        if (courseConfig) {
          const bd = computeBreakdown(p.holes, getParsForNine(courseConfig, ev.nineHoles));
          birdies += bd.birdies;
          pars += bd.pars;
          bogeys += bd.bogeys;
          doubleBogeys += bd.doubleBogeys;
          tripleBogeys += bd.tripleBogeys;
          others += bd.other;
          bogeysOrWorse += bd.bogeys + bd.doubleBogeys + bd.tripleBogeys + bd.other;
        } else {
          birdies += p.birdies;
          pars += p.pars;
          bogeys += p.bogeys;
          doubleBogeys += p.doubleBogeys;
          tripleBogeys += p.tripleBogeys;
          others += p.other;
          bogeysOrWorse += p.bogeys + p.doubleBogeys + p.tripleBogeys + p.other;
        }
      }

      const avg = (vals: number[]) => vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      const stdDev = (vals: number[]) => {
        if (vals.length < 2) return null;
        const mean = vals.reduce((sum, value) => sum + value, 0) / vals.length;
        const variance = vals.reduce((sum, value) => sum + (value - mean) ** 2, 0) / vals.length;
        return Math.sqrt(variance);
      };
      return {
        name,
        display: displayNames[name] ?? name,
        eventsPlayed: attendedEvents,
        totalPoints: points.reduce((a, b) => a + b, 0),
        avgPoints: avg(points),
        avgGross: avg(gross),
        avgNet: avg(net),
        avgPosition: avg(positions),
        pointsStdDev: stdDev(points),
        currentHcp,
        bestGross,
        bestNet,
        birdies,
        pars,
        bogeys,
        doubleBogeys,
        tripleBogeys,
        others,
        bogeysOrWorse,
      };
    });
  }, [courseConfig, displayNames, events]);

  const summaryRows = useMemo(() => summarizePlayers(selected, rows), [selected, rows, summarizePlayers]);
  const fieldSummaryRows = useMemo(() => summarizePlayers(players, allRows), [allRows, players, summarizePlayers]);

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

  const radarModel = useMemo(() => {
    const names = summaryRows.map((row) => row.name);
    const fieldNames = fieldSummaryRows.map((row) => row.name);
    const pointsByPlayer = Object.fromEntries(summaryRows.map((row) => [row.name, row.avgPoints ?? 0]));
    const netByPlayer = Object.fromEntries(summaryRows.map((row) => [row.name, row.avgNet ?? Number.NaN]));
    const grossByPlayer = Object.fromEntries(summaryRows.map((row) => [row.name, row.avgGross ?? Number.NaN]));
    const finishByPlayer = Object.fromEntries(summaryRows.map((row) => [row.name, row.avgPosition ?? Number.NaN]));
    const consistencyByPlayer = Object.fromEntries(summaryRows.map((row) => [row.name, row.pointsStdDev ?? Number.NaN]));
    const seasonRoundsTotal = Math.max(events.length, 1);
    const roundsByPlayer = Object.fromEntries(summaryRows.map((row) => [row.name, row.eventsPlayed / seasonRoundsTotal]));
    const birdieRateByPlayer = Object.fromEntries(summaryRows.map((row) => {
      const totalTracked = row.birdies + row.pars + row.bogeysOrWorse;
      return [row.name, totalTracked > 0 ? row.birdies / totalTracked : Number.NaN];
    }));
    const damageControlByPlayer = Object.fromEntries(summaryRows.map((row) => {
      const totalTracked = row.birdies + row.pars + row.bogeysOrWorse;
      if (!totalTracked) return [row.name, Number.NaN];
      const weightedMistakePenalty = (row.bogeys * 1) + (row.doubleBogeys * 2) + (row.tripleBogeys * 3) + (row.others * 4);
      const maxPenalty = totalTracked * 4;
      return [row.name, 1 - (weightedMistakePenalty / maxPenalty)];
    }));

    const fieldPointsByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => [row.name, row.avgPoints ?? 0]));
    const fieldNetByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => [row.name, row.avgNet ?? Number.NaN]));
    const fieldGrossByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => [row.name, row.avgGross ?? Number.NaN]));
    const fieldFinishByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => [row.name, row.avgPosition ?? Number.NaN]));
    const fieldConsistencyByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => [row.name, row.pointsStdDev ?? Number.NaN]));
    const fieldBirdieRateByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => {
      const totalTracked = row.birdies + row.pars + row.bogeysOrWorse;
      return [row.name, totalTracked > 0 ? row.birdies / totalTracked : Number.NaN];
    }));
    const fieldDamageControlByPlayer = Object.fromEntries(fieldSummaryRows.map((row) => {
      const totalTracked = row.birdies + row.pars + row.bogeysOrWorse;
      if (!totalTracked) return [row.name, Number.NaN];
      const weightedMistakePenalty = (row.bogeys * 1) + (row.doubleBogeys * 2) + (row.tripleBogeys * 3) + (row.others * 4);
      const maxPenalty = totalTracked * 4;
      return [row.name, 1 - (weightedMistakePenalty / maxPenalty)];
    }));

    function normalize(valuesByPlayer: Record<string, number>, domainNames: string[], invert = false): Record<string, number> {
      const vals = domainNames
        .map((name) => valuesByPlayer[name])
        .filter((value) => Number.isFinite(value));
      if (!vals.length) return Object.fromEntries(names.map((name) => [name, 0]));
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      if (Math.abs(max - min) < 1e-9) return Object.fromEntries(names.map((name) => [name, 100]));
      return Object.fromEntries(names.map((name) => {
        const value = valuesByPlayer[name];
        if (!Number.isFinite(value)) return [name, 0];
        const ratio = (value - min) / (max - min);
        const normalized = invert ? 1 - ratio : ratio;
        return [name, Math.round(normalized * 100)];
      }));
    }

    const pointsScore = normalize(fieldPointsByPlayer, fieldNames);
    const netScore = normalize(fieldNetByPlayer, fieldNames, true);
    const grossScore = normalize(fieldGrossByPlayer, fieldNames, true);
    const finishScore = normalize(fieldFinishByPlayer, fieldNames, true);
    const fieldConsistencyScore = normalize(fieldConsistencyByPlayer, fieldNames, true);
    const CONSISTENCY_MIN_SCORE = 10;
    const consistencyScore = Object.fromEntries(
      names.map((name) => {
        const stdev = consistencyByPlayer[name];
        if (!Number.isFinite(stdev)) return [name, 0];
        const normalized = fieldConsistencyScore[name] ?? 0;
        return [name, Math.max(CONSISTENCY_MIN_SCORE, normalized)];
      })
    );
    const roundsScore = Object.fromEntries(
      names.map((name) => [name, Math.round((roundsByPlayer[name] ?? 0) * 100)])
    );
    const birdieRateScore = normalize(fieldBirdieRateByPlayer, fieldNames);
    const damageControlScore = normalize(fieldDamageControlByPlayer, fieldNames);

    const metricDefinitions = [
      { key: 'Points Form', score: pointsScore, values: pointsByPlayer, weight: 0.22, detail: (name: string) => `${(pointsByPlayer[name] ?? 0).toFixed(1)} avg pts/round` },
      { key: 'Net Scoring', score: netScore, values: netByPlayer, weight: 0.18, detail: (name: string) => Number.isFinite(netByPlayer[name]) ? `${(netByPlayer[name] as number).toFixed(1)} avg net` : 'No net data' },
      { key: 'Gross Scoring', score: grossScore, values: grossByPlayer, weight: 0.14, detail: (name: string) => Number.isFinite(grossByPlayer[name]) ? `${(grossByPlayer[name] as number).toFixed(1)} avg gross` : 'No gross data' },
      { key: 'Finishing', score: finishScore, values: finishByPlayer, weight: 0.14, detail: (name: string) => Number.isFinite(finishByPlayer[name]) ? `${(finishByPlayer[name] as number).toFixed(2)} avg finish` : 'No position data' },
      { key: 'Consistency', score: consistencyScore, values: consistencyByPlayer, weight: 0.12, detail: (name: string) => Number.isFinite(consistencyByPlayer[name]) ? `${(consistencyByPlayer[name] as number).toFixed(2)} pts stdev` : 'Not enough rounds' },
      { key: 'Birdie Rate', score: birdieRateScore, values: birdieRateByPlayer, weight: 0.08, detail: (name: string) => Number.isFinite(birdieRateByPlayer[name]) ? `${((birdieRateByPlayer[name] as number) * 100).toFixed(1)}% birdie rate` : 'No hole data' },
      { key: 'Damage Control', score: damageControlScore, values: damageControlByPlayer, weight: 0.08, detail: (name: string) => Number.isFinite(damageControlByPlayer[name]) ? `${((damageControlByPlayer[name] as number) * 100).toFixed(1)} weighted damage control` : 'No hole data' },
      { key: 'Participation', score: roundsScore, values: roundsByPlayer, weight: 0.04, detail: (name: string) => `${((roundsByPlayer[name] ?? 0) * 100).toFixed(1)}% participation` },
    ] as const;

    const data = metricDefinitions.map((metric) => ({
      metric: metric.key,
      ...Object.fromEntries(names.map((name) => [name, metric.score[name] ?? 0])),
    }));

    const details: Record<string, Record<string, string>> = Object.fromEntries(
      metricDefinitions.map((metric) => [
        metric.key,
        Object.fromEntries(names.map((name) => [name, metric.detail(name)])),
      ])
    );

    const weights: Record<string, number> = Object.fromEntries(metricDefinitions.map((metric) => [metric.key, metric.weight]));

    return { data, details, weights };
  }, [summaryRows, fieldSummaryRows, events.length]);

  const analysisRanking = useMemo(() => {
    const metricRows = radarModel.data;
    const metricWeights = radarModel.weights;
    const metricWeightSum = Object.values(metricWeights).reduce((sum, weight) => sum + weight, 0);
    const getMetricValue = (metric: string, playerName: string): number => {
      const row = metricRows.find((item) => item.metric === metric) as Record<string, number | string> | undefined;
      const value = row?.[playerName];
      return typeof value === 'number' && Number.isFinite(value) ? value : 0;
    };
    return summaryRows
      .map((row) => {
        const pointsForm = getMetricValue('Points Form', row.name);
        const netScoring = getMetricValue('Net Scoring', row.name);
        const grossScoring = getMetricValue('Gross Scoring', row.name);
        const consistency = getMetricValue('Consistency', row.name);
        const finishing = getMetricValue('Finishing', row.name);
        const birdieRate = getMetricValue('Birdie Rate', row.name);
        const damageControl = getMetricValue('Damage Control', row.name);
        const participation = getMetricValue('Participation', row.name);
        const overallScore = (
          pointsForm * (metricWeights['Points Form'] ?? 0)
          + netScoring * (metricWeights['Net Scoring'] ?? 0)
          + grossScoring * (metricWeights['Gross Scoring'] ?? 0)
          + consistency * (metricWeights.Consistency ?? 0)
          + finishing * (metricWeights.Finishing ?? 0)
          + birdieRate * (metricWeights['Birdie Rate'] ?? 0)
          + damageControl * (metricWeights['Damage Control'] ?? 0)
          + participation * (metricWeights.Participation ?? 0)
        ) / (metricWeightSum || 1);

        return {
          name: row.name,
          display: row.display,
          overallScore,
          pointsForm,
          netScoring,
          grossScoring,
          consistency,
          finishing,
          birdieRate,
          damageControl,
          participation,
        };
      })
      .sort((a, b) => b.overallScore - a.overallScore || a.display.localeCompare(b.display));
  }, [radarModel.data, radarModel.weights, summaryRows]);

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
                  {onPlayerClick ? (
                    <button className="icon-btn" style={{ width: 'auto', height: 'auto', padding: 0, color: 'var(--text)', textDecoration: 'underline' }} onClick={(e) => { e.stopPropagation(); onPlayerClick(row.name); }}>
                      {row.display}
                    </button>
                  ) : (
                    <span className="compare-selected-name">{row.display}</span>
                  )}
                  <span className="compare-selected-rank">#{selected.indexOf(row.name) + 1}</span>
                </div>
                <div className="compare-selected-metrics">
                  <span>{row.totalPoints} pts</span>
                  <span>{row.avgNet?.toFixed(1) ?? '—'} net avg</span>
                  <span>{row.currentHcp ?? '—'} {hcpLabel}</span>
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
              <p className="pp-chart-label">{trendLabel}</p>
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
                  {onPlayerClick ? (
                    <button className="icon-btn" style={{ width: 'auto', height: 'auto', padding: 0, color: 'var(--text)', textDecoration: 'underline' }} onClick={() => onPlayerClick(row.name)}>
                      {row.display}
                    </button>
                  ) : (
                    <span className="compare-profile-name">{row.display}</span>
                  )}
                </div>
                <div className="compare-profile-stats">
                  <span><strong>{row.eventsPlayed}</strong> rounds</span>
                  <span><strong>{row.bestGross ?? '—'}</strong> best gross</span>
                  <span><strong>{row.bestNet ?? '—'}</strong> best net</span>
                  <span><strong>{row.currentHcp ?? '—'}</strong> {currentHcpLabel}</span>
                  <span><strong>{row.birdies}</strong> birdies</span>
                  <span><strong>{row.bogeysOrWorse}</strong> bogeys+</span>
                </div>
              </div>
            ))}
          </div>

          <div className="pp-section-title">Overall Shape (Normalized 0-100)</div>
          <div className="compare-radar-card">
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarModel.data} outerRadius="72%">
                <PolarGrid stroke={c.grid} />
                <PolarAngleAxis dataKey="metric" tick={{ fill: c.tick, fontSize: 11 }} />
                <PolarRadiusAxis
                  angle={30}
                  domain={[0, 100]}
                  tickCount={6}
                  tick={{ fill: c.tick, fontSize: 10 }}
                  axisLine={false}
                />
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
                <Tooltip
                  trigger={tooltipTrigger}
                  contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.border}`, borderRadius: 8 }}
                  labelStyle={{ color: c.text2 }}
                  labelFormatter={(label) => `${label} (0-100 normalized)`}
                  formatter={(value, name, item) => {
                    const metric = String(item?.payload?.metric ?? '');
                    const playerName = String(name);
                    const baseName = displayNames[playerName] ?? playerName;
                    const detail = radarModel.details[metric]?.[playerName];
                    return [`${Math.round(Number(value))}`, detail ? `${baseName} - ${detail}` : baseName];
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 10, color: 'var(--text2)', fontSize: 12, lineHeight: 1.5 }}>
              <div><strong style={{ color: 'var(--text)' }}>How to read:</strong> each axis is scored 0-100 against the full season field; only selected players are drawn.</div>
              <div>Normalization (higher-better): score = 100 * (x - fieldMin) / (fieldMax - fieldMin)</div>
              <div>Normalization (lower-better): score = 100 * (fieldMax - x) / (fieldMax - fieldMin)</div>
              <div>Points Form: x = avgPoints = (sum of points across played rounds) / roundsPlayed.</div>
              <div>Net Scoring: x = avgNet = (sum of net scores) / roundsWithNet.</div>
              <div>Gross Scoring: x = avgGross = (sum of gross scores) / roundsWithGross.</div>
              <div>Consistency (field-normalized with floor): pointsStdDev = sqrt(sum((points - avgPoints)^2) / roundsPlayed), baseScore = 100 * (fieldMaxStdDev - pointsStdDev) / (fieldMaxStdDev - fieldMinStdDev), finalScore = max(10, baseScore).</div>
              <div>Finishing: x = avgFinish = (sum of finishing positions) / roundsWithPosition.</div>
              <div>Birdie Rate: x = birdies / trackedHoles.</div>
              <div>Damage Control: weightedPenalty = (1*bogeys + 2*doubleBogeys + 3*tripleBogeys + 4*other) / (4*trackedHoles), x = 1 - weightedPenalty.</div>
              <div>Participation (not normalized): score = (roundsPlayed / totalRoundsInSeason) * 100.</div>
            </div>
          </div>

          <div className="pp-section-title">Overall Analysis Ranking</div>
          <div className="compare-radar-card" style={{ paddingTop: 10 }}>
            <div style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 10 }}>
              Weighted composite = sum(metricScore * metricWeight) / sum(metricWeight)
            </div>
            <div style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
              Weights: Points 22%, Net 18%, Gross 14%, Finishing 14%, Consistency 12%, Birdie Rate 8%, Damage Control 8%, Participation 4%
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {analysisRanking.map((entry, index) => (
                <div
                  key={entry.name}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '34px 1fr auto' : '34px minmax(120px, 1fr) minmax(70px, auto) minmax(280px, 1fr)',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: index === 0 ? 'color-mix(in oklab, var(--accent) 12%, var(--panel) 88%)' : 'var(--panel)',
                  }}
                >
                  <span style={{ color: 'var(--text)', fontWeight: 800 }}>#{index + 1}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span className="player-dot" style={{ background: getPlayerColor(entry.name) }} />
                    <span style={{ color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.display}</span>
                  </span>
                  <span style={{ color: 'var(--text)', fontWeight: 800, justifySelf: 'end' }}>{entry.overallScore.toFixed(1)}</span>
                  {!isMobile && (
                    <span style={{ color: 'var(--text2)', fontSize: 12, justifySelf: 'end', textAlign: 'right' }}>
                      Pts {entry.pointsForm}, Net {entry.netScoring}, Gross {entry.grossScoring}, Fin {entry.finishing}, Cons {entry.consistency}, Bird {entry.birdieRate}, Dmg {entry.damageControl}, Part {entry.participation}
                    </span>
                  )}
                </div>
              ))}
            </div>
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
                  <th>{headerHcpLabel}</th>
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
                    <td className="compare-player-cell">
                      <span className="player-dot" style={{ background: getPlayerColor(row.name) }} />
                      {onPlayerClick ? (
                        <button className="icon-btn" style={{ width: 'auto', height: 'auto', padding: 0, color: 'var(--text)', textDecoration: 'underline' }} onClick={() => onPlayerClick(row.name)}>
                          {row.display}
                        </button>
                      ) : row.display}
                    </td>
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
