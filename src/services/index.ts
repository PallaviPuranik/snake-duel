import { MockGameService } from "./mock";
import type { GameService } from "./types";

let _service: GameService | null = null;

export function getService(): GameService {
  if (!_service) _service = new MockGameService();
  return _service;
}

// for tests
export function __setService(s: GameService | null) {
  _service = s;
}

export type { GameService } from "./types";
export * from "./types";
