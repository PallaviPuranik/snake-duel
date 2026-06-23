from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse

from ..auth import get_store
from ..models import LeaderboardEntry, Mode
from ..store import InMemoryStore


router = APIRouter(prefix="/leaderboard", tags=["Leaderboard"])
STREAM_DELAY_SECONDS = 0.25


def sse_event(event: str, data: Any) -> bytes:
    payload = json.dumps(jsonable_encoder(data), separators=(",", ":"))
    return f"event: {event}\ndata: {payload}\n\n".encode("utf-8")


@router.get("", response_model=list[LeaderboardEntry])
def get_leaderboard(
    mode: Mode = Query(...),
    limit: int = Query(10, ge=1),
    store: InMemoryStore = Depends(get_store),
) -> list[LeaderboardEntry]:
    return store.list_leaderboard(mode, limit)


@router.get("/events")
async def stream_leaderboard(
    request: Request,
    mode: Mode = Query(...),
    store: InMemoryStore = Depends(get_store),
) -> StreamingResponse:
    async def event_stream():
        last_version = -1
        while True:
            if await request.is_disconnected():
                break
            current_version = store.leaderboard_version(mode)
            if current_version != last_version:
                last_version = current_version
                yield sse_event("leaderboard", store.list_leaderboard(mode))
            await asyncio.sleep(STREAM_DELAY_SECONDS)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
