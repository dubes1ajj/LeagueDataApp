import type { EventData } from '../types/golf';

export const EVENT_COLOR_PALETTE = [
  '#4f8ef7', '#22c55e', '#f59e0b', '#a855f7', '#ef4444',
  '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
] as const;

export function getDefaultEventColor(eventId: string, events: EventData[]): string {
  const sorted = [...events].sort((a, b) => a.eventNumber - b.eventNumber);
  const index = sorted.findIndex((event) => event.id === eventId);
  const paletteIndex = index >= 0 ? index % EVENT_COLOR_PALETTE.length : 0;
  return EVENT_COLOR_PALETTE[paletteIndex];
}
