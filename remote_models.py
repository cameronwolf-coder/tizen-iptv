"""Typed public API models for the Tizen IPTV LAN relay."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, ClassVar, Literal, NewType

from pydantic import BaseModel, ConfigDict, Field

TVId = NewType("TVId", str)
TVToken = NewType("TVToken", str)
RemoteToken = NewType("RemoteToken", str)
PairingCode = NewType("PairingCode", str)


class RelayModel(BaseModel):
    """The common immutable, closed schema for relay wire models."""

    model_config: ClassVar[ConfigDict] = ConfigDict(extra="forbid", frozen=True)


class CatalogEntry(RelayModel):
    """The only channel metadata shared with a paired phone remote."""

    key: str
    number: str
    name: str
    group: str


class RegisterTVRequest(RelayModel):
    """A TV's pairing registration and safe channel catalog."""

    name: str
    catalog: tuple[CatalogEntry, ...]


class RegisterTVResponse(RelayModel):
    """Opaque credentials returned to a registering TV."""

    tv_token: str
    pairing_code: str


class UpdateCatalogRequest(RelayModel):
    """A TV's current safe catalog after a playlist refresh."""

    catalog: tuple[CatalogEntry, ...]


class PairRemoteRequest(RelayModel):
    """A phone's request to pair with a TV using its displayed code."""

    pairing_code: str


class PairRemoteResponse(RelayModel):
    """Opaque credentials returned to a paired phone remote."""

    remote_token: str


class CatalogResponse(RelayModel):
    """The safe catalog available to an authenticated remote."""

    catalog: tuple[CatalogEntry, ...]


class PlayCommand(RelayModel):
    """A request for the TV to play a catalog entry."""

    command: Literal["play"]
    key: str


class StopCommand(RelayModel):
    """A request for the TV to stop playback."""

    command: Literal["stop"]


RemoteCommand = Annotated[PlayCommand | StopCommand, Field(discriminator="command")]


class CommandAcceptedResponse(RelayModel):
    """Acknowledgement that the relay stored a remote command."""

    accepted: Literal[True] = True


class NextCommandResponse(RelayModel):
    """The latest command still pending for a TV, if any."""

    command: RemoteCommand | None
    pairing_code: str


@dataclass(frozen=True, slots=True)
class TVSession:
    """Internal TV state bound to an opaque bearer token."""

    identifier: TVId
    catalog: tuple[CatalogEntry, ...]


@dataclass(frozen=True, slots=True)
class RemoteSession:
    """Internal remote state bound to the TV it controls."""

    tv_identifier: TVId


@dataclass(frozen=True, slots=True)
class PairingSession:
    """A short-lived, single-use code bound to one TV."""

    tv_identifier: TVId
    expires_at: float
