from __future__ import annotations

import hashlib


def compute_source_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()
