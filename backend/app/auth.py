from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .models import User

if TYPE_CHECKING:
    from .store import InMemoryStore


PASSWORD_HASH_PREFIX = "scrypt"
TOKEN_TTL_SECONDS = 60 * 60 * 12
bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(slots=True)
class TokenRecord:
    user_id: str
    expires_at: int


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    encoded_salt = base64.urlsafe_b64encode(salt).decode("ascii")
    encoded_digest = base64.urlsafe_b64encode(digest).decode("ascii")
    return f"{PASSWORD_HASH_PREFIX}${encoded_salt}${encoded_digest}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        prefix, encoded_salt, encoded_digest = password_hash.split("$", 2)
    except ValueError:
        return False

    if prefix != PASSWORD_HASH_PREFIX:
        return False

    salt = base64.urlsafe_b64decode(encoded_salt.encode("ascii"))
    expected_digest = base64.urlsafe_b64decode(encoded_digest.encode("ascii"))
    actual_digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return hmac.compare_digest(actual_digest, expected_digest)


def new_access_token() -> str:
    return secrets.token_urlsafe(32)


def new_token_record(user_id: str) -> TokenRecord:
    return TokenRecord(user_id=user_id, expires_at=int(time.time()) + TOKEN_TTL_SECONDS)


def get_store(request: Request) -> InMemoryStore:
    return request.app.state.store


def get_bearer_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str | None:
    if credentials is None or credentials.scheme.lower() != "bearer":
        return None
    return credentials.credentials


def get_optional_user(
    token: str | None = Depends(get_bearer_token),
    store: InMemoryStore = Depends(get_store),
) -> User | None:
    if token is None:
        return None
    return store.user_from_token(token)


def get_current_user(
    user: User | None = Depends(get_optional_user),
) -> User:
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return user


def get_current_token(
    token: str | None = Depends(get_bearer_token),
    store: InMemoryStore = Depends(get_store),
) -> str:
    if token is None or store.user_from_token(token) is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return token
