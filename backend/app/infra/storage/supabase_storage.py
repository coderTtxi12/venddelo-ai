from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

from supabase import Client, create_client

from app.core.config import Settings
from app.core.storage import SignedUpload, StorageError, StoragePort, StoredObject


class SupabaseStorageAdapter(StoragePort):
    def __init__(self, settings: Settings) -> None:
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise StorageError("Supabase storage is not configured")
        self._settings = settings
        self._bucket = settings.supabase_storage_bucket
        self._client: Client = create_client(
            settings.supabase_url, settings.supabase_service_role_key
        )

    def _store(self) -> Any:
        return self._client.storage.from_(self._bucket)

    def upload(
        self, path: str, data: bytes, content_type: str, *, upsert: bool = True
    ) -> StoredObject:
        try:
            self._store().upload(
                path,
                data,
                {"content-type": content_type, "upsert": str(upsert).lower()},
            )
        except Exception as exc:
            raise StorageError(str(exc)) from exc
        return StoredObject(path=path, public_url=self.get_public_url(path))

    def delete(self, path: str) -> None:
        try:
            self._store().remove([path])
        except Exception as exc:
            raise StorageError(str(exc)) from exc

    def get_public_url(self, path: str) -> str:
        return str(self._store().get_public_url(path))

    def create_signed_url(self, path: str, expires_in: int) -> str:
        try:
            res = self._store().create_signed_url(path, expires_in)
        except Exception as exc:
            raise StorageError(str(exc)) from exc
        return str(res["signedURL"])

    def create_signed_upload(
        self, path: str, *, content_type: str, upsert: bool = True
    ) -> SignedUpload:
        del content_type
        store = self._store()
        if hasattr(store, "create_signed_upload_url"):
            try:
                res = store.create_signed_upload_url(path)
                return self._signed_upload_from_payload(path, res)
            except TypeError:
                pass
            except Exception:
                pass
        return self._signed_upload_via_rest(path, upsert=upsert)

    def _signed_upload_via_rest(self, path: str, *, upsert: bool) -> SignedUpload:
        key = self._settings.supabase_service_role_key
        encoded = quote(path, safe="/")
        endpoint = (
            f"{self._settings.supabase_url.rstrip('/')}/storage/v1/object/upload/sign/"
            f"{self._bucket}/{encoded}"
        )
        headers = {
            "Authorization": f"Bearer {key}",
            "apikey": key,
            "Content-Type": "application/json",
        }
        if upsert:
            headers["x-upsert"] = "true"
        request = Request(endpoint, data=b"{}", method="POST", headers=headers)
        try:
            with urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode())
        except (HTTPError, URLError, json.JSONDecodeError) as exc:
            raise StorageError(str(exc)) from exc
        return self._signed_upload_from_payload(path, payload)

    def _signed_upload_from_payload(self, path: str, payload: Any) -> SignedUpload:
        if not isinstance(payload, dict):
            payload = {
                "signedUrl": getattr(payload, "signedUrl", None)
                or getattr(payload, "signedURL", None)
                or getattr(payload, "url", None),
                "token": getattr(payload, "token", None),
                "path": getattr(payload, "path", path),
            }
        signed = (
            payload.get("signedUrl")
            or payload.get("signedURL")
            or payload.get("signed_url")
            or payload.get("url")
        )
        token = payload.get("token")
        if not signed:
            raise StorageError("Supabase no devolvió URL firmada de carga")
        base = f"{self._settings.supabase_url.rstrip('/')}/storage/v1"
        if signed.startswith("/"):
            signed = f"{base}{signed}"
        elif not signed.startswith("http"):
            signed = f"{base}/{signed.lstrip('/')}"
        return SignedUpload(
            path=str(payload.get("path") or path),
            upload_url=str(signed),
            token=token,
        )

    def read(self, path: str) -> bytes:
        try:
            data = self._store().download(path)
        except Exception as exc:
            raise StorageError(str(exc)) from exc
        if isinstance(data, bytes):
            return data
        return bytes(data)
