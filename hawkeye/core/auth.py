"""Authentication utilities for API keys."""

import hashlib
import secrets
from typing import Optional

from hawkeye.config import settings


def hash_api_key(plain_key: str) -> str:
    """Hash an API key for storage."""
    return hashlib.sha256(plain_key.encode()).hexdigest()


def generate_api_key(prefix: str = "hawk") -> tuple[str, str]:
    """Generate a new API key and its hash.
    Returns: (plain_key, key_hash)
    """
    plain_key = f"{prefix}_{secrets.token_urlsafe(settings.api_key_length)}"
    key_hash = hash_api_key(plain_key)
    return plain_key, key_hash


def verify_api_key(plain_key: str, key_hash: str) -> bool:
    """Verify a plain API key against its hash."""
    return hash_api_key(plain_key) == key_hash