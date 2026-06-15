from abc import ABC, abstractmethod

from pydantic import BaseModel, Field


class ExtractedOptionItem(BaseModel):
    label: str
    price_delta_cents: int = 0


class ExtractedOptionGroup(BaseModel):
    title: str
    selection: str = "single"
    required: bool = False
    items: list[ExtractedOptionItem] = Field(default_factory=list)


class ExtractedProduct(BaseModel):
    name: str
    description: str | None = None
    price_cents: int
    option_groups: list[ExtractedOptionGroup] = Field(default_factory=list)


class ExtractedCategory(BaseModel):
    name: str
    products: list[ExtractedProduct] = Field(default_factory=list)


class ExtractionResult(BaseModel):
    detected_language: str = "es"
    categories: list[ExtractedCategory] = Field(default_factory=list)


class AIGatewayPort(ABC):
    @abstractmethod
    def extract_menu(self, file_bytes: bytes, content_type: str) -> ExtractionResult: ...

    @abstractmethod
    def optimize_image(self, image_bytes: bytes, content_type: str) -> bytes: ...

    @abstractmethod
    def optimize_description(self, text: str, *, context: str = "") -> str: ...

    @abstractmethod
    def pick_palette(
        self,
        *,
        logo_bytes: bytes | None,
        brand_name: str,
        palettes: list[str],
    ) -> str: ...

    @abstractmethod
    def translate_texts(
        self,
        texts: dict[str, str],
        *,
        source_locale: str,
        target_locale: str,
    ) -> dict[str, str]: ...
