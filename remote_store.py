"""Thread-safe relay state with optional durable client pairings."""

from collections.abc import Callable
from contextlib import suppress
from hashlib import sha256
from os import fdopen, fsync
from pathlib import Path
from secrets import choice, token_urlsafe
from string import digits
from tempfile import mkstemp
from threading import Lock
from time import monotonic
from typing import ClassVar, Final, Literal

from pydantic import BaseModel, ConfigDict, ValidationError

from remote_models import (
    CatalogEntry,
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
RELAY_STATE_SCHEMA_VERSION: Final = 1
TOKEN_HASH_LENGTH: Final = 64


class _DurableModel(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid", frozen=True)


class _DurableTV(_DurableModel):
    token_hash: str
    identifier: str
    catalog: tuple[CatalogEntry, ...]


class _DurableRemote(_DurableModel):
    token_hash: str
    tv_identifier: str


class _DurableRelayState(_DurableModel):
    schema_version: Literal[1] = RELAY_STATE_SCHEMA_VERSION
    tvs: tuple[_DurableTV, ...]
    remotes: tuple[_DurableRemote, ...]


class _InvalidRelayStateError(ValueError):
    def __init__(self, state_path: Path) -> None:
        super().__init__(f"Invalid relay state file: {state_path}")


def _token_hash(token: str) -> str:
    """Return a one-way lookup key for an opaque bearer token."""
    return sha256(token.encode("utf-8")).hexdigest()


class RelayStore:
    """Hold thread-safe relay state and optionally persist paired clients."""

    def __init__(
        self,
        clock: Callable[[], float] = monotonic,
        state_path: Path | None = None,
    ) -> None:
        """Initialize relay state and restore durable client pairings."""
        self._clock: Callable[[], float] = clock
        self._state_path: Path | None = state_path
        self._lock: Lock = Lock()
        self._tvs_by_token: dict[str, TVSession] = {}
        self._tvs_by_identifier: dict[TVId, TVSession] = {}
        self._remote_sessions: dict[str, RemoteSession] = {}
        self._pairing_codes: dict[PairingCode, PairingSession] = {}
        self._pairing_code_by_tv: dict[TVId, PairingCode] = {}
        self._failed_pairings: dict[str, int] = {}
        self._pending_commands: dict[TVId, RemoteCommand] = {}
        self._load_durable_state()

    def register_tv(self, request: RegisterTVRequest) -> RegisterTVResponse:
        """Register a TV and issue its initial pairing code."""
        with self._lock:
            tv = TVSession(identifier=TVId(token_urlsafe(24)), catalog=request.catalog)
            token = TVToken(token_urlsafe(32))
            code = self._issue_pairing_code(tv.identifier)
            self._tvs_by_token[_token_hash(token)] = tv
            self._tvs_by_identifier[tv.identifier] = tv
            self._persist_durable_state()
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
            self._remote_sessions[_token_hash(token)] = RemoteSession(
                tv_identifier=pairing.tv_identifier
            )
            _ = self._issue_pairing_code(pairing.tv_identifier)
            self._persist_durable_state()
        return PairRemoteResponse(remote_token=token)

    def catalog_for(self, token: RemoteToken) -> CatalogResponse | None:
        """Return the safe catalog for an authenticated remote."""
        with self._lock:
            remote = self._remote_sessions.get(_token_hash(token))
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
            token_hash = _token_hash(token)
            tv = self._tvs_by_token.get(token_hash)
            if tv is None:
                return None
            refreshed = TVSession(identifier=tv.identifier, catalog=request.catalog)
            self._tvs_by_token[token_hash] = refreshed
            self._tvs_by_identifier[refreshed.identifier] = refreshed
            self._persist_durable_state()
            return CatalogResponse(catalog=refreshed.catalog)

    def queue_command(self, token: RemoteToken, command: RemoteCommand) -> bool:
        """Store the latest command for an authenticated remote."""
        with self._lock:
            remote = self._remote_sessions.get(_token_hash(token))
            if remote is None:
                return False
            self._pending_commands[remote.tv_identifier] = command
            return True

    def consume_command(self, token: TVToken) -> NextCommandResponse | None:
        """Return the latest command and current pairing code for a TV."""
        with self._lock:
            tv = self._tvs_by_token.get(_token_hash(token))
            if tv is None:
                return None
            return NextCommandResponse(
                command=self._pending_commands.pop(tv.identifier, None),
                pairing_code=self._current_pairing_code(tv.identifier),
            )

    def is_remote_token(self, token: RemoteToken) -> bool:
        """Report whether a remote token is active."""
        with self._lock:
            return _token_hash(token) in self._remote_sessions

    def is_tv_token(self, token: TVToken) -> bool:
        """Report whether a TV token is active."""
        with self._lock:
            return _token_hash(token) in self._tvs_by_token

    def _load_durable_state(self) -> None:
        state_path = self._state_path
        if state_path is None or not state_path.exists():
            return
        try:
            state = _DurableRelayState.model_validate_json(state_path.read_bytes())
        except (OSError, ValidationError) as error:
            raise _InvalidRelayStateError(state_path) from error
        tvs_by_token: dict[str, TVSession] = {}
        tvs_by_identifier: dict[TVId, TVSession] = {}
        for item in state.tvs:
            token_hash = self._validated_token_hash(item.token_hash, state_path)
            identifier = self._validated_tv_identifier(item.identifier, state_path)
            if token_hash in tvs_by_token or identifier in tvs_by_identifier:
                raise _InvalidRelayStateError(state_path)
            tv = TVSession(identifier=identifier, catalog=item.catalog)
            tvs_by_token[token_hash] = tv
            tvs_by_identifier[identifier] = tv
        remote_sessions: dict[str, RemoteSession] = {}
        for item in state.remotes:
            token_hash = self._validated_token_hash(item.token_hash, state_path)
            identifier = self._validated_tv_identifier(item.tv_identifier, state_path)
            if token_hash in remote_sessions or identifier not in tvs_by_identifier:
                raise _InvalidRelayStateError(state_path)
            remote_sessions[token_hash] = RemoteSession(tv_identifier=identifier)
        self._tvs_by_token = tvs_by_token
        self._tvs_by_identifier = tvs_by_identifier
        self._remote_sessions = remote_sessions

    @staticmethod
    def _validated_tv_identifier(value: str, state_path: Path) -> TVId:
        if not value:
            raise _InvalidRelayStateError(state_path)
        return TVId(value)

    @staticmethod
    def _validated_token_hash(value: str, state_path: Path) -> str:
        if len(value) != TOKEN_HASH_LENGTH or any(
            character not in "0123456789abcdef" for character in value
        ):
            raise _InvalidRelayStateError(state_path)
        return value

    def _persist_durable_state(self) -> None:
        if self._state_path is None:
            return
        state = _DurableRelayState(
            tvs=tuple(
                _DurableTV(
                    token_hash=token_hash,
                    identifier=tv.identifier,
                    catalog=tv.catalog,
                )
                for token_hash, tv in sorted(self._tvs_by_token.items())
            ),
            remotes=tuple(
                _DurableRemote(
                    token_hash=token_hash,
                    tv_identifier=remote.tv_identifier,
                )
                for token_hash, remote in sorted(self._remote_sessions.items())
            ),
        )
        self._state_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        descriptor, temporary_name = mkstemp(
            dir=self._state_path.parent,
            prefix=f".{self._state_path.name}.",
            text=True,
        )
        temporary_path = Path(temporary_name)
        try:
            temporary_path.chmod(0o600)
            with fdopen(descriptor, "w", encoding="utf-8") as temporary:
                _ = temporary.write(state.model_dump_json())
                temporary.flush()
                fsync(temporary.fileno())
            _ = temporary_path.replace(self._state_path)
        except (OSError, TypeError, ValueError):
            with suppress(FileNotFoundError):
                temporary_path.unlink()
            raise

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
