"""Whitelisted static asset routes for the IPTV relay."""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


def mount_static_content(app: FastAPI, static_root: Path) -> None:
    """Expose browser assets without serving the repository or local credentials."""
    for directory_name in ("remote", "css", "js", "sample"):
        directory = static_root / directory_name
        if directory.is_dir():
            app.mount(
                f"/{directory_name}",
                StaticFiles(directory=directory, html=directory_name == "remote"),
                name=f"static-{directory_name}",
            )

    index = static_root / "index.html"
    if index.is_file():
        _add_static_file(app, "/", index)
        _add_static_file(app, "/index.html", index)
    for filename in ("preview.html", "config.xml", "icon.png"):
        file_path = static_root / filename
        if file_path.is_file():
            _add_static_file(app, f"/{filename}", file_path)


def _add_static_file(app: FastAPI, route: str, file_path: Path) -> None:
    """Attach one explicit root asset without widening static access."""

    def serve_file() -> FileResponse:
        return FileResponse(file_path)

    app.add_api_route(route, serve_file, methods=["GET"], include_in_schema=False)
