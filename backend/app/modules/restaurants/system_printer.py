"""List and print to OS printers (CUPS on macOS/Linux, Windows printer queue).

The browser cannot enumerate system printers. This runs on the API host.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys

from pydantic import BaseModel, Field

from app.core.exceptions import ValidationError

MAX_PAYLOAD_BYTES = 200_000
PRINTER_NAME_RE = re.compile(r"^[\w .@+/()#\-]+$", re.UNICODE)
LPSTAT_PRINTER_RE = re.compile(r"^printer\s+(\S+)", re.MULTILINE)
LPSTAT_DEFAULT_RE = re.compile(r"^system default destination:\s+(\S+)\s*$", re.MULTILINE)


class SystemPrinterDTO(BaseModel):
    name: str
    is_default: bool = False


class SystemPrinterDiscoverDTO(BaseModel):
    items: list[SystemPrinterDTO]
    default_name: str | None = None
    message: str | None = None


class SystemPrinterPrintRequest(BaseModel):
    printer_name: str = Field(min_length=1, max_length=200)
    payload_base64: str = Field(min_length=1, max_length=400_000)


def validate_system_printer_name(name: str) -> str:
    cleaned = name.strip()
    if not cleaned or len(cleaned) > 200:
        raise ValidationError("Elige una impresora del sistema.")
    if any(char in cleaned for char in ("\n", "\r", "\x00", ";", "|", "&")):
        raise ValidationError("El nombre de la impresora no es válido.")
    if not PRINTER_NAME_RE.match(cleaned):
        raise ValidationError("El nombre de la impresora no es válido.")
    return cleaned


def parse_lpstat_output(text: str) -> tuple[list[str], str | None]:
    names = list(dict.fromkeys(LPSTAT_PRINTER_RE.findall(text)))
    default_match = LPSTAT_DEFAULT_RE.search(text)
    default_name = default_match.group(1) if default_match else None
    if default_name and default_name not in names:
        names.insert(0, default_name)
    return names, default_name


def parse_windows_printer_json(raw: str) -> tuple[list[str], str | None]:
    data = json.loads(raw) if raw.strip() else []
    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list):
        return [], None
    names: list[str] = []
    default_name: str | None = None
    for item in data:
        if not isinstance(item, dict):
            continue
        name = str(item.get("Name") or "").strip()
        if not name:
            continue
        names.append(name)
        if item.get("Default") is True:
            default_name = name
    return list(dict.fromkeys(names)), default_name


def _list_cups_printers() -> SystemPrinterDiscoverDTO:
    lpstat = shutil.which("lpstat")
    if not lpstat:
        return SystemPrinterDiscoverDTO(
            items=[],
            default_name=None,
            message=(
                "Este servidor no tiene colas de impresión (CUPS). En macOS o Linux instala "
                "las impresoras del sistema."
            ),
        )
    try:
        result = subprocess.run(
            [lpstat, "-p", "-d"],
            capture_output=True,
            text=True,
            timeout=6,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return SystemPrinterDiscoverDTO(
            items=[],
            default_name=None,
            message="No se pudieron leer las impresoras del sistema.",
        )
    names, default_name = parse_lpstat_output(f"{result.stdout}\n{result.stderr}")
    items = [SystemPrinterDTO(name=name, is_default=name == default_name) for name in names]
    if items:
        return SystemPrinterDiscoverDTO(items=items, default_name=default_name, message=None)
    return SystemPrinterDiscoverDTO(
        items=[],
        default_name=None,
        message="No hay impresoras instaladas en este equipo. Agrégalas en Ajustes del sistema.",
    )


def _list_windows_printers() -> SystemPrinterDiscoverDTO:
    try:
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_Printer | Select-Object Name, Default | ConvertTo-Json -Compress",
            ],
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return SystemPrinterDiscoverDTO(
            items=[],
            default_name=None,
            message="No se pudieron leer las impresoras de Windows.",
        )
    try:
        names, default_name = parse_windows_printer_json(result.stdout)
    except json.JSONDecodeError:
        return SystemPrinterDiscoverDTO(
            items=[],
            default_name=None,
            message="No se pudieron leer las impresoras de Windows.",
        )
    items = [SystemPrinterDTO(name=name, is_default=name == default_name) for name in names]
    if items:
        return SystemPrinterDiscoverDTO(items=items, default_name=default_name, message=None)
    return SystemPrinterDiscoverDTO(
        items=[],
        default_name=None,
        message="No hay impresoras instaladas en este equipo.",
    )


def list_system_printers() -> SystemPrinterDiscoverDTO:
    if sys.platform == "win32":
        return _list_windows_printers()
    return _list_cups_printers()


def send_to_system_printer(printer_name: str, payload: bytes) -> None:
    name = validate_system_printer_name(printer_name)
    if not payload:
        raise ValidationError("El ticket está vacío.")
    if len(payload) > MAX_PAYLOAD_BYTES:
        raise ValidationError("El ticket es demasiado grande.")
    if sys.platform == "win32":
        _print_windows(name, payload)
        return
    lp = shutil.which("lp")
    if not lp:
        raise ValidationError("No se encontró el comando de impresión del sistema (lp).")
    try:
        result = subprocess.run(
            [lp, "-d", name, "-o", "raw", "-s"],
            input=payload,
            capture_output=True,
            timeout=20,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise ValidationError("La impresora del sistema no respondió a tiempo.") from exc
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or b"").decode("utf-8", errors="replace").strip()
        raise ValidationError(detail or "No se pudo imprimir en la impresora del sistema.")


def _print_windows(printer_name: str, payload: bytes) -> None:
    import ctypes
    from ctypes import wintypes

    class DOC_INFO_1(ctypes.Structure):
        _fields_ = [
            ("pDocName", wintypes.LPWSTR),
            ("pOutputFile", wintypes.LPWSTR),
            ("pDatatype", wintypes.LPWSTR),
        ]

    handle = wintypes.HANDLE()
    if not ctypes.windll.winspool.OpenPrinterW(printer_name, ctypes.byref(handle), None):
        raise ValidationError("No se encontró esa impresora de Windows.")
    try:
        doc = DOC_INFO_1("Venddelo ticket", None, "RAW")
        if not ctypes.windll.winspool.StartDocPrinterW(handle, 1, ctypes.byref(doc)):
            raise ValidationError("No se pudo iniciar la impresión en Windows.")
        try:
            ctypes.windll.winspool.StartPagePrinter(handle)
            written = wintypes.DWORD()
            buffer = (ctypes.c_char * len(payload)).from_buffer_copy(payload)
            ok = ctypes.windll.winspool.WritePrinter(handle, buffer, len(payload), ctypes.byref(written))
            ctypes.windll.winspool.EndPagePrinter(handle)
            if not ok:
                raise ValidationError("No se pudo enviar el ticket a la impresora de Windows.")
        finally:
            ctypes.windll.winspool.EndDocPrinter(handle)
    finally:
        ctypes.windll.winspool.ClosePrinter(handle)
