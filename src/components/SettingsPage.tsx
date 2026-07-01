import { memo, useState } from 'react';
import type {
  AdjustedScoringSettings,
  ColorSchemeConfig,
  CourseConfig,
  EventData,
  EventDateDisplaySettings,
  EventWeather,
  HandicapMode,
  LeagueData,
  LeagueWeatherSettings,
  PlayerConfig,
} from '../types/golf';
import type { BuiltInLeague, LeagueSnapshot } from '../lib/storage';
import { LeagueSettingsSection } from './DataPage';
import PlayersPage from './PlayersPage';
import EventsPage from './EventsPage';
import ColorSchemesPage from './ColorSchemesPage';
import CourseScorecard from './CourseScorecard';
import DataPage from './DataPage';
import { PlusCircle, X } from 'lucide-react';

interface SettingsPageProps {
  activeLeagueId: string;
  availableLeagues: BuiltInLeague[];
  events: EventData[];
  league: LeagueData;
  courseConfig: CourseConfig | null;
  playerConfig: PlayerConfig;
  colorScheme: ColorSchemeConfig;
  onPlayerConfigChange: (config: PlayerConfig) => void;
  onRenamePlayer: (currentName: string, nextName: string) => void;
  onRenameEvent: (eventId: string, nextName: string) => void;
  onUpdateEventDate: (eventId: string, nextDate: string) => void;
  onUpdateEventWeather: (eventId: string, nextWeather: EventWeather | undefined) => void;
  onPlayerColorChange: (playerName: string, color: string) => void;
  onClearPlayerColor: (playerName: string) => void;
  onEventColorChange: (eventId: string, color: string) => void;
  onClearEventColor: (eventId: string) => void;
  onThemeColorChange: (token: string, color: string) => void;
  onApplyThemePreset: (themeColors: Record<string, string>) => void;
  onClearThemeColor: (token: string) => void;
  onResetAllColors: () => void;
  onEditCourse: () => void;
  onImportSnapshot: (snap: LeagueSnapshot) => void;
  onBulkEventsAdded: (league: LeagueData, playerConfig: PlayerConfig) => void;
  onLeagueNameChange: (name: string) => void;
  onLeagueImageChange: (imageDataUrl: string | null) => void;
  onLeagueHandicapModeChange: (mode: HandicapMode) => void;
  onLeagueAdjustedScoringChange: (settings: AdjustedScoringSettings) => void;
  onEventDateDisplayChange: (settings: EventDateDisplaySettings) => void;
  onLeagueWeatherSettingsChange: (settings: LeagueWeatherSettings) => void;
  onClearAllEvents: () => void;
  onDeleteLeague: () => void;
  onCreateLeague: (leagueId: string, leagueName: string) => void;
}

export default memo(function SettingsPage({
  activeLeagueId,
  availableLeagues,
  events,
  league,
  courseConfig,
  playerConfig,
  colorScheme,
  onPlayerConfigChange,
  onRenamePlayer,
  onRenameEvent,
  onUpdateEventDate,
  onUpdateEventWeather,
  onPlayerColorChange,
  onClearPlayerColor,
  onEventColorChange,
  onClearEventColor,
  onThemeColorChange,
  onApplyThemePreset,
  onClearThemeColor,
  onResetAllColors,
  onEditCourse,
  onImportSnapshot,
  onBulkEventsAdded,
  onLeagueNameChange,
  onLeagueImageChange,
  onLeagueHandicapModeChange,
  onLeagueAdjustedScoringChange,
  onEventDateDisplayChange,
  onLeagueWeatherSettingsChange,
  onClearAllEvents,
  onDeleteLeague,
  onCreateLeague,
}: SettingsPageProps) {
  const [showCreateSeasonModal, setShowCreateSeasonModal] = useState(false);
  const [newLeagueYear, setNewLeagueYear] = useState('');
  const [newLeagueName, setNewLeagueName] = useState('');
  const [createLeagueError, setCreateLeagueError] = useState('');
  const [createLeagueSuccess, setCreateLeagueSuccess] = useState('');
  const [openSections, setOpenSections] = useState({
    league: true,
    members: false,
    appearance: false,
    data: false,
  });

  function toggleSection(section: keyof typeof openSections) {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  }

  function slugify(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function openCreateSeasonModal() {
    setCreateLeagueError('');
    setCreateLeagueSuccess('');
    setShowCreateSeasonModal(true);
  }

  function closeCreateSeasonModal() {
    setShowCreateSeasonModal(false);
    setNewLeagueYear('');
    setNewLeagueName('');
    setCreateLeagueError('');
    setCreateLeagueSuccess('');
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
    setTimeout(() => {
      closeCreateSeasonModal();
    }, 700);
  }

  return (
    <div className="settings-stack settings-shell">
      <div className="settings-intro">
        <div className="players-page-header" style={{ marginBottom: 0 }}>
          <div>
            <h3 className="chart-title">Settings</h3>
            <p className="chart-subtitle" style={{ marginBottom: 0 }}>
              Organized by workflow so season setup, member management, styling, and data tools are easier to find.
            </p>
          </div>
          <button className="btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={openCreateSeasonModal}>
            <PlusCircle size={14} /> Create Season
          </button>
        </div>
      </div>

      <section className="settings-panel">
        <div className="settings-panel-header">
          <div>
            <h4 className="settings-panel-title">League and Season Setup</h4>
            <p className="settings-panel-subtitle">League rules, season creation, and course setup</p>
          </div>
          <button className="btn-secondary" onClick={() => toggleSection('league')}>
            {openSections.league ? 'Collapse' : 'Expand'}
          </button>
        </div>
        {openSections.league && (
          <div className="settings-panel-body">
            <LeagueSettingsSection
              activeLeagueId={activeLeagueId}
              availableLeagues={availableLeagues}
              league={league}
              onLeagueNameChange={onLeagueNameChange}
              onLeagueImageChange={onLeagueImageChange}
              onLeagueHandicapModeChange={onLeagueHandicapModeChange}
              onLeagueAdjustedScoringChange={onLeagueAdjustedScoringChange}
              onEventDateDisplayChange={onEventDateDisplayChange}
              onLeagueWeatherSettingsChange={onLeagueWeatherSettingsChange}
              onClearAllEvents={onClearAllEvents}
              onDeleteLeague={onDeleteLeague}
            />
            <CourseScorecard courseConfig={courseConfig} onEdit={onEditCourse} />
          </div>
        )}
      </section>

      <section className="settings-panel">
        <div className="settings-panel-header">
          <div>
            <h4 className="settings-panel-title">Members and Events</h4>
            <p className="settings-panel-subtitle">Player activity, naming, event details, and event colors</p>
          </div>
          <button className="btn-secondary" onClick={() => toggleSection('members')}>
            {openSections.members ? 'Collapse' : 'Expand'}
          </button>
        </div>
        {openSections.members && (
          <div className="settings-panel-body">
            <PlayersPage
              events={events}
              playerConfig={playerConfig}
              colorScheme={colorScheme}
              handicapMode={league.handicapMode}
              onChange={onPlayerConfigChange}
              onRename={onRenamePlayer}
              onPlayerColorChange={onPlayerColorChange}
              onClearPlayerColor={onClearPlayerColor}
            />
            <EventsPage
              events={events}
              colorScheme={colorScheme}
              onRename={onRenameEvent}
              onUpdateEventDate={onUpdateEventDate}
              onUpdateEventWeather={onUpdateEventWeather}
              onEventColorChange={onEventColorChange}
              onClearEventColor={onClearEventColor}
            />
          </div>
        )}
      </section>

      <section className="settings-panel">
        <div className="settings-panel-header">
          <div>
            <h4 className="settings-panel-title">Appearance</h4>
            <p className="settings-panel-subtitle">Theme and chart color presets and overrides</p>
          </div>
          <button className="btn-secondary" onClick={() => toggleSection('appearance')}>
            {openSections.appearance ? 'Collapse' : 'Expand'}
          </button>
        </div>
        {openSections.appearance && (
          <div className="settings-panel-body">
            <ColorSchemesPage
              colorScheme={colorScheme}
              onThemeColorChange={onThemeColorChange}
              onApplyThemePreset={onApplyThemePreset}
              onClearThemeColor={onClearThemeColor}
              onResetAllColors={onResetAllColors}
            />
          </div>
        )}
      </section>

      <section className="settings-panel">
        <div className="settings-panel-header">
          <div>
            <h4 className="settings-panel-title">Data Tools</h4>
            <p className="settings-panel-subtitle">Import, export, sync, and workbook parsing utilities</p>
          </div>
          <button className="btn-secondary" onClick={() => toggleSection('data')}>
            {openSections.data ? 'Collapse' : 'Expand'}
          </button>
        </div>
        {openSections.data && (
          <div className="settings-panel-body">
            <DataPage
              activeLeagueId={activeLeagueId}
              availableLeagues={availableLeagues}
              league={league}
              courseConfig={courseConfig}
              playerConfig={playerConfig}
              onImportSnapshot={onImportSnapshot}
              onBulkEventsAdded={onBulkEventsAdded}
              onLeagueNameChange={onLeagueNameChange}
              onLeagueHandicapModeChange={onLeagueHandicapModeChange}
              onLeagueAdjustedScoringChange={onLeagueAdjustedScoringChange}
              onEventDateDisplayChange={onEventDateDisplayChange}
              onClearAllEvents={onClearAllEvents}
              onCreateLeague={onCreateLeague}
              hideLeagueSettings
            />
          </div>
        )}
      </section>

      {showCreateSeasonModal && (
        <div className="modal-overlay" onClick={closeCreateSeasonModal}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create Season</h2>
              <button className="icon-btn" onClick={closeCreateSeasonModal}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p className="hint" style={{ marginBottom: 4 }}>
                Create a new empty season and switch to it immediately.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '160px minmax(180px, 1fr)', gap: 8 }}>
                <input
                  className="url-input"
                  placeholder="2024"
                  value={newLeagueYear}
                  onChange={(e) => setNewLeagueYear(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateLeague()}
                  autoFocus
                />
                <input
                  className="url-input"
                  placeholder="Tuesday League"
                  value={newLeagueName}
                  onChange={(e) => setNewLeagueName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateLeague()}
                />
              </div>
              {createLeagueError && <p className="error" style={{ margin: 0 }}>{createLeagueError}</p>}
              {createLeagueSuccess && <p style={{ margin: 0, color: '#22c55e', fontSize: 13 }}>{createLeagueSuccess}</p>}
              <div className="modal-actions" style={{ marginTop: 6 }}>
                <button className="btn-secondary" onClick={closeCreateSeasonModal}>Cancel</button>
                <button className="btn-primary" onClick={handleCreateLeague}>Create & Switch</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});