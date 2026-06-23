import type { GameState, Mode } from "@/game/snake";
import type {
  ActiveGame,
  GameService,
  LeaderboardEntry,
  Unsubscribe,
  User,
} from "./types";

const TOKEN_STORAGE_KEY = "snake-api-token";
const USER_STORAGE_KEY = "snake-api-user";
const DEFAULT_API_BASE_URL = "http://localhost:8000";

interface AuthResponse {
  user: User;
  accessToken: string;
  tokenType: "bearer";
}

interface SessionResponse {
  user: User | null;
}

interface EventSourceLike {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  close(): void;
  onerror: ((this: EventSourceLike, ev: Event) => unknown) | null;
}

interface ClientOptions {
  baseUrl?: string;
  eventSourceFactory?: (url: string) => EventSourceLike;
  fetchImpl?: typeof fetch;
  storage?: Storage | null;
}

class Emitter<T> {
  private listeners = new Set<(value: T) => void>();

  on(cb: (value: T) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit(value: T) {
    this.listeners.forEach((cb) => cb(value));
  }
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getDefaultStorage(): Storage | null {
  return typeof localStorage === "undefined" ? null : localStorage;
}

function getDefaultEventSource(url: string): EventSourceLike {
  return new EventSource(url);
}

function getDefaultBaseUrl(): string {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL;
  if (configuredBaseUrl) return configuredBaseUrl;
  if (typeof window !== "undefined") return window.location.origin;
  return DEFAULT_API_BASE_URL;
}

function readUser(storage: Storage | null): User | null {
  if (!storage) return null;
  const raw = storage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    storage.removeItem(USER_STORAGE_KEY);
    return null;
  }
}

export class ApiGameService implements GameService {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly eventSourceFactory: (url: string) => EventSourceLike;
  private readonly storage: Storage | null;
  private readonly authEmitter = new Emitter<User | null>();
  private token: string | null;
  private user: User | null;

  constructor(opts: ClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? getDefaultBaseUrl();
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.eventSourceFactory = opts.eventSourceFactory ?? getDefaultEventSource;
    this.storage = opts.storage ?? getDefaultStorage();
    this.token = this.storage?.getItem(TOKEN_STORAGE_KEY) ?? null;
    this.user = readUser(this.storage);

    if (this.token) {
      void this.refreshSession();
    }
  }

  currentUser(): User | null {
    return this.user;
  }

  async signup(username: string, password: string): Promise<User> {
    const response = await this.request<AuthResponse>("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    this.setAuth(response.user, response.accessToken);
    return response.user;
  }

  async login(username: string, password: string): Promise<User> {
    const response = await this.request<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    this.setAuth(response.user, response.accessToken);
    return response.user;
  }

  async logout(): Promise<void> {
    await this.request("/auth/logout", { method: "POST" }, { auth: true });
    this.clearAuth();
  }

  onAuthChange(cb: (u: User | null) => void): Unsubscribe {
    return this.authEmitter.on(cb);
  }

  async startGame(mode: Mode): Promise<string> {
    const response = await this.request<{ id: string }>(
      "/games",
      {
        method: "POST",
        body: JSON.stringify({ mode }),
      },
      { auth: true },
    );
    return response.id;
  }

  async pushState(gameId: string, state: GameState): Promise<void> {
    await this.request(
      `/games/${gameId}/state`,
      {
        method: "PUT",
        body: JSON.stringify({ state }),
      },
      { auth: true },
    );
  }

  async endGame(gameId: string, finalState: GameState): Promise<void> {
    await this.request(
      `/games/${gameId}/complete`,
      {
        method: "POST",
        body: JSON.stringify({ finalState }),
      },
      { auth: true },
    );
  }

  async listActiveGames(): Promise<ActiveGame[]> {
    return this.request<ActiveGame[]>("/games/active");
  }

  onActiveGamesChange(cb: (g: ActiveGame[]) => void): Unsubscribe {
    const source = this.eventSourceFactory(this.toUrl("/games/active/events"));
    source.addEventListener("active-games", (event) => {
      cb(JSON.parse((event as MessageEvent<string>).data) as ActiveGame[]);
    });
    source.onerror = (event) => {
      console.error("Active games stream failed", event);
    };
    return () => source.close();
  }

  watchGame(gameId: string, cb: (state: GameState | null) => void): Unsubscribe {
    void this.request<GameState>(`/games/${gameId}`)
      .then((state) => cb(state))
      .catch((error: unknown) => {
        if (error instanceof ApiError && (error.status === 404 || error.status === 410)) {
          cb(null);
          return;
        }
        console.error("Failed to load game", error);
      });

    const source = this.eventSourceFactory(this.toUrl(`/games/${gameId}/events`));
    source.addEventListener("state", (event) => {
      cb(JSON.parse((event as MessageEvent<string>).data) as GameState);
    });
    source.addEventListener("ended", () => {
      cb(null);
      source.close();
    });
    source.onerror = (event) => {
      console.error("Game watch stream failed", event);
    };
    return () => source.close();
  }

  async getLeaderboard(mode: Mode, limit = 10): Promise<LeaderboardEntry[]> {
    const params = new URLSearchParams({ mode, limit: String(limit) });
    return this.request<LeaderboardEntry[]>(`/leaderboard?${params.toString()}`);
  }

  onLeaderboardChange(mode: Mode, cb: (entries: LeaderboardEntry[]) => void): Unsubscribe {
    const params = new URLSearchParams({ mode });
    const source = this.eventSourceFactory(this.toUrl(`/leaderboard/events?${params.toString()}`));
    source.addEventListener("leaderboard", (event) => {
      cb(JSON.parse((event as MessageEvent<string>).data) as LeaderboardEntry[]);
    });
    source.onerror = (event) => {
      console.error("Leaderboard stream failed", event);
    };
    return () => source.close();
  }

  private async refreshSession(): Promise<void> {
    try {
      const response = await this.request<SessionResponse>("/auth/session", undefined, { auth: true });
      if (response.user) {
        this.setAuth(response.user, this.token);
      } else {
        this.clearAuth();
      }
    } catch (error) {
      console.error("Failed to refresh session", error);
      this.clearAuth();
    }
  }

  private setAuth(user: User, token: string | null) {
    this.user = user;
    this.token = token;
    this.storage?.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    if (token) this.storage?.setItem(TOKEN_STORAGE_KEY, token);
    else this.storage?.removeItem(TOKEN_STORAGE_KEY);
    this.authEmitter.emit(user);
  }

  private clearAuth() {
    this.user = null;
    this.token = null;
    this.storage?.removeItem(USER_STORAGE_KEY);
    this.storage?.removeItem(TOKEN_STORAGE_KEY);
    this.authEmitter.emit(null);
  }

  private toUrl(path: string): string {
    return new URL(path, `${this.baseUrl}/`).toString();
  }

  private async request<T>(
    path: string,
    init?: RequestInit,
    options: { auth?: boolean } = {},
  ): Promise<T> {
    const headers = new Headers(init?.headers ?? {});
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (options.auth) {
      if (!this.token) {
        throw new Error("Not authenticated");
      }
      headers.set("Authorization", `Bearer ${this.token}`);
    }

    const response = await this.fetchImpl(this.toUrl(path), {
      ...init,
      headers,
    });

    if (!response.ok) {
      if (response.status === 401 && options.auth) {
        this.clearAuth();
      }
      let message = `${response.status} ${response.statusText}`;
      try {
        const payload = (await response.json()) as { error?: string };
        if (payload.error) message = payload.error;
      } catch {
        // keep HTTP status text when the response has no JSON body
      }
      throw new ApiError(message, response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }
}
