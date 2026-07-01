import { useMemo, memo } from 'react';
import type { EventData } from '../types/golf';
import { getPlayerColor } from '../lib/colors';
import { useIsMobile } from '../lib/useIsMobile';
import { getEventDisplayName } from '../lib/eventNames';

interface StandingsTableProps {
  events: EventData[];
  onPlayerClick: (playerName: string) => void;
}

export default memo(function StandingsTable({ events, onPlayerClick }: StandingsTableProps) {
  const isMobile = useIsMobile();
  const latestEvent = useMemo(() => {
    if (events.length === 0) return null;
    return [...events].sort((a, b) => b.eventNumber - a.eventNumber)[0];
  }, [events]);

  if (!latestEvent) {
    return (
      <div className="chart-container empty-state">
        <h3 className="chart-title">Current Standings</h3>
        <p className="empty-text">Add event data to see standings.</p>
      </div>
    );
  }

  const standings = [...latestEvent.standings].sort((a, b) => a.position - b.position);
  const playedCount = standings.length;

  // Split into two halves for a 2-column layout
  const mid = Math.ceil(standings.length / 2);
  const left  = standings.slice(0, mid);
  const right = standings.slice(mid);

  function renderRow(s: typeof standings[number]) {
    const topThreeColors = ['#f59e0b', '#9ca3af', '#b45309'];
    return (
      <tr
        key={s.playerName}
        className="standings-row-clickable"
        onClick={() => onPlayerClick(s.playerName)}
        title={`View ${s.playerName}'s profile`}
      >
        <td className="pos-cell">
          <span
            className="pos-badge"
            style={{
              background: s.position <= 3 ? topThreeColors[s.position - 1] : '#2a2a3e',
              color: '#fff',
            }}
          >
            {s.position}
          </span>
        </td>
        <td>
          <span className="player-dot" style={{ background: getPlayerColor(s.playerName) }} />
          {s.playerName}
        </td>
        <td className="points-cell">
          {s.cumulativePoints.toFixed(0)}
        </td>
      </tr>
    );
  }

  function renderHalf(rows: typeof standings) {
    return (
      <table className="standings-table">
        <thead>
          <tr><th>#</th><th>Player</th><th>Points</th></tr>
        </thead>
        <tbody>{rows.map(renderRow)}</tbody>
      </table>
    );
  }

  return (
    <div className="chart-container">
      <h3 className="chart-title">
        Current Standings
        <span className="chart-badge">After {getEventDisplayName(latestEvent)}</span>
      </h3>
      <p className="chart-subtitle">{playedCount} player{playedCount !== 1 ? 's' : ''} ranked</p>
      {isMobile ? (
        <div className="table-wrapper">{renderHalf(standings)}</div>
      ) : (
        <div className="standings-two-col">
          <div className="table-wrapper">{renderHalf(left)}</div>
          <div className="table-wrapper">{renderHalf(right)}</div>
        </div>
      )}
    </div>
  );
});
