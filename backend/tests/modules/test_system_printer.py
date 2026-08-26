from unittest.mock import MagicMock, patch

import pytest

from app.core.exceptions import ValidationError
from app.modules.restaurants.system_printer import (
    parse_lpstat_output,
    parse_windows_printer_json,
    send_to_system_printer,
    validate_system_printer_name,
)


LPSTAT_SAMPLE = """
printer EPSON_TM is idle.  enabled since Wed 26 Aug 2026 12:00:00 PM CST
printer HP_OfficeJet is idle.  enabled since Wed 26 Aug 2026 12:00:00 PM CST
system default destination: EPSON_TM
"""


def test_parse_lpstat_output_lists_queues_and_default() -> None:
    names, default_name = parse_lpstat_output(LPSTAT_SAMPLE)
    assert names == ["EPSON_TM", "HP_OfficeJet"]
    assert default_name == "EPSON_TM"


def test_parse_lpstat_includes_default_even_if_missing_from_printer_lines() -> None:
    names, default_name = parse_lpstat_output("system default destination: Kitchen_POS\n")
    assert names == ["Kitchen_POS"]
    assert default_name == "Kitchen_POS"


def test_parse_windows_printer_json_reads_default() -> None:
    names, default_name = parse_windows_printer_json(
        '[{"Name":"HP LaserJet","Default":false},{"Name":"EPSON TM-T20","Default":true}]'
    )
    assert names == ["HP LaserJet", "EPSON TM-T20"]
    assert default_name == "EPSON TM-T20"


def test_parse_windows_printer_json_single_object() -> None:
    names, default_name = parse_windows_printer_json('{"Name":"EPSON TM-T20","Default":true}')
    assert names == ["EPSON TM-T20"]
    assert default_name == "EPSON TM-T20"


def test_validate_system_printer_name_accepts_cups_queue() -> None:
    assert validate_system_printer_name("  EPSON_TM  ") == "EPSON_TM"


def test_validate_system_printer_name_rejects_shell_metacharacters() -> None:
    with pytest.raises(ValidationError, match="no es válido"):
        validate_system_printer_name("EPSON; rm -rf /")


def test_send_to_system_printer_uses_lp_argv(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.modules.restaurants.system_printer.sys.platform", "darwin")
    monkeypatch.setattr("app.modules.restaurants.system_printer.shutil.which", lambda _: "/usr/bin/lp")
    completed = MagicMock(returncode=0, stdout=b"", stderr=b"")
    with patch("app.modules.restaurants.system_printer.subprocess.run", return_value=completed) as run:
        send_to_system_printer("EPSON_TM", b"\x1b@ticket")
    run.assert_called_once()
    args = run.call_args.args[0]
    assert args == ["/usr/bin/lp", "-d", "EPSON_TM", "-o", "raw", "-s"]
    assert run.call_args.kwargs["input"] == b"\x1b@ticket"


def test_send_to_system_printer_rejects_empty_payload() -> None:
    with pytest.raises(ValidationError, match="vacío"):
        send_to_system_printer("EPSON_TM", b"")
