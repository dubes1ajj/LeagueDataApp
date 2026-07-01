import { useState, useCallback } from 'react';

/**
 * Click-to-select logic for multi-line charts.
 * Click a legend item to highlight that player's line; click again to deselect.
 * Multiple players can be selected simultaneously.
 */
export function useLineSelect() {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = useCallback((player: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(player)) next.delete(player);
      else next.add(player);
      return next;
    });
  }, []);

  const clearAll = useCallback(() => setSelected(new Set()), []);

  const hasSelection = selected.size > 0;

  const getLineProps = useCallback((player: string, color: string) => {
    const isSelected = selected.has(player);
    const active = !hasSelection || isSelected;
    return {
      strokeOpacity: active ? 1 : 0.07,
      strokeWidth: isSelected ? 4 : hasSelection ? 1.5 : 2,
      // Dots are colored to match the line — no white fills
      dot: active ? { r: 4, strokeWidth: 0, fill: color } : false as const,
      activeDot: active ? { r: 7, strokeWidth: 2, stroke: color, fill: color, fillOpacity: 0.3 } : false as const,
    };
  }, [selected, hasSelection]);

  return { selected, toggle, clearAll, hasSelection, getLineProps };
}
