import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiGameService } from "./client";
import { createGame } from "@/game/snake";

class FakeStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class FakeEventSource {
  readonly listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();
  onerror: ((this: FakeEventSource, ev: Event) => unknown) | null = null;

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    const fn =
      typeof listener === "function"
        ? (listener as (event: MessageEvent<string>) => void)
        : ((event: MessageEvent<string>) => listener.handleEvent(event));
    const current = this.listeners.get(type) ?? [];
    current.push(fn);
    this.listeners.set(type, current);
  }

  close(): void {}

  emit(type: string, data: unknown) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data: JSON.stringify(data) } as MessageEvent<string>);
    }
  }
}

describe("ApiGameService", () => {
  const storage = new FakeStorage();
  const eventSources: FakeEventSource[] = [];
  const fetchMock = vi.fn<typeof fetch>();

  function makeService() {
    eventSources.length = 0;
    fetchMock.mockReset();
    storage.clear();

    return new ApiGameService({
      baseUrl: "http://api.example.test",
      fetchImpl: fetchMock,
      eventSourceFactory: (url) => {
        const source = new FakeEventSource(url);
        eventSources.push(source);
        return source;
      },
      storage,
    });
  }

  beforeEach(() => {
    fetchMock.mockReset();
    storage.clear();
    eventSources.length = 0;
  });

  it("logs in, stores auth state, and emits user changes", async () => {
    const svc = makeService();
    const seen: Array<string | null> = [];
    svc.onAuthChange((user) => seen.push(user?.username ?? null));

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          user: { id: "u_guest", username: "guest" },
          accessToken: "token-123",
          tokenType: "bearer",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const user = await svc.login("guest", "guest");

    expect(user).toEqual({ id: "u_guest", username: "guest" });
    expect(svc.currentUser()).toEqual({ id: "u_guest", username: "guest" });
    expect(storage.getItem("snake-api-token")).toBe("token-123");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.example.test/auth/login",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(seen).toEqual(["guest"]);
  });

  it("sends bearer tokens for protected requests", async () => {
    const svc = makeService();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            user: { id: "u_guest", username: "guest" },
            accessToken: "token-123",
            tokenType: "bearer",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "g_123" }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await svc.login("guest", "guest");
    const gameId = await svc.startGame("walls");

    expect(gameId).toBe("g_123");
    const secondCall = fetchMock.mock.calls[1];
    const headers = new Headers(secondCall?.[1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer token-123");
  });

  it("streams active game updates from the backend", () => {
    const svc = makeService();
    const seen: Array<{ id: string; score: number }> = [];

    const unsubscribe = svc.onActiveGamesChange((games) => {
      for (const game of games) seen.push({ id: game.id, score: game.score });
    });

    expect(eventSources[0]?.url).toBe("http://api.example.test/games/active/events");
    eventSources[0]?.emit("active-games", [
      { id: "g_seed_walls", username: "alice", mode: "walls", score: 2, startedAt: 1 },
    ]);

    expect(seen).toEqual([{ id: "g_seed_walls", score: 2 }]);
    unsubscribe();
  });

  it("loads and streams watched games", async () => {
    const svc = makeService();
    const initial = createGame("wrap");
    const next = { ...initial, score: 3, tick: initial.tick + 1 };
    const seen: Array<number | null> = [];

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(initial), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    svc.watchGame("g_123", (state) => {
      seen.push(state ? state.score : null);
    });

    await vi.waitFor(() => {
      expect(seen).toEqual([0]);
    });
    eventSources[0]?.emit("state", next);
    eventSources[0]?.emit("ended", null);

    expect(eventSources[0]?.url).toBe("http://api.example.test/games/g_123/events");
    expect(seen).toEqual([0, 3, null]);
  });

  it("defaults to the current origin when no api base url is configured", () => {
    const originalWindow = globalThis.window;
    try {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: { location: { origin: "https://snake.example.test" } },
      });

      const svc = new ApiGameService({
        fetchImpl: fetchMock,
        eventSourceFactory: (url) => {
          const source = new FakeEventSource(url);
          eventSources.push(source);
          return source;
        },
        storage,
      });

      svc.onActiveGamesChange(() => {});

      expect(eventSources[0]?.url).toBe("https://snake.example.test/games/active/events");
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});
