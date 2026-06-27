#!/usr/bin/env python3
"""Dev server for browser preview: serves the app statically AND proxies
provider requests under /prov/* (adding CORS) so the Xtream API and HLS
streams work cross-origin in a desktop browser. NOT used on the TV."""
import http.server, socketserver, urllib.request, urllib.error, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
PROVIDER = "http://line.trxdnscloud.ru"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def do_GET(self):
        if self.path.startswith("/prov/"):
            return self.proxy()
        return super().do_GET()

    def proxy(self):
        target = PROVIDER + self.path[len("/prov"):]  # keep query string
        try:
            req = urllib.request.Request(target, headers={"User-Agent": "VLC/3.0"})
            with urllib.request.urlopen(req, timeout=60) as up:
                self.send_response(up.status)
                ct = up.headers.get("Content-Type", "application/octet-stream")
                self.send_header("Content-Type", ct)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                while True:
                    chunk = up.read(65536)
                    if not chunk:
                        break
                    try:
                        self.wfile.write(chunk)
                    except (BrokenPipeError, ConnectionResetError):
                        break
        except urllib.error.HTTPError as e:
            self.send_response(e.code); self.send_header("Access-Control-Allow-Origin", "*"); self.end_headers()
        except Exception as e:
            self.send_response(502); self.end_headers()
            try: self.wfile.write(str(e).encode())
            except Exception: pass

    def log_message(self, *a):  # quiet
        pass

class TS(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

print(f"serving {ROOT} on :{PORT}  (provider proxy at /prov/*)")
TS(("0.0.0.0", PORT), H).serve_forever()
