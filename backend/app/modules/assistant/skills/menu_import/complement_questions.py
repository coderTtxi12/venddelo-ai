"""Generate batch clarification questions for complement / live-menu conflicts."""

from __future__ import annotations

from app.modules.assistant.skills.menu_import.draft_schema import ImportDraft, OpenQuestion
from app.modules.assistant.skills.menu_import.menu_reconcile import ReconciliationPlan


def _existing_question_ids(draft: ImportDraft) -> set[str]:
    return {question.id for question in draft.open_questions}


def build_complement_questions(
    draft: ImportDraft,
    plan: ReconciliationPlan,
) -> list[OpenQuestion]:
    """Questions when draft complements collide with an existing live product."""
    existing_ids = _existing_question_ids(draft)
    questions: list[OpenQuestion] = []

    products_by_ref: dict[str, tuple[str, list]] = {}
    for category in draft.categories:
        for product in category.products:
            if product.option_groups:
                products_by_ref[product.ref] = (product.name, product.option_groups)

    for product_ref in plan.products_with_existing_groups:
        row = products_by_ref.get(product_ref)
        if row is None:
            continue
        product_name, groups = row
        group_titles = ", ".join(group.title for group in groups[:4])
        question_id = f"complement_live_conflict_{product_ref}"
        if question_id in existing_ids:
            continue
        questions.append(
            OpenQuestion(
                id=question_id,
                question_es=(
                    f"El producto **{product_name}** ya tiene complementos en el menú en vivo. "
                    f"El menú importado trae: {group_titles}. "
                    "¿Usamos los complementos del documento importado, mantenemos los del menú "
                    "en vivo, o mezclamos (indica cómo)?"
                ),
                context="Conflicto complementos importado vs menú live",
                related_refs=[product_ref],
            )
        )

    for category in draft.categories:
        for product in category.products:
            if not product.option_groups:
                continue
            ambiguous_required = [
                group
                for group in product.option_groups
                if group.required and group.min_selections == 0
            ]
            if not ambiguous_required:
                continue
            question_id = f"complement_required_{product.ref}"
            if question_id in existing_ids:
                continue
            titles = ", ".join(group.title for group in ambiguous_required)
            questions.append(
                OpenQuestion(
                    id=question_id,
                    question_es=(
                        f"Para **{product.name}**, el grupo(s) «{titles}» no está claro si es "
                        "obligatorio u opcional. ¿El cliente debe elegir al menos uno?"
                    ),
                    context="Complemento obligatorio vs opcional",
                    related_refs=[product.ref],
                )
            )

    return questions


def merge_open_questions(draft: ImportDraft, extra: list[OpenQuestion]) -> ImportDraft:
    if not extra:
        return draft
    existing_ids = _existing_question_ids(draft)
    merged = list(draft.open_questions)
    for question in extra:
        if question.id not in existing_ids:
            merged.append(question)
            existing_ids.add(question.id)
    return draft.model_copy(update={"open_questions": merged})
