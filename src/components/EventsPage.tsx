import { useMemo, useState } from 'react';
import type { ColorSchemeConfig, EventData, EventWeather } from '../types/golf';
import { Edit2, Save, X } from 'lucide-react';
import { getEventDisplayName } from '../lib/eventNames';
import { formatEventDateDisplay } from '../lib/eventDateDisplay';
import { getDefaultEventColor } from '../lib/eventColors';

interface EventsPageProps {
  events: EventData[];
  colorScheme: ColorSchemeConfig;
  onRename: (eventId: string, nextName: string) => void;
  onUpdateEventDate: (eventId: string, nextDate: string) => void;
  onUpdateEventWeather: (eventId: string, nextWeather: EventWeather | undefined) => void;
  onEventColorChange: (eventId: string, color: string) => void;
  onClearEventColor: (eventId: string) => void;
}

export default function EventsPage({
  events,
  colorScheme,
  onRename,
  onUpdateEventDate,
  onUpdateEventWeather,
  onEventColorChange,
  onClearEventColor,
}: EventsPageProps) {
  const [search, setSearch] = useState('');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const [editedDate, setEditedDate] = useState('');
  const [editedWeatherSummary, setEditedWeatherSummary] = useState('');
  const [editedWeatherTempF, setEditedWeatherTempF] = useState('');
  const [editedWeatherFeelsLikeF, setEditedWeatherFeelsLikeF] = useState('');
  const [editedWeatherPrecipMm, setEditedWeatherPrecipMm] = useState('');
  const [editedWeatherWindMph, setEditedWeatherWindMph] = useState('');

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.eventNumber - b.eventNumber),
    [events]
  );

  const filteredEvents = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return sortedEvents;
    return sortedEvents.filter((event) => {
      const name = getEventDisplayName(event).toLowerCase();
      const date = (event.eventDate || '').toLowerCase();
      const side = event.nineHoles === 'back' ? 'back' : 'front';
      return name.includes(needle) || date.includes(needle) || side.includes(needle);
    });
  }, [search, sortedEvents]);

  function startEditing(event: EventData) {
    setEditingEventId(event.id);
    setEditedName(event.eventName ?? getEventDisplayName(event));
    setEditedDate(event.eventDate ?? '');
    setEditedWeatherSummary(event.eventWeather?.summary ?? '');
    setEditedWeatherTempF(typeof event.eventWeather?.temperatureF === 'number' ? String(event.eventWeather.temperatureF) : '');
    setEditedWeatherFeelsLikeF(typeof event.eventWeather?.feelsLikeF === 'number' ? String(event.eventWeather.feelsLikeF) : '');
    setEditedWeatherPrecipMm(typeof event.eventWeather?.precipitationMm === 'number' ? String(event.eventWeather.precipitationMm) : '');
    setEditedWeatherWindMph(typeof event.eventWeather?.windMph === 'number' ? String(event.eventWeather.windMph) : '');
  }

  function cancelEditing() {
    setEditingEventId(null);
    setEditedName('');
    setEditedDate('');
    setEditedWeatherSummary('');
    setEditedWeatherTempF('');
    setEditedWeatherFeelsLikeF('');
    setEditedWeatherPrecipMm('');
    setEditedWeatherWindMph('');
  }

  function parseOptionalNumber(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function buildEditedWeather(): EventWeather | undefined {
    const summary = editedWeatherSummary.trim();
    const temperatureF = parseOptionalNumber(editedWeatherTempF);
    const feelsLikeF = parseOptionalNumber(editedWeatherFeelsLikeF);
    const precipitationMm = parseOptionalNumber(editedWeatherPrecipMm);
    const windMph = parseOptionalNumber(editedWeatherWindMph);

    if (!summary && temperatureF === undefined && feelsLikeF === undefined && precipitationMm === undefined && windMph === undefined) {
      return undefined;
    }

    return {
      summary: summary || undefined,
      temperatureF,
      feelsLikeF,
      precipitationMm,
      windMph,
    };
  }

  function saveDetails(eventId: string) {
    onRename(eventId, editedName);
    onUpdateEventDate(eventId, editedDate);
    onUpdateEventWeather(eventId, buildEditedWeather());
    cancelEditing();
  }

  return (
    <div className="chart-container">
      <div className="players-page-header">
        <div>
          <h3 className="chart-title">Event Details</h3>
          <p className="chart-subtitle">
            Rename events and edit date/time values used across filters, charts, and scorecards
          </p>
        </div>
      </div>

      <input
        className="url-input players-search"
        type="text"
        placeholder="Search events..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="players-grid">
        {filteredEvents.map((event) => {
          const isEditing = editingEventId === event.id;
          const sideLabel = event.nineHoles === 'back' ? 'Back 9' : 'Front 9';
          const currentName = getEventDisplayName(event);
          const hasCustomName = !!event.eventName?.trim();
          const eventColor = colorScheme.eventColors[event.id] ?? getDefaultEventColor(event.id, sortedEvents);
          const hasColorOverride = !!colorScheme.eventColors[event.id];

          return (
            <div key={event.id} className="player-card player-card-active" title={currentName}>
              <div className="player-card-avatar" style={{ background: eventColor }}>
                {event.eventNumber}
              </div>
              <div className="player-card-info" style={{ minWidth: 0 }}>
                {isEditing ? (
                  <div style={{ display: 'grid', gap: 8, width: '100%' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 1fr) minmax(140px, 1fr) auto auto', alignItems: 'center', gap: 8, width: '100%' }}>
                      <input
                        className="url-input"
                        style={{ minWidth: 0, padding: '6px 10px' }}
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveDetails(event.id);
                          if (e.key === 'Escape') cancelEditing();
                        }}
                        placeholder="Event name"
                        autoFocus
                      />
                      <input
                        className="url-input"
                        style={{ minWidth: 0, padding: '6px 10px' }}
                        value={editedDate}
                        onChange={(e) => setEditedDate(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveDetails(event.id);
                          if (e.key === 'Escape') cancelEditing();
                        }}
                        placeholder="Date / time"
                      />
                      <button className="icon-btn" onClick={() => saveDetails(event.id)} title="Save event details">
                        <Save size={14} />
                      </button>
                      <button className="icon-btn" onClick={cancelEditing} title="Cancel edit">
                        <X size={14} />
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 1.5fr) repeat(4, minmax(90px, 1fr))', gap: 8 }}>
                      <input
                        className="url-input"
                        style={{ minWidth: 0, padding: '6px 10px' }}
                        value={editedWeatherSummary}
                        onChange={(e) => setEditedWeatherSummary(e.target.value)}
                        placeholder="Weather summary"
                      />
                      <input
                        className="url-input"
                        style={{ minWidth: 0, padding: '6px 10px' }}
                        type="number"
                        step="0.1"
                        value={editedWeatherTempF}
                        onChange={(e) => setEditedWeatherTempF(e.target.value)}
                        placeholder="Temp F"
                      />
                      <input
                        className="url-input"
                        style={{ minWidth: 0, padding: '6px 10px' }}
                        type="number"
                        step="0.1"
                        value={editedWeatherFeelsLikeF}
                        onChange={(e) => setEditedWeatherFeelsLikeF(e.target.value)}
                        placeholder="Feels F"
                      />
                      <input
                        className="url-input"
                        style={{ minWidth: 0, padding: '6px 10px' }}
                        type="number"
                        step="0.1"
                        value={editedWeatherPrecipMm}
                        onChange={(e) => setEditedWeatherPrecipMm(e.target.value)}
                        placeholder="Precip mm"
                      />
                      <input
                        className="url-input"
                        style={{ minWidth: 0, padding: '6px 10px' }}
                        type="number"
                        step="0.1"
                        value={editedWeatherWindMph}
                        onChange={(e) => setEditedWeatherWindMph(e.target.value)}
                        placeholder="Wind mph"
                      />
                    </div>
                  </div>
                ) : (
                  <span className="player-card-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {currentName}
                  </span>
                )}
                <span className="player-card-stats">
                  {formatEventDateDisplay(event.eventDate) || 'No date'} · {sideLabel} · {event.players.filter((p) => !p.didNotPlay).length} players
                  {!isEditing && !hasCustomName ? ' · default name' : ''}
                  {hasColorOverride ? ' · custom color' : ''}
                </span>
              </div>
              <div className="player-card-toggle">
                <input
                  type="color"
                  value={eventColor}
                  onChange={(e) => onEventColorChange(event.id, e.target.value)}
                  title={`Pick color for ${currentName}`}
                  style={{ marginRight: 8 }}
                />
                <button
                  className="icon-btn"
                  onClick={() => onClearEventColor(event.id)}
                  title="Reset to default color"
                  disabled={!hasColorOverride}
                  style={{ marginRight: 8 }}
                >
                  D
                </button>
                {!isEditing && (
                  <button className="icon-btn" onClick={() => startEditing(event)} title="Edit event name" style={{ marginRight: 8 }}>
                    <Edit2 size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
