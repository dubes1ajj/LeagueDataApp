import { useState } from 'react';
import type { CourseConfig, HoleInfo } from '../types/golf';
import { defaultCourseConfig } from '../lib/scoring';
import { loadSavedCourseConfigs, saveCourseTemplate } from '../lib/storage';
import { X, Save } from 'lucide-react';

interface CourseConfigModalProps {
  initial: CourseConfig | null;
  onSave: (config: CourseConfig) => void;
  onClose: () => void;
}

export default function CourseConfigModal({ initial, onSave, onClose }: CourseConfigModalProps) {
  const [config, setConfig] = useState<CourseConfig>(() => {
    if (!initial) return defaultCourseConfig();
    // Ensure we always have exactly 18 holes
    const holes = Array.from({ length: 18 }, (_, i): HoleInfo => {
      const existing = initial.holes[i];
      return {
        hole: i + 1,
        par: existing?.par ?? 4,
        yardage: existing?.yardage,
        strokeIndex: existing?.strokeIndex,
      };
    });
    return { ...initial, holes };
  });
  const [validationError, setValidationError] = useState('');
  const [savedCourses, setSavedCourses] = useState<CourseConfig[]>(() => loadSavedCourseConfigs());
  const [libraryMessage, setLibraryMessage] = useState('');

  function validateConfig(candidate: CourseConfig): string {
    const bad = candidate.holes.find(h => !h.par || h.par < 3 || h.par > 5);
    if (bad) return `Hole ${bad.hole}: par must be 3, 4, or 5.`;
    return '';
  }

  function updateHole(index: number, field: keyof HoleInfo, raw: string) {
    const num = parseInt(raw, 10);
    const holes = [...config.holes];
    holes[index] = { ...holes[index], [field]: isNaN(num) ? undefined : num };
    setConfig({ ...config, holes });
  }

  function handleSave() {
    const error = validateConfig(config);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError('');
    onSave(config);
  }

  function handleLoadSavedCourse(courseName: string) {
    const selected = savedCourses.find((course) => course.courseName === courseName);
    if (!selected) return;
    setConfig(selected);
    setLibraryMessage(`Loaded saved course: ${selected.courseName}`);
    setValidationError('');
  }

  function handleSaveToLibrary() {
    const trimmedName = config.courseName.trim();
    if (!trimmedName) {
      setValidationError('Enter a course name before saving it to your saved courses.');
      return;
    }
    const error = validateConfig(config);
    if (error) {
      setValidationError(error);
      return;
    }
    const template = { ...config, courseName: trimmedName };
    saveCourseTemplate(template);
    setSavedCourses(loadSavedCourseConfigs());
    setConfig(template);
    setValidationError('');
    setLibraryMessage(`Saved ${trimmedName} to your course library.`);
  }

  function renderNine(start: number, label: string) {
    const nine = config.holes.slice(start, start + 9);
    const totalPar = nine.reduce((s, h) => s + (h.par || 0), 0);
    const totalYards = nine.reduce((s, h) => s + (h.yardage || 0), 0);

    return (
      <div className="sc-section">
        <div className="sc-section-label">{label}</div>
        <div className="sc-table">
          {/* Header row */}
          <div className="sc-row sc-header">
            <span className="sc-cell sc-row-label">Hole</span>
            {nine.map(h => <span key={h.hole} className="sc-cell sc-hole-num">{h.hole}</span>)}
            <span className="sc-cell sc-total">Out</span>
          </div>

          {/* Par row */}
          <div className="sc-row">
            <span className="sc-cell sc-row-label">Par</span>
            {nine.map((h, i) => (
              <input
                key={h.hole}
                type="number"
                min={3} max={5}
                value={h.par || ''}
                onChange={e => updateHole(start + i, 'par', e.target.value)}
                className="sc-cell sc-input sc-par"
              />
            ))}
            <span className="sc-cell sc-total sc-total-par">{totalPar}</span>
          </div>

          {/* Yardage row */}
          <div className="sc-row">
            <span className="sc-cell sc-row-label">Yards</span>
            {nine.map((h, i) => (
              <input
                key={h.hole}
                type="number"
                min={50} max={700}
                value={h.yardage ?? ''}
                placeholder="—"
                onChange={e => updateHole(start + i, 'yardage', e.target.value)}
                className="sc-cell sc-input"
              />
            ))}
            <span className="sc-cell sc-total">{totalYards > 0 ? totalYards : '—'}</span>
          </div>

          {/* Stroke index row */}
          <div className="sc-row">
            <span className="sc-cell sc-row-label">H'cap</span>
            {nine.map((h, i) => (
              <input
                key={h.hole}
                type="number"
                min={1} max={18}
                value={h.strokeIndex ?? ''}
                placeholder="—"
                onChange={e => updateHole(start + i, 'strokeIndex', e.target.value)}
                className="sc-cell sc-input"
              />
            ))}
            <span className="sc-cell sc-total">—</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Course Scorecard</h2>
          <button className="icon-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body sc-body">
          <div className="sc-name-row">
            <label className="sc-name-label">Saved Courses</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', width: '100%' }}>
              <select
                className="url-input"
                value=""
                onChange={(e) => handleLoadSavedCourse(e.target.value)}
                style={{ flex: 1, minWidth: 220 }}
              >
                <option value="">Select a saved course…</option>
                {savedCourses.map((course) => (
                  <option key={course.courseName} value={course.courseName}>{course.courseName}</option>
                ))}
              </select>
              <button className="btn-secondary" type="button" onClick={handleSaveToLibrary}>
                Save to library
              </button>
            </div>
          </div>

          <div className="sc-name-row">
            <label className="sc-name-label">Course Name</label>
            <input
              className="url-input"
              type="text"
              placeholder="e.g. Pebble Beach Golf Links"
              value={config.courseName}
              onChange={e => setConfig({ ...config, courseName: e.target.value })}
            />
          </div>

          {renderNine(0, 'Front 9 — Holes 1–9')}
          {renderNine(9, 'Back 9 — Holes 10–18')}

          {libraryMessage && <p style={{ color: '#22c55e', fontSize: 13 }}>{libraryMessage}</p>}
          {validationError && <p className="error">{validationError}</p>}
        </div>

        <div className="modal-actions" style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>
            <Save size={14} style={{ marginRight: 6 }} /> Save Scorecard
          </button>
        </div>
      </div>
    </div>
  );
}
