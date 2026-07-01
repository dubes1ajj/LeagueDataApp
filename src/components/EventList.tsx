
import type { EventData } from '../types/golf';
import { Trash2, Calendar, Eye, EyeOff } from 'lucide-react';
import { getEventDisplayName } from '../lib/eventNames';
import { formatEventDateDisplay } from '../lib/eventDateDisplay';

interface EventListProps {
  events: EventData[];
  hiddenEventIds: Set<string>;
  isAdmin: boolean;
  onRemove: (id: string) => void;
  onToggleEvent: (id: string) => void;
  onToggleAll: (show: boolean) => void;
}

export default function EventList({ events, hiddenEventIds, isAdmin, onRemove, onToggleEvent, onToggleAll }: EventListProps) {
  const sorted = [...events].sort((a, b) => a.eventNumber - b.eventNumber);
  const allVisible = sorted.every(ev => !hiddenEventIds.has(ev.id));
  const allHidden  = sorted.every(ev => hiddenEventIds.has(ev.id));

  return (
    <div className="event-list">
      <div className="event-list-header">
        <h4 className="event-list-title">Loaded Events</h4>
        {sorted.length > 0 && (
          <button
            className="icon-btn"
            title={allVisible ? 'Hide all events' : 'Show all events'}
            onClick={() => onToggleAll(allHidden)}
          >
            {allVisible ? <Eye size={13} /> : allHidden ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        )}
      </div>
      {sorted.length === 0 && (
        <p className="event-list-empty">No events loaded yet.</p>
      )}
      {sorted.map(ev => {
        const hidden = hiddenEventIds.has(ev.id);
        return (
          <div key={ev.id} className={`event-item ${hidden ? 'event-item-hidden' : ''}`}>
            <Calendar size={14} className="event-icon" />
            <div className="event-info">
              <span className="event-name">{getEventDisplayName(ev)}</span>
              {formatEventDateDisplay(ev.eventDate) && <span className="event-date">{formatEventDateDisplay(ev.eventDate)}</span>}
              {ev.eventWeather && (
                <span className="event-date">
                  {ev.eventWeather.summary || 'Weather set'}
                  {typeof ev.eventWeather.temperatureF === 'number' ? ` • ${ev.eventWeather.temperatureF.toFixed(1)} F` : ''}
                  {typeof ev.eventWeather.windMph === 'number' ? ` • Wind ${ev.eventWeather.windMph.toFixed(1)} mph` : ''}
                </span>
              )}
              <span className="event-players">{ev.players.filter(p => !p.didNotPlay).length} players</span>
            </div>
            <button
              className="icon-btn"
              title={hidden ? 'Include in calculations' : 'Exclude from calculations'}
              onClick={() => onToggleEvent(ev.id)}
            >
              {hidden ? <EyeOff size={13} style={{ color: 'var(--text2)' }} /> : <Eye size={13} />}
            </button>
            {isAdmin && (
              <button
                className="icon-btn danger"
                title="Remove event"
                onClick={() => {
                  if (confirm(`Remove ${getEventDisplayName(ev)}?`)) onRemove(ev.id);
                }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        );
      })}
      {sorted.length > 0 && (
        <p className="event-list-visibility">
          {sorted.length - hiddenEventIds.size} / {sorted.length} visible
        </p>
      )}
    </div>
  );
}
