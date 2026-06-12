import { useRef, useState } from 'react';
import type { LeagueData, CourseConfig, PlayerConfig } from '../types/golf';
import { parseGolfSoftwareHTML } from '../lib/parser';
import { recalculateCumulativeStandings } from '../lib/parser';
import { applyAutoHide, exportSharedSnapshot, exportSnapshot, parseSnapshotFile } from '../lib/storage';
import type { BuiltInLeague, LeagueSnapshot } from '../lib/storage';
import { Upload, Download, Link, CheckCircle, XCircle, Loader, Edit2, Save, Trash2 } from 'lucide-react';

interface DataPageProps {
  activeLeagueId: string;
  availableLeagues: BuiltInLeague[];
  league: LeagueData;
  courseConfig: CourseConfig | null;
  playerConfig: PlayerConfig;
  onImportSnapshot: (snap: LeagueSnapshot) => void;
  onBulkEventsAdded: (league: LeagueData, playerConfig: PlayerConfig) => void;
  onLeagueNameChange: (name: string) => void;
  onClearAllEvents: () => void;
  onCreateLeague: (leagueId: string) => void;
  hideLeagueSettings?: boolean;
}

type UrlStatus = 'pending' | 'loading' | 'done' | 'error';
interface UrlRow {
  url: string;
  status: UrlStatus;
  label?: string;
  error?: string;
}

interface LeagueSettingsSectionProps {
  availableLeagues: BuiltInLeague[];
  league: LeagueData;
  onLeagueNameChange: (name: string) => void;
  onClearAllEvents: () => void;
  onCreateLeague: (leagueId: string) => void;
}

export function LeagueSettingsSection({
  availableLeagues,
  league,
  onLeagueNameChange,
  onClearAllEvents,
  onCreateLeague,
}: LeagueSettingsSectionProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(league.leagueName);
  const [confirmClear, setConfirmClear] = useState(false);
  const [newLeagueYear, setNewLeagueYear] = useState('');
  const [createLeagueError, setCreateLeagueError] = useState('');
  const [createLeagueSuccess, setCreateLeagueSuccess] = useState('');

  function handleSaveName() {
    if (nameInput.trim()) {
      onLeagueNameChange(nameInput.trim());
      setEditingName(false);
    }
  }

  function handleCreateLeague() {
    const trimmed = newLeagueYear.trim();
    setCreateLeagueError('');
    setCreateLeagueSuccess('');

    if (!/^\d{4}$/.test(trimmed)) {
      setCreateLeagueError('Enter a 4-digit season year, for example 2024.');
      return;
    }
    if (availableLeagues.some((item) => item.id === trimmed)) {
      setCreateLeagueError(`Season ${trimmed} already exists.`);
      return;
    }

    onCreateLeague(trimmed);
    setCreateLeagueSuccess(`Created ${trimmed} season and switched to it.`);
    setNewLeagueYear('');
  }

  return (
    <div className="chart-container">
      <h3 className="chart-title">League Settings</h3>
      <div className="data-field-row">
        <label className="data-field-label">League Name</label>
        {editingName ? (
          <div style={{ display: 'flex', gap: 8, flex: 1 }}>
            <input
              className="url-input"
              style={{ flex: 1 }}
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSaveName()}
              autoFocus
            />
            <button className="btn-primary" onClick={handleSaveName} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Save size={14} /> Save
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{league.leagueName}</span>
            <button className="icon-btn" onClick={() => { setEditingName(true); setNameInput(league.leagueName); }}>
              <Edit2 size={14} />
            </button>
          </div>
        )}
      </div>
      <div className="data-field-row" style={{ marginTop: 10 }}>
        <label className="data-field-label">Events loaded</label>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>{league.events.length} event{league.events.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="data-field-row" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', alignItems: 'flex-start' }}>
        <label className="data-field-label">Create Season</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="url-input"
              style={{ maxWidth: 160 }}
              placeholder="2024"
              value={newLeagueYear}
              onChange={(e) => setNewLeagueYear(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateLeague()}
            />
            <button className="btn-secondary" onClick={handleCreateLeague}>Create & Switch</button>
          </div>
          <p style={{ color: 'var(--text2)', fontSize: 12 }}>
            Creates an empty season like <strong style={{ color: 'var(--text)' }}>2024 Guinness Cup</strong> locally so you can import and publish older years.
          </p>
          {createLeagueError && <p className="error">{createLeagueError}</p>}
          {createLeagueSuccess && <p style={{ color: '#22c55e', fontSize: 13 }}>{createLeagueSuccess}</p>}
        </div>
      </div>
      {league.events.length > 0 && (
        <div className="data-field-row" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <label className="data-field-label">Danger zone</label>
          {confirmClear ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#f97316' }}>Delete all {league.events.length} events?</span>
              <button
                className="btn-primary"
                style={{ background: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => { onClearAllEvents(); setConfirmClear(false); }}
              >
                <Trash2 size={13} /> Yes, delete all
              </button>
              <button className="btn-secondary" onClick={() => setConfirmClear(false)}>Cancel</button>
            </div>
          ) : (
            <button
              className="btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderColor: '#ef4444', color: '#ef4444' }}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 size={13} /> Delete all events
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function DataPage({
  activeLeagueId,
  availableLeagues,
  league, courseConfig, playerConfig,
  onImportSnapshot, onBulkEventsAdded, onLeagueNameChange, onClearAllEvents, onCreateLeague,
  hideLeagueSettings = false,
}: DataPageProps) {
  // ── Bulk URL import ──────────────────────────────────────────────────────
  const [urlText, setUrlText] = useState('');
  const [urlRows, setUrlRows] = useState<UrlRow[]>([]);
  const [importing, setImporting] = useState(false);

  // ── File import ──────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [publishPin, setPublishPin] = useState('');
  const [publishError, setPublishError] = useState('');
  const [publishSuccess, setPublishSuccess] = useState('');
  const [publishing, setPublishing] = useState(false);

  // ── Confirm replace dialog ────────────────────────────────────────────────
  const [pendingSnap, setPendingSnap] = useState<LeagueSnapshot | null>(null);

  // Parse URL list into rows
  function prepareUrls() {
    const lines = urlText
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && l.includes('golfleague.net'));
    if (!lines.length) return;
    setUrlRows(lines.map(url => ({ url, status: 'pending' })));
  }

  async function runBulkImport() {
    if (importing || !urlRows.length) return;
    setImporting(true);

    let currentLeague = { ...league };
    let currentPlayerConfig = { ...playerConfig };

    const updatedRows = [...urlRows];

    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      if (row.status === 'done') continue;

      updatedRows[i] = { ...row, status: 'loading' };
      setUrlRows([...updatedRows]);

      try {
        const parsedUrl = new URL(row.url);
        const proxyPath = '/golf-proxy' + parsedUrl.pathname + parsedUrl.search;
        const res = await fetch(proxyPath);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();

        const parsed = parseGolfSoftwareHTML(html);
        if (!parsed) throw new Error('Could not find player data in the page.');

        const eventData = { ...parsed, id: `event-${parsed.eventNumber}-${Date.now()}` };

        // Add/replace event
        const existing = currentLeague.events.findIndex(e => e.eventNumber === eventData.eventNumber);
        const events = existing >= 0
          ? currentLeague.events.map((e, idx) => idx === existing ? eventData : e)
          : [...currentLeague.events, eventData].sort((a, b) => a.eventNumber - b.eventNumber);

        currentLeague = { ...currentLeague, events: recalculateCumulativeStandings(events) };
        currentPlayerConfig = applyAutoHide(currentPlayerConfig, currentLeague.events);

        updatedRows[i] = {
          ...updatedRows[i],
          status: 'done',
          label: `Event ${eventData.eventNumber}${eventData.eventDate ? ` · ${eventData.eventDate}` : ''} · ${eventData.nineHoles === 'back' ? 'Back 9' : 'Front 9'}`,
        };
      } catch (err) {
        updatedRows[i] = { ...updatedRows[i], status: 'error', error: (err as Error).message };
      }

      setUrlRows([...updatedRows]);
      // Small delay to not hammer the proxy
      await new Promise(r => setTimeout(r, 300));
    }

    setImporting(false);
    onBulkEventsAdded(currentLeague, currentPlayerConfig);
  }

  function clearCompleted() {
    setUrlRows(rows => rows.filter(r => r.status !== 'done'));
  }

  // File import
  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImportError('');
    setImportSuccess('');
    try {
      const snap = await parseSnapshotFile(file);
      setPendingSnap(snap);
    } catch (err) {
      setImportError((err as Error).message);
    }
  }

  function confirmImport() {
    if (!pendingSnap) return;
    onImportSnapshot(pendingSnap);
    setImportSuccess(`Loaded "${pendingSnap.league.leagueName}" — ${pendingSnap.league.events.length} events.`);
    setPendingSnap(null);
  }

  async function publishToGitHub() {
    setPublishError('');
    setPublishSuccess('');
    setPublishing(true);

    try {
      const snapshot: LeagueSnapshot = {
        version: 1,
        exportedAt: new Date().toISOString(),
        league,
        courseConfig,
        playerConfig,
      };

      const res = await fetch('/.netlify/functions/publish-shared-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(publishPin ? { 'x-admin-pin': publishPin } : {}),
        },
        body: JSON.stringify({
          leagueId: activeLeagueId,
          snapshot,
          commitMessage: `Publish ${activeLeagueId}.json after ${league.events.length} event${league.events.length === 1 ? '' : 's'}`,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const baseError = typeof data.error === 'string' ? data.error : 'Failed to publish to GitHub.';
        const details = typeof data.details === 'string' && data.details.trim().length > 0 ? ` ${data.details}` : '';
        throw new Error(`${baseError}${details}`.trim());
      }

      setPublishSuccess(
        data.commitSha
          ? `Published ${activeLeagueId}.json to GitHub. Commit ${String(data.commitSha).slice(0, 7)}.`
          : `Published ${activeLeagueId}.json to GitHub.`
      );
    } catch (err) {
      setPublishError((err as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  const doneCount = urlRows.filter(r => r.status === 'done').length;
  const hasAnyPending = urlRows.some(r => r.status === 'pending' || r.status === 'error');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {!hideLeagueSettings && (
        <LeagueSettingsSection
          availableLeagues={availableLeagues}
          league={league}
          onLeagueNameChange={onLeagueNameChange}
          onClearAllEvents={onClearAllEvents}
          onCreateLeague={onCreateLeague}
        />
      )}

      {/* ── Bulk URL import ──────────────────────────────────────────── */}
      <div className="chart-container">
        <h3 className="chart-title">Bulk URL Import</h3>
        <p className="chart-subtitle">
          Paste one golfsoftware.com standings URL per line. The played nine is auto-detected from each page.
        </p>

        {urlRows.length === 0 ? (
          <>
            <textarea
              className="html-input"
              style={{ height: 120, marginBottom: 10 }}
              placeholder={`https://service.golfleague.net/lm/72698/8/results/player_standings_by_points-01.html\nhttps://service.golfleague.net/lm/72698/8/results/player_standings_by_points-02.html\n...`}
              value={urlText}
              onChange={e => setUrlText(e.target.value)}
            />
            <button
              className="btn-primary"
              onClick={prepareUrls}
              disabled={!urlText.trim()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <Link size={14} /> Prepare {urlText.split('\n').filter(l => l.trim().includes('golfleague')).length || ''} URLs
            </button>
          </>
        ) : (
          <>
            <div className="bulk-url-list">
              {urlRows.map((row, i) => (
                <div key={i} className={`bulk-url-row bulk-url-${row.status}`}>
                  <div className="bulk-url-icon">
                    {row.status === 'pending'  && <div className="bulk-dot" />}
                    {row.status === 'loading'  && <Loader size={15} className="spin" />}
                    {row.status === 'done'     && <CheckCircle size={15} style={{ color: '#22c55e' }} />}
                    {row.status === 'error'    && <XCircle size={15} style={{ color: '#ef4444' }} />}
                  </div>
                  <div className="bulk-url-info">
                    <span className="bulk-url-text">{row.label ?? row.url}</span>
                    {row.error && <span className="bulk-url-error">{row.error}</span>}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button
                className="btn-primary"
                onClick={runBulkImport}
                disabled={importing || !hasAnyPending}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                {importing
                  ? <><Loader size={14} className="spin" /> Importing…</>
                  : <><Upload size={14} /> {hasAnyPending ? `Import ${urlRows.filter(r => r.status !== 'done').length} remaining` : 'All done'}</>
                }
              </button>
              {doneCount > 0 && (
                <button className="btn-secondary" onClick={clearCompleted}>
                  Clear {doneCount} completed
                </button>
              )}
              <button className="btn-secondary" onClick={() => { setUrlRows([]); setUrlText(''); }}>
                Reset
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Export ───────────────────────────────────────────────────── */}
      <div className="chart-container">
        <h3 className="chart-title">Backup / Transfer League Data</h3>
        <p className="chart-subtitle">
          Downloads a dated JSON backup containing all events, course scorecard, and player settings.
          Use this to back up your work or move league data between devices/browsers.
        </p>
        <button
          className="btn-primary"
          onClick={() => exportSnapshot(league, courseConfig, playerConfig)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <Download size={14} /> Export backup JSON
        </button>
        <div className="data-export-divider" />
        <h3 className="chart-title">Manual Publish Fallback</h3>
        <p className="chart-subtitle">
          Downloads the exact shared season file used by the public app. Replace
          <strong style={{ color: 'var(--text)' }}> {activeLeagueId}.json</strong>
          {' '}in your CarringtonLeagueData GitHub repo if you need to publish manually.
        </p>
        <button
          className="btn-secondary"
          onClick={() => exportSharedSnapshot(activeLeagueId, league, courseConfig, playerConfig)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
        >
          <Download size={14} /> Export manual publish file
        </button>
        <div className="data-export-divider" />
        <h3 className="chart-title">Publish to GitHub</h3>
        <p className="chart-subtitle">
          Preferred workflow. Push the current season snapshot directly to your CarringtonLeagueData repo through a secure Netlify Function.
          Set <strong style={{ color: 'var(--text)' }}>GITHUB_DATA_TOKEN</strong> and optionally
          <strong style={{ color: 'var(--text)' }}> PUBLISH_ADMIN_PIN</strong> in Netlify first.
          Publishing updates <strong style={{ color: 'var(--text)' }}>{activeLeagueId}.json</strong> in place; it does not create a new season file.
        </p>
        {publishError && <p className="error" style={{ marginBottom: 10 }}>{publishError}</p>}
        {publishSuccess && (
          <p style={{ color: '#22c55e', fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle size={14} /> {publishSuccess}
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="url-input"
            style={{ maxWidth: 220 }}
            type="password"
            placeholder="Publish PIN (if required)"
            value={publishPin}
            onChange={(e) => setPublishPin(e.target.value)}
          />
          <button
            className="btn-primary"
            onClick={publishToGitHub}
            disabled={publishing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            {publishing ? <><Loader size={14} className="spin" /> Publishing…</> : <><Upload size={14} /> Publish {activeLeagueId}.json</>}
          </button>
        </div>
      </div>

      {/* ── Import ───────────────────────────────────────────────────── */}
      <div className="chart-container">
        <h3 className="chart-title">Import League Data</h3>
        <p className="chart-subtitle">
          Load a previously exported JSON file. This replaces all current data.
        </p>

        {importError && <p className="error" style={{ marginBottom: 10 }}>{importError}</p>}
        {importSuccess && (
          <p style={{ color: '#22c55e', fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle size={14} /> {importSuccess}
          </p>
        )}

        {pendingSnap ? (
          <div className="data-confirm-box">
            <p style={{ color: 'var(--text)', marginBottom: 12 }}>
              <strong>Replace current data with:</strong>
            </p>
            <ul style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16, paddingLeft: 20, lineHeight: 2 }}>
              <li>League: <strong style={{ color: 'var(--text)' }}>{pendingSnap.league.leagueName}</strong></li>
              <li>Events: <strong style={{ color: 'var(--text)' }}>{pendingSnap.league.events.length}</strong></li>
              <li>Exported: <strong style={{ color: 'var(--text)' }}>{new Date(pendingSnap.exportedAt).toLocaleDateString()}</strong></li>
              <li>Course: <strong style={{ color: 'var(--text)' }}>{pendingSnap.courseConfig?.courseName || '(none)'}</strong></li>
            </ul>
            <p style={{ color: '#f97316', fontSize: 12, marginBottom: 14 }}>
              ⚠ This will overwrite all current events and settings.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-primary" onClick={confirmImport} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Upload size={14} /> Confirm Import
              </button>
              <button className="btn-secondary" onClick={() => setPendingSnap(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
            <button
              className="btn-secondary"
              onClick={() => fileRef.current?.click()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <Upload size={14} /> Choose JSON file…
            </button>
          </>
        )}
      </div>
    </div>
  );
}
