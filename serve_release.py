"""Serve the extracted offline PWA on localhost for first-time installation."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def main() -> None:
    web_root = Path(__file__).resolve().parent / "dist"
    if not (web_root / "index.html").is_file():
        raise SystemExit("dist/index.html is missing. Extract the whole ZIP first.")

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(web_root), **kwargs)

    server = ThreadingHTTPServer(("127.0.0.1", 4173), Handler)
    print("Open http://127.0.0.1:4173 in Chrome or Edge. Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
