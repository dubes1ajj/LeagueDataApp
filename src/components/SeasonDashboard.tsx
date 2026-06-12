import { memo } from 'react';
import type { EventData, CourseConfig } from '../types/golf';
import { buildSeasonDashboard } from '../lib/analytics';

interface SeasonDashboardProps {
  events: EventData[];
  courseConfig: CourseConfig | null;
}

export default memo(function SeasonDashboard({ events, courseConfig }: SeasonDashboardProps) {
  const cards = buildSeasonDashboard(events, courseConfig);

  if (!cards.length) {
    return (
      <div className="chart-container empty-state">
        <h3 className="chart-title">Season Dashboard</h3>
        <p className="empty-text">Add events to generate storyline cards.</p>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <h3 className="chart-title">Season Dashboard</h3>
      <p className="chart-subtitle">Quick storylines and season context</p>
      <div className="story-grid">
        {cards.map((card) => (
          <div key={card.title} className={`story-card story-${card.tone ?? 'neutral'}`}>
            <span className="story-title">{card.title}</span>
            <span className="story-value">{card.value}</span>
            <span className="story-detail">{card.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
});
