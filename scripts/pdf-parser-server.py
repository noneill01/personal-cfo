#!/usr/bin/env python3
"""Loopback-only PDF text extraction for Personal CFO.

Barclaycard statements use AES-encrypted PDF streams even though copying text is
permitted. Browser-native stream inspection cannot decode those objects, so this
small local service asks macOS PDFKit to extract the text. Files are written only
to a temporary directory and are deleted immediately after extraction.
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


HOST = "127.0.0.1"
PORT = 4318
MAX_BYTES = 20 * 1024 * 1024
SCRIPT_DIR = Path(__file__).resolve().parent
VENDOR_DIR = SCRIPT_DIR / "vendor"
SWIFT_SCRIPT = SCRIPT_DIR / "pdf_text.swift"
SERVICE_DIR = SCRIPT_DIR.parent / ".local-service"
ALLOWED_ORIGINS = {"http://127.0.0.1:3000", "http://localhost:3000"}


def extract_with_pypdf(pdf_path):
    """Fallback for valid PDFs whose text is not exposed by macOS PDFKit."""
    if VENDOR_DIR.exists() and str(VENDOR_DIR) not in sys.path:
        sys.path.insert(0, str(VENDOR_DIR))
    from pypdf import PdfReader

    reader = PdfReader(pdf_path)
    return "\n".join((page.extract_text() or "") for page in reader.pages).strip()


class PdfHandler(BaseHTTPRequestHandler):
    server_version = "PersonalCfoPdf/1.0"

    def _request_origin_is_allowed(self):
        # Command-line health checks send no Origin. Browser requests must come
        # from the local dashboard, not an arbitrary web page.
        origin = self.headers.get("Origin")
        return not origin or origin in ALLOWED_ORIGINS

    def _headers(self, status=200, content_type="application/json; charset=utf-8", allow_origin=True):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        origin = self.headers.get("Origin")
        if allow_origin and origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-File-Name")
            self.send_header("Vary", "Origin")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()

    def do_OPTIONS(self):
        if not self._request_origin_is_allowed():
            self._headers(403, allow_origin=False)
            self.wfile.write(b'{"error":"Local dashboard origin required"}')
            return
        self._headers(204)

    def do_GET(self):
        if self.path != "/health":
            self._headers(404)
            self.wfile.write(b'{"error":"Not found"}')
            return
        self._headers()
        self.wfile.write(b'{"status":"ready","localOnly":true}')

    def do_POST(self):
        if not self._request_origin_is_allowed():
            self._headers(403, allow_origin=False)
            self.wfile.write(b'{"error":"Local dashboard origin required"}')
            return
        if self.path != "/extract":
            self._headers(404)
            self.wfile.write(b'{"error":"Not found"}')
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = 0
        if size <= 0 or size > MAX_BYTES:
            self._headers(413)
            self.wfile.write(json.dumps({"error": "The PDF is empty or larger than 20 MB."}).encode())
            return

        payload = self.rfile.read(size)
        SERVICE_DIR.mkdir(parents=True, exist_ok=True)
        cache_dir = SERVICE_DIR / "swift-cache"
        clang_cache = SERVICE_DIR / "clang-cache"
        cache_dir.mkdir(exist_ok=True)
        clang_cache.mkdir(exist_ok=True)
        env = os.environ.copy()
        env["SWIFT_MODULECACHE_PATH"] = str(cache_dir)
        env["CLANG_MODULE_CACHE_PATH"] = str(clang_cache)

        temporary_path = None
        try:
            with tempfile.NamedTemporaryFile(prefix="personal-cfo-card-", suffix=".pdf", delete=False) as stream:
                stream.write(payload)
                temporary_path = stream.name
            extracted = ""
            fallback_error = ""
            try:
                extracted = extract_with_pypdf(temporary_path)
            except Exception as error:
                fallback_error = str(error)
            # PDFKit remains the fallback for encrypted card statements that
            # cannot be decoded by the bundled pure-Python reader.
            if not extracted:
                result = subprocess.run(
                    ["/usr/bin/swift", str(SWIFT_SCRIPT), temporary_path],
                    capture_output=True,
                    text=True,
                    timeout=45,
                    env=env,
                    check=False,
                )
                extracted = result.stdout.strip() if result.returncode == 0 else ""
                fallback_error = result.stderr.strip() or fallback_error
            if not extracted:
                raise RuntimeError(fallback_error or "No selectable text was found in the PDF.")
            self._headers()
            self.wfile.write(json.dumps({"text": extracted, "localOnly": True}).encode("utf-8"))
        except subprocess.TimeoutExpired:
            print("[pdf-parser] extraction failed: PDF extraction timed out.", flush=True)
            self._headers(504)
            self.wfile.write(json.dumps({"error": "PDF extraction timed out."}).encode())
        except Exception as error:
            print(f"[pdf-parser] extraction failed: {error}", flush=True)
            self._headers(422)
            self.wfile.write(json.dumps({"error": str(error)}).encode())
        finally:
            if temporary_path:
                try:
                    os.unlink(temporary_path)
                except FileNotFoundError:
                    pass

    def log_message(self, fmt, *args):
        print(f"[pdf-parser] {self.address_string()} {fmt % args}", flush=True)


if __name__ == "__main__":
    print(f"Local PDF parser listening on http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), PdfHandler).serve_forever()
