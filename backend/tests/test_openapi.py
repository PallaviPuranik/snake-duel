from pathlib import Path
import unittest

import yaml


OPENAPI_PATH = Path(__file__).resolve().parents[2] / "openapi.yaml"


class OpenAPISpecTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        with OPENAPI_PATH.open(encoding="utf-8") as spec_file:
            cls.spec = yaml.safe_load(spec_file)

    def test_declares_openapi_document_metadata(self) -> None:
        self.assertEqual(self.spec["openapi"], "3.1.0")
        self.assertEqual(self.spec["info"]["title"], "Snake Arena API")
        self.assertEqual(self.spec["info"]["version"], "1.0.0")

    def test_declares_expected_frontend_paths(self) -> None:
        self.assertEqual(
            set(self.spec["paths"].keys()),
            {
                "/auth/session",
                "/auth/signup",
                "/auth/login",
                "/auth/logout",
                "/games",
                "/games/active",
                "/games/active/events",
                "/games/{gameId}",
                "/games/{gameId}/state",
                "/games/{gameId}/complete",
                "/games/{gameId}/events",
                "/leaderboard",
                "/leaderboard/events",
            },
        )

    def test_auth_endpoints_use_session_and_credentials_schemas(self) -> None:
        paths = self.spec["paths"]

        self.assertEqual(
            paths["/auth/session"]["get"]["responses"]["200"]["content"]["application/json"][
                "schema"
            ]["$ref"],
            "#/components/schemas/SessionResponse",
        )
        self.assertEqual(
            paths["/auth/signup"]["post"]["requestBody"]["content"]["application/json"][
                "schema"
            ]["$ref"],
            "#/components/schemas/AuthCredentials",
        )
        self.assertEqual(
            paths["/auth/login"]["post"]["requestBody"]["content"]["application/json"][
                "schema"
            ]["$ref"],
            "#/components/schemas/AuthCredentials",
        )
        self.assertEqual(
            paths["/auth/signup"]["post"]["responses"]["201"]["content"]["application/json"][
                "schema"
            ]["$ref"],
            "#/components/schemas/AuthResponse",
        )
        self.assertEqual(
            paths["/auth/login"]["post"]["responses"]["200"]["content"]["application/json"][
                "schema"
            ]["$ref"],
            "#/components/schemas/AuthResponse",
        )

    def test_authenticated_endpoints_require_session_cookie(self) -> None:
        protected_operations = [
            self.spec["paths"]["/auth/logout"]["post"],
            self.spec["paths"]["/games"]["post"],
            self.spec["paths"]["/games/{gameId}/state"]["put"],
            self.spec["paths"]["/games/{gameId}/complete"]["post"],
        ]

        for operation in protected_operations:
            self.assertEqual(operation["security"], [{"sessionCookie": []}])

    def test_game_endpoints_use_expected_request_and_response_shapes(self) -> None:
        paths = self.spec["paths"]

        self.assertEqual(
            paths["/games"]["post"]["requestBody"]["content"]["application/json"]["schema"][
                "$ref"
            ],
            "#/components/schemas/StartGameRequest",
        )
        self.assertEqual(
            paths["/games"]["post"]["responses"]["201"]["content"]["application/json"]["schema"][
                "$ref"
            ],
            "#/components/schemas/StartGameResponse",
        )
        self.assertEqual(
            paths["/games/{gameId}"]["get"]["responses"]["200"]["content"]["application/json"][
                "schema"
            ]["$ref"],
            "#/components/schemas/GameState",
        )
        self.assertEqual(
            paths["/games/{gameId}/state"]["put"]["requestBody"]["content"][
                "application/json"
            ]["schema"]["$ref"],
            "#/components/schemas/UpdateGameStateRequest",
        )
        self.assertEqual(
            paths["/games/{gameId}/complete"]["post"]["requestBody"]["content"][
                "application/json"
            ]["schema"]["$ref"],
            "#/components/schemas/CompleteGameRequest",
        )

    def test_public_discovery_endpoints_match_frontend_read_models(self) -> None:
        paths = self.spec["paths"]

        self.assertEqual(
            paths["/games/active"]["get"]["responses"]["200"]["content"]["application/json"][
                "schema"
            ]["items"]["$ref"],
            "#/components/schemas/ActiveGame",
        )
        self.assertEqual(
            paths["/leaderboard"]["get"]["parameters"][0]["schema"]["$ref"],
            "#/components/schemas/Mode",
        )
        self.assertEqual(
            paths["/leaderboard"]["get"]["responses"]["200"]["content"]["application/json"][
                "schema"
            ]["items"]["$ref"],
            "#/components/schemas/LeaderboardEntry",
        )

    def test_game_state_and_related_enums_match_frontend_types(self) -> None:
        schemas = self.spec["components"]["schemas"]

        self.assertEqual(schemas["Mode"]["enum"], ["walls", "wrap"])
        self.assertEqual(
            schemas["Direction"]["enum"], ["up", "down", "left", "right"]
        )
        self.assertEqual(
            schemas["GameState"]["required"],
            [
                "width",
                "height",
                "mode",
                "snake",
                "dir",
                "pendingDir",
                "food",
                "score",
                "alive",
                "tick",
            ],
        )
        self.assertEqual(
            schemas["GameState"]["properties"]["snake"]["items"]["$ref"],
            "#/components/schemas/Cell",
        )


if __name__ == "__main__":
    unittest.main()
