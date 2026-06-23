import type { GameState, Mode } from "@/game/snake";

export interface User {
  id: string;
  username: string;
}

export interface LeaderboardEntry {
  username: string;
  score: number;
  mode: Mode;
  at: number;
}

export interface ActiveGame {
  id: string;
  username: string;
  mode: Mode;
  score: number;
  startedAt: number;
}

export type Unsubscribe = () => void;

export interface GameService {
  // auth
  currentUser(): User | null;
  signup(username: string, password: string): Promise<User>;
  login(username: string, password: string): Promise<User>;
  logout(): Promise<void>;
  onAuthChange(cb: (u: User | null) => void): Unsubscribe;

  // games
  startGame(mode: Mode): Promise<string>;
  pushState(gameId: string, state: GameState): Promise<void>;
  endGame(gameId: string, finalState: GameState): Promise<void>;

  // discovery
  listActiveGames(): Promise<ActiveGame[]>;
  onActiveGamesChange(cb: (g: ActiveGame[]) => void): Unsubscribe;
  watchGame(
    gameId: string,
    cb: (state: GameState | null) => void,
  ): Unsubscribe;

  // leaderboard
  getLeaderboard(mode: Mode, limit?: number): Promise<LeaderboardEntry[]>;
  onLeaderboardChange(
    mode: Mode,
    cb: (entries: LeaderboardEntry[]) => void,
  ): Unsubscribe;
}
