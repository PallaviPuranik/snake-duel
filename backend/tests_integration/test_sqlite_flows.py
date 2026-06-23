import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app import create_app
from app.sqlite_store import SQLiteStore


class SQLiteIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self._temp_dir = tempfile.TemporaryDirectory()
        db_path = Path(self._temp_dir.name) / "integration.sqlite3"
        self.store = SQLiteStore(str(db_path), seed=False)
        self.client = TestClient(create_app(store=self.store))

    def tearDown(self) -> None:
        self.store.close()
        self._temp_dir.cleanup()

    def auth_headers(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    def test_signup_login_submit_score_and_read_leaderboard(self) -> None:
        signup_response = self.client.post(
            "/auth/signup",
            json={"username": "integration-player", "password": "secret-pass"},
        )
        self.assertEqual(signup_response.status_code, 201)
        self.assertEqual(signup_response.json()["user"]["username"], "integration-player")

        logout_response = self.client.post(
            "/auth/logout",
            headers=self.auth_headers(signup_response.json()["accessToken"]),
        )
        self.assertEqual(logout_response.status_code, 204)

        login_response = self.client.post(
            "/auth/login",
            json={"username": "integration-player", "password": "secret-pass"},
        )
        self.assertEqual(login_response.status_code, 200)
        token = login_response.json()["accessToken"]

        create_game_response = self.client.post(
            "/games",
            json={"mode": "walls"},
            headers=self.auth_headers(token),
        )
        self.assertEqual(create_game_response.status_code, 201)
        game_id = create_game_response.json()["id"]

        state_response = self.client.get(f"/games/{game_id}")
        self.assertEqual(state_response.status_code, 200)
        state = state_response.json()
        state["score"] = 57
        state["tick"] += 1

        update_response = self.client.put(
            f"/games/{game_id}/state",
            json={"state": state},
            headers=self.auth_headers(token),
        )
        self.assertEqual(update_response.status_code, 204)

        complete_response = self.client.post(
            f"/games/{game_id}/complete",
            json={"finalState": state},
            headers=self.auth_headers(token),
        )
        self.assertEqual(complete_response.status_code, 204)

        leaderboard_response = self.client.get("/leaderboard", params={"mode": "walls"})
        self.assertEqual(leaderboard_response.status_code, 200)
        self.assertEqual(
            leaderboard_response.json(),
            [
                {
                    "username": "integration-player",
                    "score": 57,
                    "mode": "walls",
                    "at": leaderboard_response.json()[0]["at"],
                }
            ],
        )


if __name__ == "__main__":
    unittest.main()
