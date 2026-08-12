from __future__ import annotations

from http import HTTPStatus
from typing import TYPE_CHECKING, ClassVar

from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict

from remote_server import create_app

if TYPE_CHECKING:
    from pathlib import Path


class _ResponseModel(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid", frozen=True)


class _TVRegistrationResponse(_ResponseModel):
    tv_token: str
    pairing_code: str


class _NextCommandResponse(_ResponseModel):
    command: None
    pairing_code: str


class _FakeClock:
    def __init__(self) -> None:
        self.now: float = 0.0

    def __call__(self) -> float:
        return self.now


def _register(client: TestClient) -> _TVRegistrationResponse:
    response = client.post("/api/tvs", json={"name": "Living room", "catalog": []})
    return _TVRegistrationResponse.model_validate_json(response.content)


def _authorization(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_pairing_code_rotates_after_a_remote_consumes_it(tmp_path: Path) -> None:
    # Given a TV whose first pairing code was consumed
    with TestClient(create_app(static_directory=tmp_path)) as client:
        tv = _register(client)
        paired = client.post("/api/remote/pair", json={"pairing_code": tv.pairing_code})
        assert paired.status_code == HTTPStatus.OK

        # When the TV polls after pairing
        response = client.get(
            "/api/tv/commands/next", headers=_authorization(tv.tv_token)
        )
        current = _NextCommandResponse.model_validate_json(response.content)

        # Then the displayed code is replaced with a fresh valid code
        assert current.pairing_code != tv.pairing_code
        replacement = client.post(
            "/api/remote/pair", json={"pairing_code": current.pairing_code}
        )
        assert replacement.status_code == HTTPStatus.OK


def test_pairing_code_expires_after_ten_minutes(tmp_path: Path) -> None:
    # Given a TV pairing code at the end of its NIST validity window
    clock = _FakeClock()
    with TestClient(create_app(static_directory=tmp_path, clock=clock)) as client:
        tv = _register(client)
        clock.now = 10 * 60

        # When a phone submits the expired code
        expired = client.post(
            "/api/remote/pair", json={"pairing_code": tv.pairing_code}
        )

        # Then it is rejected and the authenticated TV receives a fresh code
        assert expired.status_code == HTTPStatus.UNAUTHORIZED
        polled = client.get(
            "/api/tv/commands/next", headers=_authorization(tv.tv_token)
        )
        current = _NextCommandResponse.model_validate_json(polled.content)
        assert current.pairing_code != tv.pairing_code


def test_pairing_stops_after_ten_failed_attempts_from_one_client(
    tmp_path: Path,
) -> None:
    # Given a TV and a client that exhausted the NIST retry allowance
    with TestClient(create_app(static_directory=tmp_path)) as client:
        tv = _register(client)
        for _ in range(10):
            failed = client.post(
                "/api/remote/pair", json={"pairing_code": "not-the-code"}
            )
            assert failed.status_code == HTTPStatus.UNAUTHORIZED

        # When that client finally submits the correct code
        locked = client.post("/api/remote/pair", json={"pairing_code": tv.pairing_code})

        # Then the relay remains locked for that client
        assert locked.status_code == HTTPStatus.UNAUTHORIZED
