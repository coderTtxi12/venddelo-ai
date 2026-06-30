from __future__ import annotations

from app.modules.assistant.entitlements.catalog import SKILL_CATALOG
from app.modules.assistant.profile.schemas import AssistantProfileRecord
from app.modules.assistant.prompts import ASSISTANT_CORE_POLICY
from app.modules.assistant.skills.markdown import load_skill_metadata


def compose_system_prompt(
    profile: AssistantProfileRecord,
    *,
    effective_skill_ids: list[str],
) -> str:
    sections: list[str] = [
        ASSISTANT_CORE_POLICY,
    ]

    display_name = profile.display_name.strip()
    if display_name:
        sections.append(
            f'Your name is "{display_name}". '
            "Use that name naturally when introducing yourself. Respond in Spanish."
        )

    # Temporarily disabled — per-restaurant IDENTITY markdown (see profile/identity_markdown.py)
    # if profile.identity_markdown.strip():
    #     sections.append(f"## IDENTITY\n\n{profile.identity_markdown.strip()}")

    # Temporarily disabled — per-restaurant BEHAVIOR markdown (see profile/behavior_markdown.py)
    # if profile.behavior_markdown.strip():
    #     sections.append(f"## BEHAVIOR\n\n{profile.behavior_markdown.strip()}")

    if effective_skill_ids:
        skill_lines = []
        for skill_id in effective_skill_ids:
            meta = load_skill_metadata(skill_id)
            catalog = SKILL_CATALOG.get(skill_id)
            summary = (
                meta.get("description")
                or (catalog.label if catalog else skill_id)
            )
            skill_lines.append(f"- **{skill_id}**: {summary}")
        sections.append("## Active skills\n\n" + "\n".join(skill_lines))

    # Temporarily disabled — per-restaurant MENU markdown (see profile/menu_markdown.py)
    # if profile.menu_markdown.strip():
    #     sections.append(f"## MENU knowledge\n\n{profile.menu_markdown.strip()}")

    return "\n\n---\n\n".join(sections)
