import { memo, type ReactNode } from 'react';
import type { EventData, CourseConfig } from '../types/golf';
import { buildSeasonDashboard } from '../lib/analytics';

interface SeasonDashboardProps {
  events: EventData[];
  courseConfig: CourseConfig | null;
  children?: ReactNode;
}

export default memo(function SeasonDashboard({ events, courseConfig, children }: SeasonDashboardProps) {
  const cards = buildSeasonDashboard(events, courseConfig);

  function renderCardValue(title: string, value: string) {
    if (title !== 'Biggest Mover') return value;
    const match = value.match(/^(.*)\s([▲▼])(\d+)$/);
    if (!match) return value;
    const [, label, arrow, amount] = match;
    return (
      <>
        {label}{' '}
        <span style={{ color: arrow === '▲' ? '#22c55e' : '#ef4444', fontWeight: 800 }}>
          {arrow}{amount}
        </span>
      </>
    );
  }

  if (!cards.length) {
    return (
      <div className="chart-container empty-state">
        <h3 className="chart-title">Season Storylines</h3>
        <p className="empty-text">Add events to generate storyline cards.</p>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <h3 className="chart-title">Season Storylines</h3>
      <p className="chart-subtitle">Quick storylines and season context</p>
      <div className="story-grid">
        {cards.map((card) => (
          <div key={card.title} className={`story-card story-${card.tone ?? 'neutral'}`}>
            <span className="story-title">{card.title}</span>
            <span className="story-value">{renderCardValue(card.title, card.value)}</span>
            <span className="story-detail">{card.detail}</span>
          </div>
        ))}
      </div>
      {children}
    </div>
  );
});
