import type { CourseConfig, LeagueYardageBandSettings, YardageBandThresholds } from '../types/golf';

export type YardageBandKey = 'short' | 'mid' | 'long' | 'xlong';

export const YARDAGE_BANDS: Array<{ key: YardageBandKey; label: string }> = [
  { key: 'short', label: 'Short' },
  { key: 'mid', label: 'Mid' },
  { key: 'long', label: 'Long' },
  { key: 'xlong', label: 'X-Long' },
];

export const DEFAULT_YARDAGE_BAND_SETTINGS: LeagueYardageBandSettings = {
  mode: 'manual',
  par3: { shortMax: 140, midMax: 170, longMax: 200 },
  par4: { shortMax: 320, midMax: 380, longMax: 430 },
  par5: { shortMax: 470, midMax: 530, longMax: 590 },
};

function normalizeThresholds(input: Partial<YardageBandThresholds> | undefined, fallback: YardageBandThresholds): YardageBandThresholds {
  const shortMaxRaw = Number(input?.shortMax);
  const midMaxRaw = Number(input?.midMax);
  const longMaxRaw = Number(input?.longMax);

  const shortMax = Number.isFinite(shortMaxRaw) ? shortMaxRaw : fallback.shortMax;
  const midMax = Number.isFinite(midMaxRaw) ? midMaxRaw : fallback.midMax;
  const longMax = Number.isFinite(longMaxRaw) ? longMaxRaw : fallback.longMax;

  // Ensure strict ascending thresholds with a minimum 1-yard gap.
  const safeShortMax = Math.max(1, Math.round(shortMax));
  const safeMidMax = Math.max(safeShortMax + 1, Math.round(midMax));
  const safeLongMax = Math.max(safeMidMax + 1, Math.round(longMax));
  return { shortMax: safeShortMax, midMax: safeMidMax, longMax: safeLongMax };
}

export function normalizeYardageBandSettings(settings: Partial<LeagueYardageBandSettings> | null | undefined): LeagueYardageBandSettings {
  return {
    mode: settings?.mode === 'auto' ? 'auto' : 'manual',
    par3: normalizeThresholds(settings?.par3, DEFAULT_YARDAGE_BAND_SETTINGS.par3),
    par4: normalizeThresholds(settings?.par4, DEFAULT_YARDAGE_BAND_SETTINGS.par4),
    par5: normalizeThresholds(settings?.par5, DEFAULT_YARDAGE_BAND_SETTINGS.par5),
  };
}

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const clampedQ = Math.max(0, Math.min(1, q));
  const idx = (sorted.length - 1) * clampedQ;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

function deriveThresholdsFromYardages(values: number[], fallback: YardageBandThresholds): YardageBandThresholds {
  const valid = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (valid.length < 4) return fallback;

  const shortMax = Math.round((quantile(valid, 0.25) ?? fallback.shortMax) + 1);
  const midMax = Math.round((quantile(valid, 0.5) ?? fallback.midMax) + 1);
  const longMax = Math.round((quantile(valid, 0.75) ?? fallback.longMax) + 1);

  return normalizeThresholds({ shortMax, midMax, longMax }, fallback);
}

export function buildAutomaticYardageBandSettings(
  courseConfig: CourseConfig | null,
  fallbackSettings: LeagueYardageBandSettings = DEFAULT_YARDAGE_BAND_SETTINGS,
): LeagueYardageBandSettings {
  if (!courseConfig) return normalizeYardageBandSettings({ ...fallbackSettings, mode: 'auto' });

  const par3: number[] = [];
  const par4: number[] = [];
  const par5: number[] = [];

  for (const hole of courseConfig.holes ?? []) {
    const yardage = hole?.yardage;
    if (!Number.isFinite(yardage) || (yardage ?? 0) <= 0) continue;
    if ((hole?.par ?? 4) <= 3) {
      par3.push(yardage as number);
    } else if ((hole?.par ?? 4) >= 5) {
      par5.push(yardage as number);
    } else {
      par4.push(yardage as number);
    }
  }

  return {
    mode: 'auto',
    par3: deriveThresholdsFromYardages(par3, fallbackSettings.par3),
    par4: deriveThresholdsFromYardages(par4, fallbackSettings.par4),
    par5: deriveThresholdsFromYardages(par5, fallbackSettings.par5),
  };
}

export function resolveYardageBandSettings(
  settings: LeagueYardageBandSettings,
  courseConfig: CourseConfig | null,
): LeagueYardageBandSettings {
  const normalized = normalizeYardageBandSettings(settings);
  if (normalized.mode !== 'auto') return normalized;
  return buildAutomaticYardageBandSettings(courseConfig, normalized);
}

function getThresholdsByPar(par: number, settings: LeagueYardageBandSettings): YardageBandThresholds {
  if (par <= 3) return settings.par3;
  if (par >= 5) return settings.par5;
  return settings.par4;
}

export function getYardageBandKey(yardage: number, par: number, settings: LeagueYardageBandSettings = DEFAULT_YARDAGE_BAND_SETTINGS): YardageBandKey {
  const thresholds = getThresholdsByPar(par, settings);
  if (yardage < thresholds.shortMax) return 'short';
  if (yardage < thresholds.midMax) return 'mid';
  if (yardage < thresholds.longMax) return 'long';
  return 'xlong';
}

export function getYardageBandDescription(key: YardageBandKey, settings: LeagueYardageBandSettings = DEFAULT_YARDAGE_BAND_SETTINGS): string {
  const p3 = settings.par3;
  const p4 = settings.par4;
  const p5 = settings.par5;

  if (key === 'short') {
    return `P3 <${p3.shortMax} | P4 <${p4.shortMax} | P5 <${p5.shortMax}`;
  }
  if (key === 'mid') {
    return `P3 ${p3.shortMax}-${p3.midMax - 1} | P4 ${p4.shortMax}-${p4.midMax - 1} | P5 ${p5.shortMax}-${p5.midMax - 1}`;
  }
  if (key === 'long') {
    return `P3 ${p3.midMax}-${p3.longMax - 1} | P4 ${p4.midMax}-${p4.longMax - 1} | P5 ${p5.midMax}-${p5.longMax - 1}`;
  }
  return `P3 ${p3.longMax}+ | P4 ${p4.longMax}+ | P5 ${p5.longMax}+`;
}
