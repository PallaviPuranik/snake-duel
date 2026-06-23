import { describe, it, expect } from "vitest";
import { createGame, setDir, step } from "./snake";

describe("snake", () => {
  it("creates a game with one cell", () => {
    const g = createGame("walls", 10, 10);
    expect(g.snake).toHaveLength(1);
    expect(g.alive).toBe(true);
    expect(g.score).toBe(0);
  });

  it("ignores reversing direction", () => {
    const g = createGame("walls");
    const g2 = setDir(g, "left"); // currently moving right
    expect(g2.pendingDir).toBe("right");
  });

  it("kills snake hitting wall in walls mode", () => {
    let g = createGame("walls", 5, 5);
    // head at (2,2), moving right -> takes 3 steps to die at x=5
    for (let i = 0; i < 5; i++) g = step(g);
    expect(g.alive).toBe(false);
  });

  it("wraps in wrap mode", () => {
    let g = createGame("wrap", 5, 5);
    for (let i = 0; i < 10; i++) g = step(g);
    expect(g.alive).toBe(true);
  });

  it("grows and scores when eating food", () => {
    let g = createGame("wrap", 5, 5);
    g = { ...g, food: { x: g.snake[0].x + 1, y: g.snake[0].y } };
    g = step(g);
    expect(g.score).toBe(1);
    expect(g.snake).toHaveLength(2);
  });

  it("dies from self-collision", () => {
    // U-shaped snake; head (5,5) moves right into body cell (6,5).
    // Note: the tail gets popped, so (6,5) must NOT be the last cell.
    let g = createGame("wrap", 10, 10);
    g = {
      ...g,
      snake: [
        { x: 5, y: 5 }, // head
        { x: 5, y: 6 },
        { x: 6, y: 6 },
        { x: 6, y: 5 }, // body cell directly to the right of the head
        { x: 7, y: 5 },
        { x: 7, y: 6 }, // tail (gets popped)
      ],
      dir: "right",
      pendingDir: "right",
      food: { x: 0, y: 0 },
    };
    g = step(g);
    expect(g.alive).toBe(false);
  });
});
