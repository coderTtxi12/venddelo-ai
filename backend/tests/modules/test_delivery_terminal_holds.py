from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

from app.modules.delivery_dispatch.terminal import ensure_terminal_hold


def test_ensure_terminal_hold_skips_cash_and_is_idempotent_for_terminal():
    now = datetime.now(UTC)
    cash = SimpleNamespace(payment_method="cash", terminal_hold=None)
    assert ensure_terminal_hold(MagicMock(), cash, SimpleNamespace(id=uuid4()), now=now) is None

    existing = SimpleNamespace(id=uuid4(), driver_id=uuid4())
    terminal = SimpleNamespace(payment_method="card_terminal", terminal_hold=existing)
    assert (
        ensure_terminal_hold(MagicMock(), terminal, SimpleNamespace(id=uuid4()), now=now)
        is existing
    )
