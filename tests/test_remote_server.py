from __future__ import annotations

from dataclasses import dataclass
from http import HTTPStatus
from typing import TYPE_CHECKING, ClassVar, Literal

from fastapi.testclient import TestClient
from httpx import Headers
from pydantic import BaseModel, ConfigDict

from remote_server import create_app

if TYPE_CHECKING:
    from pathlib import Path


class ResponseModel(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid", frozen=True)


class CatalogEntry(ResponseModel):
    key: str
    number: str
    name: str
    group: str


class TVRegistrationResponse(ResponseModel):
    tv_token: str
    pairing_code: str


class RemotePairingResponse(ResponseModel):
    remote_token: str


class CatalogResponse(ResponseModel):
    catalog: tuple[CatalogEntry, ...]


class PlayCommand(ResponseModel):
    command: Literal["play"]
    key: str


class StopCommand(ResponseModel):
    command: Literal["stop"]


class NextCommandResponse(ResponseModel):
    command: PlayCommand | StopCommand | None
    pairing_code: str


@dataclass(frozen=True, slots=True)
class PairedClients:
    tv_token: str
    remote_token: str


def authorization(token: str) -> Headers:
    return Headers({"Authorization": f"Bearer {token}"})


def register_and_pair(client: TestClient) -> PairedClients:
    registration = client.post(
        "/api/tvs",
        json={
            "name": "Living room",
            "catalog": [
                {"key": "news", "number": "7", "name": "News", "group": "Local"}
            ],
        },
    )
    assert registration.status_code == HTTPStatus.CREATED
    tv = TVRegistrationResponse.model_validate_json(registration.content)
    pairing = client.post("/api/remote/pair", json={"pairing_code": tv.pairing_code})
    assert pairing.status_code == HTTPStatus.OK
    remote = RemotePairingResponse.model_validate_json(pairing.content)
    return PairedClients(tv_token=tv.tv_token, remote_token=remote.remote_token)


def test_tv_registration_returns_opaque_token_and_pairing_code(tmp_path: Path) -> None:
    # Given a TV with a safe catalog
    with TestClient(create_app(static_directory=tmp_path)) as client:
        # When the TV registers
        response = client.post(
            "/api/tvs",
            json={
                "name": "Living room",
                "catalog": [
                    {
                        "key": "news",
                        "number": "7",
                        "name": "News",
                        "group": "Local",
                    }
                ],
            },
        )

        # Then it receives only opaque credentials for the pairing flow
        assert TVRegistrationResponse.model_validate_json(response.content).pairing_code
        assert response.status_code == HTTPStatus.CREATED


def test_tv_registration_rejects_catalog_metadata_outside_the_safe_contract(
    tmp_path: Path,
) -> None:
    # Given a catalog entry carrying a stream URL
    with TestClient(create_app(static_directory=tmp_path)) as client:
        # When the TV registers it
        response = client.post(
            "/api/tvs",
            json={
                "name": "Living room",
                "catalog": [
                    {
                        "key": "news",
                        "number": "7",
                        "name": "News",
                        "group": "Local",
                        "url": "http://provider.invalid/secret",
                    }
                ],
            },
        )

        # Then FastAPI rejects the unapproved catalog field
        assert response.status_code == HTTPStatus.UNPROCESSABLE_ENTITY


def test_paired_remote_fetches_its_tv_catalog(tmp_path: Path) -> None:
    # Given a paired remote
    with TestClient(create_app(static_directory=tmp_path)) as client:
        paired = register_and_pair(client)

        # When the remote requests its catalog
        response = client.get(
            "/api/remote/catalog", headers=authorization(paired.remote_token)
        )

        # Then it receives only the registered safe catalog fields
        assert CatalogResponse.model_validate_json(response.content).catalog == (
            CatalogEntry(key="news", number="7", name="News", group="Local"),
        )


def test_remote_command_is_consumed_as_the_latest_pending_command(
    tmp_path: Path,
) -> None:
    # Given a paired remote that has queued play and stop commands
    with TestClient(create_app(static_directory=tmp_path)) as client:
        paired = register_and_pair(client)
        play = client.post(
            "/api/remote/commands",
            headers=authorization(paired.remote_token),
            json={"command": "play", "key": "news"},
        )
        assert play.status_code == HTTPStatus.ACCEPTED
        stop = client.post(
            "/api/remote/commands",
            headers=authorization(paired.remote_token),
            json={"command": "stop"},
        )
        assert stop.status_code == HTTPStatus.ACCEPTED

        # When the TV polls for a command
        response = client.get(
            "/api/tv/commands/next", headers=authorization(paired.tv_token)
        )

        # Then it atomically receives the latest command
        assert NextCommandResponse.model_validate_json(
            response.content
        ).command == StopCommand(command="stop")


def test_tv_poll_consumes_a_command_once(tmp_path: Path) -> None:
    # Given a TV whose remote has queued a command
    with TestClient(create_app(static_directory=tmp_path)) as client:
        paired = register_and_pair(client)
        queued = client.post(
            "/api/remote/commands",
            headers=authorization(paired.remote_token),
            json={"command": "play", "key": "news"},
        )
        assert queued.status_code == HTTPStatus.ACCEPTED
        _ = client.get("/api/tv/commands/next", headers=authorization(paired.tv_token))

        # When the TV polls again
        response = client.get(
            "/api/tv/commands/next", headers=authorization(paired.tv_token)
        )

        # Then the consumed command is absent
        assert NextCommandResponse.model_validate_json(response.content).command is None


def test_remote_routes_reject_missing_and_wrong_role_tokens(tmp_path: Path) -> None:
    # Given a registered TV and its paired remote
    with TestClient(create_app(static_directory=tmp_path)) as client:
        paired = register_and_pair(client)

        # When a TV token is used on a remote route
        response = client.get(
            "/api/remote/catalog", headers=authorization(paired.tv_token)
        )

        # Then the wrong role is rejected
        assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_tv_route_rejects_missing_bearer_token(tmp_path: Path) -> None:
    # Given a relay with no authenticated caller
    with TestClient(create_app(static_directory=tmp_path)) as client:
        # When an unauthenticated TV poll is made
        response = client.get("/api/tv/commands/next")

        # Then the relay rejects it
        assert response.status_code == HTTPStatus.UNAUTHORIZED


def test_static_remote_content_is_served_after_api_routes(tmp_path: Path) -> None:
    # Given a static remote page
    remote_directory = tmp_path / "remote"
    remote_directory.mkdir()
    _ = (remote_directory / "index.html").write_text("phone remote", encoding="utf-8")
    with TestClient(create_app(static_directory=tmp_path)) as client:
        # When the browser requests the remote path
        response = client.get("/remote/")

        # Then static content is available without shadowing API routes
        assert response.text == "phone remote"


def test_static_server_does_not_expose_local_credentials_or_repository(
    tmp_path: Path,
) -> None:
    _ = (tmp_path / "preview.local.js").write_text("private", encoding="utf-8")
    git_directory = tmp_path / ".git"
    git_directory.mkdir()
    _ = (git_directory / "config").write_text("private", encoding="utf-8")
    with TestClient(create_app(static_directory=tmp_path)) as client:
        local_credentials = client.get("/preview.local.js")
        repository_config = client.get("/.git/config")

        assert local_credentials.status_code == HTTPStatus.NOT_FOUND
        assert repository_config.status_code == HTTPStatus.NOT_FOUND


def test_tizen_file_origin_can_preflight_authorized_tv_xhr(tmp_path: Path) -> None:
    # Given the installed TV application's file origin
    with TestClient(create_app(static_directory=tmp_path)) as client:
        # When it preflights a registration request with its authentication headers
        response = client.options(
            "/api/tvs",
            headers={
                "Origin": "null",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Authorization, Content-Type",
            },
        )

        # Then the relay permits the constrained Tizen XHR surface
        assert response.headers["access-control-allow-origin"] == "null"


def test_tv_catalog_refresh_preserves_the_paired_remote_token(tmp_path: Path) -> None:
    # Given a TV and phone remote paired against its boot catalog
    with TestClient(create_app(static_directory=tmp_path)) as client:
        paired = register_and_pair(client)
        refreshed = client.put(
            "/api/tvs/catalog",
            headers=authorization(paired.tv_token),
            json={
                "catalog": [
                    {
                        "key": "sports",
                        "number": "12",
                        "name": "Sports",
                        "group": "Live",
                    }
                ]
            },
        )
        assert refreshed.status_code == HTTPStatus.OK

        # When the already paired phone refreshes its catalog
        response = client.get(
            "/api/remote/catalog", headers=authorization(paired.remote_token)
        )

        # Then it reads the TV's current safe catalog without re-pairing
        assert CatalogResponse.model_validate_json(response.content).catalog == (
            CatalogEntry(key="sports", number="12", name="Sports", group="Live"),
        )
