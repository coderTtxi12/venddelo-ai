from __future__ import annotations

from app.modules.assistant.agent.behavior_policy import ASSISTANT_BEHAVIOR_POLICY
from app.modules.assistant.entitlements.catalog import SKILL_CATALOG
from app.modules.assistant.profile.schemas import AssistantProfileRecord
from app.modules.assistant.prompts import ASSISTANT_CORE_POLICY


def compose_system_prompt(
    profile: AssistantProfileRecord,
    *,
    effective_skill_ids: list[str],
) -> str:
    sections: list[str] = [
        ASSISTANT_CORE_POLICY,
        ASSISTANT_BEHAVIOR_POLICY,
    ]

    display_name = profile.display_name.strip()
    if display_name:
        sections.append(
            f'Your assistant display name is "{display_name}". '
            "Use that name naturally when introducing yourself. Respond in Spanish."
        )

    if profile.identity_markdown.strip():
        sections.append(f"## IDENTITY\n\n{profile.identity_markdown.strip()}")

    if profile.behavior_markdown.strip():
        sections.append(f"## BEHAVIOR\n\n{profile.behavior_markdown.strip()}")

    if effective_skill_ids:
        skill_lines = []
        for skill_id in effective_skill_ids:
            skill = SKILL_CATALOG.get(skill_id)
            label = skill.label if skill else skill_id
            skill_lines.append(f"- {skill_id}: {label}")
        sections.append("## Active skills\n\n" + "\n".join(skill_lines))

    if profile.menu_markdown.strip():
        sections.append(f"## MENU knowledge\n\n{profile.menu_markdown.strip()}")

    return "\n\n---\n\n".join(sections)
