"""
Run the Site Progress prototype on your own computer — no Claude, no accounts, no internet needed
(except the first time, to load fonts and the Excel reader).

    python local/serve.py            then open http://localhost:8080

Phones on the same Wi-Fi can open the address printed below (http://<this computer's IP>:8080),
so you can test the site screens on a real Android phone while you watch the manager screens here.

Data is saved in local/data/ (db.json + photos/). Delete that folder to start again from scratch.
"""
import json, os, re, socket, sys, threading, uuid
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import unquote, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(os.path.dirname(HERE), "prototype")  # static files
DATA = os.path.join(HERE, "data")
PHOTOS = os.path.join(DATA, "photos")
DBFILE = os.path.join(DATA, "db.json")
SAFE = re.compile(r"^[A-Za-z0-9_.-]{1,80}$")
LOCK = threading.Lock()
os.makedirs(PHOTOS, exist_ok=True)


def load_db():
    try:
        with open(DBFILE, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


DB = load_db()


def save_db():
    tmp = DBFILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(DB, f, ensure_ascii=False)
    os.replace(tmp, DBFILE)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):  # quieter: only log writes and errors
        if self.command != "GET" or (len(args) > 1 and not str(args[1]).startswith(("2", "3"))):
            super().log_message(fmt, *args)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, code, obj=None):
        body = b"" if obj is None else json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def _parts(self):
        p = [unquote(x) for x in urlparse(self.path).path.split("/") if x]
        return p if all(SAFE.match(x) for x in p) else None

    # --- reads ---
    def do_GET(self):
        p = self._parts()
        if p and p[0] == "_db" and len(p) == 2:
            with LOCK:
                col = DB.get(p[1], {})
                return self._json(200, [{"id": k, "data": v} for k, v in col.items()])
        if p and p[0] == "_blob" and len(p) == 2:
            fp = os.path.join(PHOTOS, p[1] + ".jpg")
            if not os.path.exists(fp):
                return self._json(404, {"error": "not found"})
            with open(fp, "rb") as f:
                data = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            return self.wfile.write(data)
        return super().do_GET()

    # --- writes ---
    def do_POST(self):
        p = self._parts()
        if p == ["_blob"]:
            data = self._body()
            if not data or len(data) > 15_000_000:
                return self._json(400, {"error": "bad photo"})
            bid = uuid.uuid4().hex
            with open(os.path.join(PHOTOS, bid + ".jpg"), "wb") as f:
                f.write(data)
            return self._json(200, {"id": bid})
        return self._json(404, {"error": "not found"})

    def _doc(self):
        p = self._parts()
        if not p or p[0] != "_db" or len(p) != 3:
            self._json(404, {"error": "not found"})
            return None
        return p[1], p[2]

    def do_PUT(self):
        d = self._doc()
        if not d:
            return
        try:
            obj = json.loads(self._body() or b"{}")
            assert isinstance(obj, dict)
        except Exception:
            return self._json(400, {"error": "invalid_argument"})
        with LOCK:
            DB.setdefault(d[0], {})[d[1]] = obj
            save_db()
        self._json(200, {"ok": True})

    def do_PATCH(self):
        d = self._doc()
        if not d:
            return
        try:
            obj = json.loads(self._body() or b"{}")
            assert isinstance(obj, dict)
        except Exception:
            return self._json(400, {"error": "invalid_argument"})
        with LOCK:
            col = DB.setdefault(d[0], {})
            if d[1] not in col:
                return self._json(404, {"error": "not_found"})
            col[d[1]].update(obj)
            save_db()
        self._json(200, {"ok": True})

    def do_DELETE(self):
        d = self._doc()
        if not d:
            return
        with LOCK:
            DB.get(d[0], {}).pop(d[1], None)
            save_db()
        self._json(200, {"ok": True})


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return None


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    srv = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    ip = lan_ip()
    print(f"\nSite Progress (local test) is running.\n  On this computer: http://localhost:{port}")
    if ip:
        print(f"  On a phone on the same Wi-Fi: http://{ip}:{port}")
    print(f"  Data folder: {DATA}\n  Press Ctrl+C to stop.\n")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
