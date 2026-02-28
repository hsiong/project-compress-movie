#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler


class COIHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()


def main():
    port = 9003
    server = ThreadingHTTPServer(("0.0.0.0", port), COIHandler)
    print(f"Serving with COOP/COEP on http://127.0.0.1:{port}/compress/movie_compress.html")
    server.serve_forever()


if __name__ == "__main__":
    main()
