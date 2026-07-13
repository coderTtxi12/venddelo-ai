from __future__ import annotations

import json
from typing import Any


MENU_CURRENCY = "MXN"


def _prompt_context(context: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    discovery = context.get("discovery_answers") or {}
    cuisine = discovery.get("cuisine_type") or discovery.get("cuisine") or ""
    cuisine_line = f"\nRestaurant cuisine hint: {cuisine}." if cuisine else ""
    return cuisine_line, discovery


def _json_schema_block() -> str:
    return f"""Return a single JSON object with this shape (// = field meaning):
{{
  "categories": [{{  // menu sections as printed (e.g. Tacos, Bebidas)
    "ref": "cat_1",  // stable id for linking; unique per draft (cat_1, cat_2, …)
    "name": "string",  // category heading exactly as shown
    "sort_order": 0,  // display order starting at 0
    "constraints_notes": "string | null",  // per-category rules for the whole section that do not fit description
    "products": [{{  // priced line items in this section
      "ref": "prod_1",  // stable id; unique per draft (prod_1, prod_2, …)
      "name": "string",  // product name as printed
      "description": "string | null",  // description of the product
      "price_mxn": 0,  // base price in whole pesos (MXN); null if missing from source
      "currency": "{MENU_CURRENCY}",  // always MXN
      "is_available": true,  // false only when explicitly marked unavailable
      "catalog_discount": null,  // per-item discount: {{type: percent|amount, percent?, amount_mxn?, label?}}; null if none
      "option_groups": [{{  // complement or variant choices for this product
        "ref": "og_1",  // stable id; unique per draft
        "title": "string",  // group label (e.g. Tamaño, Extras)
        "selection": "single | multi",  // pick one vs pick many
        "required": false,  // customer must choose before ordering
        "min_selections": 0,  // minimum picks when selection=multi
        "max_selections": null,  // maximum picks; null = no cap
        "items": [{{  // choices inside the group
          "ref": "oi_1",  // stable id; unique within the product
          "label": "string",  // choice name as printed
          "price_delta_mxn": 0  // extra cost vs base price in pesos; 0 if included
        }}]
      }}],
      "constraints_notes": "string | null"  // per-product rules that do not fit option_groups
    }}]
  }}],
  "promotions": [{{  // promos, combos, and 2x1 campaigns printed on the menu
    "ref": "promo_1",  // stable id; unique per draft
    "name": "string",  // promo title as printed
    "type": "two_for_one | percent | amount | combo",  // promo mechanic
    "scope": "product| category | order",  // what the promo applies to
    "percent": null,  // discount % when type=percent
    "amount_mxn": null,  // fixed discount in pesos when type=amount
    "bundle": {{  // NxM details when type=two_for_one or combo; null otherwise
      "get_quantity": 2,  // items the customer receives
      "pay_quantity": 1,  // items the customer pays for
      "pairing_mode": "cross_product | same_product"  // mix different products vs same product
    }},
    "target_product_refs": [],  // prod_* refs when scope=product
    "target_category_refs": [],  // cat_* refs when scope=category
    "eligible_option_item_refs": [],  // allow-list: every oi_* ref that participates in this promo; list all eligible complements/choices
    "schedule_notes": "string | null",  // human-readable schedule text from the menu
    "schedule": {{  // structured schedule when parseable; null if unknown
      "weekdays": [],  // 0=Mon … 6=Sun; empty = every day
      "use_time_window": false  // true when limited to specific hours
    }},
    "constraints_notes": "string | null"  // extra promo rules not captured above
  }}],
  "global_rules": ["string"],  // menu-wide footnotes verbatim (not tied to one product)
  "unmapped_text": ["string"],  // visible text you could not place in the schema (incl. missing prices)
  "open_questions": []  // ambiguities for the owner: {{id, question_es, context?, related_refs?, list of suggested answers?}}; use [] when the menu is clear
}}"""


def build_literal_ocr_prompt(context: dict[str, Any]) -> str:
    """Phase 1: transcribe the menu as printed — no owner restructuring."""

    return f"""You are a high-accuracy menu OCR and catalog mapping engine.

Your task is to read the entire menu image and return a complete, customer-ready catalog using the provided JSON schema.

The resulting catalog must allow customers to understand, customize and order every product without asking the restaurant owner for clarification.

CORE RULES

- Read all visible text and use both wording and visual layout.
- Preserve category and product names as printed, correcting only obvious OCR errors and whitespace.
- Never invent products, prices, ingredients, options, restrictions or promotions.
- All prices are whole Mexican pesos (MXN). Use null when a price is missing or unreadable.
- Never silently omit relevant information.
- Do not treat food photos or decorative text as products unless they correspond to a visible menu item.
- Return valid JSON only, with no markdown, comments or explanations.

CUSTOMER-CHOICE INFERENCE

For each text block associated with a product, internally classify it as one of these:

1. Fixed ingredient
2. Required customer choice
3. Optional add-on
4. Priced variant
5. Separate product
6. Promotion or rule

Create an option_group whenever the restaurant needs a decision from the customer to prepare the order correctly, even when the menu does not explicitly say it.

Infer an option group when there is strong evidence that:

- The choices appear directly below, beside or inside a product block.
- The entries are alternatives of the same kind, such as flavors, proteins, sauces, sides, sizes or preparation styles.
- The entries do not have independent product prices.
- They are alternatives rather than ingredients normally included together.
- The restaurant must know which alternative the customer wants.

Examples:

“Churros — Lechera, cajeta o chocolate”
→ Required single-selection group named “Sabor”.

“Hamburguesa — res, pollo o portobello”
→ Required single-selection group named “Proteína”.

“Hamburguesa — carne, queso, lechuga y jitomate”
→ Fixed ingredients in the product description, not options.

“Agrega tocino +$20”
→ Optional add-on with price_delta_mxn: 20.

SELECTION LOGIC

- Mutually exclusive alternatives connected by “o / or” normally mean:
  selection: single
  required: true
  min_selections: 1
  max_selections: 1

- “N sabores” or an equivalent clear layout means:
  selection: multi
  required: true
  min_selections: N
  max_selections: N

- “Hasta N” for a choice necessary to prepare the product means:
  selection: multi
  required: true
  min_selections: 1
  max_selections: N

- “De 1 a N” means:
  selection: multi
  required: true
  min_selections: 1
  max_selections: N

- Extras, additions, toppings or choices with an additional price are normally optional:
  required: false
  min_selections: 0
  max_selections: null

- “Agrega hasta N” means:
  selection: multi
  required: false
  min_selections: 0
  max_selections: N

- Included option items use price_delta_mxn: 0.
- Additional prices must be stored as exact price deltas.
- Never put a product’s complete price in price_delta_mxn.

INGREDIENTS VS OPTIONS

Keep information in the product description when it represents:

- Fixed ingredients.
- Included components with no alternatives.
- Preparation details.
- Garnishes automatically included.
- Descriptive lists whose components are normally served together.
- Description of the product itself.

Convert information into option_groups when it represents a customer decision.

Do not depend only on explicit phrases such as “elige” or “selecciona”. Use semantic meaning, proximity, grouping, typography and ordering logic.

VISUAL GROUPING

- Text immediately below or beside a product normally belongs to that product until another product or category begins.
- A flavors, extras, sides or sauces block may apply to multiple products when its heading, position or surrounding notes clearly indicate shared applicability.
- Attach shared options to every product they clearly apply to.
- Do not attach shared options to unrelated products.
- Combine information that continues across columns or pages.
- Avoid duplicating repeated headers or products.

MAPPING PRIORITY

Place information in this order:

1. Product-specific information:
   description, option_groups or product constraints_notes.

2. Rules applying to a complete section:
   category constraints_notes.

3. Discounts, combos, packages and 2x1 offers:
   promotions.

4. Truly menu-wide rules:
   global_rules.

5. Illegible or genuinely unplaceable visible text:
   unmapped_text.

Never place order-relevant information only in global_rules, unmapped_text or open_questions when it can be attached to a product, category, option group or promotion.

PROMOTIONS

- Never infer a promotion from design, colors, crossed-out prices or photographs alone unless the promotional mechanic is visible and reasonably clear.
- Map combos, packages, discounts and 2x1 offers under promotions.
- Reference every affected product or category.
- Include all eligible option-item refs when the promotion applies only to specific choices.
- Preserve schedule and restrictions from the menu.
- When the promotion exists but an essential mechanic is unclear, map the certain information and add an open_question.

UNCERTAINTY

When information is unclear:

- Do not guess prices or invent rules.
- Map everything that is reasonably certain.
- Preserve unreadable or unplaceable text in unmapped_text.
- Add a concise open_question in Spanish.
- Include context, related refs and realistic suggested answers.
- Do not omit an entire product just because one detail is uncertain.

When one interpretation is clearly more likely based on wording, visual grouping and ordering logic, use that interpretation.

When two interpretations are similarly plausible, use the most likely customer-ordering structure and add an open_question.

UNCERTAINTY AND OPEN QUESTIONS

When information is uncertain, unreadable or difficult to infer:

- Do not guess.
- Map everything that is reasonably certain.
- Keep the affected product in the catalog.
- Use null only for the uncertain field.
- Add an item to open_questions.
- Never silently omit the ambiguity.

Each open question must:

- Be written in clear Spanish.
- Ask one specific question.
- Explain the ambiguity in context.
- Include affected refs in related_refs.
- Include short and realistic suggested_answers.
- Suggest only answers supported by the visible menu.

Example:

{{
  "id": "q_1",
  "question_es": "¿El cliente debe elegir una salsa o se incluyen todas?",
  "context": "Las salsas aparecen debajo del producto, pero el menú no indica claramente cómo se sirven.",
  "related_refs": ["prod_4"],
  "suggested_answers": [
    "Elige una salsa",
    "Se incluyen todas",
    "Son extras opcionales"
  ]
}}

Use open_questions for ambiguities that affect ordering, price, preparation, options or promotions.

If the menu is clear, return:

"open_questions": []

FINAL VALIDATION

Before returning the JSON, verify that:

- Every visible category, product and price was mapped.
- Every customer decision was represented correctly.
- Fixed ingredients were not converted into options.
- Required and optional selections have correct limits.
- Shared options were attached only to relevant products.
- Promotions reference existing refs.
- All refs are unique.
- All required fields are present.
- Every unresolved ambiguity appears in open_questions with suggested answers.
- The output is valid JSON.

{_json_schema_block()}

Output JSON only. No markdown fences."""


def _modeling_menu_json_text(context: dict[str, Any]) -> str:
    menu_json = context.get("menu_json")
    if menu_json is None:
        return "(vacío — no hay menú OCR para modelar)"
    if isinstance(menu_json, dict):
        return json.dumps(menu_json, ensure_ascii=False, indent=2)
    text = str(menu_json).strip()
    return text or "(vacío — no hay menú OCR para modelar)"


def _modeling_question_answers_text(context: dict[str, Any]) -> str:
    question_answers = context.get("question_answers")
    if isinstance(question_answers, str) and question_answers.strip():
        return question_answers.strip()

    from app.modules.assistant.skills.menu_import.clarification_input import (
        format_question_answers_for_prompt,
    )
    from app.modules.assistant.skills.menu_import.draft_schema import OpenQuestion

    raw_questions = context.get("open_questions") or []
    open_questions: list[OpenQuestion] = []
    for entry in raw_questions:
        try:
            open_questions.append(
                entry if isinstance(entry, OpenQuestion) else OpenQuestion.model_validate(entry)
            )
        except Exception:
            continue
    return format_question_answers_for_prompt(
        clarification_answers=context.get("clarification_answers"),
        open_questions=open_questions,
    )


def _modeling_owner_instructions_text(context: dict[str, Any], discovery: dict[str, Any]) -> str:
    owner_instructions = (
        str(context.get("owner_instructions") or "").strip()
        or str(context.get("menu_context") or "").strip()
        or str(discovery.get("menu_context") or "").strip()
    )
    if owner_instructions:
        return owner_instructions
    return "(ninguna — sin instrucciones adicionales del propietario)"


def build_modeling_prompt(context: dict[str, Any]) -> str:
    """Phase 2: restructure the OCR JSON clone using owner answers and instructions."""
    cuisine_line, discovery = _prompt_context(context)
    menu_json_text = _modeling_menu_json_text(context)
    question_answers_text = _modeling_question_answers_text(context)
    owner_instructions_text = _modeling_owner_instructions_text(context, discovery)

    return f"""You are a menu JSON transformation agent.

Transform CURRENT_MENU_JSON using OWNER_ANSWERS and OWNER_INSTRUCTIONS.

Return one complete JSON object following JSON_SCHEMA. Never return a patch, diff, explanation, markdown or wrapper.

SOURCE PRIORITY

1. Latest explicit owner instruction
2. Owner answers
3. Current menu JSON
4. Strong ordering inference

PRESERVE BY DEFAULT

Start from an exact copy of CURRENT_MENU_JSON.

Modify only entities affected by owner input or changes required to make the menu orderable.

Never:

- Omit unrelated information
- Move products between categories unless requested
- Duplicate categories, products, option groups or items
- Reuse an existing ref for a new entity
- Change prices unless explicitly requested
- Remove an answered question before applying its answer

ORDERING LOGIC

Represent every customer decision with option_groups.

- single: only one item may be selected
- multi: multiple items may be selected
- required: true when the choice is necessary
- required: false when optional
- min_selections and max_selections must match the confirmed rule
- price_delta_mxn represents only the additional cost

Use descriptions for fixed ingredients, included components and customer-facing information that does not require a selection.

SPECIFIC SELECTIONS

When a generic option or add-on requires the customer to specify a particular item:

- Replace the generic item with specific selectable items
- Use the related existing option list when applicable
- Create a new optional or required group according to the confirmed rule
- Apply the confirmed price to each eligible item
- Generate new unique refs
- Preserve unrelated options

If the restaurant needs to know which item the customer selected, a generic label alone is not sufficient.

SHARED RULES

When an owner rule applies to multiple products or categories:

- Apply it consistently to every affected entity
- Preserve differences not explicitly changed
- Do not apply it to unrelated entities

VISIBLE INFORMATION

Customer-facing information must not remain only in constraints_notes.

Move information when appropriate:

- Included ingredients and components → description
- Customer decisions → option_groups
- Selection limits → min_selections and max_selections
- Optional additions → optional option_groups
- Customer-facing rules → description or option_groups

Use constraints_notes only for internal information that cannot be represented elsewhere.

OWNER INPUT

Treat explicit names, prices, quantities, lists and limits literally.

When an instruction requests merging, splitting, adding, removing or reorganizing entities, apply only the necessary structural changes.

When information is unclear, conflicting or incomplete:

- Do not guess
- Preserve all certain data
- Keep the affected entities
- Add an open_question

OPEN QUESTIONS

Use OWNER_ANSWERS to update all affected entities and remove resolved questions.

Each unresolved question must follow:

{{
  "id": "q_1",
  "question_es": "Pregunta clara y específica",
  "context": "Breve explicación de la ambigüedad",
  "related_refs": ["ref_1"],
  "suggested_answers": [
    "Respuesta sugerida 1",
    "Respuesta sugerida 2"
  ]
}}

Questions must:

- Be written in Spanish
- Ask one decision at a time
- Include all affected refs
- Include short and realistic suggested answers
- Use only information supported by the menu or owner input

REFERENCES

- Preserve refs for unchanged entities
- Create globally unique refs for new entities
- Never reuse refs from another entity
- Update all affected references
- Never leave duplicate or broken refs

SCHEMA LIMITATIONS

If an owner rule cannot be represented correctly with JSON_SCHEMA:

- Do not approximate it silently
- Preserve the safest valid structure
- Add an open_question with supported implementation choices

FINAL VALIDATION

Before returning, verify:

- Every owner instruction was applied
- Every answered question was structurally resolved before removal
- No unrelated entity changed
- No entity was duplicated, omitted or moved accidentally
- All refs are unique and valid
- The menu is understandable and orderable
- Customer-facing information is visible
- Remaining ambiguities appear in open_questions
- The result follows JSON_SCHEMA exactly
- The output is valid JSON

Return valid JSON only. No markdown, explanations, summaries or change logs.

CURRENT MENU JSON:

{menu_json_text}

OWNER_ANSWERS:

{question_answers_text}

OWNER_INSTRUCTIONS:

{owner_instructions_text}

JSON SCHEMA:

{_json_schema_block()}

Output JSON only. No markdown fences."""


def build_extraction_prompt(context: dict[str, Any]) -> str:
    """Backward-compatible alias for the modeling-phase prompt."""
    return build_modeling_prompt(context)
