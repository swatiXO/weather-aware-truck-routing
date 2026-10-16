import httpx
import pytest

from planner.services import http
from planner.services.http import UpstreamError, request_json


class FakeClient:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = 0

    def request(self, method, url, **kwargs):
        self.calls += 1
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return httpx.Response(outcome, json={"ok": outcome == 200}, request=httpx.Request(method, url))


@pytest.fixture(autouse=True)
def no_delay(monkeypatch):
    monkeypatch.setattr(http, "RETRY_DELAY_S", 0)


@pytest.mark.parametrize("first", [httpx.ConnectTimeout("slow"), 503])
def test_one_retry_recovers_from_blips(monkeypatch, first):
    client = FakeClient([first, 200])
    monkeypatch.setattr(http, "_client", client)
    assert request_json("GET", "https://x", service="Weather") == {"ok": True}
    assert client.calls == 2


def test_gives_up_after_second_failure(monkeypatch):
    monkeypatch.setattr(http, "_client", FakeClient([httpx.ConnectError("down"), httpx.ConnectError("down")]))
    with pytest.raises(UpstreamError, match="unreachable"):
        request_json("GET", "https://x", service="Weather")


@pytest.mark.parametrize("status, message", [(429, "rate limit"), (400, "returned an error")])
def test_client_errors_are_not_retried(monkeypatch, status, message):
    client = FakeClient([status])
    monkeypatch.setattr(http, "_client", client)
    with pytest.raises(UpstreamError, match=message):
        request_json("GET", "https://x", service="Weather")
    assert client.calls == 1
