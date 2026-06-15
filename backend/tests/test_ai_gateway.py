from app.infra.ai.stub_gateway import StubAIGateway


def test_stub_extract_menu_returns_categories():
    gateway = StubAIGateway()
    result = gateway.extract_menu(b"fake", "image/png")
    assert result.detected_language == "es"
    assert len(result.categories) >= 2
    assert result.categories[0].products[0].price_cents > 0


def test_stub_translate_prefixes_locale():
    gateway = StubAIGateway()
    out = gateway.translate_texts(
        {"name": "Taco"},
        source_locale="es",
        target_locale="en",
    )
    assert out["name"] == "[en] Taco"


def test_stub_optimize_description():
    gateway = StubAIGateway()
    out = gateway.optimize_description("Taco rico")
    assert "optimizado" in out


def test_stub_pick_palette_from_list():
    gateway = StubAIGateway()
    palette = gateway.pick_palette(
        logo_bytes=None,
        brand_name="Tacos MX",
        palettes=["sunset", "ocean"],
    )
    assert palette in {"sunset", "ocean"}
