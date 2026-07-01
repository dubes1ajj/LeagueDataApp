import { useMemo, useState } from 'react';
import type { ColorSchemeConfig, EventData, HandicapMode, PlayerConfig } from '../types/golf';
import { getPlayerColor } from '../lib/colors';
import { Edit2, Save, X } from 'lucide-react';

interface PlayersPageProps {
  events: EventData[];
  playerConfig: PlayerConfig;
  colorScheme: ColorSchemeConfig;
  handicapMode: HandicapMode;
  onChange: (config: PlayerConfig) => void;
  onRename: (currentName: string, nextName: string) => void;
  onPlayerColorChange: (playerName: string, color: string) => void;
  onClearPlayerColor: (playerName: string) => void;
}

export default function PlayersPage({
  events,
  playerConfig,
  colorScheme,
  handicapMode,
  onChange,
  onRename,
  onPlayerColorChange,
  onClearPlayerColor,
}: PlayersPageProps) {
  const [search, setSearch] = useState('');
  const [editingPlayer, setEditingPlayer] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');

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
  const hcpLabel = handicapMode === 'front-back' ? 'Side HCP' : 'HCP';

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

  function startEditing(name: string) {
    setEditingPlayer(name);
    setEditedName(name);
  }

  function cancelEditing() {
    setEditingPlayer(null);
    setEditedName('');
  }

  function saveRename(currentName: string) {
    const trimmed = editedName.trim();
    if (!trimmed || trimmed === currentName) {
      cancelEditing();
      return;
    }

    onRename(currentName, trimmed);
    cancelEditing();
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
          const color = colorScheme.playerColors[player.name] ?? getPlayerColor(player.name);
          const hasColorOverride = !!colorScheme.playerColors[player.name];
          const lastName = player.name.split(',')[0].trim();
          const firstName = player.name.split(',')[1]?.trim() ?? '';
          const isEditing = editingPlayer === player.name;
          return (
            <div
              key={player.name}
              className={`player-card ${active ? 'player-card-active' : 'player-card-inactive'}`}
              onClick={() => { if (!isEditing) toggle(player.name); }}
              title={isEditing ? 'Editing player name' : active ? 'Click to hide' : 'Click to make active'}
            >
              <div className="player-card-avatar" style={{ background: active ? color : undefined }}>
                {lastName.charAt(0).toUpperCase()}
              </div>
              <div className="player-card-info">
                {isEditing ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }} onClick={(e) => e.stopPropagation()}>
                    <input
                      className="url-input"
                      style={{ minWidth: 0, flex: 1, padding: '6px 10px' }}
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRename(player.name);
                        if (e.key === 'Escape') cancelEditing();
                      }}
                      autoFocus
                    />
                    <button className="icon-btn" onClick={() => saveRename(player.name)} title="Save name">
                      <Save size={14} />
                    </button>
                    <button className="icon-btn" onClick={cancelEditing} title="Cancel rename">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <span className="player-card-name">
                    {lastName}{firstName ? `, ${firstName}` : ''}
                  </span>
                )}
                <span className="player-card-stats">
                  {player.eventsPlayed > 0
                    ? `${player.eventsPlayed} event${player.eventsPlayed !== 1 ? 's' : ''} · ${player.totalPoints} pts${player.latestHcp !== null ? ` · ${hcpLabel} ${player.latestHcp}` : ''}`
                    : 'No rounds played'}
                  {hasColorOverride ? ' · custom color' : ''}
                </span>
              </div>
              <div className="player-card-toggle" onClick={(e) => e.stopPropagation()}>
                <input
                  type="color"
                  value={color}
                  onChange={(e) => onPlayerColorChange(player.name, e.target.value)}
                  title={`Pick color for ${player.name}`}
                  style={{ marginRight: 8 }}
                />
                <button
                  className="icon-btn"
                  onClick={() => onClearPlayerColor(player.name)}
                  title="Reset to default color"
                  disabled={!hasColorOverride}
                  style={{ marginRight: 8 }}
                >
                  D
                </button>
                {isEditing ? null : (
                  <button className="icon-btn" onClick={() => startEditing(player.name)} title="Edit player name" style={{ marginRight: 8 }}>
                    <Edit2 size={14} />
                  </button>
                )}
                <span className={`player-status-pill ${active ? 'pill-active' : 'pill-inactive'}`} onClick={() => toggle(player.name)}>
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
