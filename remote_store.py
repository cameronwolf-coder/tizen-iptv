"""Thread-safe in-memory state for the Tizen IPTV LAN relay."""

from collections.abc import Callable
from secrets import choice, token_urlsafe
from string import digits
from threading import Lock
from time import monotonic
from typing import Final

from remote_models import (
    CatalogResponse,
    NextCommandResponse,
    PairingCode,
    PairingSession,
    PairRemoteRequest,
    PairRemoteResponse,
    RegisterTVRequest,
    RegisterTVResponse,
    RemoteCommand,
    RemoteSession,
    RemoteToken,
    TVId,
    TVSession,
    TVToken,
    UpdateCatalogRequest,
)

PAIRING_CODE_LENGTH: Final = 6
# NIST SP 800-63B: out-of-band secrets are valid once, for at most 10 minutes,
# with no more than 10 consecutive failed attempts.
PAIRING_CODE_TTL_SECONDS: Final = 10 * 60
PAIRING_FAILURE_LIMIT: Final = 10


class RelayStore:
    """Hold thread-safe relay state for the API layer."""

    def __init__(self, clock: Callable[[], float] = monotonic) -> None:
        """Initialize empty relay state using the supplied monotonic clock."""
        self._clock: Callable[[], float] = clock
        self._lock: Lock = Lock()
        self._tvs_by_token: dict[TVToken, TVSession] = {}
        self._tvs_by_identifier: dict[TVId, TVSession] = {}
        self._remote_sessions: dict[RemoteToken, RemoteSession] = {}
        self._pairing_codes: dict[PairingCode, PairingSession] = {}
        self._pairing_code_by_tv: dict[TVId, PairingCode] = {}
        self._failed_pairings: dict[str, int] = {}
        self._pending_commands: dict[TVId, RemoteCommand] = {}

    def register_tv(self, request: RegisterTVRequest) -> RegisterTVResponse:
        """Register a TV and issue its initial pairing code."""
        with self._lock:
            tv = TVSession(identifier=TVId(token_urlsafe(24)), catalog=request.catalog)
            token = TVToken(token_urlsafe(32))
            code = self._issue_pairing_code(tv.identifier)
            self._tvs_by_token[token] = tv
            self._tvs_by_identifier[tv.identifier] = tv
        return RegisterTVResponse(tv_token=token, pairing_code=code)

    def pair_remote(
        self, request: PairRemoteRequest, client_identifier: str
    ) -> PairRemoteResponse | None:
        """Pair a client when its code and retry allowance are valid."""
        with self._lock:
            failures = self._failed_pairings.get(client_identifier, 0)
            if failures >= PAIRING_FAILURE_LIMIT:
                return None
            code = PairingCode(request.pairing_code)
            pairing = self._pairing_codes.get(code)
            if pairing is None or pairing.expires_at <= self._clock():
                self._failed_pairings[client_identifier] = failures + 1
                self._discard_pairing_code(code)
                return None
            self._discard_pairing_code(code)
            _ = self._failed_pairings.pop(client_identifier, None)
            token = RemoteToken(token_urlsafe(32))
            self._remote_sessions[token] = RemoteSession(
                tv_identifier=pairing.tv_identifier
            )
            _ = self._issue_pairing_code(pairing.tv_identifier)
        return PairRemoteResponse(remote_token=token)

    def catalog_for(self, token: RemoteToken) -> CatalogResponse | None:
        """Return the safe catalog for an authenticated remote."""
        with self._lock:
            remote = self._remote_sessions.get(token)
            tv = (
                self._tvs_by_identifier.get(remote.tv_identifier)
                if remote is not None
                else None
            )
            return CatalogResponse(catalog=tv.catalog) if tv is not None else None

    def refresh_catalog(
        self, token: TVToken, request: UpdateCatalogRequest
    ) -> CatalogResponse | None:
        """Replace a TV catalog without changing its tokens."""
        with self._lock:
            tv = self._tvs_by_token.get(token)
            if tv is None:
                return None
            refreshed = TVSession(identifier=tv.identifier, catalog=request.catalog)
            self._tvs_by_token[token] = refreshed
            self._tvs_by_identifier[refreshed.identifier] = refreshed
            return CatalogResponse(catalog=refreshed.catalog)

    def queue_command(self, token: RemoteToken, command: RemoteCommand) -> bool:
        """Store the latest command for an authenticated remote."""
        with self._lock:
            remote = self._remote_sessions.get(token)
            if remote is None:
                return False
            self._pending_commands[remote.tv_identifier] = command
            return True

    def consume_command(self, token: TVToken) -> NextCommandResponse | None:
        """Return the latest command and current pairing code for a TV."""
        with self._lock:
            tv = self._tvs_by_token.get(token)
            if tv is None:
                return None
            return NextCommandResponse(
                command=self._pending_commands.pop(tv.identifier, None),
                pairing_code=self._current_pairing_code(tv.identifier),
            )

    def is_remote_token(self, token: RemoteToken) -> bool:
        """Report whether a remote token is active."""
        with self._lock:
            return token in self._remote_sessions

    def is_tv_token(self, token: TVToken) -> bool:
        """Report whether a TV token is active."""
        with self._lock:
            return token in self._tvs_by_token

    def _current_pairing_code(self, tv_identifier: TVId) -> PairingCode:
        code = self._pairing_code_by_tv.get(tv_identifier)
        pairing = self._pairing_codes.get(code) if code is not None else None
        if (
            code is not None
            and pairing is not None
            and pairing.expires_at > self._clock()
        ):
            return code
        if code is not None:
            self._discard_pairing_code(code)
        return self._issue_pairing_code(tv_identifier)

    def _issue_pairing_code(self, tv_identifier: TVId) -> PairingCode:
        while True:
            code = PairingCode(
                "".join(choice(digits) for _ in range(PAIRING_CODE_LENGTH))
            )
            if code not in self._pairing_codes:
                break
        self._pairing_codes[code] = PairingSession(
            tv_identifier=tv_identifier,
            expires_at=self._clock() + PAIRING_CODE_TTL_SECONDS,
        )
        self._pairing_code_by_tv[tv_identifier] = code
        return code

    def _discard_pairing_code(self, code: PairingCode) -> None:
        pairing = self._pairing_codes.pop(code, None)
        if (
            pairing is not None
            and self._pairing_code_by_tv.get(pairing.tv_identifier) == code
        ):
            _ = self._pairing_code_by_tv.pop(pairing.tv_identifier, None)
