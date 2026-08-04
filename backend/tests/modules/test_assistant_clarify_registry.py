import asyncio
import uuid

from app.modules.assistant.agent.workflow.clarify_registry import ClarifyWaitRegistry


def test_resolve_answers_future():
    async def _run() -> None:
        reg = ClarifyWaitRegistry()
        conv = uuid.uuid4()
        clarify_id, fut = reg.create(conv)
        reg.resolve(conv, clarify_id, "Sí")
        assert await fut == "Sí"

    asyncio.run(_run())


def test_supersede_fails_previous():
    async def _run() -> None:
        reg = ClarifyWaitRegistry()
        conv = uuid.uuid4()
        id1, fut1 = reg.create(conv)
        id2, fut2 = reg.create(conv)
        assert id1 != id2
        assert await fut1 == {"__clarify_error__": "superseded"}
        assert not fut2.done()

    asyncio.run(_run())
