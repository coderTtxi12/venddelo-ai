"""Discover and print to LAN thermal printers (Wi-Fi / Ethernet, raw 9100).

The browser cannot scan the local network. This runs on the API host, so it only
finds printers reachable from that machine. Cloud-hosted APIs will typically
see no private NICs; kitchen PCs running the API on-site will.
"""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from collections.abc import Sequence

from pydantic import BaseModel, Field

from app.core.exceptions import ValidationError

RAW_PRINT_PORT = 9100
ALLOWED_PORTS = frozenset({9100, 9101, 9102})
CONNECT_TIMEOUT_SECONDS = 0.4
PRINT_TIMEOUT_SECONDS = 5.0
MAX_PAYLOAD_BYTES = 200_000
MAX_CONCURRENT_PROBES = 64


class NetworkPrinterDTO(BaseModel):
    host: str
    port: int = RAW_PRINT_PORT
    label: str


class NetworkPrinterDiscoverDTO(BaseModel):
    items: list[NetworkPrinterDTO]
    scanned_subnets: list[str]
    message: str | None = None


class NetworkPrinterPrintRequest(BaseModel):
    host: str = Field(min_length=7, max_length=45)
    port: int = Field(default=RAW_PRINT_PORT, ge=1, le=65535)
    payload_base64: str = Field(min_length=1, max_length=400_000)


def validate_printer_target(host: str, port: int) -> tuple[str, int]:
    if port not in ALLOWED_PORTS:
        raise ValidationError("Usa el puerto 9100 (impresión RAW de tickets).")
    try:
        ip = ipaddress.ip_address(host.strip())
    except ValueError as exc:
        raise ValidationError("Escribe la IP de la impresora, por ejemplo 192.168.1.50.") from exc
    if ip.version != 4:
        raise ValidationError("Solo se admite IPv4.")
    if ip.is_loopback or ip.is_multicast or ip.is_unspecified or ip.is_reserved:
        raise ValidationError("La IP no es válida para una impresora de red.")
    if not (ip.is_private or ip.is_link_local):
        raise ValidationError("La impresora debe estar en tu red local (Wi‑Fi o Ethernet).")
    return str(ip), port


def list_local_private_subnets() -> list[ipaddress.IPv4Network]:
    addresses: set[str] = set()
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("192.168.0.1", 1))
            addresses.add(sock.getsockname()[0])
    except OSError:
        pass
    try:
        hostname = socket.gethostname()
        for info in socket.getaddrinfo(hostname, None, socket.AF_INET):
            addresses.add(info[4][0])
    except OSError:
        pass

    networks: list[ipaddress.IPv4Network] = []
    seen: set[ipaddress.IPv4Network] = set()
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if ip.version != 4 or not ip.is_private or ip.is_loopback:
            continue
        network = ipaddress.IPv4Network(f"{ip}/24", strict=False)
        if network in seen:
            continue
        seen.add(network)
        networks.append(network)
    return networks


async def _probe_host(host: str, port: int, timeout: float) -> bool:
    try:
        _reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port),
            timeout=timeout,
        )
    except (TimeoutError, OSError):
        return False
    writer.close()
    try:
        await writer.wait_closed()
    except OSError:
        pass
    return True


async def scan_raw_printers(
    subnets: Sequence[ipaddress.IPv4Network],
    *,
    port: int = RAW_PRINT_PORT,
    timeout: float = CONNECT_TIMEOUT_SECONDS,
) -> list[NetworkPrinterDTO]:
    hosts: list[str] = []
    for subnet in subnets:
        for ip in subnet.hosts():
            hosts.append(str(ip))

    semaphore = asyncio.Semaphore(MAX_CONCURRENT_PROBES)
    found: list[NetworkPrinterDTO] = []

    async def check(host: str) -> None:
        async with semaphore:
            if await _probe_host(host, port, timeout):
                found.append(
                    NetworkPrinterDTO(
                        host=host,
                        port=port,
                        label=f"Impresora de red {host}",
                    )
                )

    await asyncio.gather(*(check(host) for host in hosts))
    found.sort(key=lambda item: tuple(int(part) for part in item.host.split(".")))
    return found


def discover_raw_printers(*, timeout: float = CONNECT_TIMEOUT_SECONDS) -> NetworkPrinterDiscoverDTO:
    subnets = list_local_private_subnets()
    if not subnets:
        return NetworkPrinterDiscoverDTO(
            items=[],
            scanned_subnets=[],
            message=(
                "Este servidor no está en una red local. Ejecuta el backend en el PC o tablet "
                "del restaurante para detectar impresoras Wi‑Fi o Ethernet."
            ),
        )

    items = asyncio.run(scan_raw_printers(subnets, timeout=timeout))
    scanned = [str(subnet) for subnet in subnets]
    if items:
        return NetworkPrinterDiscoverDTO(items=items, scanned_subnets=scanned, message=None)
    return NetworkPrinterDiscoverDTO(
        items=[],
        scanned_subnets=scanned,
        message=(
            "No se encontró ninguna impresora en el puerto 9100. Escribe la IP que aparece "
            "en la impresora o en su panel."
        ),
    )


def send_raw_escpos(host: str, port: int, payload: bytes) -> None:
    target_host, target_port = validate_printer_target(host, port)
    if not payload:
        raise ValidationError("El ticket está vacío.")
    if len(payload) > MAX_PAYLOAD_BYTES:
        raise ValidationError("El ticket es demasiado grande.")
    try:
        with socket.create_connection(
            (target_host, target_port),
            timeout=PRINT_TIMEOUT_SECONDS,
        ) as sock:
            sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            sock.sendall(payload)
    except OSError as exc:
        raise ValidationError(
            "No se pudo alcanzar la impresora. Comprueba que esté encendida y en la misma "
            "red Wi‑Fi o Ethernet que este servidor."
        ) from exc
