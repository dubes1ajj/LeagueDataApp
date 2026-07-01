

interface TooltipEntry {
  dataKey: string;
  value?: number;
  color?: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  selected: Set<string>;
  pinnedKeys?: string[];
  /** 'asc' for positions/scores where lower=better, 'desc' for points where higher=better */
  sortDir?: 'asc' | 'desc';
  valueFormat?: (v: number, name: string) => string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  selected,
  pinnedKeys = [],
  sortDir = 'desc',
  valueFormat,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const hasSelection = selected.size > 0;
  const pinnedSet = new Set(pinnedKeys);

  // When players are selected, only show those in the tooltip; otherwise show all
  const entries = payload
    .filter(p => p.value !== undefined && p.value !== null)
    .filter(p => !hasSelection || selected.has(p.dataKey as string) || pinnedSet.has(p.dataKey as string))
    .sort((a, b) => {
      const aPinned = pinnedSet.has(a.dataKey as string);
      const bPinned = pinnedSet.has(b.dataKey as string);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      const av = (a.value as number) ?? 0;
      const bv = (b.value as number) ?? 0;
      return sortDir === 'asc' ? av - bv : bv - av;
    });

  if (!entries.length) return null;

  // Read CSS vars at render time for theme-awareness
  const style = getComputedStyle(document.documentElement);
  const bg     = style.getPropertyValue('--chart-tooltip-bg').trim() || '#13131f';
  const border = style.getPropertyValue('--border').trim() || '#2a2a4a';
  const text   = style.getPropertyValue('--text').trim() || '#e2e2f0';
  const text2  = style.getPropertyValue('--text2').trim() || '#a0a0c0';

  return (
    <div style={{
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 10,
      padding: '10px 14px',
      minWidth: 200,
      maxWidth: 260,
      pointerEvents: 'none',
    }}>
      <div style={{ color: text, fontWeight: 700, fontSize: 13, marginBottom: 8, borderBottom: `1px solid ${border}`, paddingBottom: 6 }}>
        {label}
      </div>
      {entries.map((entry, i) => {
        const name = entry.dataKey as string;
        const val = entry.value as number;
        const isTop = i === 0;

        return (
          <div
            key={name}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '3px 0',
              fontWeight: isTop ? 700 : 400,
              borderBottom: isTop && entries.length > 1 ? `1px solid ${border}` : undefined,
              marginBottom: isTop && entries.length > 1 ? 4 : 0,
              paddingBottom: isTop && entries.length > 1 ? 5 : 3,
            }}
          >
            <span style={{
              width: 9, height: 9, borderRadius: '50%',
              background: entry.color as string,
              flexShrink: 0,
              boxShadow: isTop ? `0 0 6px ${entry.color}` : undefined,
            }} />
            <span style={{ color: text2, flex: 1, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
              {name}
            </span>
            <span style={{ color: text, fontSize: 12, fontWeight: isTop ? 700 : 500, flexShrink: 0 }}>
              {valueFormat ? valueFormat(val, name) : val}
            </span>
          </div>
        );
      })}
    </div>
  );
}
