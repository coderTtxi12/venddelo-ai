from unittest.mock import patch

from app.infra.llm.stub_provider import StubLLMProvider
from tests.api.test_assistant_conversations_api import _parse_sse, _seed_restaurant
from tests.conftest import requires_db

AUTH = {"Authorization": "Bearer valid-token"}


@requires_db
def test_chat_records_llm_usage_and_usage_summary(client, engine):
    restaurant = _seed_restaurant(client, engine, "assistant-usage-api")
    profile = client.get(
        f"/api/v1/restaurants/{restaurant.id}/assistant/profile",
        headers=AUTH,
    ).json()
    updated = client.patch(
        f"/api/v1/restaurants/{restaurant.id}/assistant/profile",
        headers=AUTH,
        json={"display_name": "Luna", "expected_version": profile["version"]},
    ).json()
    conversation = client.post(
        f"/api/v1/restaurants/{restaurant.id}/assistant/conversations",
        headers=AUTH,
        json={},
    ).json()

    with patch("app.modules.assistant.api.build_llm_provider", return_value=StubLLMProvider()):
        response = client.post(
            f"/api/v1/restaurants/{restaurant.id}/assistant/conversations/{conversation['id']}/chat",
            headers={**AUTH, "Accept": "text/event-stream"},
            json={"message": "Hola", "profile_version": updated["version"]},
        )

    assert response.status_code == 200
    assert _parse_sse(response.text)[-1][0] == "message.complete"

    usage = client.get(
        f"/api/v1/restaurants/{restaurant.id}/assistant/usage",
        headers=AUTH,
    )

    assert usage.status_code == 200
    body = usage.json()
    assert body["restaurant_id"] == str(restaurant.id)
    assert body["calls"] == 1
    assert body["input_tokens"] > 0
    assert body["output_tokens"] > 0
    assert body["cost_usd"] == "0.000000"
    assert body["by_call_type"][0]["call_type"] == "chat_turn"
