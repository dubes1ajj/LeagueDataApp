import { useState, useEffect } from 'react';

interface ChartColors {
  grid: string;
  tooltipBg: string;
  axis: string;
  tick: string;
  border: string;
  text2: string;
}

function readColors(): ChartColors {
  const style = getComputedStyle(document.documentElement);
  const get = (v: string) => style.getPropertyValue(v).trim();
  return {
    grid:      get('--chart-grid')       || '#2a2a3e',
    tooltipBg: get('--chart-tooltip-bg') || '#13131f',
    axis:      get('--chart-axis')       || '#888',
    tick:      get('--chart-tick')       || '#aaa',
    border:    get('--border')           || '#2a2a4a',
    text2:     get('--text2')            || '#a0a0c0',
  };
}

/**
 * Returns chart color values from CSS variables, re-evaluated when the
 * light/dark class changes. Avoids calling getComputedStyle on every render.
 */
export function useChartColors(): ChartColors {
  const [colors, setColors] = useState<ChartColors>(readColors);

  useEffect(() => {
    // Re-read when the 'light' class is toggled on <html>
    const observer = new MutationObserver(() => setColors(readColors()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  return colors;
}
