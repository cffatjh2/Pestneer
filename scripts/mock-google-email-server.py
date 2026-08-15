import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    sent_messages = 0

    def log_message(self, _format, *_args):
        return

    def write_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/userinfo":
            self.write_json(200, {"email": "pestneer.test@example.com"})
            return
        if self.path == "/state":
            self.write_json(200, {"sentMessages": Handler.sent_messages})
            return
        self.write_json(404, {"message": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8")
        if self.path == "/token":
            if "grant_type=authorization_code" in body:
                self.write_json(200, {"access_token": "mock-access", "refresh_token": "mock-refresh", "token_type": "Bearer"})
                return
            if "grant_type=refresh_token" in body:
                self.write_json(200, {"access_token": "mock-refreshed-access", "token_type": "Bearer"})
                return
            self.write_json(400, {"message": "unsupported grant"})
            return
        if self.path == "/gmail/v1/users/me/messages/send":
            Handler.sent_messages += 1
            self.write_json(200, {"id": f"mock-message-{Handler.sent_messages}"})
            return
        self.write_json(404, {"message": "not found"})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5110
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
