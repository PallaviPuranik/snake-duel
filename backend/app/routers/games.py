from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse

from ..auth import get_current_user, get_store
from ..models import (
    ActiveGame,
    CompleteGameRequest,
    GameState,
    StartGameRequest,
    StartGameResponse,
    UpdateGameStateRequest,
    User,
)
from ..store import InMemoryStore


router = APIRouter(tags=["Games"])
STREAM_DELAY_SECONDS = 0.25


def sse_event(event: str, data: Any) -> bytes:
    payload = json.dumps(jsonable_encoder(data), separators=(",", ":"))
    return f"event: {event}\ndata: {payload}\n\n".encode("utf-8")


@router.post("/games", response_model=StartGameResponse, status_code=status.HTTP_201_CREATED)
def start_game(
    request: StartGameRequest,
    user: User = Depends(get_current_user),
    store: InMemoryStore = Depends(get_store),
) -> StartGameResponse:
    return StartGameResponse(id=store.create_game(user, request.mode))


@router.get("/games/active", response_model=list[ActiveGame])
def list_active_games(store: InMemoryStore = Depends(get_store)) -> list[ActiveGame]:
    return store.list_active_games()


@router.get("/games/active/events")
async def stream_active_games(
    request: Request,
    store: InMemoryStore = Depends(get_store),
) -> StreamingResponse:
    async def event_stream():
        last_version = -1
        while True:
            if await request.is_disconnected():
                break
            current_version = store.active_version()
            if current_version != last_version:
                last_version = current_version
                yield sse_event("active-games", store.list_active_games())
            await asyncio.sleep(STREAM_DELAY_SECONDS)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/games/{game_id}", response_model=GameState)
def get_game_state(
    game_id: str,
    store: InMemoryStore = Depends(get_store),
) -> GameState:
    state = store.get_game_state(game_id)
    if state is not None:
        return state
    if store.is_ended_game(game_id):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Game has already ended")
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")


@router.put("/games/{game_id}/state", status_code=status.HTTP_204_NO_CONTENT)
def push_game_state(
    game_id: str,
    payload: UpdateGameStateRequest,
    user: User = Depends(get_current_user),
    store: InMemoryStore = Depends(get_store),
) -> Response:
    try:
        store.update_game_state(game_id, user, payload.state)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found") from exc
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/games/{game_id}/complete", status_code=status.HTTP_204_NO_CONTENT)
def end_game(
    game_id: str,
    payload: CompleteGameRequest,
    user: User = Depends(get_current_user),
    store: InMemoryStore = Depends(get_store),
) -> Response:
    try:
        store.complete_game(game_id, user, payload.finalState)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found") from exc
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/games/{game_id}/events")
async def watch_game(
    game_id: str,
    request: Request,
    store: InMemoryStore = Depends(get_store),
) -> StreamingResponse:
    if store.get_game_state(game_id) is None and not store.is_ended_game(game_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")

    async def event_stream():
        last_version = -1
        while True:
            if await request.is_disconnected():
                break

            if store.is_ended_game(game_id):
                yield sse_event("ended", None)
                break

            current_version = store.game_version(game_id)
            if current_version != last_version:
                last_version = current_version
                state = store.get_game_state(game_id)
                if state is not None:
                    yield sse_event("state", state)
            await asyncio.sleep(STREAM_DELAY_SECONDS)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
