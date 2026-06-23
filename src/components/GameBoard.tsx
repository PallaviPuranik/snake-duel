import type { GameState } from "@/game/snake";

export function GameBoard({ state, cellSize = 22 }: { state: GameState; cellSize?: number }) {
  const w = state.width * cellSize;
  const h = state.height * cellSize;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="rounded-lg border border-border bg-card shadow-xl"
      role="img"
      aria-label="Snake game board"
    >
      <defs>
        <pattern id="grid" width={cellSize} height={cellSize} patternUnits="userSpaceOnUse">
          <path d={`M ${cellSize} 0 L 0 0 0 ${cellSize}`} fill="none" stroke="var(--color-grid)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={w} height={h} fill="url(#grid)" />
      <rect
        x={state.food.x * cellSize + 3}
        y={state.food.y * cellSize + 3}
        width={cellSize - 6}
        height={cellSize - 6}
        rx={cellSize / 2}
        fill="var(--color-food)"
      />
      {state.snake.map((c, i) => (
        <rect
          key={i}
          x={c.x * cellSize + 1}
          y={c.y * cellSize + 1}
          width={cellSize - 2}
          height={cellSize - 2}
          rx={4}
          fill={i === 0 ? "var(--color-snake-head)" : "var(--color-snake)"}
          opacity={i === 0 ? 1 : Math.max(0.45, 1 - i * 0.02)}
        />
      ))}
      {!state.alive && (
        <g>
          <rect width={w} height={h} fill="black" opacity={0.6} />
          <text x={w / 2} y={h / 2} textAnchor="middle" dominantBaseline="middle" fill="var(--color-destructive)" fontSize={28} fontWeight={700} fontFamily="monospace">
            GAME OVER
          </text>
        </g>
      )}
    </svg>
  );
}
