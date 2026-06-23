import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .routers import auth_router, games_router, leaderboard_router
from .store import InMemoryStore
from .store_base import Store


RESERVED_FRONTEND_PATHS = {
    "auth",
    "docs",
    "games",
    "healthz",
    "leaderboard",
    "openapi.json",
    "redoc",
}


def resolve_frontend_dist_dir() -> Path | None:
    configured_dir = os.environ.get("FRONTEND_DIST_DIR")
    if configured_dir:
        frontend_dir = Path(configured_dir).resolve()
        return frontend_dir if frontend_dir.is_dir() else None

    frontend_dir = Path(__file__).resolve().parents[2] / "frontend" / "dist" / "client"
    return frontend_dir if frontend_dir.is_dir() else None


def create_app(store: Store | None = None, frontend_dist_dir: Path | None = None) -> FastAPI:
    app = FastAPI(title="Snake Arena API", version="1.0.0")
    app.state.store = store or InMemoryStore()
    app.state.frontend_dist_dir = frontend_dist_dir or resolve_frontend_dist_dir()

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, str) else "Request failed"
        return JSONResponse(status_code=exc.status_code, content={"error": detail})

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        message = "; ".join(error["msg"] for error in exc.errors()) or "Invalid request"
        return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content={"error": message})

    @app.get("/healthz")
    def healthcheck() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(auth_router)
    app.include_router(games_router)
    app.include_router(leaderboard_router)

    frontend_dir = app.state.frontend_dist_dir
    index_file = frontend_dir / "index.html" if frontend_dir else None

    if index_file and index_file.is_file():

        @app.get("/", include_in_schema=False)
        async def frontend_index() -> FileResponse:
            return FileResponse(index_file)

        @app.get("/{requested_path:path}", include_in_schema=False)
        async def frontend_asset_or_route(requested_path: str) -> FileResponse:
            if requested_path.split("/", 1)[0] in RESERVED_FRONTEND_PATHS:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

            requested_file = (frontend_dir / requested_path).resolve()
            if frontend_dir not in requested_file.parents and requested_file != frontend_dir:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

            if requested_file.is_file():
                return FileResponse(requested_file)

            if Path(requested_path).suffix:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

            return FileResponse(index_file)

    return app
