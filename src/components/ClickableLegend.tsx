import { getPlayerColor } from '../lib/colors';

interface ClickableLegendProps {
  players: string[];
  selected: Set<string>;
  onToggle: (player: string) => void;
  onClearAll: () => void;
  onOpenPlayer?: (player: string) => void;
}

export function ClickableLegend({ players, selected, onToggle, onClearAll }: ClickableLegendProps) {
  const hasSelection = selected.size > 0;

  return (
    <div className="clickable-legend">
      {players.map(player => {
        const isSelected = selected.has(player);
        const dimmed = hasSelection && !isSelected;
        return (
          <button
            key={player}
            className={`legend-item ${isSelected ? 'legend-selected' : ''} ${dimmed ? 'legend-dimmed' : ''}`}
            onClick={() => onToggle(player)}
            title={isSelected ? 'Click to deselect' : 'Click to highlight'}
          >
            <span
              className="legend-dot"
              style={{ background: getPlayerColor(player), boxShadow: isSelected ? `0 0 6px ${getPlayerColor(player)}` : undefined }}
            />
            {player}
          </button>
        );
      })}
      {hasSelection && (
        <button className="legend-clear" onClick={onClearAll}>
          Clear
        </button>
      )}
    </div>
  );
}
