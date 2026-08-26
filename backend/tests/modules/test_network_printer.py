import ipaddress
from unittest.mock import patch

import pytest

from app.core.exceptions import ValidationError
from app.modules.restaurants.network_printer import (
    NetworkPrinterDTO,
    discover_raw_printers,
    send_raw_escpos,
    validate_printer_target,
)


def test_validate_printer_target_accepts_lan_ip() -> None:
    host, port = validate_printer_target("192.168.1.50", 9100)
    assert host == "192.168.1.50"
    assert port == 9100


def test_validate_printer_target_rejects_public_ip() -> None:
    with pytest.raises(ValidationError, match="red local"):
        validate_printer_target("8.8.8.8", 9100)


def test_validate_printer_target_rejects_loopback() -> None:
    with pytest.raises(ValidationError, match="no es válida"):
        validate_printer_target("127.0.0.1", 9100)


def test_validate_printer_target_rejects_wrong_port() -> None:
    with pytest.raises(ValidationError, match="9100"):
        validate_printer_target("192.168.1.50", 80)


def test_validate_printer_target_rejects_hostname() -> None:
    with pytest.raises(ValidationError, match="IP"):
        validate_printer_target("printer.local", 9100)


def test_discover_without_private_nics_explains() -> None:
    with patch(
        "app.modules.restaurants.network_printer.list_local_private_subnets",
        return_value=[],
    ):
        result = discover_raw_printers()
    assert result.items == []
    assert result.scanned_subnets == []
    assert result.message is not None
    assert "red local" in result.message


def test_discover_finds_open_raw_port() -> None:
    subnet = ipaddress.IPv4Network("192.168.10.0/24")

    async def fake_scan(subnets, *, port=9100, timeout=0.4):
        del subnets, port, timeout
        return [
            NetworkPrinterDTO(
                host="192.168.10.20",
                port=9100,
                label="Impresora de red 192.168.10.20",
            )
        ]

    with (
        patch(
            "app.modules.restaurants.network_printer.list_local_private_subnets",
            return_value=[subnet],
        ),
        patch("app.modules.restaurants.network_printer.scan_raw_printers", new=fake_scan),
    ):
        result = discover_raw_printers()
    assert len(result.items) == 1
    assert result.items[0].host == "192.168.10.20"
    assert result.message is None


def test_send_raw_escpos_rejects_public_target() -> None:
    with pytest.raises(ValidationError, match="red local"):
        send_raw_escpos("1.1.1.1", 9100, b"ESC/POS")
