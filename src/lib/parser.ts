import type { EventData, PlayerEventData, StandingEntry } from '../types/golf';

/**
 * Parses the HTML from a golfsoftware.com player standings page.
 * The page contains a table where each row is a player.
 *
 * Column layout (0-indexed after position and name):
 *  0        = position
 *  1        = name
 *  2-10     = hole scores (holes 1-9), may be empty if DNP
 *  11       = gross score total
 *  12       = handicap
 *  13       = net score
 *  14       = points (event points, e.g. 300.00)
 *  15       = ? (bonus points)
 *  16       = ? (unknown col, usually 0.00)
 *  17       = ? (unknown col, usually 0)
 *  18       = ? (unknown col, usually 0)
 *  19       = eagles (front 9)
 *  20       = birdies (front 9)
 *  21       = pars (front 9)
 *  22       = bogeys (front 9)
 *  23       = double bogeys (front 9)
 *  24       = triple+ (front 9)
 *  25       = ? (unknown)
 *  26       = eagles (back 9)
 *  27       = birdies (back 9)
 *  28       = pars (back 9)
 *  29       = bogeys (back 9)
 *  30       = double bogeys (back 9)
 *  31       = triple+ (back 9)
 *
 * NOTE: We parse 9-hole leagues. The hole scores are columns 2-10 (9 holes).
 * Score type cols split front/back — we see only front 9 data here (cols 19-24).
 */

function parseNum(s: string | null | undefined): number | null {
  if (!s || s.trim() === '' || s.trim() === '&nbsp;') return null;
  const n = parseFloat(s.trim().replace(',', ''));
  return isNaN(n) ? null : n;
}

function parseIntSafe(s: string | null | undefined): number {
  const n = parseNum(s);
  return n !== null ? Math.round(n) : 0;
}

export function parseGolfSoftwareHTML(html: string): Omit<EventData, 'id'> | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Extract event info from title/header
    const titleEl = doc.querySelector('title, h1, h2');
    let leagueTitle = titleEl?.textContent?.trim() ?? 'Golf League';
    
    // Try to find event number and date from the page header
    let eventNumber = 1;
    let eventDate = '';
    
    // Look for text like "Event 1 on 4/22/2025"
    const bodyText = doc.body?.textContent ?? '';
    const eventMatch = bodyText.match(/Event\s+(\d+)\s+on\s+([\d/]+)/i);
    if (eventMatch) {
      eventNumber = parseInt(eventMatch[1], 10);
      eventDate = eventMatch[2];
    }

    // Also try to grab from the page heading
    const headingMatch = leagueTitle.match(/Event\s+(\d+)/i);
    if (headingMatch) {
      eventNumber = parseInt(headingMatch[1], 10);
    }

    // Detect which nine was played
    // Signal 1: course name contains "(Back)" or "(Front)"
    // Signal 2: table header row contains hole number "10" as the first hole column
    let nineHoles: 'front' | 'back' = 'front';

    const backCourseMatch = bodyText.match(/\(Back\)/i);
    const frontCourseMatch = bodyText.match(/\(Front\)/i);
    if (backCourseMatch) nineHoles = 'back';
    else if (frontCourseMatch) nineHoles = 'front';

    // Find the main data table — look for table rows with many cells
    const allRows = Array.from(doc.querySelectorAll('tr'));

    // Refine nine-holes detection from table header rows (most reliable signal)
    // Look for a row where the 3rd cell (index 2) is "10" (back) or "1" (front)
    for (const row of allRows) {
      const cells = Array.from(row.querySelectorAll('th, td'));
      if (cells.length < 11) continue;
      const firstHoleCell = cells[2]?.textContent?.trim();
      if (firstHoleCell === '10') { nineHoles = 'back'; break; }
      if (firstHoleCell === '1')  { nineHoles = 'front'; break; }
    }

    const players: PlayerEventData[] = [];

    for (const row of allRows) {
      const cells = Array.from(row.querySelectorAll('td'));
      if (cells.length < 14) continue;

      const cellTexts = cells.map(c => c.textContent?.trim() ?? '');

      // First cell should be a position number or rank
      const posRaw = cellTexts[0];
      const posNum = parseInt(posRaw, 10);
      if (isNaN(posNum)) continue;

      // Second cell should be player name (Last, First format)
      const name = cellTexts[1];
      if (!name || name.length < 2) continue;
      // Skip header/total rows
      if (name.toLowerCase().includes('total') || name.toLowerCase().includes('average')) continue;

      // Holes 1-9 (cells 2-10)
      const holes: (number | null)[] = [];
      for (let h = 2; h <= 10; h++) {
        holes.push(parseNum(cellTexts[h]));
      }

      const grossScore = parseNum(cellTexts[11]);
      const handicap = parseIntSafe(cellTexts[12]);
      const netScore = parseNum(cellTexts[13]);
      const points = parseNum(cellTexts[14]) ?? 0;
      const bonusPoints = parseNum(cellTexts[15]) ?? 0;

      // Score type columns — front 9 (cols 19-24 in original)
      // After re-mapping with 0-index: col indices from our cellTexts
      // Based on observed data: position(0), name(1), h1-h9(2-10), gross(11), hcp(12), net(13),
      // points(14), bonus(15), col16(0.00), col17(0), col18(0),
      // eagles_front(19), birdies_front(20), pars_front(21), bogeys_front(22), dbl_front(23), trpl_front(24),
      // col25, eagles_back(26)... 
      // We sum front + back for each category
      const eagles = parseIntSafe(cellTexts[19]) + parseIntSafe(cellTexts[26]);
      const birdies = parseIntSafe(cellTexts[20]) + parseIntSafe(cellTexts[27]);
      const pars = parseIntSafe(cellTexts[21]) + parseIntSafe(cellTexts[28]);
      const bogeys = parseIntSafe(cellTexts[22]) + parseIntSafe(cellTexts[29]);
      const doubleBogeys = parseIntSafe(cellTexts[23]) + parseIntSafe(cellTexts[30]);
      const tripleBogeys = parseIntSafe(cellTexts[24]) + parseIntSafe(cellTexts[31]);
      const other = 0; // not separately tracked

      const didNotPlay = holes.every(h => h === null) && grossScore === null;

      players.push({
        position: posNum,
        playerName: name,
        holes,
        grossScore,
        handicap,
        netScore,
        points,
        bonusPoints,
        totalPoints: points, // will be set correctly after sorting
        eagles,
        birdies,
        pars,
        bogeys,
        doubleBogeys,
        tripleBogeys,
        other,
        didNotPlay,
      });
    }

    if (players.length === 0) return null;

    // Build standings from this event (sorted by points desc)
    const played = players
      .filter(p => !p.didNotPlay)
      .sort((a, b) => b.points - a.points);

    const standings: StandingEntry[] = played.map((p, i) => ({
      playerName: p.playerName,
      cumulativePoints: p.points,
      position: i + 1,
    }));

    return {
      eventNumber,
      eventDate,
      nineHoles, // auto-detected from HTML; can be overridden in AddEventModal
      players,
      standings,
    };
  } catch (err) {
    console.error('Failed to parse golf software HTML:', err);
    return null;
  }
}

/**
 * After all events are loaded, recalculate cumulative standings per event.
 * Returns updated standings arrays (one per event) based on sum of points.
 */
export function recalculateCumulativeStandings(events: EventData[]): EventData[] {
  const sorted = [...events].sort((a, b) => a.eventNumber - b.eventNumber);

  // cumulativePoints only gains an entry the first time a player actually plays.
  // Players who have never played any event never appear here.
  const cumulativePoints: Record<string, number> = {};

  return sorted.map(event => {
    // Add this event's points — this also introduces new players on their debut
    for (const player of event.players) {
      if (!player.didNotPlay) {
        cumulativePoints[player.playerName] =
          (cumulativePoints[player.playerName] ?? 0) + player.points;
      }
    }

    // Sort: by cumulative points desc, then alphabetically for ties
    const entries = Object.entries(cumulativePoints)
      .sort(([nameA, a], [nameB, b]) => b - a || nameA.localeCompare(nameB));

    // Assign positions — players tied on the same points share a rank
    const standings: StandingEntry[] = [];
    let pos = 1;
    for (let i = 0; i < entries.length; i++) {
      if (i > 0 && entries[i][1] !== entries[i - 1][1]) {
        pos = i + 1;
      }
      standings.push({
        playerName: entries[i][0],
        cumulativePoints: entries[i][1],
        position: pos,
      });
    }

    // Update totalPoints on each player for this event snapshot
    const players = event.players.map(p => ({
      ...p,
      totalPoints: cumulativePoints[p.playerName] ?? 0,
    }));

    return { ...event, players, standings };
  });
}
