import * as XLSX from 'xlsx';
import type { CourseConfig, EventData, LeagueData, PlayerConfig, PlayerEventData } from '../types/golf';
import { applyAutoHide } from './storage';
import { computeBreakdown, getParsForNine } from './scoring';
import { recalculateCumulativeStandings } from './parser';

type NineHoles = 'front' | 'back';
export type WorkbookLayout = 'event-sheets' | 'player-sheets' | 'unknown';
export type PlayerSheetMappingMode = 'auto' | 'manual';

export interface ManualPlayerSheetMapping {
  eventAxis: 'rows' | 'columns';
  eventStart: string;
  eventEnd: string;
  playerNameCell: string;
  eventNumberLine: string;
  eventDateLine: string;
  nineLine: string;
  grossFrontLine: string;
  grossBackLine: string;
  handicapFrontLine: string;
  handicapBackLine: string;
  netLine: string;
  pointsLine: string;
  bonusLine: string;
  frontHoleStartLine: string;
  frontHoleEndLine: string;
  backHoleStartLine: string;
  backHoleEndLine: string;
}

export interface PlayerSheetImportOptions {
  mappingMode: PlayerSheetMappingMode;
  grossScoreSource: 'auto' | 'calculate' | 'front' | 'back';
  handicapSource: 'auto' | 'front' | 'back';
  netScoreSource: 'auto' | 'calculate' | 'mapped';
  manualMapping: ManualPlayerSheetMapping | null;
}

export interface ExcelImportOptions {
  playerSheets?: PlayerSheetImportOptions;
}

export interface PlayerSheetPreviewColumn {
  index: number;
  letter: string;
  headerValue: string;
}

export interface PlayerSheetPreviewRow {
  rowNumber: number;
  cells: string[];
}

export interface PlayerSheetParsedPreviewRow {
  rowNumber: number;
  eventNumber: number | null;
  eventDate: string;
  nineHoles: NineHoles;
  holes: Array<number | null>;
  grossScore: number | null;
  handicap: number;
  netScore: number | null;
  points: number;
  bonusPoints: number;
}

export interface PlayerSheetMappingPreview {
  sheetName: string;
  status: 'ready' | 'needs-review' | 'invalid';
  availableColumns: PlayerSheetPreviewColumn[];
  sampleColumns: PlayerSheetPreviewColumn[];
  sampleRows: PlayerSheetPreviewRow[];
  detectedMapping: ManualPlayerSheetMapping | null;
  activeMapping: ManualPlayerSheetMapping | null;
  activeMappingSummary: string | null;
  parsedRows: PlayerSheetParsedPreviewRow[];
  warnings: string[];
}

interface PlayerSheetColumnMap {
  headerRowIndex: number;
  eventStartRowIndex: number | null;
  eventEndRowIndex: number | null;
  eventNumberCol: number | null;
  eventDateCol: number | null;
  nineCol: number | null;
  grossCols: number[];
  grossColBySide: Record<NineHoles, number | null>;
  handicapCols: number[];
  handicapColBySide: Record<NineHoles, number | null>;
  netCol: number | null;
  pointsCol: number | null;
  bonusCol: number | null;
  holeCols: Array<{ hole: number; col: number }>;
  confidence: number;
}

interface EventDraft {
  eventNumber: number;
  eventDate: string;
  nineHoles: NineHoles;
  players: PlayerEventData[];
}

interface PlayerSheetParseResult {
  events: EventDraft[];
  warnings: string[];
  rowCount: number;
  mappingSummary: string | null;
}

export interface ExcelSheetPreview {
  sheetName: string;
  rowCount: number;
  candidateRows: number;
  layoutHint: WorkbookLayout;
  mappingSummary: string | null;
  eventNumber: number | null;
  eventDate: string | null;
  nineHoles: NineHoles | null;
  status: 'ready' | 'needs-review' | 'invalid';
  warnings: string[];
}

export interface ExcelWorkbookPreview {
  sheetNames: string[];
  detectedLayout: WorkbookLayout;
  sheets: ExcelSheetPreview[];
}

export interface ExcelImportResult {
  league: LeagueData;
  playerConfig: PlayerConfig;
  importedSheets: string[];
  warnings: string[];
}

const DEFAULT_PLAYER_SHEET_IMPORT_OPTIONS: PlayerSheetImportOptions = {
  mappingMode: 'auto',
  grossScoreSource: 'auto',
  handicapSource: 'auto',
  netScoreSource: 'auto',
  manualMapping: null,
};

export function createEmptyManualPlayerSheetMapping(): ManualPlayerSheetMapping {
  return {
    eventAxis: 'rows',
    eventStart: '',
    eventEnd: '',
    playerNameCell: '',
    eventNumberLine: '',
    eventDateLine: '',
    nineLine: '',
    grossFrontLine: '',
    grossBackLine: '',
    handicapFrontLine: '',
    handicapBackLine: '',
    netLine: '',
    pointsLine: '',
    bonusLine: '',
    frontHoleStartLine: '',
    frontHoleEndLine: '',
    backHoleStartLine: '',
    backHoleEndLine: '',
  };
}

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseNumericCell(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = normalizeCell(value).replace(/,/g, '');
  if (!text) return null;
  const numeric = Number.parseFloat(text);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseIntegerCell(value: unknown): number {
  const numeric = parseNumericCell(value);
  return numeric === null ? 0 : Math.round(numeric);
}

function columnIndexToLetter(index: number): string {
  let n = index + 1;
  let output = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    output = String.fromCharCode(65 + rem) + output;
    n = Math.floor((n - 1) / 26);
  }
  return output;
}

function columnLetterToIndex(value: string): number | null {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(normalized)) return null;

  let result = 0;
  for (const char of normalized) {
    result = (result * 26) + (char.charCodeAt(0) - 64);
  }

  return result - 1;
}

function optionalColumnLetter(index: number | null): string {
  return index === null ? '' : columnIndexToLetter(index);
}

function rowNumberToIndex(value: string): number | null {
  const numeric = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric - 1;
}

function optionalRowNumber(index: number | null): string {
  return index === null ? '' : String(index + 1);
}

function parseCellAddress(address: string): { rowIndex: number; colIndex: number } | null {
  const normalized = address.trim().toUpperCase();
  const match = normalized.match(/^([A-Z]+)(\d+)$/);
  if (!match) return null;
  const colIndex = columnLetterToIndex(match[1]);
  const rowIndex = rowNumberToIndex(match[2]);
  if (colIndex === null || rowIndex === null) return null;
  return { rowIndex, colIndex };
}

function transposeRows(rows: unknown[][]): unknown[][] {
  const width = Math.max(0, ...rows.map((row) => row.length));
  return Array.from({ length: width }, (_, colIndex) => (
    Array.from({ length: rows.length }, (_, rowIndex) => rows[rowIndex]?.[colIndex] ?? '')
  ));
}

function parseDateCell(value: string): Date | null {
  if (!value) return null;
  const normalized = value.trim();
  const slashMatch = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (slashMatch) {
    const month = Number.parseInt(slashMatch[1], 10);
    const day = Number.parseInt(slashMatch[2], 10);
    const rawYear = Number.parseInt(slashMatch[3], 10);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const dt = new Date(year, month - 1, day);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeHeaderCell(value: unknown): string {
  return normalizeCell(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function detectNineFromText(value: unknown): NineHoles | null {
  const text = normalizeCell(value).toLowerCase();
  if (!text) return null;
  if (text.includes('back') || text === 'b' || text === '10-18') return 'back';
  if (text.includes('front') || text === 'f' || text === '1-9') return 'front';
  return null;
}

function detectEventNumber(sheetName: string, fallback: number): number {
  const matches = sheetName.match(/\b(\d{1,4})\b/g);
  if (!matches?.length) return fallback;
  const candidate = Number.parseInt(matches[matches.length - 1], 10);
  return Number.isFinite(candidate) ? candidate : fallback;
}

function detectEventDate(sheetName: string): string | null {
  const dateMatch = sheetName.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/);
  return dateMatch?.[1] ?? null;
}

function detectNineHoles(sheetName: string, rows: unknown[][]): NineHoles | null {
  if (/\bback\b/i.test(sheetName)) return 'back';
  if (/\bfront\b/i.test(sheetName)) return 'front';

  for (const row of rows.slice(0, 12)) {
    const firstHole = normalizeCell(row[2]);
    if (firstHole === '10') return 'back';
    if (firstHole === '1') return 'front';
  }

  return null;
}

function parseHoleNumberFromHeader(header: string): number | null {
  if (!header) return null;

  if (/^h([1-9]|1[0-8])$/.test(header)) {
    return Number.parseInt(header.slice(1), 10);
  }
  if (/^hole([1-9]|1[0-8])$/.test(header)) {
    return Number.parseInt(header.slice(4), 10);
  }
  if (/^([1-9]|1[0-8])$/.test(header)) {
    return Number.parseInt(header, 10);
  }

  return null;
}

function sumHoleScores(holes: Array<number | null>): number | null {
  const playedHoles = holes.filter((hole): hole is number => hole !== null);
  if (!playedHoles.length) return null;
  return playedHoles.reduce((total, hole) => total + hole, 0);
}

function uniqueColumns(columns: Array<number | null>): number[] {
  return Array.from(new Set(columns.filter((column): column is number => column !== null))).sort((a, b) => a - b);
}

function choosePlayerSheetSummaryColumn(
  candidateCols: number[],
  holeCols: Array<{ hole: number; col: number }>,
  nineHoles: NineHoles,
  preferredSide: 'auto' | 'front' | 'back',
): number | null {
  if (!candidateCols.length) return null;

  const sortedCandidates = [...candidateCols].sort((a, b) => a - b);
  const sideToUse = preferredSide === 'auto' ? nineHoles : preferredSide;
  const sideHoleCols = holeCols
    .filter(({ hole }) => (sideToUse === 'front' ? hole >= 1 && hole <= 9 : hole >= 10 && hole <= 18))
    .map(({ col }) => col)
    .sort((a, b) => a - b);

  if (!sideHoleCols.length) {
    return sideToUse === 'back' ? sortedCandidates[sortedCandidates.length - 1] : sortedCandidates[0];
  }

  const lastHoleCol = sideHoleCols[sideHoleCols.length - 1];
  const firstCandidateAfterHoles = sortedCandidates.find((col) => col > lastHoleCol);
  if (firstCandidateAfterHoles !== undefined) return firstCandidateAfterHoles;

  return sideToUse === 'back' ? sortedCandidates[sortedCandidates.length - 1] : sortedCandidates[0];
}

function chooseSummaryColumnForSide(
  candidateCols: number[],
  holeCols: Array<{ hole: number; col: number }>,
  side: NineHoles,
): number | null {
  return choosePlayerSheetSummaryColumn(candidateCols, holeCols, side, side);
}

function buildHoleColumnRange(startCol: number | null, endCol: number | null, startingHole: number): Array<{ hole: number; col: number }> {
  if (startCol === null || endCol === null) return [];
  const minCol = Math.min(startCol, endCol);
  const maxCol = Math.max(startCol, endCol);
  return Array.from({ length: Math.min(9, maxCol - minCol + 1) }, (_, index) => ({
    hole: startingHole + index,
    col: minCol + index,
  }));
}

function parseManualEventIndex(mapping: ManualPlayerSheetMapping, value: string): number | null {
  return mapping.eventAxis === 'rows' ? rowNumberToIndex(value) : columnLetterToIndex(value);
}

function parseManualLineIndex(mapping: ManualPlayerSheetMapping, value: string): number | null {
  return mapping.eventAxis === 'rows' ? columnLetterToIndex(value) : rowNumberToIndex(value);
}

function buildManualPlayerSheetColumnMap(mapping: ManualPlayerSheetMapping): PlayerSheetColumnMap {
  const eventStartRowIndex = parseManualEventIndex(mapping, mapping.eventStart);
  const eventEndRowIndex = parseManualEventIndex(mapping, mapping.eventEnd);
  const grossFrontCol = parseManualLineIndex(mapping, mapping.grossFrontLine);
  const grossBackCol = parseManualLineIndex(mapping, mapping.grossBackLine);
  const handicapFrontCol = parseManualLineIndex(mapping, mapping.handicapFrontLine);
  const handicapBackCol = parseManualLineIndex(mapping, mapping.handicapBackLine);
  const frontHoleCols = buildHoleColumnRange(
    parseManualLineIndex(mapping, mapping.frontHoleStartLine),
    parseManualLineIndex(mapping, mapping.frontHoleEndLine),
    1,
  );
  const backHoleCols = buildHoleColumnRange(
    parseManualLineIndex(mapping, mapping.backHoleStartLine),
    parseManualLineIndex(mapping, mapping.backHoleEndLine),
    10,
  );
  const holeCols = [...frontHoleCols, ...backHoleCols].sort((a, b) => a.hole - b.hole);
  const headerRowIndex = eventStartRowIndex !== null ? Math.max(0, eventStartRowIndex - 1) : 0;

  let confidence = 0;
  if (parseManualLineIndex(mapping, mapping.eventNumberLine) !== null) confidence += 4;
  if (holeCols.length >= 9) confidence += 3;
  if (grossFrontCol !== null || grossBackCol !== null || parseManualLineIndex(mapping, mapping.netLine) !== null || parseManualLineIndex(mapping, mapping.pointsLine) !== null) confidence += 2;
  if (parseManualLineIndex(mapping, mapping.eventDateLine) !== null) confidence += 1;
  if (parseManualLineIndex(mapping, mapping.nineLine) !== null) confidence += 1;

  return {
    headerRowIndex,
    eventStartRowIndex,
    eventEndRowIndex,
    eventNumberCol: parseManualLineIndex(mapping, mapping.eventNumberLine),
    eventDateCol: parseManualLineIndex(mapping, mapping.eventDateLine),
    nineCol: parseManualLineIndex(mapping, mapping.nineLine),
    grossCols: uniqueColumns([grossFrontCol, grossBackCol]),
    grossColBySide: { front: grossFrontCol, back: grossBackCol },
    handicapCols: uniqueColumns([handicapFrontCol, handicapBackCol]),
    handicapColBySide: { front: handicapFrontCol, back: handicapBackCol },
    netCol: parseManualLineIndex(mapping, mapping.netLine),
    pointsCol: parseManualLineIndex(mapping, mapping.pointsLine),
    bonusCol: parseManualLineIndex(mapping, mapping.bonusLine),
    holeCols,
    confidence,
  };
}

function serializePlayerSheetColumnMap(map: PlayerSheetColumnMap): ManualPlayerSheetMapping {
  const frontHoleCols = map.holeCols.filter((item) => item.hole >= 1 && item.hole <= 9).sort((a, b) => a.hole - b.hole);
  const backHoleCols = map.holeCols.filter((item) => item.hole >= 10 && item.hole <= 18).sort((a, b) => a.hole - b.hole);
  return {
    eventAxis: 'rows',
    eventStart: optionalRowNumber(map.eventStartRowIndex ?? map.headerRowIndex + 1),
    eventEnd: optionalRowNumber(map.eventEndRowIndex),
    playerNameCell: 'A1',
    eventNumberLine: optionalColumnLetter(map.eventNumberCol),
    eventDateLine: optionalColumnLetter(map.eventDateCol),
    nineLine: optionalColumnLetter(map.nineCol),
    grossFrontLine: optionalColumnLetter(map.grossColBySide.front ?? chooseSummaryColumnForSide(map.grossCols, map.holeCols, 'front')),
    grossBackLine: optionalColumnLetter(map.grossColBySide.back ?? chooseSummaryColumnForSide(map.grossCols, map.holeCols, 'back')),
    handicapFrontLine: optionalColumnLetter(map.handicapColBySide.front ?? chooseSummaryColumnForSide(map.handicapCols, map.holeCols, 'front')),
    handicapBackLine: optionalColumnLetter(map.handicapColBySide.back ?? chooseSummaryColumnForSide(map.handicapCols, map.holeCols, 'back')),
    netLine: optionalColumnLetter(map.netCol),
    pointsLine: optionalColumnLetter(map.pointsCol),
    bonusLine: optionalColumnLetter(map.bonusCol),
    frontHoleStartLine: optionalColumnLetter(frontHoleCols[0]?.col ?? null),
    frontHoleEndLine: optionalColumnLetter(frontHoleCols[frontHoleCols.length - 1]?.col ?? null),
    backHoleStartLine: optionalColumnLetter(backHoleCols[0]?.col ?? null),
    backHoleEndLine: optionalColumnLetter(backHoleCols[backHoleCols.length - 1]?.col ?? null),
  };
}

function mergePlayerSheetImportOptions(importOptions?: PlayerSheetImportOptions): PlayerSheetImportOptions {
  return {
    ...DEFAULT_PLAYER_SHEET_IMPORT_OPTIONS,
    ...importOptions,
    manualMapping: importOptions?.manualMapping ?? DEFAULT_PLAYER_SHEET_IMPORT_OPTIONS.manualMapping,
  };
}

function resolvePlayerSheetColumnMap(
  rows: unknown[][],
  importOptions: PlayerSheetImportOptions,
): { map: PlayerSheetColumnMap | null; rows: unknown[][]; playerName: string | null; warnings: string[] } {
  if (importOptions.mappingMode === 'manual') {
    if (!importOptions.manualMapping) {
      return {
        map: null,
        rows,
        playerName: null,
        warnings: ['Manual mapping mode is enabled, but no manual mapping is configured.'],
      };
    }

    const normalizedRows = importOptions.manualMapping.eventAxis === 'columns' ? transposeRows(rows) : rows;
    const manualMap = buildManualPlayerSheetColumnMap(importOptions.manualMapping);
    const playerNameCell = parseCellAddress(importOptions.manualMapping.playerNameCell);
    const playerName = playerNameCell ? normalizeCell(rows[playerNameCell.rowIndex]?.[playerNameCell.colIndex]) : null;
    const warnings: string[] = [];
    if (manualMap.holeCols.length < 9) {
      warnings.push('Manual mapping needs at least 9 hole cells in one hole range.');
    }
    return { map: manualMap, rows: normalizedRows, playerName, warnings };
  }

  return { map: detectPlayerSheetColumnMap(rows), rows, playerName: null, warnings: [] };
}

function resolvePlayerSheetGrossScore(
  row: unknown[],
  map: PlayerSheetColumnMap,
  holes: Array<number | null>,
  nineHoles: NineHoles,
  options: PlayerSheetImportOptions,
): number | null {
  const calculatedGross = sumHoleScores(holes);
  if (options.grossScoreSource === 'calculate') return calculatedGross;

  const selectedCol = options.grossScoreSource === 'front'
    ? map.grossColBySide.front ?? chooseSummaryColumnForSide(map.grossCols, map.holeCols, 'front')
    : options.grossScoreSource === 'back'
      ? map.grossColBySide.back ?? chooseSummaryColumnForSide(map.grossCols, map.holeCols, 'back')
      : map.grossColBySide[nineHoles] ?? choosePlayerSheetSummaryColumn(
        map.grossCols,
        map.holeCols,
        nineHoles,
        options.grossScoreSource,
      );
  const sheetGross = selectedCol !== null ? parseNumericCell(row[selectedCol]) : null;

  if (sheetGross !== null) return sheetGross;
  return calculatedGross;
}

function resolvePlayerSheetHandicap(
  row: unknown[],
  map: PlayerSheetColumnMap,
  nineHoles: NineHoles,
  options: PlayerSheetImportOptions,
): number {
  const selectedCol = options.handicapSource === 'front'
    ? map.handicapColBySide.front ?? chooseSummaryColumnForSide(map.handicapCols, map.holeCols, 'front')
    : options.handicapSource === 'back'
      ? map.handicapColBySide.back ?? chooseSummaryColumnForSide(map.handicapCols, map.holeCols, 'back')
      : map.handicapColBySide[nineHoles] ?? choosePlayerSheetSummaryColumn(
        map.handicapCols,
        map.holeCols,
        nineHoles,
        options.handicapSource,
      );
  return selectedCol !== null ? parseIntegerCell(row[selectedCol]) : 0;
}

function resolvePlayerSheetNetScore(
  row: unknown[],
  map: PlayerSheetColumnMap,
  grossScore: number | null,
  handicap: number,
  options: PlayerSheetImportOptions,
): number | null {
  const mappedNet = map.netCol !== null ? parseNumericCell(row[map.netCol]) : null;
  const calculatedNet = grossScore !== null ? grossScore - handicap : null;

  if (options.netScoreSource === 'mapped') return mappedNet;
  if (options.netScoreSource === 'calculate') return calculatedNet;

  return mappedNet ?? calculatedNet;
}

function detectPlayerSheetColumnMap(rows: unknown[][]): PlayerSheetColumnMap | null {
  const maxHeaderSearchRows = Math.min(rows.length, 25);
  let best: PlayerSheetColumnMap | null = null;

  const inferColumnByLabels = (labels: string[]): number | null => {
    for (let rowIndex = 0; rowIndex < maxHeaderSearchRows; rowIndex++) {
      const row = rows[rowIndex] ?? [];
      for (let col = 0; col < row.length; col++) {
        const cell = normalizeHeaderCell(row[col]);
        if (!cell) continue;
        if (labels.some((label) => cell === label || cell.includes(label))) {
          return col;
        }
      }
    }
    return null;
  };

  for (let rowIndex = 0; rowIndex < maxHeaderSearchRows; rowIndex++) {
    const row = rows[rowIndex] ?? [];
    if (!row.length) continue;

    const headerCells = row.map(normalizeHeaderCell);
    let eventNumberCol: number | null = null;
    let eventDateCol: number | null = null;
    let nineCol: number | null = null;
    const grossCols: number[] = [];
    const handicapCols: number[] = [];
    let netCol: number | null = null;
    let pointsCol: number | null = null;
    let bonusCol: number | null = null;
    const holeCols: Array<{ hole: number; col: number }> = [];

    headerCells.forEach((cell, col) => {
      if (!cell) return;

      const hole = parseHoleNumberFromHeader(cell);
      if (hole !== null) {
        holeCols.push({ hole, col });
        return;
      }

      if (eventNumberCol === null && (cell.includes('event') || cell.includes('week') || cell.includes('round'))) {
        eventNumberCol = col;
        return;
      }
      if (eventDateCol === null && cell.includes('date')) {
        eventDateCol = col;
        return;
      }
      if (nineCol === null && (cell.includes('nine') || cell.includes('side'))) {
        nineCol = col;
        return;
      }
      if (cell.includes('gross') || cell.includes('tot')) {
        grossCols.push(col);
        return;
      }
      if (cell.includes('handicap') || cell.includes('hc') || cell === 'hcp') {
        handicapCols.push(col);
        return;
      }
      if (netCol === null && cell.includes('net')) {
        netCol = col;
        return;
      }
      if (pointsCol === null && (cell === 'pts' || cell.includes('points'))) {
        pointsCol = col;
        return;
      }
      if (bonusCol === null && cell.includes('bonus')) {
        bonusCol = col;
      }
    });

    let confidence = 0;
    if (eventNumberCol !== null) confidence += 4;
    if (holeCols.length >= 9) confidence += 3;
    if (grossCols.length > 0 || netCol !== null || pointsCol !== null) confidence += 2;
    if (eventDateCol !== null) confidence += 1;
    if (nineCol !== null) confidence += 1;

    if (!best || confidence > best.confidence) {
      best = {
        headerRowIndex: rowIndex,
        eventStartRowIndex: null,
        eventEndRowIndex: null,
        eventNumberCol,
        eventDateCol,
        nineCol,
        grossCols,
        grossColBySide: { front: null, back: null },
        handicapCols,
        handicapColBySide: { front: null, back: null },
        netCol,
        pointsCol,
        bonusCol,
        holeCols,
        confidence,
      };
    }
  }

  if (!best) return null;

  if (best.eventNumberCol === null) {
    best.eventNumberCol = inferColumnByLabels(['week', 'event', 'round']);
  }
  if (best.eventDateCol === null) {
    best.eventDateCol = inferColumnByLabels(['date']);
  }
  if (best.pointsCol === null) {
    best.pointsCol = inferColumnByLabels(['pts', 'points']);
  }

  if (best.eventNumberCol !== null) {
    let firstEventRow: number | null = null;
    let lastEventRow: number | null = null;
    for (let rowIndex = best.headerRowIndex + 1; rowIndex < rows.length; rowIndex++) {
      const numeric = parseNumericCell(rows[rowIndex]?.[best.eventNumberCol]);
      if (numeric === null || Math.round(numeric) <= 0) continue;
      if (firstEventRow === null) firstEventRow = rowIndex;
      lastEventRow = rowIndex;
    }
    best.eventStartRowIndex = firstEventRow;
    best.eventEndRowIndex = lastEventRow;
  }

  let adjustedConfidence = 0;
  if (best.eventNumberCol !== null) adjustedConfidence += 4;
  if (best.holeCols.length >= 9) adjustedConfidence += 3;
  if (best.grossCols.length > 0 || best.netCol !== null || best.pointsCol !== null) adjustedConfidence += 2;
  if (best.eventDateCol !== null) adjustedConfidence += 1;
  if (best.nineCol !== null) adjustedConfidence += 1;
  best.confidence = adjustedConfidence;

  return best.confidence >= 5 && best.holeCols.length >= 9 ? best : null;
}

function summarizePlayerSheetMap(map: PlayerSheetColumnMap): string {
  const holeNumbers = map.holeCols.map((item) => item.hole);
  const hasFront = holeNumbers.some((hole) => hole >= 1 && hole <= 9);
  const hasBack = holeNumbers.some((hole) => hole >= 10 && hole <= 18);
  const grossSummary = map.grossCols.length > 0
    ? `Gross ${map.grossCols.map(columnIndexToLetter).join('/')}`
    : null;
  const handicapSummary = map.handicapCols.length > 0
    ? `HC ${map.handicapCols.map(columnIndexToLetter).join('/')}`
    : null;

  const parts = [
    `header row ${map.headerRowIndex + 1}`,
    map.eventNumberCol !== null ? `Week/Event ${columnIndexToLetter(map.eventNumberCol)}` : null,
    map.eventDateCol !== null ? `Date ${columnIndexToLetter(map.eventDateCol)}` : null,
    hasFront ? 'Front holes detected' : null,
    hasBack ? 'Back holes detected' : null,
    map.pointsCol !== null ? `Pts ${columnIndexToLetter(map.pointsCol)}` : null,
    grossSummary,
    handicapSummary,
    map.netCol !== null ? `Net ${columnIndexToLetter(map.netCol)}` : null,
  ].filter((part): part is string => !!part);

  return parts.join(' · ');
}

function buildHolesFromColumns(
  row: unknown[],
  holeCols: Array<{ hole: number; col: number }>,
  forcedNine: NineHoles | null,
): { nineHoles: NineHoles; holes: (number | null)[]; ambiguityWarning: string | null } | null {
  if (!holeCols.length) return null;

  const frontCols = holeCols.filter((h) => h.hole >= 1 && h.hole <= 9).sort((a, b) => a.hole - b.hole);
  const backCols = holeCols.filter((h) => h.hole >= 10 && h.hole <= 18).sort((a, b) => a.hole - b.hole);

  const frontScores = frontCols.map(({ col }) => parseNumericCell(row[col]));
  const backScores = backCols.map(({ col }) => parseNumericCell(row[col]));
  const frontHasData = frontScores.some((score) => score !== null);
  const backHasData = backScores.some((score) => score !== null);

  let nineHoles: NineHoles = forcedNine ?? 'front';
  let ambiguityWarning: string | null = null;

  if (!forcedNine) {
    if (frontHasData && !backHasData) nineHoles = 'front';
    else if (!frontHasData && backHasData) nineHoles = 'back';
    else if (frontHasData && backHasData) {
      nineHoles = 'front';
      ambiguityWarning = 'Both front and back hole columns contain scores; defaulted to front 9.';
    } else if (backCols.length >= 9 && frontCols.length < 9) {
      nineHoles = 'back';
    }
  }

  const colsForNine = nineHoles === 'back' && backCols.length >= 9
    ? backCols
    : frontCols.length >= 9
      ? frontCols
      : nineHoles === 'back'
        ? backCols
        : frontCols;

  if (!colsForNine.length) return null;

  const holes = Array.from({ length: 9 }, (_, index) => {
    const slot = colsForNine[index];
    return slot ? parseNumericCell(row[slot.col]) : null;
  });

  return { nineHoles, holes, ambiguityWarning };
}

function parsePlayerSheetRows(
  sheetName: string,
  rows: unknown[][],
  courseConfig: CourseConfig | null,
  importOptions: PlayerSheetImportOptions = DEFAULT_PLAYER_SHEET_IMPORT_OPTIONS,
): PlayerSheetParseResult {
  const options = mergePlayerSheetImportOptions(importOptions);
  const resolved = resolvePlayerSheetColumnMap(rows, options);
  const map = resolved.map;
  const sourceRows = resolved.rows;
  const warnings: string[] = [...resolved.warnings];
  if (!map) {
    return {
      events: [],
      warnings: warnings.length > 0 ? warnings : ['Could not detect player-sheet columns.'],
      rowCount: 0,
      mappingSummary: null,
    };
  }

  const playerName = resolved.playerName || sheetName;
  const eventMap = new Map<number, EventDraft>();
  let parsedRows = 0;
  let skippedFutureRows = 0;
  const mappingSummary = summarizePlayerSheetMap(map);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const rowStart = Math.max(map.headerRowIndex + 1, map.eventStartRowIndex ?? map.headerRowIndex + 1);
  const rowEndExclusive = map.eventEndRowIndex !== null ? Math.min(sourceRows.length, map.eventEndRowIndex + 1) : sourceRows.length;

  for (let rowIndex = rowStart; rowIndex < rowEndExclusive; rowIndex++) {
    const row = sourceRows[rowIndex] ?? [];
    if (!row.length) continue;

    const rawEvent = map.eventNumberCol !== null ? parseNumericCell(row[map.eventNumberCol]) : parseNumericCell(row[0]);
    const eventNumber = rawEvent === null ? null : Math.round(rawEvent);
    if (!eventNumber || eventNumber <= 0) continue;

    const dateValue = map.eventDateCol !== null ? normalizeCell(row[map.eventDateCol]) : '';
    const nineFromText = map.nineCol !== null ? detectNineFromText(row[map.nineCol]) : null;
    const holesBuild = buildHolesFromColumns(row, map.holeCols, nineFromText);
    if (!holesBuild) continue;

    const { nineHoles, holes, ambiguityWarning } = holesBuild;
    if (ambiguityWarning) {
      warnings.push(`${sheetName} row ${rowIndex + 1}: ${ambiguityWarning}`);
    }

    const grossScore = resolvePlayerSheetGrossScore(row, map, holes, nineHoles, options);
    const handicap = resolvePlayerSheetHandicap(row, map, nineHoles, options);
    const netScore = resolvePlayerSheetNetScore(row, map, grossScore, handicap, options);
    const points = map.pointsCol !== null ? parseNumericCell(row[map.pointsCol]) ?? 0 : 0;
    const bonusPoints = map.bonusCol !== null ? parseNumericCell(row[map.bonusCol]) ?? 0 : 0;
    const hasHoleScores = holes.some((hole) => hole !== null);
    const eventDateObj = parseDateCell(dateValue);
    const isFutureEvent = !!eventDateObj && eventDateObj.getTime() > todayStart;

    if (!hasHoleScores && isFutureEvent) {
      skippedFutureRows += 1;
      continue;
    }

    let eagles = 0;
    let birdies = 0;
    let pars = 0;
    let bogeys = 0;
    let doubleBogeys = 0;
    let tripleBogeys = 0;
    let other = 0;

    if (courseConfig) {
      const parsForNine = getParsForNine(courseConfig, nineHoles);
      const breakdown = computeBreakdown(holes, parsForNine);
      eagles = breakdown.eagles;
      birdies = breakdown.birdies;
      pars = breakdown.pars;
      bogeys = breakdown.bogeys;
      doubleBogeys = breakdown.doubleBogeys;
      tripleBogeys = breakdown.tripleBogeys;
      other = breakdown.other;
    }

    const didNotPlay = !hasHoleScores && (grossScore === null || grossScore === 0);

    const playerRow: PlayerEventData = {
      position: 0,
      playerName,
      holes,
      grossScore,
      handicap,
      netScore,
      points,
      bonusPoints,
      totalPoints: points,
      eagles,
      birdies,
      pars,
      bogeys,
      doubleBogeys,
      tripleBogeys,
      other,
      didNotPlay,
    };

    const existingEvent = eventMap.get(eventNumber);
    if (!existingEvent) {
      eventMap.set(eventNumber, {
        eventNumber,
        eventDate: dateValue,
        nineHoles,
        players: [playerRow],
      });
    } else {
      if (!existingEvent.eventDate && dateValue) existingEvent.eventDate = dateValue;
      if (existingEvent.nineHoles !== nineHoles) {
        warnings.push(`${sheetName} event ${eventNumber}: conflicting nine-hole value; using ${existingEvent.nineHoles}.`);
      }
      existingEvent.players.push(playerRow);
    }

    parsedRows += 1;
  }

  if (skippedFutureRows > 0) {
    warnings.push(`Skipped ${skippedFutureRows} future event row${skippedFutureRows === 1 ? '' : 's'} with no posted scores.`);
  }

  return {
    events: Array.from(eventMap.values()).sort((a, b) => a.eventNumber - b.eventNumber),
    warnings,
    rowCount: parsedRows,
    mappingSummary,
  };
}

function parseEventPlayerRow(row: unknown[], courseConfig: CourseConfig | null, nineHoles: NineHoles | null): PlayerEventData | null {
  if (row.length < 14) return null;

  const position = Number.parseInt(normalizeCell(row[0]), 10);
  if (!Number.isFinite(position)) return null;

  const playerName = normalizeCell(row[1]);
  if (!playerName || playerName.length < 2) return null;
  if (!/[a-z]/i.test(playerName)) return null;
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(playerName)) return null;
  if (/total|average/i.test(playerName)) return null;

  const holes: (number | null)[] = [];
  for (let holeIndex = 2; holeIndex <= 10; holeIndex++) {
    holes.push(parseNumericCell(row[holeIndex]));
  }
  let grossScore: number | null = null;
  if (nineHoles === 'front') {
    grossScore = parseNumericCell(row[11]);
  } else if (nineHoles === 'back') {
    grossScore = parseNumericCell(row[23]);
  }
  const handicap = parseIntegerCell(row[12]);
  const netScore = parseNumericCell(row[13]);
  const points = parseNumericCell(row[14]) ?? 0;
  const bonusPoints = parseNumericCell(row[15]) ?? 0;

  let eagles = 0;
  let birdies = 0;
  let pars = 0;
  let bogeys = 0;
  let doubleBogeys = 0;
  let tripleBogeys = 0;
  let other = 0;

  if (courseConfig && nineHoles) {
    const parsForNine = getParsForNine(courseConfig, nineHoles);
    const breakdown = computeBreakdown(holes, parsForNine);
    eagles = breakdown.eagles;
    birdies = breakdown.birdies;
    pars = breakdown.pars;
    bogeys = breakdown.bogeys;
    doubleBogeys = breakdown.doubleBogeys;
    tripleBogeys = breakdown.tripleBogeys;
    other = breakdown.other;
  }

  const didNotPlay = holes.every((hole) => hole === null) && grossScore === null;

  return {
    position,
    playerName,
    holes,
    grossScore,
    handicap,
    netScore,
    points,
    bonusPoints,
    totalPoints: points,
    eagles,
    birdies,
    pars,
    bogeys,
    doubleBogeys,
    tripleBogeys,
    other,
    didNotPlay,
  };
}

function inspectSheet(sheetName: string, rows: unknown[][], index: number): ExcelSheetPreview {
  const eventSheetRows = rows.filter((row) => parseEventPlayerRow(row, null, null) !== null).length;
  const playerSheetParse = parsePlayerSheetRows(sheetName, rows, null);
  const playerSheetRows = playerSheetParse.rowCount;
  const candidateRows = Math.max(eventSheetRows, playerSheetRows);

  const layoutHint: WorkbookLayout = eventSheetRows > playerSheetRows
    ? 'event-sheets'
    : playerSheetRows > 0
      ? 'player-sheets'
      : 'unknown';

  const nineHoles = detectNineHoles(sheetName, rows);
  const eventNumber = detectEventNumber(sheetName, index + 1);
  const eventDate = detectEventDate(sheetName);
  const warnings: string[] = [];

  if (candidateRows === 0) warnings.push('No parseable score rows detected.');
  if (layoutHint === 'event-sheets' && !nineHoles) {
    warnings.push('Could not detect whether this sheet is front 9 or back 9.');
  }
  if (layoutHint === 'player-sheets' && playerSheetParse.warnings.length) {
    warnings.push(...playerSheetParse.warnings.slice(0, 2));
  }

  const status: ExcelSheetPreview['status'] = candidateRows > 0
    ? warnings.length > 0 ? 'needs-review' : 'ready'
    : 'invalid';

  return {
    sheetName,
    rowCount: rows.length,
    candidateRows,
    layoutHint,
    mappingSummary: layoutHint === 'player-sheets' ? playerSheetParse.mappingSummary : null,
    eventNumber,
    eventDate,
    nineHoles,
    status,
    warnings,
  };
}

export async function inspectExcelWorkbook(file: File): Promise<ExcelWorkbookPreview> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

  const sheets = workbook.SheetNames.map((sheetName, index) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      blankrows: false,
      defval: '',
    }) as unknown[][];

    return inspectSheet(sheetName, rows, index);
  });

  const eventLike = sheets.filter((sheet) => sheet.layoutHint === 'event-sheets').length;
  const playerLike = sheets.filter((sheet) => sheet.layoutHint === 'player-sheets').length;
  const detectedLayout: WorkbookLayout = eventLike > playerLike
    ? 'event-sheets'
    : playerLike > 0
      ? 'player-sheets'
      : 'unknown';

  return {
    sheetNames: workbook.SheetNames,
    detectedLayout,
    sheets,
  };
}

export async function previewPlayerSheetMapping(
  file: File,
  sheetName: string,
  importOptions: ExcelImportOptions = {},
): Promise<PlayerSheetMappingPreview> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Sheet "${sheetName}" was not found in the workbook.`);
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    blankrows: false,
    defval: '',
  }) as unknown[][];
  const options = mergePlayerSheetImportOptions(importOptions.playerSheets);
  const resolved = resolvePlayerSheetColumnMap(rows, options);
  const map = resolved.map;
  const sourceRows = resolved.rows;
  const warnings = [...resolved.warnings];
  const detectedMap = detectPlayerSheetColumnMap(rows);
  const activeMappingSummary = map ? summarizePlayerSheetMap(map) : null;
  const headerRowIndex = map?.headerRowIndex ?? detectedMap?.headerRowIndex ?? 0;
  const showFullManualPreview = options.mappingMode === 'manual';
  const sampleStartRow = showFullManualPreview ? 0 : Math.max(0, headerRowIndex - 2);
  const sampleSourceRows = showFullManualPreview
    ? sourceRows
    : sourceRows.slice(sampleStartRow, sampleStartRow + 12);
  const availableWidth = Math.max(1, ...sourceRows.map((row) => row.length));
  const sampleWidth = availableWidth;
  const availableColumns = Array.from({ length: availableWidth }, (_, index) => ({
    index,
    letter: columnIndexToLetter(index),
    headerValue: normalizeCell(sourceRows[headerRowIndex]?.[index]),
  }));
  const sampleColumns = Array.from({ length: sampleWidth }, (_, index) => ({
    index,
    letter: columnIndexToLetter(index),
    headerValue: normalizeCell(sourceRows[headerRowIndex]?.[index]),
  }));
  const sampleRows = sampleSourceRows.map((row, index) => ({
    rowNumber: sampleStartRow + index + 1,
    cells: Array.from({ length: sampleWidth }, (_, colIndex) => normalizeCell(row[colIndex])),
  }));

  const parsedRows: PlayerSheetParsedPreviewRow[] = [];
  if (map) {
    const rowStart = Math.max(map.headerRowIndex + 1, map.eventStartRowIndex ?? map.headerRowIndex + 1);
    const rowEndExclusive = map.eventEndRowIndex !== null ? Math.min(sourceRows.length, map.eventEndRowIndex + 1) : sourceRows.length;
    for (let rowIndex = rowStart; rowIndex < rowEndExclusive && parsedRows.length < 6; rowIndex++) {
      const row = sourceRows[rowIndex] ?? [];
      if (!row.length) continue;

      const rawEvent = map.eventNumberCol !== null ? parseNumericCell(row[map.eventNumberCol]) : parseNumericCell(row[0]);
      const eventNumber = rawEvent === null ? null : Math.round(rawEvent);
      if (!eventNumber || eventNumber <= 0) continue;

      const eventDate = map.eventDateCol !== null ? normalizeCell(row[map.eventDateCol]) : '';
      const nineFromText = map.nineCol !== null ? detectNineFromText(row[map.nineCol]) : null;
      const holesBuild = buildHolesFromColumns(row, map.holeCols, nineFromText);
      if (!holesBuild) continue;

      const { nineHoles, holes, ambiguityWarning } = holesBuild;
      if (ambiguityWarning) warnings.push(`${sheetName} row ${rowIndex + 1}: ${ambiguityWarning}`);

      parsedRows.push({
        rowNumber: rowIndex + 1,
        eventNumber,
        eventDate,
        nineHoles,
        holes,
        grossScore: resolvePlayerSheetGrossScore(row, map, holes, nineHoles, options),
        handicap: resolvePlayerSheetHandicap(row, map, nineHoles, options),
        netScore: null,
        points: map.pointsCol !== null ? parseNumericCell(row[map.pointsCol]) ?? 0 : 0,
        bonusPoints: map.bonusCol !== null ? parseNumericCell(row[map.bonusCol]) ?? 0 : 0,
      });

      const current = parsedRows[parsedRows.length - 1];
      current.netScore = resolvePlayerSheetNetScore(row, map, current.grossScore, current.handicap, options);
    }
  }

  const status: PlayerSheetMappingPreview['status'] = map
    ? warnings.length > 0 ? 'needs-review' : 'ready'
    : 'invalid';

  return {
    sheetName,
    status,
    availableColumns,
    sampleColumns,
    sampleRows,
    detectedMapping: detectedMap ? serializePlayerSheetColumnMap(detectedMap) : null,
    activeMapping: map ? serializePlayerSheetColumnMap(map) : null,
    activeMappingSummary,
    parsedRows,
    warnings,
  };
}

function mergeEventPlayers(existing: PlayerEventData[], incoming: PlayerEventData[]): PlayerEventData[] {
  const byPlayer = new Map<string, PlayerEventData>();
  for (const player of existing) {
    byPlayer.set(player.playerName, player);
  }
  for (const player of incoming) {
    byPlayer.set(player.playerName, player);
  }

  return Array.from(byPlayer.values())
    .sort((a, b) => b.points - a.points || (a.netScore ?? Number.POSITIVE_INFINITY) - (b.netScore ?? Number.POSITIVE_INFINITY) || a.playerName.localeCompare(b.playerName))
    .map((player, index) => ({
      ...player,
      position: index + 1,
    }));
}

function chooseLayout(previews: ExcelSheetPreview[]): WorkbookLayout {
  const eventLike = previews.filter((sheet) => sheet.layoutHint === 'event-sheets').length;
  const playerLike = previews.filter((sheet) => sheet.layoutHint === 'player-sheets').length;
  if (eventLike > playerLike) return 'event-sheets';
  if (playerLike > 0) return 'player-sheets';
  return 'unknown';
}

export async function importExcelWorkbook(
  file: File,
  selectedSheetNames: string[],
  currentLeague: LeagueData,
  currentPlayerConfig: PlayerConfig,
  courseConfig: CourseConfig | null,
  forcedLayout: WorkbookLayout = 'unknown',
  importOptions: ExcelImportOptions = {},
): Promise<ExcelImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const selectedSet = new Set(selectedSheetNames);
  const importedSheets: string[] = [];
  const warnings: string[] = [];
  const importedEvents: EventData[] = [];
  const selectedPreviews: ExcelSheetPreview[] = [];

  workbook.SheetNames.forEach((sheetName, index) => {
    if (!selectedSet.has(sheetName)) return;

    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      blankrows: false,
      defval: '',
    }) as unknown[][];
    selectedPreviews.push(inspectSheet(sheetName, rows, index));
  });

  const layout = forcedLayout === 'unknown' ? chooseLayout(selectedPreviews) : forcedLayout;
  const playerModeEvents = new Map<number, EventDraft>();
  const playerSheetOptions = mergePlayerSheetImportOptions(importOptions.playerSheets);

  workbook.SheetNames.forEach((sheetName, index) => {
    if (!selectedSet.has(sheetName)) return;

    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      blankrows: false,
      defval: '',
    }) as unknown[][];

    const preview = selectedPreviews.find((sheet) => sheet.sheetName === sheetName) ?? inspectSheet(sheetName, rows, index);
    if (preview.status === 'invalid') {
      warnings.push(`${sheetName}: no player rows detected.`);
      return;
    }

    if (layout === 'player-sheets') {
      const parsed = parsePlayerSheetRows(sheetName, rows, courseConfig, playerSheetOptions);
      if (!parsed.events.length) {
        warnings.push(`${sheetName}: no parsable event rows found.`);
        return;
      }

      for (const warning of parsed.warnings) warnings.push(warning);
      if (parsed.mappingSummary) warnings.push(`${sheetName}: mapping ${parsed.mappingSummary}`);
      for (const event of parsed.events) {
        const existing = playerModeEvents.get(event.eventNumber);
        if (!existing) {
          playerModeEvents.set(event.eventNumber, {
            ...event,
            players: [...event.players],
          });
        } else {
          if (!existing.eventDate && event.eventDate) existing.eventDate = event.eventDate;
          existing.players = mergeEventPlayers(existing.players, event.players);
        }
      }

      importedSheets.push(sheetName);
      return;
    }

    const players = rows
      .map((row) => parseEventPlayerRow(row, courseConfig, preview.nineHoles))
      .filter((player): player is PlayerEventData => player !== null)
      .map((player, positionIndex) => ({
        ...player,
        position: player.position || positionIndex + 1,
      }));

    if (!players.length) {
      warnings.push(`${sheetName}: no parsable player rows found.`);
      return;
    }

    const eventNumber = preview.eventNumber ?? index + 1;
    const eventDate = preview.eventDate ?? '';
    const nineHoles = preview.nineHoles ?? 'front';

    const event: EventData = {
      id: `excel-${sheetName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${Date.now()}`,
      eventNumber,
      eventDate,
      nineHoles,
      players: mergeEventPlayers([], players),
      standings: [],
    };

    importedEvents.push(event);
    importedSheets.push(sheetName);
    if (preview.warnings.length) warnings.push(`${sheetName}: ${preview.warnings.join(' ')}`);
  });

  if (layout === 'player-sheets') {
    for (const event of Array.from(playerModeEvents.values()).sort((a, b) => a.eventNumber - b.eventNumber)) {
      importedEvents.push({
        id: `excel-event-${event.eventNumber}-${Date.now()}`,
        eventNumber: event.eventNumber,
        eventDate: event.eventDate,
        nineHoles: event.nineHoles,
        players: mergeEventPlayers([], event.players),
        standings: [],
      });
    }
  }

  if (!importedEvents.length) {
    throw new Error('No valid sheets were selected for import.');
  }

  const mergedEvents = [...currentLeague.events];
  for (const event of importedEvents) {
    const existingIndex = mergedEvents.findIndex((item) => item.eventNumber === event.eventNumber);
    if (existingIndex >= 0) {
      const existing = mergedEvents[existingIndex];
      mergedEvents[existingIndex] = {
        ...existing,
        eventDate: event.eventDate || existing.eventDate,
        nineHoles: event.nineHoles ?? existing.nineHoles,
        players: mergeEventPlayers(existing.players, event.players),
        standings: [],
      };
    } else {
      mergedEvents.push(event);
    }
  }

  const recalculated = recalculateCumulativeStandings(mergedEvents, currentLeague.adjustedScoring);
  const updatedLeague: LeagueData = {
    ...currentLeague,
    events: recalculated,
  };
  const updatedPlayerConfig = applyAutoHide(currentPlayerConfig, updatedLeague.events);

  return {
    league: updatedLeague,
    playerConfig: updatedPlayerConfig,
    importedSheets,
    warnings,
  };
}