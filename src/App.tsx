import React, { useState, useCallback, useMemo, useEffect, lazy, Suspense } from 'react';
import {
  BUILT_IN_LEAGUES, fetchAvailableLeagues, getActiveLeagueId, getLatestLeagueId, getStoredActiveLeagueId, setActiveLeagueIdStorage,
  loadLeagueDataById, saveLeagueDataById,
  loadCourseConfigById, saveCourseConfigById,
  loadPlayerConfigById, savePlayerConfigById,
  loadColorSchemeById, saveColorSchemeById,
  loadHiddenEventIdsById, saveHiddenEventIdsById,
  loadLastRemoteExportedAtById, saveLastRemoteExportedAtById,
  fetchLeagueSnapshot, addEvent, removeEvent, applyAutoHide, deleteLeagueById,
} from './lib/storage';
import type { BuiltInLeague, LeagueSnapshot } from './lib/storage';
import { recalculateCumulativeStandings } from './lib/parser';
import type { EventData, LeagueData, CourseConfig, ColorSchemeConfig, HandicapMode, PlayerConfig } from './types/golf';
import type { AdjustedScoringSettings, EventDateDisplaySettings, EventWeather, LeagueAnalysisSettings, LeagueWeatherSettings } from './types/golf';
import EventList from './components/EventList';
import { useAdminMode } from './lib/useAdminMode';
import { setPlayerColorOverrides } from './lib/colors';
import { DEFAULT_EVENT_DATE_DISPLAY, setEventDateDisplaySettings } from './lib/eventDateDisplay';
import { DEFAULT_YARDAGE_BAND_SETTINGS, normalizeYardageBandSettings } from './lib/yardage';
import {
  PlusCircle, Trophy, Target,
  Sun, Moon, Lock, Unlock, BarChart3, Settings,
} from 'lucide-react';
import { useTheme } from './lib/useTheme';
import { useFilteredEvents } from './lib/useFilteredEvents';
import './App.css';

const AddEventModal = lazy(() => import('./components/AddEventModal'));
const BumpChart = lazy(() => import('./components/BumpChart'));
const WeeklyPointsChart = lazy(() => import('./components/WeeklyPointsChart'));
const HandicapTrendChart = lazy(() => import('./components/HandicapTrendChart'));
const ScoringBreakdownChart = lazy(() => import('./components/ScoringBreakdownChart'));
const GrossNetScoresChart = lazy(() => import('./components/GrossNetScoresChart'));
const HoleStatsChart = lazy(() => import('./components/HoleStatsChart'));
const HoleProfileModal = lazy(() => import('./components/HoleProfileModal'));
const CumulativePointsChart = lazy(() => import('./components/CumulativePointsChart'));
const CourseConfigModal = lazy(() => import('./components/CourseConfigModal'));
const PlayerProfileModal = lazy(() => import('./components/PlayerProfileModal'));
const AdminUnlockModal = lazy(() => import('./components/AdminUnlockModal'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const SeasonDashboard = lazy(() => import('./components/SeasonDashboard'));
const WeeklyRecapPage = lazy(() => import('./components/WeeklyRecapPage'));
const EventFilterBar = lazy(() => import('./components/EventFilterBar'));
const TrendsPage = lazy(() => import('./components/TrendsPage'));

type Tab = 'overview' | 'trends' | 'scoring' | 'settings';
type OverviewPanel = 'current-rankings' | 'ranking-history' | 'cumulative-points-race' | 'points-by-player' | 'points-matrix';

const ALL_TABS: { id: Tab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
  { id: 'overview',  label: 'Overview',    icon: <Trophy size={16} /> },
  { id: 'trends',    label: 'Trends',      icon: <BarChart3 size={16} /> },
  { id: 'scoring',   label: 'Hole Stats',  icon: <Target size={16} /> },
  { id: 'settings',  label: 'Settings',    icon: <Settings size={16} />, adminOnly: true },
];

const DEFAULT_ADJUSTED_SCORING: AdjustedScoringSettings = { mode: 'none', dropCount: 0 };
const DEFAULT_WEATHER_SETTINGS: LeagueWeatherSettings = {
  locationName: '',
  latitude: null,
  longitude: null,
  playTime: '17:00',
};
const DEFAULT_ANALYSIS_SETTINGS: LeagueAnalysisSettings = {
  weights: {
    pointsForm: 0.18,
    netScoring: 0.14,
    grossScoring: 0.1,
    consistency: 0.1,
    birdieRate: 0.07,
    damageControl: 0.07,
    blowupAvoidance: 0.06,
    participation: 0.04,
    parEfficiency: 0.06,
    eventWins: 0.05,
    topThreeRate: 0.05,
    topFiveRate: 0.04,
    clutchPerformance: 0.05,
    bounceBack: 0.04,
    cleanCard: 0.04,
    ceilingFloor: 0.04,
    handicapOutperformance: 0.06,
    momentum: 0.04,
    clutchFactor: 0.03,
  },
};

const EMPTY_LEAGUE: LeagueData = {
  leagueName: 'Loading…',
  leagueImage: undefined,
  handicapMode: 'general',
  adjustedScoring: { ...DEFAULT_ADJUSTED_SCORING },
  eventDateDisplay: { ...DEFAULT_EVENT_DATE_DISPLAY },
  weatherSettings: { ...DEFAULT_WEATHER_SETTINGS },
  yardageBandSettings: { ...DEFAULT_YARDAGE_BAND_SETTINGS },
  analysisSettings: { ...DEFAULT_ANALYSIS_SETTINGS, weights: { ...DEFAULT_ANALYSIS_SETTINGS.weights } },
  events: [],
};
const EMPTY_COLOR_SCHEME: ColorSchemeConfig = { playerColors: {}, eventColors: {}, themeColors: {} };
const THEME_COLOR_KEYS = [
  '--accent',
  '--accent2',
  '--green',
  '--red',
  '--gold',
  '--chart-grid',
  '--chart-tooltip-bg',
  '--chart-axis',
  '--chart-tick',
] as const;

function LazySectionFallback() {
  return (
    <div className="chart-container" style={{ marginTop: 0 }}>
      <h3 className="chart-title">Loading Section</h3>
      <p className="chart-subtitle">Preparing charts and analytics modules.</p>
    </div>
  );
}

export default function App() {
  const { isDark, toggle: toggleTheme } = useTheme();
  const { isAdmin, tryUnlock, lock } = useAdminMode();

  const [availableLeagues, setAvailableLeagues] = useState<BuiltInLeague[]>(() => [...BUILT_IN_LEAGUES]);
  const [activeLeagueId, setActiveLeagueId] = useState<string>(() => getActiveLeagueId(getLatestLeagueId(BUILT_IN_LEAGUES)));
  const [leagueLoading, setLeagueLoading] = useState(true);
  const [league, setLeague] = useState<LeagueData>(EMPTY_LEAGUE);
  const [colorScheme, setColorScheme] = useState<ColorSchemeConfig>(EMPTY_COLOR_SCHEME);
  const [courseConfig, setCourseConfig] = useState<CourseConfig | null>(null);
  const [playerConfig, setPlayerConfig] = useState<PlayerConfig>({ active: {}, nicknames: {} });
  const [hiddenEventIds, setHiddenEventIds] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [profilePlayer, setProfilePlayer] = useState<string | null>(null);
  const [holeProfile, setHoleProfile] = useState<{ holeNum: number; nine: 'front' | 'back' } | null>(null);
  const [pointsRankBasis, setPointsRankBasis] = useState<'raw' | 'adjusted'>('raw');
  const [overviewPanel, setOverviewPanel] = useState<OverviewPanel>('current-rankings');
  const [scoringEventIds, setScoringEventIds] = useState<string[] | null>(null);
  const [trendsEventIds, setTrendsEventIds] = useState<string[] | null>(null);

  const TABS = ALL_TABS.filter(t => !t.adminOnly || isAdmin);

  useEffect(() => {
    let cancelled = false;

    async function loadLeagues() {
      const leagues = await fetchAvailableLeagues();
      if (cancelled) return;

      setAvailableLeagues(leagues);

      const storedLeagueId = getStoredActiveLeagueId();
      const validStoredLeague = storedLeagueId && leagues.some((league) => league.id === storedLeagueId);
      if (validStoredLeague) return;

      const latestLeagueId = getLatestLeagueId(leagues);
      setActiveLeagueId(latestLeagueId);
      setActiveLeagueIdStorage(latestLeagueId);
    }

    loadLeagues();
    return () => { cancelled = true; };
  }, []);

  // Load league data — checks localStorage first, then fetches static JSON
  useEffect(() => {
    let cancelled = false;

    async function load() {
      let leagueData = loadLeagueDataById(activeLeagueId);
      let courseData = loadCourseConfigById(activeLeagueId);
      let playerData = loadPlayerConfigById(activeLeagueId);
      const colorData = loadColorSchemeById(activeLeagueId);
      const hiddenData = loadHiddenEventIdsById(activeLeagueId);

      if (leagueData) {
        leagueData = {
          ...leagueData,
          adjustedScoring: { ...DEFAULT_ADJUSTED_SCORING, ...(leagueData.adjustedScoring ?? {}) },
          yardageBandSettings: normalizeYardageBandSettings(leagueData.yardageBandSettings),
          analysisSettings: {
            ...DEFAULT_ANALYSIS_SETTINGS,
            ...(leagueData.analysisSettings ?? {}),
            weights: { ...DEFAULT_ANALYSIS_SETTINGS.weights, ...(leagueData.analysisSettings?.weights ?? {}) },
          },
          events: recalculateCumulativeStandings(leagueData.events, leagueData.adjustedScoring ?? DEFAULT_ADJUSTED_SCORING),
        };
        saveLeagueDataById(activeLeagueId, leagueData);
        playerData = applyAutoHide(playerData, leagueData.events);
      }

      const snap = await fetchLeagueSnapshot(activeLeagueId);
      if (snap && !cancelled) {
        const remoteLeague = {
          ...snap.league,
          handicapMode: snap.league.handicapMode ?? 'general',
          adjustedScoring: { ...DEFAULT_ADJUSTED_SCORING, ...(snap.league.adjustedScoring ?? {}) },
          eventDateDisplay: { ...DEFAULT_EVENT_DATE_DISPLAY, ...(snap.league.eventDateDisplay ?? {}) },
          weatherSettings: { ...DEFAULT_WEATHER_SETTINGS, ...(snap.league.weatherSettings ?? {}) },
          yardageBandSettings: normalizeYardageBandSettings(snap.league.yardageBandSettings),
          analysisSettings: {
            ...DEFAULT_ANALYSIS_SETTINGS,
            ...(snap.league.analysisSettings ?? {}),
            weights: { ...DEFAULT_ANALYSIS_SETTINGS.weights, ...(snap.league.analysisSettings?.weights ?? {}) },
          },
          events: snap.league.events.map(e => {
            if (!e.nineHoles) return { ...e, nineHoles: 'front' as const };
            return e;
          }),
        };
        const recalculatedRemote = {
          ...remoteLeague,
          events: recalculateCumulativeStandings(remoteLeague.events, remoteLeague.adjustedScoring),
        };
        const remoteExportedAt = typeof snap.exportedAt === 'string' ? snap.exportedAt : null;
        const lastRemoteExportedAt = loadLastRemoteExportedAtById(activeLeagueId);

        const remoteTs = remoteExportedAt ? Date.parse(remoteExportedAt) : Number.NaN;
        const lastRemoteTs = lastRemoteExportedAt ? Date.parse(lastRemoteExportedAt) : Number.NaN;

        const localMaxEventNumber = leagueData
          ? leagueData.events.reduce((max, event) => Math.max(max, event.eventNumber), 0)
          : 0;
        const remoteMaxEventNumber = recalculatedRemote.events.reduce((max, event) => Math.max(max, event.eventNumber), 0);

        const remoteClearlyAhead = !leagueData
          || recalculatedRemote.events.length > leagueData.events.length
          || remoteMaxEventNumber > localMaxEventNumber;

        const remoteIsNewerByTimestamp = Number.isFinite(remoteTs)
          && (
            (!Number.isFinite(lastRemoteTs) && !!remoteExportedAt)
            || remoteTs > lastRemoteTs
          );

        if (!leagueData || remoteIsNewerByTimestamp || remoteClearlyAhead) {
          leagueData = recalculatedRemote;
          courseData = snap.courseConfig;
          playerData = applyAutoHide(snap.playerConfig, leagueData.events);

          saveLeagueDataById(activeLeagueId, leagueData);
          if (courseData) saveCourseConfigById(activeLeagueId, courseData);
          savePlayerConfigById(activeLeagueId, playerData);
          if (remoteExportedAt) saveLastRemoteExportedAtById(activeLeagueId, remoteExportedAt);
        }
      }

      if (!cancelled && leagueData) {
        setLeague(leagueData);
        setColorScheme(colorData);
        setCourseConfig(courseData ?? null);
        setPlayerConfig(playerData);
        setHiddenEventIds(hiddenData);
      }

      if (!cancelled) {
        setLeagueLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [activeLeagueId]);

  const handleSwitchLeague = useCallback((id: string) => {
    setLeagueLoading(true);
    setActiveLeagueId(id);
    setActiveLeagueIdStorage(id);
    setProfilePlayer(null);
    setHoleProfile(null);
  }, []);

  const handleCreateLeague = useCallback((id: string, leagueName: string) => {
    const yearMatch = id.match(/^(\d{4})/);
    const displayName = yearMatch ? `${yearMatch[1]} ${leagueName}` : leagueName;
    const emptyLeague: LeagueData = {
      leagueName: displayName,
      leagueImage: undefined,
      handicapMode: 'general',
      adjustedScoring: { ...DEFAULT_ADJUSTED_SCORING },
      eventDateDisplay: { ...DEFAULT_EVENT_DATE_DISPLAY },
      weatherSettings: { ...DEFAULT_WEATHER_SETTINGS },
      yardageBandSettings: { ...DEFAULT_YARDAGE_BAND_SETTINGS },
      analysisSettings: { ...DEFAULT_ANALYSIS_SETTINGS, weights: { ...DEFAULT_ANALYSIS_SETTINGS.weights } },
      events: [],
    };
    setLeague(emptyLeague);
    setColorScheme(EMPTY_COLOR_SCHEME);
    setCourseConfig(null);
    setPlayerConfig({ active: {}, nicknames: {} });
    setHiddenEventIds(new Set());
    saveLeagueDataById(id, emptyLeague);
    saveColorSchemeById(id, EMPTY_COLOR_SCHEME);
    savePlayerConfigById(id, { active: {}, nicknames: {} });
    saveHiddenEventIdsById(id, new Set());
    setAvailableLeagues((prev) => [...prev, { id, name: emptyLeague.leagueName }]
      .reduce<BuiltInLeague[]>((acc, league) => {
        if (!acc.some((entry) => entry.id === league.id)) acc.push(league);
        return acc;
      }, [])
      .sort((a, b) => Number.parseInt(b.id, 10) - Number.parseInt(a.id, 10)));
    setLeagueLoading(true);
    setActiveLeagueId(id);
    setActiveLeagueIdStorage(id);
    setProfilePlayer(null);
    setHoleProfile(null);
    setActiveTab('overview');
  }, []);

  const handleAddEvent = useCallback((partial: Omit<EventData, 'id'>) => {
    const newEvent: EventData = { ...partial, id: `event-${partial.eventNumber}-${Date.now()}` };
    const updated = addEvent(league, newEvent);
    const recalculated = { ...updated, events: recalculateCumulativeStandings(updated.events, league.adjustedScoring) };
    setLeague(recalculated);
    saveLeagueDataById(activeLeagueId, recalculated);
    const updatedConfig = applyAutoHide(playerConfig, recalculated.events);
    setPlayerConfig(updatedConfig);
    savePlayerConfigById(activeLeagueId, updatedConfig);
    setShowModal(false);
  }, [league, playerConfig, activeLeagueId]);

  const handleRemoveEvent = useCallback((eventId: string) => {
    if (hiddenEventIds.has(eventId)) {
      const next = new Set(hiddenEventIds);
      next.delete(eventId);
      setHiddenEventIds(next);
      saveHiddenEventIdsById(activeLeagueId, next);
    }
    const updated = removeEvent(league, eventId);
    const recalculated = { ...updated, events: recalculateCumulativeStandings(updated.events, league.adjustedScoring) };
    setLeague(recalculated);
    saveLeagueDataById(activeLeagueId, recalculated);
    const updatedConfig = applyAutoHide(playerConfig, recalculated.events);
    setPlayerConfig(updatedConfig);
    savePlayerConfigById(activeLeagueId, updatedConfig);
  }, [league, playerConfig, hiddenEventIds, activeLeagueId]);

  const handleToggleEvent = useCallback((id: string) => {
    setHiddenEventIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveHiddenEventIdsById(activeLeagueId, next);
      return next;
    });
  }, [activeLeagueId]);

  const handleToggleAllEvents = useCallback((show: boolean) => {
    const next = show ? new Set<string>() : new Set(league.events.map(e => e.id));
    setHiddenEventIds(next);
    saveHiddenEventIdsById(activeLeagueId, next);
  }, [league.events, activeLeagueId]);

  const handleSaveCourse = useCallback((config: CourseConfig) => {
    setCourseConfig(config);
    saveCourseConfigById(activeLeagueId, config);
    setShowCourseModal(false);
  }, [activeLeagueId]);

  const handleImportSnapshot = useCallback((snap: LeagueSnapshot) => {
    const adjustedScoring = { ...DEFAULT_ADJUSTED_SCORING, ...(snap.league.adjustedScoring ?? {}) };
    const recalculated = {
      ...snap.league,
      adjustedScoring,
      weatherSettings: { ...DEFAULT_WEATHER_SETTINGS, ...(snap.league.weatherSettings ?? {}) },
      analysisSettings: {
        ...DEFAULT_ANALYSIS_SETTINGS,
        ...(snap.league.analysisSettings ?? {}),
        weights: { ...DEFAULT_ANALYSIS_SETTINGS.weights, ...(snap.league.analysisSettings?.weights ?? {}) },
      },
      events: recalculateCumulativeStandings(snap.league.events, adjustedScoring),
    };
    setLeague(recalculated);
    saveLeagueDataById(activeLeagueId, recalculated);
    if (snap.courseConfig) { setCourseConfig(snap.courseConfig); saveCourseConfigById(activeLeagueId, snap.courseConfig); }
    const pc = applyAutoHide(snap.playerConfig, recalculated.events);
    setPlayerConfig(pc);
    savePlayerConfigById(activeLeagueId, pc);
  }, [activeLeagueId]);

  const handleBulkEventsAdded = useCallback((newLeague: LeagueData, newPlayerConfig: PlayerConfig) => {
    const adjustedScoring = { ...DEFAULT_ADJUSTED_SCORING, ...(newLeague.adjustedScoring ?? league.adjustedScoring) };
    const recalculatedLeague = {
      ...newLeague,
      adjustedScoring,
      weatherSettings: { ...DEFAULT_WEATHER_SETTINGS, ...(newLeague.weatherSettings ?? league.weatherSettings ?? DEFAULT_WEATHER_SETTINGS) },
      analysisSettings: {
        ...DEFAULT_ANALYSIS_SETTINGS,
        ...(newLeague.analysisSettings ?? league.analysisSettings ?? DEFAULT_ANALYSIS_SETTINGS),
        weights: {
          ...DEFAULT_ANALYSIS_SETTINGS.weights,
          ...(newLeague.analysisSettings?.weights ?? league.analysisSettings?.weights ?? DEFAULT_ANALYSIS_SETTINGS.weights),
        },
      },
      events: recalculateCumulativeStandings(newLeague.events, adjustedScoring),
    };
    setLeague(recalculatedLeague);
    saveLeagueDataById(activeLeagueId, recalculatedLeague);
    setPlayerConfig(newPlayerConfig);
    savePlayerConfigById(activeLeagueId, newPlayerConfig);
  }, [activeLeagueId, league.adjustedScoring, league.weatherSettings, league.analysisSettings]);

  const handleLeagueNameChange = useCallback((name: string) => {
    const updated = { ...league, leagueName: name };
    setLeague(updated);
    saveLeagueDataById(activeLeagueId, updated);
  }, [league, activeLeagueId]);

  const handleLeagueImageChange = useCallback((imageDataUrl: string | null) => {
    const updated = {
      ...league,
      leagueImage: imageDataUrl ?? undefined,
    };
    setLeague(updated);
    saveLeagueDataById(activeLeagueId, updated);
  }, [activeLeagueId, league]);

  const handleDeleteLeague = useCallback(() => {
    if (availableLeagues.length <= 1) return;

    deleteLeagueById(activeLeagueId);
    const remaining = availableLeagues.filter((item) => item.id !== activeLeagueId);
    setAvailableLeagues(remaining);

    const nextLeagueId = getLatestLeagueId(remaining);
    setLeagueLoading(true);
    setActiveLeagueId(nextLeagueId);
    setActiveLeagueIdStorage(nextLeagueId);
    setProfilePlayer(null);
    setHoleProfile(null);
    setActiveTab('overview');
  }, [activeLeagueId, availableLeagues]);

  const handleLeagueHandicapModeChange = useCallback((mode: HandicapMode) => {
    const updated = { ...league, handicapMode: mode };
    setLeague(updated);
    saveLeagueDataById(activeLeagueId, updated);
  }, [league, activeLeagueId]);

  const handleLeagueAdjustedScoringChange = useCallback((settings: AdjustedScoringSettings) => {
    const normalized: AdjustedScoringSettings = {
      mode: settings.mode,
      dropCount: Math.max(0, Math.floor(settings.dropCount)),
    };
    const updated = {
      ...league,
      adjustedScoring: normalized,
      events: recalculateCumulativeStandings(league.events, normalized),
    };
    setLeague(updated);
    saveLeagueDataById(activeLeagueId, updated);
  }, [activeLeagueId, league]);

  const handleEventDateDisplayChange = useCallback((settings: EventDateDisplaySettings) => {
    const updated = { ...league, eventDateDisplay: { ...settings } };
    setLeague(updated);
    saveLeagueDataById(activeLeagueId, updated);
  }, [activeLeagueId, league]);

  const handleLeagueWeatherSettingsChange = useCallback((settings: LeagueWeatherSettings) => {
    const updated = { ...league, weatherSettings: { ...settings } };
    setLeague(updated);
    saveLeagueDataById(activeLeagueId, updated);
  }, [activeLeagueId, league]);

  const handleLeagueAnalysisSettingsChange = useCallback((settings: LeagueAnalysisSettings) => {
    const updated = {
      ...league,
      analysisSettings: {
        ...DEFAULT_ANALYSIS_SETTINGS,
        ...settings,
        weights: { ...DEFAULT_ANALYSIS_SETTINGS.weights, ...(settings.weights ?? {}) },
      },
    };
    setLeague(updated);
    saveLeagueDataById(activeLeagueId, updated);
  }, [activeLeagueId, league]);

  const handleLeagueYardageBandSettingsChange = useCallback((settings: LeagueData['yardageBandSettings']) => {
    const updated = {
      ...league,
      yardageBandSettings: normalizeYardageBandSettings(settings),
    };
    setLeague(updated);
    saveLeagueDataById(activeLeagueId, updated);
  }, [activeLeagueId, league]);

  const handleClearAllEvents = useCallback(() => {
    const cleared = { ...league, events: [] };
    setLeague(cleared);
    saveLeagueDataById(activeLeagueId, cleared);
    const clearedConfig = { active: {}, nicknames: { ...(playerConfig.nicknames ?? {}) } } as PlayerConfig;
    setPlayerConfig(clearedConfig);
    savePlayerConfigById(activeLeagueId, clearedConfig);
  }, [league, activeLeagueId, playerConfig.nicknames]);

  const handlePlayerConfigChange = useCallback((config: PlayerConfig) => {
    const normalized: PlayerConfig = {
      active: { ...(config.active ?? {}) },
      nicknames: { ...(config.nicknames ?? {}) },
    };
    setPlayerConfig(normalized);
    savePlayerConfigById(activeLeagueId, normalized);
  }, [activeLeagueId]);

  const handleRenamePlayer = useCallback((currentName: string, nextName: string) => {
    const trimmedName = nextName.trim();
    if (!trimmedName || trimmedName === currentName) return;

    const duplicateExists = league.events.some((event) =>
      event.players.some((player) => player.playerName === trimmedName)
    );
    if (duplicateExists) return;

    const renamedLeague: LeagueData = {
      ...league,
      events: league.events.map((event) => ({
        ...event,
        players: event.players.map((player) => (
          player.playerName === currentName
            ? { ...player, playerName: trimmedName }
            : player
        )),
        standings: event.standings.map((standing) => (
          standing.playerName === currentName
            ? { ...standing, playerName: trimmedName }
            : standing
        )),
      })),
    };

    const nextActive = { ...playerConfig.active };
    if (Object.prototype.hasOwnProperty.call(nextActive, currentName)) {
      nextActive[trimmedName] = nextActive[currentName];
      delete nextActive[currentName];
    }

    const nextNicknames = { ...(playerConfig.nicknames ?? {}) };
    if (Object.prototype.hasOwnProperty.call(nextNicknames, currentName)) {
      nextNicknames[trimmedName] = nextNicknames[currentName];
      delete nextNicknames[currentName];
    }

    const recalculated = { ...renamedLeague, events: recalculateCumulativeStandings(renamedLeague.events, league.adjustedScoring) };
    const nextConfig = applyAutoHide({ active: nextActive, nicknames: nextNicknames }, recalculated.events);
    const nextPlayerColors = { ...colorScheme.playerColors };
    if (Object.prototype.hasOwnProperty.call(nextPlayerColors, currentName)) {
      nextPlayerColors[trimmedName] = nextPlayerColors[currentName];
      delete nextPlayerColors[currentName];
    }
    const nextColorScheme: ColorSchemeConfig = { ...colorScheme, playerColors: nextPlayerColors };

    setLeague(recalculated);
    saveLeagueDataById(activeLeagueId, recalculated);
    setPlayerConfig(nextConfig);
    savePlayerConfigById(activeLeagueId, nextConfig);
    setColorScheme(nextColorScheme);
    saveColorSchemeById(activeLeagueId, nextColorScheme);
    if (profilePlayer === currentName) setProfilePlayer(trimmedName);
  }, [activeLeagueId, colorScheme, league, playerConfig.active, playerConfig.nicknames, profilePlayer]);

  const handleRenameEvent = useCallback((eventId: string, nextName: string) => {
    const trimmedName = nextName.trim();
    const updated: LeagueData = {
      ...league,
      events: league.events.map((event) => (
        event.id === eventId
          ? { ...event, eventName: trimmedName || undefined }
          : event
      )),
    };
    setLeague(updated);
    saveLeagueDataById(activeLeagueId, updated);
  }, [activeLeagueId, league]);

  const handleUpdateEventDate = useCallback((eventId: string, nextDate: string) => {
    const updated: LeagueData = {
      ...league,
      events: league.events.map((event) => (
        event.id === eventId
          ? { ...event, eventDate: nextDate.trim() }
          : event
      )),
    };
    setLeague(updated);
    saveLeagueDataById(activeLeagueId, updated);
  }, [activeLeagueId, league]);

  const handleUpdateEventWeather = useCallback((eventId: string, nextWeather: EventWeather | undefined) => {
    const updated: LeagueData = {
      ...league,
      events: league.events.map((event) => (
        event.id === eventId
          ? { ...event, eventWeather: nextWeather }
          : event
      )),
    };
    setLeague(updated);
    saveLeagueDataById(activeLeagueId, updated);
  }, [activeLeagueId, league]);

  const handleUpdateEventSide = useCallback((eventId: string, nextSide: 'front' | 'back') => {
    const updated: LeagueData = {
      ...league,
      events: league.events.map((event) => (
        event.id === eventId
          ? { ...event, nineHoles: nextSide }
          : event
      )),
    };
    const recalculated = {
      ...updated,
      events: recalculateCumulativeStandings(updated.events, updated.adjustedScoring),
    };
    setLeague(recalculated);
    saveLeagueDataById(activeLeagueId, recalculated);
  }, [activeLeagueId, league]);

  const handlePlayerColorChange = useCallback((playerName: string, color: string) => {
    const updated: ColorSchemeConfig = {
      ...colorScheme,
      playerColors: { ...colorScheme.playerColors, [playerName]: color },
    };
    setColorScheme(updated);
    saveColorSchemeById(activeLeagueId, updated);
  }, [activeLeagueId, colorScheme]);

  const handleClearPlayerColor = useCallback((playerName: string) => {
    const next = { ...colorScheme.playerColors };
    delete next[playerName];
    const updated: ColorSchemeConfig = { ...colorScheme, playerColors: next };
    setColorScheme(updated);
    saveColorSchemeById(activeLeagueId, updated);
  }, [activeLeagueId, colorScheme]);

  const handleEventColorChange = useCallback((eventId: string, color: string) => {
    const updated: ColorSchemeConfig = {
      ...colorScheme,
      eventColors: { ...colorScheme.eventColors, [eventId]: color },
    };
    setColorScheme(updated);
    saveColorSchemeById(activeLeagueId, updated);
  }, [activeLeagueId, colorScheme]);

  const handleClearEventColor = useCallback((eventId: string) => {
    const next = { ...colorScheme.eventColors };
    delete next[eventId];
    const updated: ColorSchemeConfig = { ...colorScheme, eventColors: next };
    setColorScheme(updated);
    saveColorSchemeById(activeLeagueId, updated);
  }, [activeLeagueId, colorScheme]);

  const handleThemeColorChange = useCallback((token: string, color: string) => {
    const updated: ColorSchemeConfig = {
      ...colorScheme,
      themeColors: { ...colorScheme.themeColors, [token]: color },
    };
    setColorScheme(updated);
    saveColorSchemeById(activeLeagueId, updated);
  }, [activeLeagueId, colorScheme]);

  const handleApplyThemePreset = useCallback((themeColors: Record<string, string>) => {
    const updated: ColorSchemeConfig = {
      ...colorScheme,
      themeColors: { ...themeColors },
    };
    setColorScheme(updated);
    saveColorSchemeById(activeLeagueId, updated);
  }, [activeLeagueId, colorScheme]);

  const handleClearThemeColor = useCallback((token: string) => {
    const next = { ...colorScheme.themeColors };
    delete next[token];
    const updated: ColorSchemeConfig = { ...colorScheme, themeColors: next };
    setColorScheme(updated);
    saveColorSchemeById(activeLeagueId, updated);
  }, [activeLeagueId, colorScheme]);

  const handleResetAllColors = useCallback(() => {
    setColorScheme(EMPTY_COLOR_SCHEME);
    saveColorSchemeById(activeLeagueId, EMPTY_COLOR_SCHEME);
  }, [activeLeagueId]);

  useEffect(() => {
    setPlayerColorOverrides(colorScheme.playerColors);
  }, [colorScheme.playerColors]);

  useEffect(() => {
    const root = document.documentElement;
    for (const key of THEME_COLOR_KEYS) {
      const value = colorScheme.themeColors[key];
      if (value) root.style.setProperty(key, value);
      else root.style.removeProperty(key);
    }
  }, [colorScheme.themeColors]);

  // Keep formatter settings in sync for the current render so date/time toggles
  // apply immediately (avoids one-render lag from useEffect).
  setEventDateDisplaySettings(league.eventDateDisplay ?? DEFAULT_EVENT_DATE_DISPLAY);

  const openCourseSetup = useCallback(() => {
    setShowCourseModal(true);
    setActiveTab('settings');
  }, []);

  const events = league.events;
  const activePlayerNames = useMemo(() => {
    const seen = new Set<string>();
    for (const ev of events) {
      for (const player of ev.players) {
        if (playerConfig.active[player.playerName] !== false) {
          seen.add(player.playerName);
        }
      }
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [events, playerConfig]);
  const visibleEvents = useMemo(() => events.filter(e => !hiddenEventIds.has(e.id)), [events, hiddenEventIds]);
  const filteredEvents = useFilteredEvents(visibleEvents, playerConfig, league.adjustedScoring);
  const effectivePointsRankBasis = league.adjustedScoring.mode === 'none' ? 'raw' : pointsRankBasis;

  const filterEventsByIds = useCallback((selectedIds: string[] | null) => {
    if (selectedIds === null) return filteredEvents;
    const selectedSet = new Set(selectedIds);
    return filteredEvents.filter((event) => selectedSet.has(event.id));
  }, [filteredEvents]);

  const scoringEvents = useMemo(
    () => filterEventsByIds(scoringEventIds),
    [filterEventsByIds, scoringEventIds]
  );
  const trendsEvents = useMemo(
    () => filterEventsByIds(trendsEventIds),
    [filterEventsByIds, trendsEventIds]
  );

  if (leagueLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', color: 'var(--text2)', flexDirection: 'column', gap: 12 }}>
        <span style={{ fontSize: 40 }}><img src="/logo.png" alt="" style={{ width: 48, height: 48 }} /></span>
        <span style={{ fontSize: 14 }}>Loading league data…</span>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <img src={league.leagueImage || '/logo.png'} alt={league.leagueName} className="sidebar-logo-img" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="sidebar-title">{league.leagueName}</h1>
            <p className="sidebar-subtitle">Golf Tracker</p>
          </div>
        </div>

        <div className="league-switcher">
          <label className="league-switcher-label" htmlFor="sidebar-league-select">Season</label>
          <select id="sidebar-league-select" className="league-select" value={activeLeagueId} onChange={(e) => handleSwitchLeague(e.target.value)}>
            {availableLeagues.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        <nav className="sidebar-nav">
          {TABS.map(tab => (
            <button key={tab.id} className={`nav-item ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
              {tab.icon}
              <span>{tab.label}</span>
              {tab.id === 'settings' && !courseConfig && <span className="nav-badge">!</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <EventList events={events} hiddenEventIds={hiddenEventIds} isAdmin={isAdmin} onRemove={handleRemoveEvent} onToggleEvent={handleToggleEvent} onToggleAll={handleToggleAllEvents} />
          {isAdmin && (
            <button className="btn-add-event" onClick={() => setShowModal(true)}>
              <PlusCircle size={16} /> Add Event Data
            </button>
          )}
          <button className="btn-theme-toggle" onClick={toggleTheme}>
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button className={`btn-admin-toggle ${isAdmin ? 'btn-admin-active' : ''}`} onClick={isAdmin ? lock : () => setShowAdminModal(true)}>
            {isAdmin ? <Unlock size={14} /> : <Lock size={14} />}
            {isAdmin ? 'Admin Mode On' : 'Viewer Mode'}
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="main-header">
          <div className="main-header-left">
            <img src={league.leagueImage || '/logo.png'} alt="" className="main-header-logo-img" />
            <h2 className="main-title">{TABS.find(t => t.id === activeTab)?.label ?? 'Overview'}</h2>
          </div>
          {/* Mobile league switcher — hidden on desktop (sidebar handles it there) */}
          <div className="mobile-league-switcher">
            <select className="mobile-league-select" value={activeLeagueId} onChange={(e) => handleSwitchLeague(e.target.value)}>
              {availableLeagues.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className="main-header-right">
            <span className="events-badge desktop-only">{events.length} event{events.length !== 1 ? 's' : ''}</span>
            {isAdmin && <button className="icon-btn mobile-add-btn" onClick={() => setShowModal(true)} title="Add Event"><PlusCircle size={18} /></button>}
            <button className="icon-btn" onClick={toggleTheme}>{isDark ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button className="icon-btn" onClick={isAdmin ? lock : () => setShowAdminModal(true)} title={isAdmin ? 'Lock' : 'Admin'}>
              {isAdmin ? <Unlock size={16} style={{ color: '#22c55e' }} /> : <Lock size={16} />}
            </button>
          </div>
        </div>

        <div className="charts-area">
          <Suspense fallback={<LazySectionFallback />}>
          {activeTab === 'overview' && (
            <div className="overview-stack">
              <div className="chart-container overview-panel-card" style={{ marginTop: 0 }}>
                <div className="overview-panel-tabs" role="tablist" aria-label="Overview rankings tabs">
                  {[
                    { id: 'current-rankings', label: 'Current Rankings' },
                    { id: 'ranking-history', label: 'Ranking History' },
                    { id: 'cumulative-points-race', label: 'Cumulative Points Race' },
                    { id: 'points-by-player', label: 'Points by Player' },
                    { id: 'points-matrix', label: 'Points Matrix' },
                  ].map((panel) => (
                    <button
                      key={panel.id}
                      type="button"
                      role="tab"
                      aria-selected={overviewPanel === panel.id}
                      className={`overview-panel-tab ${overviewPanel === panel.id ? 'active' : ''}`}
                      onClick={() => setOverviewPanel(panel.id as OverviewPanel)}
                    >
                      {panel.label}
                    </button>
                  ))}
                </div>

                <div className="overview-panel-content">
                  {overviewPanel === 'current-rankings' && (
                    <BumpChart
                      events={filteredEvents}
                      adjustedScoringMode={league.adjustedScoring.mode}
                      onPlayerClick={setProfilePlayer}
                      showHistory={false}
                    />
                  )}

                  {overviewPanel === 'ranking-history' && (
                    <BumpChart
                      events={filteredEvents}
                      adjustedScoringMode={league.adjustedScoring.mode}
                      onPlayerClick={setProfilePlayer}
                      showTable={false}
                      showHistory
                    />
                  )}

                  {overviewPanel === 'cumulative-points-race' && (
                    <>
                      {league.adjustedScoring.mode !== 'none' && (
                        <div className="overview-panel-controls">
                          <span className="overview-panel-controls-label">Points basis:</span>
                          <button
                            className={`btn-secondary rank-basis-btn ${effectivePointsRankBasis === 'raw' ? 'rank-basis-btn-active' : ''}`}
                            style={{ padding: '4px 10px' }}
                            onClick={() => setPointsRankBasis('raw')}
                          >
                            Total Points
                          </button>
                          <button
                            className={`btn-secondary rank-basis-btn ${effectivePointsRankBasis === 'adjusted' ? 'rank-basis-btn-active' : ''}`}
                            style={{ padding: '4px 10px' }}
                            onClick={() => setPointsRankBasis('adjusted')}
                          >
                            Adjusted Points
                          </button>
                        </div>
                      )}
                      <CumulativePointsChart events={filteredEvents} onOpenPlayer={setProfilePlayer} rankBasis={effectivePointsRankBasis} />
                    </>
                  )}

                  {overviewPanel === 'points-by-player' && (
                    <>
                      {league.adjustedScoring.mode !== 'none' && (
                        <div className="overview-panel-controls">
                          <span className="overview-panel-controls-label">Points basis:</span>
                          <button
                            className={`btn-secondary rank-basis-btn ${effectivePointsRankBasis === 'raw' ? 'rank-basis-btn-active' : ''}`}
                            style={{ padding: '4px 10px' }}
                            onClick={() => setPointsRankBasis('raw')}
                          >
                            Total Points
                          </button>
                          <button
                            className={`btn-secondary rank-basis-btn ${effectivePointsRankBasis === 'adjusted' ? 'rank-basis-btn-active' : ''}`}
                            style={{ padding: '4px 10px' }}
                            onClick={() => setPointsRankBasis('adjusted')}
                          >
                            Adjusted Points
                          </button>
                        </div>
                      )}
                      <WeeklyPointsChart
                        events={filteredEvents}
                        onPlayerClick={setProfilePlayer}
                        rankBasis={effectivePointsRankBasis}
                        adjustedScoring={league.adjustedScoring}
                        showBarChart
                        showMatrix={false}
                      />
                    </>
                  )}

                  {overviewPanel === 'points-matrix' && (
                    <>
                      {league.adjustedScoring.mode !== 'none' && (
                        <div className="overview-panel-controls">
                          <span className="overview-panel-controls-label">Points basis:</span>
                          <button
                            className={`btn-secondary rank-basis-btn ${effectivePointsRankBasis === 'raw' ? 'rank-basis-btn-active' : ''}`}
                            style={{ padding: '4px 10px' }}
                            onClick={() => setPointsRankBasis('raw')}
                          >
                            Total Points
                          </button>
                          <button
                            className={`btn-secondary rank-basis-btn ${effectivePointsRankBasis === 'adjusted' ? 'rank-basis-btn-active' : ''}`}
                            style={{ padding: '4px 10px' }}
                            onClick={() => setPointsRankBasis('adjusted')}
                          >
                            Adjusted Points
                          </button>
                        </div>
                      )}
                      <WeeklyPointsChart
                        events={filteredEvents}
                        onPlayerClick={setProfilePlayer}
                        rankBasis={effectivePointsRankBasis}
                        adjustedScoring={league.adjustedScoring}
                        showBarChart={false}
                        showMatrix
                      />
                    </>
                  )}
                </div>
              </div>
              <SeasonDashboard events={filteredEvents} courseConfig={courseConfig} />
              <WeeklyRecapPage events={filteredEvents} courseConfig={courseConfig} onPlayerClick={setProfilePlayer} onHoleClick={(n, nine) => setHoleProfile({ holeNum: n, nine })} />
            </div>
          )}
          {activeTab === 'trends' && (
            <TrendsPage
              events={trendsEvents}
              allEvents={filteredEvents}
              courseConfig={courseConfig}
              yardageBandSettings={league.yardageBandSettings}
              handicapMode={league.handicapMode}
              analysisSettings={league.analysisSettings}
              filterEventIds={trendsEventIds}
              onFilterChange={setTrendsEventIds}
              onPlayerClick={setProfilePlayer}
            />
          )}
          {activeTab === 'scoring' && (
            <>
              <EventFilterBar title="Hole Stats Filters" events={filteredEvents} selectedEventIds={scoringEventIds} onChange={setScoringEventIds} />
              <HoleStatsChart events={scoringEvents} courseConfig={courseConfig} onSetupCourse={openCourseSetup} onHoleClick={(n, nine) => setHoleProfile({ holeNum: n, nine })} />
              <GrossNetScoresChart events={scoringEvents} scoreType="net" onOpenPlayer={setProfilePlayer} />
              <GrossNetScoresChart events={scoringEvents} scoreType="gross" onOpenPlayer={setProfilePlayer} />
              <HandicapTrendChart events={scoringEvents} handicapMode={league.handicapMode} onOpenPlayer={setProfilePlayer} />
              <ScoringBreakdownChart events={scoringEvents} courseConfig={courseConfig} onSetupCourse={openCourseSetup} onPlayerClick={setProfilePlayer} />
            </>
          )}
          {activeTab === 'settings' && isAdmin && (
            <SettingsPage
              activeLeagueId={activeLeagueId}
              availableLeagues={availableLeagues}
              events={events}
              league={league}
              courseConfig={courseConfig}
              playerConfig={playerConfig}
              onPlayerConfigChange={handlePlayerConfigChange}
              onRenamePlayer={handleRenamePlayer}
              onRenameEvent={handleRenameEvent}
              onUpdateEventDate={handleUpdateEventDate}
              onUpdateEventWeather={handleUpdateEventWeather}
              onUpdateEventSide={handleUpdateEventSide}
              colorScheme={colorScheme}
              onPlayerColorChange={handlePlayerColorChange}
              onClearPlayerColor={handleClearPlayerColor}
              onEventColorChange={handleEventColorChange}
              onClearEventColor={handleClearEventColor}
              onThemeColorChange={handleThemeColorChange}
              onApplyThemePreset={handleApplyThemePreset}
              onClearThemeColor={handleClearThemeColor}
              onResetAllColors={handleResetAllColors}
              onEditCourse={() => setShowCourseModal(true)}
              onImportSnapshot={handleImportSnapshot}
              onBulkEventsAdded={handleBulkEventsAdded}
              onLeagueNameChange={handleLeagueNameChange}
              onLeagueImageChange={handleLeagueImageChange}
              onLeagueHandicapModeChange={handleLeagueHandicapModeChange}
              onLeagueAdjustedScoringChange={handleLeagueAdjustedScoringChange}
              onEventDateDisplayChange={handleEventDateDisplayChange}
              onLeagueWeatherSettingsChange={handleLeagueWeatherSettingsChange}
              onLeagueAnalysisSettingsChange={handleLeagueAnalysisSettingsChange}
              onLeagueYardageBandSettingsChange={handleLeagueYardageBandSettingsChange}
              onClearAllEvents={handleClearAllEvents}
              onDeleteLeague={handleDeleteLeague}
              onCreateLeague={handleCreateLeague}
            />
          )}
          </Suspense>
        </div>
      </main>

      <Suspense fallback={null}>
        {isAdmin && showModal && <AddEventModal onClose={() => setShowModal(false)} onAdd={handleAddEvent} courseConfig={courseConfig} activePlayerNames={activePlayerNames} weatherSettings={league.weatherSettings} />}
        {isAdmin && showCourseModal && <CourseConfigModal initial={courseConfig} onSave={handleSaveCourse} onClose={() => setShowCourseModal(false)} />}
        {showAdminModal && <AdminUnlockModal onUnlock={(pin) => { const ok = tryUnlock(pin); if (ok) setShowAdminModal(false); return ok; }} onClose={() => setShowAdminModal(false)} />}
        {holeProfile && (
          <HoleProfileModal
            holeNum={holeProfile.holeNum}
            nine={holeProfile.nine}
            events={filteredEvents}
            courseConfig={courseConfig}
            onClose={() => setHoleProfile(null)}
            onShowHole={(holeNum, nine) => setHoleProfile({ holeNum, nine })}
            onPlayerClick={(playerName) => {
              setHoleProfile(null);
              setProfilePlayer(playerName);
            }}
          />
        )}
        {profilePlayer && <PlayerProfileModal playerName={profilePlayer} events={filteredEvents} courseConfig={courseConfig} yardageBandSettings={league.yardageBandSettings} playerNicknames={playerConfig.nicknames} handicapMode={league.handicapMode} analysisSettings={league.analysisSettings} adjustedScoring={league.adjustedScoring} onHoleClick={(n, nine) => { setProfilePlayer(null); setHoleProfile({ holeNum: n, nine }); }} onClose={() => setProfilePlayer(null)} />}
      </Suspense>

      <nav className="mobile-bottom-nav">
        {TABS.map(tab => (
          <button key={tab.id} className={`mobile-nav-item ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id)}>
            {tab.icon}
            <span>{tab.label}</span>
            {tab.id === 'settings' && !courseConfig && <span className="mobile-nav-badge" />}
          </button>
        ))}
      </nav>
    </div>
  );
}
