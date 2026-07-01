import { memo } from 'react';
import type { CourseConfig, EventData, HandicapMode } from '../types/golf';
import EventFilterBar from './EventFilterBar';
import GrossNetScoresChart from './GrossNetScoresChart';
import HandicapTrendChart from './HandicapTrendChart';
import ComparePlayersPanel from './ComparePlayersPanel';

interface TrendsPageProps {
  events: EventData[];
  allEvents: EventData[];
  courseConfig: CourseConfig | null;
  handicapMode: HandicapMode;
  filterEventIds: string[] | null;
  onFilterChange: (value: string[] | null) => void;
  onPlayerClick?: (playerName: string) => void;
}

export default memo(function TrendsPage({ events, allEvents, courseConfig, handicapMode, filterEventIds, onFilterChange, onPlayerClick }: TrendsPageProps) {
  return (
    <>
      <EventFilterBar title="Trend Filters" events={allEvents} selectedEventIds={filterEventIds} onChange={onFilterChange} />
      <div className="pp-charts-row">
        <div className="pp-chart-half">
          <GrossNetScoresChart events={events} scoreType="net" topN={999} onOpenPlayer={onPlayerClick} />
        </div>
        <div className="pp-chart-half">
          <GrossNetScoresChart events={events} scoreType="gross" topN={999} onOpenPlayer={onPlayerClick} />
        </div>
      </div>
      <HandicapTrendChart events={events} handicapMode={handicapMode} topN={999} onOpenPlayer={onPlayerClick} />
      <ComparePlayersPanel events={events} courseConfig={courseConfig} handicapMode={handicapMode} onPlayerClick={onPlayerClick} />
    </>
  );
});