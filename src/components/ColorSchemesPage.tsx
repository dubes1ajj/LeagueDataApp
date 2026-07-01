import type { ColorSchemeConfig } from '../types/golf';

interface ColorSchemesPageProps {
  colorScheme: ColorSchemeConfig;
  onThemeColorChange: (token: string, color: string) => void;
  onApplyThemePreset: (themeColors: Record<string, string>) => void;
  onClearThemeColor: (token: string) => void;
  onResetAllColors: () => void;
}

const THEME_COLOR_TOKENS: Array<{ key: string; label: string }> = [
  { key: '--accent', label: 'Accent' },
  { key: '--accent2', label: 'Accent Alt' },
  { key: '--green', label: 'Success Green' },
  { key: '--red', label: 'Danger Red' },
  { key: '--gold', label: 'Gold/Highlight' },
  { key: '--chart-grid', label: 'Chart Grid' },
  { key: '--chart-tooltip-bg', label: 'Chart Tooltip Background' },
  { key: '--chart-axis', label: 'Chart Axis' },
  { key: '--chart-tick', label: 'Chart Tick Text' },
];

const DEFAULT_THEME_COLOR_VALUES: Record<string, string> = {
  '--accent': '#4f8ef7',
  '--accent2': '#6366f1',
  '--green': '#22c55e',
  '--red': '#ef4444',
  '--gold': '#f59e0b',
  '--chart-grid': '#2a2a3e',
  '--chart-tooltip-bg': '#13131f',
  '--chart-axis': '#888888',
  '--chart-tick': '#aaaaaa',
};

const LIGHT_THEME_COLOR_VALUES: Record<string, string> = {
  '--accent': '#3b82f6',
  '--accent2': '#4f46e5',
  '--green': '#16a34a',
  '--red': '#dc2626',
  '--gold': '#b45309',
  '--chart-grid': '#dde0ee',
  '--chart-tooltip-bg': '#ffffff',
  '--chart-axis': '#888888',
  '--chart-tick': '#555555',
};

const THEME_PRESETS: Array<{ name: string; colors: Record<string, string> }> = [
  {
    name: 'Classic League',
    colors: {
      '--accent': '#4f8ef7',
      '--accent2': '#6366f1',
      '--green': '#22c55e',
      '--red': '#ef4444',
      '--gold': '#f59e0b',
      '--chart-grid': '#2a2a3e',
      '--chart-tooltip-bg': '#13131f',
      '--chart-axis': '#888888',
      '--chart-tick': '#aaaaaa',
    },
  },
  {
    name: 'Emerald Fairway',
    colors: {
      '--accent': '#059669',
      '--accent2': '#047857',
      '--green': '#16a34a',
      '--red': '#dc2626',
      '--gold': '#ca8a04',
      '--chart-grid': '#1f3a33',
      '--chart-tooltip-bg': '#0f1f1b',
      '--chart-axis': '#7fa699',
      '--chart-tick': '#a7c2b8',
    },
  },
  {
    name: 'Sunset',
    colors: {
      '--accent': '#f97316',
      '--accent2': '#e11d48',
      '--green': '#22c55e',
      '--red': '#ef4444',
      '--gold': '#f59e0b',
      '--chart-grid': '#4a2a2a',
      '--chart-tooltip-bg': '#2a1616',
      '--chart-axis': '#d1a38f',
      '--chart-tick': '#f2c6b6',
    },
  },
  {
    name: 'High Contrast',
    colors: {
      '--accent': '#1d4ed8',
      '--accent2': '#7c3aed',
      '--green': '#15803d',
      '--red': '#b91c1c',
      '--gold': '#a16207',
      '--chart-grid': '#5b6070',
      '--chart-tooltip-bg': '#0b1020',
      '--chart-axis': '#d1d5db',
      '--chart-tick': '#f3f4f6',
    },
  },
];

export default function ColorSchemesPage({
  colorScheme,
  onThemeColorChange,
  onApplyThemePreset,
  onClearThemeColor,
  onResetAllColors,
}: ColorSchemesPageProps) {
  const isLight = document.documentElement.classList.contains('light');
  const tokenDefaults = isLight ? LIGHT_THEME_COLOR_VALUES : DEFAULT_THEME_COLOR_VALUES;

  const tokenColor = (tokenKey: string) => colorScheme.themeColors[tokenKey] || tokenDefaults[tokenKey] || '#000000';

  const previewColors = {
    accent: tokenColor('--accent'),
    accent2: tokenColor('--accent2'),
    green: tokenColor('--green'),
    red: tokenColor('--red'),
    gold: tokenColor('--gold'),
    grid: tokenColor('--chart-grid'),
    tooltipBg: tokenColor('--chart-tooltip-bg'),
    axis: tokenColor('--chart-axis'),
    tick: tokenColor('--chart-tick'),
  };

  return (
    <div className="chart-container">
      <div className="players-page-header">
        <div>
          <h3 className="chart-title">Theme and Chart Colors</h3>
          <p className="chart-subtitle">Customize core UI and chart color tokens</p>
        </div>
        <div className="players-page-actions">
          <button className="btn-secondary" onClick={onResetAllColors}>Reset All</button>
        </div>
      </div>
      <div className="pp-section-title">Theme and Chart Colors</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {THEME_PRESETS.map((preset) => (
          <button key={preset.name} className="btn-secondary" onClick={() => onApplyThemePreset(preset.colors)}>
            {preset.name}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {THEME_COLOR_TOKENS.map((token) => {
          const tokenColorValue = tokenColor(token.key);
          const hasOverride = !!colorScheme.themeColors[token.key];
          return (
            <div key={token.key} className="story-card story-neutral" style={{ gap: 10 }}>
              <span className="story-title">{token.label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="color"
                  value={tokenColorValue}
                  onChange={(e) => onThemeColorChange(token.key, e.target.value)}
                  title={`Pick ${token.label}`}
                />
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>{tokenColorValue.toUpperCase()}</span>
              </div>
              <button className="btn-secondary" onClick={() => onClearThemeColor(token.key)} disabled={!hasOverride}>Default</button>
            </div>
          );
        })}
      </div>

      <div className="pp-section-title" style={{ marginTop: 16 }}>Live Preview</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        <div className="story-card story-neutral" style={{ gap: 8 }}>
          <span className="story-title">Chart Preview</span>
          <svg viewBox="0 0 320 150" width="100%" height="150" role="img" aria-label="Theme chart preview">
            <rect x="0" y="0" width="320" height="150" fill="transparent" />
            <line x1="36" y1="120" x2="300" y2="120" stroke={previewColors.axis} strokeWidth="1" />
            <line x1="36" y1="30" x2="36" y2="120" stroke={previewColors.axis} strokeWidth="1" />
            <line x1="36" y1="95" x2="300" y2="95" stroke={previewColors.grid} strokeWidth="1" />
            <line x1="36" y1="70" x2="300" y2="70" stroke={previewColors.grid} strokeWidth="1" />
            <line x1="36" y1="45" x2="300" y2="45" stroke={previewColors.grid} strokeWidth="1" />

            <rect x="64" y="86" width="24" height="34" rx="4" fill={previewColors.green} />
            <rect x="108" y="72" width="24" height="48" rx="4" fill={previewColors.gold} />
            <rect x="152" y="52" width="24" height="68" rx="4" fill={previewColors.red} />

            <polyline points="64,92 120,66 176,80 232,56 288,62" fill="none" stroke={previewColors.accent2} strokeWidth="3" />
            <circle cx="64" cy="92" r="4" fill={previewColors.accent} />
            <circle cx="120" cy="66" r="4" fill={previewColors.accent} />
            <circle cx="176" cy="80" r="4" fill={previewColors.accent} />
            <circle cx="232" cy="56" r="4" fill={previewColors.accent} />
            <circle cx="288" cy="62" r="4" fill={previewColors.accent} />

            <text x="8" y="122" fill={previewColors.tick} fontSize="11">0</text>
            <text x="8" y="97" fill={previewColors.tick} fontSize="11">10</text>
            <text x="8" y="72" fill={previewColors.tick} fontSize="11">20</text>
            <text x="8" y="47" fill={previewColors.tick} fontSize="11">30</text>
          </svg>
          <div style={{
            background: previewColors.tooltipBg,
            border: `1px solid ${previewColors.grid}`,
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 12,
            color: previewColors.tick,
            width: 'fit-content',
          }}>
            Tooltip sample
          </div>
        </div>

        <div className="story-card story-neutral" style={{ gap: 8 }}>
          <span className="story-title">Table Preview</span>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', color: 'var(--text2)', borderBottom: '1px solid var(--bg4)', padding: '6px 8px' }}>Player</th>
                <th style={{ textAlign: 'center', color: 'var(--text2)', borderBottom: '1px solid var(--bg4)', padding: '6px 8px' }}>Avg</th>
                <th style={{ textAlign: 'center', color: 'var(--text2)', borderBottom: '1px solid var(--bg4)', padding: '6px 8px' }}>Trend</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg4)' }}>Smith</td>
                <td style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid var(--bg4)', color: previewColors.accent }}>4.2</td>
                <td style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid var(--bg4)', color: previewColors.green }}>Improving</td>
              </tr>
              <tr>
                <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg4)' }}>Johnson</td>
                <td style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid var(--bg4)', color: previewColors.accent2 }}>5.0</td>
                <td style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid var(--bg4)', color: previewColors.red }}>Slipping</td>
              </tr>
              <tr>
                <td style={{ padding: '6px 8px' }}>Brown</td>
                <td style={{ padding: '6px 8px', textAlign: 'center', color: previewColors.gold }}>4.7</td>
                <td style={{ padding: '6px 8px', textAlign: 'center', color: previewColors.tick }}>Stable</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
