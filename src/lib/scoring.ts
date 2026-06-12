import type { CourseConfig, HoleInfo } from '../types/golf';

export interface ScoreBreakdown {
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubleBogeys: number;
  tripleBogeys: number;
  other: number;
}

/**
 * Compute score-type breakdown from raw hole scores and the par values for
 * those holes. holeScores and parValues must be the same length (9 entries).
 */
export function computeBreakdown(
  holeScores: (number | null)[],
  parValues: number[]
): ScoreBreakdown {
  let eagles = 0, birdies = 0, pars = 0, bogeys = 0,
      doubleBogeys = 0, tripleBogeys = 0, other = 0;

  for (let i = 0; i < Math.min(holeScores.length, parValues.length); i++) {
    const score = holeScores[i];
    const par = parValues[i];
    if (score === null || score === undefined || !par) continue;

    const diff = score - par;
    if (diff <= -2)      eagles++;
    else if (diff === -1) birdies++;
    else if (diff === 0)  pars++;
    else if (diff === 1)  bogeys++;
    else if (diff === 2)  doubleBogeys++;
    else if (diff === 3)  tripleBogeys++;
    else                  other++;
  }

  return { eagles, birdies, pars, bogeys, doubleBogeys, tripleBogeys, other };
}

/**
 * Extract the 9 par values for the given nine from a CourseConfig.
 */
export function getParsForNine(config: CourseConfig, nine: 'front' | 'back'): number[] {
  const start = nine === 'front' ? 0 : 9;
  return config.holes.slice(start, start + 9).map(h => h.par);
}

/**
 * Build a blank 18-hole CourseConfig with all pars defaulting to 4.
 */
export function defaultCourseConfig(): CourseConfig {
  return {
    courseName: '',
    holes: Array.from({ length: 18 }, (_, i): HoleInfo => ({
      hole: i + 1,
      par: 4,
      yardage: undefined,
      strokeIndex: undefined,
    })),
  };
}
