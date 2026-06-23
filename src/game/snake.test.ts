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
    // build a snake that will collide with itself
    let g = createGame("wrap", 10, 10);
    g = {
      ...g,
      snake: [
        { x: 5, y: 5 },
        { x: 4, y: 5 },
        { x: 4, y: 6 },
        { x: 5, y: 6 },
        { x: 6, y: 6 },
        { x: 6, y: 5 },
      ],
      dir: "up",
      pendingDir: "up",
      food: { x: 0, y: 0 },
    };
    // moving up from (5,5)... that's free. let me make it move down into body
    g = setDir({ ...g, dir: "right", pendingDir: "right" }, "right");
    // simpler: head (5,5) moving right hits (6,5) which is body
    g = { ...g, dir: "right", pendingDir: "right" };
    g = step(g);
    expect(g.alive).toBe(false);
  });
});
