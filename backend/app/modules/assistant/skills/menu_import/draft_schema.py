from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.modules.assistant.skills.menu_import.price_units import (
    _coerce_legacy_cents_field,
    mxn_to_cents,
)


class ImportOptionItem(BaseModel):
    ref: str
    label: str
    price_delta_mxn: float = 0
    sort_order: int = 0

    @model_validator(mode="before")
    @classmethod
    def _normalize_price_delta(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return _coerce_legacy_cents_field(
                data, mxn_key="price_delta_mxn", cents_key="price_delta_cents"
            )
        return data

    @property
    def price_delta_cents(self) -> int:
        return mxn_to_cents(self.price_delta_mxn)


class ImportOptionGroup(BaseModel):
    ref: str
    title: str
    selection: Literal["single", "multi"] = "single"
    required: bool = False
    min_selections: int = 0
    max_selections: int = 1
    sort_order: int = 0
    items: list[ImportOptionItem] = Field(default_factory=list)


class ImportProduct(BaseModel):
    ref: str
    name: str
    description: str | None = None
    price_mxn: float = 0
    currency: str = "MXN"
    is_available: bool = True
    sort_order: int = 0
    option_groups: list[ImportOptionGroup] = Field(default_factory=list)
    constraints_notes: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _normalize_price(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return _coerce_legacy_cents_field(data, mxn_key="price_mxn", cents_key="price_cents")
        return data

    @property
    def price_cents(self) -> int:
        return mxn_to_cents(self.price_mxn)


DisplayLayout = Literal["vertical", "horizontal", "grid"]


class ImportCategory(BaseModel):
    ref: str
    name: str
    description: str | None = None
    sort_order: int = 0
    display_layout: DisplayLayout | None = None
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
    amount_mxn: float | None = None
    bundle: PromotionBundle | None = None
    target_product_refs: list[str] = Field(default_factory=list)
    target_category_refs: list[str] = Field(default_factory=list)
    eligible_option_item_refs: list[str] = Field(default_factory=list)
    schedule_notes: str | None = None
    schedule: PromotionSchedule | None = None
    constraints_notes: str | None = None

    @model_validator(mode="before")
    @classmethod
    def _normalize_amount(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return _coerce_legacy_cents_field(data, mxn_key="amount_mxn", cents_key="amount_cents")
        return data

    @property
    def amount_cents(self) -> int | None:
        if self.amount_mxn is None:
            return None
        return mxn_to_cents(self.amount_mxn)


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
