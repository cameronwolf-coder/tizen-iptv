"""In-memory LAN relay for a Tizen IPTV phone remote."""

from collections.abc import Callable
from pathlib import Path
from time import monotonic
from typing import Annotated, Final, NoReturn

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import ORJSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from remote_models import (
    CatalogResponse,
    CommandAcceptedResponse,
    NextCommandResponse,
    PairRemoteRequest,
    PairRemoteResponse,
    RegisterTVRequest,
    RegisterTVResponse,
    RemoteCommand,
    RemoteToken,
    TVToken,
    UpdateCatalogRequest,
)
from remote_static import mount_static_content
from remote_store import RelayStore

UNAUTHORIZED_DETAIL: Final = "Unauthorized"


def _configure_tv_routes(app: FastAPI, store: RelayStore, bearer: HTTPBearer) -> None:
    """Attach TV registration and catalog refresh routes."""

    def require_tv_token(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    ) -> TVToken:
        """Authorize a Tizen TV bearer token."""
        tv_token = TVToken(_credentials_token(credentials))
        if store.is_tv_token(tv_token):
            return tv_token
        _raise_unauthorized()

    def register_tv(request: RegisterTVRequest) -> RegisterTVResponse:
        """Register a TV for phone pairing."""
        return store.register_tv(request)

    app.add_api_route(
        "/api/tvs", register_tv, methods=["POST"], status_code=status.HTTP_201_CREATED
    )

    def refresh_tv_catalog(
        request: UpdateCatalogRequest,
        token: Annotated[TVToken, Depends(require_tv_token)],
    ) -> CatalogResponse:
        """Refresh a TV catalog without invalidating its paired remotes."""
        catalog = store.refresh_catalog(token, request)
        if catalog is not None:
            return catalog
        _raise_unauthorized()

    app.add_api_route("/api/tvs/catalog", refresh_tv_catalog, methods=["PUT"])


def _configure_remote_routes(
    app: FastAPI, store: RelayStore, bearer: HTTPBearer
) -> None:
    """Attach phone pairing, catalog, and playback-command routes."""

    def require_remote_token(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    ) -> RemoteToken:
        """Authorize a phone remote bearer token."""
        token = _credentials_token(credentials)
        remote_token = RemoteToken(token)
        if store.is_remote_token(remote_token):
            return remote_token
        _raise_unauthorized()

    def pair_remote(
        request: PairRemoteRequest, http_request: Request
    ) -> PairRemoteResponse:
        """Pair a remote by consuming its displayed TV code."""
        client = http_request.client
        paired = store.pair_remote(
            request, client.host if client is not None else "unknown"
        )
        if paired is not None:
            return paired
        _raise_unauthorized()

    app.add_api_route("/api/remote/pair", pair_remote, methods=["POST"])

    def get_remote_catalog(
        token: Annotated[RemoteToken, Depends(require_remote_token)],
    ) -> CatalogResponse:
        """Return the paired TV's safe catalog."""
        catalog = store.catalog_for(token)
        if catalog is not None:
            return catalog
        _raise_unauthorized()

    app.add_api_route("/api/remote/catalog", get_remote_catalog, methods=["GET"])

    def queue_remote_command(
        command: RemoteCommand,
        token: Annotated[RemoteToken, Depends(require_remote_token)],
    ) -> CommandAcceptedResponse:
        """Store the latest remote command for the paired TV."""
        if store.queue_command(token, command):
            return CommandAcceptedResponse()
        _raise_unauthorized()

    app.add_api_route(
        "/api/remote/commands",
        queue_remote_command,
        methods=["POST"],
        status_code=status.HTTP_202_ACCEPTED,
    )


def _configure_tv_command_route(
    app: FastAPI, store: RelayStore, bearer: HTTPBearer
) -> None:
    """Attach the TV polling route for pending phone commands."""

    def require_tv_token(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    ) -> TVToken:
        """Authorize a Tizen TV bearer token."""
        tv_token = TVToken(_credentials_token(credentials))
        if store.is_tv_token(tv_token):
            return tv_token
        _raise_unauthorized()

    def poll_tv_command(
        token: Annotated[TVToken, Depends(require_tv_token)],
    ) -> NextCommandResponse:
        """Atomically consume the TV's latest pending remote command."""
        command = store.consume_command(token)
        if command is not None:
            return command
        _raise_unauthorized()

    app.add_api_route("/api/tv/commands/next", poll_tv_command, methods=["GET"])


def create_app(
    static_directory: Path | None = None,
    clock: Callable[[], float] = monotonic,
) -> FastAPI:
    """Create the API before mounting the approved application assets."""
    app = FastAPI(default_response_class=ORJSONResponse)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["null"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.add_middleware(GZipMiddleware, minimum_size=500)
    store = RelayStore(clock)
    bearer = HTTPBearer(auto_error=False)
    _configure_tv_routes(app, store, bearer)
    _configure_remote_routes(app, store, bearer)
    _configure_tv_command_route(app, store, bearer)
    static_root = (
        static_directory if static_directory is not None else Path(__file__).parent
    )
    mount_static_content(app, static_root)
    return app


def _credentials_token(credentials: HTTPAuthorizationCredentials | None) -> str:
    """Extract the opaque credential after HTTPBearer parsed the header."""
    if credentials is None:
        _raise_unauthorized()
    return credentials.credentials


def _raise_unauthorized() -> NoReturn:
    """Raise the shared, non-disclosing authentication response."""
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=UNAUTHORIZED_DETAIL,
        headers={"WWW-Authenticate": "Bearer"},
    )


app = create_app()
