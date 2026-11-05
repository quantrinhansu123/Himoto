"""Loopback-only, durable QA for contract entry. Never reads env or real DB."""
import argparse
import json
import base64
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from lib.mobile_fixture_journal import FixtureJournal
from lib import mobile_contract_flow_fixture as model
from lib.mobile_customer_matches_fixture import seed_duplicates
from lib.mobile_customer_documents_fixture import MODES as DOCUMENT_MODES
from lib.mobile_contract_photos_fixture import MODES as CONTRACT_PHOTO_MODES
from lib.mobile_customer_photo_copy_fixture import MODES as CUSTOMER_COPY_MODES,seed_copy_sources
from lib.mobile_media_delete_fixture import MODES as MEDIA_DELETE_MODES,seed_delete_sources,replace_photo
from lib.mobile_work_access_fixture import configure as configure_work_access,MODES as WORK_ACCESS_MODES


def serve(port, path):
    journal = FixtureJournal(path, model=model)
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        def log_message(self, *_args): pass
        def respond(self, status, data):
            binary = '_bytesBase64' in data
            payload = base64.b64decode(data['_bytesBase64']) if binary else json.dumps(data, ensure_ascii=False).encode()
            self.send_response(status)
            self.send_header("Content-Type", data['mimeType'] if binary else "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(payload)
        def handle_request(self):
            try:
                if self.path == "/health": return self.respond(200, {"fixtureOnly": True})
                if self.path == "/__fixture_state" and self.command == "GET": return self.respond(200, journal.summary())
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 <= size <= 3*1024*1024+16384: return self.respond(413, {"message": "QA payload too large"})
                raw = self.rfile.read(size) if size else b''
                body = (json.loads(raw) if self.headers.get('Content-Type', '').startswith('application/json') else {'jpeg': base64.b64encode(raw).decode()}) if raw else {}
                if self.path == "/__fixture_mode" and self.command == "POST":
                    if set(body) != {"mode"} or body["mode"] not in ("none", "lost", "selection-failure", "matches-failure", "resolve-failure", "update-lost", *DOCUMENT_MODES,*CONTRACT_PHOTO_MODES,*CUSTOMER_COPY_MODES,*MEDIA_DELETE_MODES):
                        return self.respond(400, {"message": "Invalid QA mode"})
                    journal.control(lambda state: state.update(mode=body["mode"]))
                    return self.respond(200, {"fixtureOnly": True, "mode": body["mode"]})
                if self.path == '/__fixture_work_access' and self.command=='POST':
                    if set(body)!={'mode'} or body['mode'] not in WORK_ACCESS_MODES:return self.respond(400,{'message':'Invalid QA access mode'})
                    journal.control(lambda state:configure_work_access(state,body['mode']))
                    return self.respond(200,{'fixtureOnly':True,'accessMode':body['mode']})
                if self.path == "/__fixture_duplicates" and self.command == "POST":
                    if body: return self.respond(400, {"message": "QA control takes an empty body"})
                    journal.control(seed_duplicates)
                    return self.respond(200, journal.summary())
                if self.path == '/__fixture_contract_photos' and self.command == 'POST':
                    if body:return self.respond(400,{'message':'QA control takes no payload'})
                    journal.control(lambda state:state.update(contract_photo_inventory=True))
                    return self.respond(200,journal.summary())
                if self.path == '/__fixture_contract_photo_late' and self.command == 'POST':
                    status,_,_=journal.transact(**journal.state['delayed_contract_photo'])
                    return self.respond(200,{'fixtureOnly':True,'lateStatus':status})
                if self.path == '/__fixture_customer_copy_late' and self.command == 'POST':
                    status,_,_=journal.transact(**journal.state['delayed_customer_photo_copy'])
                    return self.respond(200,{'fixtureOnly':True,'lateStatus':status})
                if self.path == '/__fixture_customer_copy_sources' and self.command == 'POST':
                    if body:return self.respond(400,{'message':'QA control takes no payload'})
                    journal.control(seed_copy_sources)
                    return self.respond(200,journal.summary())
                if self.path == '/__fixture_media_delete_sources' and self.command == 'POST':
                    if body:return self.respond(400,{'message':'QA control takes no payload'})
                    journal.control(seed_delete_sources);return self.respond(200,journal.summary())
                if self.path == '/__fixture_media_delete_replace' and self.command == 'POST':
                    if set(body)!={'slot'}:return self.respond(400,{'message':'QA expected known slot'})
                    journal.control(lambda state:replace_photo(state,body['slot']));return self.respond(200,journal.summary())
                if self.path == '/__fixture_media_delete_late' and self.command == 'POST':
                    status,_,_=journal.transact(**journal.state['delayed_media_delete']);return self.respond(200,{'fixtureOnly':True,'lateStatus':status})
                if self.path == '/__fixture_media_delete_image_failure' and self.command == 'POST':
                    if set(body)!={'failed'} or type(body['failed']) is not bool:return self.respond(400,{'message':'QA expected image failure flag'})
                    journal.control(lambda state:state.update(media_delete_image_failure=body['failed']));return self.respond(200,journal.summary())
                if self.path == "/__fixture_document_late" and self.command == "POST":
                    delayed = journal.state['delayed_document']
                    status, _, _ = journal.transact(**delayed)
                    return self.respond(200, {'fixtureOnly': True, 'lateStatus': status})
                if self.headers.get("Origin") is not None:
                    return self.respond(403, {"code": "NATIVE_CLIENT_REQUIRED", "message": "Native QA only"})
                status, data, lost = journal.transact(self.path, self.command, body, dict(self.headers))
                if lost: return self.respond(503, {"code": "SERVICE_UNAVAILABLE", "message": "QA mất phản hồi sau commit."})
                self.respond(status, data)
            except (ValueError, AssertionError, KeyError): self.respond(400, {"message": "Invalid QA request"})
            except OSError: self.respond(503, {"code": "SERVICE_UNAVAILABLE", "message": "QA checkpoint unavailable"})
        do_GET = handle_request
        do_POST = handle_request
        do_DELETE = handle_request
        do_PATCH = handle_request
        do_PUT = handle_request
    try:
        server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        print(f"Contract-flow QA listening on 127.0.0.1:{port}; durable checkpoint, no operational data.", flush=True)
        server.serve_forever()
    finally:
        journal.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8101)
    parser.add_argument("--state-file", type=Path, required=True)
    args = parser.parse_args()
    if not 8100 <= args.port <= 8199: raise ValueError("Use a separate QA port between 8100 and 8199")
    serve(args.port, args.state_file)
