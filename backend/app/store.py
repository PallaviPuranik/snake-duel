from __future__ import annotations

import threading
from time import time
from uuid import uuid4

from .auth import TokenRecord, hash_password, new_access_token, new_token_record, verify_password
from .models import ActiveGame, Cell, GameState, LeaderboardEntry, Mode, User
from .store_base import LiveGameRecord, StoredUserRecord


class InMemoryStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._users: dict[str, StoredUserRecord] = {}
        self._tokens: dict[str, TokenRecord] = {}
        self._leaderboard: list[LeaderboardEntry] = []
        self._live_games: dict[str, LiveGameRecord] = {}
        self._ended_game_ids: set[str] = set()
        self._active_version = 0
        self._leaderboard_versions: dict[Mode, int] = {"walls": 0, "wrap": 0}
        self._game_versions: dict[str, int] = {}
        self.seed()

    def seed(self) -> None:
        now = int(time() * 1000)
        guest = self._seed_user("guest", "guest")
        alice = self._seed_user("alice", "hunter2")
        bob = self._seed_user("bob", "swordfish")
        self._seed_user("carol", "letmein")
        self._seed_user("spectator", "spectator")
        self._seed_user("demo", "demo")

        self._leaderboard = [
            LeaderboardEntry(username="alice", score=24, mode="walls", at=now - 86_400_000),
            LeaderboardEntry(username="bob", score=18, mode="walls", at=now - 3_600_000),
            LeaderboardEntry(username="carol", score=31, mode="wrap", at=now - 7_200_000),
            LeaderboardEntry(username="guest", score=12, mode="wrap", at=now - 300_000),
        ]
        self._leaderboard_versions = {"walls": 1, "wrap": 1}

        self._add_seed_game(
            game_id="g_seed_walls",
            user=alice,
            mode="walls",
            started_at=now - 45_000,
            state=create_game_state(
                mode="walls",
                snake=[Cell(x=10, y=10), Cell(x=9, y=10), Cell(x=8, y=10)],
                food=Cell(x=13, y=10),
                score=2,
                tick=18,
            ),
        )
        self._add_seed_game(
            game_id="g_seed_wrap",
            user=bob,
            mode="wrap",
            started_at=now - 20_000,
            state=create_game_state(
                mode="wrap",
                snake=[Cell(x=3, y=4), Cell(x=3, y=3), Cell(x=3, y=2), Cell(x=2, y=2)],
                food=Cell(x=6, y=4),
                score=5,
                tick=27,
                dir="down",
                pending_dir="down",
            ),
        )
        self._active_version = 1
        self._game_versions["g_seed_walls"] = 1
        self._game_versions["g_seed_wrap"] = 1

    def _seed_user(self, username: str, password: str) -> StoredUserRecord:
        user = StoredUserRecord(
            id=f"u_{uuid4().hex[:8]}",
            username=username,
            password_hash=hash_password(password),
        )
        self._users[user.id] = user
        return user

    def _add_seed_game(
        self,
        *,
        game_id: str,
        user: StoredUserRecord,
        mode: Mode,
        started_at: int,
        state: GameState,
    ) -> None:
        self._live_games[game_id] = LiveGameRecord(
            id=game_id,
            user_id=user.id,
            username=user.username,
            mode=mode,
            state=state,
            started_at=started_at,
        )

    def public_user(self, stored_user: StoredUserRecord) -> User:
        return User(id=stored_user.id, username=stored_user.username)

    def find_user_by_username(self, username: str) -> StoredUserRecord | None:
        normalized = username.strip().lower()
        for user in self._users.values():
            if user.username.lower() == normalized:
                return user
        return None

    def create_user(self, username: str, password: str) -> User:
        normalized = username.strip()
        if not normalized or not password:
            raise ValueError("Username and password required")
        with self._lock:
            if self.find_user_by_username(normalized) is not None:
                raise ValueError("Username already taken")
            stored_user = StoredUserRecord(
                id=f"u_{uuid4().hex[:8]}",
                username=normalized,
                password_hash=hash_password(password),
            )
            self._users[stored_user.id] = stored_user
            return self.public_user(stored_user)

    def authenticate(self, username: str, password: str) -> User | None:
        with self._lock:
            stored_user = self.find_user_by_username(username)
            if stored_user is None or not verify_password(password, stored_user.password_hash):
                return None
            return self.public_user(stored_user)

    def issue_token(self, user_id: str) -> str:
        token = new_access_token()
        with self._lock:
            self._tokens[token] = new_token_record(user_id)
        return token

    def revoke_token(self, token: str) -> None:
        with self._lock:
            self._tokens.pop(token, None)

    def user_from_token(self, token: str) -> User | None:
        with self._lock:
            record = self._tokens.get(token)
            if record is None:
                return None
            if record.expires_at <= int(time()):
                self._tokens.pop(token, None)
                return None
            stored_user = self._users.get(record.user_id)
            if stored_user is None:
                return None
            return self.public_user(stored_user)

    def create_game(self, user: User, mode: Mode) -> str:
        game_id = f"g_{uuid4().hex[:8]}"
        with self._lock:
            self._live_games[game_id] = LiveGameRecord(
                id=game_id,
                user_id=user.id,
                username=user.username,
                mode=mode,
                state=create_game_state(mode=mode),
                started_at=int(time() * 1000),
            )
            self._game_versions[game_id] = 1
            self._active_version += 1
            return game_id

    def list_active_games(self) -> list[ActiveGame]:
        with self._lock:
            return [
                ActiveGame(
                    id=game.id,
                    username=game.username,
                    mode=game.mode,
                    score=game.state.score,
                    startedAt=game.started_at,
                )
                for game in self._live_games.values()
            ]

    def active_version(self) -> int:
        return self._active_version

    def get_game_state(self, game_id: str) -> GameState | None:
        with self._lock:
            game = self._live_games.get(game_id)
            if game is None:
                return None
            return game.state.model_copy(deep=True)

    def is_ended_game(self, game_id: str) -> bool:
        with self._lock:
            return game_id in self._ended_game_ids

    def update_game_state(self, game_id: str, user: User, state: GameState) -> None:
        with self._lock:
            game = self._live_games.get(game_id)
            if game is None:
                raise KeyError(game_id)
            if game.user_id != user.id:
                raise PermissionError("You cannot update another player's game")
            game.state = state
            self._game_versions[game_id] = self._game_versions.get(game_id, 0) + 1
            self._active_version += 1

    def complete_game(self, game_id: str, user: User, final_state: GameState) -> None:
        with self._lock:
            game = self._live_games.get(game_id)
            if game is None:
                raise KeyError(game_id)
            if game.user_id != user.id:
                raise PermissionError("You cannot complete another player's game")

            game.state = final_state
            self._leaderboard.append(
                LeaderboardEntry(
                    username=game.username,
                    score=final_state.score,
                    mode=game.mode,
                    at=int(time() * 1000),
                )
            )
            self._leaderboard_versions[game.mode] += 1
            self._game_versions[game_id] = self._game_versions.get(game_id, 0) + 1
            self._active_version += 1
            self._ended_game_ids.add(game_id)
            self._live_games.pop(game_id, None)

    def game_version(self, game_id: str) -> int:
        with self._lock:
            return self._game_versions.get(game_id, 0)

    def leaderboard_version(self, mode: Mode) -> int:
        return self._leaderboard_versions[mode]

    def list_leaderboard(self, mode: Mode, limit: int = 10) -> list[LeaderboardEntry]:
        with self._lock:
            return sorted(
                (entry for entry in self._leaderboard if entry.mode == mode),
                key=lambda entry: (-entry.score, entry.at),
            )[:limit]


def create_game_state(
    *,
    mode: Mode,
    snake: list[Cell] | None = None,
    food: Cell | None = None,
    score: int = 0,
    tick: int = 0,
    dir: str = "right",
    pending_dir: str = "right",
    width: int = 20,
    height: int = 20,
    alive: bool = True,
) -> GameState:
    body = snake or [Cell(x=width // 2, y=height // 2)]
    return GameState(
        width=width,
        height=height,
        mode=mode,
        snake=body,
        dir=dir,
        pendingDir=pending_dir,
        food=food or Cell(x=min(width - 1, body[0].x + 2), y=body[0].y),
        score=score,
        alive=alive,
        tick=tick,
    )
