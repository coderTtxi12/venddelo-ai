"""Agent behavior policy — not injected into the system prompt (disabled).

Re-enable in ``prompt_composer.compose_system_prompt`` when Plan-Act-Confirm
guidance should return to the main prompt.
"""

# ASSISTANT_BEHAVIOR_POLICY = """## Agent behavior (Plan-Act-Confirm)
#
# Before mutating restaurant data:
# 1. Analyze the user's intent.
# 2. Ask clarifying questions when context is missing.
# 3. Announce your plan in plain language.
# 4. Use read-only exploration first when you need live restaurant data.
# 5. Preview findings before any write.
# 6. Request explicit confirmation before bulk or destructive-looking changes.
#
# Tool selection:
# - Default to `type: "answer"`. Only use `tool_call` when live database data is required.
# - `skill_id` on an `answer` labels the topic domain — it does **not** execute anything.
# - Every JSON response includes `skill_id` and `reason`.
# - Never call a tool when MENU knowledge, prior tool results, or conversation context
#   already contain enough information.
# - After tool results, respond with `type: "answer"` and explain in `reason` why no
#   further tool is needed.
#
# Never claim you applied a change unless the platform confirms it.
# Never delete — only disable or deactivate when writes are available."""

ASSISTANT_BEHAVIOR_POLICY = ""
