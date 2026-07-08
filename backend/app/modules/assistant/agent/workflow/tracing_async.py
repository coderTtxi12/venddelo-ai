"""Non-blocking LangSmith trace cleanup for the root assistant_chat span."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any

from langsmith import trace

from app.core.config import Settings
from app.modules.assistant.agent.tracing import assistant_tracing_active

logger = logging.getLogger(__name__)


def _close_langsmith_context(cm: Any, run: Any, outputs: dict[str, Any] | None) -> None:
    """Close a LangSmith trace in a worker thread (root span only)."""
    try:
        if outputs is not None:
            run.end(outputs=outputs)
        cm.__exit__(None, None, None)
    except Exception:
        logger.exception("LangSmith trace close failed")


@asynccontextmanager
async def async_langsmith_root_trace(
    name: str,
    *,
    settings: Settings,
    run_type: str = "chain",
    metadata: dict[str, Any] | None = None,
    inputs: dict[str, Any] | None = None,
    get_outputs: Callable[[], dict[str, Any] | None] | None = None,
) -> AsyncIterator[Any]:
    """Root workflow span: child spans must close synchronously for a correct tree."""
    if not assistant_tracing_active(settings):
        yield None
        return

    cm = trace(
        name,
        run_type=run_type,
        metadata=metadata,
        inputs=inputs,
        exceptions_to_handle=(GeneratorExit,),
    )
    run = cm.__enter__()
    try:
        yield run
    finally:
        outputs = get_outputs() if get_outputs is not None else None
        await asyncio.to_thread(_close_langsmith_context, cm, run, outputs)
