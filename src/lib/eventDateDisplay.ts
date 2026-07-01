import type { EventDateDisplaySettings } from '../types/golf';

export const DEFAULT_EVENT_DATE_DISPLAY: EventDateDisplaySettings = {
  showDate: true,
  showTime: false,
  dateFormat: 'M/D/YYYY',
  timeFormat: '12h',
};

let currentSettings: EventDateDisplaySettings = { ...DEFAULT_EVENT_DATE_DISPLAY };

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDatePart(date: Date, format: EventDateDisplaySettings['dateFormat']): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();

  if (format === 'M/D/YYYY') return `${m}/${d}/${y}`;
  if (format === 'MM/DD/YYYY') return `${pad2(m)}/${pad2(d)}/${y}`;
  if (format === 'MMM D, YYYY') return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
  if (format === 'D MMM YYYY') return `${d} ${MONTHS_SHORT[m - 1]} ${y}`;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function formatTimePart(date: Date, format: EventDateDisplaySettings['timeFormat']): string {
  const minutes = pad2(date.getMinutes());
  if (format === '24h') {
    return `${pad2(date.getHours())}:${minutes}`;
  }

  const h = date.getHours();
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${minutes} ${suffix}`;
}

function parseDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function setEventDateDisplaySettings(settings: EventDateDisplaySettings): void {
  currentSettings = { ...settings };
}

export function formatEventDateDisplay(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';

  const { showDate, showTime, dateFormat, timeFormat } = currentSettings;
  if (!showDate && !showTime) return '';

  const parsed = parseDate(raw);
  if (!parsed) return raw;

  const datePart = showDate ? formatDatePart(parsed, dateFormat) : '';
  const timePart = showTime ? formatTimePart(parsed, timeFormat) : '';
  return [datePart, timePart].filter(Boolean).join(' ');
}
