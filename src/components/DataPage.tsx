import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AdjustedScoringSettings,
  EventDateDisplaySettings,
  EventDateFormat,
  EventTimeFormat,
  LeagueData,
  LeagueWeatherSettings,
  CourseConfig,
  HandicapMode,
  PlayerConfig,
} from '../types/golf';
import { parseGolfSoftwareHTML } from '../lib/parser';
import { recalculateCumulativeStandings } from '../lib/parser';
import { applyAutoHide, exportSharedSnapshot, exportSnapshot, parseSnapshotFile } from '../lib/storage';
import type { BuiltInLeague, LeagueSnapshot } from '../lib/storage';
import {
  createEmptyManualPlayerSheetMapping,
  inspectExcelWorkbook,
  importExcelWorkbook,
  previewPlayerSheetMapping,
  type ExcelWorkbookPreview,
  type ManualPlayerSheetMapping,
  type PlayerSheetImportOptions,
  type PlayerSheetMappingPreview,
  type WorkbookLayout,
} from '../lib/excelImport';
import { formatEventDateDisplay } from '../lib/eventDateDisplay';
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
  onLeagueHandicapModeChange: (mode: HandicapMode) => void;
  onLeagueAdjustedScoringChange: (settings: AdjustedScoringSettings) => void;
  onEventDateDisplayChange: (settings: EventDateDisplaySettings) => void;
  onLeagueWeatherSettingsChange?: (settings: LeagueWeatherSettings) => void;
  onClearAllEvents: () => void;
  onLeagueImageChange?: (imageDataUrl: string | null) => void;
  onDeleteLeague?: () => void;
  onCreateLeague: (leagueId: string, leagueName: string) => void;
  hideLeagueSettings?: boolean;
}

type UrlStatus = 'pending' | 'loading' | 'done' | 'error';
interface UrlRow {
  url: string;
  status: UrlStatus;
  label?: string;
  error?: string;
}

function createDefaultPlayerSheetImportOptions(): PlayerSheetImportOptions {
  return {
    mappingMode: 'auto',
    grossScoreSource: 'auto',
    handicapSource: 'auto',
    netScoreSource: 'auto',
    manualMapping: createEmptyManualPlayerSheetMapping(),
  };
}

function isManualMappingBlank(mapping: ManualPlayerSheetMapping | null): boolean {
  if (!mapping) return true;

  const scalarFields = [
    mapping.eventStart,
    mapping.eventEnd,
    mapping.playerNameCell,
    mapping.eventNumberLine,
    mapping.eventDateLine,
    mapping.nineLine,
    mapping.grossFrontLine,
    mapping.grossBackLine,
    mapping.handicapFrontLine,
    mapping.handicapBackLine,
    mapping.netLine,
    mapping.pointsLine,
    mapping.bonusLine,
    mapping.frontHoleStartLine,
    mapping.frontHoleEndLine,
    mapping.backHoleStartLine,
    mapping.backHoleEndLine,
  ];
  if (scalarFields.some((value) => value.trim().length > 0)) return false;
  return true;
}

function collectMappedColumns(mapping: ManualPlayerSheetMapping | null): Set<string> {
  if (!mapping) return new Set();

  const normalizeColumnLetters = (value: string): string[] => {
    const normalized = value.trim().toUpperCase();
    return /^[A-Z]+$/.test(normalized) ? [normalized] : [];
  };

  const expandColumnRange = (start: string, end: string): string[] => {
    const startValue = start.trim().toUpperCase();
    const endValue = end.trim().toUpperCase();
    if (!/^[A-Z]+$/.test(startValue) || !/^[A-Z]+$/.test(endValue)) return [];
    const toIndex = (letters: string) => letters.split('').reduce((total, char) => total * 26 + (char.charCodeAt(0) - 64), 0) - 1;
    const toLetters = (index: number) => {
      let n = index + 1;
      let output = '';
      while (n > 0) {
        const rem = (n - 1) % 26;
        output = String.fromCharCode(65 + rem) + output;
        n = Math.floor((n - 1) / 26);
      }
      return output;
    };
    const startIndex = toIndex(startValue);
    const endIndex = toIndex(endValue);
    const minIndex = Math.min(startIndex, endIndex);
    const maxIndex = Math.max(startIndex, endIndex);
    return Array.from({ length: maxIndex - minIndex + 1 }, (_, index) => toLetters(minIndex + index));
  };

  const directColumns = mapping.eventAxis === 'rows'
    ? [
      ...normalizeColumnLetters(mapping.eventNumberLine),
      ...normalizeColumnLetters(mapping.eventDateLine),
      ...normalizeColumnLetters(mapping.nineLine),
      ...normalizeColumnLetters(mapping.grossFrontLine),
      ...normalizeColumnLetters(mapping.grossBackLine),
      ...normalizeColumnLetters(mapping.handicapFrontLine),
      ...normalizeColumnLetters(mapping.handicapBackLine),
      ...normalizeColumnLetters(mapping.netLine),
      ...normalizeColumnLetters(mapping.pointsLine),
      ...normalizeColumnLetters(mapping.bonusLine),
      ...expandColumnRange(mapping.frontHoleStartLine, mapping.frontHoleEndLine),
      ...expandColumnRange(mapping.backHoleStartLine, mapping.backHoleEndLine),
    ]
    : [
      ...normalizeColumnLetters(mapping.eventStart),
      ...normalizeColumnLetters(mapping.eventEnd),
    ];

  const playerNameColumn = mapping.playerNameCell.trim().match(/^([A-Z]+)\d+$/i)?.[1]?.toUpperCase();
  return new Set(playerNameColumn ? [...directColumns, playerNameColumn] : directColumns);
}

function collectMappedRows(mapping: ManualPlayerSheetMapping | null): Set<number> {
  if (!mapping) return new Set();
  const values = [
    mapping.eventAxis === 'rows' ? mapping.eventStart : mapping.eventNumberLine,
    mapping.eventAxis === 'rows' ? mapping.eventEnd : mapping.eventDateLine,
    mapping.eventAxis === 'columns' ? mapping.nineLine : '',
    mapping.eventAxis === 'columns' ? mapping.grossFrontLine : '',
    mapping.eventAxis === 'columns' ? mapping.grossBackLine : '',
    mapping.eventAxis === 'columns' ? mapping.handicapFrontLine : '',
    mapping.eventAxis === 'columns' ? mapping.handicapBackLine : '',
    mapping.eventAxis === 'columns' ? mapping.netLine : '',
    mapping.eventAxis === 'columns' ? mapping.pointsLine : '',
    mapping.eventAxis === 'columns' ? mapping.bonusLine : '',
    mapping.eventAxis === 'columns' ? mapping.frontHoleStartLine : '',
    mapping.eventAxis === 'columns' ? mapping.frontHoleEndLine : '',
    mapping.eventAxis === 'columns' ? mapping.backHoleStartLine : '',
    mapping.eventAxis === 'columns' ? mapping.backHoleEndLine : '',
  ];
  const playerNameRow = mapping.playerNameCell.trim().match(/^[A-Z]+(\d+)$/i)?.[1];
  if (playerNameRow) values.push(playerNameRow);
  return new Set(
    values
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isFinite(value) && value > 0),
  );
}

interface LeagueSettingsSectionProps {
  activeLeagueId: string;
  availableLeagues: BuiltInLeague[];
  league: LeagueData;
  onLeagueNameChange: (name: string) => void;
  onLeagueImageChange: (imageDataUrl: string | null) => void;
  onLeagueHandicapModeChange: (mode: HandicapMode) => void;
  onLeagueAdjustedScoringChange: (settings: AdjustedScoringSettings) => void;
  onEventDateDisplayChange: (settings: EventDateDisplaySettings) => void;
  onLeagueWeatherSettingsChange: (settings: LeagueWeatherSettings) => void;
  onClearAllEvents: () => void;
  onDeleteLeague: () => void;
}

interface WeatherLocationResult {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

export function LeagueSettingsSection({
  activeLeagueId,
  availableLeagues,
  league,
  onLeagueNameChange,
  onLeagueImageChange,
  onLeagueHandicapModeChange,
  onLeagueAdjustedScoringChange,
  onEventDateDisplayChange,
  onLeagueWeatherSettingsChange,
  onClearAllEvents,
  onDeleteLeague,
}: LeagueSettingsSectionProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(league.leagueName);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDeleteLeague, setConfirmDeleteLeague] = useState(false);
  const [locationSearch, setLocationSearch] = useState(league.weatherSettings.locationName);
  const [locationResults, setLocationResults] = useState<WeatherLocationResult[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const canDeleteLeague = availableLeagues.length > 1;

  async function handleLeagueImageFile(file: File) {
    const reader = new FileReader();
    const result = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
    });
    onLeagueImageChange(result || null);
  }

  async function searchLocations() {
    const rawQuery = locationSearch.trim();
    if (!rawQuery) return;
    setLocationLoading(true);
    setLocationError('');
    setLocationResults([]);
    try {
      const tokens = rawQuery
        .toLowerCase()
        .split(/[\s,]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3);

      const fallbackQueries = [
        rawQuery,
        rawQuery.replace(/,/g, ' ').replace(/\s+/g, ' ').trim(),
        rawQuery.split(',')[0]?.trim() ?? '',
        rawQuery.split(/[\s,]+/)[0]?.trim() ?? '',
      ].filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);

      let results: WeatherLocationResult[] = [];
      for (const query of fallbackQueries) {
        const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=en&format=json`);
        if (!res.ok) throw new Error(`Location lookup failed (HTTP ${res.status}).`);
        const data = await res.json() as { results?: WeatherLocationResult[] };
        const candidateResults = Array.isArray(data.results) ? data.results : [];
        if (candidateResults.length > 0) {
          results = candidateResults;
          break;
        }
      }

      if (results.length > 1 && tokens.length > 0) {
        const scoreResult = (result: WeatherLocationResult): number => {
          const name = (result.name ?? '').toLowerCase();
          const admin1 = (result.admin1 ?? '').toLowerCase();
          const admin2 = (result as WeatherLocationResult & { admin2?: string }).admin2?.toLowerCase() ?? '';
          const country = (result.country ?? '').toLowerCase();
          return tokens.reduce((score, token) => {
            if (name === token) return score + 8;
            let nextScore = score;
            if (name.includes(token)) nextScore += 5;
            if (admin1.includes(token)) nextScore += 4;
            if (admin2.includes(token)) nextScore += 3;
            if (country.includes(token)) nextScore += 3;
            return nextScore;
          }, 0);
        };

        results = [...results].sort((a, b) => scoreResult(b) - scoreResult(a));
      }

      if (!results.length) {
        setLocationError('No matching locations found. Try a more specific course/city name.');
      }
      setLocationResults(results.slice(0, 10));
    } catch (error) {
      setLocationError((error as Error).message || 'Failed to search locations.');
    } finally {
      setLocationLoading(false);
    }
  }

  function saveWeatherLocation(result: WeatherLocationResult) {
    const label = [result.name, result.admin1, result.country].filter(Boolean).join(', ');
    setLocationSearch(label);
    setLocationResults([]);
    onLeagueWeatherSettingsChange({
      ...league.weatherSettings,
      locationName: label,
      latitude: result.latitude,
      longitude: result.longitude,
    });
  }

  function handleSaveName() {
    if (nameInput.trim()) {
      onLeagueNameChange(nameInput.trim());
      setEditingName(false);
    }
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

      <div className="data-field-row" style={{ marginTop: 12 }}>
        <label className="data-field-label">Handicap Mode</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <select
            className="url-input"
            style={{ maxWidth: 320 }}
            value={league.handicapMode}
            onChange={(e) => onLeagueHandicapModeChange(e.target.value as HandicapMode)}
          >
            <option value="general">General handicap</option>
            <option value="front-back">Front/back handicap (by played side)</option>
          </select>
          <span style={{ color: 'var(--text2)', fontSize: 12 }}>
            Controls handicap labels across player and trend pages.
          </span>
        </div>
      </div>

      <div className="data-field-row" style={{ marginTop: 12, alignItems: 'flex-start' }}>
        <label className="data-field-label">League Image</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1 }}>
          <img
            src={league.leagueImage || '/logo.png'}
            alt="League"
            style={{ width: 52, height: 52, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--border)' }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              await handleLeagueImageFile(file);
              e.currentTarget.value = '';
            }}
          />
          <button className="btn-secondary" onClick={() => fileRef.current?.click()}>Upload Image</button>
          <button className="btn-secondary" onClick={() => onLeagueImageChange(null)} disabled={!league.leagueImage}>Use Default</button>
          <span style={{ color: 'var(--text2)', fontSize: 12 }}>
            Used in the sidebar, header, and season branding.
          </span>
        </div>
      </div>

      <div className="data-field-row" style={{ marginTop: 12 }}>
        <label className="data-field-label">Adjusted Scoring</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, flex: 1 }}>
          <div>
            <label style={{ color: 'var(--text2)', fontSize: 12, display: 'block', marginBottom: 4 }}>Season scoring</label>
            <select
              className="url-input"
              value={league.adjustedScoring.mode}
              onChange={(e) => {
                const mode = e.target.value as AdjustedScoringSettings['mode'];
                onLeagueAdjustedScoringChange({
                  ...league.adjustedScoring,
                  mode,
                  dropCount: mode === 'drop-lowest' ? Math.max(league.adjustedScoring.dropCount, 1) : league.adjustedScoring.dropCount,
                });
              }}
            >
              <option value="none">No adjustment (all events count)</option>
              <option value="drop-lowest">Drop lowest scores</option>
            </select>
          </div>

          <div>
            <label style={{ color: 'var(--text2)', fontSize: 12, display: 'block', marginBottom: 4 }}>Lowest scores to drop</label>
            <input
              className="url-input"
              type="number"
              min={0}
              step={1}
              value={league.adjustedScoring.dropCount}
              disabled={league.adjustedScoring.mode !== 'drop-lowest'}
              onChange={(e) => {
                const raw = Number.parseInt(e.target.value, 10);
                onLeagueAdjustedScoringChange({
                  ...league.adjustedScoring,
                  dropCount: Number.isFinite(raw) ? Math.max(0, raw) : 0,
                });
              }}
            />
          </div>
          <span style={{ color: 'var(--text2)', fontSize: 12, gridColumn: '1 / -1' }}>
            Example: set to "Drop lowest scores" and value 2 to ignore each player's two lowest event points for season standings.
          </span>
        </div>
      </div>

      <div className="data-field-row" style={{ marginTop: 12, alignItems: 'flex-start' }}>
        <label className="data-field-label">Event Date/Time</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, flex: 1 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={league.eventDateDisplay.showDate}
              onChange={(e) => onEventDateDisplayChange({ ...league.eventDateDisplay, showDate: e.target.checked })}
            />
            Show date
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={league.eventDateDisplay.showTime}
              onChange={(e) => onEventDateDisplayChange({ ...league.eventDateDisplay, showTime: e.target.checked })}
            />
            Show time
          </label>

          <div>
            <label style={{ color: 'var(--text2)', fontSize: 12, display: 'block', marginBottom: 4 }}>Date format</label>
            <select
              className="url-input"
              value={league.eventDateDisplay.dateFormat}
              onChange={(e) => onEventDateDisplayChange({ ...league.eventDateDisplay, dateFormat: e.target.value as EventDateFormat })}
            >
              <option value="M/D/YYYY">M/D/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="MMM D, YYYY">MMM D, YYYY</option>
              <option value="D MMM YYYY">D MMM YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </div>

          <div>
            <label style={{ color: 'var(--text2)', fontSize: 12, display: 'block', marginBottom: 4 }}>Time format</label>
            <select
              className="url-input"
              value={league.eventDateDisplay.timeFormat}
              onChange={(e) => onEventDateDisplayChange({ ...league.eventDateDisplay, timeFormat: e.target.value as EventTimeFormat })}
            >
              <option value="12h">12-hour</option>
              <option value="24h">24-hour</option>
            </select>
          </div>
        </div>
      </div>

      <div className="data-field-row" style={{ marginTop: 12, alignItems: 'flex-start' }}>
        <label className="data-field-label">Weather</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) auto', gap: 8 }}>
            <input
              className="url-input"
              placeholder="Search course city or course name"
              value={locationSearch}
              onChange={(e) => setLocationSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchLocations()}
            />
            <button className="btn-secondary" onClick={searchLocations} disabled={locationLoading}>
              {locationLoading ? 'Searching…' : 'Find Location'}
            </button>
          </div>
          {locationError && <span className="error">{locationError}</span>}
          {locationResults.length > 0 && (
            <div style={{ display: 'grid', gap: 6 }}>
              {locationResults.map((result) => {
                const label = [result.name, result.admin1, result.country].filter(Boolean).join(', ');
                return (
                  <button
                    key={`${label}-${result.latitude}-${result.longitude}`}
                    className="btn-secondary"
                    style={{ textAlign: 'left' }}
                    onClick={() => saveWeatherLocation(result)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            <div>
              <label style={{ color: 'var(--text2)', fontSize: 12, display: 'block', marginBottom: 4 }}>League play start time</label>
              <input
                className="url-input"
                type="time"
                value={league.weatherSettings.playTime || '17:00'}
                onChange={(e) => onLeagueWeatherSettingsChange({ ...league.weatherSettings, playTime: e.target.value || '17:00' })}
              />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text2)', fontSize: 12 }}>
              Manual weather entry is enabled. Add weather details when creating each event.
            </span>
            {league.weatherSettings.locationName && (
              <span style={{ color: 'var(--text2)', fontSize: 12 }}>
                Location: {league.weatherSettings.locationName}
                {typeof league.weatherSettings.latitude === 'number' && typeof league.weatherSettings.longitude === 'number'
                  ? ` (${league.weatherSettings.latitude.toFixed(3)}, ${league.weatherSettings.longitude.toFixed(3)})`
                  : ''}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="data-field-row" style={{ marginTop: 10 }}>
        <label className="data-field-label">Events loaded</label>
        <span style={{ color: 'var(--text2)', fontSize: 13 }}>{league.events.length} event{league.events.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="data-field-row" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', alignItems: 'flex-start' }}>
        <label className="data-field-label">Danger zone</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          {league.events.length > 0 && (
            <>
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
                  style={{ width: 'fit-content', display: 'inline-flex', alignItems: 'center', gap: 8, borderColor: '#ef4444', color: '#ef4444' }}
                  onClick={() => setConfirmClear(true)}
                >
                  <Trash2 size={13} /> Delete all events
                </button>
              )}
            </>
          )}

          {confirmDeleteLeague ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: '#f97316' }}>Delete league {activeLeagueId} ({league.leagueName})?</span>
              <button
                className="btn-primary"
                style={{ background: '#b91c1c', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={() => { onDeleteLeague(); setConfirmDeleteLeague(false); }}
                disabled={!canDeleteLeague}
              >
                <Trash2 size={13} /> Yes, delete league
              </button>
              <button className="btn-secondary" onClick={() => setConfirmDeleteLeague(false)}>Cancel</button>
            </div>
          ) : (
            <button
              className="btn-secondary"
              style={{ width: 'fit-content', display: 'inline-flex', alignItems: 'center', gap: 8, borderColor: '#b91c1c', color: '#b91c1c' }}
              onClick={() => setConfirmDeleteLeague(true)}
              disabled={!canDeleteLeague}
              title={canDeleteLeague ? 'Delete this entire season' : 'At least one league must remain'}
            >
              <Trash2 size={13} /> Delete league
            </button>
          )}
          {!canDeleteLeague && (
            <span style={{ color: 'var(--text2)', fontSize: 12 }}>You need at least one league. Create another season before deleting this one.</span>
          )}
        </div>
      </div>
    </div>
  );
}

interface CreateSeasonSectionProps {
  availableLeagues: BuiltInLeague[];
  onCreateLeague: (leagueId: string, leagueName: string) => void;
}

export function CreateSeasonSection({ availableLeagues, onCreateLeague }: CreateSeasonSectionProps) {
  const [newLeagueYear, setNewLeagueYear] = useState('');
  const [newLeagueName, setNewLeagueName] = useState('');
  const [createLeagueError, setCreateLeagueError] = useState('');
  const [createLeagueSuccess, setCreateLeagueSuccess] = useState('');

  function slugify(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function handleCreateLeague() {
    const trimmedYear = newLeagueYear.trim();
    const trimmedName = newLeagueName.trim();
    setCreateLeagueError('');
    setCreateLeagueSuccess('');

    if (!/^\d{4}$/.test(trimmedYear)) {
      setCreateLeagueError('Enter a 4-digit season year, for example 2024.');
      return;
    }
    if (!trimmedName) {
      setCreateLeagueError('Enter a league name, for example Tuesday League or Club Championship.');
      return;
    }

    const leagueId = `${trimmedYear}-${slugify(trimmedName) || 'league'}`;
    if (availableLeagues.some((item) => item.id === leagueId)) {
      setCreateLeagueError('A league with that year and name already exists.');
      return;
    }

    onCreateLeague(leagueId, trimmedName);
    setCreateLeagueSuccess(`Created ${trimmedYear} ${trimmedName} and switched to it.`);
    setNewLeagueYear('');
    setNewLeagueName('');
  }

  return (
    <div className="chart-container">
      <h3 className="chart-title">Create Season</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="url-input"
            style={{ maxWidth: 160 }}
            placeholder="2024"
            value={newLeagueYear}
            onChange={(e) => setNewLeagueYear(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateLeague()}
          />
          <input
            className="url-input"
            style={{ flex: 1, minWidth: 200 }}
            placeholder="Tuesday League"
            value={newLeagueName}
            onChange={(e) => setNewLeagueName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateLeague()}
          />
          <button className="btn-secondary" onClick={handleCreateLeague}>Create & Switch</button>
        </div>
        <p style={{ color: 'var(--text2)', fontSize: 12 }}>
          Creates an empty season like <strong style={{ color: 'var(--text)' }}>2024 Tuesday League</strong> locally so you can import and publish any league name.
        </p>
        {createLeagueError && <p className="error">{createLeagueError}</p>}
        {createLeagueSuccess && <p style={{ color: '#22c55e', fontSize: 13 }}>{createLeagueSuccess}</p>}
      </div>
    </div>
  );
}

export default function DataPage({
  activeLeagueId,
  availableLeagues,
  league, courseConfig, playerConfig,
  onImportSnapshot, onBulkEventsAdded, onLeagueNameChange, onLeagueHandicapModeChange, onLeagueAdjustedScoringChange, onEventDateDisplayChange, onLeagueWeatherSettingsChange, onClearAllEvents, onLeagueImageChange, onDeleteLeague, onCreateLeague,
  hideLeagueSettings = false,
}: DataPageProps) {
  // ── Bulk URL import ──────────────────────────────────────────────────────
  const [urlText, setUrlText] = useState('');
  const [urlRows, setUrlRows] = useState<UrlRow[]>([]);
  const [importing, setImporting] = useState(false);

  // ── File import ──────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const excelFileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [excelImportError, setExcelImportError] = useState('');
  const [excelImportSuccess, setExcelImportSuccess] = useState('');
  const [excelImportWarnings, setExcelImportWarnings] = useState<string[]>([]);
  const [excelImporting, setExcelImporting] = useState(false);
  const [excelPreview, setExcelPreview] = useState<ExcelWorkbookPreview | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelSelectedSheets, setExcelSelectedSheets] = useState<string[]>([]);
  const [excelLayoutMode, setExcelLayoutMode] = useState<WorkbookLayout>('unknown');
  const [excelPlayerSheetOptions, setExcelPlayerSheetOptions] = useState<PlayerSheetImportOptions>(createDefaultPlayerSheetImportOptions);
  const [excelPreviewSheetName, setExcelPreviewSheetName] = useState('');
  const [excelPlayerSheetPreview, setExcelPlayerSheetPreview] = useState<PlayerSheetMappingPreview | null>(null);
  const [excelPlayerSheetPreviewLoading, setExcelPlayerSheetPreviewLoading] = useState(false);
  const [excelPlayerSheetPreviewError, setExcelPlayerSheetPreviewError] = useState('');
  const [publishPin, setPublishPin] = useState('');
  const [publishError, setPublishError] = useState('');
  const [publishSuccess, setPublishSuccess] = useState('');
  const [publishing, setPublishing] = useState(false);

  // ── Confirm replace dialog ────────────────────────────────────────────────
  const [pendingSnap, setPendingSnap] = useState<LeagueSnapshot | null>(null);

  const playerSheetModeActive = excelLayoutMode === 'player-sheets'
    || (excelLayoutMode === 'unknown' && excelPreview?.detectedLayout === 'player-sheets');
  const previewPlayerSheetCandidates = (excelPreview?.sheets ?? []).filter((sheet) => (
    sheet.status !== 'invalid'
    && excelSelectedSheets.includes(sheet.sheetName)
    && playerSheetModeActive
  ));
  const activeExcelPreviewSheetName = useMemo(() => {
    const candidateNames = previewPlayerSheetCandidates.map((sheet) => sheet.sheetName);
    return excelPreviewSheetName && candidateNames.includes(excelPreviewSheetName)
      ? excelPreviewSheetName
      : candidateNames[0] ?? '';
  }, [excelPreviewSheetName, previewPlayerSheetCandidates]);

  useEffect(() => {
    if (!excelFile || !playerSheetModeActive || !activeExcelPreviewSheetName) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExcelPlayerSheetPreviewLoading(true);
    setExcelPlayerSheetPreviewError('');

    previewPlayerSheetMapping(excelFile, activeExcelPreviewSheetName, { playerSheets: excelPlayerSheetOptions })
      .then((preview) => {
        if (cancelled) return;
        setExcelPlayerSheetPreview(preview);
        setExcelPlayerSheetOptions((current) => {
          if (!preview.detectedMapping || !isManualMappingBlank(current.manualMapping)) return current;
          return {
            ...current,
            manualMapping: preview.detectedMapping,
          };
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setExcelPlayerSheetPreview(null);
        setExcelPlayerSheetPreviewError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setExcelPlayerSheetPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeExcelPreviewSheetName, excelFile, excelPlayerSheetOptions, playerSheetModeActive]);

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

        currentLeague = {
          ...currentLeague,
          events: recalculateCumulativeStandings(events, currentLeague.adjustedScoring),
        };
        currentPlayerConfig = applyAutoHide(currentPlayerConfig, currentLeague.events);

        updatedRows[i] = {
          ...updatedRows[i],
          status: 'done',
          label: `Event ${eventData.eventNumber}${formatEventDateDisplay(eventData.eventDate) ? ` · ${formatEventDateDisplay(eventData.eventDate)}` : ''} · ${eventData.nineHoles === 'back' ? 'Back 9' : 'Front 9'}`,
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

  async function handleExcelFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setExcelImportError('');
    setExcelImportSuccess('');
    setExcelImportWarnings([]);
    setExcelPreview(null);
    setExcelFile(null);
    setExcelSelectedSheets([]);
    setExcelPlayerSheetOptions(createDefaultPlayerSheetImportOptions());
    setExcelPreviewSheetName('');
    setExcelPlayerSheetPreview(null);
    setExcelPlayerSheetPreviewError('');

    if (!/\.(xlsx|xls|xlsm)$/i.test(file.name)) {
      setExcelImportError('Choose an Excel workbook (.xlsx, .xls, or .xlsm).');
      return;
    }

    try {
      const preview = await inspectExcelWorkbook(file);
      setExcelFile(file);
      setExcelPreview(preview);
      setExcelLayoutMode(preview.detectedLayout);
      setExcelPlayerSheetOptions(createDefaultPlayerSheetImportOptions());
      setExcelPreviewSheetName('');
      setExcelPlayerSheetPreview(null);
      setExcelPlayerSheetPreviewError('');
      setExcelSelectedSheets(preview.sheets.filter((sheet) => sheet.status !== 'invalid').map((sheet) => sheet.sheetName));
    } catch (err) {
      setExcelImportError((err as Error).message);
    }
  }

  function toggleExcelSheet(sheetName: string) {
    setExcelSelectedSheets((current) => (
      current.includes(sheetName)
        ? current.filter((name) => name !== sheetName)
        : [...current, sheetName]
    ));
  }

  function resetExcelImport() {
    setExcelImportError('');
    setExcelImportSuccess('');
    setExcelImportWarnings([]);
    setExcelPreview(null);
    setExcelFile(null);
    setExcelSelectedSheets([]);
    setExcelLayoutMode('unknown');
    setExcelPlayerSheetOptions(createDefaultPlayerSheetImportOptions());
    setExcelPreviewSheetName('');
    setExcelPlayerSheetPreview(null);
    setExcelPlayerSheetPreviewError('');
  }

  async function runExcelImport() {
    if (!excelFile || !excelPreview || excelImporting) return;
    if (!excelSelectedSheets.length) {
      setExcelImportError('Select at least one valid sheet to import.');
      return;
    }

    setExcelImporting(true);
    setExcelImportError('');
    setExcelImportSuccess('');
    setExcelImportWarnings([]);

    try {
      const result = await importExcelWorkbook(
        excelFile,
        excelSelectedSheets,
        league,
        playerConfig,
        courseConfig,
        excelLayoutMode,
        { playerSheets: excelPlayerSheetOptions },
      );
      onBulkEventsAdded(result.league, result.playerConfig);
      setExcelImportSuccess(`Imported ${result.importedSheets.length} sheet${result.importedSheets.length === 1 ? '' : 's'} from ${excelFile.name}.`);
      setExcelImportWarnings(result.warnings);
    } catch (err) {
      setExcelImportError((err as Error).message);
    } finally {
      setExcelImporting(false);
    }
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

  const manualPlayerSheetMapping = excelPlayerSheetOptions.manualMapping ?? createEmptyManualPlayerSheetMapping();
  const activeMappedColumns = collectMappedColumns(excelPlayerSheetPreview?.activeMapping ?? manualPlayerSheetMapping);
  const activeMappedRows = collectMappedRows(excelPlayerSheetPreview?.activeMapping ?? manualPlayerSheetMapping);
  const eventAxisLabel = manualPlayerSheetMapping.eventAxis === 'rows' ? 'row' : 'column';
  const fieldAxisLabel = manualPlayerSheetMapping.eventAxis === 'rows' ? 'column' : 'row';

  function updateManualMapping(patch: Partial<ManualPlayerSheetMapping>) {
    setExcelPlayerSheetOptions((current) => ({
      ...current,
      manualMapping: {
        ...(current.manualMapping ?? createEmptyManualPlayerSheetMapping()),
        ...patch,
      },
    }));
  }

  const doneCount = urlRows.filter(r => r.status === 'done').length;
  const hasAnyPending = urlRows.some(r => r.status === 'pending' || r.status === 'error');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {!hideLeagueSettings && (
        <>
          <LeagueSettingsSection
            activeLeagueId={activeLeagueId}
            availableLeagues={availableLeagues}
            league={league}
            onLeagueNameChange={onLeagueNameChange}
            onLeagueImageChange={onLeagueImageChange ?? (() => {})}
            onLeagueHandicapModeChange={onLeagueHandicapModeChange}
            onLeagueAdjustedScoringChange={onLeagueAdjustedScoringChange}
            onEventDateDisplayChange={onEventDateDisplayChange}
            onLeagueWeatherSettingsChange={onLeagueWeatherSettingsChange ?? (() => {})}
            onClearAllEvents={onClearAllEvents}
            onDeleteLeague={onDeleteLeague ?? (() => {})}
          />
          <CreateSeasonSection
            availableLeagues={availableLeagues}
            onCreateLeague={onCreateLeague}
          />
        </>
      )}

      {/* ── Excel Import ──────────────────────────────────────────── */}
      <div className="chart-container">
        <h3 className="chart-title">Import Excel Workbook</h3>
        <p className="chart-subtitle">
          Choose a workbook, then select only the sheets that contain score data. The importer auto-detects event sheets or player sheets and validates selected tabs before import.
        </p>

        {excelImportError && <p className="error" style={{ marginBottom: 10 }}>{excelImportError}</p>}
        {excelImportSuccess && (
          <p style={{ color: '#22c55e', fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle size={14} /> {excelImportSuccess}
          </p>
        )}
        {excelImportWarnings.length > 0 && (
          <div className="data-confirm-box" style={{ marginBottom: 12 }}>
            <p style={{ color: 'var(--text)', marginBottom: 8, fontWeight: 600 }}>Workbook warnings</p>
            <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text2)', fontSize: 13, lineHeight: 1.8 }}>
              {excelImportWarnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </div>
        )}

        {excelPreview && excelFile ? (
          <div className="data-confirm-box">
            <p style={{ color: 'var(--text)', marginBottom: 12 }}>
              <strong>Workbook:</strong> {excelFile.name}
            </p>
            <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 8 }}>
              Detected layout: {excelPreview.detectedLayout === 'player-sheets'
                ? 'Player sheets (one tab per player)'
                : excelPreview.detectedLayout === 'event-sheets'
                  ? 'Event sheets (one tab per event)'
                  : 'Unknown (review sheet warnings)'}
            </p>
            <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 14 }}>
              Select sheets with score rows. Summary or reference tabs can stay unchecked.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <label style={{ color: 'var(--text2)', fontSize: 13 }}>Import mode</label>
              <select
                className="url-input"
                style={{ maxWidth: 280 }}
                value={excelLayoutMode}
                onChange={(e) => setExcelLayoutMode(e.target.value as WorkbookLayout)}
              >
                <option value="unknown">Auto-detect</option>
                <option value="player-sheets">Player sheets (one tab per player)</option>
                <option value="event-sheets">Event sheets (one tab per event)</option>
              </select>
            </div>

            {playerSheetModeActive && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  marginBottom: 16,
                  padding: 12,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                  <div>
                    <label style={{ color: 'var(--text)', fontSize: 13, display: 'block', marginBottom: 6 }}>Mapping mode</label>
                    <select
                      className="url-input"
                      value={excelPlayerSheetOptions.mappingMode}
                      onChange={(e) => {
                        const nextMode = e.target.value as PlayerSheetImportOptions['mappingMode'];
                        setExcelPlayerSheetOptions((current) => ({
                          ...current,
                          mappingMode: nextMode,
                          manualMapping: nextMode === 'manual' && excelPlayerSheetPreview?.detectedMapping && isManualMappingBlank(current.manualMapping)
                            ? excelPlayerSheetPreview.detectedMapping
                            : current.manualMapping,
                        }));
                      }}
                    >
                      <option value="auto">Auto mapping</option>
                      <option value="manual">Manual mapping</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ color: 'var(--text)', fontSize: 13, display: 'block', marginBottom: 6 }}>Preview player sheet</label>
                    <select
                      className="url-input"
                      value={activeExcelPreviewSheetName}
                      onChange={(e) => setExcelPreviewSheetName(e.target.value)}
                    >
                      {previewPlayerSheetCandidates
                        .map((sheet) => <option key={sheet.sheetName} value={sheet.sheetName}>{sheet.sheetName}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ color: 'var(--text)', fontSize: 13, display: 'block', marginBottom: 6 }}>Gross score source</label>
                    <select
                      className="url-input"
                      value={excelPlayerSheetOptions.grossScoreSource}
                      onChange={(e) => setExcelPlayerSheetOptions((current) => ({
                        ...current,
                        grossScoreSource: e.target.value as PlayerSheetImportOptions['grossScoreSource'],
                      }))}
                    >
                      <option value="auto">Auto: use mapped side, fall back to hole sum</option>
                      <option value="calculate">Always calculate from holes</option>
                      <option value="front">Use front-nine Tot column</option>
                      <option value="back">Use back-nine Tot column</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ color: 'var(--text)', fontSize: 13, display: 'block', marginBottom: 6 }}>Handicap source</label>
                    <select
                      className="url-input"
                      value={excelPlayerSheetOptions.handicapSource}
                      onChange={(e) => setExcelPlayerSheetOptions((current) => ({
                        ...current,
                        handicapSource: e.target.value as PlayerSheetImportOptions['handicapSource'],
                      }))}
                    >
                      <option value="auto">Auto: use mapped side for played 9</option>
                      <option value="front">Use front-nine HC column</option>
                      <option value="back">Use back-nine HC column</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ color: 'var(--text)', fontSize: 13, display: 'block', marginBottom: 6 }}>Net source</label>
                    <select
                      className="url-input"
                      value={excelPlayerSheetOptions.netScoreSource}
                      onChange={(e) => setExcelPlayerSheetOptions((current) => ({
                        ...current,
                        netScoreSource: e.target.value as PlayerSheetImportOptions['netScoreSource'],
                      }))}
                    >
                      <option value="auto">Auto: mapped line, else gross - handicap</option>
                      <option value="calculate">Always calculate gross - handicap</option>
                      <option value="mapped">Use mapped net line only</option>
                    </select>
                  </div>
                </div>

                {excelPlayerSheetPreviewError && <p className="error" style={{ margin: 0 }}>{excelPlayerSheetPreviewError}</p>}
                {excelPlayerSheetPreviewLoading && <p style={{ margin: 0, color: 'var(--text2)', fontSize: 13 }}>Loading player-sheet preview…</p>}

                {excelPlayerSheetPreview && (
                  <>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: excelPlayerSheetPreview.status === 'ready' ? '#dcfce7' : excelPlayerSheetPreview.status === 'needs-review' ? '#fef3c7' : '#fee2e2', color: excelPlayerSheetPreview.status === 'ready' ? '#166534' : excelPlayerSheetPreview.status === 'needs-review' ? '#92400e' : '#991b1b' }}>
                        {excelPlayerSheetPreview.status === 'ready' ? 'Preview ready' : excelPlayerSheetPreview.status === 'needs-review' ? 'Review mapping' : 'Preview invalid'}
                      </span>
                      {excelPlayerSheetPreview.activeMappingSummary && (
                        <span style={{ color: 'var(--text2)', fontSize: 12 }}>Active mapping: {excelPlayerSheetPreview.activeMappingSummary}</span>
                      )}
                      {excelPlayerSheetPreview.detectedMapping && excelPlayerSheetOptions.mappingMode === 'manual' && (
                        <button
                          className="btn-secondary"
                          type="button"
                          onClick={() => setExcelPlayerSheetOptions((current) => ({
                            ...current,
                            manualMapping: excelPlayerSheetPreview.detectedMapping,
                          }))}
                        >
                          Reset manual mapping from auto-detect
                        </button>
                      )}
                    </div>

                    {excelPlayerSheetOptions.mappingMode === 'manual' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <p style={{ margin: 0, color: 'var(--text2)', fontSize: 13 }}>
                          Manual mode maps an event axis plus a few summary lines. For Ted-style sheets, use event rows with row range `5` to `23`, player name cell `A1`, front holes `C` to `K`, front total `L`, handicap `N`, back holes `O` to `W`, and back total `X`.
                        </p>
                        <p style={{ margin: 0, color: 'var(--text2)', fontSize: 12 }}>
                          Line fields below are {fieldAxisLabel}s because events are mapped by {eventAxisLabel}s.
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                          <div>
                            <label style={{ color: 'var(--text)', fontSize: 12, display: 'block', marginBottom: 6 }}>Event axis</label>
                            <select
                              className="url-input"
                              value={manualPlayerSheetMapping.eventAxis}
                              onChange={(e) => updateManualMapping({ eventAxis: e.target.value as ManualPlayerSheetMapping['eventAxis'] })}
                            >
                              <option value="rows">Events run down rows</option>
                              <option value="columns">Events run across columns</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ color: 'var(--text)', fontSize: 12, display: 'block', marginBottom: 6 }}>Player name cell</label>
                            <input className="url-input" value={manualPlayerSheetMapping.playerNameCell} placeholder="A1" onChange={(e) => updateManualMapping({ playerNameCell: e.target.value.toUpperCase() })} />
                          </div>
                          <div>
                            <label style={{ color: 'var(--text)', fontSize: 12, display: 'block', marginBottom: 6 }}>Event {eventAxisLabel} start</label>
                            <input className="url-input" value={manualPlayerSheetMapping.eventStart} placeholder={manualPlayerSheetMapping.eventAxis === 'rows' ? '5' : 'C'} onChange={(e) => updateManualMapping({ eventStart: e.target.value.toUpperCase() })} />
                          </div>
                          <div>
                            <label style={{ color: 'var(--text)', fontSize: 12, display: 'block', marginBottom: 6 }}>Event {eventAxisLabel} end</label>
                            <input className="url-input" value={manualPlayerSheetMapping.eventEnd} placeholder={manualPlayerSheetMapping.eventAxis === 'rows' ? '23' : 'W'} onChange={(e) => updateManualMapping({ eventEnd: e.target.value.toUpperCase() })} />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                          <div>
                            <label style={{ color: 'var(--text)', fontSize: 12, display: 'block', marginBottom: 6 }}>Week/Event {fieldAxisLabel}</label>
                            <input className="url-input" value={manualPlayerSheetMapping.eventNumberLine} placeholder={manualPlayerSheetMapping.eventAxis === 'rows' ? 'A' : '4'} onChange={(e) => updateManualMapping({ eventNumberLine: e.target.value.toUpperCase() })} />
                          </div>
                          <div>
                            <label style={{ color: 'var(--text)', fontSize: 12, display: 'block', marginBottom: 6 }}>Date {fieldAxisLabel}</label>
                            <input className="url-input" value={manualPlayerSheetMapping.eventDateLine} placeholder={manualPlayerSheetMapping.eventAxis === 'rows' ? 'B' : '5'} onChange={(e) => updateManualMapping({ eventDateLine: e.target.value.toUpperCase() })} />
                          </div>
                          <div>
                            <label style={{ color: 'var(--text)', fontSize: 12, display: 'block', marginBottom: 6 }}>Nine/side {fieldAxisLabel}</label>
                            <input className="url-input" value={manualPlayerSheetMapping.nineLine} placeholder={manualPlayerSheetMapping.eventAxis === 'rows' ? 'optional' : 'optional'} onChange={(e) => updateManualMapping({ nineLine: e.target.value.toUpperCase() })} />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                          <div>
                            <label style={{ color: 'var(--text)', fontSize: 12, display: 'block', marginBottom: 6 }}>Front holes start {fieldAxisLabel}</label>
                            <input className="url-input" value={manualPlayerSheetMapping.frontHoleStartLine} placeholder={manualPlayerSheetMapping.eventAxis === 'rows' ? 'C' : '2'} onChange={(e) => updateManualMapping({ frontHoleStartLine: e.target.value.toUpperCase() })} />
                          </div>
                          <div>
                            <label style={{ color: 'var(--text)', fontSize: 12, display: 'block', marginBottom: 6 }}>Front holes end {fieldAxisLabel}</label>
                            <input className="url-input" value={manualPlayerSheetMapping.frontHoleEndLine} placeholder={manualPlayerSheetMapping.eventAxis === 'rows' ? 'K' : '10'} onChange={(e) => updateManualMapping({ frontHoleEndLine: e.target.value.toUpperCase() })} />
                          </div>
                          <div>
                            <label style={{ color: 'var(--text)', fontSize: 12, display: 'block', marginBottom: 6 }}>Back holes start {fieldAxisLabel}</label>
                            <input className="url-input" value={manualPlayerSheetMapping.backHoleStartLine} placeholder={manualPlayerSheetMapping.eventAxis === 'rows' ? 'O' : '14'} onChange={(e) => updateManualMapping({ backHoleStartLine: e.target.value.toUpperCase() })} />
                          </div>
                          <div>
                            <label style={{ color: 'var(--text)', fontSize: 12, display: 'block', marginBottom: 6 }}>Back holes end {fieldAxisLabel}</label>
                            <input className="url-input" value={manualPlayerSheetMapping.backHoleEndLine} placeholder={manualPlayerSheetMapping.eventAxis === 'rows' ? 'W' : '22'} onChange={(e) => updateManualMapping({ backHoleEndLine: e.target.value.toUpperCase() })} />
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                          <div>
                            <label style={{ color: 'var(--text)', fontSize: 12, display: 'block', marginBottom: 6 }}>Front gross {fieldAxisLabel}</label>
                            <input className="url-input" value={manualPlayerSheetMapping.grossFrontLine} placeholder={manualPlayerSheetMapping.eventAxis === 'rows' ? 'L' : '11'} onChange={(e) => updateManualMapping({ grossFrontLine: e.target.value.toUpperCase() })} />
                          </div>
                          <div>
                            <label style={{ color: 'var(--text)', fontSize: 12, display: 'block', marginBottom: 6 }}>Back gross {fieldAxisLabel}</label>
                            <input className="url-input" value={manualPlayerSheetMapping.grossBackLine} placeholder={manualPlayerSheetMapping.eventAxis === 'rows' ? 'X' : '23'} onChange={(e) => updateManualMapping({ grossBackLine: e.target.value.toUpperCase() })} />
                          </div>
                          <div>
                            <label style={{ color: 'var(--text)', fontSize: 12, display: 'block', marginBottom: 6 }}>Front handicap {fieldAxisLabel}</label>
                            <input className="url-input" value={manualPlayerSheetMapping.handicapFrontLine} placeholder={manualPlayerSheetMapping.eventAxis === 'rows' ? 'N' : '13'} onChange={(e) => updateManualMapping({ handicapFrontLine: e.target.value.toUpperCase() })} />
                          </div>
                          <div>
                            <label style={{ color: 'var(--text)', fontSize: 12, display: 'block', marginBottom: 6 }}>Back handicap {fieldAxisLabel}</label>
                            <input className="url-input" value={manualPlayerSheetMapping.handicapBackLine} placeholder={manualPlayerSheetMapping.eventAxis === 'rows' ? 'optional' : 'optional'} onChange={(e) => updateManualMapping({ handicapBackLine: e.target.value.toUpperCase() })} />
                          </div>
                          <div>
                            <label style={{ color: 'var(--text)', fontSize: 12, display: 'block', marginBottom: 6 }}>Net {fieldAxisLabel}</label>
                            <input className="url-input" value={manualPlayerSheetMapping.netLine} placeholder="optional" onChange={(e) => updateManualMapping({ netLine: e.target.value.toUpperCase() })} />
                          </div>
                          <div>
                            <label style={{ color: 'var(--text)', fontSize: 12, display: 'block', marginBottom: 6 }}>Points {fieldAxisLabel}</label>
                            <input className="url-input" value={manualPlayerSheetMapping.pointsLine} placeholder="optional" onChange={(e) => updateManualMapping({ pointsLine: e.target.value.toUpperCase() })} />
                          </div>
                          <div>
                            <label style={{ color: 'var(--text)', fontSize: 12, display: 'block', marginBottom: 6 }}>Bonus {fieldAxisLabel}</label>
                            <input className="url-input" value={manualPlayerSheetMapping.bonusLine} placeholder="optional" onChange={(e) => updateManualMapping({ bonusLine: e.target.value.toUpperCase() })} />
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <p style={{ margin: '0 0 8px', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>Sheet preview</p>
                      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
                        <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: 'var(--panel2)' }}>
                              <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Row</th>
                              {excelPlayerSheetPreview.sampleColumns.map((column) => (
                                <th
                                  key={column.letter}
                                  style={{
                                    textAlign: 'left',
                                    padding: '8px 10px',
                                    borderBottom: '1px solid var(--border)',
                                    background: activeMappedColumns.has(column.letter) ? '#e0f2fe' : undefined,
                                  }}
                                >
                                  <div>{column.letter}</div>
                                  <div style={{ color: 'var(--text2)', fontWeight: 400 }}>{column.headerValue || '\u00A0'}</div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {excelPlayerSheetPreview.sampleRows.map((row) => (
                              <tr key={row.rowNumber}>
                                <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text2)', background: activeMappedRows.has(row.rowNumber) ? 'rgba(14, 165, 233, 0.08)' : undefined }}>{row.rowNumber}</td>
                                {row.cells.map((cell, index) => {
                                  const column = excelPlayerSheetPreview.sampleColumns[index];
                                  return (
                                    <td
                                      key={`${row.rowNumber}-${column.letter}`}
                                      style={{
                                        padding: '8px 10px',
                                        borderBottom: '1px solid var(--border)',
                                        background: activeMappedRows.has(row.rowNumber)
                                          ? 'rgba(14, 165, 233, 0.08)'
                                          : activeMappedColumns.has(column.letter)
                                            ? 'rgba(14, 165, 233, 0.08)'
                                            : undefined,
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {cell || '\u00A0'}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div>
                      <p style={{ margin: '0 0 8px', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>Parsed sample rows</p>
                      {excelPlayerSheetPreview.parsedRows.length > 0 ? (
                        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: 'var(--panel2)' }}>
                                <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Row</th>
                                <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Event</th>
                                <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Date</th>
                                <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Nine</th>
                                <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Gross</th>
                                <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>HC</th>
                                <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Net</th>
                                <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Pts</th>
                                <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Holes</th>
                              </tr>
                            </thead>
                            <tbody>
                              {excelPlayerSheetPreview.parsedRows.map((row) => (
                                <tr key={row.rowNumber}>
                                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{row.rowNumber}</td>
                                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{row.eventNumber ?? ''}</td>
                                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{row.eventDate || '\u00A0'}</td>
                                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{row.nineHoles === 'back' ? 'Back 9' : 'Front 9'}</td>
                                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{row.grossScore ?? ''}</td>
                                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{row.handicap}</td>
                                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{row.netScore ?? ''}</td>
                                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{row.points}</td>
                                  <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{row.holes.map((hole) => hole ?? '-').join(', ')}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p style={{ margin: 0, color: 'var(--text2)', fontSize: 13 }}>No parsable rows were found with the current mapping.</p>
                      )}
                    </div>

                    {excelPlayerSheetPreview.warnings.length > 0 && (
                      <div>
                        <p style={{ margin: '0 0 8px', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>Preview warnings</p>
                        <ul style={{ margin: 0, paddingLeft: 18, color: 'var(--text2)', fontSize: 12, lineHeight: 1.6 }}>
                          {excelPlayerSheetPreview.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
              {excelPreview.sheets.map((sheet) => {
                const selected = excelSelectedSheets.includes(sheet.sheetName);
                const disabled = sheet.status === 'invalid';
                return (
                  <label
                    key={sheet.sheetName}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: 12,
                      borderRadius: 12,
                      border: '1px solid var(--border)',
                      opacity: disabled ? 0.55 : 1,
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={disabled}
                      onChange={() => toggleExcelSheet(sheet.sheetName)}
                      style={{ marginTop: 3 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <strong style={{ color: 'var(--text)' }}>{sheet.sheetName}</strong>
                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 999, background: sheet.status === 'ready' ? '#dcfce7' : sheet.status === 'needs-review' ? '#fef3c7' : '#fee2e2', color: sheet.status === 'ready' ? '#166534' : sheet.status === 'needs-review' ? '#92400e' : '#991b1b' }}>
                          {sheet.status === 'ready' ? 'Ready' : sheet.status === 'needs-review' ? 'Review' : 'Invalid'}
                        </span>
                        <span style={{ color: 'var(--text2)', fontSize: 12 }}>{sheet.rowCount} rows · {sheet.candidateRows} players</span>
                        <span style={{ color: 'var(--text2)', fontSize: 12 }}>Mode: {sheet.layoutHint === 'player-sheets' ? 'Player sheet' : sheet.layoutHint === 'event-sheets' ? 'Event sheet' : 'Unknown'}</span>
                        {sheet.eventNumber !== null && <span style={{ color: 'var(--text2)', fontSize: 12 }}>Event {sheet.eventNumber}</span>}
                        {sheet.eventDate && <span style={{ color: 'var(--text2)', fontSize: 12 }}>{formatEventDateDisplay(sheet.eventDate)}</span>}
                        {sheet.nineHoles && <span style={{ color: 'var(--text2)', fontSize: 12 }}>{sheet.nineHoles === 'back' ? 'Back 9' : 'Front 9'}</span>}
                      </div>
                      {sheet.mappingSummary && (
                        <p style={{ margin: '8px 0 0', color: 'var(--text2)', fontSize: 12 }}>
                          Mapping: {sheet.mappingSummary}
                        </p>
                      )}
                      {sheet.warnings.length > 0 && (
                        <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--text2)', fontSize: 12, lineHeight: 1.6 }}>
                          {sheet.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                        </ul>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="btn-primary"
                onClick={runExcelImport}
                disabled={excelImporting || !excelSelectedSheets.length}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
              >
                {excelImporting
                  ? <><Loader size={14} className="spin" /> Importing…</>
                  : <><Upload size={14} /> Import {excelSelectedSheets.length} sheet{excelSelectedSheets.length === 1 ? '' : 's'}</>
                }
              </button>
              <button className="btn-secondary" onClick={resetExcelImport}>
                Clear workbook
              </button>
            </div>
          </div>
        ) : (
          <>
            <input
              ref={excelFileRef}
              type="file"
              accept=".xlsx,.xls,.xlsm"
              style={{ display: 'none' }}
              onChange={handleExcelFileChange}
            />
            <button
              className="btn-secondary"
              onClick={() => excelFileRef.current?.click()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <Upload size={14} /> Choose Excel file…
            </button>
          </>
        )}
      </div>

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
