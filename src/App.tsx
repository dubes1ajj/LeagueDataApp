import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  BUILT_IN_LEAGUES, fetchAvailableLeagues, getActiveLeagueId, getLatestLeagueId, getStoredActiveLeagueId, setActiveLeagueIdStorage,
  loadLeagueDataById, saveLeagueDataById,
  loadCourseConfigById, saveCourseConfigById,
  loadPlayerConfigById, savePlayerConfigById,
  loadHiddenEventIdsById, saveHiddenEventIdsById,
  fetchLeagueSnapshot, addEvent, removeEvent, applyAutoHide,
} from './lib/storage';
import type { BuiltInLeague, LeagueSnapshot } from './lib/storage';
import { recalculateCumulativeStandings } from './lib/parser';
import type { EventData, LeagueData, CourseConfig, PlayerConfig } from './types/golf';
import AddEventModal from './components/AddEventModal';
import BumpChart from './components/BumpChart';
import WeeklyPointsChart from './components/WeeklyPointsChart';
import HandicapTrendChart from './components/HandicapTrendChart';
import ScoringBreakdownChart from './components/ScoringBreakdownChart';
import GrossNetScoresChart from './components/GrossNetScoresChart';
import HoleStatsChart from './components/HoleStatsChart';
import HoleProfileModal from './components/HoleProfileModal';
import CumulativePointsChart from './components/CumulativePointsChart';
import EventList from './components/EventList';
import CourseConfigModal from './components/CourseConfigModal';
import PlayerProfileModal from './components/PlayerProfileModal';
import AdminUnlockModal from './components/AdminUnlockModal';
import SettingsPage from './components/SettingsPage';
import SeasonDashboard from './components/SeasonDashboard';
import WeeklyRecapPage from './components/WeeklyRecapPage';
import EventFilterBar from './components/EventFilterBar';
import TrendsPage from './components/TrendsPage';
import { useAdminMode } from './lib/useAdminMode';
import {
  PlusCircle, Trophy, TrendingUp, Target,
  Sun, Moon, Lock, Unlock, BarChart3, Settings,
} from 'lucide-react';
import { useTheme } from './lib/useTheme';
import { useFilteredEvents } from './lib/useFilteredEvents';
import './App.css';

type Tab = 'overview' | 'trends' | 'points' | 'scoring' | 'settings';

const ALL_TABS: { id: Tab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
  { id: 'overview',  label: 'Overview',    icon: <Trophy size={16} /> },
  { id: 'trends',    label: 'Trends',      icon: <BarChart3 size={16} /> },
  { id: 'points',    label: 'Points Race', icon: <TrendingUp size={16} /> },
  { id: 'scoring',   label: 'Hole Stats',  icon: <Target size={16} /> },
  { id: 'settings',  label: 'Settings',    icon: <Settings size={16} />, adminOnly: true },
];

const EMPTY_LEAGUE: LeagueData = { leagueName: 'Loading…', events: [] };

export default function App() {
  const { isDark, toggle: toggleTheme } = useTheme();
  const { isAdmin, tryUnlock, lock } = useAdminMode();

  const [availableLeagues, setAvailableLeagues] = useState<BuiltInLeague[]>(() => [...BUILT_IN_LEAGUES]);
  const [activeLeagueId, setActiveLeagueId] = useState<string>(() => getActiveLeagueId(getLatestLeagueId(BUILT_IN_LEAGUES)));
  const [leagueLoading, setLeagueLoading] = useState(true);
  const [league, setLeague] = useState<LeagueData>(EMPTY_LEAGUE);
  const [courseConfig, setCourseConfig] = useState<CourseConfig | null>(null);
  const [playerConfig, setPlayerConfig] = useState<PlayerConfig>({ active: {} });
  const [hiddenEventIds, setHiddenEventIds] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [profilePlayer, setProfilePlayer] = useState<string | null>(null);
  const [holeProfile, setHoleProfile] = useState<{ holeNum: number; nine: 'front' | 'back' } | null>(null);
  const [pointsEventIds, setPointsEventIds] = useState<string[] | null>(null);
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
    setLeagueLoading(true);

    async function load() {
      let leagueData = loadLeagueDataById(activeLeagueId);
      let courseData = loadCourseConfigById(activeLeagueId);
      let playerData = loadPlayerConfigById(activeLeagueId);
      const hiddenData = loadHiddenEventIdsById(activeLeagueId);

      if (!leagueData) {
        const snap = await fetchLeagueSnapshot(activeLeagueId);
        if (snap && !cancelled) {
          leagueData = {
            ...snap.league,
            events: snap.league.events.map(e => {
              if (!e.nineHoles) return { ...e, nineHoles: 'front' as const };
              return e;
            }),
          };
          courseData = snap.courseConfig;
          playerData = applyAutoHide(snap.playerConfig, leagueData.events);
          const recalculated = { ...leagueData, events: recalculateCumulativeStandings(leagueData.events) };
          saveLeagueDataById(activeLeagueId, recalculated);
          if (courseData) saveCourseConfigById(activeLeagueId, courseData);
          savePlayerConfigById(activeLeagueId, playerData);
          leagueData = recalculated;
        }
      } else {
        leagueData = { ...leagueData, events: recalculateCumulativeStandings(leagueData.events) };
        saveLeagueDataById(activeLeagueId, leagueData);
        playerData = applyAutoHide(playerData, leagueData.events);
      }

      if (!cancelled && leagueData) {
        setLeague(leagueData);
        setCourseConfig(courseData ?? null);
        setPlayerConfig(playerData);
        setHiddenEventIds(hiddenData);
        setLeagueLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [activeLeagueId]);

  const handleSwitchLeague = useCallback((id: string) => {
    setActiveLeagueId(id);
    setActiveLeagueIdStorage(id);
    setProfilePlayer(null);
    setHoleProfile(null);
    setActiveTab('overview');
  }, []);

  const handleCreateLeague = useCallback((id: string) => {
    const emptyLeague: LeagueData = { leagueName: `${id} Guinness Cup`, events: [] };
    setLeague(emptyLeague);
    setCourseConfig(null);
    setPlayerConfig({ active: {} });
    setHiddenEventIds(new Set());
    saveLeagueDataById(id, emptyLeague);
    savePlayerConfigById(id, { active: {} });
    saveHiddenEventIdsById(id, new Set());
    setAvailableLeagues((prev) => [...prev, { id, name: `${id} Guinness Cup` }]
      .reduce<BuiltInLeague[]>((acc, league) => {
        if (!acc.some((entry) => entry.id === league.id)) acc.push(league);
        return acc;
      }, [])
      .sort((a, b) => Number.parseInt(b.id, 10) - Number.parseInt(a.id, 10)));
    setActiveLeagueId(id);
    setActiveLeagueIdStorage(id);
    setProfilePlayer(null);
    setHoleProfile(null);
    setActiveTab('overview');
  }, []);

  const handleAddEvent = useCallback((partial: Omit<EventData, 'id'>) => {
    const newEvent: EventData = { ...partial, id: `event-${partial.eventNumber}-${Date.now()}` };
    const updated = addEvent(league, newEvent);
    const recalculated = { ...updated, events: recalculateCumulativeStandings(updated.events) };
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
    const recalculated = { ...updated, events: recalculateCumulativeStandings(updated.events) };
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
    const recalculated = { ...snap.league, events: recalculateCumulativeStandings(snap.league.events) };
    setLeague(recalculated);
    saveLeagueDataById(activeLeagueId, recalculated);
    if (snap.courseConfig) { setCourseConfig(snap.courseConfig); saveCourseConfigById(activeLeagueId, snap.courseConfig); }
    const pc = applyAutoHide(snap.playerConfig, recalculated.events);
    setPlayerConfig(pc);
    savePlayerConfigById(activeLeagueId, pc);
  }, [activeLeagueId]);

  const handleBulkEventsAdded = useCallback((newLeague: LeagueData, newPlayerConfig: PlayerConfig) => {
    setLeague(newLeague);
    saveLeagueDataById(activeLeagueId, newLeague);
    setPlayerConfig(newPlayerConfig);
    savePlayerConfigById(activeLeagueId, newPlayerConfig);
  }, [activeLeagueId]);

  const handleLeagueNameChange = useCallback((name: string) => {
    const updated = { ...league, leagueName: name };
    setLeague(updated);
    saveLeagueDataById(activeLeagueId, updated);
  }, [league, activeLeagueId]);

  const handleClearAllEvents = useCallback(() => {
    const cleared = { ...league, events: [] };
    setLeague(cleared);
    saveLeagueDataById(activeLeagueId, cleared);
    const clearedConfig = { active: {} } as PlayerConfig;
    setPlayerConfig(clearedConfig);
    savePlayerConfigById(activeLeagueId, clearedConfig);
  }, [league, activeLeagueId]);

  const handlePlayerConfigChange = useCallback((config: PlayerConfig) => {
    setPlayerConfig(config);
    savePlayerConfigById(activeLeagueId, config);
  }, [activeLeagueId]);

  const openCourseSetup = useCallback(() => {
    setShowCourseModal(true);
    setActiveTab('settings');
  }, []);

  const events = league.events;
  const visibleEvents = useMemo(() => events.filter(e => !hiddenEventIds.has(e.id)), [events, hiddenEventIds]);
  const filteredEvents = useFilteredEvents(visibleEvents, playerConfig);
  const filteredEventIds = useMemo(() => filteredEvents.map((event) => event.id), [filteredEvents]);

  useEffect(() => {
    setPointsEventIds((current) => current === null ? null : current.filter((id) => filteredEventIds.includes(id)));
    setScoringEventIds((current) => current === null ? null : current.filter((id) => filteredEventIds.includes(id)));
    setTrendsEventIds((current) => current === null ? null : current.filter((id) => filteredEventIds.includes(id)));
  }, [filteredEventIds]);

  const filterEventsByIds = useCallback((selectedIds: string[] | null) => {
    if (selectedIds === null) return filteredEvents;
    const selectedSet = new Set(selectedIds);
    return filteredEvents.filter((event) => selectedSet.has(event.id));
  }, [filteredEvents]);

  const pointsEvents = useMemo(
    () => filterEventsByIds(pointsEventIds),
    [filterEventsByIds, pointsEventIds]
  );
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
          <img src="/logo.png" alt="Guinness Cup" className="sidebar-logo-img" />
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
            <img src="/logo.png" alt="" className="main-header-logo-img" />
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
          {activeTab === 'overview' && (
            <div className="overview-stack">
              <BumpChart events={filteredEvents} onPlayerClick={setProfilePlayer} showHistory={false} />
              <CumulativePointsChart events={filteredEvents} />
              <BumpChart events={filteredEvents} showTable={false} />
              <SeasonDashboard events={filteredEvents} courseConfig={courseConfig} />
              <WeeklyRecapPage events={filteredEvents} courseConfig={courseConfig} />
            </div>
          )}
          {activeTab === 'trends' && (
            <TrendsPage
              events={trendsEvents}
              allEvents={filteredEvents}
              courseConfig={courseConfig}
              filterEventIds={trendsEventIds}
              onFilterChange={setTrendsEventIds}
            />
          )}
          {activeTab === 'points' && (
            <>
              <EventFilterBar title="Points Filters" events={filteredEvents} selectedEventIds={pointsEventIds} onChange={setPointsEventIds} />
              <CumulativePointsChart events={pointsEvents} />
              <WeeklyPointsChart events={pointsEvents} />
            </>
          )}
          {activeTab === 'scoring' && (
            <>
              <EventFilterBar title="Hole Stats Filters" events={filteredEvents} selectedEventIds={scoringEventIds} onChange={setScoringEventIds} />
              <HoleStatsChart events={scoringEvents} courseConfig={courseConfig} onSetupCourse={openCourseSetup} onHoleClick={(n, nine) => setHoleProfile({ holeNum: n, nine })} />
              <GrossNetScoresChart events={scoringEvents} scoreType="net" />
              <GrossNetScoresChart events={scoringEvents} scoreType="gross" />
              <HandicapTrendChart events={scoringEvents} />
              <ScoringBreakdownChart events={scoringEvents} courseConfig={courseConfig} onSetupCourse={openCourseSetup} />
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
              onEditCourse={() => setShowCourseModal(true)}
              onImportSnapshot={handleImportSnapshot}
              onBulkEventsAdded={handleBulkEventsAdded}
              onLeagueNameChange={handleLeagueNameChange}
              onClearAllEvents={handleClearAllEvents}
              onCreateLeague={handleCreateLeague}
            />
          )}
        </div>
      </main>

      {isAdmin && showModal && <AddEventModal onClose={() => setShowModal(false)} onAdd={handleAddEvent} />}
      {isAdmin && showCourseModal && <CourseConfigModal initial={courseConfig} onSave={handleSaveCourse} onClose={() => setShowCourseModal(false)} />}
      {showAdminModal && <AdminUnlockModal onUnlock={(pin) => { const ok = tryUnlock(pin); if (ok) setShowAdminModal(false); return ok; }} onClose={() => setShowAdminModal(false)} />}
      {holeProfile && <HoleProfileModal holeNum={holeProfile.holeNum} nine={holeProfile.nine} events={filteredEvents} courseConfig={courseConfig} onClose={() => setHoleProfile(null)} />}
      {profilePlayer && <PlayerProfileModal playerName={profilePlayer} events={filteredEvents} courseConfig={courseConfig} onClose={() => setProfilePlayer(null)} />}

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
