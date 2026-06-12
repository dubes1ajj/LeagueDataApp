import type { CourseConfig } from '../types/golf';
import { Edit2 } from 'lucide-react';

interface CourseScorecardProps {
  courseConfig: CourseConfig | null;
  onEdit: () => void;
}

export default function CourseScorecard({ courseConfig, onEdit }: CourseScorecardProps) {
  if (!courseConfig) {
    return (
      <div className="chart-container empty-state">
        <h3 className="chart-title">Course Scorecard</h3>
        <p className="empty-text" style={{ marginBottom: 16 }}>
          No course configured yet. Add your scorecard to enable accurate scoring breakdown.
        </p>
        <button className="btn-primary" onClick={onEdit} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Edit2 size={14} /> Set Up Scorecard
        </button>
      </div>
    );
  }

  const front = courseConfig.holes.slice(0, 9);
  const back  = courseConfig.holes.slice(9, 18);

  const frontPar   = front.reduce((s, h) => s + h.par, 0);
  const backPar    = back.reduce((s, h) => s + h.par, 0);
  const frontYards = front.reduce((s, h) => s + (h.yardage ?? 0), 0);
  const backYards  = back.reduce((s, h) => s + (h.yardage ?? 0), 0);

  function renderNine(nine: typeof front, label: string, totalPar: number, totalYards: number) {
    return (
      <div className="sc-section">
        <div className="sc-section-label">{label}</div>
        <div className="sc-table">
          <div className="sc-row sc-header">
            <span className="sc-cell sc-row-label">Hole</span>
            {nine.map(h => <span key={h.hole} className="sc-cell sc-hole-num">{h.hole}</span>)}
            <span className="sc-cell sc-total">Total</span>
          </div>
          <div className="sc-row">
            <span className="sc-cell sc-row-label">Par</span>
            {nine.map(h => <span key={h.hole} className="sc-cell sc-par-display">{h.par}</span>)}
            <span className="sc-cell sc-total sc-total-par">{totalPar}</span>
          </div>
          {nine.some(h => h.yardage) && (
            <div className="sc-row">
              <span className="sc-cell sc-row-label">Yards</span>
              {nine.map(h => <span key={h.hole} className="sc-cell">{h.yardage ?? '—'}</span>)}
              <span className="sc-cell sc-total">{totalYards > 0 ? totalYards : '—'}</span>
            </div>
          )}
          {nine.some(h => h.strokeIndex) && (
            <div className="sc-row">
              <span className="sc-cell sc-row-label">H'cap</span>
              {nine.map(h => <span key={h.hole} className="sc-cell">{h.strokeIndex ?? '—'}</span>)}
              <span className="sc-cell sc-total">—</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <h3 className="chart-title" style={{ marginBottom: 0 }}>
          {courseConfig.courseName || 'Course Scorecard'}
        </h3>
        <button className="btn-secondary" onClick={onEdit} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <Edit2 size={13} /> Edit
        </button>
      </div>
      <p className="chart-subtitle">
        Par {frontPar + backPar} total · Front {frontPar} / Back {backPar}
        {(frontYards + backYards) > 0 ? ` · ${(frontYards + backYards).toLocaleString()} yards` : ''}
      </p>
      {renderNine(front, 'Front 9', frontPar, frontYards)}
      {renderNine(back,  'Back 9',  backPar,  backYards)}
    </div>
  );
}
