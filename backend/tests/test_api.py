import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from app import create_app
from app.auth import verify_password


class SnakeArenaAPITests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(create_app())

    def auth_headers(self, token: str) -> dict[str, str]:
        return {"Authorization": f"Bearer {token}"}

    def login(self, username: str = "guest", password: str = "guest") -> str:
        response = self.client.post(
            "/auth/login",
            json={"username": username, "password": password},
        )
        self.assertEqual(response.status_code, 200)
        return response.json()["accessToken"]

    def test_session_without_token_returns_null_user(self) -> None:
        response = self.client.get("/auth/session")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"user": None})

    def test_signup_hashes_password_and_returns_bearer_token(self) -> None:
        response = self.client.post(
            "/auth/signup",
            json={"username": "newcomer", "password": "supersecret"},
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["user"]["username"], "newcomer")
        self.assertEqual(body["tokenType"], "bearer")
        self.assertTrue(body["accessToken"])

        stored_user = self.client.app.state.store.find_user_by_username("newcomer")
        self.assertIsNotNone(stored_user)
        self.assertNotEqual(stored_user.password_hash, "supersecret")
        self.assertTrue(verify_password("supersecret", stored_user.password_hash))

    def test_login_and_logout_manage_bearer_session(self) -> None:
        token = self.login()

        session_response = self.client.get("/auth/session", headers=self.auth_headers(token))
        self.assertEqual(session_response.status_code, 200)
        self.assertEqual(session_response.json()["user"]["username"], "guest")

        logout_response = self.client.post("/auth/logout", headers=self.auth_headers(token))
        self.assertEqual(logout_response.status_code, 204)

        after_logout = self.client.post("/games", json={"mode": "walls"}, headers=self.auth_headers(token))
        self.assertEqual(after_logout.status_code, 401)
        self.assertEqual(after_logout.json()["error"], "Authentication required")

    def test_seeded_active_games_and_leaderboard_are_available(self) -> None:
        active_response = self.client.get("/games/active")
        leaderboard_response = self.client.get("/leaderboard", params={"mode": "walls"})

        self.assertEqual(active_response.status_code, 200)
        self.assertGreaterEqual(len(active_response.json()), 2)
        self.assertEqual(active_response.json()[0]["id"], "g_seed_walls")

        self.assertEqual(leaderboard_response.status_code, 200)
        walls_scores = [entry["score"] for entry in leaderboard_response.json()]
        self.assertEqual(walls_scores, sorted(walls_scores, reverse=True))

    def test_game_lifecycle_requires_bearer_token_and_records_score(self) -> None:
        unauthorized = self.client.post("/games", json={"mode": "walls"})
        self.assertEqual(unauthorized.status_code, 401)

        token = self.login()
        create_response = self.client.post(
            "/games",
            json={"mode": "walls"},
            headers=self.auth_headers(token),
        )
        self.assertEqual(create_response.status_code, 201)
        game_id = create_response.json()["id"]

        state_response = self.client.get(f"/games/{game_id}")
        self.assertEqual(state_response.status_code, 200)
        state = state_response.json()

        state["score"] = 42
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

        ended_response = self.client.get(f"/games/{game_id}")
        self.assertEqual(ended_response.status_code, 410)

        leaderboard_response = self.client.get("/leaderboard", params={"mode": "walls"})
        self.assertEqual(leaderboard_response.status_code, 200)
        self.assertTrue(
            any(
                entry["username"] == "guest" and entry["score"] == 42
                for entry in leaderboard_response.json()
            )
        )

    def test_cannot_update_another_players_game(self) -> None:
        token = self.login()
        seed_game_response = self.client.get("/games/g_seed_walls")
        self.assertEqual(seed_game_response.status_code, 200)

        update_response = self.client.put(
            "/games/g_seed_walls/state",
            json={"state": seed_game_response.json()},
            headers=self.auth_headers(token),
        )

        self.assertEqual(update_response.status_code, 403)
        self.assertIn("another player's game", update_response.json()["error"])

    def test_unknown_game_returns_not_found(self) -> None:
        response = self.client.get("/games/g_missing")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["error"], "Game not found")

    def test_serves_built_frontend_index_with_spa_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            frontend_dir = Path(temp_dir)
            (frontend_dir / "assets").mkdir()
            (frontend_dir / "index.html").write_text("<html><body>snake frontend</body></html>", encoding="utf-8")
            (frontend_dir / "assets" / "app.js").write_text("console.log('snake');", encoding="utf-8")

            client = TestClient(create_app(frontend_dist_dir=frontend_dir))

            root_response = client.get("/")
            asset_response = client.get("/assets/app.js")
            fallback_response = client.get("/play")

            self.assertEqual(root_response.status_code, 200)
            self.assertIn("snake frontend", root_response.text)
            self.assertEqual(asset_response.status_code, 200)
            self.assertIn("console.log('snake');", asset_response.text)
            self.assertEqual(fallback_response.status_code, 200)
            self.assertIn("snake frontend", fallback_response.text)

    def test_frontend_fallback_does_not_shadow_api_404s(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            frontend_dir = Path(temp_dir)
            (frontend_dir / "index.html").write_text("<html><body>snake frontend</body></html>", encoding="utf-8")

            client = TestClient(create_app(frontend_dist_dir=frontend_dir))

            response = client.get("/auth/unknown")

            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.json()["error"], "Not found")


if __name__ == "__main__":
    unittest.main()
