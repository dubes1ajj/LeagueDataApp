import { memo } from 'react';
import type { TrendWindowKey } from '../lib/analytics';

export interface TrendFilterState {
  windowKey: TrendWindowKey;
  nine: 'all' | 'front' | 'back';
}

interface TrendFilterBarProps {
  value: TrendFilterState;
  onChange: (value: TrendFilterState) => void;
  title?: string;
}

export default memo(function TrendFilterBar({ value, onChange, title = 'View Filter' }: TrendFilterBarProps) {
  return (
    <div className="chart-container trend-filter-card">
      <div className="trend-filter-header">
        <h3 className="chart-title">{title}</h3>
        <p className="chart-subtitle">Switch between season totals and recent form</p>
      </div>
      <div className="trend-filter-grid">
        <div className="trend-filter-group">
          <span className="trend-filter-label">Window</span>
          <div className="trend-pill-row">
            {([
              ['all', 'All events'],
              ['last1', 'Last 1'],
              ['last2', 'Last 2'],
              ['last3', 'Last 3'],
              ['last5', 'Last 5'],
              ['first3', 'Opening 3'],
              ['secondHalf', 'Second half'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                className={`trend-pill ${value.windowKey === key ? 'active' : ''}`}
                onClick={() => onChange({ ...value, windowKey: key })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="trend-filter-group">
          <span className="trend-filter-label">Nine</span>
          <div className="trend-pill-row">
            {([
              ['all', 'All'],
              ['front', 'Front 9'],
              ['back', 'Back 9'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                className={`trend-pill ${value.nine === key ? 'active' : ''}`}
                onClick={() => onChange({ ...value, nine: key })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});
