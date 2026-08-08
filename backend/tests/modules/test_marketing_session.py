from cryptography.fernet import Fernet

from app.modules.marketing.browser.session import (
    decode_storage_state,
    encode_storage_state,
)
from app.modules.marketing.crypto import MarketingCrypto


def test_decode_storage_state_none():
    crypto = MarketingCrypto(Fernet.generate_key().decode())
    assert decode_storage_state(crypto, None) is None


def test_encode_decode_storage_state_roundtrip():
    crypto = MarketingCrypto(Fernet.generate_key().decode())
    state = {"cookies": [{"name": "c", "value": "1"}], "origins": []}
    token = encode_storage_state(crypto, state)
    assert decode_storage_state(crypto, token) == state
