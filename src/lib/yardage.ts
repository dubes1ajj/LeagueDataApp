import type { LeagueYardageBandSettings, YardageBandThresholds } from '../types/golf';

export type YardageBandKey = 'short' | 'mid' | 'long' | 'xlong';

export const YARDAGE_BANDS: Array<{ key: YardageBandKey; label: string }> = [
  { key: 'short', label: 'Short' },
  { key: 'mid', label: 'Mid' },
  { key: 'long', label: 'Long' },
  { key: 'xlong', label: 'X-Long' },
];

export const DEFAULT_YARDAGE_BAND_SETTINGS: LeagueYardageBandSettings = {
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
    par3: normalizeThresholds(settings?.par3, DEFAULT_YARDAGE_BAND_SETTINGS.par3),
    par4: normalizeThresholds(settings?.par4, DEFAULT_YARDAGE_BAND_SETTINGS.par4),
    par5: normalizeThresholds(settings?.par5, DEFAULT_YARDAGE_BAND_SETTINGS.par5),
  };
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
