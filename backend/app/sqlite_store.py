from __future__ import annotations
import sqlite3
import threading
from time import time
from uuid import uuid4

from .auth import hash_password, new_access_token, new_token_record, verify_password
from .models import ActiveGame, Cell, GameState, LeaderboardEntry, Mode, User
from .store import create_game_state
from .store_base import StoredUserRecord


class SQLiteStore:
    def __init__(self, database_path: str, *, seed: bool = True) -> None:
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(database_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._active_version = 0
        self._leaderboard_versions: dict[Mode, int] = {"walls": 0, "wrap": 0}
        self._game_versions: dict[str, int] = {}
        self._initialize_schema()
        if seed:
            self.seed()

    def close(self) -> None:
        self._conn.close()

    def _initialize_schema(self) -> None:
        with self._conn:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS tokens (
                    token TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    expires_at INTEGER NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                );

                CREATE TABLE IF NOT EXISTS leaderboard_entries (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL,
                    score INTEGER NOT NULL,
                    mode TEXT NOT NULL,
                    at INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS live_games (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    username TEXT NOT NULL,
                    mode TEXT NOT NULL,
                    state_json TEXT NOT NULL,
                    started_at INTEGER NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id)
                );

                CREATE TABLE IF NOT EXISTS ended_games (
                    game_id TEXT PRIMARY KEY
                );
                """
            )

    def seed(self) -> None:
        with self._lock:
            existing = self._conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            if existing:
                return

            now = int(time() * 1000)
            self._seed_user("guest", "guest")
            alice = self._seed_user("alice", "hunter2")
            bob = self._seed_user("bob", "swordfish")
            self._seed_user("carol", "letmein")
            self._seed_user("spectator", "spectator")
            self._seed_user("demo", "demo")

            with self._conn:
                self._conn.executemany(
                    """
                    INSERT INTO leaderboard_entries (username, score, mode, at)
                    VALUES (?, ?, ?, ?)
                    """,
                    [
                        ("alice", 24, "walls", now - 86_400_000),
                        ("bob", 18, "walls", now - 3_600_000),
                        ("carol", 31, "wrap", now - 7_200_000),
                        ("guest", 12, "wrap", now - 300_000),
                    ],
                )

            self._leaderboard_versions = {"walls": 1, "wrap": 1}
            self._insert_live_game(
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
            self._insert_live_game(
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
            self._conn.commit()

    def _seed_user(self, username: str, password: str) -> StoredUserRecord:
        user = StoredUserRecord(
            id=f"u_{uuid4().hex[:8]}",
            username=username,
            password_hash=hash_password(password),
        )
        self._insert_user(user)
        return user

    def _insert_user(self, user: StoredUserRecord) -> None:
        with self._conn:
            self._conn.execute(
                "INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
                (user.id, user.username, user.password_hash),
            )

    def _insert_live_game(
        self,
        *,
        game_id: str,
        user: StoredUserRecord,
        mode: Mode,
        started_at: int,
        state: GameState,
    ) -> None:
        with self._conn:
            self._conn.execute(
                """
                INSERT INTO live_games (id, user_id, username, mode, state_json, started_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    game_id,
                    user.id,
                    user.username,
                    mode,
                    state.model_dump_json(),
                    started_at,
                ),
            )

    def public_user(self, stored_user: StoredUserRecord) -> User:
        return User(id=stored_user.id, username=stored_user.username)

    def _row_to_user(self, row: sqlite3.Row | None) -> StoredUserRecord | None:
        if row is None:
            return None
        return StoredUserRecord(
            id=row["id"],
            username=row["username"],
            password_hash=row["password_hash"],
        )

    def find_user_by_username(self, username: str) -> StoredUserRecord | None:
        normalized = username.strip().lower()
        row = self._conn.execute(
            "SELECT id, username, password_hash FROM users WHERE lower(username) = ?",
            (normalized,),
        ).fetchone()
        return self._row_to_user(row)

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
            self._insert_user(stored_user)
            return self.public_user(stored_user)

    def authenticate(self, username: str, password: str) -> User | None:
        with self._lock:
            stored_user = self.find_user_by_username(username)
            if stored_user is None or not verify_password(password, stored_user.password_hash):
                return None
            return self.public_user(stored_user)

    def issue_token(self, user_id: str) -> str:
        token = new_access_token()
        record = new_token_record(user_id)
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO tokens (token, user_id, expires_at) VALUES (?, ?, ?)",
                (token, record.user_id, record.expires_at),
            )
        return token

    def revoke_token(self, token: str) -> None:
        with self._lock, self._conn:
            self._conn.execute("DELETE FROM tokens WHERE token = ?", (token,))

    def user_from_token(self, token: str) -> User | None:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT t.user_id, t.expires_at, u.username, u.password_hash
                FROM tokens t
                JOIN users u ON u.id = t.user_id
                WHERE t.token = ?
                """,
                (token,),
            ).fetchone()
            if row is None:
                return None
            if row["expires_at"] <= int(time()):
                self._conn.execute("DELETE FROM tokens WHERE token = ?", (token,))
                self._conn.commit()
                return None
            return User(id=row["user_id"], username=row["username"])

    def create_game(self, user: User, mode: Mode) -> str:
        game_id = f"g_{uuid4().hex[:8]}"
        state = create_game_state(mode=mode)
        with self._lock:
            with self._conn:
                self._conn.execute(
                    """
                    INSERT INTO live_games (id, user_id, username, mode, state_json, started_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        game_id,
                        user.id,
                        user.username,
                        mode,
                        state.model_dump_json(),
                        int(time() * 1000),
                    ),
                )
            self._game_versions[game_id] = 1
            self._active_version += 1
        return game_id

    def list_active_games(self) -> list[ActiveGame]:
        rows = self._conn.execute(
            "SELECT id, username, mode, state_json, started_at FROM live_games ORDER BY started_at ASC"
        ).fetchall()
        active_games: list[ActiveGame] = []
        for row in rows:
            state = GameState.model_validate_json(row["state_json"])
            active_games.append(
                ActiveGame(
                    id=row["id"],
                    username=row["username"],
                    mode=row["mode"],
                    score=state.score,
                    startedAt=row["started_at"],
                )
            )
        return active_games

    def active_version(self) -> int:
        return self._active_version

    def get_game_state(self, game_id: str) -> GameState | None:
        row = self._conn.execute(
            "SELECT state_json FROM live_games WHERE id = ?",
            (game_id,),
        ).fetchone()
        if row is None:
            return None
        return GameState.model_validate_json(row["state_json"])

    def is_ended_game(self, game_id: str) -> bool:
        row = self._conn.execute(
            "SELECT 1 FROM ended_games WHERE game_id = ?",
            (game_id,),
        ).fetchone()
        return row is not None

    def update_game_state(self, game_id: str, user: User, state: GameState) -> None:
        with self._lock:
            row = self._conn.execute(
                "SELECT user_id FROM live_games WHERE id = ?",
                (game_id,),
            ).fetchone()
            if row is None:
                raise KeyError(game_id)
            if row["user_id"] != user.id:
                raise PermissionError("You cannot update another player's game")
            with self._conn:
                self._conn.execute(
                    "UPDATE live_games SET state_json = ? WHERE id = ?",
                    (state.model_dump_json(), game_id),
                )
            self._game_versions[game_id] = self._game_versions.get(game_id, 0) + 1
            self._active_version += 1

    def complete_game(self, game_id: str, user: User, final_state: GameState) -> None:
        with self._lock:
            row = self._conn.execute(
                "SELECT user_id, username, mode FROM live_games WHERE id = ?",
                (game_id,),
            ).fetchone()
            if row is None:
                raise KeyError(game_id)
            if row["user_id"] != user.id:
                raise PermissionError("You cannot complete another player's game")

            with self._conn:
                self._conn.execute(
                    """
                    INSERT INTO leaderboard_entries (username, score, mode, at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        row["username"],
                        final_state.score,
                        row["mode"],
                        int(time() * 1000),
                    ),
                )
                self._conn.execute("DELETE FROM live_games WHERE id = ?", (game_id,))
                self._conn.execute("INSERT OR REPLACE INTO ended_games (game_id) VALUES (?)", (game_id,))
            self._leaderboard_versions[row["mode"]] += 1
            self._game_versions[game_id] = self._game_versions.get(game_id, 0) + 1
            self._active_version += 1

    def game_version(self, game_id: str) -> int:
        return self._game_versions.get(game_id, 0)

    def leaderboard_version(self, mode: Mode) -> int:
        return self._leaderboard_versions[mode]

    def list_leaderboard(self, mode: Mode, limit: int = 10) -> list[LeaderboardEntry]:
        rows = self._conn.execute(
            """
            SELECT username, score, mode, at
            FROM leaderboard_entries
            WHERE mode = ?
            ORDER BY score DESC, at ASC
            LIMIT ?
            """,
            (mode, limit),
        ).fetchall()
        return [
            LeaderboardEntry(
                username=row["username"],
                score=row["score"],
                mode=row["mode"],
                at=row["at"],
            )
            for row in rows
        ]
