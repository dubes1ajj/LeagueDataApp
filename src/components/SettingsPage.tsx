import { memo } from 'react';
import type { CourseConfig, EventData, LeagueData, PlayerConfig } from '../types/golf';
import type { BuiltInLeague, LeagueSnapshot } from '../lib/storage';
import { LeagueSettingsSection } from './DataPage';
import PlayersPage from './PlayersPage';
import CourseScorecard from './CourseScorecard';
import DataPage from './DataPage';

interface SettingsPageProps {
  activeLeagueId: string;
  availableLeagues: BuiltInLeague[];
  events: EventData[];
  league: LeagueData;
  courseConfig: CourseConfig | null;
  playerConfig: PlayerConfig;
  onPlayerConfigChange: (config: PlayerConfig) => void;
  onEditCourse: () => void;
  onImportSnapshot: (snap: LeagueSnapshot) => void;
  onBulkEventsAdded: (league: LeagueData, playerConfig: PlayerConfig) => void;
  onLeagueNameChange: (name: string) => void;
  onClearAllEvents: () => void;
  onCreateLeague: (leagueId: string) => void;
}

export default memo(function SettingsPage({
  activeLeagueId,
  availableLeagues,
  events,
  league,
  courseConfig,
  playerConfig,
  onPlayerConfigChange,
  onEditCourse,
  onImportSnapshot,
  onBulkEventsAdded,
  onLeagueNameChange,
  onClearAllEvents,
  onCreateLeague,
}: SettingsPageProps) {
  return (
    <div className="settings-stack">
      <LeagueSettingsSection
        availableLeagues={availableLeagues}
        league={league}
        onLeagueNameChange={onLeagueNameChange}
        onClearAllEvents={onClearAllEvents}
        onCreateLeague={onCreateLeague}
      />
      <CourseScorecard courseConfig={courseConfig} onEdit={onEditCourse} />
      <PlayersPage events={events} playerConfig={playerConfig} onChange={onPlayerConfigChange} />
      <DataPage
        activeLeagueId={activeLeagueId}
        availableLeagues={availableLeagues}
        league={league}
        courseConfig={courseConfig}
        playerConfig={playerConfig}
        onImportSnapshot={onImportSnapshot}
        onBulkEventsAdded={onBulkEventsAdded}
        onLeagueNameChange={onLeagueNameChange}
        onClearAllEvents={onClearAllEvents}
        onCreateLeague={onCreateLeague}
        hideLeagueSettings
      />
    </div>
  );
});