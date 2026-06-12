import { useMemo, useState } from 'react';
import type { EventData, PlayerConfig } from '../types/golf';
import { getPlayerColor } from '../lib/colors';

interface PlayersPageProps {
  events: EventData[];
  playerConfig: PlayerConfig;
  onChange: (config: PlayerConfig) => void;
}

export default function PlayersPage({ events, playerConfig, onChange }: PlayersPageProps) {
  const [search, setSearch] = useState('');

  // Derive all players seen + their stats
  const players = useMemo(() => {
    const map: Record<string, { eventsPlayed: number; totalPoints: number; latestHcp: number | null }> = {};
    const sortedEvents = [...events].sort((a, b) => a.eventNumber - b.eventNumber);
    for (const ev of sortedEvents) {
      for (const p of ev.players) {
        if (p.didNotPlay) continue;
        if (!map[p.playerName]) map[p.playerName] = { eventsPlayed: 0, totalPoints: 0, latestHcp: null };
        map[p.playerName].eventsPlayed++;
        map[p.playerName].totalPoints += p.points;
        map[p.playerName].latestHcp = p.handicap;
      }
    }
    // Also include DNP-only players (never actually played)
    for (const ev of sortedEvents) {
      for (const p of ev.players) {
        if (!map[p.playerName]) {
          map[p.playerName] = { eventsPlayed: 0, totalPoints: 0, latestHcp: p.handicap ?? null };
        }
      }
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b.eventsPlayed - a.eventsPlayed || b.totalPoints - a.totalPoints)
      .map(([name, stats]) => ({ name, ...stats }));
  }, [events]);

  const filtered = useMemo(() =>
    players.filter(p => p.name.toLowerCase().includes(search.toLowerCase())),
    [players, search]);

  const activeCount = players.filter(p => playerConfig.active[p.name] !== false).length;

  function isActive(name: string) {
    return playerConfig.active[name] !== false; // default = active
  }

  function toggle(name: string) {
    onChange({
      active: { ...playerConfig.active, [name]: !isActive(name) },
    });
  }

  function setAll(value: boolean) {
    const active: Record<string, boolean> = {};
    for (const p of players) active[p.name] = value;
    onChange({ active });
  }

  return (
    <div className="chart-container">
      <div className="players-page-header">
        <div>
          <h3 className="chart-title">League Members</h3>
          <p className="chart-subtitle">
            {activeCount} active · {players.length - activeCount} hidden ·
            Inactive players are excluded from all charts and standings
          </p>
        </div>
        <div className="players-page-actions">
          <button className="btn-secondary" onClick={() => setAll(true)}>All Active</button>
          <button className="btn-secondary" onClick={() => setAll(false)}>All Hidden</button>
        </div>
      </div>

      <input
        className="url-input players-search"
        type="text"
        placeholder="Search players…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div className="players-grid">
        {filtered.map(player => {
          const active = isActive(player.name);
          const color = getPlayerColor(player.name);
          const lastName = player.name.split(',')[0].trim();
          const firstName = player.name.split(',')[1]?.trim() ?? '';
          return (
            <div
              key={player.name}
              className={`player-card ${active ? 'player-card-active' : 'player-card-inactive'}`}
              onClick={() => toggle(player.name)}
              title={active ? 'Click to hide' : 'Click to make active'}
            >
              <div className="player-card-avatar" style={{ background: active ? color : undefined }}>
                {lastName.charAt(0).toUpperCase()}
              </div>
              <div className="player-card-info">
                <span className="player-card-name">
                  {lastName}{firstName ? `, ${firstName}` : ''}
                </span>
                <span className="player-card-stats">
                  {player.eventsPlayed > 0
                    ? `${player.eventsPlayed} event${player.eventsPlayed !== 1 ? 's' : ''} · ${player.totalPoints} pts${player.latestHcp !== null ? ` · HCP ${player.latestHcp}` : ''}`
                    : 'No rounds played'}
                </span>
              </div>
              <div className="player-card-toggle">
                <span className={`player-status-pill ${active ? 'pill-active' : 'pill-inactive'}`}>
                  {active ? 'Active' : 'Hidden'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
