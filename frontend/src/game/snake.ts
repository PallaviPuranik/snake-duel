// Pure snake game logic — no React, no DOM. Easy to test.

export type Mode = "walls" | "wrap";
export type Dir = "up" | "down" | "left" | "right";
export type Cell = { x: number; y: number };

export interface GameState {
  width: number;
  height: number;
  mode: Mode;
  snake: Cell[]; // head first
  dir: Dir;
  pendingDir: Dir;
  food: Cell;
  score: number;
  alive: boolean;
  tick: number;
}

const DIRS: Record<Dir, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE: Record<Dir, Dir> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

export function createGame(
  mode: Mode,
  width = 20,
  height = 20,
  seed = Date.now(),
): GameState {
  const snake: Cell[] = [
    { x: Math.floor(width / 2), y: Math.floor(height / 2) },
  ];
  return {
    width,
    height,
    mode,
    snake,
    dir: "right",
    pendingDir: "right",
    food: spawnFood(snake, width, height, seed),
    score: 0,
    alive: true,
    tick: 0,
  };
}

export function setDir(state: GameState, dir: Dir): GameState {
  // ignore reversing into self
  if (OPPOSITE[state.dir] === dir) return state;
  return { ...state, pendingDir: dir };
}

export function spawnFood(
  snake: Cell[],
  width: number,
  height: number,
  seed: number,
): Cell {
  // deterministic-ish pseudo-random based on seed
  let s = seed >>> 0 || 1;
  const taken = new Set(snake.map((c) => `${c.x},${c.y}`));
  for (let i = 0; i < 1000; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const x = s % width;
    s = (s * 1664525 + 1013904223) >>> 0;
    const y = s % height;
    if (!taken.has(`${x},${y}`)) return { x, y };
  }
  return { x: 0, y: 0 };
}

export function step(state: GameState): GameState {
  if (!state.alive) return state;
  const dir = state.pendingDir;
  const delta = DIRS[dir];
  let nx = state.snake[0].x + delta.x;
  let ny = state.snake[0].y + delta.y;

  if (state.mode === "wrap") {
    nx = (nx + state.width) % state.width;
    ny = (ny + state.height) % state.height;
  } else if (
    nx < 0 ||
    ny < 0 ||
    nx >= state.width ||
    ny >= state.height
  ) {
    return { ...state, alive: false, tick: state.tick + 1 };
  }

  const ate = nx === state.food.x && ny === state.food.y;
  const newSnake: Cell[] = [{ x: nx, y: ny }, ...state.snake];
  if (!ate) newSnake.pop();

  // self collision (check against body excluding the new head)
  for (let i = 1; i < newSnake.length; i++) {
    if (newSnake[i].x === nx && newSnake[i].y === ny) {
      return { ...state, alive: false, tick: state.tick + 1 };
    }
  }

  return {
    ...state,
    snake: newSnake,
    dir,
    score: ate ? state.score + 1 : state.score,
    food: ate
      ? spawnFood(newSnake, state.width, state.height, Date.now() + state.tick)
      : state.food,
    tick: state.tick + 1,
  };
}
