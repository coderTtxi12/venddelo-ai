from cryptography.fernet import Fernet

from app.modules.marketing.crypto import MarketingCrypto, build_marketing_crypto


def test_encrypt_decrypt_str_roundtrip():
    key = Fernet.generate_key().decode()
    crypto = MarketingCrypto(key)
    token = crypto.encrypt_str("user@example.com")
    assert token != "user@example.com"
    assert crypto.decrypt_str(token) == "user@example.com"


def test_encrypt_decrypt_json_roundtrip():
    key = Fernet.generate_key().decode()
    crypto = MarketingCrypto(key)
    payload = {"cookies": [{"name": "c", "value": "1"}], "origins": []}
    token = crypto.encrypt_json(payload)
    assert crypto.decrypt_json(token) == payload


def test_build_marketing_crypto_requires_key(monkeypatch):
    from app.core.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("MARKETING_AGENT_FERNET_KEY", "")
    get_settings.cache_clear()
    try:
        import pytest

        with pytest.raises(ValueError, match="MARKETING_AGENT_FERNET_KEY"):
            build_marketing_crypto("")
    finally:
        get_settings.cache_clear()
