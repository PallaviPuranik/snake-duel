from .auth import router as auth_router
from .games import router as games_router
from .leaderboard import router as leaderboard_router

__all__ = ["auth_router", "games_router", "leaderboard_router"]
