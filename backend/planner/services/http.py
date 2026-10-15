import hashlib
import json
import logging

import httpx
from django.conf import settings

log = logging.getLogger(__name__)


class UpstreamError(Exception):
    """A third-party API failed or returned something unusable.

    `message` is safe to show to the user.
    """

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.message = message
        self.status = status


_client = httpx.Client(timeout=settings.HTTP_TIMEOUT_S, headers={"User-Agent": "spotter-truck-routing/1.0"})


def cache_key(prefix: str, payload) -> str:
    digest = hashlib.sha1(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()
    return f"{prefix}:{digest}"


def request_json(method: str, url: str, *, service: str, **kwargs):
    try:
        resp = _client.request(method, url, **kwargs)
    except httpx.HTTPError as exc:
        log.warning("%s request failed: %s", service, exc)
        raise UpstreamError(f"{service} is unreachable right now. Please try again.") from exc
    if resp.status_code >= 400:
        log.warning("%s returned %s: %s", service, resp.status_code, resp.text[:500])
        try:
            body = resp.json()
        except ValueError:
            body = {}
        raise UpstreamError(_describe_error(service, resp.status_code, body), 502 if resp.status_code >= 500 else 422)
    return resp.json()


def _describe_error(service: str, status: int, body) -> str:
    if status == 429:
        return f"{service} rate limit reached. Please wait a minute and try again."
    if status in (401, 403):
        return f"{service} rejected the API key. Check the server configuration."
    detail = ""
    if isinstance(body, dict):
        err = body.get("error")
        detail = err.get("message", "") if isinstance(err, dict) else (err or body.get("reason", ""))
    return f"{service} error: {detail}" if detail else f"{service} returned an error ({status})."
