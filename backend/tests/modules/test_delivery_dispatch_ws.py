"""Static checks for delivery dispatch websocket routes."""

from __future__ import annotations

import ast
from collections.abc import Iterator
from pathlib import Path

from starlette.routing import BaseRoute, Mount, WebSocketRoute


def _iter_routes(routes: list[BaseRoute]) -> Iterator[BaseRoute]:
    for route in routes:
        if isinstance(route, Mount):
            yield from _iter_routes(route.routes)
        else:
            yield route


def test_rider_ws_module_imports_sqlalchemy_select() -> None:
    source = Path("app/modules/delivery_dispatch/ws.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    imports_select = False
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "sqlalchemy":
            if any(alias.name == "select" for alias in node.names):
                imports_select = True
                break
    assert imports_select, "rider_me_ws uses select(DeliveryDriver); import select from sqlalchemy"


def test_public_tracking_ws_route_removed() -> None:
    from app.main import app

    ws_paths = [
        route.path
        for route in _iter_routes(app.routes)
        if isinstance(route, WebSocketRoute) and "dispatch-tracking" in route.path
    ]
    assert ws_paths == []


def test_restaurant_dispatch_ws_route_removed() -> None:
    from app.main import app

    ws_paths = [
        route.path
        for route in _iter_routes(app.routes)
        if isinstance(route, WebSocketRoute)
        and route.path.endswith("/dispatch")
        and "/restaurants/" in route.path
    ]
    assert ws_paths == []
