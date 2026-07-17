import { memo, useMemo } from 'react';
import type { CourseConfig, EventData, HandicapMode, LeagueAnalysisSettings, LeagueYardageBandSettings } from '../types/golf';
import EventFilterBar from './EventFilterBar';
import GrossNetScoresChart from './GrossNetScoresChart';
import HandicapTrendChart from './HandicapTrendChart';
import ComparePlayersPanel from './ComparePlayersPanel';
import { getPlayerColor } from '../lib/colors';
import { getParsForNine } from '../lib/scoring';
import { getYardageBandDescription, getYardageBandKey, YARDAGE_BANDS, type YardageBandKey } from '../lib/yardage';

interface TrendsPageProps {
  events: EventData[];
  allEvents: EventData[];
  courseConfig: CourseConfig | null;
  yardageBandSettings: LeagueYardageBandSettings;
  handicapMode: HandicapMode;
  analysisSettings: LeagueAnalysisSettings;
  filterEventIds: string[] | null;
  onFilterChange: (value: string[] | null) => void;
  onPlayerClick?: (playerName: string) => void;
}

function formatSigned(value: number, digits = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function normalizeTrackPosition(value: number, min: number, max: number, invert = false): number {
  if (!Number.isFinite(value)) return 50;
  if (max === min) return 50;
  const ratio = (value - min) / (max - min);
  const normalized = invert ? 1 - ratio : ratio;
  return Math.max(0, Math.min(1, normalized)) * 100;
}

export default memo(function TrendsPage({ events, allEvents, courseConfig, yardageBandSettings, handicapMode, analysisSettings, filterEventIds, onFilterChange, onPlayerClick }: TrendsPageProps) {
  const yardageLeaders = useMemo(() => {
    if (!courseConfig || events.length === 0) return null;

    type Aggregate = {
      holes: number;
      diffTotal: number;
      yardsTotal: number;
      strokesTotal: number;
      byBand: Record<YardageBandKey, { holes: number; diffTotal: number }>;
    };

    const emptyBandTotals = () => ({ holes: 0, diffTotal: 0 });

    const playerTotals: Record<string, Aggregate> = {};

    for (const ev of events) {
      const startIndex = ev.nineHoles === 'back' ? 9 : 0;
      const holesMeta = courseConfig.holes.slice(startIndex, startIndex + 9);
      const pars = getParsForNine(courseConfig, ev.nineHoles ?? 'front');

      for (let holeIndex = 0; holeIndex < 9; holeIndex += 1) {
        const yardage = holesMeta[holeIndex]?.yardage;
        if (yardage === null || yardage === undefined) continue;

        const par = pars[holeIndex];
        const bandKey = getYardageBandKey(yardage, par, yardageBandSettings);

        for (const player of ev.players) {
          if (player.didNotPlay) continue;
          const score = player.holes[holeIndex];
          if (score === null || score === undefined) continue;

          if (!playerTotals[player.playerName]) {
            playerTotals[player.playerName] = {
              holes: 0,
              diffTotal: 0,
              yardsTotal: 0,
              strokesTotal: 0,
              byBand: {
                short: emptyBandTotals(),
                mid: emptyBandTotals(),
                long: emptyBandTotals(),
                xlong: emptyBandTotals(),
              },
            };
          }

          const totals = playerTotals[player.playerName];
          totals.holes += 1;
          totals.diffTotal += score - par;
          totals.yardsTotal += yardage;
          totals.strokesTotal += score;
          totals.byBand[bandKey].holes += 1;
          totals.byBand[bandKey].diffTotal += score - par;
        }
      }
    }

    const MIN_BAND_HOLES = 4;

    const scoringLeaders = Object.entries(playerTotals)
      .filter(([, totals]) => totals.holes > 0)
      .map(([playerName, totals]) => ({
        playerName,
        holes: totals.holes,
        avgVsPar: totals.diffTotal / totals.holes,
      }))
      .sort((a, b) => a.avgVsPar - b.avgVsPar || a.playerName.localeCompare(b.playerName));

    const efficiencyLeaders = Object.entries(playerTotals)
      .filter(([, totals]) => totals.holes > 0 && totals.strokesTotal > 0)
      .map(([playerName, totals]) => ({
        playerName,
        holes: totals.holes,
        yardsPerStroke: totals.yardsTotal / totals.strokesTotal,
      }))
      .sort((a, b) => b.yardsPerStroke - a.yardsPerStroke || a.playerName.localeCompare(b.playerName));

    const specialists = YARDAGE_BANDS.map((band) => {
      const bestInBand = Object.entries(playerTotals)
        .filter(([, totals]) => totals.byBand[band.key].holes >= MIN_BAND_HOLES)
        .map(([playerName, totals]) => ({
          playerName,
          holes: totals.byBand[band.key].holes,
          avgVsPar: totals.byBand[band.key].diffTotal / totals.byBand[band.key].holes,
        }))
        .sort((a, b) => a.avgVsPar - b.avgVsPar)[0] ?? null;

      return {
        band: `${band.label} (${getYardageBandDescription(band.key, yardageBandSettings)})`,
        playerName: bestInBand?.playerName ?? '—',
        avgVsPar: bestInBand?.avgVsPar ?? null,
        holes: bestInBand?.holes ?? 0,
      };
    }).filter((row) => row.avgVsPar !== null);

    if (!scoringLeaders.length && !efficiencyLeaders.length && !specialists.length) {
      return null;
    }

    return {
      scoringLeaders,
      efficiencyLeaders,
      specialists,
    };
  }, [courseConfig, events, yardageBandSettings]);

  return (
    <>
      <EventFilterBar title="Trend Filters" events={allEvents} selectedEventIds={filterEventIds} onChange={onFilterChange} />
      <div className="pp-charts-row">
        <div className="pp-chart-half">
          <GrossNetScoresChart events={events} scoreType="net" topN={999} onOpenPlayer={onPlayerClick} />
        </div>
        <div className="pp-chart-half">
          <GrossNetScoresChart events={events} scoreType="gross" topN={999} onOpenPlayer={onPlayerClick} />
        </div>
      </div>
      <HandicapTrendChart events={events} handicapMode={handicapMode} topN={999} onOpenPlayer={onPlayerClick} />

      {yardageLeaders && (
        <div className="chart-container">
          <h3 className="chart-title">Yardage Trends</h3>
          <p className="chart-subtitle">
            Leaders are based on holes with scorecard yardage. Lower vs par is better; higher yards per stroke is more efficient.
          </p>

          {yardageLeaders.scoringLeaders.length > 0 && yardageLeaders.efficiencyLeaders.length > 0 && (() => {
            const scoringByPlayer = new Map(
              yardageLeaders.scoringLeaders.map((row) => [row.playerName, row] as const),
            );

            const rows = yardageLeaders.efficiencyLeaders
              .map((efficiencyRow) => {
                const scoringRow = scoringByPlayer.get(efficiencyRow.playerName);
                if (!scoringRow) return null;
                return {
                  playerName: efficiencyRow.playerName,
                  avgVsPar: scoringRow.avgVsPar,
                  yardsPerStroke: efficiencyRow.yardsPerStroke,
                  holes: Math.min(scoringRow.holes, efficiencyRow.holes),
                };
              })
              .filter((row): row is { playerName: string; avgVsPar: number; yardsPerStroke: number; holes: number } => row !== null)
              .sort((a, b) => a.avgVsPar - b.avgVsPar || b.yardsPerStroke - a.yardsPerStroke || a.playerName.localeCompare(b.playerName));

            if (!rows.length) return null;

            const xMin = Math.min(...rows.map((row) => row.yardsPerStroke));
            const xMax = Math.max(...rows.map((row) => row.yardsPerStroke));
            const yMin = Math.min(...rows.map((row) => row.avgVsPar));
            const yMax = Math.max(...rows.map((row) => row.avgVsPar));
            const xMid = (xMin + xMax) / 2;
            const yMid = (yMin + yMax) / 2;

            return (
              <div className="yardage-trend-xy-card">
                <div className="yardage-trend-xy-header">
                  <p className="pp-chart-label">Combined Distance Scoring vs Efficiency</p>
                  <span className="yardage-trend-metric-hint">Top-right is strongest</span>
                </div>

                <div className="yardage-trend-xy-plot-wrap">
                  <div className="yardage-trend-xy-y-label">Distance-Adjusted Scoring (lower is better)</div>
                  <div className="yardage-trend-xy-plot" role="img" aria-label="XY graph of distance-adjusted scoring by yards per stroke efficiency">
                    <div
                      className="yardage-trend-xy-cross-x"
                      style={{ bottom: `calc(${normalizeTrackPosition(yMid, yMin, yMax, true)}% - 1px)` }}
                    />
                    <div
                      className="yardage-trend-xy-cross-y"
                      style={{ left: `calc(${normalizeTrackPosition(xMid, xMin, xMax)}% - 1px)` }}
                    />
                    <span className="yardage-trend-xy-quadrant yardage-trend-xy-quadrant-tl">Scoring Strong</span>
                    <span className="yardage-trend-xy-quadrant yardage-trend-xy-quadrant-tr">Elite Zone</span>
                    <span className="yardage-trend-xy-quadrant yardage-trend-xy-quadrant-bl">Developing</span>
                    <span className="yardage-trend-xy-quadrant yardage-trend-xy-quadrant-br">Efficient, But Leaky</span>
                    {rows.map((row, index) => (
                      <button
                        key={`xy-${row.playerName}`}
                        type="button"
                        className={`yardage-trend-xy-dot${index < 5 ? ' yardage-trend-xy-dot-top' : ''}`}
                        onClick={onPlayerClick ? () => onPlayerClick(row.playerName) : undefined}
                        style={{
                          left: `calc(${normalizeTrackPosition(row.yardsPerStroke, xMin, xMax)}% - 8px)`,
                          bottom: `calc(${normalizeTrackPosition(row.avgVsPar, yMin, yMax, true)}% - 8px)`,
                          background: getPlayerColor(row.playerName),
                          cursor: onPlayerClick ? 'pointer' : 'default',
                        }}
                        title={`#${index + 1} ${row.playerName} · ${formatSigned(row.avgVsPar)} vs par · ${row.yardsPerStroke.toFixed(2)} y/stroke · ${row.holes} holes`}
                        aria-label={`Rank ${index + 1}, ${row.playerName}, ${formatSigned(row.avgVsPar)} versus par, ${row.yardsPerStroke.toFixed(2)} yards per stroke over ${row.holes} holes`}
                      >
                        {index < 5 ? <span className="yardage-trend-xy-dot-rank">{index + 1}</span> : null}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="yardage-trend-xy-x-label">Yards-Per-Stroke Efficiency (higher is better)</div>

                <div className="yardage-trend-xy-scale">
                  <span>Scoring range: {formatSigned(yMax)} to {formatSigned(yMin)}</span>
                  <span>Efficiency range: {xMin.toFixed(2)} to {xMax.toFixed(2)} y/stroke</span>
                </div>

                <div className="yardage-trend-xy-legend">
                  <span><span className="yardage-trend-xy-legend-dot" /> Dot = Player</span>
                  <span><span className="yardage-trend-xy-legend-dot yardage-trend-xy-legend-dot-top" /> Numbered dots = top 5 combined rank</span>
                </div>

                <div className="yardage-trend-readout" aria-label="Combined yardage scatter readout">
                  <div className="yardage-trend-readout-head">
                    <span>#</span>
                    <span>Player</span>
                    <span>Vs Par</span>
                    <span>Y/Stk</span>
                  </div>
                  {rows.map((row, index) => (
                    <button
                      key={`xy-row-${row.playerName}`}
                      type="button"
                      className="yardage-trend-readout-row"
                      onClick={onPlayerClick ? () => onPlayerClick(row.playerName) : undefined}
                      style={{ cursor: onPlayerClick ? 'pointer' : 'default' }}
                    >
                      <span className="yardage-trend-readout-rank">#{index + 1}</span>
                      <span className="yardage-trend-readout-player">{row.playerName}</span>
                      <span className="yardage-trend-readout-value yardage-trend-value-good">{formatSigned(row.avgVsPar)}</span>
                      <span className="yardage-trend-readout-value yardage-trend-value-cool">{row.yardsPerStroke.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {yardageLeaders.specialists.length > 0 && (
            <div className="yardage-trend-specialists" style={{ marginTop: 16 }}>
              <p className="pp-chart-label">Yardage-Band Specialists (Best Avg vs Par)</p>
              <div className="yardage-trend-specialist-grid">
                {yardageLeaders.specialists.map((row) => (
                  <button
                    key={`${row.band}-${row.playerName}`}
                    type="button"
                    className="yardage-trend-specialist-card"
                    onClick={onPlayerClick && row.playerName !== '—' ? () => onPlayerClick(row.playerName) : undefined}
                    style={{ cursor: onPlayerClick && row.playerName !== '—' ? 'pointer' : 'default' }}
                  >
                    <div className="yardage-trend-specialist-band">{row.band}</div>
                    <div className="yardage-trend-specialist-player">{row.playerName}</div>
                    <div className="yardage-trend-specialist-footer">
                      <span className="yardage-trend-specialist-metric">{row.avgVsPar !== null ? formatSigned(row.avgVsPar) : '—'}</span>
                      <span className="yardage-trend-specialist-detail">{row.holes} holes</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <ComparePlayersPanel events={events} courseConfig={courseConfig} handicapMode={handicapMode} analysisSettings={analysisSettings} onPlayerClick={onPlayerClick} />
    </>
  );
});