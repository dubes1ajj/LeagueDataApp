import { memo } from 'react';
import type { CourseConfig, EventData } from '../types/golf';
import TrendFilterBar, { type TrendFilterState } from './TrendFilterBar';
import CumulativePointsChart from './CumulativePointsChart';
import GrossNetScoresChart from './GrossNetScoresChart';
import HandicapTrendChart from './HandicapTrendChart';
import ComparePlayersPanel from './ComparePlayersPanel';

interface TrendsPageProps {
  events: EventData[];
  courseConfig: CourseConfig | null;
  filter: TrendFilterState;
  onFilterChange: (value: TrendFilterState) => void;
}

export default memo(function TrendsPage({ events, courseConfig, filter, onFilterChange }: TrendsPageProps) {
  return (
    <>
      <TrendFilterBar title="Trend Filters" value={filter} onChange={onFilterChange} />
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