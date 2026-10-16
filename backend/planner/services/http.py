import hashlib
import json
import logging
import time

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


_client = httpx.Client(timeout=settings.HTTP_TIMEOUT_S, headers={"User-Agent": "weather-aware-truck-routing/1.0"})
RETRY_DELAY_S = 0.5


def cache_key(prefix: str, payload) -> str:
    digest = hashlib.sha1(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()
    return f"{prefix}:{digest}"


def request_json(method: str, url: str, *, service: str, **kwargs):
    # One retry for network blips and 5xx; 4xx (bad input, rate limits) won't fix themselves.
    for attempt in (1, 2):
        try:
            resp = _client.request(method, url, **kwargs)
        except httpx.HTTPError as exc:
            log.warning("%s request failed (attempt %d): %s", service, attempt, exc)
            if attempt == 2:
                raise UpstreamError(f"{service} is unreachable right now. Please try again.") from exc
        else:
            if resp.status_code < 500 or attempt == 2:
                break
            log.warning("%s returned %s (attempt %d)", service, resp.status_code, attempt)
        time.sleep(RETRY_DELAY_S)

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
