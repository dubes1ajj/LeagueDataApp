import type { EventData } from '../types/golf';

export function getEventDisplayName(event: Pick<EventData, 'eventNumber' | 'eventName'>): string {
  const customName = event.eventName?.trim();
  if (customName) return customName;
  return `Event ${event.eventNumber}`;
}
