import { describe, it, expect, beforeEach } from "vitest";
import { MockGameService } from "./mock";
import { createGame, step } from "@/game/snake";

function freshService() {
  localStorage.clear();
  return new MockGameService({ bots: false, seed: false });
}

describe("MockGameService", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("signup creates a session", async () => {
    const svc = freshService();
    const u = await svc.signup("alice", "pw");
    expect(u.username).toBe("alice");
    expect(svc.currentUser()?.username).toBe("alice");
  });

  it("rejects duplicate usernames", async () => {
    const svc = freshService();
    await svc.signup("a", "1");
    await expect(svc.signup("a", "2")).rejects.toThrow(/taken/i);
  });

  it("login validates credentials", async () => {
    const svc = freshService();
    await svc.signup("bob", "secret");
    await svc.logout();
    await expect(svc.login("bob", "wrong")).rejects.toThrow();
    const u = await svc.login("bob", "secret");
    expect(u.username).toBe("bob");
  });

  it("startGame requires auth", async () => {
    const svc = freshService();
    await expect(svc.startGame("walls")).rejects.toThrow(/auth/i);
  });

  it("endGame records the score on the leaderboard", async () => {
    const svc = freshService();
    await svc.signup("carol", "x");
    const id = await svc.startGame("walls");
    const state = { ...createGame("walls"), score: 42 };
    await svc.endGame(id, state);
    const lb = await svc.getLeaderboard("walls");
    expect(lb[0]).toMatchObject({ username: "carol", score: 42 });
  });

  it("leaderboard sorts descending and is mode-scoped", async () => {
    const svc = freshService();
    await svc.signup("a", "x");
    for (const [score, mode] of [[5, "walls"], [10, "walls"], [99, "wrap"]] as const) {
      const id = await svc.startGame(mode);
      await svc.endGame(id, { ...createGame(mode), score });
    }
    const walls = await svc.getLeaderboard("walls");
    expect(walls.map((e) => e.score)).toEqual([10, 5]);
    const wrap = await svc.getLeaderboard("wrap");
    expect(wrap[0].score).toBe(99);
  });

  it("watchGame streams pushed state", async () => {
    const svc = freshService();
    await svc.signup("p", "x");
    const id = await svc.startGame("wrap");
    const seen: number[] = [];
    svc.watchGame(id, (s) => { if (s) seen.push(s.score); });
    await svc.pushState(id, { ...createGame("wrap"), score: 1 });
    await svc.pushState(id, { ...createGame("wrap"), score: 2 });
    expect(seen).toEqual([0, 1, 2]);
  });

  it("listActiveGames reflects start/end", async () => {
    const svc = freshService();
    await svc.signup("p", "x");
    const before = (await svc.listActiveGames()).filter((g) => g.username === "p");
    expect(before).toHaveLength(0);
    const id = await svc.startGame("walls");
    const during = (await svc.listActiveGames()).filter((g) => g.username === "p");
    expect(during).toHaveLength(1);
    await svc.endGame(id, step(createGame("walls")));
    const after = (await svc.listActiveGames()).filter((g) => g.username === "p");
    expect(after).toHaveLength(0);
  });
});
