import { useMemo } from 'react';
import type { AdjustedScoringSettings, EventData, PlayerConfig, StandingEntry } from '../types/golf';
import { recalculateCumulativeStandings } from './parser';

/**
 * Returns a version of the events array where every inactive player has been
 * stripped out, then standings are fully recalculated so positions are
 * contiguous (1, 2, 3… with no gaps) based only on active players.
 */
export function useFilteredEvents(
  events: EventData[],
  config: PlayerConfig,
  adjustedScoring: AdjustedScoringSettings,
): EventData[] {
  return useMemo(() => {
    // Step 1: strip inactive players from every event's player list
    const stripped = events.map(ev => ({
      ...ev,
      players: ev.players.filter(p => config.active[p.playerName] !== false),
      // standings will be fully replaced in step 2
      standings: [] as StandingEntry[],
    }));

    // Step 2: recalculate cumulative standings using only the active players
    if (stripped.length === 0) return stripped;
    return recalculateCumulativeStandings(stripped, adjustedScoring);
  }, [events, config, adjustedScoring]);
}
