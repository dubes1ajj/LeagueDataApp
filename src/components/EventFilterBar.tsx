import { memo, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { EventData } from '../types/golf';
import { getEventDisplayName } from '../lib/eventNames';
import { formatEventDateDisplay } from '../lib/eventDateDisplay';

interface EventFilterBarProps {
  events: EventData[];
  selectedEventIds: string[] | null;
  onChange: (value: string[] | null) => void;
  title?: string;
}

export default memo(function EventFilterBar({
  events,
  selectedEventIds,
  onChange,
  title = 'Event Filters',
}: EventFilterBarProps) {
  const [expanded, setExpanded] = useState(false);
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.eventNumber - b.eventNumber),
    [events]
  );

  const allEventIds = sortedEvents.map((event) => event.id);
  const effectiveSelected = selectedEventIds === null
    ? new Set(allEventIds)
    : new Set(selectedEventIds);
  const selectedCount = effectiveSelected.size;

  function normalizeSelection(next: Set<string>) {
    if (next.size === allEventIds.length) {
      onChange(null);
      return;
    }
    onChange(allEventIds.filter((id) => next.has(id)));
  }

  function toggleEvent(eventId: string) {
    const next = new Set(effectiveSelected);
    if (next.has(eventId)) next.delete(eventId);
    else next.add(eventId);
    normalizeSelection(next);
  }

  if (!sortedEvents.length) {
    return null;
  }

  return (
    <div className="chart-container trend-filter-card">
      <div className="trend-filter-header">
        <div>
          <h3 className="chart-title">{title}</h3>
          <p className="chart-subtitle">
            {expanded ? 'Toggle active events on or off for this view' : 'Expand to change which events are included in this view'}
          </p>
        </div>
        <div className="event-filter-actions">
          <span className="event-filter-summary">{selectedCount} of {sortedEvents.length} selected</span>
          {expanded && (
            <>
              <button className="trend-pill" onClick={() => onChange(null)}>All On</button>
              <button className="trend-pill" onClick={() => onChange([])}>All Off</button>
            </>
          )}
          <button
            className="trend-pill event-filter-toggle"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="trend-pill-row">
          {sortedEvents.map((event) => {
            const selected = effectiveSelected.has(event.id);
            return (
              <button
                key={event.id}
                className={`trend-pill event-filter-pill ${selected ? 'active' : ''}`}
                onClick={() => toggleEvent(event.id)}
              >
                <span className="event-filter-pill-label">{getEventDisplayName(event)}</span>
                <span className="event-filter-pill-meta">
                  {formatEventDateDisplay(event.eventDate) || 'No date'} · {event.nineHoles === 'front' ? 'Front 9' : 'Back 9'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});