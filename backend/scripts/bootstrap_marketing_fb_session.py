"""Manually bootstrap a Facebook Playwright session for a marketing agent.

Opens a headed Chromium window so you can log in (captcha / 2FA / checkpoint).
When the feed is visible, return here and press Enter — the script encrypts and
stores ``storage_state`` on the agent row.

Usage (from backend/, with venv active)::

    # Prefer an existing seeded agent by label or id:
    python -m scripts.bootstrap_marketing_fb_session --label test-agent-1
    python -m scripts.bootstrap_marketing_fb_session --agent-id <uuid>

    # Or the first active agent:
    python -m scripts.bootstrap_marketing_fb_session

Requires ``MARKETING_AGENT_FERNET_KEY`` and Chromium::

    playwright install chromium
"""

from __future__ import annotations

import argparse
import sys
import uuid
from datetime import UTC, datetime

from sqlalchemy import select

from app.db.models.marketing import MarketingAgentAccount
from app.db.session import SessionLocal
from app.modules.marketing.browser.session import (
    decode_storage_state,
    encode_storage_state,
)
from app.modules.marketing.crypto import build_marketing_crypto


def _resolve_agent(
    session,
    *,
    agent_id: uuid.UUID | None,
    label: str | None,
) -> MarketingAgentAccount:
    if agent_id is not None:
        row = session.get(MarketingAgentAccount, agent_id)
        if row is None:
            raise SystemExit(f"No marketing agent with id={agent_id}")
        return row

    if label:
        row = session.scalar(
            select(MarketingAgentAccount)
            .where(MarketingAgentAccount.label == label)
            .order_by(MarketingAgentAccount.created_at.asc())
            .limit(1)
        )
        if row is None:
            raise SystemExit(f"No marketing agent with label={label!r}")
        return row

    row = session.scalar(
        select(MarketingAgentAccount)
        .where(MarketingAgentAccount.status == "active")
        .order_by(MarketingAgentAccount.created_at.asc())
        .limit(1)
    )
    if row is None:
        raise SystemExit(
            "No active marketing agent. Seed one first:\n"
            "  python -m scripts.seed_marketing_agent --email ... --password ... --label test-agent-1"
        )
    return row


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Manual Facebook login → save Playwright storage_state to DB"
    )
    parser.add_argument("--agent-id", type=uuid.UUID, default=None)
    parser.add_argument("--label", default=None)
    parser.add_argument(
        "--url",
        default="https://www.facebook.com/",
        help="Start URL (default: Facebook home)",
    )
    args = parser.parse_args()

    crypto = build_marketing_crypto()
    session = SessionLocal()
    try:
        agent = _resolve_agent(session, agent_id=args.agent_id, label=args.label)
        existing_state = decode_storage_state(crypto, agent.storage_state_encrypted)

        print(f"Agent id={agent.id} label={agent.label} status={agent.status}")
        print("Opening headed Chromium… log in manually in the browser window.")
        print("When you see your Facebook feed, come back here and press Enter.")

        from playwright.sync_api import sync_playwright

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=False)
            context = browser.new_context(
                storage_state=existing_state if existing_state else None
            )
            page = context.new_page()
            page.goto(args.url, wait_until="domcontentloaded")

            try:
                input(">>> Press Enter after login is complete… ")
            except EOFError:
                print("No stdin available; aborting without saving.", file=sys.stderr)
                browser.close()
                raise SystemExit(1)

            storage_state = context.storage_state()
            browser.close()

        agent.storage_state_encrypted = encode_storage_state(crypto, storage_state)
        agent.last_login_at = datetime.now(UTC)
        agent.status = "active"
        session.commit()

        print(
            f"Saved storage_state for agent id={agent.id} label={agent.label} status=active"
        )
        print("You can now POST /marketing/facebook/posts — the agent should skip login.")
    finally:
        session.close()


if __name__ == "__main__":
    main()
