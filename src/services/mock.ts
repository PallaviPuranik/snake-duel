import type { GameState, Mode } from "@/game/snake";
import { createGame, step } from "@/game/snake";
import type {
  ActiveGame,
  GameService,
  LeaderboardEntry,
  Unsubscribe,
  User,
} from "./types";

interface StoredUser {
  id: string;
  username: string;
  password: string;
}

interface LiveGame {
  id: string;
  user: User;
  mode: Mode;
  state: GameState;
  startedAt: number;
  bot: boolean;
}

const STORAGE_KEY = "snake-mock-db-v1";

interface DB {
  users: StoredUser[];
  leaderboard: LeaderboardEntry[];
  sessionUserId: string | null;
}

function loadDB(seed = true): DB {
  if (typeof localStorage === "undefined") {
    return { users: [], leaderboard: [], sessionUserId: null };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DB;
  } catch {}
  const empty: DB = { users: [], leaderboard: [], sessionUserId: null };
  if (!seed) return empty;
  const seeded: DB = {
    users: [{ id: "u_seed1", username: "guest", password: "guest" }],
    leaderboard: [
      { username: "alice", score: 24, mode: "walls", at: Date.now() - 86400000 },
      { username: "bob", score: 18, mode: "walls", at: Date.now() - 3600000 },
      { username: "carol", score: 31, mode: "wrap", at: Date.now() - 7200000 },
      { username: "dave", score: 12, mode: "wrap", at: Date.now() - 60000 },
    ],
    sessionUserId: null,
  };
  saveDB(seeded);
  return seeded;
}

function saveDB(db: DB) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }
}

class Emitter<T> {
  private listeners = new Set<(v: T) => void>();
  on(cb: (v: T) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  emit(v: T) {
    this.listeners.forEach((cb) => cb(v));
  }
}

export class MockGameService implements GameService {
  private db: DB;
  private liveGames = new Map<string, LiveGame>();
  private authEmitter = new Emitter<User | null>();
  private activeEmitter = new Emitter<ActiveGame[]>();
  private leaderboardEmitter = new Emitter<LeaderboardEntry[]>();
  private gameEmitters = new Map<string, Emitter<GameState | null>>();
  private botTimer: ReturnType<typeof setInterval> | null = null;

  constructor(opts: { bots?: boolean; seed?: boolean } = {}) {
    this.db = loadDB(opts.seed ?? true);
    if (opts.bots ?? (typeof window !== "undefined")) {
      this.spawnBot("CobraBot", "walls");
      this.spawnBot("ViperBot", "wrap");
      this.botTimer = setInterval(() => this.tickBots(), 200);
    }
  }

  // ---------- auth ----------
  currentUser(): User | null {
    const id = this.db.sessionUserId;
    if (!id) return null;
    const u = this.db.users.find((x) => x.id === id);
    return u ? { id: u.id, username: u.username } : null;
  }

  async signup(username: string, password: string): Promise<User> {
    await delay();
    username = username.trim();
    if (!username || !password) throw new Error("Username and password required");
    if (this.db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
      throw new Error("Username already taken");
    }
    const user: StoredUser = {
      id: "u_" + Math.random().toString(36).slice(2, 10),
      username,
      password,
    };
    this.db.users.push(user);
    this.db.sessionUserId = user.id;
    saveDB(this.db);
    const pub = { id: user.id, username: user.username };
    this.authEmitter.emit(pub);
    return pub;
  }

  async login(username: string, password: string): Promise<User> {
    await delay();
    const u = this.db.users.find(
      (x) => x.username.toLowerCase() === username.toLowerCase() && x.password === password,
    );
    if (!u) throw new Error("Invalid credentials");
    this.db.sessionUserId = u.id;
    saveDB(this.db);
    const pub = { id: u.id, username: u.username };
    this.authEmitter.emit(pub);
    return pub;
  }

  async logout(): Promise<void> {
    this.db.sessionUserId = null;
    saveDB(this.db);
    this.authEmitter.emit(null);
  }

  onAuthChange(cb: (u: User | null) => void): Unsubscribe {
    return this.authEmitter.on(cb);
  }

  // ---------- games ----------
  async startGame(mode: Mode): Promise<string> {
    const user = this.currentUser();
    if (!user) throw new Error("Not authenticated");
    const id = "g_" + Math.random().toString(36).slice(2, 10);
    const game: LiveGame = {
      id,
      user,
      mode,
      state: createGame(mode),
      startedAt: Date.now(),
      bot: false,
    };
    this.liveGames.set(id, game);
    this.emitActive();
    return id;
  }

  async pushState(gameId: string, state: GameState): Promise<void> {
    const g = this.liveGames.get(gameId);
    if (!g) return;
    g.state = state;
    this.gameEmitters.get(gameId)?.emit(state);
    this.emitActive();
  }

  async endGame(gameId: string, finalState: GameState): Promise<void> {
    const g = this.liveGames.get(gameId);
    if (!g) return;
    g.state = finalState;
    this.gameEmitters.get(gameId)?.emit(finalState);
    this.db.leaderboard.push({
      username: g.user.username,
      mode: g.mode,
      score: finalState.score,
      at: Date.now(),
    });
    saveDB(this.db);
    this.liveGames.delete(gameId);
    this.gameEmitters.get(gameId)?.emit(null);
    this.emitActive();
    this.leaderboardEmitter.emit(
      [...this.db.leaderboard].filter((e) => e.mode === g.mode),
    );
  }

  // ---------- discovery ----------
  async listActiveGames(): Promise<ActiveGame[]> {
    return this.activeSnapshot();
  }

  private activeSnapshot(): ActiveGame[] {
    return Array.from(this.liveGames.values()).map((g) => ({
      id: g.id,
      username: g.user.username,
      mode: g.mode,
      score: g.state.score,
      startedAt: g.startedAt,
    }));
  }

  private emitActive() {
    this.activeEmitter.emit(this.activeSnapshot());
  }

  onActiveGamesChange(cb: (g: ActiveGame[]) => void): Unsubscribe {
    cb(this.activeSnapshot());
    return this.activeEmitter.on(cb);
  }

  watchGame(gameId: string, cb: (state: GameState | null) => void): Unsubscribe {
    let em = this.gameEmitters.get(gameId);
    if (!em) {
      em = new Emitter<GameState | null>();
      this.gameEmitters.set(gameId, em);
    }
    const g = this.liveGames.get(gameId);
    cb(g ? g.state : null);
    return em.on(cb);
  }

  // ---------- leaderboard ----------
  async getLeaderboard(mode: Mode, limit = 10): Promise<LeaderboardEntry[]> {
    return [...this.db.leaderboard]
      .filter((e) => e.mode === mode)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  onLeaderboardChange(
    mode: Mode,
    cb: (entries: LeaderboardEntry[]) => void,
  ): Unsubscribe {
    return this.leaderboardEmitter.on((entries) => {
      if (entries[0]?.mode === mode || entries.length === 0) {
        this.getLeaderboard(mode).then(cb);
      }
    });
  }

  // ---------- bot simulation (mock only) ----------
  private spawnBot(name: string, mode: Mode) {
    const id = "g_bot_" + name;
    this.liveGames.set(id, {
      id,
      user: { id: "bot_" + name, username: name },
      mode,
      state: createGame(mode),
      startedAt: Date.now(),
      bot: true,
    });
  }

  private tickBots() {
    let changed = false;
    for (const g of this.liveGames.values()) {
      if (!g.bot) continue;
      changed = true;
      // simple bot: head toward food
      const head = g.state.snake[0];
      const food = g.state.food;
      let dir = g.state.dir;
      if (food.x !== head.x) dir = food.x > head.x ? "right" : "left";
      else if (food.y !== head.y) dir = food.y > head.y ? "down" : "up";
      g.state = { ...g.state, pendingDir: dir };
      g.state = step(g.state);
      if (!g.state.alive) {
        g.state = createGame(g.mode);
      }
      this.gameEmitters.get(g.id)?.emit(g.state);
    }
    if (changed) this.emitActive();
  }

  dispose() {
    if (this.botTimer) clearInterval(this.botTimer);
  }
}

function delay(ms = 80) {
  return new Promise((r) => setTimeout(r, ms));
}
