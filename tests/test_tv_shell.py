"""Behavioral contract for the rendered ten-foot TV shell."""

from html.parser import HTMLParser
from pathlib import Path


class ShellParser(HTMLParser):
    """Collect IDs and accessibility attributes from the static app shell."""

    def __init__(self) -> None:
        super().__init__()
        self.elements: dict[str, dict[str, str]] = {}

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        values = {name: value or "" for name, value in attrs}
        if element_id := values.get("id"):
            self.elements[element_id] = {"tag": tag, **values}


def load_shell() -> ShellParser:
    parser = ShellParser()
    parser.feed(Path("index.html").read_text(encoding="utf-8"))
    return parser


def test_tv_shell_exposes_live_guide_landmarks_and_remote_help() -> None:
    shell = load_shell().elements

    assert shell["app"]["role"] == "application"
    assert shell["browser"]["aria-label"] == "Live channel guide"
    assert shell["categories"]["aria-label"] == "Channel groups"
    assert shell["channels"]["aria-label"] == "Channels"
    assert shell["preview"]["aria-label"] == "Selected channel"
    assert shell["guide-meta"]["aria-live"] == "polite"
    assert shell["remote-help"]["aria-label"] == "Remote control shortcuts"


def test_search_control_has_an_accessible_name() -> None:
    search = load_shell().elements["search-box"]

    assert search["type"] == "search"
    assert search["aria-label"] == "Search channels"
