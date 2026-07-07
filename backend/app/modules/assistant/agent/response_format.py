"""Helpers for the native tool-calling agent loop.

Builds OpenAI tool schemas, runtime guidance, and parses the assistant's final
JSON envelope (``reasoning`` + ``content``).
"""

from __future__ import annotations

import json
import re

from app.modules.assistant.skills.base import ToolDefinition

# Separator between ``skill_id`` and ``tool_name`` in an OpenAI function name.
# OpenAI function names must match ``^[a-zA-Z0-9_-]+$`` (no dots), so we use ``__``.
FUNCTION_NAME_SEPARATOR = "__"

# Generic progressive-disclosure tool: returns a skill's detailed guide on demand.
LOAD_SKILL_TOOL_NAME = "load_skill"


def openai_function_name(skill_id: str, tool_name: str) -> str:
    return f"{skill_id}{FUNCTION_NAME_SEPARATOR}{tool_name}"


def parse_function_name(name: str) -> tuple[str | None, str]:
    """Split an OpenAI function name into ``(skill_id, tool_name)``.

    ``load_skill`` (and any other unprefixed name) returns ``(None, name)``.
    """
    if FUNCTION_NAME_SEPARATOR not in name:
        return None, name
    skill_id, tool_name = name.split(FUNCTION_NAME_SEPARATOR, 1)
    return skill_id, tool_name


def build_openai_tool_schemas(
    entitled_tools: list[tuple[str, ToolDefinition]],
) -> list[dict]:
    """Build native OpenAI tool schemas for the entitled skill tools."""
    schemas: list[dict] = []
    for skill_id, tool in entitled_tools:
        description = tool.description
        if tool.effect in ("mutate", "delete"):
            description = f"[{tool.effect.upper()}] {description}"
        schemas.append(
            {
                "type": "function",
                "function": {
                    "name": openai_function_name(skill_id, tool.name),
                    "description": description,
                    "parameters": tool.input_schema or {"type": "object", "properties": {}},
                },
            }
        )
    return schemas


def build_load_skill_schema(skill_ids: list[str]) -> dict:
    """Schema for the generic ``load_skill`` tool (progressive disclosure)."""
    return {
        "type": "function",
        "function": {
            "name": LOAD_SKILL_TOOL_NAME,
            "description": (
                "Load the detailed guide for one skill before using its tools. "
                "Required first step for menu improve/optimize/edit requests: "
                "load_skill(menu_best_practices), then menu_read for live data. "
                "Required when adding a new product: load_skill(menu_write) for the "
                "secretary step-by-step onboarding flow. Required when adding a new marketing "
                "promotion: load_skill(promotions) for the secretary promo onboarding flow."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "skill_id": {
                        "type": "string",
                        "enum": list(skill_ids),
                        "description": "Skill to load the guide for.",
                    }
                },
                "required": ["skill_id"],
            },
        },
    }


def build_agent_runtime_section(effective_skill_ids: list[str] | None = None) -> str:
    """Runtime guidance appended once to the system prompt for the tool-calling loop."""
    entitled = set(effective_skill_ids or [])
    menu_import_section = ""
    if "menu_import" in entitled:
        menu_import_section = """
## Menu import onboarding — concierge (required workflow)

When the owner wants to **import or digitize** their menu (PDF, DOCX, photos):

1. **`load_skill(menu_import)`** + **`load_skill(menu_read)`** + **`load_skill(menu_write)`** +
   **`load_skill(menu_best_practices)`** if not already loaded this turn.
2. **`start_menu_import_session`** — one active session per restaurant.
3. **Investigate first:** read the **current** menu (`list_categories` + `list_products`) so you
   know what already exists, and read the uploaded document fully. **Plan** what to create vs
   update before touching anything.
4. Concierge flow: upload sources → **`start_menu_extraction_batch`** → clarify `open_questions`
   (**only genuine ambiguities**, one question per turn) → **`optimize_import_draft`** (order,
   layouts, complement rules: required/optional, min/max, extra prices) → **`preview_full_import`**
   (shows the reconciliation plan: nuevas vs existentes) → owner confirms once →
   **`apply_full_import`** (`confirmed: true`) → **`apply_menu_theme`** →
   **`load_skill(promotions)`** → **`generate_promotion_banner`** for each `two_for_one` promo →
   ask for dish photos → **`match_product_photos`** → **`bulk_assign_product_images`** →
   **`update_menu_knowledge`**.
5. Extraction and optimization run **synchronously** in this chat turn.
6. **Infer, don't interrogate:** deduce complement rules, prices, and layouts from the document
   and best practices. Ask the owner **only** what you truly cannot resolve.
7. **Never** use **`menu_media`** / **`generate_product_image`** during import — only
   owner-uploaded photos.
8. Publish the **entire** menu with a single **`apply_full_import`** — never section by section.
   It reconciles against the live menu by name: existing categories/products are **updated**
   (never duplicated), new ones created.

Never call `apply_full_import` or `bulk_assign_product_images`
without explicit owner confirmation (`confirmed: true` where required).

"""
    product_creation_section = """
## Alta de producto (flujo secretaria)

When the owner wants to **add a new product** (nuevo platillo, agregar producto, dar de alta):

1. **`load_skill(menu_write)`** if the guide is not loaded this turn.
2. **`list_categories`** — show real category names; never invent categories.
3. **Guide step by step** — secretary tone in Spanish, **one question per turn**:
   category → name → price (MXN in chat) → optional description → recap → confirm.
4. **`create_product`** only after explicit confirmation on the recap; convert pesos to
   `price_cents` internally (×100).
5. Do NOT call `create_product` on the first turn unless they already confirmed a full recap.

If they give several fields at once, acknowledge what you captured and ask only for what
is still missing — then recap before mutate.

"""
    marketing_promotion_creation_section = """
## Alta de promo de marketing (flujo secretaria)

When the owner wants to **create a new marketing promotion** (2×1, nueva promo, descuento con banner,
campaña de marketing — not catalog product discounts):

1. **`load_skill(promotions)`** if the guide is not loaded this turn.
2. **`list_products`** and/or **`list_categories`** — show real names for targets; never invent products.
3. **Guide step by step** — secretary tone in Spanish, **one question per turn**:
   tipo (2×1 / % / monto / combo badge) → nombre → alcance (producto/categoría/pedido) →
   targets → regla de descuento → optional fechas/horario/banner → recap → confirm.
4. **`create_promotion`** only after explicit confirmation on the recap; convert pesos to
   `amount_cents` internally (×100) for fixed-amount promos.
5. Do NOT call `create_promotion` on the first turn unless they already confirmed a full recap.
6. NxM/2×1 requires `scope` product or category with at least one target.
7. After create (or for an existing promo with placeholder banner), offer
   **`generate_promotion_banner`** with owner confirmation — uploads to storage and sets `image_path`.

If they give several fields at once, acknowledge what you captured and ask only for what
is still missing — then recap before mutate.

"""
    return """## How you work

You have native tools. To get live restaurant data or make changes, call a tool —
never invent data. When you have enough information, send your **final** reply as
JSON (see below). For greetings, identity, or general advice, same JSON format.

- Default to answering. Call a tool only when live data is missing from the context,
  prior tool results, and your menu knowledge. Never call a tool "just in case".
- For detailed guidance or best practices on a domain, call `load_skill` with its
  `skill_id` first; its tools are already available to call.
- When updating a product the owner named explicitly, call `update_product` with `name`
  (not a stale `product_id`) or use `bulk_update_product_*` for many rows.
- `price_cents` is always cents (100 MXN = 10000). For bulk product description/price/name edits,
  prefer `bulk_update_product_descriptions`, `bulk_update_product_prices`, or
  `bulk_update_product_names`.
- For bulk category edits (names, descriptions, sort order, visibility, display layout),
  prefer `bulk_update_category_*` when changing more than one category — do not loop
  `update_category`.
- For bulk complement/add-on edits (visibility, labels, prices), prefer
  `bulk_update_option_item_*` when changing more than one option item — do not loop
  `update_option_item`. To disable one complement name everywhere (e.g. Sprite out of stock),
  call `bulk_update_option_item_visibility` with `match_label` + `is_active` — never
  hand-pick item_ids. When using `items[]`, each row must include `expected_label` matching
  the live complement label or the server rejects the row.
- To add many complement choices or groups, prefer `bulk_add_option_items` or
  `bulk_add_option_groups` — do not loop `add_option_item` / `add_option_group`.
- To permanently remove complement choices from one product (owner confirmed), use
  `delete_option_item` or `bulk_delete_option_items` with `expected_label` per row from
  `menu_read` — prefer `bulk_update_option_item_visibility` when only temporarily unavailable.
- To change the digital menu theme, use `menu_write` `list_menu_themes` / `get_current_menu_theme`,
  optionally `recommend_menu_theme`, then `apply_menu_theme` after owner confirmation.
- To assign uploaded product photos, use `menu_write` `match_product_photos` then
  `bulk_assign_product_images` or `assign_product_image`. Each chat upload includes
  `storage_path` under **## Chat attachments** in the user message — use it directly;
  never ask the owner for storage_path.
""" + product_creation_section + marketing_promotion_creation_section + """
## Menu improvement (required workflow)

When the owner asks to **improve, optimize, audit, recommend** the menu
(descriptions, copy, structure, category order, products, promos, add-ons, photos, etc.):

1. **`load_skill(menu_best_practices)`** — if not already loaded this turn, load the
   quality guide first (criteria for good menus).
2. **`menu_read` tools** — fetch the restaurant's **live** menu state. For a **full menu
   audit** you MUST read, at minimum:
   `list_categories` + `list_products` (paginate until `has_more=false`) + `list_promotions`.
   `list_products` returns **all** products (active). Exact product names beat
   fuzzy neighbors in `search_products` / `get_product` — match by **name**, not description.
   (option groups + items), so it is enough to judge products, photos, and add-ons. Use
   `get_product` only when you also need the promotions attached to a specific product.
   Reading only categories + promotions is NOT enough to talk about products.
3. **Propose** grounded in both the guide and live data (Focus only of what the user finaly sees in the menu, 
not on the internal data or metadata or inactive data).
**Never state a fact you did not read this turn.** Do not comment on a product, its photo,
its description, its price, or its complements/add-ons unless a `menu_read` result in this
turn actually contains that data. If you have not read products/add-ons, either read them
now or say you have not reviewed them yet — never guess.

Skip steps 1–2 only when this turn already has the loaded guide **and** accurate
`menu_read` results for the exact items in scope.
""" + menu_import_section + """

## Activity reasoning (before tools)

When you are about to call one or more tools, first write 1–2 short sentences in
Spanish explaining what you will do and why (for the restaurant owner watching the
activity panel). Then call the tool(s). Plain text only — **no JSON** on tool rounds.

## Final reply format (required)

When you are done (no more tool calls), respond with **only** a JSON object:

```json
{
  "reasoning": "1–4 sentences in Spanish: what you reviewed, which tools you used, and why.",
  "content": "Your full reply to the restaurant owner in Markdown. Be concice since the owner is busy and only wants to know the most important information."
}
```

- **`reasoning`**: brief summary for the activity panel (steps, data consulted,
  decisions). Do not repeat this in `content`.
- **`content`**: reply to the owner in Markdown (bold, lists, tables when helpful).
  Be concrete. Close with useful next steps or follow-up questions.
- Respond in Spanish unless the owner asks for another language.
- Do not wrap the JSON in code fences or add text outside the object.
- Close the JSON with `}` only. Escape quotes and newlines inside strings
  (`\\n`, `\\"`). Do not add brackets or text after the closing `content` string.
"""


_FENCE_RE = re.compile(r"^```(?:json)?\s*\n?(.*?)\n?```\s*$", re.DOTALL | re.IGNORECASE)
_JSON_STRING_FIELD_RE = re.compile(r'"(?P<field>reasoning|content)"\s*:\s*"', re.DOTALL)
_JSON_ESCAPE_CHARS = {"n": "\n", "r": "\r", "t": "\t", '"': '"', "\\": "\\", "/": "/"}


def _decode_json_string_partial(raw: str, start: int) -> str:
    """Decode a (possibly incomplete) JSON string value after its opening quote."""
    i = start
    chars: list[str] = []
    while i < len(raw):
        ch = raw[i]
        if ch == '"':
            break
        if ch == "\\":
            if i + 1 >= len(raw):
                break
            nxt = raw[i + 1]
            if nxt in _JSON_ESCAPE_CHARS:
                chars.append(_JSON_ESCAPE_CHARS[nxt])
                i += 2
                continue
            if nxt == "u":
                if i + 5 >= len(raw):
                    break
                try:
                    chars.append(chr(int(raw[i + 2 : i + 6], 16)))
                except ValueError:
                    break
                i += 6
                continue
            break
        chars.append(ch)
        i += 1
    return "".join(chars)


def _extract_json_string_field(buffer: str, field: str) -> str:
    """Best-effort decode of one JSON string field (works on truncated/malformed JSON)."""
    for match in _JSON_STRING_FIELD_RE.finditer(buffer):
        if match.group("field") != field:
            continue
        return _decode_json_string_partial(buffer, match.end())
    return ""


def _extract_json_content_value(buffer: str) -> str:
    return _extract_json_string_field(buffer, "content")


def _looks_like_json_envelope(text: str) -> bool:
    stripped = text.lstrip()
    return stripped.startswith("{") and (
        '"content"' in stripped or '"reasoning"' in stripped
    )


def _parse_envelope_fields(text: str) -> dict[str, str] | None:
    reasoning = _extract_json_string_field(text, "reasoning")
    content = _extract_json_string_field(text, "content")
    if not reasoning and not content:
        return None
    return {"reasoning": reasoning.strip(), "content": content.strip()}


class AssistantTurnStreamParser:
    """Route streaming assistant tokens to pre-tool reasoning or JSON ``content``."""

    def __init__(self) -> None:
        self._buffer = ""
        self._mode: str = "undecided"
        self._plain_buffer = ""
        self._emitted_content_len = 0

    @property
    def emitted_content_len(self) -> int:
        return self._emitted_content_len

    @property
    def is_json_mode(self) -> bool:
        return self._mode == "json"

    def feed(self, chunk: str) -> list[dict[str, object]]:
        """Return incremental stream events for one token chunk."""
        from app.modules.assistant.agent.activity_emit import normalize_llm_reasoning

        events: list[dict[str, object]] = []
        if self._mode == "plain":
            self._plain_buffer += chunk
            text = normalize_llm_reasoning(self._plain_buffer)
            if text:
                events.append({"event": "thought", "text": text, "replace": True})
            return events

        self._buffer += chunk
        if self._mode == "undecided":
            stripped = self._buffer.lstrip()
            if not stripped:
                return events
            if stripped.startswith("{"):
                self._mode = "json"
            else:
                self._mode = "plain"
                self._plain_buffer = self._buffer
                return self.feed("")

        if self._mode != "json":
            return events

        decoded = _extract_json_content_value(self._buffer)
        if len(decoded) > self._emitted_content_len:
            delta = decoded[self._emitted_content_len :]
            self._emitted_content_len = len(decoded)
            if delta:
                events.append({"event": "content_delta", "delta": delta})
        return events


def parse_agent_response(raw: str) -> dict[str, str]:
    """Parse the assistant's final JSON envelope.

    Returns ``{"reasoning": str, "content": str}``. Tries strict JSON first, then
    field extraction when the model returns almost-valid JSON (common with long
    markdown in ``content``). Plain non-JSON replies still pass through as ``content``.
    """
    text = (raw or "").strip()
    if not text:
        return {"reasoning": "", "content": ""}

    fence = _FENCE_RE.match(text)
    if fence:
        text = fence.group(1).strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        if _looks_like_json_envelope(text):
            extracted = _parse_envelope_fields(text)
            if extracted is not None:
                return extracted
        return {"reasoning": "", "content": raw.strip()}

    if not isinstance(data, dict):
        if _looks_like_json_envelope(text):
            extracted = _parse_envelope_fields(text)
            if extracted is not None:
                return extracted
        return {"reasoning": "", "content": raw.strip()}

    reasoning = data.get("reasoning", "")
    content = data.get("content", "")
    return {
        "reasoning": str(reasoning).strip() if reasoning is not None else "",
        "content": str(content).strip() if content is not None else "",
    }
