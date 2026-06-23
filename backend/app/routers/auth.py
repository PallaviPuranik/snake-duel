from fastapi import APIRouter, Depends, HTTPException, Response, status

from ..auth import get_current_token, get_optional_user, get_store
from ..models import AuthCredentials, AuthResponse, SessionResponse, User
from ..store import InMemoryStore


router = APIRouter(prefix="/auth", tags=["Auth"])


@router.get("/session", response_model=SessionResponse)
def get_session(user: User | None = Depends(get_optional_user)) -> SessionResponse:
    return SessionResponse(user=user)


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(
    credentials: AuthCredentials,
    store: InMemoryStore = Depends(get_store),
) -> AuthResponse:
    try:
        user = store.create_user(credentials.username, credentials.password)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

    token = store.issue_token(user.id)
    return AuthResponse(user=user, accessToken=token)


@router.post("/login", response_model=AuthResponse)
def login(
    credentials: AuthCredentials,
    store: InMemoryStore = Depends(get_store),
) -> AuthResponse:
    user = store.authenticate(credentials.username, credentials.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = store.issue_token(user.id)
    return AuthResponse(user=user, accessToken=token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    token: str = Depends(get_current_token),
    store: InMemoryStore = Depends(get_store),
) -> Response:
    store.revoke_token(token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
