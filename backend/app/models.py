from typing import Literal

from pydantic import BaseModel, Field


Mode = Literal["walls", "wrap"]
Direction = Literal["up", "down", "left", "right"]


class Cell(BaseModel):
    x: int
    y: int


class GameState(BaseModel):
    width: int
    height: int
    mode: Mode
    snake: list[Cell]
    dir: Direction
    pendingDir: Direction
    food: Cell
    score: int
    alive: bool
    tick: int


class User(BaseModel):
    id: str
    username: str


class SessionResponse(BaseModel):
    user: User | None


class AuthCredentials(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class AuthResponse(BaseModel):
    user: User
    accessToken: str
    tokenType: str = "bearer"


class StartGameRequest(BaseModel):
    mode: Mode


class StartGameResponse(BaseModel):
    id: str


class UpdateGameStateRequest(BaseModel):
    state: GameState


class CompleteGameRequest(BaseModel):
    finalState: GameState


class ActiveGame(BaseModel):
    id: str
    username: str
    mode: Mode
    score: int
    startedAt: int


class LeaderboardEntry(BaseModel):
    username: str
    score: int
    mode: Mode
    at: int


class ErrorResponse(BaseModel):
    error: str
