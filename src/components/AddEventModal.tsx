import { useMemo, useState } from 'react';
import { parseGolfSoftwareHTML } from '../lib/parser';
import type { CourseConfig, EventData, PlayerEventData, StandingEntry } from '../types/golf';
import { computeBreakdown, getParsForNine } from '../lib/scoring';
import { X, Upload, Link, PencilLine, Plus, Trash2 } from 'lucide-react';

interface AddEventModalProps {
  onClose: () => void;
  onAdd: (event: Omit<EventData, 'id'>) => void;
  courseConfig: CourseConfig | null;
  activePlayerNames: string[];
}

type ManualPlayerRow = {
  id: string;
  playerName: string;
  handicap: string;
  points: string;
  holes: string[];
};

function createManualPlayerRow(): ManualPlayerRow {
  return {
    id: `manual-player-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    playerName: '',
    handicap: '0',
    points: '',
    holes: Array.from({ length: 9 }, () => ''),
  };
}

function parseInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDecimal(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatEventDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return trimmed;
  return `${Number(match[2])}/${Number(match[3])}/${match[1]}`;
}

export default function AddEventModal({ onClose, onAdd, courseConfig, activePlayerNames }: AddEventModalProps) {
  const [tab, setTab] = useState<'paste' | 'url' | 'manual'>('paste');
  const [htmlInput, setHtmlInput] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [manualEventNumber, setManualEventNumber] = useState('');
  const [manualEventDate, setManualEventDate] = useState('');
  const [manualNine, setManualNine] = useState<'front' | 'back'>('front');
  const [manualPlayers, setManualPlayers] = useState<ManualPlayerRow[]>(() => [createManualPlayerRow()]);
  const [activeTargetRowId, setActiveTargetRowId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const holeLabels = useMemo(
    () => Array.from({ length: 9 }, (_, index) => (manualNine === 'front' ? index + 1 : index + 10)),
    [manualNine]
  );

  const parValues = useMemo(
    () => (courseConfig ? getParsForNine(courseConfig, manualNine) : null),
    [courseConfig, manualNine]
  );

  function handlePasteImport() {
    setError('');
    const parsed = parseGolfSoftwareHTML(htmlInput);
    if (!parsed) {
      setError('Could not parse the HTML. Make sure you pasted the full page source from golfsoftware.com.');
      return;
    }
    onAdd(parsed);
  }

  function handleHtmlChange(value: string) {
    setHtmlInput(value);
  }

  async function handleUrlImport() {
    setError('');
    setLoading(true);

    try {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(urlInput.trim());
      } catch {
        setError('Please enter a valid URL (e.g. https://service.golfleague.net/lm/...)');
        setLoading(false);
        return;
      }

      if (!parsedUrl.hostname.includes('golfleague.net')) {
        setError('URL must be from service.golfleague.net');
        setLoading(false);
        return;
      }

      const proxyPath = '/golf-proxy' + parsedUrl.pathname + parsedUrl.search;
      const res = await fetch(proxyPath);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      const parsed = parseGolfSoftwareHTML(html);
      if (!parsed) {
        setError('Fetched the page but could not find player data. Make sure the URL points to a player_standings_by_points page.');
        setLoading(false);
        return;
      }
      onAdd(parsed);
    } catch (e) {
      setError(`Failed to fetch: ${(e as Error).message}. Try the "Paste HTML" tab if the error persists.`);
      setLoading(false);
    }
  }

  function updateManualPlayer(rowId: string, updater: (row: ManualPlayerRow) => ManualPlayerRow) {
    setManualPlayers((current) => current.map((row) => (row.id === rowId ? updater(row) : row)));
  }

  function addManualPlayerRow() {
    setManualPlayers((current) => [...current, createManualPlayerRow()]);
  }

  function removeManualPlayerRow(rowId: string) {
    setManualPlayers((current) => (current.length === 1 ? current : current.filter((row) => row.id !== rowId)));
    setActiveTargetRowId((current) => (current === rowId ? null : current));
  }

  function handlePickActivePlayer(playerName: string) {
    const existingRow = manualPlayers.find((row) => row.playerName.trim() === playerName);
    if (existingRow) {
      setActiveTargetRowId(existingRow.id);
      return;
    }

    const targetRow = (activeTargetRowId
      ? manualPlayers.find((row) => row.id === activeTargetRowId)
      : null) ?? manualPlayers.find((row) => row.playerName.trim().length === 0);

    if (targetRow) {
      updateManualPlayer(targetRow.id, (current) => ({ ...current, playerName }));
      setActiveTargetRowId(targetRow.id);
      return;
    }

    const newRow = createManualPlayerRow();
    newRow.playerName = playerName;
    setManualPlayers((current) => [...current, newRow]);
    setActiveTargetRowId(newRow.id);
  }

  function handleManualImport() {
    setError('');

    const eventNumber = parseInteger(manualEventNumber);
    if (eventNumber === null || eventNumber <= 0) {
      setError('Enter a valid event number for the manual event.');
      return;
    }

    const candidateRows = manualPlayers.filter((row) => {
      const hasName = row.playerName.trim().length > 0;
      const hasAnyHole = row.holes.some((hole) => hole.trim().length > 0);
      const hasPoints = row.points.trim().length > 0;
      return hasName || hasAnyHole || hasPoints;
    });

    if (!candidateRows.length) {
      setError('Add at least one player row with a name and scores.');
      return;
    }

    const players: PlayerEventData[] = [];

    for (const row of candidateRows) {
      const playerName = row.playerName.trim();
      if (!playerName) {
        setError('Each manual row needs a player name.');
        return;
      }

      const points = parseDecimal(row.points) ?? 0;
      const handicap = parseInteger(row.handicap) ?? 0;
      const holes = row.holes.map((value) => parseInteger(value));
      const playedHoleCount = holes.filter((score): score is number => score !== null).length;

      if (playedHoleCount > 0 && playedHoleCount < 9) {
        setError(`Enter all 9 hole scores for ${playerName}, or leave every hole blank for DNP.`);
        return;
      }

      if (playedHoleCount === 0 && points !== 0) {
        setError(`Add hole scores for ${playerName} before assigning points.`);
        return;
      }

      const didNotPlay = playedHoleCount === 0;
      const grossScore = didNotPlay ? null : holes.reduce<number>((sum, score) => sum + (score ?? 0), 0);
      const netScore = didNotPlay || grossScore === null ? null : grossScore - handicap;
      const breakdown = parValues && !didNotPlay
        ? computeBreakdown(holes, parValues)
        : { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubleBogeys: 0, tripleBogeys: 0, other: 0 };

      players.push({
        position: 0,
        playerName,
        holes,
        grossScore,
        handicap,
        netScore,
        points,
        bonusPoints: 0,
        totalPoints: points,
        eagles: breakdown.eagles,
        birdies: breakdown.birdies,
        pars: breakdown.pars,
        bogeys: breakdown.bogeys,
        doubleBogeys: breakdown.doubleBogeys,
        tripleBogeys: breakdown.tripleBogeys,
        other: breakdown.other,
        didNotPlay,
      });
    }

    const orderedPlayed = [...players]
      .filter((player) => !player.didNotPlay)
      .sort((a, b) => b.points - a.points || (a.netScore ?? Number.POSITIVE_INFINITY) - (b.netScore ?? Number.POSITIVE_INFINITY) || a.playerName.localeCompare(b.playerName));

    const positionMap = new Map<string, number>();
    orderedPlayed.forEach((player, index) => {
      positionMap.set(player.playerName, index + 1);
    });

    const standings: StandingEntry[] = orderedPlayed.map((player, index) => ({
      playerName: player.playerName,
      cumulativePoints: player.points,
      position: index + 1,
    }));

    onAdd({
      eventNumber,
      eventDate: formatEventDate(manualEventDate),
      nineHoles: manualNine,
      standings,
      players: players.map((player) => ({
        ...player,
        position: player.didNotPlay ? 0 : (positionMap.get(player.playerName) ?? 0),
      })),
    });
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Event Data</h2>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="tabs">
          <button
            className={`tab ${tab === 'paste' ? 'active' : ''}`}
            onClick={() => setTab('paste')}
          >
            Paste HTML
          </button>
          <button
            className={`tab ${tab === 'url' ? 'active' : ''}`}
            onClick={() => setTab('url')}
          >
            <Link size={14} style={{ marginRight: 4 }} /> Load from URL
          </button>
          <button
            className={`tab ${tab === 'manual' ? 'active' : ''}`}
            onClick={() => setTab('manual')}
          >
            <PencilLine size={14} style={{ marginRight: 4 }} /> Manual Entry
          </button>
        </div>

        {tab === 'paste' && (
          <div className="modal-body">
            <p className="hint">
              Open the standings URL in your browser, then press <kbd>Ctrl+U</kbd> (View Page Source).
              Press <kbd>Ctrl+A</kbd> to select all, <kbd>Ctrl+C</kbd> to copy, then paste below.
            </p>
            <textarea
              className="html-input"
              placeholder="Paste full page HTML here..."
              value={htmlInput}
              onChange={e => handleHtmlChange(e.target.value)}
              rows={8}
            />
            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={handlePasteImport} disabled={!htmlInput.trim()}>
                <Upload size={14} style={{ marginRight: 6 }} /> Import
              </button>
            </div>
          </div>
        )}

        {tab === 'url' && (
          <div className="modal-body">
            <p className="hint">
              Paste the standings page URL from golfsoftware.com. The app fetches it
              through a local proxy so the SSL certificate is handled by Node.js, not your browser. The played nine is auto-detected from the page.
            </p>
            <input
              className="url-input"
              type="url"
              placeholder="https://service.golfleague.net/lm/.../player_standings_by_points-01.html"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
            />
            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={handleUrlImport} disabled={!urlInput.trim() || loading}>
                {loading ? 'Loading...' : <><Link size={14} style={{ marginRight: 6 }} /> Fetch & Import</>}
              </button>
            </div>
          </div>
        )}

        {tab === 'manual' && (
          <div className="modal-body">
            <p className="hint">
              Create an event by hand and enter 9-hole scores per player. Gross and net are calculated from the scores; points are entered directly. Course pars are used when a scorecard is already configured.
            </p>
            <div className="manual-event-grid">
              <label className="manual-field">
                <span className="manual-label">Event Number</span>
                <input
                  className="url-input"
                  type="number"
                  min="1"
                  value={manualEventNumber}
                  onChange={(e) => setManualEventNumber(e.target.value)}
                  placeholder="12"
                />
              </label>
              <label className="manual-field">
                <span className="manual-label">Event Date</span>
                <input
                  className="url-input"
                  type="date"
                  value={manualEventDate}
                  onChange={(e) => setManualEventDate(e.target.value)}
                />
              </label>
            </div>

            <div className="nine-selector">
              <span className="nine-label">Played Nine</span>
              <div className="nine-toggle">
                <button type="button" className={`nine-btn ${manualNine === 'front' ? 'active' : ''}`} onClick={() => setManualNine('front')}>Front 9</button>
                <button type="button" className={`nine-btn ${manualNine === 'back' ? 'active' : ''}`} onClick={() => setManualNine('back')}>Back 9</button>
              </div>
            </div>

            {activePlayerNames.length > 0 && (
              <div className="manual-player-picker">
                <span className="manual-label">Active League Players</span>
                <div className="manual-player-chip-row">
                  {activePlayerNames.map((playerName) => {
                    const isSelected = manualPlayers.some((row) => row.playerName.trim() === playerName);
                    return (
                      <button
                        key={playerName}
                        type="button"
                        className={`manual-player-chip ${isSelected ? 'active' : ''}`}
                        onClick={() => handlePickActivePlayer(playerName)}
                      >
                        {playerName}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="manual-score-wrap">
              <table className="manual-score-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>HCP</th>
                    {holeLabels.map((hole, index) => (
                      <th key={hole}>
                        <div>H{hole}</div>
                        {parValues && <span className="manual-hole-par">Par {parValues[index]}</span>}
                      </th>
                    ))}
                    <th>Points</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {manualPlayers.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <input
                          className="url-input manual-cell-input manual-name-input"
                          value={row.playerName}
                          onFocus={() => setActiveTargetRowId(row.id)}
                          onChange={(e) => updateManualPlayer(row.id, (current) => ({ ...current, playerName: e.target.value }))}
                          placeholder="Last, First"
                        />
                      </td>
                      <td>
                        <input
                          className="url-input manual-cell-input"
                          type="number"
                          value={row.handicap}
                          onChange={(e) => updateManualPlayer(row.id, (current) => ({ ...current, handicap: e.target.value }))}
                        />
                      </td>
                      {row.holes.map((value, holeIndex) => (
                        <td key={`${row.id}-${holeIndex}`}>
                          <input
                            className="url-input manual-cell-input"
                            type="number"
                            min="1"
                            value={value}
                            onChange={(e) => updateManualPlayer(row.id, (current) => ({
                              ...current,
                              holes: current.holes.map((hole, index) => (index === holeIndex ? e.target.value : hole)),
                            }))}
                          />
                        </td>
                      ))}
                      <td>
                        <input
                          className="url-input manual-cell-input"
                          type="number"
                          step="0.5"
                          value={row.points}
                          onChange={(e) => updateManualPlayer(row.id, (current) => ({ ...current, points: e.target.value }))}
                          placeholder="0"
                        />
                      </td>
                      <td>
                        <button type="button" className="icon-btn danger" onClick={() => removeManualPlayerRow(row.id)} title="Remove player">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button type="button" className="btn-secondary manual-add-player" onClick={addManualPlayerRow}>
              <Plus size={14} style={{ marginRight: 6 }} /> Add Player
            </button>
            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn-primary" onClick={handleManualImport}>
                <PencilLine size={14} style={{ marginRight: 6 }} /> Save Event
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

