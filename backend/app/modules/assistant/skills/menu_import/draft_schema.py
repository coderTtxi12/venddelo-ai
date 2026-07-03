from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ImportOptionItem(BaseModel):
    ref: str
    label: str
    price_delta_cents: int = 0


class ImportOptionGroup(BaseModel):
    ref: str
    title: str
    selection: Literal["single", "multi"] = "single"
    required: bool = False
    min_selections: int = 0
    max_selections: int = 1
    items: list[ImportOptionItem] = Field(default_factory=list)


class ImportProduct(BaseModel):
    ref: str
    name: str
    description: str | None = None
    price_cents: int = 0
    currency: str = "MXN"
    is_available: bool = True
    option_groups: list[ImportOptionGroup] = Field(default_factory=list)
    constraints_notes: str | None = None


class ImportCategory(BaseModel):
    ref: str
    name: str
    description: str | None = None
    sort_order: int = 0
    products: list[ImportProduct] = Field(default_factory=list)


class PromotionBundle(BaseModel):
    get_quantity: int = 2
    pay_quantity: int = 1
    pairing_mode: str = "cross_product"


class PromotionSchedule(BaseModel):
    weekdays: list[int] = Field(default_factory=list)
    use_time_window: bool = False


class ImportPromotion(BaseModel):
    ref: str
    name: str
    type: Literal["two_for_one", "percent", "amount", "combo"]
    scope: Literal["product", "category", "order"] = "product"
    percent: float | None = None
    amount_cents: int | None = None
    bundle: PromotionBundle | None = None
    target_product_refs: list[str] = Field(default_factory=list)
    target_category_refs: list[str] = Field(default_factory=list)
    eligible_option_item_refs: list[str] = Field(default_factory=list)
    schedule_notes: str | None = None
    schedule: PromotionSchedule | None = None
    constraints_notes: str | None = None


class OpenQuestion(BaseModel):
    id: str
    question_es: str
    context: str = ""
    related_refs: list[str] = Field(default_factory=list)


class ImportDraft(BaseModel):
    categories: list[ImportCategory] = Field(default_factory=list)
    promotions: list[ImportPromotion] = Field(default_factory=list)
    global_rules: list[str] = Field(default_factory=list)
    unmapped_text: list[str] = Field(default_factory=list)
    open_questions: list[OpenQuestion] = Field(default_factory=list)


class ImportBatch(BaseModel):
    batch_index: int
    categories: list[ImportCategory] = Field(default_factory=list)
    promotions: list[ImportPromotion] = Field(default_factory=list)
    global_rules: list[str] = Field(default_factory=list)
    open_questions: list[OpenQuestion] = Field(default_factory=list)
