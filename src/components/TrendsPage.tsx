import { memo } from 'react';
import type { CourseConfig, EventData } from '../types/golf';
import EventFilterBar from './EventFilterBar';
import CumulativePointsChart from './CumulativePointsChart';
import GrossNetScoresChart from './GrossNetScoresChart';
import HandicapTrendChart from './HandicapTrendChart';
import ComparePlayersPanel from './ComparePlayersPanel';

interface TrendsPageProps {
  events: EventData[];
  allEvents: EventData[];
  courseConfig: CourseConfig | null;
  filterEventIds: string[] | null;
  onFilterChange: (value: string[] | null) => void;
}

export default memo(function TrendsPage({ events, allEvents, courseConfig, filterEventIds, onFilterChange }: TrendsPageProps) {
  return (
    <>
      <EventFilterBar title="Trend Filters" events={allEvents} selectedEventIds={filterEventIds} onChange={onFilterChange} />
      <CumulativePointsChart events={events} />
      <div className="pp-charts-row">
        <div className="pp-chart-half">
          <GrossNetScoresChart events={events} scoreType="net" topN={999} />
        </div>
        <div className="pp-chart-half">
          <GrossNetScoresChart events={events} scoreType="gross" topN={999} />
        </div>
      </div>
      <HandicapTrendChart events={events} topN={999} />
      <ComparePlayersPanel events={events} courseConfig={courseConfig} />
    </>
  );
});