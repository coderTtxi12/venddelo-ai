"""Seed an encrypted marketing Facebook agent account.

Local wiring checklist (from backend/):

1. Generate a Fernet key and set ``MARKETING_AGENT_FERNET_KEY`` in ``backend/.env``.
2. Run migrations: ``alembic upgrade head``.
3. Install deps: ``pip install -r requirements.txt && playwright install chromium``.
4. Seed an agent (never commit real credentials):

   ``python -m scripts.seed_marketing_agent --email you@example.com --password '...' --label test-agent-1``

5. Restart the API: ``python start.py``.
6. Postman smoke test:
   - ``POST /api/v1/restaurants/{restaurant_id}/marketing/facebook/posts`` with JWT and
     ``{"message":"..."}``.
   - Poll ``GET /api/v1/restaurants/{restaurant_id}/marketing/tasks/{task_id}``.

Credentials after seed:

- ``marketing_agent_accounts``: one or more rows with ``status='active'``;
  ``fb_email_encrypted`` and ``fb_password_encrypted`` hold Fernet ciphertext;
  ``storage_state_encrypted`` is filled after the first successful login/publish.
- ``marketing_tasks``: one row per POST with ``message``, ``status``, ``agent_id``,
  ``restaurant_id``.
"""

from __future__ import annotations

import argparse

from app.db.models.marketing import MarketingAgentAccount
from app.db.session import SessionLocal
from app.modules.marketing.crypto import build_marketing_crypto


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--label", default="test-agent-1")
    args = parser.parse_args()

    crypto = build_marketing_crypto()
    session = SessionLocal()
    try:
        row = MarketingAgentAccount(
            label=args.label,
            fb_email_encrypted=crypto.encrypt_str(args.email),
            fb_password_encrypted=crypto.encrypt_str(args.password),
            status="active",
        )
        session.add(row)
        session.commit()
        print(f"Seeded marketing agent id={row.id} label={row.label}")
    finally:
        session.close()


if __name__ == "__main__":
    main()
