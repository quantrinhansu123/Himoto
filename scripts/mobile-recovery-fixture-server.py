"""Loopback-only physical recovery QA with durable actor-bound checkpoints."""
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from lib.mobile_fixture_journal import FixtureJournal
from lib import mobile_bad_debt_recovery_model as model


def serve(port, path):
    journal = FixtureJournal(path, model=model)
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        def log_message(self, *_args): pass
        def respond(self, status, data):
            payload = json.dumps(data, ensure_ascii=False).encode()
            self.send_response(status); self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload))); self.send_header("Cache-Control", "no-store")
            self.end_headers(); self.wfile.write(payload)
        def handle_request(self):
            try:
                if self.path == "/health": return self.respond(200, {"fixtureOnly": True})
                if self.path == "/__fixture_state" and self.command == "GET": return self.respond(200, journal.summary())
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 <= size <= 16384: return self.respond(413, {"message": "Fixture request too large"})
                body = json.loads(self.rfile.read(size)) if size else {}
                if self.path == "/__fixture_mode" and self.command == "POST":
                    mode = body.get("mode"); assert mode in model.MODES
                    journal.control(lambda state: state.update(mode=mode))
                    return self.respond(200, {"fixtureOnly": True, "mode": mode})
                if self.path == "/__fixture_dataset" and self.command == "POST":
                    base = body.get('base')
                    journal.control(lambda state: model.seed_dataset(state, base))
                    return self.respond(200, {'fixtureOnly': True, 'base': base})
                if self.path == "/__fixture_corrections" and self.command == "POST":
                    flags = body.get("flags"); assert isinstance(flags, list) and set(flags) <= {"itemCurrent", "historyCurrent", "moneyCurrent", "contractCurrent"}
                    journal.control(lambda state: state.update(bad_debt_recovery_corrections=flags))
                    return self.respond(200, {"fixtureOnly": True, "flags": flags})
                if self.path == "/__fixture_scope" and self.command == "POST":
                    actor = body.get("actorId"); store = body.get("storeId"); all_stores = body.get("allStores")
                    assert actor in (7, 8) and store in (23, 24, None) and type(all_stores) is bool and (all_stores or store is not None)
                    journal.control(lambda state: state["scopes"].update({str(actor): {"storeId": store, "allStores": all_stores}}))
                    return self.respond(200, {"fixtureOnly": True, "actorId": actor, "storeId": store, "allStores": all_stores})
                if self.path == "/__fixture_contract_status" and self.command == "POST":
                    index = body.get("id"); status = body.get("status")
                    assert type(index) is int and index in journal.state["draft_profiles"] and status in ("renting", "bad_debt")
                    def change(state):
                        state["draft_profiles"][index]["status"] = status
                        state["bad_debt_recovery_profiles"][index]["status"] = status
                    journal.control(change)
                    return self.respond(200, {"fixtureOnly": True, "id": index, "status": status})
                if self.path == "/__fixture_deliver_late" and self.command == "POST":
                    late = journal.state.get("bad_debt_recovery_delayed"); assert late
                    status, data, _lost = journal.transact(**late)
                    return self.respond(200, {"fixtureOnly": True, "lateStatus": status, "code": data.get("code")})
                status, data, lost = journal.transact(self.path, self.command, body, dict(self.headers))
                if lost:
                    # OkHttp can replay a repeatable POST after a socket closes.
                    # A post-commit HTTP failure leaves the app outcome unknown
                    # without relying on that platform-specific transport retry.
                    return self.respond(503, {'message': 'Chưa nhận được xác nhận thu hồi QA sau khi ghi.', 'code': 'SERVICE_UNAVAILABLE'})
                return self.respond(status, data)
            except (AssertionError, ValueError, KeyError):
                return self.respond(400, {"message": "Invalid synthetic recovery request", "code": "INVALID_FIXTURE_REQUEST"})
            except (BrokenPipeError, ConnectionResetError): pass
        do_GET = handle_request
        do_POST = handle_request
        do_DELETE = handle_request
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    try:
        print(f"Recovery fixture http://127.0.0.1:{port}; durable QA checkpoint, no real accounts/DB.", flush=True)
        server.serve_forever()
    finally:
        server.server_close(); journal.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--port", type=int, default=8098)
    parser.add_argument("--state-file", type=Path, required=True); args = parser.parse_args()
    if not 1024 <= args.port <= 65535 or args.port in (8081, 8091, 8093, 8094, 8097):
        raise ValueError("Use a separate recovery fixture port")
    serve(args.port, args.state_file)
