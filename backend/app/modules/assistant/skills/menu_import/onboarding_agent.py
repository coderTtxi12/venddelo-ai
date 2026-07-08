"""Menu import onboarding sub-agent exposed as a single executor tool."""

from __future__ import annotations

from pydantic import BaseModel, Field

from agents import Agent

from app.core.config import Settings
from app.modules.assistant.agent.run_context import AssistantRunContext
from app.modules.assistant.agent.tools import (
    MENU_IMPORT_ONBOARDING_TOOL_NAME,
    build_menu_import_internal_tools,
)
from app.modules.assistant.skills.base import ToolDefinition
from app.modules.assistant.skills.registry import SkillRegistry

ONBOARDING_INSTRUCTIONS = """Eres el agente de onboarding para importar un menú completo al menú en vivo.

## Objetivo
Llevar al dueño de principio a fin: OCR del menú subido, comparación con el menú live,
preguntas de aclaración (especialmente complementos), optimización, vista previa y aplicación
en un solo paso con `apply_full_import`.

## Memoria en Postgres
- Usa `get_import_session` para ver fase y contadores.
- Usa `analyze_import_vs_live` después del OCR para cachear snapshot del menú live y el plan
  de reconciliación. No vuelvas a escanear el menú live en cada turno salvo que `force_refresh=true`.
- Los precios del documento importado están en **MXN (pesos)**, no en centavos.

## Reglas de fidelidad
- **Nunca inventes** nombres, descripciones ni precios. Sube el menú tal como está en el OCR.
- No rellenes huecos con suposiciones: si falta información crítica, agrega `open_questions`.

## Flujo
1. `start_menu_import_session` si no hay sesión activa.
2. `register_menu_source_file` por cada archivo subido (storage_path del chat).
3. `start_menu_extraction_batch` — OCR de todas las fuentes.
4. `analyze_import_vs_live` — compara borrador vs menú live y agrega preguntas de complementos.
5. Si hay `open_questions`: devuelve **todas las preguntas en un solo mensaje** (de jalón).
   Cuando el dueño responda, `save_clarification_answers` con todas las respuestas juntas.
6. Sin preguntas pendientes: `optimize_import_draft` → `preview_full_import`.
7. Solo si el dueño confirma explícitamente: `apply_full_import` con `confirmed=true`.
8. Opcional después: `update_menu_knowledge` para cerrar la sesión.

## Complementos
- Prioriza entender qué complementos van en qué producto.
- Usa las preguntas generadas por `analyze_import_vs_live` y las del OCR.
- Pregunta en bloque, no una por turno.

## Respuesta al llamador
Resume en español: fase actual, qué falta, preguntas pendientes (si hay), o resultado del apply.
No expongas UUIDs al dueño; usa nombres de categorías y productos.
"""


class ClarificationAnswerItem(BaseModel):
    question_id: str = Field(description="ID de open_questions devuelto por analyze_import_vs_live.")
    answer: str = Field(description="Respuesta del dueño en texto libre.")


class MenuImportOnboardingInput(BaseModel):
    request: str = Field(
        description=(
            "Mensaje o instrucción del dueño para el flujo de importación "
            "(p. ej. subió archivos, responde preguntas, confirma aplicar)."
        )
    )
    storage_paths: list[str] | None = Field(
        default=None,
        description="Rutas de archivos de menú ya subidos vía API de import assets.",
    )
    clarification_answers: list[ClarificationAnswerItem] | None = Field(
        default=None,
        description="Respuestas a preguntas abiertas cuando el dueño contesta en bloque.",
    )


def menu_import_onboarding_tool_definition() -> ToolDefinition:
    return ToolDefinition(
        name=MENU_IMPORT_ONBOARDING_TOOL_NAME,
        description=(
            "Run the full menu import onboarding concierge: OCR uploaded menu, compare vs "
            "live menu (cached in Postgres), ask all clarification questions in one batch "
            "(especially complements), then optimize, preview, and apply the entire menu. "
            "Prices from uploads are MXN; never invent names, descriptions, or prices."
        ),
        effect="mutate",
        input_schema=MenuImportOnboardingInput.model_json_schema(),
    )


def build_menu_import_onboarding_agent(
    *,
    settings: Settings,
    registry: SkillRegistry,
) -> Agent[AssistantRunContext]:
    return Agent[AssistantRunContext](
        name="MenuImportOnboarding",
        instructions=ONBOARDING_INSTRUCTIONS,
        tools=build_menu_import_internal_tools(registry),
        model=settings.openai_model,
    )


def build_menu_import_onboarding_tool(
    *,
    settings: Settings,
    registry: SkillRegistry,
):
    agent = build_menu_import_onboarding_agent(settings=settings, registry=registry)
    return agent.as_tool(
        tool_name=MENU_IMPORT_ONBOARDING_TOOL_NAME,
        tool_description=(
            "[MUTATE] Run the full menu import onboarding concierge: OCR uploaded menu, "
            "compare vs live menu (cached in Postgres), ask all clarification questions "
            "in one batch (especially complements), then optimize, preview, and apply "
            "the entire menu with apply_full_import. Prices from uploads are MXN; never "
            "invent names, descriptions, or prices."
        ),
        parameters=MenuImportOnboardingInput,
        max_turns=24,
    )
